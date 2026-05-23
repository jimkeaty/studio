/**
 * POST /api/admin/backfill-memberships
 *
 * Scans all agentProfiles with agentType === 'team', checks if a teamMembership
 * and memberPlan exist for each one, and creates any that are missing.
 *
 * Safe to run multiple times — never overwrites existing records.
 * Admin-only endpoint.
 */
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';
import type { AgentProfile } from '@/lib/agents/types';
import type { MemberPlan, MemberPlanBand, TeamMembership, TeamPlan } from '@/lib/teams/types';

function extractBearer(req: NextRequest) {
  const h = req.headers.get('Authorization') || '';
  if (!h.startsWith('Bearer ')) return null;
  return h.slice('Bearer '.length).trim();
}

function jsonError(status: number, error: string, details?: unknown) {
  return NextResponse.json({ ok: false, error, details: details ?? null }, { status });
}

async function requireAdmin(req: NextRequest) {
  const token = extractBearer(req);
  if (!token) throw new Error('UNAUTHORIZED');
  const decoded = await adminAuth.verifyIdToken(token);
  if (!(await isAdminLike(decoded.uid))) throw new Error('FORBIDDEN');
  return decoded;
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);

    const now = new Date().toISOString();
    const results: {
      agentId: string;
      displayName: string;
      teamId: string;
      role: string;
      membershipStatus: 'created' | 'already_exists' | 'skipped';
      memberPlanStatus: 'created' | 'already_exists' | 'skipped';
      error?: string;
    }[] = [];

    // 1. Load all team agents
    const agentsSnap = await adminDb
      .collection('agentProfiles')
      .where('agentType', '==', 'team')
      .get();

    if (agentsSnap.empty) {
      return NextResponse.json({ ok: true, message: 'No team agents found', results: [] });
    }

    // 2. Load all teams and their plans (cache to avoid repeated reads)
    const teamPlanCache: Record<string, TeamPlan | null> = {};

    async function getTeamPlan(teamId: string): Promise<TeamPlan | null> {
      if (teamId in teamPlanCache) return teamPlanCache[teamId];

      const teamSnap = await adminDb.collection('teams').doc(teamId).get();
      if (!teamSnap.exists) {
        teamPlanCache[teamId] = null;
        return null;
      }
      const teamData = teamSnap.data() as any;
      if (!teamData?.teamPlanId) {
        teamPlanCache[teamId] = null;
        return null;
      }
      const planSnap = await adminDb.collection('teamPlans').doc(teamData.teamPlanId).get();
      const plan = planSnap.exists ? (planSnap.data() as TeamPlan) : null;
      teamPlanCache[teamId] = plan;
      return plan;
    }

    // 3. Process each team agent
    for (const doc of agentsSnap.docs) {
      const agent = doc.data() as AgentProfile;
      const agentId = agent.agentId || doc.id;
      const teamId = agent.primaryTeamId;
      const role = agent.teamRole as 'leader' | 'member' | null;

      if (!teamId || !role) {
        results.push({
          agentId,
          displayName: agent.displayName || agentId,
          teamId: teamId || '(none)',
          role: role || '(none)',
          membershipStatus: 'skipped',
          memberPlanStatus: 'skipped',
          error: 'Missing primaryTeamId or teamRole on profile',
        });
        continue;
      }

      const membershipId = `${teamId}__${agentId}__${role}`;
      const memberPlanId = `${agentId}-member-plan-v1`;

      try {
        const teamPlan = await getTeamPlan(teamId);

        // Determine payout bands
        let payoutBands: MemberPlanBand[] = [];

        if (role === 'member') {
          if (
            agent.teamMemberCompMode === 'custom' &&
            agent.teamMemberOverrideBands &&
            agent.teamMemberOverrideBands.length > 0
          ) {
            payoutBands = agent.teamMemberOverrideBands.map(b => ({
              fromCompanyDollar: Number(b.fromCompanyDollar),
              toCompanyDollar: b.toCompanyDollar != null ? Number(b.toCompanyDollar) : null,
              memberPercent: Number(b.memberPercent),
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
        } else {
          // Leader: use personal tiers
          if (agent.tiers && agent.tiers.length > 0) {
            payoutBands = agent.tiers.map(t => ({
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

        // Check and create memberPlan
        const existingPlan = await adminDb.collection('memberPlans').doc(memberPlanId).get();
        let memberPlanStatus: 'created' | 'already_exists' = 'already_exists';

        if (!existingPlan.exists) {
          const memberPlan: MemberPlan = {
            memberPlanId,
            teamId,
            agentId,
            planName: `${agent.displayName} ${role === 'leader' ? 'Leader' : 'Member'} Plan`,
            status: 'active',
            thresholdMetric: 'companyDollar',
            thresholdMarkers: teamPlan?.thresholdMarkers || [],
            payoutBands,
            createdAt: now,
            updatedAt: now,
            notes: 'Auto-created by backfill-memberships',
          };
          await adminDb.collection('memberPlans').doc(memberPlanId).set(memberPlan);
          memberPlanStatus = 'created';
        }

        // Check and create membership
        const existingMembership = await adminDb.collection('teamMemberships').doc(membershipId).get();
        let membershipStatus: 'created' | 'already_exists' = 'already_exists';

        if (!existingMembership.exists) {
          const membership: TeamMembership = {
            membershipId,
            teamId,
            agentId,
            role,
            memberPlanId,
            effectiveStart: agent.startDate || '2026-01-01',
            effectiveEnd: null,
            activeFlag: true,
            createdAt: now,
            updatedAt: now,
            notes: 'Auto-created by backfill-memberships',
          };
          await adminDb.collection('teamMemberships').doc(membershipId).set(membership);
          membershipStatus = 'created';
        }

        // Update defaultPlanId on the agent profile if missing
        if (!agent.defaultPlanId) {
          await adminDb.collection('agentProfiles').doc(agentId).update({
            defaultPlanId: memberPlanId,
            updatedAt: now,
          });
        }

        results.push({
          agentId,
          displayName: agent.displayName || agentId,
          teamId,
          role,
          membershipStatus,
          memberPlanStatus,
        });
      } catch (agentErr: any) {
        results.push({
          agentId,
          displayName: agent.displayName || agentId,
          teamId,
          role,
          membershipStatus: 'skipped',
          memberPlanStatus: 'skipped',
          error: agentErr?.message || String(agentErr),
        });
      }
    }

    const created = results.filter(r => r.membershipStatus === 'created' || r.memberPlanStatus === 'created').length;
    const alreadyOk = results.filter(r => r.membershipStatus === 'already_exists' && r.memberPlanStatus === 'already_exists').length;
    const skipped = results.filter(r => r.membershipStatus === 'skipped').length;

    return NextResponse.json({
      ok: true,
      summary: {
        total: results.length,
        created,
        alreadyOk,
        skipped,
      },
      results,
    });
  } catch (err: any) {
    if (err?.message === 'UNAUTHORIZED') return jsonError(401, 'Unauthorized');
    if (err?.message === 'FORBIDDEN') return jsonError(403, 'Forbidden');
    console.error('[backfill-memberships] Error:', err?.message || err);
    return jsonError(500, 'Internal Server Error', { message: err?.message || String(err) });
  }
}
