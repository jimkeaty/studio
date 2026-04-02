/**
 * POST /api/appointments/bulk
 *
 * Accepts an array of appointment objects and creates them all in a single
 * Firestore batch write.  Used by the Bulk Import UI in the Daily Tracker.
 *
 * Body: { appointments: BulkAppointmentRow[], viewAs?: string }
 *
 * Each row must have at minimum: date (YYYY-MM-DD), contactName, category.
 * All other fields are optional and will be stored if provided.
 *
 * Returns: { ok: true, created: number, errors: { row: number, error: string }[] }
 */
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';
import { FieldValue } from 'firebase-admin/firestore';

const VALID_CATEGORIES = new Set(['buyer', 'seller', 'both']);
const VALID_STATUSES = new Set(['set', 'held', 'scheduled', 'canceled', 'no_show']);
const VALID_TIMINGS = new Set(['0_60', '60_120', '120_plus', 'other']);
const MAX_BATCH = 200; // Firestore batch limit is 500; we cap at 200 for safety

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
  const n = Number(String(v).replace(/[$,]/g, '').trim());
  return isFinite(n) ? n : null;
}

/** Parse a date string into YYYY-MM-DD, accepting common formats */
function parseDate(v: unknown): string | null {
  if (!v) return null;
  const s = String(v).trim();
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // MM/DD/YYYY or M/D/YYYY
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) {
    const [, m, d, y] = mdy;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  // Try native Date parse as last resort
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return null;
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

    // Admin impersonation
    const viewAs = body?.viewAs;
    const uid = (await isAdminLike(callerUid) && viewAs) ? viewAs : callerUid;

    const rows: any[] = Array.isArray(body?.appointments) ? body.appointments : [];
    if (rows.length === 0) return jsonError(400, 'No appointments provided');
    if (rows.length > MAX_BATCH) return jsonError(400, `Maximum ${MAX_BATCH} appointments per bulk import`);

    const errors: { row: number; error: string }[] = [];
    const validDocs: { data: Record<string, unknown> }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 1;

      const date = parseDate(row.date);
      if (!date) { errors.push({ row: rowNum, error: 'Invalid or missing date' }); continue; }

      const contactName = toStr(row.contactName ?? row.contact_name ?? row.name);
      if (!contactName) { errors.push({ row: rowNum, error: 'Missing contactName' }); continue; }

      const rawCategory = toStr(row.category ?? row.type ?? row.clientType ?? row.client_type) ?? 'buyer';
      const category = VALID_CATEGORIES.has(rawCategory.toLowerCase()) ? rawCategory.toLowerCase() : 'buyer';

      const rawStatus = toStr(row.status) ?? 'set';
      const status = VALID_STATUSES.has(rawStatus.toLowerCase()) ? rawStatus.toLowerCase() : 'set';

      const rawTiming = toStr(row.timing);
      const timing = rawTiming && VALID_TIMINGS.has(rawTiming) ? rawTiming : null;

      const priceRangeLow = toNum(row.priceRangeLow ?? row.price_range_low ?? row.priceLow ?? row.price_low);
      const priceRangeHigh = toNum(row.priceRangeHigh ?? row.price_range_high ?? row.priceHigh ?? row.price_high);

      // Scheduled at: combine scheduledAt or scheduledDate + scheduledTime
      let scheduledAt: Date | null = null;
      if (row.scheduledAt) {
        const d = new Date(row.scheduledAt);
        if (!isNaN(d.getTime())) scheduledAt = d;
      } else if (row.scheduledDate ?? row.scheduled_date) {
        const dateStr = parseDate(row.scheduledDate ?? row.scheduled_date);
        if (dateStr) {
          const timeStr = toStr(row.scheduledTime ?? row.scheduled_time) ?? '00:00';
          scheduledAt = new Date(`${dateStr}T${timeStr}:00`);
        }
      }

      // Held at
      let heldAt: Date | null = null;
      if (row.heldAt) {
        const d = new Date(row.heldAt);
        if (!isNaN(d.getTime())) heldAt = d;
      } else if (row.heldDate ?? row.held_date) {
        const dateStr = parseDate(row.heldDate ?? row.held_date);
        if (dateStr) {
          const timeStr = toStr(row.heldTime ?? row.held_time) ?? '00:00';
          heldAt = new Date(`${dateStr}T${timeStr}:00`);
        }
      }

      // dateSet
      const dateSet = parseDate(row.dateSet ?? row.date_set ?? row.setDate ?? row.set_date);
      const timeSet = toStr(row.timeSet ?? row.time_set);

      validDocs.push({
        data: {
          agentId: uid,
          createdByUid: callerUid,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          date,
          contactName,
          category,
          status,
          pipelineStatus: 'active',
          timing,
          priceRangeLow,
          priceRangeHigh,
          dateSet: dateSet ?? null,
          timeSet: timeSet ?? null,
          scheduledAt: scheduledAt ?? null,
          heldAt: heldAt ?? null,
          notes: toStr(row.notes) ?? null,
          contactPhone: toStr(row.contactPhone ?? row.contact_phone ?? row.phone) ?? null,
          contactEmail: toStr(row.contactEmail ?? row.contact_email ?? row.email) ?? null,
          listingAddress: toStr(row.listingAddress ?? row.listing_address ?? row.address) ?? null,
          source: 'bulk_import',
        },
      });
    }

    if (validDocs.length === 0) {
      return NextResponse.json({ ok: false, created: 0, errors }, { status: 422 });
    }

    // Write in Firestore batches (max 500 ops per batch)
    const FIRESTORE_BATCH_SIZE = 400;
    let created = 0;
    for (let start = 0; start < validDocs.length; start += FIRESTORE_BATCH_SIZE) {
      const chunk = validDocs.slice(start, start + FIRESTORE_BATCH_SIZE);
      const batch = adminDb.batch();
      for (const doc of chunk) {
        const ref = adminDb.collection('appointments').doc();
        batch.set(ref, doc.data);
      }
      await batch.commit();
      created += chunk.length;
    }

    return NextResponse.json({ ok: true, created, errors });
  } catch (err: any) {
    console.error('[API/appointments/bulk] POST failed:', err);
    return jsonError(err.status ?? 500, err.message ?? 'Bulk import failed');
  }
}
