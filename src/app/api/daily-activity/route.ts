// src/app/api/daily-activity/route.ts
import { NextResponse } from "next/server";
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';

import { FieldValue, DocumentData } from "firebase-admin/firestore";
import { differenceInDays } from "date-fns";


function jsonError(status: number, error: string, code?: string, details?: unknown) {
  return NextResponse.json(
    { ok: false, error, code: code ?? `http_${status}`, details: details ?? null },
    { status }
  );
}

async function requireUser(req: Request): Promise<{ uid: string; role: string }> {
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
    const userSnap = await adminDb.collection("users").doc(decoded.uid).get();
    const role = userSnap.exists ? (userSnap.data() as DocumentData).role : "agent";
    return { uid: decoded.uid, role };
  } catch (err: any) {
    throw Object.assign(new Error("Invalid or expired token"), {
      status: 401,
      code: "auth/invalid-token",
      details: err?.message ?? String(err),
    });
  }
}

/**
 * Resolve all possible agentId values for a given uid.
 * Handles documents stored under Firebase UID, agentId slug, or profile docId.
 * Mirrors the same logic in the range route for consistency.
 */
async function resolveAgentIds(uid: string): Promise<string[]> {
  const ids = new Set<string>([uid]);
  try {
    const profileByIdSnap = await adminDb.collection('agentProfiles').doc(uid).get();
    if (profileByIdSnap.exists) {
      const d = profileByIdSnap.data();
      if (d?.agentId) ids.add(String(d.agentId));
      if (d?.firebaseUid) ids.add(String(d.firebaseUid));
    } else {
      // uid might be a slug — look up by agentId field
      const profileBySlugSnap = await adminDb
        .collection('agentProfiles')
        .where('agentId', '==', uid)
        .limit(1)
        .get();
      if (!profileBySlugSnap.empty) {
        ids.add(profileBySlugSnap.docs[0].id);
        const d = profileBySlugSnap.docs[0].data();
        if (d?.firebaseUid) ids.add(String(d.firebaseUid));
        if (d?.agentId) ids.add(String(d.agentId));
      }
    }
  } catch {
    // Non-fatal — fall back to single uid
  }
  return Array.from(ids);
}

/**
 * Prevent saving future dates.
 * - All users can edit any past date (no rolling lock window)
 * - Future dates are still blocked
 */
function isDateEditable(dateStr: string, _role: string): boolean {
  const date = new Date(dateStr + "T00:00:00");
  const today = new Date();

  const diff = differenceInDays(
    new Date(today.getFullYear(), today.getMonth(), today.getDate()),
    new Date(date.getFullYear(), date.getMonth(), date.getDate())
  );

  // Only block future dates (diff < 0); all past dates are editable
  return diff >= 0;
}

function emptyDailyActivity(date: string) {
  return {
    date,
    callsCount: 0,
    engagementsCount: 0,
    appointmentsSetCount: 0,
    appointmentsHeldCount: 0,
    contractsWrittenCount: 0,
    notes: "",
    startTime: "",
    endTime: "",
  };
}

function toNumberOrZero(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function GET(req: Request) {
  try {
    const { uid: callerUid } = await requireUser(req);
    const url = new URL(req.url);
    const date = url.searchParams.get("date");
    const viewAs = url.searchParams.get("viewAs");
    const uid = (await isAdminLike(callerUid) && viewAs) ? viewAs : callerUid;

    if (!date) {
      return jsonError(400, "Missing required query param: date", "bad_request/missing-date");
    }

    // ── Resolve all possible document IDs for this agent ────────────────────
    // Documents may be stored under the Firebase UID, the agentId slug, or the
    // profile docId — depending on how the data was originally imported or saved.
    // We try all resolved IDs and merge the results (taking the max per field),
    // matching the same logic used in the range endpoint.
    const agentIdList = await resolveAgentIds(uid);

    // Fetch all possible daily_activity documents for this date
    const docSnaps = await Promise.all(
      agentIdList.map(agentIdVal =>
        adminDb.collection("daily_activity").doc(`${agentIdVal}_${date}`).get().catch(() => null)
      )
    );

    // Merge results — take the higher value for each numeric field
    let dailyActivity = emptyDailyActivity(date);
    let foundAny = false;
    for (const snap of docSnaps) {
      if (!snap?.exists) continue;
      foundAny = true;
      const data = snap.data() ?? {};
      dailyActivity = {
        ...dailyActivity,
        // Prefer non-empty string fields from the first found document
        notes: dailyActivity.notes || String(data.notes ?? ""),
        startTime: dailyActivity.startTime || String(data.startTime ?? ""),
        endTime: dailyActivity.endTime || String(data.endTime ?? ""),
        // Take the max of numeric fields across all matching documents
        callsCount: Math.max(dailyActivity.callsCount, toNumberOrZero(data.callsCount)),
        engagementsCount: Math.max(dailyActivity.engagementsCount, toNumberOrZero(data.engagementsCount)),
        appointmentsSetCount: Math.max(dailyActivity.appointmentsSetCount, toNumberOrZero(data.appointmentsSetCount)),
        appointmentsHeldCount: Math.max(dailyActivity.appointmentsHeldCount, toNumberOrZero(data.appointmentsHeldCount)),
        contractsWrittenCount: Math.max(dailyActivity.contractsWrittenCount, toNumberOrZero(data.contractsWrittenCount)),
      };
    }
    // If no document found, dailyActivity stays as the empty default
    void foundAny;

    // ── Overlay appointment counts from the appointments collection ──────────
    // This ensures pipeline appointments (bulk-uploaded or manually added) are
    // reflected in the KPI tracker numbers for the matching date.
    try {
      // Query appointments for this date across all resolved agentIds
      const apptSnaps = await Promise.all(
        agentIdList.map(aid =>
          adminDb.collection('appointments').where('agentId', '==', aid).where('date', '==', date).get().catch(() => null)
        )
      );

      let apptSetFromPipeline = 0;
      let apptHeldFromPipeline = 0;
      const seenIds = new Set<string>();
      for (const snap of apptSnaps) {
        if (!snap) continue;
        for (const doc of snap.docs) {
          if (seenIds.has(doc.id)) continue;
          seenIds.add(doc.id);
          const d = doc.data();
          if (d.pipelineStatus === 'trash') continue; // ignore trashed
          apptSetFromPipeline++;
          if (d.pipelineStatus === 'held') apptHeldFromPipeline++;
        }
      }

      // Use the higher of the two sources so manual edits aren't overwritten
      dailyActivity.appointmentsSetCount = Math.max(dailyActivity.appointmentsSetCount, apptSetFromPipeline);
      dailyActivity.appointmentsHeldCount = Math.max(dailyActivity.appointmentsHeldCount, apptHeldFromPipeline);
    } catch {
      // Non-fatal — fall back to daily_activity values only
    }

    return NextResponse.json({ ok: true, dailyActivity });
  } catch (err: any) {
    const status = err?.status ?? 500;
    return jsonError(status, err?.message ?? "Failed to load daily activity", err?.code, err?.details);
  }
}

export async function POST(req: Request) {
  try {
    const { uid: callerUid, role } = await requireUser(req);

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return jsonError(400, "Invalid JSON body", "bad_request/invalid-json");
    }

    // Admin can write on behalf of any agent via body.viewAs
    const viewAs = (body as any).viewAs;
    const uid = (await isAdminLike(callerUid) && viewAs) ? viewAs : callerUid;

    const date = (body as any).date;
    if (!date || typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return jsonError(400, "Missing or invalid field: date", "bad_request/missing-date");
    }

    // Admin impersonating uses admin role privileges for edit window
    const effectiveRole = await isAdminLike(callerUid) ? "admin" : role;
    if (!isDateEditable(date, effectiveRole)) {
      return jsonError(403, "Edits are locked after 45 days.", "edit_window_expired");
    }

    // ✅ Accept BOTH shapes:
    // 1) { date, callsCount, engagementsCount, ... }
    // 2) { date, dailyActivity: { callsCount, engagementsCount, ... }, notes? }
    const payload =
      (body as any).dailyActivity && typeof (body as any).dailyActivity === "object"
        ? (body as any).dailyActivity
        : body;

    // ── Find the canonical document to write to ──────────────────────────────
    // If a document already exists under a slug or alternate ID, write to that
    // document to avoid creating a duplicate. Fall back to {uid}_{date}.
    const agentIdList = await resolveAgentIds(uid);
    let canonicalDocId = `${uid}_${date}`;
    try {
      for (const agentIdVal of agentIdList) {
        const candidateId = `${agentIdVal}_${date}`;
        const candidateSnap = await adminDb.collection("daily_activity").doc(candidateId).get();
        if (candidateSnap.exists) {
          canonicalDocId = candidateId;
          break;
        }
      }
    } catch {
      // Non-fatal — fall back to uid-keyed doc
    }

    const ref = adminDb.collection("daily_activity").doc(canonicalDocId);

    const dataToSave: Record<string, any> = {
      agentId: uid,
      date,
      callsCount: toNumberOrZero((payload as any).callsCount),
      engagementsCount: toNumberOrZero((payload as any).engagementsCount),
      appointmentsSetCount: toNumberOrZero((payload as any).appointmentsSetCount),
      appointmentsHeldCount: toNumberOrZero((payload as any).appointmentsHeldCount),
      contractsWrittenCount: toNumberOrZero((payload as any).contractsWrittenCount),
      // notes can be top-level or inside payload; support both
      notes: String((body as any).notes ?? (payload as any).notes ?? ""),
      // Start/End time tracking (optional HH:mm strings)
      startTime: String((payload as any).startTime ?? (body as any).startTime ?? ""),
      endTime: String((payload as any).endTime ?? (body as any).endTime ?? ""),
      updatedAt: FieldValue.serverTimestamp(), // ✅ keep storing server timestamp
      updatedByUid: uid,
    };

    await ref.set(dataToSave, { merge: true });

    // ✅ Don't return the serverTimestamp sentinel to the client
    return NextResponse.json({
      ok: true,
      dailyActivity: {
        ...emptyDailyActivity(date),
        ...dataToSave,
        updatedAt: null,
      },
    });
  } catch (err: any) {
    const status = err?.status ?? 500;
    return jsonError(status, err?.message ?? "Failed to save daily activity", err?.code, err?.details);
  }
}
