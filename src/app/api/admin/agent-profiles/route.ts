import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { deriveAnniversary } from '@/lib/agents/deriveAnniversary';
import { findFuzzyMatches } from '@/lib/agents/fuzzyMatch';
import type { AgentProfile, AgentProfileInput, AgentTier, TeamMemberCompMode, TeamMemberOverrideBand } from '@/lib/agents/types';
import type { MemberPlan, MemberPlanBand, TeamMembership, TeamPlan } from '@/lib/teams/types';
import { isAdminLike } from '@/lib/auth/staffAccess';
import { getTeamDefaultTiers } from '@/lib/commissions/teamTemplates';
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

  // Build teamMemberOverrideBands for team members.
  // Always force teamMemberCompMode = 'custom' so the commission API reads
  // from teamMemberOverrideBands (the source of truth) on every transaction.
  // If the submitted bands are empty, seed from the agent's own tiers or
  // the team group template so no profile is ever saved without a structure.
  let teamMemberOverrideBands: TeamMemberOverrideBand[] =
    isTeamAgent && body.teamRole === 'member'
      ? (body.teamMemberOverrideBands || []).map(normalizeTeamMemberOverrideBand)
      : [];

  if (isTeamAgent && body.teamRole === 'member' && teamMemberOverrideBands.length === 0) {
    const sourceTiers =
      (body.tiers || []).length > 0
        ? (body.tiers as AgentTier[])
        : getTeamDefaultTiers(body.teamGroup?.trim() || 'sgl');
    teamMemberOverrideBands = sourceTiers.map((t, i) => ({
      tierName: String(t.tierName || `Tier ${i + 1}`).trim(),
      fromCompanyDollar: Number(t.fromCompanyDollar || 0),
      toCompanyDollar:
        (t as any).toCompanyDollar === null || (t as any).toCompanyDollar === undefined
          ? null
          : Number((t as any).toCompanyDollar),
      memberPercent: Number((t as any).agentSplitPercent || 0),
      notes: t.notes?.trim() || null,
    }));
  }

  const referringAgentId = body.referringAgentId?.trim() || null;
  const referringAgentDisplayNameSnapshot =
    body.referringAgentDisplayNameSnapshot?.trim() || null;

  return {
    firstName: body.firstName.trim(),
    lastName: body.lastName.trim(),
    displayName: body.displayName.trim(),
    email: body.email?.trim() || null,
    phone: body.phone?.trim() || null,
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
    commissionMode:
      body.commissionMode === 'custom' ? 'custom'
      : body.commissionMode === 'flat' ? 'flat'
      : 'team_default',
    tiers: (body.tiers || []).map(normalizeTier),
    flatAgentPercent:
      body.flatAgentPercent != null && Number.isFinite(Number(body.flatAgentPercent))
        ? Number(body.flatAgentPercent)
        : null,
    flatCompanyPercent:
      body.flatCompanyPercent != null && Number.isFinite(Number(body.flatCompanyPercent))
        ? Number(body.flatCompanyPercent)
        : null,
    defaultTransactionFee:
      body.defaultTransactionFee != null && Number.isFinite(Number(body.defaultTransactionFee))
        ? Number(body.defaultTransactionFee)
        : null,
    gracePeriodEnabled: body.gracePeriodEnabled === true,
    notes: body.notes?.trim() || null,
    endDate: body.endDate?.trim() || null,
  };
}

/**
 * Auto-create or update teamMemberships and memberPlans records in Firestore
 * whenever a team agent is saved. This ensures commission calculations always
 * work correctly without any manual seeding.
 *
 * - For team members: creates membership + memberPlan using team default bands
 *   (or custom override bands if set on the agent profile)
 * - For team leaders: creates membership + memberPlan using leader's personal tiers
 * - Safe to call on every save — uses set() with merge so existing data is preserved
 *   unless the agent's team or role changed
 */
async function upsertTeamMembershipAndPlan(
  agentId: string,
  teamId: string,
  role: 'leader' | 'member',
  startDate: string,
  displayName: string,
  teamMemberCompMode: string,
  teamMemberOverrideBands: TeamMemberOverrideBand[],
  agentTiers: AgentTier[],
): Promise<{ membershipId: string; memberPlanId: string | null }> {
  const now = new Date().toISOString();
  const membershipId = `${teamId}__${agentId}__${role}`;
  const memberPlanId = `${agentId}-member-plan-v1`;

  // Look up the team plan to get default member bands
  let teamPlan: TeamPlan | null = null;
  const teamsSnap = await adminDb.collection('teams').doc(teamId).get();
  if (teamsSnap.exists) {
    const teamData = teamsSnap.data() as any;
    if (teamData?.teamPlanId) {
      const planSnap = await adminDb.collection('teamPlans').doc(teamData.teamPlanId).get();
      if (planSnap.exists) {
        teamPlan = planSnap.data() as TeamPlan;
      }
    }
  }

  // Determine payout bands for the memberPlan
  let payoutBands: MemberPlanBand[] = [];

  if (role === 'member') {
    if (teamMemberCompMode === 'custom' && teamMemberOverrideBands.length > 0) {
      // Use agent's custom override bands
      payoutBands = teamMemberOverrideBands.map(b => ({
        fromCompanyDollar: Number(b.fromCompanyDollar),
        toCompanyDollar: b.toCompanyDollar != null ? Number(b.toCompanyDollar) : null,
        memberPercent: Number(b.memberPercent),
      }));
    } else if (teamPlan?.memberDefaultBands && teamPlan.memberDefaultBands.length > 0) {
      // Use team default member bands
      payoutBands = teamPlan.memberDefaultBands.map(b => ({
        fromCompanyDollar: Number(b.fromCompanyDollar),
        toCompanyDollar: b.toCompanyDollar != null ? Number(b.toCompanyDollar) : null,
        memberPercent: Number(b.memberPercent),
      }));
    } else {
      // Fallback: 70% flat if no plan found
      payoutBands = [{ fromCompanyDollar: 0, toCompanyDollar: null, memberPercent: 70 }];
    }
  } else {
    // Leader: use their personal tiers converted to memberPercent bands
    if (agentTiers && agentTiers.length > 0) {
      payoutBands = agentTiers.map(t => ({
        fromCompanyDollar: Number(t.fromCompanyDollar),
        toCompanyDollar: t.toCompanyDollar != null ? Number(t.toCompanyDollar) : null,
        memberPercent: Number(t.agentSplitPercent),
      }));
    } else if (teamPlan?.memberDefaultBands && teamPlan.memberDefaultBands.length > 0) {
      payoutBands = teamPlan.memberDefaultBands.map(b => ({
        fromCompanyDollar: Number(b.fromCompanyDollar),
        toCompanyDollar: b.toCompanyDollar != null ? Number(b.toCompanyDollar) : null,
        memberPercent: Number(b.memberPercent),
      }));
    } else {
      payoutBands = [{ fromCompanyDollar: 0, toCompanyDollar: null, memberPercent: 70 }];
    }
  }

  // Upsert the memberPlan
  const memberPlan: MemberPlan = {
    memberPlanId,
    teamId,
    agentId,
    planName: `${displayName} ${role === 'leader' ? 'Leader' : 'Member'} Plan`,
    status: 'active',
    thresholdMetric: 'companyDollar',
    thresholdMarkers: teamPlan?.thresholdMarkers || [],
    payoutBands,
    createdAt: now,
    updatedAt: now,
    notes: `Auto-generated when agent profile was saved`,
  };

  await adminDb.collection('memberPlans').doc(memberPlanId).set(memberPlan, { merge: false });

  // Upsert the membership
  const membership: TeamMembership = {
    membershipId,
    teamId,
    agentId,
    role,
    memberPlanId,
    effectiveStart: startDate,
    effectiveEnd: null,
    activeFlag: true,
    createdAt: now,
    updatedAt: now,
    notes: `Auto-created when agent profile was saved`,
  };

  // Check if membership already exists — preserve createdAt if so
  const existingMembership = await adminDb.collection('teamMemberships').doc(membershipId).get();
  if (existingMembership.exists) {
    const existingData = existingMembership.data() as TeamMembership;
    membership.createdAt = existingData.createdAt || now;
  }

  await adminDb.collection('teamMemberships').doc(membershipId).set(membership);

  return { membershipId, memberPlanId };
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

    // Check for similar names (fuzzy match) — warn but allow override
    const forceCreate = body.forceCreate === true;
    if (!forceCreate) {
      const allProfilesSnap = await adminDb.collection('agentProfiles').get();
      const existingAgents = allProfilesSnap.docs.map(doc => {
        const d = doc.data();
        return {
          agentId: String(d.agentId || doc.id),
          displayName: String(d.displayName || ''),
        };
      }).filter(a => a.displayName);

      const similarMatches = findFuzzyMatches(normalized.displayName, existingAgents, 0.75);
      if (similarMatches.length > 0) {
        return NextResponse.json({
          ok: false,
          error: 'Similar agent names found. Review the matches below and confirm if you still want to create a new agent.',
          similarAgents: similarMatches.map(m => ({
            agentId: m.agentId,
            displayName: m.displayName,
            similarity: Math.round(m.similarity * 100),
          })),
          requiresConfirmation: true,
        }, { status: 409 });
      }
    }

    const now = new Date().toISOString();

    const profile: AgentProfile = {
      agentId,
      firstName: normalized.firstName,
      lastName: normalized.lastName,
      displayName: normalized.displayName,
      email: normalized.email,
      phone: normalized.phone,
      office: normalized.office,
      status: normalized.status,
      startDate: normalized.startDate,
      endDate: normalized.endDate ?? null,
      anniversaryMonth,
      anniversaryDay,
      agentType: normalized.agentType,
      progressionMetric: normalized.progressionMetric,
      primaryTeamId: normalized.primaryTeamId,
      teamRole: normalized.teamRole,
      defaultPlanType: normalized.defaultPlanType as import('@/lib/agents/types').PlanAssignmentType,
      defaultPlanId: normalized.defaultPlanId,
      teamMemberCompMode: normalized.teamMemberCompMode,
      teamMemberOverrideBands: normalized.teamMemberOverrideBands,
      referringAgentId: normalized.referringAgentId,
      referringAgentDisplayNameSnapshot: normalized.referringAgentDisplayNameSnapshot,
      teamGroup: normalized.teamGroup,
      commissionMode: normalized.commissionMode as import('@/lib/agents/types').CommissionMode,
      tiers: normalized.tiers,
      flatAgentPercent: normalized.flatAgentPercent ?? null,
      flatCompanyPercent: normalized.flatCompanyPercent ?? null,
      defaultTransactionFee: normalized.defaultTransactionFee,
      notes: normalized.notes,
      gracePeriodEnabled: normalized.gracePeriodEnabled ?? false,
      createdAt: now,
      updatedAt: now,
    };

    await ref.set(profile);

    // Auto-create team membership and member plan if this is a team agent
    let membershipResult: { membershipId: string; memberPlanId: string | null } | null = null;
    if (normalized.agentType === 'team' && normalized.primaryTeamId && normalized.teamRole) {
      try {
        membershipResult = await upsertTeamMembershipAndPlan(
          agentId,
          normalized.primaryTeamId,
          normalized.teamRole as 'leader' | 'member',
          normalized.startDate,
          normalized.displayName,
          normalized.teamMemberCompMode,
          normalized.teamMemberOverrideBands,
          normalized.tiers,
        );

        // Update the profile with the auto-generated memberPlanId
        if (membershipResult.memberPlanId && !normalized.defaultPlanId) {
          await ref.update({ defaultPlanId: membershipResult.memberPlanId, updatedAt: new Date().toISOString() });
          profile.defaultPlanId = membershipResult.memberPlanId;
        }
      } catch (membershipErr: any) {
        // Log but don't fail the profile creation — membership can be fixed via seed tool
        console.warn(`[agent-profiles][POST] Auto-membership creation failed for ${agentId}:`, membershipErr?.message);
      }
    }

    return NextResponse.json({
      ok: true,
      agent: profile,
      membershipCreated: membershipResult !== null,
      membershipId: membershipResult?.membershipId ?? null,
      memberPlanId: membershipResult?.memberPlanId ?? null,
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
