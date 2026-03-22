// src/app/api/admin/import/route.ts
// POST /api/admin/import — bulk CSV import of historical transactions
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';

const ADMIN_EMAIL = 'jim@keatyrealestate.com';

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
  const s = v.toLowerCase().trim();
  if (s.includes('residential') && s.includes('lease')) return 'rental';
  if (s.includes('residential') || s.includes('res sale') || s === 'residential sale') return 'residential_sale';
  if (s.includes('commercial') && s.includes('lease')) return 'commercial_lease';
  if (s.includes('commercial') && s.includes('sale')) return 'commercial_sale';
  if (s.includes('commercial')) return 'commercial_sale';
  if (s === 'land') return 'land';
  if (s.includes('rental') || s.includes('rent') || s.includes('lease')) return 'rental';
  return null;
}

function normalizeDealSource(v: string): string | null {
  const s = v.toLowerCase().trim();
  if (s === 'boomtown') return 'boomtown';
  if (s === 'referral' || s === 'ref') return 'referral';
  if (s === 'sphere') return 'sphere';
  if (s.includes('sign call') || s === 'sign') return 'sign_call';
  if (s.includes('company gen') || s === 'company' || s === 'company_gen') return 'company_gen';
  if (s === 'social') return 'social';
  if (s.includes('open house') || s === 'oh') return 'open_house';
  if (s === 'fsbo') return 'fsbo';
  if (s === 'expired') return 'expired_listing';
  return toOptStr(v);
}

export interface ImportRow {
  agentName: string;
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
  gci: string;
  transactionFee: string;
  brokerPct: string;
  brokerGci: string;
  agentPct: string;
  agentDollar: string;
  mortgageCompany: string;
  titleCompany: string;
}

export async function POST(req: NextRequest) {
  try {
    const token = extractBearer(req);
    if (!token) return jsonError(401, 'Unauthorized: Missing token');

    const decoded = await adminAuth.verifyIdToken(token);
    if (decoded.email !== ADMIN_EMAIL) {
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
    const profilesSnap = await adminDb.collection('agentProfiles').get();
    const nameToAgent = new Map<string, { agentId: string; displayName: string }>();

    for (const doc of profilesSnap.docs) {
      const d = doc.data();
      const agentId = String(d.agentId || doc.id).trim();
      const displayName = String(d.displayName || d.firstName + ' ' + d.lastName || '').trim();
      if (agentId && displayName) {
        nameToAgent.set(displayName.toLowerCase(), { agentId, displayName });
        // Also index first+last separately for fuzzy matching
        const firstName = String(d.firstName || '').trim().toLowerCase();
        const lastName = String(d.lastName || '').trim().toLowerCase();
        if (firstName && lastName) {
          nameToAgent.set(`${firstName} ${lastName}`, { agentId, displayName });
          nameToAgent.set(`${lastName}, ${firstName}`, { agentId, displayName });
          nameToAgent.set(`${lastName} ${firstName}`, { agentId, displayName });
        }
      }
    }

    const now = new Date();
    const imported: string[] = [];
    const failed: { row: number; error: string; data: any }[] = [];
    const autoCreatedAgents: { name: string; agentId: string }[] = [];

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

        let agent = nameToAgent.get(agentNameRaw.toLowerCase());

        // Auto-create agent profile if not found
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
            teamId: null,
            createdAt: now,
            updatedAt: now,
            source: 'bulk_import',
          };

          // Write the profile immediately (outside the batch so it's
          // available for subsequent rows with the same name)
          await profileRef.set(newProfile);
          autoCreatedAgents.push({ name: newDisplayName, agentId: newAgentId });

          agent = { agentId: newAgentId, displayName: newDisplayName };

          // Add to lookup map so subsequent rows with the same name reuse this profile
          nameToAgent.set(newDisplayName.toLowerCase(), agent);
          const fn = firstName.toLowerCase();
          const ln = lastName.toLowerCase();
          if (fn && ln) {
            nameToAgent.set(`${fn} ${ln}`, agent);
            nameToAgent.set(`${ln}, ${fn}`, agent);
            nameToAgent.set(`${ln} ${fn}`, agent);
          }
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
        const gci = toNum(row.gci);
        const transactionFee = toNum(row.transactionFee);
        const brokerPct = toNum(row.brokerPct);
        const brokerGci = toNum(row.brokerGci);
        const agentPct = toNum(row.agentPct);
        const agentDollar = toNum(row.agentDollar);

        const mortgageCompany = toOptStr(row.mortgageCompany);
        const titleCompany = toOptStr(row.titleCompany);
        const dealSource = normalizeDealSource(String(row.dealSource ?? '').trim());
        const clientName = toOptStr(row.clientName);

        const year = toYearFromDates(closedDate, contractDate, listingDate);

        // ── Build splitSnapshot from CSV commission chain ────────────────────
        // When agentDollar is provided, it's the authoritative agent net.
        // companyRetained = brokerGci if provided, else gci - agentDollar.
        const grossCommission = gci > 0 ? gci : 0;
        const agentNetCommission = agentDollar > 0 ? agentDollar : null;
        const companyRetained =
          brokerGci > 0
            ? brokerGci
            : agentNetCommission !== null && grossCommission > 0
            ? Math.max(0, grossCommission - agentNetCommission)
            : 0;

        const splitSnapshot = {
          primaryTeamId: null,
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
          progressionTeamId: null,
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
          transactionFee: transactionFee > 0 ? transactionFee : null,
          brokerProfit: companyRetained,

          // Closing parties
          mortgageCompany,
          titleCompany,

          // Snapshots
          splitSnapshot,
          creditSnapshot,

          year,
          source: 'import',
          importedAt: now,
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
      autoCreatedAgents: autoCreatedAgents.length > 0 ? autoCreatedAgents : undefined,
    });
  } catch (err: any) {
    console.error('[api/admin/import POST]', err);
    return jsonError(500, err.message || 'Internal Server Error');
  }
}
