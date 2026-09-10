import { CENTRAL_TIME_ZONE, SCHEDULED_ATTENDANCE_EVENTS } from './rules';

export type CglAttendanceProfileInput = {
  agentId: string;
  name?: string | null;
  status?: string | null;
  teamGroup?: string | null;
  primaryTeamId?: string | null;
  startDate?: string | null;
  inactiveDate?: string | null;
  endDate?: string | null;
};

export type CglTeamMembershipInput = {
  agentId?: string | null;
  teamId?: string | null;
  effectiveStart?: string | null;
  effectiveEnd?: string | null;
  activeFlag?: boolean | null;
};

export type CglAttendanceRecordInput = {
  agentId?: string | null;
  type?: string | null;
  date?: string | null;
};

type AttendanceEvent = 'training' | 'huddle' | 'role_play_ids';

export type CglMonthlyAttendanceMetric = {
  type: AttendanceEvent;
  label: string;
  numerator: number;
  denominator: number;
  percentage: number | null;
  eligibleAgentCount: number;
  status: 'threshold_not_configured' | 'no_data';
};

export type CglMonthlyAttendanceResult = {
  month: string;
  throughDate: string;
  metrics: CglMonthlyAttendanceMetric[];
  excludedAgents: Array<{ agentId: string; reason: string }>;
};

const INACTIVE_STATUSES = new Set(['inactive', 'out', 'terminated', 'churned']);
const EVENT_TYPES: AttendanceEvent[] = ['training', 'huddle', 'role_play_ids'];

function ymd(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string') {
    const match = value.match(/^\d{4}-\d{2}-\d{2}/);
    return match ? match[0] : null;
  }
  if (typeof (value as any).toDate === 'function') return (value as any).toDate().toISOString().slice(0, 10);
  return null;
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function monthEnd(month: string) {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
}

function weekday(date: string) {
  return new Intl.DateTimeFormat('en-US', { timeZone: CENTRAL_TIME_ZONE, weekday: 'short' })
    .format(new Date(`${date}T12:00:00Z`));
}

function maxDate(...values: Array<string | null>) {
  const filtered = values.filter((value): value is string => Boolean(value)).sort();
  return filtered.length ? filtered[filtered.length - 1] : null;
}

function minDate(...values: Array<string | null>) {
  const filtered = values.filter((value): value is string => Boolean(value)).sort();
  return filtered.length ? filtered[0] : null;
}

function scheduledDates(type: AttendanceEvent, start: string, end: string) {
  const event = SCHEDULED_ATTENDANCE_EVENTS[type];
  const dates: string[] = [];
  for (let date = start; date <= end; date = addDays(date, 1)) {
    if (event.days.includes(weekday(date) as never)) dates.push(date);
  }
  return dates;
}

/**
 * Calculates completed monthly CGL attendance from agent-recorded records.
 * A denominator is one CGL-agent/event-date opportunity, never a Director-entered count.
 * Thresholds are deliberately absent until they are separately approved and configured.
 */
export function calculateCglMonthlyAttendance(input: {
  month: string;
  asOfDate: string;
  profiles: CglAttendanceProfileInput[];
  memberships: CglTeamMembershipInput[];
  records: CglAttendanceRecordInput[];
}): CglMonthlyAttendanceResult {
  if (!/^\d{4}-\d{2}$/.test(input.month)) throw new Error('month must be YYYY-MM');
  const monthStart = `${input.month}-01`;
  const throughDate = minDate(monthEnd(input.month), ymd(input.asOfDate)) || monthEnd(input.month);
  const opportunities = new Map<AttendanceEvent, Set<string>>(
    EVENT_TYPES.map(type => [type, new Set<string>()]),
  );
  const eligibleAgentIds = new Map<AttendanceEvent, Set<string>>(
    EVENT_TYPES.map(type => [type, new Set<string>()]),
  );
  const excludedAgents: CglMonthlyAttendanceResult['excludedAgents'] = [];

  for (const profile of input.profiles) {
    const agentId = String(profile.agentId || '').trim();
    if (!agentId || String(profile.teamGroup || '').trim().toLowerCase() !== 'cgl') continue;
    const status = String(profile.status || 'active').trim().toLowerCase();
    const membership = input.memberships.find(item => String(item.agentId || '') === agentId
      && String(item.teamId || '') === String(profile.primaryTeamId || ''));
    const teamEntry = ymd(membership?.effectiveStart);
    if (!teamEntry) {
      excludedAgents.push({ agentId, reason: 'missing_cgl_membership_effective_start' });
      continue;
    }
    if (membership?.activeFlag === false && !ymd(membership.effectiveEnd)) {
      excludedAgents.push({ agentId, reason: 'inactive_cgl_membership_without_effective_end' });
      continue;
    }
    if (INACTIVE_STATUSES.has(status) && !ymd(profile.inactiveDate) && !ymd(profile.endDate)) {
      excludedAgents.push({ agentId, reason: 'inactive_lifecycle_without_effective_date' });
      continue;
    }

    const lifecycleEnd = INACTIVE_STATUSES.has(status)
      ? minDate(ymd(profile.inactiveDate), ymd(profile.endDate))
      : null;
    const eligibleStart = maxDate(monthStart, ymd(profile.startDate), teamEntry);
    const eligibleEnd = minDate(throughDate, lifecycleEnd, ymd(membership?.effectiveEnd));
    if (!eligibleStart || !eligibleEnd || eligibleStart > eligibleEnd) continue;

    for (const type of EVENT_TYPES) {
      for (const date of scheduledDates(type, eligibleStart, eligibleEnd)) {
        opportunities.get(type)!.add(`${agentId}:${date}`);
        eligibleAgentIds.get(type)!.add(agentId);
      }
    }
  }

  const attendance = new Map<AttendanceEvent, Set<string>>(
    EVENT_TYPES.map(type => [type, new Set<string>()]),
  );
  for (const record of input.records) {
    const type = String(record.type || '') as AttendanceEvent;
    const agentId = String(record.agentId || '').trim();
    const date = ymd(record.date);
    if (!EVENT_TYPES.includes(type) || !agentId || !date) continue;
    const key = `${agentId}:${date}`;
    if (opportunities.get(type)!.has(key)) attendance.get(type)!.add(key);
  }

  return {
    month: input.month,
    throughDate,
    metrics: EVENT_TYPES.map(type => {
      const denominator = opportunities.get(type)!.size;
      const numerator = attendance.get(type)!.size;
      return {
        type,
        label: SCHEDULED_ATTENDANCE_EVENTS[type].label,
        numerator,
        denominator,
        percentage: denominator ? Math.round((numerator / denominator) * 1000) / 10 : null,
        eligibleAgentCount: eligibleAgentIds.get(type)!.size,
        status: denominator ? 'threshold_not_configured' : 'no_data',
      };
    }),
    excludedAgents,
  };
}
