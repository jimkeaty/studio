/**
 * POST /api/daily-activity/bulk
 *
 * Bulk-imports historical daily tracking sheet rows into the `daily_activity`
 * Firestore collection — the same collection read by the calendar heat-map
 * and the KPI dashboard.
 *
 * Each row is written as `{agentId}_{date}` (the standard doc ID used by the
 * regular daily-activity POST route).  Existing docs are merged by default so
 * that non-zero imported values win over zero, but existing non-zero values
 * are never overwritten unless `overwrite: true` is passed in the body.
 *
 * Body:
 * {
 *   rows: DailyActivityRow[],
 *   overwrite?: boolean,   // default false — merge, keep higher value
 *   viewAs?: string        // admin impersonation
 * }
 *
 * DailyActivityRow (all fields optional except date):
 * {
 *   date: string,          // YYYY-MM-DD or MM/DD/YYYY
 *   calls?: number,
 *   engagements?: number,
 *   appointmentsSet?: number,
 *   appointmentsHeld?: number,
 *   contracts?: number,
 *   startTime?: string,    // HH:mm
 *   endTime?: string,      // HH:mm
 *   notes?: string
 * }
 *
 * Returns:
 * { ok: true, imported: number, skipped: number, errors: {row,error}[] }
 */
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';
import { FieldValue } from 'firebase-admin/firestore';

const MAX_ROWS = 500;

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

function extractBearer(req: NextRequest): string | null {
  const h = req.headers.get('Authorization') || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : null;
}

function toNum(v: unknown): number {
  if (v === '' || v === null || v === undefined) return 0;
  const n = Number(String(v).replace(/[^0-9.-]/g, '').trim());
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
}

function toStr(v: unknown): string {
  return String(v ?? '').trim();
}

/** Parse a date string into YYYY-MM-DD */
function parseDate(v: unknown): string | null {
  if (!v) return null;
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // MM/DD/YYYY
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) {
    const [, m, d, y] = mdy;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  // M/D/YY
  const mdyShort = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (mdyShort) {
    const [, m, d, y] = mdyShort;
    const fullYear = parseInt(y) >= 50 ? `19${y}` : `20${y}`;
    return `${fullYear}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return null;
}

/** Normalize flexible column names from CSV rows */
function normalizeRow(raw: Record<string, string>): Record<string, string> {
  const aliases: Record<string, string> = {
    // date
    'date': 'date', 'activity_date': 'date', 'activitydate': 'date', 'day': 'date',
    // calls
    'calls': 'calls', 'callscount': 'calls', 'calls_count': 'calls', 'phone_calls': 'calls', 'dials': 'calls',
    // engagements
    'engagements': 'engagements', 'engagementscount': 'engagements', 'engagements_count': 'engagements',
    'spoketo': 'engagements', 'spoke_to': 'engagements', 'contacts': 'engagements', 'conversations': 'engagements',
    // appointmentsSet
    'appointmentsset': 'appointmentsSet', 'appointments_set': 'appointmentsSet', 'appts_set': 'appointmentsSet',
    'apptset': 'appointmentsSet', 'appt_set': 'appointmentsSet', 'appointmentssetcount': 'appointmentsSet',
    'set': 'appointmentsSet',
    // appointmentsHeld
    'appointmentsheld': 'appointmentsHeld', 'appointments_held': 'appointmentsHeld', 'appts_held': 'appointmentsHeld',
    'apptheld': 'appointmentsHeld', 'appt_held': 'appointmentsHeld', 'appointmentsheldcount': 'appointmentsHeld',
    'held': 'appointmentsHeld',
    // contracts
    'contracts': 'contracts', 'contractswritten': 'contracts', 'contracts_written': 'contracts',
    'contractswrittencount': 'contracts', 'contracts_count': 'contracts', 'signed': 'contracts',
    // time
    'starttime': 'startTime', 'start_time': 'startTime', 'start': 'startTime',
    'endtime': 'endTime', 'end_time': 'endTime', 'end': 'endTime',
    // notes
    'notes': 'notes', 'note': 'notes', 'comments': 'notes',
  };
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    const normalized = k.toLowerCase().replace(/[\s_-]/g, '');
    const canonical = aliases[normalized] ?? k;
    out[canonical] = v;
  }
  return out;
}

export async function POST(req: NextRequest) {
  try {
    const token = extractBearer(req);
    if (!token) return jsonError(401, 'Unauthorized: Missing token');

    const decoded = await adminAuth.verifyIdToken(token);
    const callerUid = decoded.uid;

    let body: any;
    try {
      body = await req.json();
    } catch {
      return jsonError(400, 'Invalid JSON body');
    }

    const viewAs = body?.viewAs;
    const uid = (await isAdminLike(callerUid) && viewAs) ? viewAs : callerUid;
    const overwrite: boolean = body?.overwrite === true;

    const rawRows: any[] = Array.isArray(body?.rows) ? body.rows : [];
    if (rawRows.length === 0) return jsonError(400, 'No rows provided');
    if (rawRows.length > MAX_ROWS) return jsonError(400, `Maximum ${MAX_ROWS} rows per bulk import`);

    const errors: { row: number; error: string }[] = [];
    const validRows: { docId: string; date: string; data: Record<string, unknown> }[] = [];

    for (let i = 0; i < rawRows.length; i++) {
      const rowNum = i + 1;
      try {
        const normalized = normalizeRow(rawRows[i]);
        const date = parseDate(normalized.date);
        if (!date) { errors.push({ row: rowNum, error: 'Invalid or missing date' }); continue; }

        const docId = `${uid}_${date}`;
        validRows.push({
          docId,
          date,
          data: {
            agentId: uid,
            date,
            callsCount: toNum(normalized.calls),
            engagementsCount: toNum(normalized.engagements),
            appointmentsSetCount: toNum(normalized.appointmentsSet),
            appointmentsHeldCount: toNum(normalized.appointmentsHeld),
            contractsWrittenCount: toNum(normalized.contracts),
            startTime: toStr(normalized.startTime),
            endTime: toStr(normalized.endTime),
            notes: toStr(normalized.notes),
            updatedAt: FieldValue.serverTimestamp(),
            updatedByUid: callerUid,
            source: 'bulk_import',
          },
        });
      } catch (err: any) {
        errors.push({ row: rowNum, error: err.message || 'Parse error' });
      }
    }

    if (validRows.length === 0) {
      return NextResponse.json({ ok: false, imported: 0, skipped: 0, errors }, { status: 422 });
    }

    // Fetch existing docs to decide merge strategy
    const existingMap = new Map<string, Record<string, unknown>>();
    if (!overwrite) {
      const CHUNK = 30; // Firestore 'in' limit
      for (let start = 0; start < validRows.length; start += CHUNK) {
        const chunk = validRows.slice(start, start + CHUNK);
        const ids = chunk.map(r => r.docId);
        const snaps = await Promise.all(ids.map(id => adminDb.collection('daily_activity').doc(id).get()));
        for (const snap of snaps) {
          if (snap.exists) existingMap.set(snap.id, snap.data() as Record<string, unknown>);
        }
      }
    }

    // Write in Firestore batches
    const BATCH_SIZE = 400;
    let imported = 0;
    let skipped = 0;

    for (let start = 0; start < validRows.length; start += BATCH_SIZE) {
      const chunk = validRows.slice(start, start + BATCH_SIZE);
      const batch = adminDb.batch();

      for (const row of chunk) {
        const ref = adminDb.collection('daily_activity').doc(row.docId);
        const existing = existingMap.get(row.docId);

        if (overwrite || !existing) {
          // Full write
          batch.set(ref, row.data, { merge: true });
          imported++;
        } else {
          // Merge: only write if imported value > existing value (keep the higher)
          const merged: Record<string, unknown> = { ...row.data };
          const numericFields = ['callsCount', 'engagementsCount', 'appointmentsSetCount', 'appointmentsHeldCount', 'contractsWrittenCount'] as const;
          let hasNewData = false;
          for (const field of numericFields) {
            const existingVal = Number(existing[field] ?? 0);
            const importedVal = Number(row.data[field] ?? 0);
            if (importedVal > existingVal) {
              hasNewData = true;
            } else {
              merged[field] = existingVal; // keep existing higher value
            }
          }
          // Also merge notes if existing is empty
          if (!existing.notes && row.data.notes) hasNewData = true;

          if (hasNewData) {
            batch.set(ref, merged, { merge: true });
            imported++;
          } else {
            skipped++;
          }
        }
      }

      await batch.commit();
    }

    return NextResponse.json({ ok: true, imported, skipped, errors });
  } catch (err: any) {
    console.error('[API/daily-activity/bulk] POST failed:', err);
    return jsonError(err.status ?? 500, err.message ?? 'Bulk import failed');
  }
}
