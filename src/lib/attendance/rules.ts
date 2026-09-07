export const CENTRAL_TIME_ZONE = 'America/Chicago';

export const SCHEDULED_ATTENDANCE_EVENTS = {
  huddle: {
    label: 'Team Huddle',
    days: ['Tue', 'Thu'],
    startLabel: '8:30 AM',
    endLabel: '9:00 AM',
    startMinutes: 8 * 60 + 30,
    opensMinutes: 8 * 60 + 15,
    closesMinutes: 9 * 60 + 5,
    required: true,
  },
  training: {
    label: 'Optional Training',
    days: ['Tue', 'Thu'],
    startLabel: '9:00 AM',
    endLabel: '10:00 AM',
    startMinutes: 9 * 60,
    opensMinutes: 8 * 60 + 45,
    closesMinutes: 10 * 60 + 5,
    required: false,
  },
  sales_meeting: {
    label: 'Optional Sales Meeting',
    days: ['Wed'],
    startLabel: '9:00 AM',
    endLabel: '10:00 AM',
    startMinutes: 9 * 60,
    opensMinutes: 8 * 60 + 45,
    closesMinutes: 10 * 60 + 5,
    required: false,
  },
  role_play_ids: {
    label: 'Role Play / New Agent IDS',
    days: ['Wed'],
    startLabel: '10:00 AM',
    endLabel: '11:00 AM',
    startMinutes: 10 * 60,
    opensMinutes: 9 * 60 + 45,
    closesMinutes: 11 * 60 + 5,
    required: true,
  },
} as const;

export type ScheduledAttendanceEvent = keyof typeof SCHEDULED_ATTENDANCE_EVENTS;

export const FLOOR_TIME_REQUIREMENTS = {
  weeklyShiftCount: 2,
  weeklyShiftMinutes: 180,
  monthlyWeekendShiftCount: 1,
  monthlyWeekendShiftMinutes: 240,
} as const;

type CentralParts = { date: string; weekday: string; minutes: number };

export function centralParts(now = new Date()): CentralParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: CENTRAL_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now).reduce<Record<string, string>>((result, part) => {
    if (part.type !== 'literal') result[part.type] = part.value;
    return result;
  }, {});

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: parts.weekday,
    minutes: Number(parts.hour || 0) * 60 + Number(parts.minute || 0),
  };
}

export function ymdToDate(value: string) {
  return new Date(`${value}T00:00:00Z`);
}

export function toYmd(value: Date) {
  return value.toISOString().slice(0, 10);
}

export function addDays(value: string, days: number) {
  const date = ymdToDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return toYmd(date);
}

export function mondayFor(value: string) {
  const day = ymdToDate(value).getUTCDay();
  return addDays(value, day === 0 ? -6 : 1 - day);
}

export function monthStartFor(value: string) {
  return `${value.slice(0, 7)}-01`;
}

export function isWeekend(value: string) {
  const day = ymdToDate(value).getUTCDay();
  return day === 0 || day === 6;
}

export function isScheduledAttendanceEvent(value: string): value is ScheduledAttendanceEvent {
  return value in SCHEDULED_ATTENDANCE_EVENTS;
}

export function scheduledEventWindow(eventType: ScheduledAttendanceEvent, now = new Date()) {
  const nowCentral = centralParts(now);
  const event = SCHEDULED_ATTENDANCE_EVENTS[eventType];
  const eligible = event.days.includes(nowCentral.weekday as never)
    && nowCentral.minutes >= event.opensMinutes
    && nowCentral.minutes <= event.closesMinutes;
  return { ...nowCentral, ...event, eligible };
}

export function floorTimeSummary(records: Array<Record<string, any>>, today: string) {
  const weekStart = mondayFor(today);
  const weekEnd = addDays(weekStart, 6);
  const monthStart = monthStartFor(today);
  const floorTime = records.filter(record => record.type === 'floor_time');
  const completedThisWeek = floorTime.filter(record => {
    const duration = Number(record.durationMinutes || 0);
    return record.date >= weekStart && record.date <= weekEnd && Boolean(record.checkOutAt) && duration >= FLOOR_TIME_REQUIREMENTS.weeklyShiftMinutes;
  });
  const completedWeekendThisMonth = floorTime.filter(record => {
    const duration = Number(record.durationMinutes || 0);
    return record.date >= monthStart && record.date <= today && Boolean(record.checkOutAt)
      && isWeekend(String(record.date || '')) && duration >= FLOOR_TIME_REQUIREMENTS.monthlyWeekendShiftMinutes;
  });
  const openShift = floorTime
    .filter(record => !record.checkOutAt)
    .sort((a, b) => String(b.checkInAt || '').localeCompare(String(a.checkInAt || '')))[0] || null;

  return {
    weekStart,
    weekEnd,
    monthStart,
    qualifyingWeeklyShifts: completedThisWeek.length,
    weeklyShiftGoal: FLOOR_TIME_REQUIREMENTS.weeklyShiftCount,
    weeklyShiftMinutes: FLOOR_TIME_REQUIREMENTS.weeklyShiftMinutes,
    qualifyingWeekendShifts: completedWeekendThisMonth.length,
    weekendShiftGoal: FLOOR_TIME_REQUIREMENTS.monthlyWeekendShiftCount,
    weekendShiftMinutes: FLOOR_TIME_REQUIREMENTS.monthlyWeekendShiftMinutes,
    openShift,
  };
}
