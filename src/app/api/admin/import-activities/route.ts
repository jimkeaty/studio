// src/app/api/admin/import-activities/route.ts
// POST /api/admin/import-activities — bulk import of agent activity tracking records
// Body: { rows: ActivityImportRow[], batchId: string }
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';
import { fuzzyLookupAgent, DEFAULT_SIMILARITY_THRESHOLD } from '@/lib/agents/fuzzyMatch';
import type { ActivityImportRow, ActivityRecord } from '@/lib/types/activityTracking';

function extractBearer(req: NextRequest): string | null {
  const h = req.headers.get('Authorization') || '';
  return h.startsWith('Bearer ') ? h.slice('Bearer '.length).trim() : null;
}

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

function toNum(v: any): number {
  const n = Number(String(v ?? '').replace(/[$,%\s]/g, '').trim());
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function toOptStr(v: any): string | null {
  const s = String(v ?? '').trim();
  return s || null;
}

/** Parse ISO / US / Excel-serial date → YYYY-MM-DD string */
function toDate(v: any): string | null {
  const s = String(v ?? '').trim();
  if (!s) return null;

  // Excel serial
  const asNum = Number(s);
  if (Number.isFinite(asNum) && asNum > 30000 && asNum < 100000) {
    const d = new Date(new Date(1899, 11, 30).getTime() + asNum * 86400000);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }

  // M/D/YYYY or MM/DD/YYYY
  const us = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (us) {
    const d = new Date(Number(us[3]), Number(us[1]) - 1, Number(us[2]));
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }

  // YYYY-MM-DD
  const iso = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (iso) {
    const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }

  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/** ISO week number (1–53) */
function isoWeek(date: Date): number {
  const d = new Date(date.valueOf());
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/** Build the deduplication key for a row */
function buildDedupeKey(
  agentId: string,
  activityDate: string,
  row: ActivityImportRow,
): string {
  const srcId = String(row.sourceRowId ?? '').trim();
  if (srcId) return `src:${srcId}`;
  const calls = toNum(row.calls);
  const spokeTo = toNum(row.spokeTo);
  const hours = toNum(row.hours);
  const lcs = toNum(row.listingContractsSigned);
  const bcs = toNum(row.buyerContractsSigned);
  return `${agentId}|${activityDate}|${calls}|${spokeTo}|${hours}|${lcs}|${bcs}`;
}

export async function POST(req: NextRequest) {
  try {
    const token = extractBearer(req);
    if (!token) return jsonError(401, 'Unauthorized: Missing token');

    const decoded = await adminAuth.verifyIdToken(token);
    if (!(await isAdminLike(decoded.uid))) return jsonError(403, 'Forbidden: Admin only');

    const body = await req.json();
    const rows: ActivityImportRow[] = body.rows ?? [];
    const batchId: string = body.batchId ?? `batch_${Date.now()}`;

    if (!Array.isArray(rows) || rows.length === 0) return jsonError(400, 'No rows provided');
    if (rows.length > 2000) return jsonError(400, 'Maximum 2000 rows per import batch');

    // ── Load all agent profiles ──────────────────────────────────────────────
    const profilesSnap = await adminDb.collection('agentProfiles').get();

    const nameToAgent = new Map<string, { agentId: string; displayName: string; docRef: FirebaseFirestore.DocumentReference }>();
    const allAgentsList: { agentId: string; displayName: string; docRef: FirebaseFirestore.DocumentReference }[] = [];

    for (const doc of profilesSnap.docs) {
      const d = doc.data();
      const agentId = String(d.agentId || doc.id).trim();
      const displayName = String(d.displayName || `${d.firstName} ${d.lastName}` || '').trim();
      if (!agentId || !displayName) continue;
      const entry = { agentId, displayName, docRef: doc.ref };
      allAgentsList.push(entry);
      nameToAgent.set(displayName.toLowerCase(), entry);
      const fn = String(d.firstName || '').trim().toLowerCase();
      const ln = String(d.lastName || '').trim().toLowerCase();
      if (fn && ln) {
        nameToAgent.set(`${fn} ${ln}`, entry);
        nameToAgent.set(`${ln}, ${fn}`, entry);
        nameToAgent.set(`${ln} ${fn}`, entry);
      }
    }

    // ── Pre-compute all dedupeKeys and check for existing records ────────────
    // We need agent IDs to compute keys — do a first-pass agent resolve to get IDs
    // then batch-check Firestore for existing dedupeKeys.
    type ResolvedAgent = { agentId: string; displayName: string; docRef: FirebaseFirestore.DocumentReference };
    type PrePass = { row: ActivityImportRow; rowNum: number; agent: ResolvedAgent | null; agentNameRaw: string; dedupeKey: string | null; activityDate: string | null };

    const prePassed: PrePass[] = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;
      const agentNameRaw = String(row.agentName ?? '').trim();
      const activityDate = toDate(row.activityDate);

      let agent: ResolvedAgent | null = nameToAgent.get(agentNameRaw.toLowerCase()) || null;
      if (!agent) {
        const fuzzy = fuzzyLookupAgent(
          agentNameRaw,
          nameToAgent as Map<string, { agentId: string; displayName: string }>,
          allAgentsList,
          DEFAULT_SIMILARITY_THRESHOLD,
        );
        if (fuzzy) {
          const matched = allAgentsList.find(a => a.agentId === fuzzy.agentId);
          agent = matched || null;
        }
      }

      const dedupeKey = agent && activityDate
        ? buildDedupeKey(agent.agentId, activityDate, row)
        : null;

      prePassed.push({ row, rowNum, agent, agentNameRaw, dedupeKey, activityDate });
    }

    // Collect all dedupeKeys to check against Firestore
    const keysToCheck = prePassed
      .map(p => p.dedupeKey)
      .filter((k): k is string => k !== null);

    const existingKeys = new Set<string>();
    // Batch Firestore IN queries at 30
    for (let i = 0; i < keysToCheck.length; i += 30) {
      const chunk = keysToCheck.slice(i, i + 30);
      if (chunk.length === 0) continue;
      const snap = await adminDb.collection('activityTracking')
        .where('dedupeKey', 'in', chunk)
        .select('dedupeKey')
        .get();
      for (const doc of snap.docs) {
        existingKeys.add(doc.data().dedupeKey as string);
      }
    }

    // ── Process rows ─────────────────────────────────────────────────────────
    const now = new Date();
    const imported: string[] = [];
    const skippedDuplicates: number[] = [];
    const failed: { row: number; error: string; data: any }[] = [];
    const autoCreatedAgents: { name: string; agentId: string }[] = [];
    const fuzzyMatchedAgents: { row: number; csvName: string; matchedName: string; similarity: number }[] = [];

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

    for (const { row, rowNum, agentNameRaw, activityDate, dedupeKey } of prePassed) {
      try {
        // ── Validate required fields ────────────────────────────────────────
        if (!agentNameRaw) throw new Error('Agent Name is required');
        if (!activityDate) throw new Error(`Invalid or missing Activity Date: "${row.activityDate}"`);

        // ── Agent lookup (with auto-create fallback) ────────────────────────
        let agent = nameToAgent.get(agentNameRaw.toLowerCase()) || null;

        if (!agent) {
          const fuzzy = fuzzyLookupAgent(
            agentNameRaw,
            nameToAgent as Map<string, { agentId: string; displayName: string }>,
            allAgentsList,
            DEFAULT_SIMILARITY_THRESHOLD,
          );
          if (fuzzy) {
            const matched = allAgentsList.find(a => a.agentId === fuzzy.agentId);
            if (matched) {
              agent = matched;
              fuzzyMatchedAgents.push({
                row: rowNum,
                csvName: agentNameRaw,
                matchedName: fuzzy.displayName,
                similarity: Math.round(fuzzy.similarity * 100),
              });
            }
          }
        }

        if (!agent) {
          // Auto-create agent profile
          const parts = agentNameRaw.split(/\s+/);
          const firstName = parts[0] || agentNameRaw;
          const lastName = parts.slice(1).join(' ') || '';
          const profileRef = adminDb.collection('agentProfiles').doc();
          const newAgentId = profileRef.id;
          await profileRef.set({
            agentId: newAgentId,
            displayName: agentNameRaw,
            firstName,
            lastName,
            email: null,
            phone: null,
            role: 'agent',
            agentType: 'independent',
            primaryTeamId: null,
            teamRole: null,
            createdAt: now,
            updatedAt: now,
            source: 'bulk_import',
          });
          autoCreatedAgents.push({ name: agentNameRaw, agentId: newAgentId });
          const newEntry = { agentId: newAgentId, displayName: agentNameRaw, docRef: profileRef };
          agent = newEntry;
          allAgentsList.push(newEntry);
          nameToAgent.set(agentNameRaw.toLowerCase(), newEntry);
        }

        // ── Deduplicate ─────────────────────────────────────────────────────
        const key = dedupeKey ?? buildDedupeKey(agent.agentId, activityDate, row);
        if (existingKeys.has(key)) {
          skippedDuplicates.push(rowNum);
          continue;
        }
        existingKeys.add(key); // prevent intra-batch dupes

        // ── Parse metrics ───────────────────────────────────────────────────
        const dateObj = new Date(activityDate + 'T00:00:00');
        const year = dateObj.getFullYear();
        const month = dateObj.getMonth() + 1;
        const week = isoWeek(dateObj);

        const record: Omit<ActivityRecord, 'id'> = {
          agentId: agent.agentId,
          agentDisplayName: agent.displayName,
          activityDate,
          year,
          month,
          week,
          hours: toNum(row.hours),
          calls: toNum(row.calls),
          spokeTo: toNum(row.spokeTo),
          listingApptsSet: toNum(row.listingApptsSet),
          listingApptsHeld: toNum(row.listingApptsHeld),
          listingContractsSigned: toNum(row.listingContractsSigned),
          buyerApptsSet: toNum(row.buyerApptsSet),
          buyerApptsHeld: toNum(row.buyerApptsHeld),
          buyerContractsSigned: toNum(row.buyerContractsSigned),
          notes: toOptStr(row.notes),
          dedupeKey: key,
          sourceRowId: toOptStr(row.sourceRowId),
          importBatchId: batchId,
          rawRow: { ...row },
          source: 'import',
          importedAt: now,
          createdAt: now,
        };

        const ref = adminDb.collection('activityTracking').doc();
        batch.set(ref, record);
        imported.push(ref.id);
        batchCount++;

        if (batchCount >= BATCH_LIMIT) await flushBatch();
      } catch (err: any) {
        failed.push({ row: rowNum, error: err.message || String(err), data: row });
      }
    }

    await flushBatch();

    return NextResponse.json({
      ok: true,
      imported: imported.length,
      duplicates: skippedDuplicates.length,
      failed: failed.length,
      errors: failed,
      ids: imported,
      autoCreatedAgents: autoCreatedAgents.length > 0 ? autoCreatedAgents : undefined,
      fuzzyMatchedAgents: fuzzyMatchedAgents.length > 0 ? fuzzyMatchedAgents : undefined,
    });
  } catch (err: any) {
    console.error('[api/admin/import-activities POST]', err);
    return jsonError(500, err.message || 'Internal Server Error');
  }
}

// DELETE /api/admin/import-activities?batchId=xxx — remove an entire import batch
export async function DELETE(req: NextRequest) {
  try {
    const token = extractBearer(req);
    if (!token) return jsonError(401, 'Unauthorized: Missing token');

    const decoded = await adminAuth.verifyIdToken(token);
    if (!(await isAdminLike(decoded.uid))) return jsonError(403, 'Forbidden: Admin only');

    const { searchParams } = new URL(req.url);
    const batchId = searchParams.get('batchId');
    const agentId = searchParams.get('agentId');

    let query: FirebaseFirestore.Query = adminDb.collection('activityTracking');
    if (batchId) {
      query = query.where('importBatchId', '==', batchId);
    } else if (agentId) {
      query = query.where('agentId', '==', agentId);
    } else {
      // Delete all imported activity records
      query = query.where('source', '==', 'import');
    }

    const snap = await query.get();
    let deleted = 0;
    let batch = adminDb.batch();
    let count = 0;

    for (const doc of snap.docs) {
      batch.delete(doc.ref);
      count++;
      deleted++;
      if (count >= 499) {
        await batch.commit();
        batch = adminDb.batch();
        count = 0;
      }
    }
    if (count > 0) await batch.commit();

    return NextResponse.json({ ok: true, deleted });
  } catch (err: any) {
    console.error('[api/admin/import-activities DELETE]', err);
    return jsonError(500, err.message || 'Internal Server Error');
  }
}
