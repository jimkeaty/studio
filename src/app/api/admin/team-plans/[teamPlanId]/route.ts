import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import type {
  CommissionModelType,
  MemberPlanBand,
  TeamFixedSplit,
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

type RouteContext = {
  params: Promise<{
    teamPlanId: string;
  }>;
};

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    await requireAdmin(req);
    const { teamPlanId } = await context.params;

    const ref = adminDb.collection('teamPlans').doc(teamPlanId);
    const snap = await ref.get();

    if (!snap.exists) {
      return jsonError(404, 'Team plan not found', { teamPlanId });
    }

    return NextResponse.json({
      ok: true,
      teamPlan: snap.data(),
    });
  } catch (err: any) {
    if (err?.message === 'UNAUTHORIZED') {
      return jsonError(401, 'Unauthorized: Missing token');
    }
    if (err?.message === 'FORBIDDEN') {
      return jsonError(403, 'Forbidden: This action is restricted to administrators.');
    }

    console.error('[API/admin/team-plans/[teamPlanId]][GET] Error:', err?.message || err);
    return jsonError(500, 'Internal Server Error', {
      message: err?.message || String(err),
    });
  }
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    await requireAdmin(req);
    const { teamPlanId } = await context.params;

    const body = (await req.json()) as TeamPlanInput;
    const normalized = normalizeInput(body);

    const ref = adminDb.collection('teamPlans').doc(teamPlanId);
    const existing = await ref.get();

    if (!existing.exists) {
      return jsonError(404, 'Team plan not found', { teamPlanId });
    }

    const updated = {
      teamId: normalized.teamId,
      planName: normalized.planName,
      status: normalized.status,
      commissionModelType: normalized.commissionModelType,
      fixedSplit: normalized.fixedSplit,
      thresholdMetric: normalized.thresholdMetric,
      thresholdMarkers: normalized.thresholdMarkers,
      structureModel: normalized.structureModel,
      leaderStructureBands: normalized.leaderStructureBands,
      memberDefaultBands: normalized.memberDefaultBands,
      tierCreditRules: normalized.tierCreditRules,
      anniversaryCycleRules: normalized.anniversaryCycleRules,
      notes: normalized.notes,
      updatedAt: new Date().toISOString(),
    };

    await ref.update(updated);

    const fresh = await ref.get();

    return NextResponse.json({
      ok: true,
      teamPlan: fresh.data(),
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

    console.error('[API/admin/team-plans/[teamPlanId]][PATCH] Error:', err?.message || err);
    return jsonError(500, 'Internal Server Error', {
      message: err?.message || String(err),
    });
  }
}
