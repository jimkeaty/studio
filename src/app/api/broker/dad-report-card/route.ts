import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';

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
    const year = Number(new URL(req.url).searchParams.get('year') || new Date().getFullYear());
    if (!Number.isInteger(year) || year < 2018 || year > 2100) return jsonError(400, 'Invalid year');

    const today = ymd(new Date());
    const reportEnd = year === new Date().getUTCFullYear() ? today : `${year}-12-31`;
    const reportMonth = Number(reportEnd.slice(5, 7));
    const monthsElapsed = year === new Date().getUTCFullYear() ? reportMonth : 12;
    const monthStart = `${reportEnd.slice(0, 7)}-01`;
    const monthEnd = ymd(new Date(Date.UTC(year, reportMonth, 0)));
    const weekStart = getWeekStart(reportEnd);
    const weekEnd = ymd(addDays(fromYmd(weekStart), 6));
    const quarterStart = getQuarterStart(reportEnd);

    const [planSnap, profileSnap, oneOnOneSnap, activitySnap, attendanceSnap, closedSnap, pendingSnap] = await Promise.all([
      adminDb.collection('recruitingPlans').doc(String(year)).get(),
      adminDb.collection('agentProfiles').get(),
      adminDb.collection('oneOnOnes').get(),
      adminDb.collection('directorDevelopmentActivities').where('year', '==', year).get(),
      adminDb.collection('agentAttendance').get(),
      adminDb.collection('transactions').where('status', '==', 'closed').get(),
      adminDb.collection('transactions').where('status', 'in', ['pending', 'under_contract']).get(),
    ]);

    const plan = normalizePlan(planSnap.exists ? planSnap.data() : null);
    const agents = profileSnap.docs
      .map(doc => {
        const profile = doc.data() as any;
        const status = String(profile.status || profile.agentStatus || 'active').toLowerCase();
        return {
          agentId: String(profile.agentId || doc.id),
          name: String(profile.displayName || profile.name || `${profile.firstName || ''} ${profile.lastName || ''}`.trim() || doc.id),
          startDate: isoDate(profile.startDate),
          status,
          active: !INACTIVE_STATUSES.has(status),
          teamGroup: String(profile.teamGroup || ''),
        };
      })
      .filter(agent => agent.startDate && agent.startDate <= reportEnd);

    const activeAgents = agents.filter(agent => agent.active);
    const newAgent90 = activeAgents.filter(agent => agent.startDate! > ymd(addDays(fromYmd(reportEnd), -90)));
    const agentsUnderYear = activeAgents.filter(agent => agent.startDate! > ymd(addDays(fromYmd(reportEnd), -365)));
    const newAgentsThisYear = agents.filter(agent => agent.startDate!.startsWith(String(year)) && agent.startDate! <= reportEnd);

    const closedAgentIds = new Set<string>();
    for (const doc of closedSnap.docs) {
      const tx = doc.data() as any;
      const date = isoDate(tx.closedDate);
      if (!within(date, `${year}-01-01`, reportEnd)) continue;
      for (const id of [tx.agentId, tx.coAgentId].filter(Boolean)) closedAgentIds.add(String(id));
    }
    const pendingAgentIds = new Set<string>();
    for (const doc of pendingSnap.docs) {
      const tx = doc.data() as any;
      for (const id of [tx.agentId, tx.coAgentId].filter(Boolean)) pendingAgentIds.add(String(id));
    }
    const noProductionOrPending = activeAgents.filter(agent => !closedAgentIds.has(agent.agentId) && !pendingAgentIds.has(agent.agentId));

    const completedMeetings = oneOnOneSnap.docs
      .map(doc => ({ id: doc.id, ...(doc.data() as any) }))
      .filter(meeting => {
        const date = isoDate(meeting.scheduledDate);
        return Boolean(date && (meeting.completedAt || meeting.completed === true || meeting.status === 'completed'));
      });

    const coveredIds = (
      target: typeof activeAgents,
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
    const monthlyUnderYear = coveredIds(agentsUnderYear, monthStart, monthEnd, false, new Set(['weekly_90day', 'weekly', 'monthly_cgl', 'monthly', 'quarterly_strategy']));
    const monthlyNoProduction = coveredIds(noProductionOrPending, monthStart, monthEnd, false, new Set(['monthly_no_production', 'monthly_cgl', 'monthly', 'quarterly_strategy']));
    const quarterlyAll = coveredIds(activeAgents, quarterStart, reportEnd, true, new Set(['quarterly_strategy']));

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
    const attendanceRecords = attendanceSnap.docs
      .map(doc => ({ id: doc.id, ...(doc.data() as any) }))
      .filter(record => within(isoDate(record.date), monthStart, monthEnd));
    const attendanceCount = (type: string) => attendanceRecords.filter(record => record.type === type).length;
    const trainingSessionIds = new Set(attendanceRecords.filter(record => record.type === 'training' && record.sessionId).map(record => String(record.sessionId)));

    const metrics = [
      makeMetric('weekly_new_agent_one_on_ones', 'New Agent 1:1s — This Week', weeklyNew.actual, newAgent90.length, 'agents', 'Each agent in the first 90 days should have one completed 1:1 this Monday–Sunday.', weeklyNew.missing),
      makeMetric('monthly_under_year_one_on_ones', 'Agents Under 1 Year — This Month', monthlyUnderYear.actual, agentsUnderYear.length, 'agents', 'Each active agent with less than one year of tenure should have one completed 1:1 this month.', monthlyUnderYear.missing),
      makeMetric('monthly_no_production_one_on_ones', 'No Production / Pending — This Month', monthlyNoProduction.actual, noProductionOrPending.length, 'agents', 'Tracks active agents with no closed deal year-to-date and no current pending file.', monthlyNoProduction.missing),
      makeMetric('quarterly_strategy_one_on_ones', 'All-Agent Strategy 1:1s — This Quarter', quarterlyAll.actual, activeAgents.length, 'agents', 'Requires a completed quarterly 1:1 with completion notes and a strategic plan.', quarterlyAll.missing),
      makeMetric('weekly_relationship_meetings', 'In-Person Coffee / Lunch Meetings — This Week', relationshipMeetingsThisWeek.length, 4, 'meetings', 'Four in-person relationship meetings each week, outside the office, with current agents or recruiting prospects.'),
      makeMetric('sales_meetings', 'Sales Meetings — This Month', currentMonthActivityTotal('sales_meeting'), plan.monthlyGoals.salesMeetings, 'meetings', 'Track individual or group sales meetings led by the Director. Set a monthly goal when a required cadence is established.'),
      makeMetric('huddles_led', 'Team Huddles — This Month', currentMonthActivityTotal('huddle'), plan.monthlyGoals.huddles, 'huddles', 'The standard is two huddles per week: Tuesday and Thursday at 8:30 AM.'),
      makeMetric('role_play_ids_led', 'Role Play / New Agent IDS — This Month', currentMonthActivityTotal('role_play_ids'), plan.monthlyGoals.rolePlaySessions, 'sessions', 'The standard is one Wednesday role play or New Agent IDS session each week at 10:00 AM.'),
      makeMetric('training_sessions', 'Training Sessions — This Month', currentMonthActivityTotal('training_session'), plan.monthlyGoals.trainingSessions, 'sessions', 'Log each training session led by Ethan. Participant attendance is tracked separately from the recorded roster.'),
      makeMetric('training_participants', 'Training Attendance — This Month', attendanceCount('training'), 0, 'agent attendances', `${trainingSessionIds.size} training session${trainingSessionIds.size === 1 ? '' : 's'} recorded with named participants this month.`),
      makeMetric('huddle_attendance', 'Huddle Attendance — This Month', attendanceCount('huddle'), 0, 'agent attendances', 'QR scans record each participating agent for Tuesday and Thursday huddles.'),
      makeMetric('role_play_attendance', 'Role Play / IDS Attendance — This Month', attendanceCount('role_play_ids'), 0, 'agent attendances', 'QR scans record each participating agent for Wednesday role play and New Agent IDS.'),
      makeMetric('new_agent_follow_ups', 'New-Agent Follow-Ups — This Month', currentMonthActivityTotal('new_agent_follow_up'), plan.monthlyGoals.newAgentFollowUps, 'follow-ups', 'Log calls, meetings, or direct follow-up with new agents. Set the required monthly goal in Goals.'),
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

    return NextResponse.json({
      ok: true,
      year,
      reportPeriod: { reportEnd, monthStart, monthEnd, weekStart, weekEnd, quarterStart, monthsElapsed },
      plan,
      director: { name: plan.directorName },
      scorecard: { metrics, overallPct, overallGrade, scoredMetricCount: scoredMetrics.length },
      eligibleAgents: {
        active: activeAgents.map(agent => ({ agentId: agent.agentId, name: agent.name, startDate: agent.startDate })),
        newAgent90: newAgent90.map(agent => ({ agentId: agent.agentId, name: agent.name, startDate: agent.startDate })),
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
