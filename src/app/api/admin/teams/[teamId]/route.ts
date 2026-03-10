import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import type { TeamInput } from '@/lib/teams/types';

function extractBearer(req: NextRequest) {
  const h = req.headers.get('Authorization') || '';
  if (!h.startsWith('Bearer ')) return null;
  return h.slice('Bearer '.length).trim();
}

function jsonError(status: number, error: string, details?: unknown) {
  return NextResponse.json(
    { ok: false, error, details: details ?? null },
    { status }
  );
}

async function requireAdmin(req: NextRequest) {
  const token = extractBearer(req);
  if (!token) throw new Error('UNAUTHORIZED');

  const decoded = await adminAuth.verifyIdToken(token);
  const email = decoded.email || '';

  if (email !== 'jim@keatyrealestate.com') {
    throw new Error('FORBIDDEN');
  }

  return decoded;
}

function normalizeInput(body: TeamInput) {
  if (!body.teamName?.trim()) throw new Error('Team name is required');
  if (!body.leaderAgentId?.trim()) throw new Error('Leader agent is required');
  if (!body.teamPlanId?.trim()) throw new Error('Team plan is required');

  const status = body.status || 'active';
  if (status !== 'active' && status !== 'inactive') {
    throw new Error('Invalid team status');
  }

  return {
    teamName: body.teamName.trim(),
    leaderAgentId: body.leaderAgentId.trim(),
    teamPlanId: body.teamPlanId.trim(),
    status,
    office: body.office?.trim() || null,
    notes: body.notes?.trim() || null,
  };
}

type RouteContext = {
  params: Promise<{
    teamId: string;
  }>;
};

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    await requireAdmin(req);
    const { teamId } = await context.params;

    const ref = adminDb.collection('teams').doc(teamId);
    const snap = await ref.get();

    if (!snap.exists) {
      return jsonError(404, 'Team not found', { teamId });
    }

    return NextResponse.json({
      ok: true,
      team: snap.data(),
    });
  } catch (err: any) {
    if (err?.message === 'UNAUTHORIZED') {
      return jsonError(401, 'Unauthorized: Missing token');
    }
    if (err?.message === 'FORBIDDEN') {
      return jsonError(403, 'Forbidden: This action is restricted to administrators.');
    }

    console.error('[API/admin/teams/[teamId]][GET] Error:', err?.message || err);
    return jsonError(500, 'Internal Server Error', {
      message: err?.message || String(err),
    });
  }
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    await requireAdmin(req);
    const { teamId } = await context.params;

    const body = (await req.json()) as TeamInput;
    const normalized = normalizeInput(body);

    const ref = adminDb.collection('teams').doc(teamId);
    const existing = await ref.get();

    if (!existing.exists) {
      return jsonError(404, 'Team not found', { teamId });
    }

    const updated = {
      teamName: normalized.teamName,
      leaderAgentId: normalized.leaderAgentId,
      teamPlanId: normalized.teamPlanId,
      status: normalized.status,
      office: normalized.office,
      notes: normalized.notes,
      updatedAt: new Date().toISOString(),
    };

    await ref.update(updated);

    const fresh = await ref.get();

    return NextResponse.json({
      ok: true,
      team: fresh.data(),
    });
  } catch (err: any) {
    if (err?.message === 'UNAUTHORIZED') {
      return jsonError(401, 'Unauthorized: Missing token');
    }
    if (err?.message === 'FORBIDDEN') {
      return jsonError(403, 'Forbidden: This action is restricted to administrators.');
    }
    if (
      err?.message?.includes('required') ||
      err?.message === 'Invalid team status'
    ) {
      return jsonError(400, err.message);
    }

    console.error('[API/admin/teams/[teamId]][PATCH] Error:', err?.message || err);
    return jsonError(500, 'Internal Server Error', {
      message: err?.message || String(err),
    });
  }
}
