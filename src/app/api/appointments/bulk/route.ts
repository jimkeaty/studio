/**
 * POST /api/appointments/bulk
 *
 * Bulk-imports appointment records from the canonical template format
 * (matching the provided template.xlsx) or any CSV/JSON with flexible
 * column naming.
 *
 * Template columns (from template.xlsx):
 *   Row ID | Appointment Type | Client Name | Date Set | Appointment Date |
 *   Appointment Time | Status | Client Timing | Price Range | Notes | Year
 *
 * Body: { appointments: TemplateRow[], viewAs?: string }
 *
 * Returns: { ok: true, created: number, errors: { row: number, error: string }[] }
 */
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';
import { FieldValue } from 'firebase-admin/firestore';

const MAX_BATCH = 500;

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

function extractBearer(req: NextRequest) {
  const h = req.headers.get('Authorization') || '';
  if (!h.startsWith('Bearer ')) return null;
  return h.slice('Bearer '.length).trim();
}

function toStr(v: unknown): string | null {
  const s = String(v ?? '').trim();
  return s || null;
}

function toNum(v: unknown): number | null {
  if (v === '' || v === null || v === undefined) return null;
  const s = String(v).replace(/[$,\s]/g, '').trim();
  const n = Number(s);
  return isFinite(n) ? n : null;
}

/** Parse a date value (string or Date object) into YYYY-MM-DD */
function parseDate(v: unknown): string | null {
  if (!v) return null;
  // Already a JS Date (from xlsx parsing)
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null;
    return v.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) return `${mdy[3]}-${mdy[1].padStart(2, '0')}-${mdy[2].padStart(2, '0')}`;
  const mdyShort = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (mdyShort) {
    const y = parseInt(mdyShort[3]) >= 50 ? `19${mdyShort[3]}` : `20${mdyShort[3]}`;
    return `${y}-${mdyShort[1].padStart(2, '0')}-${mdyShort[2].padStart(2, '0')}`;
  }
  const parsed = new Date(s);
  return isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

/** Normalize "2:30 PM" or "14:30" → "14:30" */
function parseTime(v: unknown): string | null {
  if (!v) return null;
  const s = String(v).trim();
  // Already HH:mm
  if (/^\d{2}:\d{2}$/.test(s)) return s;
  // H:mm AM/PM
  const ampm = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (ampm) {
    let h = parseInt(ampm[1]);
    const m = ampm[2];
    const period = ampm[3].toUpperCase();
    if (period === 'PM' && h !== 12) h += 12;
    if (period === 'AM' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${m}`;
  }
  return null;
}

/**
 * Map template "Appointment Type" → internal category
 * Template values: "Buyer Appointment", "Listing Appointment"
 */
function parseCategory(v: unknown): string {
  const s = String(v ?? '').toLowerCase().trim();
  if (s.includes('listing') || s.includes('seller')) return 'seller';
  if (s.includes('buyer')) return 'buyer';
  if (s.includes('both')) return 'both';
  return 'buyer';
}

/**
 * Map template "Status" → internal status + pipelineStatus
 * Template values: "Held - Converted", "Held - No Contract", "No-Show", "Canceled"
 */
function parseStatus(v: unknown): { status: string; pipelineStatus: string } {
  const s = String(v ?? '').toLowerCase().trim();
  if (s.includes('converted')) return { status: 'held', pipelineStatus: 'held' };
  if (s.includes('held')) return { status: 'held', pipelineStatus: 'held' };
  if (s.includes('no-show') || s.includes('no show') || s.includes('noshow')) return { status: 'no_show', pipelineStatus: 'ghost' };
  if (s.includes('cancel')) return { status: 'canceled', pipelineStatus: 'trash' };
  if (s.includes('set') || s.includes('scheduled')) return { status: 'set', pipelineStatus: 'active' };
  return { status: 'set', pipelineStatus: 'active' };
}

/**
 * Map template "Client Timing" → internal timing enum
 * Template values: "0-60 Days", "60-90 Days", "120+ Days", "Other / Flexible"
 */
function parseTiming(v: unknown): string | null {
  const s = String(v ?? '').toLowerCase().trim();
  if (s.startsWith('0') || s.includes('0-60') || s.includes('0–60')) return '0_60';
  if (s.includes('60') || s.includes('60-90') || s.includes('60–90') || s.includes('60-120') || s.includes('60–120')) return '60_120';
  if (s.includes('120') || s.includes('120+')) return '120_plus';
  if (s.includes('other') || s.includes('flexible')) return 'other';
  return null;
}

/**
 * Parse template "Price Range" string like "$125,000 - $175,000" or "$1,500 - $2,000 / mo"
 * Returns { low, high } as numbers
 */
function parsePriceRange(v: unknown): { low: number | null; high: number | null } {
  if (!v) return { low: null, high: null };
  const s = String(v).trim();
  // Match two dollar amounts separated by " - "
  const match = s.match(/\$?([\d,]+(?:\.\d+)?)\s*[-–]\s*\$?([\d,]+(?:\.\d+)?)/);
  if (match) {
    const low = toNum(match[1]);
    const high = toNum(match[2]);
    return { low, high };
  }
  // Single value
  const single = toNum(s.replace(/[^0-9.]/g, ''));
  return { low: single, high: null };
}

/** Normalize flexible column names from CSV/JSON rows to canonical keys */
function normalizeRow(raw: Record<string, unknown>): Record<string, unknown> {
  const aliases: Record<string, string> = {
    // Row ID
    'rowid': 'rowId', 'row_id': 'rowId', 'id': 'rowId', 'sourceid': 'rowId',
    // Appointment Type
    'appointmenttype': 'appointmentType', 'appointment_type': 'appointmentType',
    'type': 'appointmentType', 'category': 'appointmentType', 'clienttype': 'appointmentType',
    // Client Name
    'clientname': 'clientName', 'client_name': 'clientName', 'contactname': 'clientName',
    'contact_name': 'clientName', 'name': 'clientName', 'client': 'clientName',
    // Date Set
    'dateset': 'dateSet', 'date_set': 'dateSet', 'setdate': 'dateSet', 'set_date': 'dateSet',
    'datecreated': 'dateSet', 'created': 'dateSet',
    // Appointment Date
    'appointmentdate': 'appointmentDate', 'appointment_date': 'appointmentDate',
    'date': 'appointmentDate', 'scheduleddate': 'appointmentDate', 'apptdate': 'appointmentDate',
    // Appointment Time
    'appointmenttime': 'appointmentTime', 'appointment_time': 'appointmentTime',
    'time': 'appointmentTime', 'scheduledtime': 'appointmentTime', 'appttime': 'appointmentTime',
    // Status
    'status': 'status', 'appt_status': 'status', 'appointmentstatus': 'status',
    // Client Timing
    'clienttiming': 'clientTiming', 'client_timing': 'clientTiming', 'timing': 'clientTiming',
    'timeframe': 'clientTiming', 'timeline': 'clientTiming',
    // Price Range
    'pricerange': 'priceRange', 'price_range': 'priceRange', 'price': 'priceRange',
    'priceranglow': 'priceRangeLow', 'price_range_low': 'priceRangeLow', 'pricelow': 'priceRangeLow',
    'pricerangehigh': 'priceRangeHigh', 'price_range_high': 'priceRangeHigh', 'pricehigh': 'priceRangeHigh',
    // Notes
    'notes': 'notes', 'note': 'notes', 'comments': 'notes', 'description': 'notes',
    // Year
    'year': 'year',
  };
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    const normalized = k.toLowerCase().replace(/[\s_-]/g, '');
    out[aliases[normalized] ?? k] = v;
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

    const rows: any[] = Array.isArray(body?.appointments) ? body.appointments : [];
    if (rows.length === 0) return jsonError(400, 'No appointments provided');
    if (rows.length > MAX_BATCH) return jsonError(400, `Maximum ${MAX_BATCH} appointments per bulk import`);

    // Unique batch ID — groups all rows from this import so they can be deleted together
    const importBatchId = `${uid}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const importedAt = new Date().toISOString();

    const errors: { row: number; error: string }[] = [];
    const validDocs: Record<string, unknown>[] = [];

    for (let i = 0; i < rows.length; i++) {
      const rowNum = i + 1;
      try {
        const row = normalizeRow(rows[i]);

        // ── Appointment Date (required) ───────────────────────────────────
        const date = parseDate(row.appointmentDate ?? row.date);
        if (!date) { errors.push({ row: rowNum, error: 'Invalid or missing Appointment Date' }); continue; }

        // ── Client Name (required) ────────────────────────────────────────
        const contactName = toStr(row.clientName ?? row.contactName ?? row.name);
        if (!contactName) { errors.push({ row: rowNum, error: 'Missing Client Name' }); continue; }

        // ── Category ─────────────────────────────────────────────────────
        const category = parseCategory(row.appointmentType ?? row.category ?? row.type);

        // ── Status ───────────────────────────────────────────────────────
        const { status, pipelineStatus } = parseStatus(row.status);

        // ── Timing ───────────────────────────────────────────────────────
        const timing = parseTiming(row.clientTiming ?? row.timing);

        // ── Price Range ───────────────────────────────────────────────────
        let priceRangeLow: number | null = null;
        let priceRangeHigh: number | null = null;
        if (row.priceRange) {
          const parsed = parsePriceRange(row.priceRange);
          priceRangeLow = parsed.low;
          priceRangeHigh = parsed.high;
        } else {
          priceRangeLow = toNum(row.priceRangeLow);
          priceRangeHigh = toNum(row.priceRangeHigh);
        }

        // ── Date Set ─────────────────────────────────────────────────────
        const dateSet = parseDate(row.dateSet ?? row.dateset);

        // ── Appointment Time ─────────────────────────────────────────────
        const apptTime = parseTime(row.appointmentTime ?? row.time);

        // ── Scheduled At (combined date + time) ──────────────────────────
        let scheduledAt: Date | null = null;
        if (date && apptTime) {
          const d = new Date(`${date}T${apptTime}:00`);
          if (!isNaN(d.getTime())) scheduledAt = d;
        }

        // ── Source Row ID (for dedup reference) ──────────────────────────
        const sourceRowId = toStr(row.rowId ?? row.sourceRowId);

        validDocs.push({
          agentId: uid,
          createdByUid: callerUid,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          // Core
          date,
          contactName,
          category,
          status,
          pipelineStatus,
          // Timing & price
          timing,
          priceRangeLow,
          priceRangeHigh,
          // Date set
          dateSet: dateSet ?? null,
          timeSet: null,
          // Scheduled
          scheduledAt: scheduledAt ?? null,
          heldAt: null,
          // Misc
          notes: toStr(row.notes) ?? null,
          contactPhone: toStr(row.contactPhone ?? row.phone) ?? null,
          contactEmail: toStr(row.contactEmail ?? row.email) ?? null,
          listingAddress: toStr(row.listingAddress ?? row.address) ?? null,
          sourceRowId: sourceRowId ?? null,
          source: 'bulk_import',
          importBatchId,
          importedAt,
        });
      } catch (err: any) {
        errors.push({ row: rowNum, error: err.message || 'Parse error' });
      }
    }

    if (validDocs.length === 0) {
      return NextResponse.json({ ok: false, created: 0, errors }, { status: 422 });
    }

    // Write in Firestore batches
    const FIRESTORE_BATCH_SIZE = 400;
    let created = 0;
    for (let start = 0; start < validDocs.length; start += FIRESTORE_BATCH_SIZE) {
      const chunk = validDocs.slice(start, start + FIRESTORE_BATCH_SIZE);
      const batch = adminDb.batch();
      for (const doc of chunk) {
        const ref = adminDb.collection('appointments').doc();
        batch.set(ref, doc);
      }
      await batch.commit();
      created += chunk.length;
    }

    return NextResponse.json({ ok: true, created, errors, importBatchId, importedAt });
  } catch (err: any) {
    console.error('[API/appointments/bulk] POST failed:', err);
    return jsonError(err.status ?? 500, err.message ?? 'Bulk import failed');
  }
}
