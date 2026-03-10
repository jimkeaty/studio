import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import type {
  TeamMembership,
  TeamMembershipInput,
} from '@/lib/teams/types';

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

function buildMembershipId(
  teamId: string,
  agentId: string,
  role: 'leader' | 'member'
) {
  return `${teamId}__${agentId}__${role}`;
}

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);

    const snap = await adminDb
      .collection('teamMemberships')
      .orderBy('teamId', 'asc')
      .limit(500)
      .get();

    const memberships = snap.docs.map((doc) => doc.data());

    return NextResponse.json({
      ok: true,
      count: memberships.length,
      memberships,
    });
  } catch (err: any) {
    if (err?.message === 'UNAUTHORIZED') {
      return jsonError(401, 'Unauthorized: Missing token');
    }
    if (err?.message === 'FORBIDDEN') {
      return jsonError(403, 'Forbidden: This action is restricted to administrators.');
    }

    console.error('[API/admin/team-memberships][GET] Error:', err?.message || err);
    return jsonError(500, 'Internal Server Error', {
      message: err?.message || String(err),
    });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);

    const body = (await req.json()) as TeamMembershipInput;
    const normalized = normalizeInput(body);

    const membershipId = buildMembershipId(
      normalized.teamId,
      normalized.agentId,
      normalized.role
    );

    const ref = adminDb.collection('teamMemberships').doc(membershipId);
    const existing = await ref.get();
    if (existing.exists) {
      return jsonError(409, 'A team membership with this membershipId already exists', {
        membershipId,
      });
    }

    const now = new Date().toISOString();

    const membership: TeamMembership = {
      membershipId,
      teamId: normalized.teamId,
      agentId: normalized.agentId,
      role: normalized.role,
      memberPlanId: normalized.memberPlanId,
      effectiveStart: normalized.effectiveStart,
      effectiveEnd: normalized.effectiveEnd,
      activeFlag: normalized.activeFlag,
      createdAt: now,
      updatedAt: now,
      notes: normalized.notes,
    };

    await ref.set(membership);

    return NextResponse.json({
      ok: true,
      membership,
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

    console.error('[API/admin/team-memberships][POST] Error:', err?.message || err);
    return jsonError(500, 'Internal Server Error', {
      message: err?.message || String(err),
    });
  }
}
