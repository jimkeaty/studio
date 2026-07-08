// src/app/api/plan/route.ts
import { NextRequest, NextResponse } from "next/server";
import { admin, adminAuth, adminDb } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';

function getBearerToken(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  const match = authHeader.match(/^Bearer (.+)$/i);
  return match?.[1] ?? null;
}

/**
 * Resolve the canonical profile doc ID for a given uid.
 * The uid may be a Firebase UID (direct login) or a slug (admin viewAs).
 * We always save/read the plan under the profile doc ID so the path is
 * deterministic regardless of which UID variant is used.
 *
 * Resolution order (mirrors dashboard/route.ts):
 *   1. Direct doc lookup by uid (fastest — works when uid IS the doc ID)
 *   2. Query by agentId slug field
 *   3. Query by firebaseUid field
 *
 * Returns the profile doc ID if found, otherwise falls back to uid.
 */
async function resolveProfileDocId(uid: string): Promise<string> {
  try {
    // Strategy 1: uid IS the Firestore doc ID
    const byId = await adminDb.collection('agentProfiles').doc(uid).get();
    if (byId.exists) return byId.id;

    // Strategy 2: uid is an agentId slug
    const bySlug = await adminDb.collection('agentProfiles')
      .where('agentId', '==', uid).limit(1).get();
    if (!bySlug.empty) return bySlug.docs[0].id;

    // Strategy 3: uid is stored as firebaseUid on the profile
    const byFbUid = await adminDb.collection('agentProfiles')
      .where('firebaseUid', '==', uid).limit(1).get();
    if (!byFbUid.empty) return byFbUid.docs[0].id;
  } catch { /* non-fatal */ }

  // Fallback: use uid as-is
  return uid;
}

function planDocRef(db: FirebaseFirestore.Firestore, profileDocId: string, year: string) {
  // Canonical path: dashboards/{year}/agent/{profileDocId}/plans/plan
  return db
    .collection("dashboards")
    .doc(year)
    .collection("agent")
    .doc(profileDocId)
    .collection("plans")
    .doc("plan");
}

export async function GET(req: NextRequest) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ ok: false, error: "Missing token" }, { status: 401 });

    const decoded = await adminAuth.verifyIdToken(token);
    const callerUid = decoded.uid;

    const { searchParams } = new URL(req.url);
    const year = searchParams.get("year") || new Date().getFullYear().toString();

    // Admin can view any agent's plan via ?viewAs=uid
    const viewAs = searchParams.get("viewAs");
    const rawUid = (await isAdminLike(callerUid) && viewAs) ? viewAs : callerUid;

    // Always resolve to the profile doc ID so the path is stable
    const profileDocId = await resolveProfileDocId(rawUid);

    const ref = planDocRef(adminDb, profileDocId, year);
    const snap = await ref.get();

    // Always return defined plan object
    const plan = snap.exists ? (snap.data() ?? {}) : {};

    return NextResponse.json({ ok: true, year: Number(year), plan });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to load plan" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ ok: false, error: "Missing token" }, { status: 401 });

    const decoded = await adminAuth.verifyIdToken(token);
    const callerUid = decoded.uid;

    const body = await req.json().catch(() => ({}));
    const year = String(body?.year ?? new Date().getFullYear());
    const plan = (body?.plan ?? {}) as Record<string, any>;

    // Admin can save plan for any agent via body.viewAs
    const viewAs = body?.viewAs;
    const rawUid = (await isAdminLike(callerUid) && viewAs) ? viewAs : callerUid;

    // Always resolve to the profile doc ID so the path is stable
    const profileDocId = await resolveProfileDocId(rawUid);

    const ref = planDocRef(adminDb, profileDocId, year);

    // Build the write payload.
    // - financialStartDate / kpiStartDate: save as-is (or delete if empty)
    // - resetStartDate: always delete (deprecated field, cleared on every save)
    // - measurementMode: always delete (deprecated, replaced by dual-clock fields)
    // FieldValue.delete() is required because merge:true skips undefined keys,
    // so we need an explicit sentinel to remove fields from Firestore.
    const planToWrite: Record<string, any> = { ...plan, updatedAt: admin.firestore.FieldValue.serverTimestamp() };

    // Handle financialStartDate
    if ('financialStartDate' in plan && (plan.financialStartDate === '' || plan.financialStartDate === null)) {
      planToWrite.financialStartDate = admin.firestore.FieldValue.delete();
    }
    // Handle kpiStartDate
    if ('kpiStartDate' in plan && (plan.kpiStartDate === '' || plan.kpiStartDate === null)) {
      planToWrite.kpiStartDate = admin.firestore.FieldValue.delete();
    }
    // Always clear legacy fields
    planToWrite.resetStartDate = admin.firestore.FieldValue.delete();
    planToWrite.measurementMode = admin.firestore.FieldValue.delete();

    await ref.set(planToWrite, { merge: true });

    // Read back to guarantee defined shape
    const snap = await ref.get();
    const saved = snap.exists ? (snap.data() ?? {}) : {};

    return NextResponse.json({ ok: true, year: Number(year), plan: saved });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to save plan" },
      { status: 500 }
    );
  }
}
