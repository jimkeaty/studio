
// src/app/api/dashboard/route.ts
import { NextRequest, NextResponse } from "next/server";
import admin from "firebase-admin";

// Correct initialization for App Hosting environment
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
}

function getBearerToken(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  const match = authHeader.match(/^Bearer (.+)$/i);
  return match?.[1] ?? null;
}

export async function GET(req: NextRequest) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ ok: false, error: "Missing token" }, { status: 401 });

    const decoded = await admin.auth().verifyIdToken(token);
    const { uid, email, name } = decoded;

    const db = admin.firestore();
    const userRef = db.collection('users').doc(uid);

    // Upsert basic user profile info on every dashboard load.
    // This is a simple way to keep profiles fresh without a dedicated webhook.
    await userRef.set(
      {
        email: email || null,
        name: name || null,
        lastSeen: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    
    const userSnap = await userRef.get();
    const agentId = userSnap.data()?.agentId;

    const year = '2026';

    if (!agentId) {
      return NextResponse.json({ ok: true, needsLink: true, year: Number(year) });
    }
    
    const rollupDocId = `${agentId}_${year}`;
    const rollupRef = db.collection('agentYearRollups').doc(rollupDocId);
    const rollupSnap = await rollupRef.get();
    const rollupData = rollupSnap.exists ? rollupSnap.data() : null;

    return NextResponse.json({
      ok: true,
      year: Number(year),
      agentId,
      rollupDocId,
      rollup: rollupData,
    });

  } catch (e: any) {
    console.error('[API/dashboard] Error:', e);
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to load dashboard" },
      { status: 500 }
    );
  }
}
