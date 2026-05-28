import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import type {
  CommissionModelType,
  MemberPlanBand,
  TeamFixedSplit,
  TeamPlan,
  TeamPlanInput,
  TeamThresholdBand,
} from '@/lib/teams/types';
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

function normalizeThresholdMarkers(markers: number[]) {
  if (!Array.isArray(markers) || markers.length === 0) {
    throw new Error('Threshold markers are required');
  }

  const normalized = markers.map((value) => Number(value));

  for (const value of normalized) {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error('Invalid threshold marker');
    }
  }

  for (let i = 1; i < normalized.length; i += 1) {
    if (normalized[i] < normalized[i - 1]) {
      throw new Error('Threshold markers must be in ascending order');
    }
  }

  return normalized;
}

function normalizeLeaderStructureBand(
  band: TeamThresholdBand,
  index: number
): TeamThresholdBand {
  const fromCompanyDollar = Number(band.fromCompanyDollar);
  const toCompanyDollar =
    band.toCompanyDollar === null ||
    band.toCompanyDollar === undefined ||
    String(band.toCompanyDollar) === ''
      ? null
      : Number(band.toCompanyDollar);
  const leaderPercent = Number(band.leaderPercent);
  const companyPercent = Number(band.companyPercent);

  if (!Number.isFinite(fromCompanyDollar) || fromCompanyDollar < 0) {
    throw new Error(`Invalid fromCompanyDollar in leader structure band ${index + 1}`);
  }

  if (toCompanyDollar !== null && (!Number.isFinite(toCompanyDollar) || toCompanyDollar < 0)) {
    throw new Error(`Invalid toCompanyDollar in leader structure band ${index + 1}`);
  }

  if (!Number.isFinite(leaderPercent) || leaderPercent < 0 || leaderPercent > 100) {
    throw new Error(`Invalid leaderPercent in leader structure band ${index + 1}`);
  }

  if (!Number.isFinite(companyPercent) || companyPercent < 0 || companyPercent > 100) {
    throw new Error(`Invalid companyPercent in leader structure band ${index + 1}`);
  }

  if (leaderPercent + companyPercent !== 100) {
    throw new Error(`Leader and company split must total 100 in leader structure band ${index + 1}`);
  }

  return {
    fromCompanyDollar,
    toCompanyDollar,
    leaderPercent,
    companyPercent,
  };
}

function normalizeMemberDefaultBand(
  band: MemberPlanBand,
  index: number
): MemberPlanBand {
  const fromCompanyDollar = Number(band.fromCompanyDollar);
  const toCompanyDollar =
    band.toCompanyDollar === null ||
    band.toCompanyDollar === undefined ||
    String(band.toCompanyDollar) === ''
      ? null
      : Number(band.toCompanyDollar);
  const memberPercent = Number(band.memberPercent);

  if (!Number.isFinite(fromCompanyDollar) || fromCompanyDollar < 0) {
    throw new Error(`Invalid fromCompanyDollar in member default band ${index + 1}`);
  }

  if (toCompanyDollar !== null && (!Number.isFinite(toCompanyDollar) || toCompanyDollar < 0)) {
    throw new Error(`Invalid toCompanyDollar in member default band ${index + 1}`);
  }

  if (!Number.isFinite(memberPercent) || memberPercent < 0 || memberPercent > 100) {
    throw new Error(`Invalid memberPercent in member default band ${index + 1}`);
  }

  return {
    fromCompanyDollar,
    toCompanyDollar,
    memberPercent,
  };
}

function normalizeInput(body: TeamPlanInput) {
  if (!body.teamId?.trim()) throw new Error('Team id is required');
  if (!body.planName?.trim()) throw new Error('Plan name is required');

  const status = body.status || 'active';
  if (status !== 'active' && status !== 'inactive') {
    throw new Error('Invalid team plan status');
  }

  // Commission Model Type
  const commissionModelType: CommissionModelType =
    body.commissionModelType === 'fixed' ? 'fixed' : 'tiered';

  let fixedSplit: TeamFixedSplit | null = null;
  if (commissionModelType === 'fixed') {
    const agentPercent = Number(body.fixedSplit?.agentPercent ?? 0);
    const companyPercent = Number(body.fixedSplit?.companyPercent ?? 0);
    if (!Number.isFinite(agentPercent) || agentPercent < 0 || agentPercent > 100) {
      throw new Error('Fixed split agent percent must be between 0 and 100');
    }
    if (!Number.isFinite(companyPercent) || companyPercent < 0 || companyPercent > 100) {
      throw new Error('Fixed split company percent must be between 0 and 100');
    }
    if (agentPercent + companyPercent !== 100) {
      throw new Error('Fixed split agent and company percents must total 100');
    }
    fixedSplit = { agentPercent, companyPercent };
  }

  const thresholdMetric = body.thresholdMetric || 'companyDollar';
  if (thresholdMetric !== 'companyDollar') {
    throw new Error('Invalid threshold metric');
  }

  const structureModel = body.structureModel || 'leaderFirst';
  if (structureModel !== 'leaderFirst') {
    throw new Error('Invalid structure model');
  }

  const structureType: import('@/lib/teams/types').TeamStructureType =
    body.structureType === 'no_leader' ? 'no_leader' : 'with_leader';

  // Bands are still required (used as fallback even for fixed plans; may be empty arrays for fixed)
  if (!Array.isArray(body.leaderStructureBands)) {
    throw new Error('Leader structure bands must be an array');
  }
  if (!Array.isArray(body.memberDefaultBands)) {
    throw new Error('Member default bands must be an array');
  }

  const tierCreditRules = body.tierCreditRules || {
    memberGetsFullCompanyDollar: true,
    leaderGetsFullCompanyDollar: true,
    teamGetsFullCompanyDollar: true,
  };

  const anniversaryCycleRules = body.anniversaryCycleRules || {
    cycleType: 'anniversary' as const,
  };

  if (anniversaryCycleRules.cycleType !== 'anniversary') {
    throw new Error('Invalid anniversary cycle rule');
  }

  return {
    teamId: body.teamId.trim(),
    planName: body.planName.trim(),
    status,
    structureType,
    commissionModelType,
    fixedSplit,
    thresholdMetric,
    thresholdMarkers: normalizeThresholdMarkers(body.thresholdMarkers),
    structureModel,
    leaderStructureBands: body.leaderStructureBands.map(normalizeLeaderStructureBand),
    memberDefaultBands: body.memberDefaultBands.map(normalizeMemberDefaultBand),
    tierCreditRules: {
      memberGetsFullCompanyDollar: Boolean(tierCreditRules.memberGetsFullCompanyDollar),
      leaderGetsFullCompanyDollar: Boolean(tierCreditRules.leaderGetsFullCompanyDollar),
      teamGetsFullCompanyDollar: Boolean(tierCreditRules.teamGetsFullCompanyDollar),
    },
    anniversaryCycleRules,
    notes: body.notes?.trim() || null,
  };
}

function slugifyTeamPlanId(teamId: string, planName: string) {
  const slug = `${teamId}-${planName}`
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug;
}

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);

    const [plansSnap, teamsSnap, membershipsSnap] = await Promise.all([
      adminDb.collection('teamPlans').orderBy('planName', 'asc').limit(500).get(),
      adminDb.collection('teams').limit(500).get(),
      adminDb.collection('teamMemberships').where('activeFlag', '==', true).limit(2000).get(),
    ]);

    const teamPlans = plansSnap.docs.map((doc) => doc.data());

    // Build lookup: teamPlanId → team(s) that reference it
    const teamsByPlanId: Record<string, { teamId: string; teamName: string; teamStatus: string }[]> = {};
    for (const doc of teamsSnap.docs) {
      const t = doc.data();
      if (t.teamPlanId) {
        if (!teamsByPlanId[t.teamPlanId]) teamsByPlanId[t.teamPlanId] = [];
        teamsByPlanId[t.teamPlanId].push({ teamId: t.teamId, teamName: t.teamName, teamStatus: t.status || 'active' });
      }
    }

    // Build lookup: teamId → active member count
    const memberCountByTeamId: Record<string, number> = {};
    for (const doc of membershipsSnap.docs) {
      const m = doc.data();
      if (m.teamId) {
        memberCountByTeamId[m.teamId] = (memberCountByTeamId[m.teamId] || 0) + 1;
      }
    }

    // Build lookup: teamId → all planIds referencing it (to detect duplicates)
    const planIdsByTeamId: Record<string, string[]> = {};
    for (const plan of teamPlans) {
      const tid = (plan as any).teamId;
      if (tid) {
        if (!planIdsByTeamId[tid]) planIdsByTeamId[tid] = [];
        planIdsByTeamId[tid].push((plan as any).teamPlanId);
      }
    }

    // Annotate each plan with usage info
    const annotatedPlans = teamPlans.map((plan) => {
      const p = plan as any;
      const usedByTeams = teamsByPlanId[p.teamPlanId] || [];
      const totalAgents = usedByTeams.reduce((sum, t) => sum + (memberCountByTeamId[t.teamId] || 0), 0);
      const isDuplicate = (planIdsByTeamId[p.teamId] || []).length > 1;
      return {
        ...p,
        _usedByTeams: usedByTeams,
        _totalAgents: totalAgents,
        _isDuplicate: isDuplicate,
      };
    });

    return NextResponse.json({
      ok: true,
      count: annotatedPlans.length,
      teamPlans: annotatedPlans,
    });
  } catch (err: any) {
    if (err?.message === 'UNAUTHORIZED') {
      return jsonError(401, 'Unauthorized: Missing token');
    }
    if (err?.message === 'FORBIDDEN') {
      return jsonError(403, 'Forbidden: This action is restricted to administrators.');
    }

    console.error('[API/admin/team-plans][GET] Error:', err?.message || err);
    return jsonError(500, 'Internal Server Error', {
      message: err?.message || String(err),
    });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);

    const body = (await req.json()) as TeamPlanInput;
    const normalized = normalizeInput(body);

    const teamPlanId = slugifyTeamPlanId(normalized.teamId, normalized.planName);
    if (!teamPlanId) {
      return jsonError(400, 'Could not derive a valid teamPlanId');
    }

    const ref = adminDb.collection('teamPlans').doc(teamPlanId);
    const existing = await ref.get();
    if (existing.exists) {
      return jsonError(409, 'A team plan with this teamPlanId already exists', {
        teamPlanId,
      });
    }

    const now = new Date().toISOString();

    const teamPlan: TeamPlan = {
      teamPlanId,
      teamId: normalized.teamId,
      planName: normalized.planName,
      status: normalized.status,
      structureType: normalized.structureType,
      commissionModelType: normalized.commissionModelType,
      fixedSplit: normalized.fixedSplit,
      thresholdMetric: normalized.thresholdMetric,
      thresholdMarkers: normalized.thresholdMarkers,
      structureModel: normalized.structureModel,
      leaderStructureBands: normalized.leaderStructureBands,
      memberDefaultBands: normalized.memberDefaultBands,
      tierCreditRules: normalized.tierCreditRules,
      anniversaryCycleRules: normalized.anniversaryCycleRules,
      createdAt: now,
      updatedAt: now,
      notes: normalized.notes,
    };

    await ref.set(teamPlan);

    return NextResponse.json({
      ok: true,
      teamPlan,
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
      err?.message?.includes('must total 100') ||
      err?.message?.includes('ascending order')
    ) {
      return jsonError(400, err.message);
    }

    console.error('[API/admin/team-plans][POST] Error:', err?.message || err);
    return jsonError(500, 'Internal Server Error', {
      message: err?.message || String(err),
    });
  }
}
