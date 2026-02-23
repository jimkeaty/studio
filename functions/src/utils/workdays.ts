
import {
  addDays,
  endOfYear,
  format,
  getDay,
  getFullYear,
  isAfter,
  isBefore,
  parseISO,
  startOfYear,
} from 'date-fns';

// All date calculations are performed in this timezone as per requirements.
// The company-wide baseline start date for all calculations.
const COMPANY_BASELINE_START_DATE = '2026-01-05';

/**
 * Calculates the number of business days between two dates, inclusive.
 * This function replicates the behavior of Excel's NETWORKDAYS function.
 * It considers weekends (Saturday, Sunday) and a provided list of holidays.
 *
 * @param startDate The start date of the period.
 * @param endDate The end date of the period.
 * @param holidays An array of holiday dates in 'YYYY-MM-DD' format.
 * @returns The total number of business days.
 */
function businessDaysBetween(startDate: Date, endDate: Date, holidays: string[]): number {
  // If the period is invalid, return 0.
  if (isAfter(startDate, endDate)) {
    return 0;
  }

  let count = 0;
  let currentDate = startDate;
  const holidaySet = new Set(holidays);

  while (currentDate <= endDate) {
    const dayOfWeek = getDay(currentDate); // getDay() returns 0 for Sunday, 6 for Saturday.
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    // Format the current date to 'YYYY-MM-DD' to check against the holiday list.
    const dateString = format(currentDate, 'yyyy-MM-dd');
    const isHoliday = holidaySet.has(dateString);

    // If the day is not a weekend and not a holiday, increment the count.
    if (!isWeekend && !isHoliday) {
      count++;
    }

    // Move to the next day.
    currentDate = addDays(currentDate, 1);
  }

  return count;
}

/**
 * Determines the effective start date for an agent's workday calculations.
 * It's the later of the agent's start date or the company's baseline start date.
 *
 * @param agentStartDateStr The agent's start date as a 'YYYY-MM-DD' string.
 * @returns The effective start date as a Date object.
 */
function getEffectiveStartDate(agentStartDateStr: string): Date {
  const companyBaselineDate = parseISO(COMPANY_BASELINE_START_DATE);
  const agentStartDate = parseISO(agentStartDateStr);

  // EffectiveStartDate = max(CompanyBaselineStartDate, AgentStartDate)
  return isAfter(agentStartDate, companyBaselineDate) ? agentStartDate : companyBaselineDate;
}

/**
 * Calculates the number of workdays an agent has completed year-to-date for a given year.
 *
 * @param agentStartDate The agent's start date ('YYYY-MM-DD').
 * @param year The year for which to calculate the elapsed workdays.
 * @param holidays A list of holidays ('YYYY-MM-DD').
 * @returns The number of workdays elapsed.
 */
export function getAgentWorkdaysElapsedYTD(agentStartDate: string, year: number, holidays: string[]): number {
  const now = new Date();
  const currentYear = getFullYear(now);

  let calculationEndDate: Date;
  if (year < currentYear) {
    // For a past year, the period covers the entire year.
    calculationEndDate = endOfYear(new Date(year, 0, 1));
  } else if (year > currentYear) {
    // For a future year, no workdays have elapsed.
    return 0;
  } else {
    // For the current year, the period is up to today.
    calculationEndDate = now;
  }

  let calculationStartDate = getEffectiveStartDate(agentStartDate);
  const yearStartDate = startOfYear(new Date(year, 0, 1));

  // The calculation should not start before the beginning of the target year.
  if (isBefore(calculationStartDate, yearStartDate)) {
    calculationStartDate = yearStartDate;
  }

  return businessDaysBetween(calculationStartDate, calculationEndDate, holidays);
}

/**
 * Calculates the total number of workdays for an agent in a given year.
 *
 * @param agentStartDate The agent's start date ('YYYY-MM-DD').
 * @param year The year to calculate total workdays for.
 * @param holidays A list of holidays ('YYYY-MM-DD').
 * @returns The total number of workdays in the year.
 */
export function getAgentTotalWorkdaysInYear(agentStartDate: string, year: number, holidays: string[]): number {
  let calculationStartDate = getEffectiveStartDate(agentStartDate);
  const yearStartDate = startOfYear(new Date(year, 0, 1));

  // The calculation should not start before the beginning of the target year.
  if (isBefore(calculationStartDate, yearStartDate)) {
    calculationStartDate = yearStartDate;
  }
  
  const yearEndDate = endOfYear(new Date(year, 0, 1));

  return businessDaysBetween(calculationStartDate, yearEndDate, holidays);
}

/**
 * Calculates the agent's year-to-date progress as a percentage.
 *
 * @param agentStartDate The agent's start date ('YYYY-MM-DD').
 * @param year The year to calculate progress for.
 * @param holidays A list of holidays ('YYYY-MM-DD').
 * @returns The workday progress as a decimal (e.g., 0.5 for 50%).
 */
export function getAgentWorkdayYearProgress(agentStartDate: string, year: number, holidays: string[]): number {
  const workdaysElapsed = getAgentWorkdaysElapsedYTD(agentStartDate, year, holidays);
  const totalWorkdays = getAgentTotalWorkdaysInYear(agentStartDate, year, holidays);

  // Avoid division by zero if there are no workdays in the year.
  if (totalWorkdays === 0) {
    return 0;
  }

  return workdaysElapsed / totalWorkdays;
}
