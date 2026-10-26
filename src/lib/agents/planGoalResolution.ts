export type PlanActivityTarget = {
  yearly?: unknown;
  daily?: unknown;
} | null | undefined;

/**
 * Returns a numeric plan value when it was explicitly configured. A missing,
 * blank, or non-numeric value remains null so screens can distinguish it from
 * an intentional numeric zero.
 */
export function configuredPlanNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/**
 * Income plans historically used yearlyIncome before annualIncomeGoal became
 * the canonical field. The canonical value always wins, including an explicit
 * zero, and the legacy field is read only as a compatibility fallback.
 */
export function resolveAnnualIncomeGoal(plan: Record<string, unknown> | null | undefined): number | null {
  return configuredPlanNumber(plan?.annualIncomeGoal ?? plan?.yearlyIncome);
}

/**
 * Calculates a KPI goal through the current KPI clock. Current plans store a
 * yearly target, which is preferred because it is stable and matches the agent
 * dashboard. Older plans that contain only a daily target remain supported.
 */
export function resolveYtdActivityGoal(
  target: PlanActivityTarget,
  elapsedWorkdays: number,
  totalWorkdays: number,
): number | null {
  const yearly = configuredPlanNumber(target?.yearly);
  if (yearly !== null) {
    const safeTotalWorkdays = Math.max(1, totalWorkdays);
    return Number(((yearly * Math.max(0, elapsedWorkdays)) / safeTotalWorkdays).toFixed(2));
  }

  const daily = configuredPlanNumber(target?.daily);
  if (daily !== null) {
    return Number((daily * Math.max(0, elapsedWorkdays)).toFixed(2));
  }

  return null;
}
