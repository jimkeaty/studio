import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import type {
  MemberPlan,
  MemberPlanBand,
  MemberPlanInput,
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

function normalizePayoutBand(
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
    throw new Error(`Invalid fromCompanyDollar in payout band ${index + 1}`);
  }

  if (toCompanyDollar !== null && (!Number.isFinite(toCompanyDollar) || toCompanyDollar < 0)) {
    throw new Error(`Invalid toCompanyDollar in payout band ${index + 1}`);
  }

  if (!Number.isFinite(memberPercent) || memberPercent < 0 || memberPercent > 100) {
    throw new Error(`Invalid memberPercent in payout band ${index + 1}`);
  }

  return {
    fromCompanyDollar,
    toCompanyDollar,
    memberPercent,
  };
}

function normalizeInput(body: MemberPlanInput) {
  if (!body.teamId?.trim()) throw new Error('Team id is required');
  if (!body.agentId?.trim()) throw new Error('Agent id is required');
  if (!body.planName?.trim()) throw new Error('Plan name is required');

  const status = body.status || 'active';
  if (status !== 'active' && status !== 'inactive') {
    throw new Error('Invalid member plan status');
  }

  const thresholdMetric = body.thresholdMetric || 'companyDollar';
  if (thresholdMetric !== 'companyDollar') {
    throw new Error('Invalid threshold metric');
  }

  if (!Array.isArray(body.payoutBands) || body.payoutBands.length === 0) {
    throw new Error('Payout bands are required');
  }

  return {
    teamId: body.teamId.trim(),
    agentId: body.agentId.trim(),
    planName: body.planName.trim(),
    status,
    thresholdMetric,
    thresholdMarkers: normalizeThresholdMarkers(body.thresholdMarkers),
    payoutBands: body.payoutBands.map(normalizePayoutBand),
    notes: body.notes?.trim() || null,
  };
}

function slugifyMemberPlanId(teamId: string, agentId: string, planName: string) {
  return `${teamId}-${agentId}-${planName}`
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);

    const snap = await adminDb
      .collection('memberPlans')
      .orderBy('planName', 'asc')
      .limit(500)
      .get();

    const memberPlans = snap.docs.map((doc) => doc.data());

    return NextResponse.json({
      ok: true,
      count: memberPlans.length,
      memberPlans,
    });
  } catch (err: any) {
    if (err?.message === 'UNAUTHORIZED') {
      return jsonError(401, 'Unauthorized: Missing token');
    }
    if (err?.message === 'FORBIDDEN') {
      return jsonError(403, 'Forbidden: This action is restricted to administrators.');
    }

    console.error('[API/admin/member-plans][GET] Error:', err?.message || err);
    return jsonError(500, 'Internal Server Error', {
      message: err?.message || String(err),
    });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);

    const body = (await req.json()) as MemberPlanInput;
    const normalized = normalizeInput(body);

    const memberPlanId = slugifyMemberPlanId(
      normalized.teamId,
      normalized.agentId,
      normalized.planName
    );

    if (!memberPlanId) {
      return jsonError(400, 'Could not derive a valid memberPlanId');
    }

    const ref = adminDb.collection('memberPlans').doc(memberPlanId);
    const existing = await ref.get();
    if (existing.exists) {
      return jsonError(409, 'A member plan with this memberPlanId already exists', {
        memberPlanId,
      });
    }

    const now = new Date().toISOString();

    const memberPlan: MemberPlan = {
      memberPlanId,
      teamId: normalized.teamId,
      agentId: normalized.agentId,
      planName: normalized.planName,
      status: normalized.status,
      thresholdMetric: normalized.thresholdMetric,
      thresholdMarkers: normalized.thresholdMarkers,
      payoutBands: normalized.payoutBands,
      createdAt: now,
      updatedAt: now,
      notes: normalized.notes,
    };

    await ref.set(memberPlan);

    return NextResponse.json({
      ok: true,
      memberPlan,
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
      err?.message?.includes('ascending order')
    ) {
      return jsonError(400, err.message);
    }

    console.error('[API/admin/member-plans][POST] Error:', err?.message || err);
    return jsonError(500, 'Internal Server Error', {
      message: err?.message || String(err),
    });
  }
}
