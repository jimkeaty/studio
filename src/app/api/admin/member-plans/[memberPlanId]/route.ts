import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import type {
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

type RouteContext = {
  params: Promise<{
    memberPlanId: string;
  }>;
};

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    await requireAdmin(req);
    const { memberPlanId } = await context.params;

    const ref = adminDb.collection('memberPlans').doc(memberPlanId);
    const snap = await ref.get();

    if (!snap.exists) {
      return jsonError(404, 'Member plan not found', { memberPlanId });
    }

    return NextResponse.json({
      ok: true,
      memberPlan: snap.data(),
    });
  } catch (err: any) {
    if (err?.message === 'UNAUTHORIZED') {
      return jsonError(401, 'Unauthorized: Missing token');
    }
    if (err?.message === 'FORBIDDEN') {
      return jsonError(403, 'Forbidden: This action is restricted to administrators.');
    }

    console.error('[API/admin/member-plans/[memberPlanId]][GET] Error:', err?.message || err);
    return jsonError(500, 'Internal Server Error', {
      message: err?.message || String(err),
    });
  }
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    await requireAdmin(req);
    const { memberPlanId } = await context.params;

    const body = (await req.json()) as MemberPlanInput;
    const normalized = normalizeInput(body);

    const ref = adminDb.collection('memberPlans').doc(memberPlanId);
    const existing = await ref.get();

    if (!existing.exists) {
      return jsonError(404, 'Member plan not found', { memberPlanId });
    }

    const updated = {
      teamId: normalized.teamId,
      agentId: normalized.agentId,
      planName: normalized.planName,
      status: normalized.status,
      thresholdMetric: normalized.thresholdMetric,
      thresholdMarkers: normalized.thresholdMarkers,
      payoutBands: normalized.payoutBands,
      notes: normalized.notes,
      updatedAt: new Date().toISOString(),
    };

    await ref.update(updated);

    const fresh = await ref.get();

    return NextResponse.json({
      ok: true,
      memberPlan: fresh.data(),
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

    console.error('[API/admin/member-plans/[memberPlanId]][PATCH] Error:', err?.message || err);
    return jsonError(500, 'Internal Server Error', {
      message: err?.message || String(err),
    });
  }
}
