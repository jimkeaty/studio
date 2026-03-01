import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminDb } from "@/lib/firebase/admin"; // or wherever your admin db helper lives
import { verifyBearerToken } from "@/lib/auth/verifyBearerToken"; // reuse your dashboard helper

const GetSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const PostSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  calls: z.number().int().nonnegative().optional(),
  engagements: z.number().int().nonnegative().optional(),
  appointmentsSet: z.number().int().nonnegative().optional(),
  appointmentsHeld: z.number().int().nonnegative().optional(),
  contractsWritten: z.number().int().nonnegative().optional(),
});

function num(v: unknown, fallback = 0) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function sanitize(doc: any) {
  return {
    agentId: String(doc?.agentId ?? ""),
    date: String(doc?.date ?? ""),
    callsCount: num(doc?.callsCount, 0),
    engagementsCount: num(doc?.engagementsCount, 0),
    appointmentsSetCount: num(doc?.appointmentsSetCount, 0),
    appointmentsHeldCount: num(doc?.appointmentsHeldCount, 0),
    contractsWrittenCount: num(doc?.contractsWrittenCount, 0),
    updatedByUid: typeof doc?.updatedByUid === "string" ? doc.updatedByUid : null,
    updatedAt: doc?.updatedAt ?? null,
  };
}

export async function GET(req: Request) {
  try {
    const { uid } = await verifyBearerToken(req);

    const url = new URL(req.url);
    const parsed = GetSchema.safeParse({ date: url.searchParams.get("date") });

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "Invalid query", code: "BAD_REQUEST", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { date } = parsed.data;
    const docId = `${uid}_${date}`;

    const db = getAdminDb();
    const snap = await db.collection("daily_activity").doc(docId).get();

    const dailyActivity = snap.exists
      ? sanitize(snap.data())
      : sanitize({
          agentId: uid,
          date,
          callsCount: 0,
          engagementsCount: 0,
          appointmentsSetCount: 0,
          appointmentsHeldCount: 0,
          contractsWrittenCount: 0,
        });

    return NextResponse.json({ ok: true, date, docId, dailyActivity });
  } catch (err: any) {
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to load daily activity",
        code: err?.code ?? "INTERNAL",
        details: err?.message ?? String(err),
      },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const { uid } = await verifyBearerToken(req);

    const body = await req.json().catch(() => ({}));
    const parsed = PostSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "Invalid body", code: "BAD_REQUEST", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { date } = parsed.data;
    const docId = `${uid}_${date}`;

    const db = getAdminDb();

    // match your existing field names exactly
    const now = new Date().toISOString();
    const toSave = {
      agentId: uid,
      date,
      callsCount: num(parsed.data.calls, 0),
      engagementsCount: num(parsed.data.engagements, 0),
      appointmentsSetCount: num(parsed.data.appointmentsSet, 0),
      appointmentsHeldCount: num(parsed.data.appointmentsHeld, 0),
      contractsWrittenCount: num(parsed.data.contractsWritten, 0),
      updatedByUid: uid,
      // use Firestore server timestamp via Admin SDK
      updatedAt: (await import("firebase-admin")).default.firestore.FieldValue.serverTimestamp(),
      // if you want createdAt, we can add it safely later
    };

    await db.collection("daily_activity").doc(docId).set(toSave, { merge: true });

    const snap = await db.collection("daily_activity").doc(docId).get();

    return NextResponse.json({ ok: true, date, docId, dailyActivity: sanitize(snap.data()) });
  } catch (err: any) {
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to save daily activity",
        code: err?.code ?? "INTERNAL",
        details: err?.message ?? String(err),
      },
      { status: 500 }
    );
  }
}
