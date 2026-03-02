// src/app/api/dashboard/route.ts
import { NextRequest, NextResponse } from "next/server";
import admin from "firebase-admin";

// --- Firebase Admin Initialization ---
if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId: "smart-broker-usa",
    });
  } catch (error) {
    console.error("Firebase admin initialization error", error);
  }
}
const db = admin.firestore();

// --- API Helpers ---
function extractBearerToken(req: NextRequest): string | null {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  return authHeader.split("Bearer ")[1]?.trim() || null;
}

function jsonError(status: number, error: string, details?: any) {
    return NextResponse.json({ ok: false, error, details: details || null }, { status });
}

// --- Route Handler ---
export async function GET(req: NextRequest) {
  const year = 2026; // Hardcoded to 2026 per requirements

  try {
    // 1. Authenticate Token
    const idToken = extractBearerToken(req);
    if (!idToken) {
      return jsonError(401, "Unauthorized: Missing token");
    }
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const { uid, email, name } = decodedToken;

    // 2. Upsert User Profile
    const userRef = db.collection("users").doc(uid);
    const userSnap = await userRef.get();
    
    const dataToSet: { email?: string, name?: string, updatedAt: any, createdAt?: any } = {
        email,
        name,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (!userSnap.exists) {
        dataToSet.createdAt = admin.firestore.FieldValue.serverTimestamp();
    }
    await userRef.set(dataToSet, { merge: true });

    // Re-fetch the potentially updated user document
    const updatedUserSnap = await userRef.get();
    const userData = updatedUserSnap.data();

    // 3. Check for linked agentId
    const agentId = userData?.agentId;
    if (!agentId) {
      return NextResponse.json({
        ok: true,
        needsLink: true,
        year: year,
      });
    }

    // 4. Fetch the agent's yearly rollup document
    const rollupDocId = `${agentId}_${year}`;
    const rollupRef = db.collection('agentYearRollups').doc(rollupDocId);
    const rollupSnap = await rollupRef.get();
    const rollupData = rollupSnap.exists ? rollupSnap.data() : null;

    // 5. Return the successful response
    return NextResponse.json({
      ok: true,
      year: year,
      agentId: agentId,
      rollupDocId: rollupDocId,
      rollup: rollupData,
    });

  } catch (error: any) {
    console.error("[API/dashboard] Error:", {
      code: error?.code,
      message: error?.message,
    });

    if (error?.code?.startsWith("auth/")) {
      return jsonError(401, `Unauthorized: ${error.message}`);
    }

    return jsonError(500, "Internal Server Error", { message: error.message });
  }
}
