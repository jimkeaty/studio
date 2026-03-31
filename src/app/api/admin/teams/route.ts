import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { slugifyTeamId } from '@/lib/teams/slugifyTeamId';
import type { Team, TeamInput } from '@/lib/teams/types';
import { isAdminLike } from '@/lib/auth/staffAccess';

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

  if (!(await isAdminLike(decoded.uid))) {
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

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);

    const snap = await adminDb
      .collection('teams')
      .orderBy('teamName', 'asc')
      .limit(500)
      .get();

    const teams = snap.docs.map((doc) => doc.data());

    return NextResponse.json({
      ok: true,
      count: teams.length,
      teams,
    });
  } catch (err: any) {
    if (err?.message === 'UNAUTHORIZED') {
      return jsonError(401, 'Unauthorized: Missing token');
    }
    if (err?.message === 'FORBIDDEN') {
      return jsonError(403, 'Forbidden: This action is restricted to administrators.');
    }

    console.error('[API/admin/teams][GET] Error:', err?.message || err);
    return jsonError(500, 'Internal Server Error', {
      message: err?.message || String(err),
    });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);

    const body = (await req.json()) as TeamInput;
    const normalized = normalizeInput(body);

    const teamId = slugifyTeamId(normalized.teamName);
    if (!teamId) {
      return jsonError(400, 'Could not derive a valid teamId from team name');
    }

    const ref = adminDb.collection('teams').doc(teamId);
    const existing = await ref.get();
    if (existing.exists) {
      return jsonError(409, 'A team with this teamId already exists', {
        teamId,
      });
    }

    const now = new Date().toISOString();

    const team: Team = {
      teamId,
      teamName: normalized.teamName,
      leaderAgentId: normalized.leaderAgentId,
      teamPlanId: normalized.teamPlanId,
      status: normalized.status,
      office: normalized.office,
      createdAt: now,
      updatedAt: now,
      notes: normalized.notes,
    };

    await ref.set(team);

    return NextResponse.json({
      ok: true,
      team,
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

    console.error('[API/admin/teams][POST] Error:', err?.message || err);
    return jsonError(500, 'Internal Server Error', {
      message: err?.message || String(err),
    });
  }
}
