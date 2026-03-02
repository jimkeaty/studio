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
    {
      ok: false,
      error,
      code: code ?? `http_${status}`,
      details: details ?? null,
    },
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

function buildEmptyDailyLog(uid: string, date: string) {
  return {
    agentId: uid,
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
 * Returns daily_activity doc for the signed-in user for that date.
 * Always returns a predictable shape: { ok: true, data: { ...counts } }
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

    const empty = buildEmptyDailyLog(uid, date);

    if (!snap.exists) {
      // IMPORTANT: return defaults so the UI never crashes reading callsCount, etc.
      return NextResponse.json({
        ok: true,
        data: empty,
      });
    }

    const raw = snap.data() || {};

    return NextResponse.json({
      ok: true,
      data: {
        ...empty,
        ...raw,
        // harden numeric fields (in case doc is missing fields)
        callsCount: Number((raw as any).callsCount ?? 0) || 0,
        engagementsCount: Number((raw as any).engagementsCount ?? 0) || 0,
        appointmentsSetCount: Number((raw as any).appointmentsSetCount ?? 0) || 0,
        appointmentsHeldCount: Number((raw as any).appointmentsHeldCount ?? 0) || 0,
        contractsWrittenCount: Number((raw as any).contractsWrittenCount ?? 0) || 0,
      },
    });
  } catch (err: any) {
    const status = err?.status ?? 500;
    return jsonError(status, err?.message ?? "Failed to load daily activity", err?.code, err?.details);
  }
}

/**
 * POST /api/daily-activity
 * Body should include:
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

    // Coerce counts to numbers (default 0)
    const callsCount = Number((body as any).callsCount ?? 0) || 0;
    const engagementsCount = Number((body as any).engagementsCount ?? 0) || 0;
    const appointmentsSetCount = Number((body as any).appointmentsSetCount ?? 0) || 0;
    const appointmentsHeldCount = Number((body as any).appointmentsHeldCount ?? 0) || 0;
    const contractsWrittenCount = Number((body as any).contractsWrittenCount ?? 0) || 0;

    const docId = `${uid}_${date}`;
    const ref = adminDb.collection("daily_activity").doc(docId);

    const dataToSave = {
      agentId: uid,
      date,
      callsCount,
      engagementsCount,
      appointmentsSetCount,
      appointmentsHeldCount,
      contractsWrittenCount,
      updatedAt: FieldValue.serverTimestamp(),
      updatedByUid: uid,
    };

    await ref.set(dataToSave, { merge: true });

    // return the saved shape so client can update state without re-fetch (optional but helpful)
    return NextResponse.json({
      ok: true,
      data: dataToSave,
    });
  } catch (err: any) {
    const status = err?.status ?? 500;
    return jsonError(status, err?.message ?? "Failed to save daily activity", err?.code, err?.details);
  }
}