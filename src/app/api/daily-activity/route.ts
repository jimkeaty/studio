// src/app/api/daily-activity/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getApps, initializeApp, App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue, DocumentData } from "firebase-admin/firestore";
import { differenceInDays } from "date-fns";

const EDIT_WINDOW_DAYS = 45;

const adminApp: App = getApps().length ? getApps()[0] : initializeApp();
const adminAuth = getAuth(adminApp);
const adminDb = getFirestore(adminApp);

function jsonError(status: number, error: string, code?: string, details?: unknown) {
  return NextResponse.json(
    { ok: false, error, code: code ?? `http_${status}`, details: details ?? null },
    { status }
  );
}

async function requireUser(req: Request): Promise<{ uid: string, role: string }> {
  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw Object.assign(new Error("Missing Authorization bearer token"), {
      status: 401,
      code: "auth/missing-bearer",
    });
  }

  const token = authHeader.slice("Bearer ".length).trim();
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    const userSnap = await adminDb.collection('users').doc(decoded.uid).get();
    const role = userSnap.exists ? (userSnap.data() as DocumentData).role : 'agent';
    return { uid: decoded.uid, role };
  } catch (err: any) {
    throw Object.assign(new Error("Invalid or expired token"), {
      status: 401,
      code: "auth/invalid-token",
      details: err?.message ?? String(err),
    });
  }
}

function isDateEditable(dateStr: string, role: string): boolean {
    if (role === 'admin') return true;

    const date = new Date(dateStr + "T00:00:00"); // Ensure parsing in local timezone of server
    const today = new Date();
    
    // Compare date parts only, ignoring time
    const diff = differenceInDays(
        new Date(today.getFullYear(), today.getMonth(), today.getDate()),
        new Date(date.getFullYear(), date.getMonth(), date.getDate())
    );

    return diff <= EDIT_WINDOW_DAYS;
}


function emptyDailyActivity(date: string) {
  return {
    date,
    callsCount: 0,
    engagementsCount: 0,
    appointmentsSetCount: 0,
    appointmentsHeldCount: 0,
    contractsWrittenCount: 0,
    notes: '',
  };
}

export async function GET(req: Request) {
  try {
    const { uid } = await requireUser(req);
    const url = new URL(req.url);
    const date = url.searchParams.get("date");

    if (!date) {
      return jsonError(400, "Missing required query param: date", "bad_request/missing-date");
    }

    const docId = `${uid}_${date}`;
    const ref = adminDb.collection("daily_activity").doc(docId);
    const snap = await ref.get();

    const dailyActivity = snap.exists
      ? { ...emptyDailyActivity(date), ...(snap.data() ?? {}) }
      : emptyDailyActivity(date);

    // Guarantee counts are numbers
    dailyActivity.callsCount = Number(dailyActivity.callsCount ?? 0) || 0;
    dailyActivity.engagementsCount = Number(dailyActivity.engagementsCount ?? 0) || 0;
    dailyActivity.appointmentsSetCount = Number(dailyActivity.appointmentsSetCount ?? 0) || 0;
    dailyActivity.appointmentsHeldCount = Number(dailyActivity.appointmentsHeldCount ?? 0) || 0;
    dailyActivity.contractsWrittenCount = Number(dailyActivity.contractsWrittenCount ?? 0) || 0;

    return NextResponse.json({ ok: true, dailyActivity });
  } catch (err: any) {
    const status = err?.status ?? 500;
    return jsonError(status, err?.message ?? "Failed to load daily activity", err?.code, err?.details);
  }
}

export async function POST(req: Request) {
  try {
    const { uid, role } = await requireUser(req);

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return jsonError(400, "Invalid JSON body", "bad_request/invalid-json");
    }

    const date = (body as any).date;
    if (!date || typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return jsonError(400, "Missing or invalid field: date", "bad_request/missing-date");
    }

    if (!isDateEditable(date, role)) {
        return jsonError(403, 'Edits are locked after 45 days.', 'edit_window_expired');
    }

    const docId = `${uid}_${date}`;
    const ref = adminDb.collection("daily_activity").doc(docId);

    const dataToSave = {
        agentId: uid,
        date,
        callsCount: Number((body as any).callsCount ?? 0) || 0,
        engagementsCount: Number((body as any).engagementsCount ?? 0) || 0,
        appointmentsSetCount: Number((body as any).appointmentsSetCount ?? 0) || 0,
        appointmentsHeldCount: Number((body as any).appointmentsHeldCount ?? 0) || 0,
        contractsWrittenCount: Number((body as any).contractsWrittenCount ?? 0) || 0,
        notes: (body as any).notes ?? '',
        updatedAt: FieldValue.serverTimestamp(),
        updatedByUid: uid,
    };

    await ref.set(dataToSave, { merge: true });

    return NextResponse.json({ ok: true, dailyActivity: dataToSave });
  } catch (err: any) {
    const status = err?.status ?? 500;
    return jsonError(status, err?.message ?? "Failed to save daily activity", err?.code, err?.details);
  }
}
