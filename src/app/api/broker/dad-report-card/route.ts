import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';
import { centralParts } from '@/lib/attendance/rules';
import { calculateOperationalMeetingEligibility } from '@/lib/agent-development/operationalMeetingEligibility';
import { classifyAgentLifecycle } from '@/lib/agents/lifecycle';
import { assessTeamAppointmentThreshold, TEAM_APPOINTMENT_THRESHOLDS } from '@/lib/agent-development/teamAppointmentThresholds';
import { calculateStartDatePacing, isValidReportCardEffectiveStart, resolveReportCardEffectiveStart, type GoalCadence } from '@/lib/report-cards/startDatePacing';

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
  effectiveStartDate: string | null;
  effectiveStartHistory: Array<{ from: string | null; to: string | null; changedAt: string; changedByUid: string }>;
  updatedAt: string | null;
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
  effectiveStartDate: null,
  effectiveStartHistory: [],
  updatedAt: null,
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

type DirectorMetricSection = 'agent_development' | 'recruiting_activity';

/**
 * SBUSA-012 presentation taxonomy only. Metric calculations and score ownership
 * remain in the single enrichedMetrics array below; consumers use this metadata
 * to render each metric exactly once under the appropriate Production section.
 */
const DIRECTOR_METRIC_PRESENTATION: Record<string, { section: DirectorMetricSection; order: number }> = {
  weekly_new_agent_one_on_ones: { section: 'agent_development', order: 10 },
  monthly_under_year_one_on_ones: { section: 'agent_development', order: 20 },
  monthly_no_production_one_on_ones: { section: 'agent_development', order: 30 },
  quarterly_strategy_one_on_ones: { section: 'agent_development', order: 40 },
  new_agent_follow_ups: { section: 'agent_development', order: 50 },
  valid_call_nights_monthly: { section: 'agent_development', order: 60 },
  buyer_seller_workshops: { section: 'agent_development', order: 70 },
  team_appointments_monthly: { section: 'agent_development', order: 80 },
  recruiting_workshops: { section: 'recruiting_activity', order: 10 },
  ypn_events: { section: 'recruiting_activity', order: 20 },
  qualifying_events: { section: 'recruiting_activity', order: 30 },
  weekly_relationship_meetings: { section: 'recruiting_activity', order: 40 },
  new_agent_welcome_calls: { section: 'recruiting_activity', order: 50 },
  recruiting_follow_ups_daily: { section: 'recruiting_activity', order: 60 },
  recruiting_follow_ups_weekly: { section: 'recruiting_activity', order: 70 },
  recruiting_follow_ups_monthly: { section: 'recruiting_activity', order: 80 },
};

function directorMetricPresentation(key: string): { section: DirectorMetricSection; order: number } {
  return DIRECTOR_METRIC_PRESENTATION[key] || { section: 'agent_development', order: 1000 };
}

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
    effectiveStartDate: isoDate(raw?.dadGoals?.effectiveStartDate ?? raw?.effectiveStartDate),
    effectiveStartHistory: Array.isArray(raw?.dadGoals?.effectiveStartHistory ?? raw?.effectiveStartHistory)
      ? (raw?.dadGoals?.effectiveStartHistory ?? raw?.effectiveStartHistory)
          .map((entry: any) => ({
            from: isoDate(entry?.from),
            to: isoDate(entry?.to),
            changedAt: String(entry?.changedAt || ''),
            changedByUid: String(entry?.changedByUid || ''),
          }))
          .filter((entry: any) => entry.changedAt)
          .slice(-50)
      : [],
    updatedAt: typeof (raw?.dadGoals?.updatedAt ?? raw?.updatedAt) === 'string' ? (raw?.dadGoals?.updatedAt ?? raw?.updatedAt) : null,
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
    const effectiveStartDate = resolveReportCardEffectiveStart(year, plan.effectiveStartDate, reportEnd);
    const agentInputs = profileSnap.docs
      .map(doc => {
        const profile = doc.data() as any;
        const status = String(profile.status || profile.agentStatus || 'active').toLowerCase();
        return {
          agentId: String(profile.agentId || doc.id),
          name: String(profile.displayName || profile.name || `${profile.firstName || ''} ${profile.lastName || ''}`.trim() || doc.id),
          startDate: isoDate(profile.startDate),
          status,
          inactiveDate: isoDate(profile.inactiveDate),
          endDate: isoDate(profile.endDate),
          departureDate: isoDate(profile.departureDate),
          teamGroup: String(profile.teamGroup || ''),
          identityKeys: [doc.id, profile.agentId, profile.uid, profile.firebaseUid],
        };
      })
      .filter(agent => agent.startDate && agent.startDate <= reportEnd);
    const agents = agentInputs.map(agent => ({ ...agent, active: classifyAgentLifecycle(agent, reportEnd).status === 'active' }));
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
            const adjustedStart = start > effectiveStartDate ? start : effectiveStartDate;
            if (!within(date, adjustedStart, end)) return false;
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

    // Preserve the complete activity log while using only activity on or after
    // the configured effective start for cumulative pacing and scorecard data.
    const pacedActivities = activities.filter(activity => {
      const date = isoDate(activity.occurredOn);
      return Boolean(date && date >= effectiveStartDate);
    });

    const activityTotal = (type: string, field = 'count') => pacedActivities
      .filter(activity => activity.activityType === type)
      .reduce((total, activity) => total + sanitizeNumber(activity[field], field === 'count' ? 1 : 0), 0);
    const pacedActivityTotal = (type: string, field = 'count') => pacedActivities
      .filter(activity => activity.activityType === type)
      .reduce((total, activity) => total + sanitizeNumber(activity[field], field === 'count' ? 1 : 0), 0);
    const distinctActivityAgents = (type: string) => new Set(
      pacedActivities.filter(activity => activity.activityType === type && activity.relatedAgentId).map(activity => String(activity.relatedAgentId))
    );

    const welcomeIds = distinctActivityAgents('new_agent_welcome_call');
    const welcomeCovered = newAgentsThisYear.filter(agent => welcomeIds.has(agent.agentId));
    const welcomeMissing = newAgentsThisYear
      .filter(agent => !welcomeIds.has(agent.agentId))
      .map(agent => ({ agentId: agent.agentId, name: agent.name }));

    const relationshipMeetingsThisWeek = pacedActivities.filter(activity =>
      activity.activityType === 'in_person_relationship_meeting'
      && String(activity.recruiterName || plan.directorName).trim().toLowerCase() === plan.directorName.trim().toLowerCase()
      && within(isoDate(activity.occurredOn), weekStart, weekEnd)
    );
    const currentMonthActivities = pacedActivities.filter(activity => within(isoDate(activity.occurredOn), monthStart, monthEnd));
    const currentMonthActivityTotal = (type: string) => currentMonthActivities
      .filter(activity => activity.activityType === type)
      .reduce((total, activity) => total + sanitizeNumber(activity.count, 1), 0);
    const teamAppointmentStatus = assessTeamAppointmentThreshold(currentMonthActivityTotal('team_appointments'));
    const callNightsThisMonth = currentMonthActivities.filter(activity => activity.activityType === 'call_night');
    const validCallNightsThisMonth = callNightsThisMonth.filter(activity => sanitizeNumber(activity.durationHours, 0) >= 3);
    const shortCallNightsThisMonth = callNightsThisMonth.filter(activity => sanitizeNumber(activity.durationHours, 0) < 3);
    const callNightStatus = validCallNightsThisMonth.length >= 2
      ? { grade: 'Meets Target', pct: 100 }
      : validCallNightsThisMonth.length === 1
        ? { grade: 'Meets Minimum', pct: 50 }
        : { grade: 'Below Minimum', pct: 0 };
    // Recruiting-pipeline contact history is the canonical prospect follow-up
    // system. It deliberately does not read or write new-agent activity records,
    // and retains contacts for every pipeline status, including legacy test-agent
    // classifications when present in historical candidate data.
    const recruitingFollowUps = recruitingActivitySnap.docs
      .map(doc => doc.data() as any)
      .filter(activity => ['call', 'email', 'text', 'meeting'].includes(String(activity.type || '')))
      .filter(activity => within(isoDate(activity.createdAt), effectiveStartDate, reportEnd));
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
      {
        key: 'valid_call_nights_monthly',
        label: 'Valid Call Nights — This Month',
        actual: validCallNightsThisMonth.length,
        goal: 2,
        unit: 'valid nights',
        detail: shortCallNightsThisMonth.length
          ? `${shortCallNightsThisMonth.length} logged call night${shortCallNightsThisMonth.length === 1 ? '' : 's'} under 180 minutes ${shortCallNightsThisMonth.length === 1 ? 'does' : 'do'} not count toward the monthly minimum.`
          : 'A valid call night is at least 180 minutes. One valid night meets minimum; two or more meet target.',
        missingAgents: [],
        ...callNightStatus,
      },
      makeMetric('recruiting_workshops', 'Recruiting Workshops', activityTotal('recruiting_workshop'), plan.monthlyGoals.recruitingWorkshops * monthsElapsed, 'workshops', `Target is ${plan.monthlyGoals.recruitingWorkshops} recruiting workshop(s) per month.`),
      makeMetric('buyer_seller_workshops', 'Buyer & Seller Workshops', activityTotal('buyer_seller_workshop'), plan.monthlyGoals.buyerSellerWorkshops * monthsElapsed, 'workshops', `Target is ${plan.monthlyGoals.buyerSellerWorkshops} buyer/seller workshop(s) per month.`),
      makeMetric('ypn_events', 'YPN Events Attended', activityTotal('ypn_event'), plan.monthlyGoals.ypnEventsScheduled * monthsElapsed, 'events', 'Set the number of scheduled YPN events in Goals; attendance is expected at every scheduled event.'),
      makeMetric('qualifying_events', 'Qualifying Networking Events', activityTotal('ypn_event') + activityTotal('partner_event'), plan.monthlyGoals.networkingEvents * monthsElapsed, 'events', `Target is ${plan.monthlyGoals.networkingEvents} YPN, mortgage, builder, or RCA event(s) per month.`),
      {
        key: 'team_appointments_monthly',
        label: 'Team Appointments — This Month',
        actual: teamAppointmentStatus.actual,
        goal: teamAppointmentStatus.goal,
        unit: 'appointments',
        detail: `Approved monthly thresholds: below ${TEAM_APPOINTMENT_THRESHOLDS.minimum} is Below Minimum; ${TEAM_APPOINTMENT_THRESHOLDS.minimum}–${TEAM_APPOINTMENT_THRESHOLDS.target - 1} Meets Minimum; ${TEAM_APPOINTMENT_THRESHOLDS.target}+ Meets Target.`,
        missingAgents: [],
        grade: teamAppointmentStatus.status,
        pct: teamAppointmentStatus.pct,
      },
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

    const metricDefinitions: Record<string, { definition: string; source: string; basis: string; cadence: GoalCadence; cumulative: boolean }> = {
      weekly_new_agent_one_on_ones: { definition: 'Completed weekly operational one-on-ones for agents assigned to the 1–90-day category.', source: 'oneOnOnes completion records plus shared operational eligibility.', basis: 'Selected week snapshot', cadence: 'snapshot', cumulative: false },
      monthly_under_year_one_on_ones: { definition: 'Completed monthly operational one-on-ones for qualifying agents under one year.', source: 'oneOnOnes completion records plus shared operational eligibility.', basis: 'Selected month snapshot', cadence: 'snapshot', cumulative: false },
      monthly_no_production_one_on_ones: { definition: 'Completed monthly one-on-ones for eligible agents with no closed or pending activity in the inclusive last 60 days.', source: 'oneOnOnes completion records, transactions, and shared operational eligibility.', basis: 'Selected month snapshot', cadence: 'snapshot', cumulative: false },
      quarterly_strategy_one_on_ones: { definition: 'Completed quarterly strategy one-on-ones with documented completion notes.', source: 'oneOnOnes completion records plus active-agent roster.', basis: 'Selected quarter snapshot', cadence: 'snapshot', cumulative: false },
      weekly_relationship_meetings: { definition: 'In-person coffee or lunch relationship meetings logged for the named Director.', source: 'directorDevelopmentActivities.', basis: 'Selected week', cadence: 'weekly', cumulative: false },
      new_agent_follow_ups: { definition: 'New-agent onboarding follow-up activities logged for the selected month.', source: 'directorDevelopmentActivities.', basis: 'Selected month', cadence: 'monthly', cumulative: false },
      recruiting_follow_ups_daily: { definition: 'Completed recruiting prospect calls, emails, texts, or meetings.', source: 'recruitingPipelineActivity.', basis: 'Selected day', cadence: 'daily', cumulative: false },
      recruiting_follow_ups_weekly: { definition: 'Completed recruiting prospect calls, emails, texts, or meetings.', source: 'recruitingPipelineActivity.', basis: 'Selected week', cadence: 'weekly', cumulative: false },
      recruiting_follow_ups_monthly: { definition: 'Completed recruiting prospect calls, emails, texts, or meetings.', source: 'recruitingPipelineActivity.', basis: 'Selected month', cadence: 'monthly', cumulative: false },
      valid_call_nights_monthly: { definition: 'Call nights lasting at least 180 minutes.', source: 'directorDevelopmentActivities durationHours.', basis: 'Selected month threshold', cadence: 'threshold', cumulative: false },
      recruiting_workshops: { definition: 'Recruiting workshops logged by the named Director.', source: 'directorDevelopmentActivities.', basis: 'Start-date-adjusted year to date', cadence: 'monthly', cumulative: true },
      buyer_seller_workshops: { definition: 'Buyer and seller workshops logged by the named Director.', source: 'directorDevelopmentActivities.', basis: 'Start-date-adjusted year to date', cadence: 'monthly', cumulative: true },
      ypn_events: { definition: 'YPN attendance activities logged by the named Director.', source: 'directorDevelopmentActivities.', basis: 'Start-date-adjusted year to date', cadence: 'monthly', cumulative: true },
      qualifying_events: { definition: 'YPN, mortgage, builder, or RCA networking events logged by the named Director.', source: 'directorDevelopmentActivities.', basis: 'Start-date-adjusted year to date', cadence: 'monthly', cumulative: true },
      team_appointments_monthly: { definition: 'Team appointments logged by the named Director.', source: 'directorDevelopmentActivities.', basis: 'Selected month threshold', cadence: 'threshold', cumulative: false },
      new_agent_welcome_calls: { definition: 'Distinct new agents with a tracked welcome call.', source: 'directorDevelopmentActivities plus agent profiles.', basis: 'Selected-year coverage snapshot', cadence: 'snapshot', cumulative: false },
    };
    const cumulativeActuals: Record<string, number> = {
      recruiting_workshops: pacedActivityTotal('recruiting_workshop'),
      buyer_seller_workshops: pacedActivityTotal('buyer_seller_workshop'),
      ypn_events: pacedActivityTotal('ypn_event'),
      qualifying_events: pacedActivityTotal('ypn_event') + pacedActivityTotal('partner_event'),
      ...Object.fromEntries(plan.customKpis.filter(item => item.active).map(kpi => [
        `custom_${kpi.id}`,
        pacedActivities.filter(activity => activity.activityType === 'custom' && activity.customKpiId === kpi.id)
          .reduce((total, activity) => total + sanitizeNumber(activity.count, 1), 0),
      ])),
    };
    const enrichedMetrics = metrics.map(metric => {
      const definition = metricDefinitions[metric.key] || {
        definition: metric.key.startsWith('custom_') ? 'Custom KPI activity selected in the Director Goals configuration.' : metric.detail,
        source: 'directorDevelopmentActivities.',
        basis: metric.key.startsWith('custom_') ? 'Start-date-adjusted year to date' : 'Approved report-card period',
        cadence: 'monthly' as GoalCadence,
        cumulative: metric.key.startsWith('custom_'),
      };
      const rawGoal = metric.goal > 0 ? metric.goal : null;
      const pacing = calculateStartDatePacing({
        year,
        configuredStartDate: plan.effectiveStartDate,
        asOfDate: reportEnd,
        actual: definition.cumulative ? (cumulativeActuals[metric.key] ?? metric.actual) : metric.actual,
        nativeGoal: definition.cumulative && rawGoal !== null ? rawGoal / Math.max(1, monthsElapsed) : rawGoal,
        nativeCadence: definition.cadence,
        cumulative: definition.cumulative,
      });
      const paceGrade = pacing.pct == null ? { pct: null, grade: '—' } : gradeFor(pacing.pct, 100);
      const displayMetric = definition.cumulative && pacing.ytdGoal !== null
        ? { ...metric, actual: pacing.ytdActual!, goal: pacing.ytdGoal, ...paceGrade, primaryBasis: 'Start-date-adjusted YTD pacing' }
        : { ...metric, primaryBasis: definition.basis };
      return {
        ...displayMetric,
        ...directorMetricPresentation(metric.key),
        information: {
          metricName: metric.label,
          definition: definition.definition,
          dataSource: definition.source,
          evaluationBasis: definition.basis,
          effectiveStartDate,
          asOfDate: reportEnd,
          originalGoal: rawGoal,
          originalCadence: definition.cadence,
          weeklyPace: pacing.weeklyPace,
          ytdGoal: pacing.ytdGoal,
          ytdActual: pacing.ytdActual,
          catchUpNeeded: pacing.catchUpNeeded,
          aheadBy: pacing.aheadBy,
          lastUpdated: plan.updatedAt,
        },
      };
    });
    const scoredMetrics = enrichedMetrics.filter(metric => metric.pct !== null);
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
      scorecard: { metrics: enrichedMetrics, overallPct, overallGrade, scoredMetricCount: scoredMetrics.length },
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
      const planRef = adminDb.collection('recruitingPlans').doc(String(year));
      const previousPlanSnap = await planRef.get();
      const previousPlan = normalizePlan(previousPlanSnap.exists ? previousPlanSnap.data() : null);
      const hasEffectiveStartUpdate = Object.prototype.hasOwnProperty.call(body, 'effectiveStartDate');
      const nextEffectiveStartDate = hasEffectiveStartUpdate
        ? (body.effectiveStartDate ? String(body.effectiveStartDate) : null)
        : previousPlan.effectiveStartDate;
      const asOfDate = centralParts().date;
      if (!isValidReportCardEffectiveStart(nextEffectiveStartDate, year, asOfDate)) {
        return jsonError(400, 'Effective start date must be a valid date and cannot be in the future');
      }
      const updatedAt = new Date().toISOString();
      const effectiveStartHistory = previousPlan.effectiveStartDate === nextEffectiveStartDate
        ? previousPlan.effectiveStartHistory
        : [...previousPlan.effectiveStartHistory, {
            from: previousPlan.effectiveStartDate,
            to: nextEffectiveStartDate,
            changedAt: updatedAt,
            changedByUid: caller.uid,
          }].slice(-50);
      const dadGoals = {
        directorName: String(body.directorName || DEFAULT_PLAN.directorName).trim().slice(0, 80) || DEFAULT_PLAN.directorName,
        effectiveStartDate: nextEffectiveStartDate,
        effectiveStartHistory,
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
        updatedAt,
        updatedByUid: caller.uid,
      };
      await planRef.set({ dadGoals }, { merge: true });
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
