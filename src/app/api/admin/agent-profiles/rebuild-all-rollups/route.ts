/**
 * POST /api/admin/agent-profiles/rebuild-all-rollups
 *
 * Rebuilds agentYearRollups for every active agent for their current
 * anniversary cycle year and the prior year.
 *
 * Returns a stream of progress updates as newline-delimited JSON so the
 * UI can show a live progress bar.
 */
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { rebuildAgentRollup } from '@/lib/rollups/rebuildAgentRollup';
import { getAnniversaryCycle } from '@/lib/agents/anniversaryCycle';

export const maxDuration = 300; // 5 minutes — allow time for large rosters

export async function POST(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let decoded: any;
  try {
    decoded = await adminAuth.verifyIdToken(token);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const allowedRoles = ['admin', 'broker', 'staff'];
  const role = decoded.role || decoded.userRole || '';
  if (!allowedRoles.includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // ── Fetch all active agents ───────────────────────────────────────────────
  const agentsSnap = await adminDb
    .collection('agentProfiles')
    .where('status', '==', 'active')
    .get();

  const agents = agentsSnap.docs.map((doc) => ({
    id: doc.id,
    data: doc.data() as any,
  }));

  const total = agents.length;
  let done = 0;
  let errors = 0;
  const errorList: { agentId: string; name: string; error: string }[] = [];

  // ── Stream progress as newline-delimited JSON ─────────────────────────────
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: object) => {
        controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));
      };

      send({ type: 'start', total });

      for (const agent of agents) {
        const { id, data } = agent;
        const displayName =
          data.displayName ||
          `${data.firstName || ''} ${data.lastName || ''}`.trim() ||
          id;

        try {
          const anniversaryMonth = Number(data.anniversaryMonth ?? 0);
          const anniversaryDay = Number(data.anniversaryDay ?? 0);
          const today = new Date();
          const currentCycle = getAnniversaryCycle(anniversaryMonth, anniversaryDay, today);
          const currentYear = currentCycle.cycleStart.getUTCFullYear();
          const priorYear = currentYear - 1;

          await rebuildAgentRollup(adminDb, id, currentYear);
          await rebuildAgentRollup(adminDb, id, priorYear);

          done++;
          send({ type: 'progress', done, total, agentId: id, name: displayName, status: 'ok' });
        } catch (err: any) {
          errors++;
          done++;
          const errMsg = err?.message || 'Unknown error';
          errorList.push({ agentId: id, name: displayName, error: errMsg });
          send({ type: 'progress', done, total, agentId: id, name: displayName, status: 'error', error: errMsg });
        }
      }

      send({ type: 'done', total, done: total, errors, errorList });
      controller.close();
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
    },
  });
}
