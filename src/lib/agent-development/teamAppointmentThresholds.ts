export const TEAM_APPOINTMENT_THRESHOLDS = {
  minimum: 100,
  target: 120,
} as const;

export type TeamAppointmentStatus = 'Below Minimum' | 'Meets Minimum' | 'Meets Target';

/**
 * Approved SBUSA-007 monthly appointment status. Activity records remain the
 * source of truth; this helper only evaluates the monthly aggregate.
 */
export function assessTeamAppointmentThreshold(actual: number): {
  actual: number;
  goal: number;
  status: TeamAppointmentStatus;
  pct: number;
} {
  const normalizedActual = Math.max(0, Number.isFinite(actual) ? actual : 0);
  if (normalizedActual >= TEAM_APPOINTMENT_THRESHOLDS.target) {
    return { actual: normalizedActual, goal: TEAM_APPOINTMENT_THRESHOLDS.target, status: 'Meets Target', pct: 100 };
  }
  if (normalizedActual >= TEAM_APPOINTMENT_THRESHOLDS.minimum) {
    return { actual: normalizedActual, goal: TEAM_APPOINTMENT_THRESHOLDS.target, status: 'Meets Minimum', pct: 50 };
  }
  return { actual: normalizedActual, goal: TEAM_APPOINTMENT_THRESHOLDS.target, status: 'Below Minimum', pct: 0 };
}
