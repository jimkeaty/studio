import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';
import { centralParts } from '@/lib/attendance/rules';
import { calculateOperationalMeetingEligibility } from '@/lib/agent-development/operationalMeetingEligibility';

const INACTIVE_STATUSES = new Set(['inactive', 'out', 'terminated', 'churned']);
const ACTIVITY_TYPES = new Set([
  'call_night',
  'recruiting_workshop',
  'buyer_seller_workshop',
  'ypn_event',
  'partner_event',
  'team_appointments',
  'new_agent_welcome_call',
  'in_person_relationship_meeting',
  'sales_meeting',
  'huddle',
  'role_play_ids',
  'training_session',
  'new_agent_follow_up',
  'custom',
]);

type CustomKpi = {
  id: string;
  label: string;
  unit: string;
  monthlyGoal: number;
  active: boolean;
};

type DadPlan = {
  directorName: string;
  monthlyGoals: {
    teamAppointments: number;
    callNightHours: number;
    recruitingWorkshops: number;
    buyerSellerWorkshops: number;
    networkingEvents: number;
    ypnEventsScheduled: number;
    salesMeetings: number;
    huddles: number;
    rolePlaySessions: number;
    trainingSessions: number;
    newAgentFollowUps: number;
    recruitingFollowUpsDaily: number;
    recruitingFollowUpsWeekly: number;
    recruitingFollowUpsMonthly: number;
  };
  customKpis: CustomKpi[];
};

const DEFAULT_PLAN: DadPlan = {
  directorName: 'Ethan',
  monthlyGoals: {
    teamAppointments: 80,
    callNightHours: 3,
    recruitingWorkshops: 1,
    buyerSellerWorkshops: 1,
    networkingEvents: 1,
    // This is intentionally zero until the team records how many YPN events
    // are scheduled. The goal is attendance at every scheduled YPN event.
    ypnEventsScheduled: 0,
    salesMeetings: 0,
    huddles: 8,
    rolePlaySessions: 4,
    trainingSessions: 0,
    newAgentFollowUps: 0,
    // Recruiting follow-up targets must be approved and configured; zero keeps
    // the metric visible but unscored until that happens.
    recruitingFollowUpsDaily: 0,
    recruitingFollowUpsWeekly: 0,
    recruitingFollowUpsMonthly: 0,
  },
  customKpis: [],
};

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

async function requireAdminLike(req: NextRequest) {
  const header = req.headers.get('Authorization') || '';
  if (!header.startsWith('Bearer ')) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(header.slice(7));
    if (!(await isAdminLike(decoded.uid))) return null;
    return decoded;
  } catch {
    return null;
  }
}

function isoDate(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string') {
    const match = value.match(/^\d{4}-\d{2}-\d{2}/);
    return match ? match[0] : null;
  }
  if (typeof (value as any).toDate === 'function') {
    const date = (value as any).toDate() as Date;
    return date.toISOString().slice(0, 10);
  }
  return null;
}

function ymd(date: Date) {
  return date.toISOString().slice(0, 10);
}

function fromYmd(value: string) {
  return new Date(`${value}T00:00:00Z`);
}

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function addMonths(date: Date, months: number) {
  const result = new Date(date);
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
}

function getWeekStart(value: string) {
  const date = fromYmd(value);
  const day = date.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  return ymd(addDays(date, mondayOffset));
}

function getQuarterStart(value: string) {
  const date = fromYmd(value);
  const quarterMonth = Math.floor(date.getUTCMonth() / 3) * 3;
  return `${date.getUTCFullYear()}-${String(quarterMonth + 1).padStart(2, '0')}-01`;
}

function within(date: string | null, start: string, end: string) {
  return Boolean(date && date >= start && date <= end);
}

function sanitizeNumber(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function gradeFor(actual: number, goal: number) {
  if (goal <= 0) return { pct: null as number | null, grade: '—' };
  const pct = Math.round((actual / goal) * 100);
  const grade = pct >= 100 ? 'A' : pct >= 85 ? 'B' : pct >= 70 ? 'C' : pct >= 50 ? 'D' : 'F';
  return { pct, grade };
}

function normalizePlan(raw: any): DadPlan {
  const sourceGoals = raw?.dadGoals?.monthlyGoals || raw?.monthlyGoals || {};
  const customSource = raw?.dadGoals?.customKpis || raw?.customKpis || [];
  return {
    directorName: String(raw?.dadGoals?.directorName || raw?.directorName || DEFAULT_PLAN.directorName).trim().slice(0, 80) || DEFAULT_PLAN.directorName,
    monthlyGoals: {
      teamAppointments: sanitizeNumber(sourceGoals.teamAppointments, DEFAULT_PLAN.monthlyGoals.teamAppointments),
      callNightHours: sanitizeNumber(sourceGoals.callNightHours, DEFAULT_PLAN.monthlyGoals.callNightHours),
      recruitingWorkshops: sanitizeNumber(sourceGoals.recruitingWorkshops, DEFAULT_PLAN.monthlyGoals.recruitingWorkshops),
      buyerSellerWorkshops: sanitizeNumber(sourceGoals.buyerSellerWorkshops, DEFAULT_PLAN.monthlyGoals.buyerSellerWorkshops),
      networkingEvents: sanitizeNumber(sourceGoals.networkingEvents ?? sourceGoals.partnerEvents, DEFAULT_PLAN.monthlyGoals.networkingEvents),
      ypnEventsScheduled: sanitizeNumber(sourceGoals.ypnEventsScheduled, DEFAULT_PLAN.monthlyGoals.ypnEventsScheduled),
      salesMeetings: sanitizeNumber(sourceGoals.salesMeetings, DEFAULT_PLAN.monthlyGoals.salesMeetings),
      huddles: sanitizeNumber(sourceGoals.huddles, DEFAULT_PLAN.monthlyGoals.huddles),
      rolePlaySessions: sanitizeNumber(sourceGoals.rolePlaySessions, DEFAULT_PLAN.monthlyGoals.rolePlaySessions),
      trainingSessions: sanitizeNumber(sourceGoals.trainingSessions, DEFAULT_PLAN.monthlyGoals.trainingSessions),
      newAgentFollowUps: sanitizeNumber(sourceGoals.newAgentFollowUps, DEFAULT_PLAN.monthlyGoals.newAgentFollowUps),
      recruitingFollowUpsDaily: sanitizeNumber(sourceGoals.recruitingFollowUpsDaily, DEFAULT_PLAN.monthlyGoals.recruitingFollowUpsDaily),
      recruitingFollowUpsWeekly: sanitizeNumber(sourceGoals.recruitingFollowUpsWeekly, DEFAULT_PLAN.monthlyGoals.recruitingFollowUpsWeekly),
      recruitingFollowUpsMonthly: sanitizeNumber(sourceGoals.recruitingFollowUpsMonthly, DEFAULT_PLAN.monthlyGoals.recruitingFollowUpsMonthly),
    },
    customKpis: Array.isArray(customSource)
      ? customSource
          .map((item: any) => ({
            id: String(item?.id || '').trim(),
            label: String(item?.label || '').trim(),
            unit: String(item?.unit || 'activities').trim() || 'activities',
            monthlyGoal: sanitizeNumber(item?.monthlyGoal, 0),
            active: item?.active !== false,
          }))
          .filter((item: CustomKpi) => item.id && item.label)
          .slice(0, 20)
      : [],
  };
}

function normalizeCustomKpis(value: unknown): CustomKpi[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item: any, index: number) => ({
      id: String(item?.id || `custom_${index + 1}`).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48),
      label: String(item?.label || '').trim().slice(0, 80),
      unit: String(item?.unit || 'activities').trim().slice(0, 40) || 'activities',
      monthlyGoal: sanitizeNumber(item?.monthlyGoal, 0),
      active: item?.active !== false,
    }))
    .filter((item: CustomKpi) => item.id && item.label)
    .slice(0, 20);
}

function makeMetric(
  key: string,
  label: string,
  actual: number,
  goal: number,
  unit: string,
  detail: string,
  missingAgents: Array<{ agentId: string; name: string }> = [],
) {
  const scoring = gradeFor(actual, goal);
  return { key, label, actual, goal, unit, detail, missingAgents, ...scoring };
}

export async function GET(req: NextRequest) {
  const caller = await requireAdminLike(req);
  if (!caller) return jsonError(403, 'Administrator or staff access required');

  try {
    const requestUrl = new URL(req.url);
    const year = Number(requestUrl.searchParams.get('year') || Number(centralParts().date.slice(0, 4)));
    if (!Number.isInteger(year) || year < 2018 || year > 2100) return jsonError(400, 'Invalid year');

    const centralToday = centralParts().date;
    const reportEnd = year === Number(centralToday.slice(0, 4)) ? centralToday : `${year}-12-31`;
    const reportMonth = Number(reportEnd.slice(5, 7));
    const monthsElapsed = year === new Date().getUTCFullYear() ? reportMonth : 12;
    const monthStart = `${reportEnd.slice(0, 7)}-01`;
    const monthEnd = ymd(new Date(Date.UTC(year, reportMonth, 0)));
    const weekStart = getWeekStart(reportEnd);
    const weekEnd = ymd(addDays(fromYmd(weekStart), 6));
    const quarterStart = getQuarterStart(reportEnd);

    const [planSnap, profileSnap, oneOnOneSnap, activitySnap, recruitingActivitySnap, closedSnap, pendingSnap] = await Promise.all([
      adminDb.collection('recruitingPlans').doc(String(year)).get(),
      adminDb.collection('agentProfiles').get(),
      adminDb.collection('oneOnOnes').get(),
      adminDb.collection('directorDevelopmentActivities').where('year', '==', year).get(),
      adminDb.collection('recruitingPipelineActivity').get(),
      adminDb.collection('transactions').where('status', '==', 'closed').get(),
      adminDb.collection('transactions').where('status', 'in', ['pending', 'under_contract']).get(),
    ]);

    const plan = normalizePlan(planSnap.exists ? planSnap.data() : null);
    const agentInputs = profileSnap.docs
      .map(doc => {
        const profile = doc.data() as any;
        const status = String(profile.status || profile.agentStatus || 'active').toLowerCase();
        return {
          agentId: String(profile.agentId || doc.id),
          name: String(profile.displayName || profile.name || `${profile.firstName || ''} ${profile.lastName || ''}`.trim() || doc.id),
          startDate: isoDate(profile.startDate),
          status,
          teamGroup: String(profile.teamGroup || ''),
          identityKeys: [doc.id, profile.agentId, profile.uid, profile.firebaseUid],
        };
      })
      .filter(agent => agent.startDate && agent.startDate <= reportEnd);
    const agents = agentInputs.map(agent => ({ ...agent, active: !INACTIVE_STATUSES.has(agent.status) }));
    const eligibility = calculateOperationalMeetingEligibility({
      agents: agentInputs,
      transactions: [
        ...closedSnap.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) })),
        ...pendingSnap.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) })),
      ],
      asOfDate: reportEnd,
    });
    // Retain the existing all-active payload for attendance and unrelated selectors.
    // SBUSA-002 narrows only operational 1:1 categories, not the general active roster.
    const activeAgents = agents.filter(agent => agent.active);
    const operationalActiveAgents = eligibility.activeAgents;
    const newAgent90 = eligibility.operational.new_agent_90_day;
    const noProductionOrPending = eligibility.operational.no_production_or_pending_last_60_days;
    const agentsUnderYear = eligibility.operational.under_one_year;
    const quarterlyAll = eligibility.quarterlyStrategyAgents;
    const newAgentsThisYear = agents.filter(agent => agent.startDate!.startsWith(String(year)) && agent.startDate! <= reportEnd);

    const completedMeetings = oneOnOneSnap.docs
      .map(doc => ({ id: doc.id, ...(doc.data() as any) }))
      .filter(meeting => {
        const date = isoDate(meeting.scheduledDate);
        return Boolean(date && (meeting.completedAt || meeting.completed === true || meeting.status === 'completed'));
      });

    const coveredIds = (
      target: Array<{ agentId: string; name: string }>,
      start: string,
      end: string,
      requireNotes = false,
      allowedTypes?: Set<string>,
    ) => {
      const completed = new Set(
        completedMeetings
          .filter(meeting => {
            const date = isoDate(meeting.scheduledDate);
            if (!within(date, start, end)) return false;
            if (requireNotes && !String(meeting.completionNotes || '').trim()) return false;
            if (allowedTypes && !allowedTypes.has(String(meeting.type || ''))) return false;
            return true;
          })
          .map(meeting => String(meeting.agentId || ''))
      );
      const covered = target.filter(agent => completed.has(agent.agentId));
      return {
        actual: covered.length,
        missing: target.filter(agent => !completed.has(agent.agentId)).map(agent => ({ agentId: agent.agentId, name: agent.name })),
      };
    };

    const weeklyNew = coveredIds(newAgent90, weekStart, weekEnd, false, new Set(['weekly_90day', 'weekly']));
    const monthlyUnderYear = coveredIds(agentsUnderYear, monthStart, monthEnd, false, new Set(['monthly_cgl', 'monthly']));
    const monthlyNoProduction = coveredIds(noProductionOrPending, monthStart, monthEnd, false, new Set(['monthly_no_production', 'monthly_cgl', 'monthly']));
    const quarterlyAllCoverage = coveredIds(quarterlyAll, quarterStart, reportEnd, true, new Set(['quarterly_strategy']));

    const activities = activitySnap.docs
      .map(doc => ({ id: doc.id, ...(doc.data() as any) }))
      .filter(activity => {
        const date = isoDate(activity.occurredOn);
        return Boolean(date && date >= `${year}-01-01` && date <= reportEnd);
      })
      .sort((a, b) => String(b.occurredOn || '').localeCompare(String(a.occurredOn || '')));

    const activityTotal = (type: string, field = 'count') => activities
      .filter(activity => activity.activityType === type)
      .reduce((total, activity) => total + sanitizeNumber(activity[field], field === 'count' ? 1 : 0), 0);
    const distinctActivityAgents = (type: string) => new Set(
      activities.filter(activity => activity.activityType === type && activity.relatedAgentId).map(activity => String(activity.relatedAgentId))
    );

    const welcomeIds = distinctActivityAgents('new_agent_welcome_call');
    const welcomeCovered = newAgentsThisYear.filter(agent => welcomeIds.has(agent.agentId));
    const welcomeMissing = newAgentsThisYear
      .filter(agent => !welcomeIds.has(agent.agentId))
      .map(agent => ({ agentId: agent.agentId, name: agent.name }));

    const relationshipMeetingsThisWeek = activities.filter(activity =>
      activity.activityType === 'in_person_relationship_meeting'
      && String(activity.recruiterName || plan.directorName).trim().toLowerCase() === plan.directorName.trim().toLowerCase()
      && within(isoDate(activity.occurredOn), weekStart, weekEnd)
    );
    const currentMonthActivities = activities.filter(activity => within(isoDate(activity.occurredOn), monthStart, monthEnd));
    const currentMonthActivityTotal = (type: string) => currentMonthActivities
      .filter(activity => activity.activityType === type)
      .reduce((total, activity) => total + sanitizeNumber(activity.count, 1), 0);
    // Recruiting-pipeline contact history is the canonical prospect follow-up
    // system. It deliberately does not read or write new-agent activity records,
    // and retains contacts for every pipeline status, including legacy test-agent
    // classifications when present in historical candidate data.
    const recruitingFollowUps = recruitingActivitySnap.docs
      .map(doc => doc.data() as any)
      .filter(activity => ['call', 'email', 'text', 'meeting'].includes(String(activity.type || '')))
      .filter(activity => within(isoDate(activity.createdAt), `${year}-01-01`, reportEnd));
    const recruitingFollowUpsFor = (start: string, end: string) => recruitingFollowUps
      .filter(activity => within(isoDate(activity.createdAt), start, end)).length;
    const metrics = [
      makeMetric('weekly_new_agent_one_on_ones', 'New Agent 1:1s — This Week', weeklyNew.actual, newAgent90.length, 'agents', 'Active CGL and Charles Ditch Team agents on days 1–90 receive this exclusive weekly operational assignment.', weeklyNew.missing),
      makeMetric('monthly_under_year_one_on_ones', 'Agents Under 1 Year — This Month', monthlyUnderYear.actual, agentsUnderYear.length, 'agents', 'Active CGL and Charles Ditch Team agents on days 91–365 qualify only when they had production or a pending transaction in the inclusive last 60 days.', monthlyUnderYear.missing),
      makeMetric('monthly_no_production_one_on_ones', 'No Production or Pending in Last 60 Days — This Month', monthlyNoProduction.actual, noProductionOrPending.length, 'agents', `Active CGL and Charles Ditch Team agents with no closed or pending activity from ${eligibility.sixtyDayWindowStart} through ${reportEnd}; this category takes precedence over Under One Year.`, monthlyNoProduction.missing),
      makeMetric('quarterly_strategy_one_on_ones', 'All-Agent Strategy 1:1s — This Quarter', quarterlyAllCoverage.actual, quarterlyAll.length, 'agents', 'All active agents qualify regardless of team. Requires a completed quarterly 1:1 with completion notes and a strategic plan.', quarterlyAllCoverage.missing),
      makeMetric('weekly_relationship_meetings', 'In-Person Coffee / Lunch Meetings — This Week', relationshipMeetingsThisWeek.length, 4, 'meetings', 'Four in-person relationship meetings each week, outside the office, with current agents or recruiting prospects.'),
      makeMetric('new_agent_follow_ups', 'New-Agent Onboarding Follow-Ups — This Month', currentMonthActivityTotal('new_agent_follow_up'), plan.monthlyGoals.newAgentFollowUps, 'follow-ups', 'Log calls, meetings, or direct onboarding follow-up with new agents. This is distinct from recruiting prospect contacts.'),
      makeMetric('recruiting_follow_ups_daily', 'Recruiting Prospect Follow-Ups — Today', recruitingFollowUpsFor(reportEnd, reportEnd), plan.monthlyGoals.recruitingFollowUpsDaily, 'completed contacts', 'Completed call, email, text, or meeting entries from the Recruiting Pipeline. Candidate stage does not affect the count; configure an approved daily target in Goals.'),
      makeMetric('recruiting_follow_ups_weekly', 'Recruiting Prospect Follow-Ups — This Week', recruitingFollowUpsFor(weekStart, weekEnd), plan.monthlyGoals.recruitingFollowUpsWeekly, 'completed contacts', 'Completed call, email, text, or meeting entries from the Recruiting Pipeline. Configure an approved weekly target in Goals.'),
      makeMetric('recruiting_follow_ups_monthly', 'Recruiting Prospect Follow-Ups — This Month', recruitingFollowUpsFor(monthStart, monthEnd), plan.monthlyGoals.recruitingFollowUpsMonthly, 'completed contacts', 'Completed call, email, text, or meeting entries from the Recruiting Pipeline. Configure an approved monthly target in Goals.'),
      makeMetric('call_nights_held', 'Call Nights Held', activities.filter(activity => activity.activityType === 'call_night').length, monthsElapsed, 'nights', 'Target is one completed call night each month.'),
      makeMetric('call_night_hours', 'Call Night Hours', activityTotal('call_night', 'durationHours'), plan.monthlyGoals.callNightHours * monthsElapsed, 'hours', `Target is ${plan.monthlyGoals.callNightHours} hours per month; log actual call-night hours.`),
      makeMetric('recruiting_workshops', 'Recruiting Workshops', activityTotal('recruiting_workshop'), plan.monthlyGoals.recruitingWorkshops * monthsElapsed, 'workshops', `Target is ${plan.monthlyGoals.recruitingWorkshops} recruiting workshop(s) per month.`),
      makeMetric('buyer_seller_workshops', 'Buyer & Seller Workshops', activityTotal('buyer_seller_workshop'), plan.monthlyGoals.buyerSellerWorkshops * monthsElapsed, 'workshops', `Target is ${plan.monthlyGoals.buyerSellerWorkshops} buyer/seller workshop(s) per month.`),
      makeMetric('ypn_events', 'YPN Events Attended', activityTotal('ypn_event'), plan.monthlyGoals.ypnEventsScheduled * monthsElapsed, 'events', 'Set the number of scheduled YPN events in Goals; attendance is expected at every scheduled event.'),
      makeMetric('qualifying_events', 'Qualifying Networking Events', activityTotal('ypn_event') + activityTotal('partner_event'), plan.monthlyGoals.networkingEvents * monthsElapsed, 'events', `Target is ${plan.monthlyGoals.networkingEvents} YPN, mortgage, builder, or RCA event(s) per month.`),
      makeMetric('team_appointments', 'Team Appointments', activityTotal('team_appointments'), plan.monthlyGoals.teamAppointments * monthsElapsed, 'appointments', `Target is ${plan.monthlyGoals.teamAppointments} team appointments per month.`),
      makeMetric('new_agent_welcome_calls', 'New Agent Welcome Calls', welcomeCovered.length, newAgentsThisYear.length, 'agents', 'Every new agent should receive and have a tracked welcome call.', welcomeMissing),
      ...plan.customKpis.filter(item => item.active).map(kpi =>
        makeMetric(
          `custom_${kpi.id}`,
          kpi.label,
          activities
            .filter(activity => activity.activityType === 'custom' && activity.customKpiId === kpi.id)
            .reduce((total, activity) => total + sanitizeNumber(activity.count, 1), 0),
          kpi.monthlyGoal * monthsElapsed,
          kpi.unit,
          `Custom KPI target is ${kpi.monthlyGoal} ${kpi.unit} per month.`
        )
      ),
    ];

    const scoredMetrics = metrics.filter(metric => metric.pct !== null);
    const overallPct = scoredMetrics.length
      ? Math.round(scoredMetrics.reduce((total, metric) => total + Math.min(metric.pct ?? 0, 100), 0) / scoredMetrics.length)
      : null;
    const overallGrade = overallPct === null ? '—' : gradeFor(overallPct, 100).grade;

    const operationalAssignments = Object.entries(eligibility.operational).flatMap(([category, eligibleAgents]) =>
      eligibleAgents.map(agent => ({
        agentId: agent.agentId,
        name: agent.name,
        teamGroup: agent.teamGroup,
        startDate: agent.startDate,
        tenureDay: agent.tenureDay,
        category,
        last60DayActivity: agent.activityInLast60Days.map(activity => `${activity.kind}:${activity.date}`).join('; '),
      }))
    );

    if (requestUrl.searchParams.get('format') === 'csv') {
      const csvValue = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
      const rows = [
        ['Agent ID', 'Agent', 'Team Group', 'Start Date', 'Tenure Day', 'Operational Category', 'Closed/Pending Activity in Last 60 Days'],
        ...operationalAssignments.map(item => [item.agentId, item.name, item.teamGroup, item.startDate || '', item.tenureDay ?? '', item.category, item.last60DayActivity]),
      ];
      return new NextResponse(rows.map(row => row.map(csvValue).join(',')).join('\n'), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="operational-meeting-eligibility-${reportEnd}.csv"`,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      year,
      reportPeriod: { reportEnd, monthStart, monthEnd, weekStart, weekEnd, quarterStart, monthsElapsed },
      plan,
      director: { name: plan.directorName },
      scorecard: { metrics, overallPct, overallGrade, scoredMetricCount: scoredMetrics.length },
      eligibleAgents: {
        active: activeAgents.map(agent => ({ agentId: agent.agentId, name: agent.name, startDate: agent.startDate, teamGroup: agent.teamGroup })),
        newAgent90: newAgent90.map(agent => ({ agentId: agent.agentId, name: agent.name, startDate: agent.startDate })),
        operational: {
          newAgent90: newAgent90.map(agent => ({ agentId: agent.agentId, name: agent.name, startDate: agent.startDate })),
          noProductionLast60Days: noProductionOrPending.map(agent => ({ agentId: agent.agentId, name: agent.name, startDate: agent.startDate })),
          underOneYear: agentsUnderYear.map(agent => ({ agentId: agent.agentId, name: agent.name, startDate: agent.startDate })),
        },
        quarterlyStrategy: quarterlyAll.map(agent => ({ agentId: agent.agentId, name: agent.name, startDate: agent.startDate, teamGroup: agent.teamGroup })),
        operationalEligibility: {
          asOfDate: eligibility.asOfDate,
          sixtyDayWindowStart: eligibility.sixtyDayWindowStart,
          operationalEligibleCount: operationalActiveAgents.length,
          excluded: eligibility.excluded,
          assignments: operationalAssignments,
        },
      },
      activities: activities.slice(0, 100).map(activity => ({
        id: activity.id,
        activityType: activity.activityType,
        occurredOn: isoDate(activity.occurredOn),
        title: activity.title || '',
        count: sanitizeNumber(activity.count, 1),
        durationHours: sanitizeNumber(activity.durationHours, 0),
        relatedAgentId: activity.relatedAgentId || null,
        relatedAgentName: activity.relatedAgentName || null,
        organization: activity.organization || null,
        relationshipPurpose: activity.relationshipPurpose || null,
        customKpiId: activity.customKpiId || null,
        notes: activity.notes || null,
      })),
    });
  } catch (error: any) {
    console.error('[dad-report-card][GET]', error);
    return jsonError(500, error?.message || 'Unable to load Director of Agent Development report card');
  }
}

export async function POST(req: NextRequest) {
  const caller = await requireAdminLike(req);
  if (!caller) return jsonError(403, 'Administrator or staff access required');

  try {
    const body = await req.json();
    const year = Number(body.year || new Date().getFullYear());
    if (!Number.isInteger(year) || year < 2018 || year > 2100) return jsonError(400, 'Invalid year');

    if (body.action === 'savePlan') {
      const monthlyGoals = body.monthlyGoals || {};
      const dadGoals = {
        directorName: String(body.directorName || DEFAULT_PLAN.directorName).trim().slice(0, 80) || DEFAULT_PLAN.directorName,
        monthlyGoals: {
          teamAppointments: sanitizeNumber(monthlyGoals.teamAppointments, DEFAULT_PLAN.monthlyGoals.teamAppointments),
          callNightHours: sanitizeNumber(monthlyGoals.callNightHours, DEFAULT_PLAN.monthlyGoals.callNightHours),
          recruitingWorkshops: sanitizeNumber(monthlyGoals.recruitingWorkshops, DEFAULT_PLAN.monthlyGoals.recruitingWorkshops),
          buyerSellerWorkshops: sanitizeNumber(monthlyGoals.buyerSellerWorkshops, DEFAULT_PLAN.monthlyGoals.buyerSellerWorkshops),
          networkingEvents: sanitizeNumber(monthlyGoals.networkingEvents, DEFAULT_PLAN.monthlyGoals.networkingEvents),
          ypnEventsScheduled: sanitizeNumber(monthlyGoals.ypnEventsScheduled, DEFAULT_PLAN.monthlyGoals.ypnEventsScheduled),
          salesMeetings: sanitizeNumber(monthlyGoals.salesMeetings, DEFAULT_PLAN.monthlyGoals.salesMeetings),
          huddles: sanitizeNumber(monthlyGoals.huddles, DEFAULT_PLAN.monthlyGoals.huddles),
          rolePlaySessions: sanitizeNumber(monthlyGoals.rolePlaySessions, DEFAULT_PLAN.monthlyGoals.rolePlaySessions),
          trainingSessions: sanitizeNumber(monthlyGoals.trainingSessions, DEFAULT_PLAN.monthlyGoals.trainingSessions),
          newAgentFollowUps: sanitizeNumber(monthlyGoals.newAgentFollowUps, DEFAULT_PLAN.monthlyGoals.newAgentFollowUps),
          recruitingFollowUpsDaily: sanitizeNumber(monthlyGoals.recruitingFollowUpsDaily, DEFAULT_PLAN.monthlyGoals.recruitingFollowUpsDaily),
          recruitingFollowUpsWeekly: sanitizeNumber(monthlyGoals.recruitingFollowUpsWeekly, DEFAULT_PLAN.monthlyGoals.recruitingFollowUpsWeekly),
          recruitingFollowUpsMonthly: sanitizeNumber(monthlyGoals.recruitingFollowUpsMonthly, DEFAULT_PLAN.monthlyGoals.recruitingFollowUpsMonthly),
        },
        customKpis: normalizeCustomKpis(body.customKpis),
        updatedAt: new Date().toISOString(),
        updatedByUid: caller.uid,
      };
      await adminDb.collection('recruitingPlans').doc(String(year)).set({ dadGoals }, { merge: true });
      return NextResponse.json({ ok: true, plan: normalizePlan({ dadGoals }) });
    }

    if (body.action === 'logActivity') {
      const activityType = String(body.activityType || '');
      const occurredOn = isoDate(body.occurredOn);
      if (!ACTIVITY_TYPES.has(activityType)) return jsonError(400, 'Invalid activity type');
      if (!occurredOn || !occurredOn.startsWith(String(year))) return jsonError(400, 'Activity date must be within the selected year');
      const count = sanitizeNumber(body.count, 1);
      const durationHours = sanitizeNumber(body.durationHours, 0);
      if (activityType === 'call_night' && durationHours <= 0) return jsonError(400, 'Call Night requires hours');
      if (activityType === 'new_agent_welcome_call' && !String(body.relatedAgentId || '').trim()) return jsonError(400, 'Select the new agent who received the call');
      if (activityType === 'new_agent_follow_up' && !String(body.relatedAgentId || '').trim()) return jsonError(400, 'Select the new agent who received follow-up');
      if (activityType === 'in_person_relationship_meeting' && !String(body.title || '').trim()) return jsonError(400, 'Enter the person met');
      if (activityType === 'in_person_relationship_meeting' && !['retention', 'recruiting'].includes(String(body.relationshipPurpose || ''))) return jsonError(400, 'Choose retention or recruiting as the meeting purpose');
      if (activityType === 'custom' && !String(body.customKpiId || '').trim()) return jsonError(400, 'Select the custom KPI being tracked');

      const activity = {
        year,
        activityType,
        occurredOn,
        title: String(body.title || '').trim().slice(0, 120),
        count,
        durationHours,
        relatedAgentId: String(body.relatedAgentId || '').trim() || null,
        relatedAgentName: String(body.relatedAgentName || '').trim().slice(0, 120) || null,
        recruiterName: String(body.recruiterName || DEFAULT_PLAN.directorName).trim().slice(0, 120) || DEFAULT_PLAN.directorName,
        recruiterId: String(body.recruiterId || '').trim() || null,
        organization: String(body.organization || '').trim().slice(0, 120) || null,
        relationshipPurpose: ['retention', 'recruiting'].includes(String(body.relationshipPurpose || '')) ? body.relationshipPurpose : null,
        customKpiId: String(body.customKpiId || '').trim().slice(0, 60) || null,
        notes: String(body.notes || '').trim().slice(0, 2000) || null,
        createdAt: new Date().toISOString(),
        createdByUid: caller.uid,
      };
      const ref = await adminDb.collection('directorDevelopmentActivities').add(activity);
      return NextResponse.json({ ok: true, activity: { id: ref.id, ...activity } });
    }

    if (body.action === 'deleteActivity') {
      const id = String(body.id || '').trim();
      if (!id) return jsonError(400, 'Activity id is required');
      const ref = adminDb.collection('directorDevelopmentActivities').doc(id);
      const existing = await ref.get();
      if (!existing.exists) return jsonError(404, 'Activity not found');
      if (Number(existing.data()?.year) !== year) return jsonError(400, 'Activity does not belong to the selected year');
      await ref.delete();
      return NextResponse.json({ ok: true });
    }

    return jsonError(400, 'Unknown action');
  } catch (error: any) {
    console.error('[dad-report-card][POST]', error);
    return jsonError(500, error?.message || 'Unable to save Director of Agent Development data');
  }
}
