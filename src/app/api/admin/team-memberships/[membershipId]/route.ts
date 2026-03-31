import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import type { TeamMembershipInput } from '@/lib/teams/types';
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

function isValidDateOnly(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function normalizeInput(body: TeamMembershipInput) {
  if (!body.teamId?.trim()) throw new Error('Team id is required');
  if (!body.agentId?.trim()) throw new Error('Agent id is required');
  if (!body.role) throw new Error('Membership role is required');
  if (!body.effectiveStart?.trim()) throw new Error('Effective start is required');

  if (body.role !== 'leader' && body.role !== 'member') {
    throw new Error('Invalid membership role');
  }

  const effectiveStart = body.effectiveStart.trim();
  if (!isValidDateOnly(effectiveStart)) {
    throw new Error('Effective start must be YYYY-MM-DD');
  }

  const effectiveEnd =
    body.effectiveEnd === null || body.effectiveEnd === undefined || body.effectiveEnd === ''
      ? null
      : String(body.effectiveEnd).trim();

  if (effectiveEnd !== null && !isValidDateOnly(effectiveEnd)) {
    throw new Error('Effective end must be YYYY-MM-DD');
  }

  return {
    teamId: body.teamId.trim(),
    agentId: body.agentId.trim(),
    role: body.role,
    memberPlanId: body.memberPlanId?.trim() || null,
    effectiveStart,
    effectiveEnd,
    activeFlag: body.activeFlag ?? true,
    notes: body.notes?.trim() || null,
  };
}

type RouteContext = {
  params: Promise<{
    membershipId: string;
  }>;
};

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    await requireAdmin(req);
    const { membershipId } = await context.params;

    const ref = adminDb.collection('teamMemberships').doc(membershipId);
    const snap = await ref.get();

    if (!snap.exists) {
      return jsonError(404, 'Team membership not found', { membershipId });
    }

    return NextResponse.json({
      ok: true,
      membership: snap.data(),
    });
  } catch (err: any) {
    if (err?.message === 'UNAUTHORIZED') {
      return jsonError(401, 'Unauthorized: Missing token');
    }
    if (err?.message === 'FORBIDDEN') {
      return jsonError(403, 'Forbidden: This action is restricted to administrators.');
    }

    console.error('[API/admin/team-memberships/[membershipId]][GET] Error:', err?.message || err);
    return jsonError(500, 'Internal Server Error', {
      message: err?.message || String(err),
    });
  }
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    await requireAdmin(req);
    const { membershipId } = await context.params;

    const body = (await req.json()) as TeamMembershipInput;
    const normalized = normalizeInput(body);

    const ref = adminDb.collection('teamMemberships').doc(membershipId);
    const existing = await ref.get();

    if (!existing.exists) {
      return jsonError(404, 'Team membership not found', { membershipId });
    }

    const updated = {
      teamId: normalized.teamId,
      agentId: normalized.agentId,
      role: normalized.role,
      memberPlanId: normalized.memberPlanId,
      effectiveStart: normalized.effectiveStart,
      effectiveEnd: normalized.effectiveEnd,
      activeFlag: normalized.activeFlag,
      notes: normalized.notes,
      updatedAt: new Date().toISOString(),
    };

    await ref.update(updated);

    const fresh = await ref.get();

    return NextResponse.json({
      ok: true,
      membership: fresh.data(),
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
      err?.message?.includes('Invalid') ||
      err?.message?.includes('must be YYYY-MM-DD')
    ) {
      return jsonError(400, err.message);
    }

    console.error('[API/admin/team-memberships/[membershipId]][PATCH] Error:', err?.message || err);
    return jsonError(500, 'Internal Server Error', {
      message: err?.message || String(err),
    });
  }
}
