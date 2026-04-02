// src/app/api/admin/import/route.ts
// POST /api/admin/import — bulk CSV import of historical transactions
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';
import { FieldValue } from 'firebase-admin/firestore';
import { fuzzyLookupAgent, DEFAULT_SIMILARITY_THRESHOLD } from '@/lib/agents/fuzzyMatch';
import { resolveGCI } from '@/lib/commissions';

function extractBearer(req: NextRequest) {
  const h = req.headers.get('Authorization') || '';
  if (!h.startsWith('Bearer ')) return null;
  return h.slice('Bearer '.length).trim();
}

function jsonError(status: number, error: string, details?: any) {
  return NextResponse.json({ ok: false, error, details: details ?? null }, { status });
}

function toNum(v: any): number {
  const n = Number(String(v ?? '').replace(/[$,%]/g, '').trim());
  return Number.isFinite(n) ? n : 0;
}

function toOptStr(v: any): string | null {
  const s = String(v ?? '').trim();
  return s || null;
}

function toDate(v: any): string | null {
  const s = String(v ?? '').trim();
  if (!s) return null;

  // 1. Excel serial date number (e.g. 46066 = 2026-03-15)
  const asNum = Number(s);
  if (Number.isFinite(asNum) && asNum > 30000 && asNum < 100000) {
    // Excel epoch is Jan 0 1900 (with the Lotus 1-2-3 leap year bug)
    const excelEpoch = new Date(1899, 11, 30); // Dec 30, 1899
    const d = new Date(excelEpoch.getTime() + asNum * 86400000);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }

  // 2. M/D/YYYY or MM/DD/YYYY (US format — most common from Excel)
  const usDate = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (usDate) {
    const [, mm, dd, yyyy] = usDate;
    const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }

  // 3. YYYY-MM-DD or YYYY/MM/DD (ISO format)
  const isoDate = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (isoDate) {
    const [, yyyy, mm, dd] = isoDate;
    const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }

  // 4. Fallback: let JavaScript try to parse it (handles "Mar 15, 2026", etc.)
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10);
  }

  return null;
}

function toYearFromDates(...dates: (string | null)[]): number {
  for (const d of dates) {
    if (d) {
      const parsed = new Date(d);
      if (!isNaN(parsed.getTime())) return parsed.getFullYear();
    }
  }
  return new Date().getFullYear();
}

function normalizeClosingType(v: string): string | null {
  // "Deal Type" in user's spreadsheet = closingType in the app
  // Values: Buyer, Listing, Lease, Referral
  const s = v.toLowerCase().trim();
  if (s === 'buyer' || s === 'buy') return 'buyer';
  if (s === 'listing' || s === 'seller' || s === 'list') return 'listing';
  if (s === 'referral' || s === 'ref') return 'referral';
  if (s === 'lease' || s === 'rental') return 'lease';
  return null;
}

function normalizeStatus(v: string): string | null {
  const s = v.toLowerCase().trim();
  if (s === 'closed' || s === 'close' || s === 'sold') return 'closed';
  if (s === 'pending') return 'pending';
  if (s === 'active') return 'pending';
  if (s === 'under contract' || s === 'under_contract' || s === 'contract') return 'under_contract';
  if (s === 'canceled' || s === 'cancelled' || s === 'cancel') return 'cancelled';
  if (s === 'expired' || s === 'expire') return 'expired';
  if (s === 'withdrawn' || s === 'withdrawn/canceled') return 'cancelled';
  return null;
}

function normalizeDealType(v: string): string | null {
  // "Type of Closing" in user's spreadsheet = dealType in the app
  // Values: Residential, Land, Commercial
  const s = v.toLowerCase().trim();
  if (s === 'residential' || s === 'res') return 'residential_sale';
  if (s.includes('residential') && s.includes('lease')) return 'rental';
  if (s.includes('residential') || s.includes('res sale') || s === 'residential sale') return 'residential_sale';
  if (s.includes('commercial') && s.includes('lease')) return 'commercial_lease';
  if (s.includes('commercial') && s.includes('sale')) return 'commercial_sale';
  if (s.includes('commercial') || s === 'comm') return 'commercial_sale';
  if (s === 'land') return 'land';
  if (s.includes('rental') || s.includes('rent') || s.includes('lease')) return 'rental';
  return null;
}

import { normalizeDealSource } from '@/lib/normalizeDealSource';

export interface ImportRow {
  agentName: string;
  team: string;
  closingType: string;
  status: string;
  dealType: string;
  address: string;
  clientName: string;
  dealSource: string;
  listingDate: string;
  underContractDate: string;
  projCloseDate: string;
  expDate: string;
  closedDate: string;
  listPrice: string;
  salePrice: string;
  commissionPct: string;
  commissionBasePrice?: string;
  gci: string;
  transactionFee: string;
  brokerPct: string;
  brokerGci: string;
  referral: string;
  agentPct: string;
  agentDollar: string;
  teamMember1: string;
  teamMember1Pct: string;
  teamMember1Gci: string;
  teamMember2: string;
  teamMember2Pct: string;
  teamMember2Gci: string;
  teamMember3: string;
  teamMember3Pct: string;
  teamMember3Gci: string;
  coAgent1: string;
  coAgent1Pct: string;
  coAgent1Gci: string;
  coAgent2: string;
  coAgent2Pct: string;
  coAgent2Gci: string;
  coAgent3: string;
  coAgent3Pct: string;
  coAgent3Gci: string;
  expenseCredits: string;
  mortgageCompany: string;
  titleCompany: string;
}

export async function POST(req: NextRequest) {
  try {
    const token = extractBearer(req);
    if (!token) return jsonError(401, 'Unauthorized: Missing token');

    const decoded = await adminAuth.verifyIdToken(token);
    if (!(await isAdminLike(decoded.uid))) {
      return jsonError(403, 'Forbidden: Admin only');
    }

    const body = await req.json();
    const rows: ImportRow[] = body.rows ?? [];

    if (!Array.isArray(rows) || rows.length === 0) {
      return jsonError(400, 'No rows provided');
    }

    if (rows.length > 2000) {
      return jsonError(400, 'Maximum 2000 rows per import batch');
    }

    // ── Load all agent profiles for name → id lookup ──────────────────────────
    const [profilesSnap, teamsSnap] = await Promise.all([
      adminDb.collection('agentProfiles').get(),
      adminDb.collection('teams').get(),
    ]);

    const nameToAgent = new Map<string, { agentId: string; displayName: string; docRef: FirebaseFirestore.DocumentReference }>();
    const allAgentsList: { agentId: string; displayName: string; docRef: FirebaseFirestore.DocumentReference }[] = [];

    for (const doc of profilesSnap.docs) {
      const d = doc.data();
      const agentId = String(d.agentId || doc.id).trim();
      const displayName = String(d.displayName || d.firstName + ' ' + d.lastName || '').trim();
      if (agentId && displayName) {
        const entry = { agentId, displayName, docRef: doc.ref };
        allAgentsList.push(entry);
        nameToAgent.set(displayName.toLowerCase(), entry);
        const firstName = String(d.firstName || '').trim().toLowerCase();
        const lastName = String(d.lastName || '').trim().toLowerCase();
        if (firstName && lastName) {
          nameToAgent.set(`${firstName} ${lastName}`, entry);
          nameToAgent.set(`${lastName}, ${firstName}`, entry);
          nameToAgent.set(`${lastName} ${firstName}`, entry);
        }
      }
    }

    // ── Load teams for name → teamId lookup ─────────────────────────────────
    const teamNameToId = new Map<string, string>();
    for (const doc of teamsSnap.docs) {
      const d = doc.data();
      const teamId = String(d.teamId || doc.id).trim();
      const teamName = String(d.teamName || '').trim();
      if (teamId && teamName) {
        teamNameToId.set(teamName.toLowerCase(), teamId);
        // Also index common abbreviations
        const abbr = teamName.toLowerCase()
          .replace(/\s+team$/i, '')  // "Charles Ditch Team" → "charles ditch"
          .trim();
        if (abbr !== teamName.toLowerCase()) {
          teamNameToId.set(abbr, teamId);
        }
      }
    }
    // Hardcode common abbreviations
    if (!teamNameToId.has('cgl')) teamNameToId.set('cgl', teamNameToId.get('cgl team') || teamNameToId.get('cgl') || '');
    if (!teamNameToId.has('sgl')) teamNameToId.set('sgl', teamNameToId.get('sgl team') || teamNameToId.get('sgl') || '');
    // Remove empty entries
    for (const [k, v] of teamNameToId) { if (!v) teamNameToId.delete(k); }

    const now = new Date();
    // Unique batch ID — stamps every transaction in this upload so they can be deleted as a group
    const importBatchId = `import_${now.getTime()}_${Math.random().toString(36).slice(2, 8)}`;
    const imported: string[] = [];
    const failed: { row: number; error: string; data: any }[] = [];
    const autoCreatedAgents: { name: string; agentId: string }[] = [];
    const fuzzyMatchedAgents: { row: number; csvName: string; matchedName: string; similarity: number }[] = [];

    // ── Process rows in Firestore batches (max 500 ops each) ─────────────────
    let batch = adminDb.batch();
    let batchCount = 0;
    const BATCH_LIMIT = 499;

    const flushBatch = async () => {
      if (batchCount > 0) {
        await batch.commit();
        batch = adminDb.batch();
        batchCount = 0;
      }
    };

    for (let i = 0; i < rows.length; i++) {
      const rowNum = i + 2; // 1-based, +1 for header
      const row = rows[i];

      try {
        // ── Agent lookup ────────────────────────────────────────────────────
        const agentNameRaw = String(row.agentName ?? '').trim();
        if (!agentNameRaw) throw new Error('Agent Name is required');

        // Try exact match first, then fuzzy match
        const exactMatch = nameToAgent.get(agentNameRaw.toLowerCase());
        let agent = exactMatch || null;

        // If no exact match, try fuzzy matching
        if (!agent) {
          const fuzzyResult = fuzzyLookupAgent(
            agentNameRaw,
            nameToAgent as Map<string, { agentId: string; displayName: string }>,
            allAgentsList,
            DEFAULT_SIMILARITY_THRESHOLD,
          );
          if (fuzzyResult) {
            // Found a fuzzy match — use existing agent instead of creating a duplicate
            const matchedEntry = allAgentsList.find(a => a.agentId === fuzzyResult.agentId);
            if (matchedEntry) {
              agent = matchedEntry;
              fuzzyMatchedAgents.push({
                row: rowNum,
                csvName: agentNameRaw,
                matchedName: fuzzyResult.displayName,
                similarity: Math.round(fuzzyResult.similarity * 100),
              });
            }
          }
        }

        // ── Team resolution ──────────────────────────────────────────────────
        const teamRaw = String(row.team ?? '').trim();
        const resolvedTeamId = teamRaw
          ? teamNameToId.get(teamRaw.toLowerCase()) || null
          : null;

        // Auto-create agent profile if not found (no exact or fuzzy match)
        if (!agent) {
          const parts = agentNameRaw.split(/\s+/);
          const firstName = parts[0] || agentNameRaw;
          const lastName = parts.slice(1).join(' ') || '';
          const profileRef = adminDb.collection('agentProfiles').doc();
          const newAgentId = profileRef.id;
          const newDisplayName = agentNameRaw;

          const newProfile: Record<string, any> = {
            agentId: newAgentId,
            displayName: newDisplayName,
            firstName,
            lastName,
            email: null,
            phone: null,
            role: 'agent',
            agentType: resolvedTeamId ? 'team' : 'independent',
            primaryTeamId: resolvedTeamId,
            teamRole: resolvedTeamId ? 'member' : null,
            createdAt: now,
            updatedAt: now,
            source: 'bulk_import',
          };

          await profileRef.set(newProfile);
          autoCreatedAgents.push({ name: newDisplayName, agentId: newAgentId });

          agent = { agentId: newAgentId, displayName: newDisplayName, docRef: profileRef };

          nameToAgent.set(newDisplayName.toLowerCase(), agent);
          const fn = firstName.toLowerCase();
          const ln = lastName.toLowerCase();
          if (fn && ln) {
            nameToAgent.set(`${fn} ${ln}`, agent);
            nameToAgent.set(`${ln}, ${fn}`, agent);
            nameToAgent.set(`${ln} ${fn}`, agent);
          }
        } else if (resolvedTeamId && agent.docRef) {
          // Agent exists but team provided — update their profile if not already set
          await agent.docRef.update({
            primaryTeamId: resolvedTeamId,
            agentType: 'team',
            teamRole: 'member',
            updatedAt: now,
          });
        }

        // ── Field parsing ───────────────────────────────────────────────────
        const address = String(row.address ?? '').trim();
        if (!address) throw new Error('Address is required');

        const rawStatus = String(row.status ?? '').trim();
        const status = normalizeStatus(rawStatus);
        if (!status) throw new Error(`Invalid status: "${rawStatus}". Use: closed, pending, under contract, canceled, expired`);

        const rawDealType = String(row.dealType ?? '').trim();
        const transactionType = normalizeDealType(rawDealType) || 'residential_sale';

        const closingType = normalizeClosingType(String(row.closingType ?? '').trim()) || null;

        const closedDate = toDate(row.closedDate);
        const contractDate = toDate(row.underContractDate);
        const listingDate = toDate(row.listingDate);
        const projCloseDate = toDate(row.projCloseDate);
        const expDate = toDate(row.expDate);

        const listPrice = toNum(row.listPrice);
        const salePrice = toNum(row.salePrice);
        const commissionPct = toNum(row.commissionPct);
        const commissionBasePrice = toNum(row.commissionBasePrice) || null;
        const gci = resolveGCI({ commissionBasePrice, salePrice, commissionPercent: commissionPct, gci: toNum(row.gci) });
        const transactionFee = toNum(row.transactionFee);
        const brokerPct = toNum(row.brokerPct);
        const brokerGci = toNum(row.brokerGci);
        const agentPct = toNum(row.agentPct);
        const agentDollar = toNum(row.agentDollar);

        const mortgageCompany = toOptStr(row.mortgageCompany);
        const titleCompany = toOptStr(row.titleCompany);
        const dealSource = normalizeDealSource(String(row.dealSource ?? '').trim());
        const clientName = toOptStr(row.clientName);
        const referral = toOptStr(row.referral);

        // Team member splits
        const teamMember1 = toOptStr(row.teamMember1);
        const teamMember1Pct = toNum(row.teamMember1Pct);
        const teamMember1Gci = toNum(row.teamMember1Gci);
        const teamMember2 = toOptStr(row.teamMember2);
        const teamMember2Pct = toNum(row.teamMember2Pct);
        const teamMember2Gci = toNum(row.teamMember2Gci);
        const teamMember3 = toOptStr(row.teamMember3);
        const teamMember3Pct = toNum(row.teamMember3Pct);
        const teamMember3Gci = toNum(row.teamMember3Gci);
        const coAgent1 = toOptStr(row.coAgent1);
        const coAgent1Pct = toNum(row.coAgent1Pct);
        const coAgent1Gci = toNum(row.coAgent1Gci);
        const coAgent2 = toOptStr(row.coAgent2);
        const coAgent2Pct = toNum(row.coAgent2Pct);
        const coAgent2Gci = toNum(row.coAgent2Gci);
        const coAgent3 = toOptStr(row.coAgent3);
        const coAgent3Pct = toNum(row.coAgent3Pct);
        const coAgent3Gci = toNum(row.coAgent3Gci);
        const expenseCredits = toNum(row.expenseCredits);

        const year = toYearFromDates(closedDate, contractDate, listingDate);

        // ── Build splitSnapshot from CSV commission chain ────────────────────
        // When agentDollar is provided, it's the authoritative agent net.
        // companyRetained = brokerGci if provided, else gci - agentDollar.
        const grossCommission = gci;
        const agentNetCommission = agentDollar > 0 ? agentDollar : null;
        const companyRetained =
          brokerGci > 0
            ? brokerGci
            : agentNetCommission !== null && grossCommission > 0
            ? Math.max(0, grossCommission - agentNetCommission)
            : 0;

        const splitSnapshot = {
          primaryTeamId: resolvedTeamId,
          teamPlanId: null,
          memberPlanId: null,
          grossCommission,
          agentSplitPercent: agentPct > 0 ? agentPct : null,
          companySplitPercent: brokerPct > 0 ? brokerPct : null,
          agentNetCommission,
          leaderStructurePercent: null,
          leaderStructureGross: null,
          memberPercentOfLeaderSide: null,
          memberPaid: null,
          leaderRetainedAfterMember: null,
          companyRetained,
        };

        const creditSnapshot = {
          leaderboardAgentId: agent.agentId,
          leaderboardAgentDisplayName: agent.displayName,
          progressionMemberAgentId: null,
          progressionLeaderAgentId: null,
          progressionTeamId: resolvedTeamId,
          progressionCompanyDollarCredit: companyRetained,
        };

        // ── Build final transaction document ────────────────────────────────
        const txDoc: Record<string, any> = {
          agentId: agent.agentId,
          agentDisplayName: agent.displayName,

          status,
          transactionType,
          closingType,

          address,
          clientName,
          dealSource,

          // Dates
          listingDate,
          contractDate,
          closedDate,
          projectedCloseDate: projCloseDate,
          expiredDate: expDate,

          // Financials
          listPrice: listPrice > 0 ? listPrice : null,
          dealValue: salePrice > 0 ? salePrice : listPrice > 0 ? listPrice : null,
          commissionPercent: commissionPct > 0 ? commissionPct : null,
          commissionBasePrice: commissionBasePrice ?? (salePrice > 0 ? salePrice : null),
          transactionFee: transactionFee > 0 ? transactionFee : null,
          brokerProfit: companyRetained,

          // Referral
          ...(referral ? { referral } : {}),

          // Team member splits
          ...(teamMember1 ? {
            teamMember1,
            teamMember1Pct: teamMember1Pct > 0 ? teamMember1Pct : null,
            teamMember1Gci: teamMember1Gci > 0 ? teamMember1Gci : null,
          } : {}),
          ...(teamMember2 ? {
            teamMember2,
            teamMember2Pct: teamMember2Pct > 0 ? teamMember2Pct : null,
            teamMember2Gci: teamMember2Gci > 0 ? teamMember2Gci : null,
          } : {}),
          ...(teamMember3 ? {
            teamMember3,
            teamMember3Pct: teamMember3Pct > 0 ? teamMember3Pct : null,
            teamMember3Gci: teamMember3Gci > 0 ? teamMember3Gci : null,
          } : {}),
          ...(coAgent1 ? {
            coAgent1,
            coAgent1Pct: coAgent1Pct > 0 ? coAgent1Pct : null,
            coAgent1Gci: coAgent1Gci > 0 ? coAgent1Gci : null,
          } : {}),
          ...(coAgent2 ? {
            coAgent2,
            coAgent2Pct: coAgent2Pct > 0 ? coAgent2Pct : null,
            coAgent2Gci: coAgent2Gci > 0 ? coAgent2Gci : null,
          } : {}),
          ...(coAgent3 ? {
            coAgent3,
            coAgent3Pct: coAgent3Pct > 0 ? coAgent3Pct : null,
            coAgent3Gci: coAgent3Gci > 0 ? coAgent3Gci : null,
          } : {}),
          ...(expenseCredits > 0 ? { expenseCredits } : {}),

          // Closing parties
          mortgageCompany,
          titleCompany,

          // Snapshots
          splitSnapshot,
          creditSnapshot,

          year,
          source: 'import',
          importedAt: now,
          importBatchId,
          createdAt: now,
          updatedAt: now,
        };

        const ref = adminDb.collection('transactions').doc();
        batch.set(ref, txDoc);
        imported.push(ref.id);
        batchCount++;

        if (batchCount >= BATCH_LIMIT) {
          await flushBatch();
        }
      } catch (err: any) {
        failed.push({ row: rowNum, error: err.message || String(err), data: row });
      }
    }

    // Flush remaining
    await flushBatch();

    return NextResponse.json({
      ok: true,
      imported: imported.length,
      failed: failed.length,
      errors: failed,
      ids: imported,
      importBatchId,
      autoCreatedAgents: autoCreatedAgents.length > 0 ? autoCreatedAgents : undefined,
      fuzzyMatchedAgents: fuzzyMatchedAgents.length > 0 ? fuzzyMatchedAgents : undefined,
    });
  } catch (err: any) {
    console.error('[api/admin/import POST]', err);
    return jsonError(500, err.message || 'Internal Server Error');
  }
}
