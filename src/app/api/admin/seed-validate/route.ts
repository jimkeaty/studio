/**
 * GET  /api/admin/seed-validate  — audit Firestore vs. seed data (dry run)
 * POST /api/admin/seed-validate  — audit + write any missing records
 *
 * Checks and seeds:
 *   - teams
 *   - teamPlans
 *   - teamMemberships
 *   - memberPlans
 *
 * Only office_admin can call this route.
 */
import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';

// ─── Seed Data ────────────────────────────────────────────────────────────────

const NOW = new Date().toISOString();

const SEED_TEAMS = [
  {
    id: 'cgl-team',
    data: {
      teamId: 'cgl-team',
      teamName: 'CGL',
      teamGroup: 'cgl',
      structureType: 'leaderless',
      commissionModel: 'tiered',
      status: 'active',
      createdAt: NOW,
      updatedAt: NOW,
    },
  },
  {
    id: 'sgl-team',
    data: {
      teamId: 'sgl-team',
      teamName: 'SGL',
      teamGroup: 'sgl',
      structureType: 'leaderless',
      commissionModel: 'tiered',
      status: 'active',
      createdAt: NOW,
      updatedAt: NOW,
    },
  },
  {
    id: 'referral-group',
    data: {
      teamId: 'referral-group',
      teamName: 'Referral Group',
      teamGroup: 'referral_group',
      structureType: 'leaderless',
      commissionModel: 'tiered',
      status: 'active',
      createdAt: NOW,
      updatedAt: NOW,
    },
  },
  {
    id: 'charles-ditch-team',
    data: {
      teamId: 'charles-ditch-team',
      teamName: 'Charles Ditch Team',
      teamGroup: 'charles_ditch_team',
      structureType: 'with_leader',
      commissionModel: 'tiered',
      status: 'active',
      createdAt: NOW,
      updatedAt: NOW,
    },
  },
];

const CGL_TIERS = [
  { tierName: 'Tier 1', fromCompanyDollar: 0, toCompanyDollar: 30000, agentSplitPercent: 70, companySplitPercent: 30, notes: '' },
  { tierName: 'Tier 2', fromCompanyDollar: 30000, toCompanyDollar: 60000, agentSplitPercent: 75, companySplitPercent: 25, notes: '' },
  { tierName: 'Tier 3', fromCompanyDollar: 60000, toCompanyDollar: 90000, agentSplitPercent: 80, companySplitPercent: 20, notes: '' },
  { tierName: 'Tier 4', fromCompanyDollar: 90000, toCompanyDollar: null, agentSplitPercent: 85, companySplitPercent: 15, notes: '' },
];

const SGL_TIERS = [
  { tierName: 'Tier 1', fromCompanyDollar: 0, toCompanyDollar: 45000, agentSplitPercent: 65, companySplitPercent: 35, notes: '' },
  { tierName: 'Tier 2', fromCompanyDollar: 45000, toCompanyDollar: 90000, agentSplitPercent: 70, companySplitPercent: 30, notes: '' },
  { tierName: 'Tier 3', fromCompanyDollar: 90000, toCompanyDollar: 180000, agentSplitPercent: 75, companySplitPercent: 25, notes: '' },
  { tierName: 'Tier 4', fromCompanyDollar: 180000, toCompanyDollar: null, agentSplitPercent: 85, companySplitPercent: 15, notes: '' },
];

const REFERRAL_TIERS = [
  { tierName: 'Flat', fromCompanyDollar: 0, toCompanyDollar: null, agentSplitPercent: 25, companySplitPercent: 75, notes: 'Referral flat split' },
];

const CD_TIERS = [
  { tierName: 'Tier 1', fromCompanyDollar: 0, toCompanyDollar: 60000, agentSplitPercent: 50, companySplitPercent: 50, notes: '' },
  { tierName: 'Tier 2', fromCompanyDollar: 60000, toCompanyDollar: 120000, agentSplitPercent: 60, companySplitPercent: 40, notes: '' },
  { tierName: 'Tier 3', fromCompanyDollar: 120000, toCompanyDollar: null, agentSplitPercent: 70, companySplitPercent: 30, notes: '' },
];

const SEED_TEAM_PLANS = [
  {
    id: 'cgl-team-plan-v1',
    data: {
      teamPlanId: 'cgl-team-plan-v1',
      teamId: 'cgl-team',
      planName: 'CGL Standard Tiers V1',
      status: 'active',
      tiers: CGL_TIERS,
      createdAt: NOW,
      updatedAt: NOW,
    },
  },
  {
    id: 'sgl-team-plan-v1',
    data: {
      teamPlanId: 'sgl-team-plan-v1',
      teamId: 'sgl-team',
      planName: 'SGL Standard Tiers V1',
      status: 'active',
      tiers: SGL_TIERS,
      createdAt: NOW,
      updatedAt: NOW,
    },
  },
  {
    id: 'referral-group-plan-v1',
    data: {
      teamPlanId: 'referral-group-plan-v1',
      teamId: 'referral-group',
      planName: 'Referral Group Flat Split V1',
      status: 'active',
      tiers: REFERRAL_TIERS,
      createdAt: NOW,
      updatedAt: NOW,
    },
  },
  {
    id: 'charles-ditch-team-plan-v1',
    data: {
      teamPlanId: 'charles-ditch-team-plan-v1',
      teamId: 'charles-ditch-team',
      planName: 'Charles Ditch Team Tiers V1',
      status: 'active',
      tiers: CD_TIERS,
      createdAt: NOW,
      updatedAt: NOW,
    },
  },
];

const CD_THRESHOLD_MARKERS = [
  { label: 'Tier 1', companyDollarThreshold: 0 },
  { label: 'Tier 2', companyDollarThreshold: 42000 },
  { label: 'Tier 3', companyDollarThreshold: 84000 },
  { label: 'Tier 4', companyDollarThreshold: 140000 },
  { label: 'Tier 5', companyDollarThreshold: 168000 },
  { label: 'Tier 6', companyDollarThreshold: 224000 },
];

const SEED_MEMBERSHIPS = [
  {
    id: 'charles-ditch-team__charles-ditch__leader',
    data: {
      membershipId: 'charles-ditch-team__charles-ditch__leader',
      teamId: 'charles-ditch-team',
      agentId: 'charles-ditch',
      role: 'leader',
      memberPlanId: 'charles-ditch-member-plan-v1',
      effectiveStart: '2026-01-01',
      effectiveEnd: null,
      activeFlag: true,
      createdAt: NOW,
      updatedAt: NOW,
      notes: 'Team leader',
    },
  },
  {
    id: 'charles-ditch-team__scott-domingue__member',
    data: {
      membershipId: 'charles-ditch-team__scott-domingue__member',
      teamId: 'charles-ditch-team',
      agentId: 'scott-domingue',
      role: 'member',
      memberPlanId: 'scott-domingue-member-plan-v1',
      effectiveStart: '2026-01-01',
      effectiveEnd: null,
      activeFlag: true,
      createdAt: NOW,
      updatedAt: NOW,
      notes: null,
    },
  },
  {
    id: 'charles-ditch-team__josh-boulanger__member',
    data: {
      membershipId: 'charles-ditch-team__josh-boulanger__member',
      teamId: 'charles-ditch-team',
      agentId: 'josh-boulanger',
      role: 'member',
      memberPlanId: 'josh-boulanger-member-plan-v1',
      effectiveStart: '2026-01-01',
      effectiveEnd: null,
      activeFlag: true,
      createdAt: NOW,
      updatedAt: NOW,
      notes: null,
    },
  },
  {
    id: 'charles-ditch-team__alan-gitz__member',
    data: {
      membershipId: 'charles-ditch-team__alan-gitz__member',
      teamId: 'charles-ditch-team',
      agentId: 'alan-gitz',
      role: 'member',
      memberPlanId: 'alan-gitz-member-plan-v1',
      effectiveStart: '2026-01-01',
      effectiveEnd: null,
      activeFlag: true,
      createdAt: NOW,
      updatedAt: NOW,
      notes: null,
    },
  },
];

const SEED_MEMBER_PLANS = [
  {
    id: 'charles-ditch-member-plan-v1',
    data: {
      memberPlanId: 'charles-ditch-member-plan-v1',
      teamId: 'charles-ditch-team',
      agentId: 'charles-ditch',
      planName: 'Charles Ditch Personal Ladder V1',
      status: 'active',
      thresholdMetric: 'companyDollar',
      thresholdMarkers: CD_THRESHOLD_MARKERS,
      payoutBands: [
        { fromCompanyDollar: 0, toCompanyDollar: 42000, memberPercent: 70 },
        { fromCompanyDollar: 42000, toCompanyDollar: 84000, memberPercent: 70 },
        { fromCompanyDollar: 84000, toCompanyDollar: 140000, memberPercent: 70 },
        { fromCompanyDollar: 140000, toCompanyDollar: 168000, memberPercent: 70 },
        { fromCompanyDollar: 168000, toCompanyDollar: 224000, memberPercent: 70 },
        { fromCompanyDollar: 224000, toCompanyDollar: null, memberPercent: 90 },
      ],
      createdAt: NOW,
      updatedAt: NOW,
      notes: 'Leader personal ladder',
    },
  },
  {
    id: 'scott-domingue-member-plan-v1',
    data: {
      memberPlanId: 'scott-domingue-member-plan-v1',
      teamId: 'charles-ditch-team',
      agentId: 'scott-domingue',
      planName: 'Scott Domingue Member Ladder V1',
      status: 'active',
      thresholdMetric: 'companyDollar',
      thresholdMarkers: CD_THRESHOLD_MARKERS,
      payoutBands: [
        { fromCompanyDollar: 0, toCompanyDollar: 42000, memberPercent: 65 },
        { fromCompanyDollar: 42000, toCompanyDollar: 84000, memberPercent: 70 },
        { fromCompanyDollar: 84000, toCompanyDollar: 140000, memberPercent: 75 },
        { fromCompanyDollar: 140000, toCompanyDollar: 168000, memberPercent: 80 },
        { fromCompanyDollar: 168000, toCompanyDollar: 224000, memberPercent: 85 },
        { fromCompanyDollar: 224000, toCompanyDollar: null, memberPercent: 90 },
      ],
      createdAt: NOW,
      updatedAt: NOW,
      notes: null,
    },
  },
  {
    id: 'josh-boulanger-member-plan-v1',
    data: {
      memberPlanId: 'josh-boulanger-member-plan-v1',
      teamId: 'charles-ditch-team',
      agentId: 'josh-boulanger',
      planName: 'Josh Boulanger Member Ladder V1',
      status: 'active',
      thresholdMetric: 'companyDollar',
      thresholdMarkers: CD_THRESHOLD_MARKERS,
      payoutBands: [
        { fromCompanyDollar: 0, toCompanyDollar: 42000, memberPercent: 45 },
        { fromCompanyDollar: 42000, toCompanyDollar: 84000, memberPercent: 50 },
        { fromCompanyDollar: 84000, toCompanyDollar: 140000, memberPercent: 60 },
        { fromCompanyDollar: 140000, toCompanyDollar: 168000, memberPercent: 65 },
        { fromCompanyDollar: 168000, toCompanyDollar: 224000, memberPercent: 70 },
        { fromCompanyDollar: 224000, toCompanyDollar: null, memberPercent: 80 },
      ],
      createdAt: NOW,
      updatedAt: NOW,
      notes: null,
    },
  },
  {
    id: 'alan-gitz-member-plan-v1',
    data: {
      memberPlanId: 'alan-gitz-member-plan-v1',
      teamId: 'charles-ditch-team',
      agentId: 'alan-gitz',
      planName: 'Alan Gitz Member Ladder V1',
      status: 'active',
      thresholdMetric: 'companyDollar',
      thresholdMarkers: CD_THRESHOLD_MARKERS,
      payoutBands: [
        { fromCompanyDollar: 0, toCompanyDollar: 42000, memberPercent: 45 },
        { fromCompanyDollar: 42000, toCompanyDollar: 84000, memberPercent: 50 },
        { fromCompanyDollar: 84000, toCompanyDollar: 140000, memberPercent: 60 },
        { fromCompanyDollar: 140000, toCompanyDollar: 168000, memberPercent: 65 },
        { fromCompanyDollar: 168000, toCompanyDollar: 224000, memberPercent: 70 },
        { fromCompanyDollar: 224000, toCompanyDollar: null, memberPercent: 80 },
      ],
      createdAt: NOW,
      updatedAt: NOW,
      notes: null,
    },
  },
];

// ─── Audit Helper ─────────────────────────────────────────────────────────────

interface CollectionAudit {
  collection: string;
  total: number;
  present: string[];
  missing: string[];
  extra: string[];
}

async function auditCollection(
  collectionName: string,
  seedDocs: { id: string; data: Record<string, any> }[]
): Promise<CollectionAudit> {
  const snap = await adminDb.collection(collectionName).get();
  const existingIds = new Set(snap.docs.map((d) => d.id));
  const seedIds = new Set(seedDocs.map((d) => d.id));

  const present: string[] = [];
  const missing: string[] = [];
  const extra: string[] = [];

  for (const doc of seedDocs) {
    if (existingIds.has(doc.id)) {
      present.push(doc.id);
    } else {
      missing.push(doc.id);
    }
  }

  for (const id of existingIds) {
    if (!seedIds.has(id)) {
      extra.push(id);
    }
  }

  return {
    collection: collectionName,
    total: snap.size,
    present,
    missing,
    extra,
  };
}

async function seedMissing(
  collectionName: string,
  seedDocs: { id: string; data: Record<string, any> }[],
  audit: CollectionAudit
): Promise<number> {
  let seeded = 0;
  const missingSet = new Set(audit.missing);
  for (const doc of seedDocs) {
    if (missingSet.has(doc.id)) {
      await adminDb.collection(collectionName).doc(doc.id).set(doc.data, { merge: true });
      seeded++;
    }
  }
  return seeded;
}

// ─── Auth Helper ──────────────────────────────────────────────────────────────

async function authenticate(req: NextRequest): Promise<string | null> {
  const h = req.headers.get('Authorization') || '';
  const token = h.startsWith('Bearer ') ? h.slice(7).trim() : null;
  if (!token) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    const allowed = await isAdminLike(decoded.uid);
    return allowed ? decoded.uid : null;
  } catch {
    return null;
  }
}

// ─── GET — Audit Only ─────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const uid = await authenticate(req);
  if (!uid) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  try {
    const [teams, teamPlans, memberships, memberPlans] = await Promise.all([
      auditCollection('teams', SEED_TEAMS),
      auditCollection('teamPlans', SEED_TEAM_PLANS),
      auditCollection('teamMemberships', SEED_MEMBERSHIPS),
      auditCollection('memberPlans', SEED_MEMBER_PLANS),
    ]);

    const allMissing = [
      ...teams.missing,
      ...teamPlans.missing,
      ...memberships.missing,
      ...memberPlans.missing,
    ];

    return NextResponse.json({
      ok: true,
      healthy: allMissing.length === 0,
      summary: {
        totalMissing: allMissing.length,
        totalPresent:
          teams.present.length +
          teamPlans.present.length +
          memberships.present.length +
          memberPlans.present.length,
      },
      collections: { teams, teamPlans, memberships, memberPlans },
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || 'Unknown error' }, { status: 500 });
  }
}

// ─── POST — Audit + Seed ──────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const uid = await authenticate(req);
  if (!uid) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  try {
    const [teamsAudit, teamPlansAudit, membershipsAudit, memberPlansAudit] = await Promise.all([
      auditCollection('teams', SEED_TEAMS),
      auditCollection('teamPlans', SEED_TEAM_PLANS),
      auditCollection('teamMemberships', SEED_MEMBERSHIPS),
      auditCollection('memberPlans', SEED_MEMBER_PLANS),
    ]);

    const [teamsSeeded, teamPlansSeeded, membershipsSeeded, memberPlansSeeded] = await Promise.all([
      seedMissing('teams', SEED_TEAMS, teamsAudit),
      seedMissing('teamPlans', SEED_TEAM_PLANS, teamPlansAudit),
      seedMissing('teamMemberships', SEED_MEMBERSHIPS, membershipsAudit),
      seedMissing('memberPlans', SEED_MEMBER_PLANS, memberPlansAudit),
    ]);

    const totalSeeded = teamsSeeded + teamPlansSeeded + membershipsSeeded + memberPlansSeeded;

    return NextResponse.json({
      ok: true,
      totalSeeded,
      details: {
        teams: { missing: teamsAudit.missing, seeded: teamsSeeded },
        teamPlans: { missing: teamPlansAudit.missing, seeded: teamPlansSeeded },
        memberships: { missing: membershipsAudit.missing, seeded: membershipsSeeded },
        memberPlans: { missing: memberPlansAudit.missing, seeded: memberPlansSeeded },
      },
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || 'Unknown error' }, { status: 500 });
  }
}
