import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import type {
  TeamPlan,
  TeamPlanInput,
  TeamThresholdBand,
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
    band.toCompanyDollar === ''
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

function normalizeInput(body: TeamPlanInput) {
  if (!body.teamId?.trim()) throw new Error('Team id is required');
  if (!body.planName?.trim()) throw new Error('Plan name is required');

  const status = body.status || 'active';
  if (status !== 'active' && status !== 'inactive') {
    throw new Error('Invalid team plan status');
  }

  const thresholdMetric = body.thresholdMetric || 'companyDollar';
  if (thresholdMetric !== 'companyDollar') {
    throw new Error('Invalid threshold metric');
  }

  const structureModel = body.structureModel || 'leaderFirst';
  if (structureModel !== 'leaderFirst') {
    throw new Error('Invalid structure model');
  }

  if (!Array.isArray(body.leaderStructureBands) || body.leaderStructureBands.length === 0) {
    throw new Error('Leader structure bands are required');
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
    thresholdMetric,
    thresholdMarkers: normalizeThresholdMarkers(body.thresholdMarkers),
    structureModel,
    leaderStructureBands: body.leaderStructureBands.map(normalizeLeaderStructureBand),
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

    const snap = await adminDb
      .collection('teamPlans')
      .orderBy('planName', 'asc')
      .limit(500)
      .get();

    const teamPlans = snap.docs.map((doc) => doc.data());

    return NextResponse.json({
      ok: true,
      count: teamPlans.length,
      teamPlans,
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
      thresholdMetric: normalized.thresholdMetric,
      thresholdMarkers: normalized.thresholdMarkers,
      structureModel: normalized.structureModel,
      leaderStructureBands: normalized.leaderStructureBands,
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
