// src/app/api/dashboard/route.ts
import { NextRequest, NextResponse } from "next/server";
import admin from "firebase-admin";

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

type Role = "agent" | "broker" | "admin";

type DashboardApiResponse = {
  ok: true;
  uid: string;
  year: number;
  role: Role | null;
  brokerageId: string | null;
  dashboard: any | null;
  plan: any | null;
  ytdMetrics: any | null;
};

function getYearFromReq(req: NextRequest): number {
  const { searchParams } = new URL(req.url);
  const yearParam = searchParams.get("year");
  const now = new Date();
  const defaultYear = now.getFullYear();
  const year = yearParam ? parseInt(yearParam, 10) : defaultYear;
  return Number.isFinite(year) ? year : defaultYear;
}

function extractBearerToken(req: NextRequest): string | null {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  return authHeader.split("Bearer ")[1]?.trim() || null;
}

export async function GET(req: NextRequest) {
  try {
    // 1) Auth
    const idToken = extractBearerToken(req);
    if (!idToken) {
      return NextResponse.json({ error: "Unauthorized: Missing token" }, { status: 401 });
    }

    const decoded = await admin.auth().verifyIdToken(idToken);
    const uid = decoded.uid;

    const year = getYearFromReq(req);

    // 2) Load user profile (role + brokerageId)
    // Assumption based on your prior structure:
    // users/{uid} exists and contains role + brokerageId (or similar).
    // If your fields differ, we’ll adjust after we see the users doc shape.
    const userSnap = await db.collection("users").doc(uid).get();
    const userData = userSnap.exists ? userSnap.data() : null;

    const role = (userData?.role ?? null) as Role | null;
    const brokerageId = (userData?.brokerageId ?? null) as string | null;

    // 3) Load dashboard + plan docs (server-side only)
    // Based on your earlier paths:
    // dashboards/{uid}/agent/{year}
    // users/{uid}/plans/{year}
    const dashboardRef = db.collection("dashboards").doc(uid).collection("agent").doc(String(year));
    const planRef = db.collection("users").doc(uid).collection("plans").doc(String(year));

    const [dashSnap, planSnap] = await Promise.all([dashboardRef.get(), planRef.get()]);

    const dashboard = dashSnap.exists ? dashSnap.data() : null;
    const plan = planSnap.exists ? planSnap.data() : null;

    // 4) YTD Metrics (minimal + safe)
    // We’re NOT reintroducing client aggregation.
    // We’ll compute a basic YTD by querying transactions for this uid + year if those fields exist.
    //
    // If your transactions schema differs (agentId vs agentUid, etc.), we’ll adjust once we inspect it.
    let ytd: any | null = null;

    try {
      // Agent view: YTD for this user
      const txQuery = db
        .collection("transactions")
        .where("year", "==", year)
        .where("agentId", "==", uid);

      const txSnap = await txQuery.get();

      let closedCount = 0;
      let pendingCount = 0;
      let brokerProfitClosed = 0;
      let volumeClosed = 0;

      txSnap.forEach((doc) => {
        const t = doc.data() as any;

        const status = t.status;
        const dealValue = Number(t.dealValue || 0);
        const brokerProfit = Number(t.brokerProfit || 0);

        if (status === "closed") {
          closedCount++;
          brokerProfitClosed += brokerProfit;
          volumeClosed += dealValue;
        } else if (status === "pending" || status === "under_contract") {
          pendingCount++;
        }
      });

      ytd = {
        year,
        closedCount,
        pendingCount,
        brokerProfitClosed,
        volumeClosed,
      };
    } catch (e) {
      // If your schema doesn’t match yet, we don’t fail the whole dashboard.
      // We’ll tighten this after we inspect your transactions fields.
      ytd = null;
    }

    return NextResponse.json({
      ok: true,
      uid,
      year,
      role,
      brokerageId,
      dashboard,
      plan,
      ytdMetrics: ytd, // ✅ match what /dashboard/page.tsx expects
    });
  } catch (error: any) {
    if (process.env.NODE_ENV === "development") {
      console.error("[API/dashboard] Error:", { code: error.code, message: error.message });
    }
    if (error.code && String(error.code).startsWith("auth/")) {
      return NextResponse.json({ error: "Unauthorized: Invalid token" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}