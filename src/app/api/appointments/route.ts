// src/app/api/appointments/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';

import { FieldValue, Query } from 'firebase-admin/firestore';
import { differenceInDays, startOfMonth, endOfMonth, format } from 'date-fns';

const EDIT_WINDOW_DAYS = 45;

function serializeFirestore(val: any): any {
  if (val == null) return val;
  if (typeof val?.toDate === 'function') return val.toDate().toISOString();
  if (Array.isArray(val)) return val.map(serializeFirestore);
  if (typeof val === 'object' && val.constructor === Object) {
    const out: any = {};
    for (const [k, v] of Object.entries(val)) {
      out[k] = serializeFirestore(v);
    }
    return out;
  }
  return val;
}

// --- API Helpers ---
function jsonError(status: number, error: string, code?: string) {
  return NextResponse.json({ ok: false, error, code: code ?? `http_${status}` }, { status });
}

async function requireUser(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw { status: 401, message: 'Missing Authorization bearer token', code: 'auth/missing-bearer' };
  }
  const token = authHeader.slice('Bearer '.length);
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    const userSnap = await adminDb.collection('users').doc(decoded.uid).get();
    const role = userSnap.exists ? userSnap.data()?.role : 'agent';
    return { uid: decoded.uid, role };
  } catch (err: any) {
    throw { status: 401, message: 'Invalid or expired token', code: 'auth/invalid-token' };
  }
}

function isDateEditable(dateStr: string, role: string): boolean {
    if (role === 'admin') return true;
    const date = new Date(dateStr + "T00:00:00");
    const today = new Date();
    const diff = differenceInDays(
        new Date(today.getFullYear(), today.getMonth(), today.getDate()),
        new Date(date.getFullYear(), date.getMonth(), date.getDate())
    );
    return diff <= EDIT_WINDOW_DAYS;
}

// --- Route Handlers ---

/**
 * GET /api/appointments?date=YYYY-MM-DD
 * GET /api/appointments?year=YYYY&month=MM          (monthly log view)
 * GET /api/appointments?year=YYYY                   (full-year pipeline view)
 */
export async function GET(req: NextRequest) {
  try {
    const { uid: callerUid } = await requireUser(req);
    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date');
    const year = searchParams.get('year');
    const month = searchParams.get('month');
    const viewAs = searchParams.get('viewAs');
    const uid = (await isAdminLike(callerUid) && viewAs) ? viewAs : callerUid;

    let q: Query = adminDb.collection('appointments').where('agentId', '==', uid);

    if (date) {
      q = q.where('date', '==', date);
    } else if (year && month) {
      // Monthly log view (existing behaviour)
      const startDate = format(startOfMonth(new Date(parseInt(year), parseInt(month) - 1)), 'yyyy-MM-dd');
      const endDate = format(endOfMonth(new Date(parseInt(year), parseInt(month) - 1)), 'yyyy-MM-dd');
      q = q.where('date', '>=', startDate).where('date', '<=', endDate);
    } else if (year) {
      // Full-year pipeline view — all appointments for the calendar year
      q = q.where('date', '>=', `${year}-01-01`).where('date', '<=', `${year}-12-31`);
    } else {
      return jsonError(400, 'Missing query params: must provide either `date`, `year`, or `year` and `month`');
    }

    const snap = await q.get();

    const appointments = snap.docs.map(doc => {
        const serialized = serializeFirestore(doc.data());
        if (!serialized.createdAt) serialized.createdAt = new Date(0).toISOString();
        return { id: doc.id, ...serialized };
    });

    // Sort in memory: by date ascending (upcoming first), then by creation time
    appointments.sort((a, b) => {
        const dateCompare = a.date.localeCompare(b.date);
        if (dateCompare !== 0) return dateCompare;
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

    return NextResponse.json({ ok: true, appointments });
  } catch (err: any) {
    console.error(`[API/appointments] GET failed:`, err);
    return jsonError(err.status ?? 500, err.message ?? 'Failed to load appointments');
  }
}

/**
 * POST /api/appointments
 */
export async function POST(req: NextRequest) {
  try {
    const { uid: callerUid, role } = await requireUser(req);

    let body: any;
    try {
      body = await req.json();
    } catch {
      return jsonError(400, 'Invalid or missing JSON body');
    }

    // Admin can create appointment for any agent via body.viewAs
    const viewAs = body?.viewAs;
    const uid = (await isAdminLike(callerUid) && viewAs) ? viewAs : callerUid;
    const effectiveRole = await isAdminLike(callerUid) ? 'admin' : role;

    if (!body.date || !body.contactName || !body.category) {
      return jsonError(400, 'Missing required fields: date, contactName, category');
    }

    if (!isDateEditable(body.date, effectiveRole)) {
        return jsonError(403, 'Edits are locked after 45 days.', 'edit_window_expired');
    }

    const dataToSave = {
      agentId: uid,
      createdByUid: callerUid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      // Core fields
      date: body.date,
      contactName: body.contactName,
      category: body.category,                          // buyer | seller | commercial
      status: body.status ?? 'set',                     // legacy log status: set | held
      // Pipeline status (new)
      pipelineStatus: body.pipelineStatus ?? 'active',  // active | set | held | ghost | on_hold | trash
      // Contact info
      contactPhone: body.contactPhone ?? null,
      contactEmail: body.contactEmail ?? null,
      // Property / deal info
      listingAddress: body.listingAddress ?? null,
      priceRangeLow: body.priceRangeLow ? Number(body.priceRangeLow) : null,
      priceRangeHigh: body.priceRangeHigh ? Number(body.priceRangeHigh) : null,
      estimatedCommission: body.estimatedCommission ? Number(body.estimatedCommission) : null,
      // Notes
      notes: body.notes ?? null,
      scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
      heldAt: body.heldAt ? new Date(body.heldAt) : null,
    };

    const docRef = await adminDb.collection('appointments').add(dataToSave);

    return NextResponse.json({ ok: true, id: docRef.id });
  } catch (err: any) {
    console.error(`[API/appointments] POST failed:`, err);
    return jsonError(err.status ?? 500, err.message ?? 'Failed to save appointment');
  }
}
