// src/app/api/daily-activity/route.ts
import { NextResponse } from "next/server";
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

/**
 * Admin SDK init (safe to run multiple times)
 * In Firebase App Hosting, initializeApp() uses Application Default Credentials.
 */
const adminApp = getApps().length ? getApps()[0] : initializeApp();
const adminAuth = getAuth(adminApp);
const adminDb = getFirestore(adminApp);

function jsonError(status: number, error: string, code?: string, details?: unknown) {
  return NextResponse.json(
    { ok: false, error, code: code ?? `http_${status}`, details: details ?? null },
    { status }
  );
}

async function requireUser(req: Request): Promise<{ uid: string }> {
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
    return { uid: decoded.uid };
  } catch (err: any) {
    throw Object.assign(new Error("Invalid or expired token"), {
      status: 401,
      code: "auth/invalid-token",
      details: err?.message ?? String(err),
    });
  }
}

function emptyDailyActivity(date: string) {
  return {
    date,
    callsCount: 0,
    engagementsCount: 0,
    appointmentsSetCount: 0,
    appointmentsHeldCount: 0,
    contractsWrittenCount: 0,
  };
}

/**
 * GET /api/daily-activity?date=YYYY-MM-DD
 * Returns dailyActivity for the signed-in user for that date.
 */
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
      ? {
          ...emptyDailyActivity(date),
          ...(snap.data() ?? {}),
        }
      : emptyDailyActivity(date);

    // Guarantee counts are numbers
    dailyActivity.callsCount = Number((dailyActivity as any).callsCount ?? 0) || 0;
    dailyActivity.engagementsCount = Number((dailyActivity as any).engagementsCount ?? 0) || 0;
    dailyActivity.appointmentsSetCount = Number((dailyActivity as any).appointmentsSetCount ?? 0) || 0;
    dailyActivity.appointmentsHeldCount = Number((dailyActivity as any).appointmentsHeldCount ?? 0) || 0;
    dailyActivity.contractsWrittenCount = Number((dailyActivity as any).contractsWrittenCount ?? 0) || 0;

    return NextResponse.json({ ok: true, dailyActivity });
  } catch (err: any) {
    const status = err?.status ?? 500;
    return jsonError(status, err?.message ?? "Failed to load daily activity", err?.code, err?.details);
  }
}

/**
 * POST /api/daily-activity
 * Body:
 * {
 *   date: "YYYY-MM-DD",
 *   callsCount, engagementsCount, appointmentsSetCount, appointmentsHeldCount, contractsWrittenCount
 * }
 */
export async function POST(req: Request) {
  try {
    const { uid } = await requireUser(req);

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return jsonError(400, "Invalid JSON body", "bad_request/invalid-json");
    }

    const date = (body as any).date;
    if (!date || typeof date !== "string") {
      return jsonError(400, "Missing or invalid field: date", "bad_request/missing-date");
    }

    const callsCount = Number((body as any).callsCount ?? 0) || 0;
    const engagementsCount = Number((body as any).engagementsCount ?? 0) || 0;
    const appointmentsSetCount = Number((body as any).appointmentsSetCount ?? 0) || 0;
    const appointmentsHeldCount = Number((body as any).appointmentsHeldCount ?? 0) || 0;
    const contractsWrittenCount = Number((body as any).contractsWrittenCount ?? 0) || 0;

    const docId = `${uid}_${date}`;
    const ref = adminDb.collection("daily_activity").doc(docId);

    await ref.set(
      {
        agentId: uid,
        date,
        callsCount,
        engagementsCount,
        appointmentsSetCount,
        appointmentsHeldCount,
        contractsWrittenCount,
        updatedAt: FieldValue.serverTimestamp(),
        updatedByUid: uid,
      },
      { merge: true }
    );

    return NextResponse.json({
      ok: true,
      dailyActivity: { date, callsCount, engagementsCount, appointmentsSetCount, appointmentsHeldCount, contractsWrittenCount },
    });
  } catch (err: any) {
    const status = err?.status ?? 500;
    return jsonError(status, err?.message ?? "Failed to save daily activity", err?.code, err?.details);
  }
}