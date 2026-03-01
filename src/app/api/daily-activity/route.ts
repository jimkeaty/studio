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
    throw Object.assign(new Error("Missing Authorization bearer token"), { status: 401, code: "auth/missing-bearer" });
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

/**
 * GET /api/daily-activity?date=YYYY-MM-DD
 * Returns daily_activity doc for the signed-in user for that date.
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

    if (!snap.exists) {
      // Return a predictable shape so the UI can render without special-casing.
      return NextResponse.json({
        ok: true,
        data: null,
      });
    }

    return NextResponse.json({
      ok: true,
      data: snap.data(),
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

    const date = body.date;
    if (!date || typeof date !== "string") {
      return jsonError(400, "Missing or invalid field: date", "bad_request/missing-date");
    }

    // Coerce counts to numbers (default 0)
    const callsCount = Number(body.callsCount ?? 0) || 0;
    const engagementsCount = Number(body.engagementsCount ?? 0) || 0;
    const appointmentsSetCount = Number(body.appointmentsSetCount ?? 0) || 0;
    const appointmentsHeldCount = Number(body.appointmentsHeldCount ?? 0) || 0;
    const contractsWrittenCount = Number(body.contractsWrittenCount ?? 0) || 0;

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

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    const status = err?.status ?? 500;
    return jsonError(status, err?.message ?? "Failed to save daily activity", err?.code, err?.details);
  }
}
