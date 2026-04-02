// src/app/api/daily-activity/range/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';
import type { DailyActivity } from '@/lib/types';


// --- API Helpers ---
function jsonError(status: number, error: string, code?: string) {
  return NextResponse.json(
    { ok: false, error, code: code ?? `http_${status}` },
    { status }
  );
}

async function requireUser(req: NextRequest): Promise<{ uid: string }> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw Object.assign(new Error('Missing Authorization bearer token'), {
      status: 401,
      code: 'auth/missing-bearer',
    });
  }

  const token = authHeader.slice('Bearer '.length);
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    return { uid: decoded.uid };
  } catch (err: any) {
    throw Object.assign(new Error('Invalid or expired token'), {
      status: 401,
      code: 'auth/invalid-token',
      details: err?.code,
    });
  }
}

/**
 * Resolve all possible agentId values for a given uid.
 * Handles bulk imports stored under a slug vs Firebase UID.
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
      const profileBySlugSnap = await adminDb
        .collection('agentProfiles')
        .where('agentId', '==', uid)
        .limit(1)
        .get();
      if (!profileBySlugSnap.empty) {
        ids.add(profileBySlugSnap.docs[0].id);
        const d = profileBySlugSnap.docs[0].data();
        if (d?.firebaseUid) ids.add(String(d.firebaseUid));
      }
    }
  } catch {
    // Non-fatal — fall back to single uid
  }
  return Array.from(ids);
}

// --- Route Handler ---
export async function GET(req: NextRequest) {
  try {
    const { uid: callerUid } = await requireUser(req);
    const { searchParams } = new URL(req.url);
    const start = searchParams.get('start');
    const end = searchParams.get('end');
    const viewAs = searchParams.get('viewAs');
    const uid = (await isAdminLike(callerUid) && viewAs) ? viewAs : callerUid;

    if (!start || !end) {
      return jsonError(400, 'Missing required query params: start, end');
    }

    // Resolve all possible agentId values to handle bulk imports stored under slugs
    const agentIdList = await resolveAgentIds(uid);

    // Query daily_activity for ALL resolved agentId values and merge by date
    const allSnaps = await Promise.all(
      agentIdList.map(agentIdVal =>
        adminDb
          .collection('daily_activity')
          .where('agentId', '==', agentIdVal)
          .where('date', '>=', start)
          .where('date', '<=', end)
          .get()
          .catch(e => {
            console.warn('[daily-activity/range] query failed for agentId=' + agentIdVal, e);
            return null;
          })
      )
    );

    // Merge results — take the higher value for each numeric field per date
    const activitiesByDate: Record<string, DailyActivity & { id: string; date: string }> = {};
    for (const snap of allSnaps) {
      if (!snap) continue;
      snap.forEach((doc) => {
        const data = doc.data() as DailyActivity & { date: string };
        const date = data.date;
        if (!date) return;
        if (!activitiesByDate[date]) {
          activitiesByDate[date] = { id: doc.id, ...data };
        } else {
          const existing = activitiesByDate[date];
          activitiesByDate[date] = {
            ...existing,
            callsCount: Math.max(Number(existing.callsCount ?? 0), Number(data.callsCount ?? 0)),
            engagementsCount: Math.max(Number(existing.engagementsCount ?? 0), Number(data.engagementsCount ?? 0)),
            appointmentsSetCount: Math.max(Number(existing.appointmentsSetCount ?? 0), Number(data.appointmentsSetCount ?? 0)),
            appointmentsHeldCount: Math.max(Number(existing.appointmentsHeldCount ?? 0), Number(data.appointmentsHeldCount ?? 0)),
            contractsWrittenCount: Math.max(Number(existing.contractsWrittenCount ?? 0), Number(data.contractsWrittenCount ?? 0)),
          };
        }
      });
    }

    // ── Overlay appointment counts from the appointments collection ──────────
    // Pipeline appointments (bulk-uploaded or manually added) are stored in the
    // appointments collection, not in daily_activity. We query them here and
    // overlay the counts so the KPI tracker reflects the real pipeline data.
    try {
      const apptSnaps = await Promise.all(
        agentIdList.map(agentIdVal =>
          adminDb
            .collection('appointments')
            .where('agentId', '==', agentIdVal)
            .where('date', '>=', start)
            .where('date', '<=', end)
            .get()
            .catch(() => null)
        )
      );

      // Count set and held appointments per date
      const apptSetByDate: Record<string, number> = {};
      const apptHeldByDate: Record<string, number> = {};
      const seenApptIds = new Set<string>();

      for (const snap of apptSnaps) {
        if (!snap) continue;
        for (const doc of snap.docs) {
          if (seenApptIds.has(doc.id)) continue;
          seenApptIds.add(doc.id);
          const d = doc.data();
          const apptDate = d.date as string;
          if (!apptDate) continue;
          if (d.pipelineStatus === 'trash') continue; // ignore trashed
          apptSetByDate[apptDate] = (apptSetByDate[apptDate] ?? 0) + 1;
          if (d.pipelineStatus === 'held') {
            apptHeldByDate[apptDate] = (apptHeldByDate[apptDate] ?? 0) + 1;
          }
        }
      }

      // Merge into activitiesByDate — use the higher of the two sources
      const allDates = new Set([
        ...Object.keys(activitiesByDate),
        ...Object.keys(apptSetByDate),
      ]);
      for (const apptDate of allDates) {
        const pipelineSet = apptSetByDate[apptDate] ?? 0;
        const pipelineHeld = apptHeldByDate[apptDate] ?? 0;
        if (activitiesByDate[apptDate]) {
          activitiesByDate[apptDate].appointmentsSetCount = Math.max(
            Number(activitiesByDate[apptDate].appointmentsSetCount ?? 0),
            pipelineSet
          );
          activitiesByDate[apptDate].appointmentsHeldCount = Math.max(
            Number(activitiesByDate[apptDate].appointmentsHeldCount ?? 0),
            pipelineHeld
          );
        } else if (pipelineSet > 0) {
          // Date exists in appointments but not in daily_activity — create a synthetic entry
          activitiesByDate[apptDate] = {
            id: `appt_${apptDate}`,
            date: apptDate,
            callsCount: 0,
            engagementsCount: 0,
            appointmentsSetCount: pipelineSet,
            appointmentsHeldCount: pipelineHeld,
            contractsWrittenCount: 0,
          } as any;
        }
      }
    } catch {
      // Non-fatal — fall back to daily_activity values only
    }

    return NextResponse.json({ ok: true, activities: activitiesByDate });
  } catch (err: any) {
    return jsonError(
      err.status ?? 500,
      err.message ?? 'Failed to load activity range',
      err.code
    );
  }
}
