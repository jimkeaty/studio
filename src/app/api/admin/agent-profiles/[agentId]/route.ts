import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { deriveAnniversary } from '@/lib/agents/deriveAnniversary';
import type { AgentProfileInput, AgentTier, TeamMemberCompMode, TeamMemberOverrideBand } from '@/lib/agents/types';
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
  const email = decoded.email || '';

  if (!(await isAdminLike(decoded.uid))) {
    throw new Error('FORBIDDEN');
  }

  return decoded;
}

function normalizeTier(tier: AgentTier, index: number): AgentTier {
  const tierName = String(tier.tierName || `Tier ${index + 1}`).trim();
  const fromCompanyDollar = Number(tier.fromCompanyDollar);
  const toCompanyDollar =
    tier.toCompanyDollar === null || tier.toCompanyDollar === undefined || String(tier.toCompanyDollar) === ''
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

  const transactionFee =
    tier.transactionFee != null && Number.isFinite(Number(tier.transactionFee))
      ? Number(tier.transactionFee)
      : null;
  const capAmount =
    tier.capAmount != null && Number.isFinite(Number(tier.capAmount))
      ? Number(tier.capAmount)
      : null;

  return {
    tierName,
    fromCompanyDollar,
    toCompanyDollar,
    agentSplitPercent,
    companySplitPercent,
    transactionFee,
    capAmount,
    notes,
  };
}

function normalizeTeamMemberOverrideBand(
  tier: TeamMemberOverrideBand,
  index: number
): TeamMemberOverrideBand {
  const tierName = String(tier.tierName || `Tier ${index + 1}`).trim();
  const fromCompanyDollar = Number(tier.fromCompanyDollar);
  const toCompanyDollar =
    tier.toCompanyDollar === null || tier.toCompanyDollar === undefined || String(tier.toCompanyDollar) === ''
      ? null
      : Number(tier.toCompanyDollar);
  const memberPercent = Number(tier.memberPercent);
  const notes = tier.notes?.trim() || null;

  if (!Number.isFinite(fromCompanyDollar) || fromCompanyDollar < 0) {
    throw new Error(`Invalid fromCompanyDollar in ${tierName}`);
  }
  if (toCompanyDollar !== null && (!Number.isFinite(toCompanyDollar) || toCompanyDollar < 0)) {
    throw new Error(`Invalid toCompanyDollar in ${tierName}`);
  }
  if (!Number.isFinite(memberPercent) || memberPercent < 0 || memberPercent > 100) {
    throw new Error(`Invalid memberPercent in ${tierName}`);
  }

  return {
    tierName,
    fromCompanyDollar,
    toCompanyDollar,
    memberPercent,
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

  const isIndependent = body.agentType === 'independent';
  const isTeamAgent = body.agentType === 'team';

  // Tiers are now stored on ALL agents (team-default or custom)
  // so we no longer require tiers only for independent agents

  if (isTeamAgent && !body.primaryTeamId?.trim()) {
    throw new Error('Primary team is required for team agents');
  }

  if (isTeamAgent && !body.teamRole) {
    throw new Error('Team role is required for team agents');
  }

  if (isTeamAgent && body.teamRole !== 'leader' && body.teamRole !== 'member') {
    throw new Error('Invalid team role');
  }

  const defaultPlanType =
    isIndependent
      ? 'individual'
      : body.teamRole === 'leader'
      ? 'teamLeader'
      : 'teamMember';

  const defaultPlanId =
    isTeamAgent ? body.defaultPlanId?.trim() || null : null;

  const teamMemberCompMode: TeamMemberCompMode =
    isTeamAgent && body.teamRole === 'member'
      ? body.teamMemberCompMode === 'custom'
        ? 'custom'
        : 'teamDefault'
      : 'teamDefault';

  const teamMemberOverrideBands =
    isTeamAgent && body.teamRole === 'member' && teamMemberCompMode === 'custom'
      ? (body.teamMemberOverrideBands || []).map(normalizeTeamMemberOverrideBand)
      : [];

  if (isTeamAgent && body.teamRole === 'member' && teamMemberCompMode === 'custom' && teamMemberOverrideBands.length === 0) {
    throw new Error('At least one custom team member tier is required');
  }

  const referringAgentId = body.referringAgentId?.trim() || null;
  const referringAgentDisplayNameSnapshot =
    body.referringAgentDisplayNameSnapshot?.trim() || null;

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
    teamRole: isTeamAgent ? body.teamRole || null : null,
    defaultPlanType,
    defaultPlanId,
    teamMemberCompMode,
    teamMemberOverrideBands,

    referringAgentId,
    referringAgentDisplayNameSnapshot,

    teamGroup: body.teamGroup?.trim() || null,
    commissionMode: body.commissionMode === 'custom' ? 'custom' : 'team_default',
    tiers: (body.tiers || []).map(normalizeTier),
    defaultTransactionFee:
      body.defaultTransactionFee != null && Number.isFinite(Number(body.defaultTransactionFee))
        ? Number(body.defaultTransactionFee)
        : null,
    gracePeriodEnabled: body.gracePeriodEnabled === true,
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
    const { anniversaryMonth, anniversaryDay } = deriveAnniversary(normalized.startDate);

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
      agentType: normalized.agentType,
      progressionMetric: normalized.progressionMetric,
      primaryTeamId: normalized.primaryTeamId,
      teamRole: normalized.teamRole,
      defaultPlanType: normalized.defaultPlanType,
      defaultPlanId: normalized.defaultPlanId,
      teamMemberCompMode: normalized.teamMemberCompMode,
      teamMemberOverrideBands: normalized.teamMemberOverrideBands,
      referringAgentId: normalized.referringAgentId,
      referringAgentDisplayNameSnapshot: normalized.referringAgentDisplayNameSnapshot,
      teamGroup: normalized.teamGroup,
      commissionMode: normalized.commissionMode,
      tiers: normalized.tiers,
      defaultTransactionFee: normalized.defaultTransactionFee,
      gracePeriodEnabled: normalized.gracePeriodEnabled,
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
    if (
      err?.message?.includes('required') ||
      err?.message === 'Invalid startDate' ||
      err?.message?.includes('Invalid ')
    ) {
      return jsonError(400, err.message);
    }

    console.error('[API/admin/agent-profiles/[agentId]][PATCH] Error:', err?.message || err);
    return jsonError(500, 'Internal Server Error', {
      message: err?.message || String(err),
    });
  }
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  try {
    await requireAdmin(req);
    const { agentId } = await context.params;

    const ref = adminDb.collection('agentProfiles').doc(agentId);
    const existing = await ref.get();

    if (!existing.exists) {
      return jsonError(404, 'Agent profile not found', { agentId });
    }

    const agentData = existing.data()!;
    const displayName = agentData.displayName || agentId;

    // Check for existing transactions
    const txSnap = await adminDb
      .collection('transactions')
      .where('agentId', '==', agentId)
      .limit(1)
      .get();

    // Parse query param to force delete even with transactions
    const url = new URL(req.url);
    const force = url.searchParams.get('force') === 'true';

    if (!txSnap.empty && !force) {
      // Count total transactions
      const txCountSnap = await adminDb
        .collection('transactions')
        .where('agentId', '==', agentId)
        .get();

      return NextResponse.json({
        ok: false,
        error: `Cannot delete "${displayName}" — they have ${txCountSnap.size} transaction(s). Use force delete to also remove their transactions, or reassign them first.`,
        transactionCount: txCountSnap.size,
        requiresForce: true,
      }, { status: 409 });
    }

    // If force delete, remove all related data
    if (force && !txSnap.empty) {
      // Delete transactions
      const allTx = await adminDb
        .collection('transactions')
        .where('agentId', '==', agentId)
        .get();

      let batch = adminDb.batch();
      let count = 0;
      for (const doc of allTx.docs) {
        batch.delete(doc.ref);
        count++;
        if (count >= 499) {
          await batch.commit();
          batch = adminDb.batch();
          count = 0;
        }
      }
      if (count > 0) await batch.commit();
    }

    // Delete activity records
    const activitySnap = await adminDb
      .collection('daily_activity')
      .where('agentId', '==', agentId)
      .get();

    if (!activitySnap.empty) {
      let batch = adminDb.batch();
      let count = 0;
      for (const doc of activitySnap.docs) {
        batch.delete(doc.ref);
        count++;
        if (count >= 499) {
          await batch.commit();
          batch = adminDb.batch();
          count = 0;
        }
      }
      if (count > 0) await batch.commit();
    }

    // Delete rollups
    const rollupsSnap = await adminDb
      .collection('agentYearRollups')
      .where('agentId', '==', agentId)
      .get();

    if (!rollupsSnap.empty) {
      let batch = adminDb.batch();
      let count = 0;
      for (const doc of rollupsSnap.docs) {
        batch.delete(doc.ref);
        count++;
        if (count >= 499) {
          await batch.commit();
          batch = adminDb.batch();
          count = 0;
        }
      }
      if (count > 0) await batch.commit();
    }

    // Delete goals
    const goalsSnap = await adminDb
      .collection('brokerCommandGoals')
      .where('segment', '==', `agent_${agentId}`)
      .get();

    if (!goalsSnap.empty) {
      let batch = adminDb.batch();
      let count = 0;
      for (const doc of goalsSnap.docs) {
        batch.delete(doc.ref);
        count++;
        if (count >= 499) {
          await batch.commit();
          batch = adminDb.batch();
          count = 0;
        }
      }
      if (count > 0) await batch.commit();
    }

    // Finally, delete the agent profile
    await ref.delete();

    return NextResponse.json({
      ok: true,
      deleted: displayName,
      agentId,
    });
  } catch (err: any) {
    if (err?.message === 'UNAUTHORIZED') {
      return jsonError(401, 'Unauthorized: Missing token');
    }
    if (err?.message === 'FORBIDDEN') {
      return jsonError(403, 'Forbidden: This action is restricted to administrators.');
    }

    console.error('[API/admin/agent-profiles/[agentId]][DELETE] Error:', err?.message || err);
    return jsonError(500, 'Internal Server Error', {
      message: err?.message || String(err),
    });
  }
}
