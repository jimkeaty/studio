// src/app/api/daily-activity/route.ts
import { NextResponse } from "next/server";
import { adminDb, adminAuth } from '@/lib/firebase/admin';

const ADMIN_UID = '1kJsXTU1JjZXMidmoIPXgXxizll1';
import { FieldValue, DocumentData } from "firebase-admin/firestore";
import { differenceInDays } from "date-fns";

const EDIT_WINDOW_DAYS = 45;

function jsonError(status: number, error: string, code?: string, details?: unknown) {
  return NextResponse.json(
    { ok: false, error, code: code ?? `http_${status}`, details: details ?? null },
    { status }
  );
}

async function requireUser(req: Request): Promise<{ uid: string; role: string }> {
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
    const userSnap = await adminDb.collection("users").doc(decoded.uid).get();
    const role = userSnap.exists ? (userSnap.data() as DocumentData).role : "agent";
    return { uid: decoded.uid, role };
  } catch (err: any) {
    throw Object.assign(new Error("Invalid or expired token"), {
      status: 401,
      code: "auth/invalid-token",
      details: err?.message ?? String(err),
    });
  }
}

/**
 * Prevent saving future dates.
 * - Admin can edit anything
 * - Agents can only edit dates 0..45 days ago (inclusive)
 */
function isDateEditable(dateStr: string, role: string): boolean {
  if (role === "admin") return true;

  const date = new Date(dateStr + "T00:00:00");
  const today = new Date();

  const diff = differenceInDays(
    new Date(today.getFullYear(), today.getMonth(), today.getDate()),
    new Date(date.getFullYear(), date.getMonth(), date.getDate())
  );

  return diff >= 0 && diff <= EDIT_WINDOW_DAYS;
}

function emptyDailyActivity(date: string) {
  return {
    date,
    callsCount: 0,
    engagementsCount: 0,
    appointmentsSetCount: 0,
    appointmentsHeldCount: 0,
    contractsWrittenCount: 0,
    notes: "",
  };
}

function toNumberOrZero(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function GET(req: Request) {
  try {
    const { uid: callerUid } = await requireUser(req);
    const url = new URL(req.url);
    const date = url.searchParams.get("date");
    const viewAs = url.searchParams.get("viewAs");
    const uid = (callerUid === ADMIN_UID && viewAs) ? viewAs : callerUid;

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
    dailyActivity.callsCount = toNumberOrZero(dailyActivity.callsCount);
    dailyActivity.engagementsCount = toNumberOrZero(dailyActivity.engagementsCount);
    dailyActivity.appointmentsSetCount = toNumberOrZero(dailyActivity.appointmentsSetCount);
    dailyActivity.appointmentsHeldCount = toNumberOrZero(dailyActivity.appointmentsHeldCount);
    dailyActivity.contractsWrittenCount = toNumberOrZero(dailyActivity.contractsWrittenCount);

    return NextResponse.json({ ok: true, dailyActivity });
  } catch (err: any) {
    const status = err?.status ?? 500;
    return jsonError(status, err?.message ?? "Failed to load daily activity", err?.code, err?.details);
  }
}

export async function POST(req: Request) {
  try {
    const { uid: callerUid, role } = await requireUser(req);

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return jsonError(400, "Invalid JSON body", "bad_request/invalid-json");
    }

    // Admin can write on behalf of any agent via body.viewAs
    const viewAs = (body as any).viewAs;
    const uid = (callerUid === ADMIN_UID && viewAs) ? viewAs : callerUid;

    const date = (body as any).date;
    if (!date || typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return jsonError(400, "Missing or invalid field: date", "bad_request/missing-date");
    }

    // Admin impersonating uses admin role privileges for edit window
    const effectiveRole = callerUid === ADMIN_UID ? "admin" : role;
    if (!isDateEditable(date, effectiveRole)) {
      return jsonError(403, "Edits are locked after 45 days.", "edit_window_expired");
    }

    // ✅ Accept BOTH shapes:
    // 1) { date, callsCount, engagementsCount, ... }
    // 2) { date, dailyActivity: { callsCount, engagementsCount, ... }, notes? }
    const payload =
      (body as any).dailyActivity && typeof (body as any).dailyActivity === "object"
        ? (body as any).dailyActivity
        : body;

    const docId = `${uid}_${date}`;
    const ref = adminDb.collection("daily_activity").doc(docId);

    const dataToSave = {
      agentId: uid,
      date,
      callsCount: toNumberOrZero((payload as any).callsCount),
      engagementsCount: toNumberOrZero((payload as any).engagementsCount),
      appointmentsSetCount: toNumberOrZero((payload as any).appointmentsSetCount),
      appointmentsHeldCount: toNumberOrZero((payload as any).appointmentsHeldCount),
      contractsWrittenCount: toNumberOrZero((payload as any).contractsWrittenCount),
      // notes can be top-level or inside payload; support both
      notes: String((body as any).notes ?? (payload as any).notes ?? ""),
      updatedAt: FieldValue.serverTimestamp(), // ✅ keep storing server timestamp
      updatedByUid: uid,
    };

    await ref.set(dataToSave, { merge: true });

    // ✅ Don't return the serverTimestamp sentinel to the client
    return NextResponse.json({
      ok: true,
      dailyActivity: {
        ...emptyDailyActivity(date),
        ...dataToSave,
        updatedAt: null,
      },
    });
  } catch (err: any) {
    const status = err?.status ?? 500;
    return jsonError(status, err?.message ?? "Failed to save daily activity", err?.code, err?.details);
  }
}
