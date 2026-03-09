import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { deriveAnniversary } from '@/lib/agents/deriveAnniversary';
import type { AgentProfileInput } from '@/lib/agents/types';

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
  if (!token) {
    throw new Error('UNAUTHORIZED');
  }

  const decoded = await adminAuth.verifyIdToken(token);
  const email = decoded.email || '';

  if (email !== 'jim@keatyrealestate.com') {
    throw new Error('FORBIDDEN');
  }

  return decoded;
}

function normalizeInput(body: AgentProfileInput) {
  if (!body.firstName?.trim()) throw new Error('First name is required');
  if (!body.lastName?.trim()) throw new Error('Last name is required');
  if (!body.displayName?.trim()) throw new Error('Display name is required');
  if (!body.startDate?.trim()) throw new Error('Start date is required');
  if (!body.status) throw new Error('Status is required');
  if (!body.compType) throw new Error('Comp type is required');

  return {
    firstName: body.firstName.trim(),
    lastName: body.lastName.trim(),
    displayName: body.displayName.trim(),
    email: body.email?.trim() || null,
    office: body.office?.trim() || null,
    status: body.status,
    startDate: body.startDate.trim(),
    compType: body.compType,
    defaultSplitPlanId: body.defaultSplitPlanId?.trim() || null,
    hasCustomSplitOverride: Boolean(body.hasCustomSplitOverride),
    notes: body.notes?.trim() || null,
  };
}

type RouteContext = {
  params: Promise<{
    agentId: string;
  }>;
};

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    await requireAdmin(req);
    const { agentId } = await context.params;

    const ref = adminDb.collection('agentProfiles').doc(agentId);
    const snap = await ref.get();

    if (!snap.exists) {
      return jsonError(404, 'Agent profile not found', { agentId });
    }

    return NextResponse.json({
      ok: true,
      agent: snap.data(),
    });
  } catch (err: any) {
    if (err?.message === 'UNAUTHORIZED') {
      return jsonError(401, 'Unauthorized: Missing token');
    }
    if (err?.message === 'FORBIDDEN') {
      return jsonError(403, 'Forbidden: This action is restricted to administrators.');
    }

    console.error('[API/admin/agent-profiles/[agentId]][GET] Error:', err?.message || err);
    return jsonError(500, 'Internal Server Error', {
      message: err?.message || String(err),
    });
  }
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    await requireAdmin(req);
    const { agentId } = await context.params;

    const body = (await req.json()) as AgentProfileInput;
    const normalized = normalizeInput(body);
    const { anniversaryMonth, anniversaryDay } = deriveAnniversary(
      normalized.startDate
    );

    const ref = adminDb.collection('agentProfiles').doc(agentId);
    const existing = await ref.get();

    if (!existing.exists) {
      return jsonError(404, 'Agent profile not found', { agentId });
    }

    const updated = {
      firstName: normalized.firstName,
      lastName: normalized.lastName,
      displayName: normalized.displayName,
      email: normalized.email,
      office: normalized.office,
      status: normalized.status,
      startDate: normalized.startDate,
      anniversaryMonth,
      anniversaryDay,
      compType: normalized.compType,
      defaultSplitPlanId: normalized.defaultSplitPlanId,
      hasCustomSplitOverride: normalized.hasCustomSplitOverride,
      notes: normalized.notes,
      updatedAt: new Date().toISOString(),
    };

    await ref.update(updated);

    const fresh = await ref.get();

    return NextResponse.json({
      ok: true,
      agent: fresh.data(),
    });
  } catch (err: any) {
    if (err?.message === 'UNAUTHORIZED') {
      return jsonError(401, 'Unauthorized: Missing token');
    }
    if (err?.message === 'FORBIDDEN') {
      return jsonError(403, 'Forbidden: This action is restricted to administrators.');
    }
    if (err?.message?.includes('required') || err?.message === 'Invalid startDate') {
      return jsonError(400, err.message);
    }

    console.error('[API/admin/agent-profiles/[agentId]][PATCH] Error:', err?.message || err);
    return jsonError(500, 'Internal Server Error', {
      message: err?.message || String(err),
    });
  }
}
