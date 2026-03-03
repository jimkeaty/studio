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

function parseYear(req: NextRequest): number | NextResponse {
  const url = new URL(req.url);
  const rawYear = url.searchParams.get("year") || "2025";
  const year = Number(rawYear);

  if (!Number.isFinite(year) || year < 2000 || year > 2100) {
    return jsonError(400, "Invalid year");
  }
  return year;
}

// --- Route Handler ---
export async function GET(req: NextRequest) {
  const parsed = parseYear(req);
  if (parsed instanceof NextResponse) return parsed;
  const year = parsed;

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

    const dataToSet: { email?: string; name?: string; updatedAt: any; createdAt?: any } = {
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
        year,
      });
    }

    // Helper to fetch rollup by docId
    const fetchRollup = async (agentIdToUse: string, yearToUse: number) => {
      const rollupDocId = `${agentIdToUse}_${yearToUse}`;
      const rollupRef = db.collection("agentYearRollups").doc(rollupDocId);
      const snap = await rollupRef.get();
      return { exists: snap.exists, rollupDocId, data: snap.exists ? snap.data() : null };
    };

    // 4. Fetch requested year rollup
    const primary = await fetchRollup(agentId, year);

    // 4B. Fallback: if missing and year != 2025, try 2025
    if (!primary.exists && year !== 2025) {
      const fallbackYear = 2025;
      const fallback = await fetchRollup(agentId, fallbackYear);

      if (fallback.exists) {
        return NextResponse.json({
          ok: true,
          year: fallbackYear,
          requestedYear: year,
          agentId,
          rollupDocId: fallback.rollupDocId,
          rollup: fallback.data,
          note: `No rollup for ${year}; fell back to ${fallbackYear}.`,
        });
      }
    }

    // 5. Return response (even if rollup missing)
    return NextResponse.json({
      ok: true,
      year,
      agentId,
      rollupDocId: primary.rollupDocId,
      rollup: primary.data,
      missingRollup: !primary.exists,
      expectedDocId: primary.rollupDocId,
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
