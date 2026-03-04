// src/app/api/plan/route.ts
import { NextRequest, NextResponse } from "next/server";
import { admin, adminAuth, adminDb } from '@/lib/firebase/admin';

function getBearerToken(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  const match = authHeader.match(/^Bearer (.+)$/i);
  return match?.[1] ?? null;
}

function planDocRef(db: FirebaseFirestore.Firestore, uid: string, year: string) {
  // Keep this consistent with your dashboard server route pattern:
  // dashboards/{year}/agent/users/{uid}/plans/plan
  return db
    .collection("dashboards")
    .doc(year)
    .collection("agent")
    .doc(uid)
    .collection("plans")
    .doc("plan");
}

export async function GET(req: NextRequest) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ ok: false, error: "Missing token" }, { status: 401 });

    const decoded = await adminAuth.verifyIdToken(token);
    const uid = decoded.uid;

    const { searchParams } = new URL(req.url);
    const year = searchParams.get("year") || new Date().getFullYear().toString();

    const ref = planDocRef(adminDb, uid, year);
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
    const uid = decoded.uid;

    const body = await req.json().catch(() => ({}));
    const year = String(body?.year ?? new Date().getFullYear());
    const plan = (body?.plan ?? {}) as Record<string, any>;

    const ref = planDocRef(adminDb, uid, year);

    await ref.set(
      { ...plan, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );

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
