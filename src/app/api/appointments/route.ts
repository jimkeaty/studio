// src/app/api/appointments/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { FieldValue, Query } from 'firebase-admin/firestore';
import { differenceInDays, startOfMonth, endOfMonth, format } from 'date-fns';

const EDIT_WINDOW_DAYS = 45;

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
 * GET /api/appointments?year=YYYY&month=MM
 */
export async function GET(req: NextRequest) {
  try {
    const { uid } = await requireUser(req);
    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date');
    const year = searchParams.get('year');
    const month = searchParams.get('month');

    let q: Query = adminDb.collection('appointments').where('agentId', '==', uid);

    if (date) {
      q = q.where('date', '==', date);
    } else if (year && month) {
      const startDate = format(startOfMonth(new Date(parseInt(year), parseInt(month) - 1)), 'yyyy-MM-dd');
      const endDate = format(endOfMonth(new Date(parseInt(year), parseInt(month) - 1)), 'yyyy-MM-dd');
      q = q.where('date', '>=', startDate).where('date', '<=', endDate);
    } else {
      return jsonError(400, 'Missing query params: must provide either `date` or `year` and `month`');
    }

    // This was removed because a range filter on `date` and an orderBy on `createdAt` requires a composite index.
    // We will sort in memory instead to avoid the 500 error.
    // q = q.orderBy('createdAt', 'desc');
    
    const snap = await q.get();

    const appointments = snap.docs.map(doc => {
        const data = doc.data();
        // Convert Timestamps to ISO strings for a consistent return shape.
        const scheduledAt = data.scheduledAt ? data.scheduledAt.toDate().toISOString() : null;
        const heldAt = data.heldAt ? data.heldAt.toDate().toISOString() : null;
        // Also convert createdAt to handle sorting and provide a consistent data shape.
        const createdAt = data.createdAt ? data.createdAt.toDate().toISOString() : new Date(0).toISOString();
        return { id: doc.id, ...data, scheduledAt, heldAt, createdAt };
    });

    // Sort in memory to avoid needing composite indexes in Firestore.
    // Primary sort: by date, descending (most recent first).
    // Secondary sort: by creation time, descending.
    appointments.sort((a, b) => {
        const dateCompare = b.date.localeCompare(a.date);
        if (dateCompare !== 0) {
            return dateCompare;
        }
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
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
    const { uid, role } = await requireUser(req);
    const body = await req.json();

    if (!body.date || !body.contactName || !body.category || !body.status) {
      return jsonError(400, 'Missing required fields');
    }
    
    if (!isDateEditable(body.date, role)) {
        return jsonError(403, 'Edits are locked after 45 days.', 'edit_window_expired');
    }
    
    const dataToSave = {
      agentId: uid,
      createdByUid: uid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      date: body.date,
      contactName: body.contactName,
      category: body.category,
      status: body.status,
      contactPhone: body.contactPhone ?? null,
      contactEmail: body.contactEmail ?? null,
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
