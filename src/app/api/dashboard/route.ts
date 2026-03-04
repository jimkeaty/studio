// src/app/api/dashboard/route.ts
import { NextRequest, NextResponse } from "next/server";
import admin from "firebase-admin";

import type { AgentDashboardData } from "@/lib/types";
import { mockAgentDashboardData } from "@/lib/mock-data";

function getBearerToken(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  const match = authHeader.match(/^Bearer (.+)$/i);
  return match?.[1] ?? null;
}

function initAdmin() {
  if (admin.apps.length) return admin.app();

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("Missing Firebase Admin env vars");
  }

  return admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });
}

// Keep consistent with /api/plan
function planDocRef(db: FirebaseFirestore.Firestore, uid: string, year: string) {
  return db
    .collection("dashboards")
    .doc(year)
    .doc("agent")
    .collection("users")
    .doc(uid)
    .collection("plans")
    .doc("plan");
}

function parseYear(req: NextRequest): string {
  const { searchParams } = new URL(req.url);
  const year = searchParams.get("year") || "2025";
  const n = Number(year);
  if (!Number.isFinite(n) || n < 2000 || n > 2100) return "2025";
  return String(n);
}

export async function GET(req: NextRequest) {
  try {
    initAdmin();

    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ ok: false, error: "Missing token" }, { status: 401 });

    const decoded = await admin.auth().verifyIdToken(token);
    const uid = decoded.uid;

    const year = parseYear(req);
    const db = admin.firestore();

    // Load plan (safe default {} like /api/plan)
    const planSnap = await planDocRef(db, uid, year).get();
    const plan = planSnap.exists ? (planSnap.data() ?? {}) : {};

    // TEMP: return a valid AgentDashboardData so the UI renders again
    // (We will replace this with real calculated values once data wiring is finalized.)
    const dashboard: AgentDashboardData = {
      ...mockAgentDashboardData,
      userId: uid,
    };

    // ytdMetrics is optional in the UI; keep it null until we wire it
    const ytdMetrics = null;

    return NextResponse.json({
      ok: true,
      year: Number(year),
      dashboard,
      plan,
      ytdMetrics,
      // debug helpers (harmless)
      note: "TEMP: dashboard is mockAgentDashboardData (server). Plan is loaded from Firestore if it exists.",
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to load dashboard" },
      { status: 500 }
    );
  }
}
