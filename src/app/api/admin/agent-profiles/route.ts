import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { deriveAnniversary } from '@/lib/agents/deriveAnniversary';
import type { AgentProfile, AgentProfileInput, AgentTier } from '@/lib/agents/types';

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

function slugifyAgentId(displayName: string) {
  return displayName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeTier(tier: AgentTier, index: number): AgentTier {
  const tierName = String(tier.tierName || `Tier ${index + 1}`).trim();
  const fromCompanyDollar = Number(tier.fromCompanyDollar);
  const toCompanyDollar =
    tier.toCompanyDollar === null || tier.toCompanyDollar === undefined || tier.toCompanyDollar === ''
      ? null
      : Number(tier.toCompanyDollar);
  const agentSplitPercent = Number(tier.agentSplitPercent);
  const companySplitPercent = Number(tier.companySplitPercent);
  const notes = tier.notes?.trim() || null;

  if (!Number.isFinite(fromCompanyDollar) || fromCompanyDollar < 0) {
    throw new Error(`Invalid fromCompanyDollar in ${tierName}`);
  }
  if (toCompanyDollar !== null && (!Number.isFinite(toCompanyDollar) || toCompanyDollar < 0)) {
    throw new Error(`Invalid toCompanyDollar in ${tierName}`);
  }
  if (!Number.isFinite(agentSplitPercent) || agentSplitPercent < 0 || agentSplitPercent > 100) {
    throw new Error(`Invalid agentSplitPercent in ${tierName}`);
  }
  if (!Number.isFinite(companySplitPercent) || companySplitPercent < 0 || companySplitPercent > 100) {
    throw new Error(`Invalid companySplitPercent in ${tierName}`);
  }

  return {
    tierName,
    fromCompanyDollar,
    toCompanyDollar,
    agentSplitPercent,
    companySplitPercent,
    notes,
  };
}

function normalizeInput(body: AgentProfileInput) {
  if (!body.firstName?.trim()) throw new Error('First name is required');
  if (!body.lastName?.trim()) throw new Error('Last name is required');
  if (!body.displayName?.trim()) throw new Error('Display name is required');
  if (!body.startDate?.trim()) throw new Error('Start date is required');
  if (!body.status) throw new Error('Status is required');
  if (!body.agentType) throw new Error('Agent type is required');

  const isIndividualAgent =
    body.agentType === 'CGL' || body.agentType === 'SGL';
  const isTeamAgent =
    body.agentType === 'TeamMember' || body.agentType === 'TeamLeader';

  if (isIndividualAgent && (!Array.isArray(body.tiers) || body.tiers.length === 0)) {
    throw new Error('At least one tier is required for CGL and SGL agents');
  }

  if (isTeamAgent && !body.primaryTeamId?.trim()) {
    throw new Error('Primary team is required for team-based agents');
  }

  const teamRole =
    body.agentType === 'TeamLeader'
      ? 'leader'
      : body.agentType === 'TeamMember'
      ? 'member'
      : null;

  const defaultPlanType =
    body.agentType === 'TeamLeader'
      ? 'teamLeader'
      : body.agentType === 'TeamMember'
      ? 'teamMember'
      : 'individual';

  const defaultPlanId =
    isTeamAgent ? body.defaultPlanId?.trim() || null : null;

  if (isTeamAgent && !defaultPlanId) {
    throw new Error('Default plan is required for team-based agents');
  }

  return {
    firstName: body.firstName.trim(),
    lastName: body.lastName.trim(),
    displayName: body.displayName.trim(),
    email: body.email?.trim() || null,
    office: body.office?.trim() || null,
    status: body.status,
    startDate: body.startDate.trim(),

    agentType: body.agentType,
    progressionMetric: 'companyDollar' as const,

    primaryTeamId: isTeamAgent ? body.primaryTeamId?.trim() || null : null,
    teamRole,
    defaultPlanType,
    defaultPlanId,

    tiers: isIndividualAgent ? (body.tiers || []).map(normalizeTier) : [],
    notes: body.notes?.trim() || null,
  };
}

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);

    const snap = await adminDb
      .collection('agentProfiles')
      .orderBy('displayName', 'asc')
      .limit(500)
      .get();

    const agents = snap.docs.map((doc) => doc.data());

    return NextResponse.json({
      ok: true,
      count: agents.length,
      agents,
    });
  } catch (err: any) {
    if (err?.message === 'UNAUTHORIZED') {
      return jsonError(401, 'Unauthorized: Missing token');
    }
    if (err?.message === 'FORBIDDEN') {
      return jsonError(403, 'Forbidden: This action is restricted to administrators.');
    }

    console.error('[API/admin/agent-profiles][GET] Error:', err?.message || err);
    return jsonError(500, 'Internal Server Error', {
      message: err?.message || String(err),
    });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);

    const body = (await req.json()) as AgentProfileInput;
    const normalized = normalizeInput(body);
    const { anniversaryMonth, anniversaryDay } = deriveAnniversary(normalized.startDate);

    const agentId = slugifyAgentId(normalized.displayName);
    if (!agentId) {
      return jsonError(400, 'Could not derive a valid agentId from display name');
    }

    const ref = adminDb.collection('agentProfiles').doc(agentId);
    const existing = await ref.get();
    if (existing.exists) {
      return jsonError(409, 'An agent profile with this agentId already exists', {
        agentId,
      });
    }

    const now = new Date().toISOString();

    const profile: AgentProfile = {
      agentId,
      firstName: normalized.firstName,
      lastName: normalized.lastName,
      displayName: normalized.displayName,
      email: normalized.email,
      office: normalized.office,
      status: normalized.status,
      startDate: normalized.startDate,
      anniversaryMonth,
      anniversaryDay,
      agentType: normalized.agentType,
      progressionMetric: normalized.progressionMetric,
      primaryTeamId: normalized.primaryTeamId,
      teamRole: normalized.teamRole,
      defaultPlanType: normalized.defaultPlanType,
      defaultPlanId: normalized.defaultPlanId,
      tiers: normalized.tiers,
      notes: normalized.notes,
      createdAt: now,
      updatedAt: now,
    };

    await ref.set(profile);

    return NextResponse.json({
      ok: true,
      agent: profile,
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
      err?.message === 'Invalid startDate' ||
      err?.message?.includes('Invalid ')
    ) {
      return jsonError(400, err.message);
    }

    console.error('[API/admin/agent-profiles][POST] Error:', err?.message || err);
    return jsonError(500, 'Internal Server Error', {
      message: err?.message || String(err),
    });
  }
}
