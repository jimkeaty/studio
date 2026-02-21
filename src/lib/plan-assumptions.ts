import type { PlanAssumptions } from './types';

export const defaultAssumptions: PlanAssumptions = {
  conversionRates: {
    callToEngagement: 0.15,
    engagementToAppointmentSet: 0.03,
    appointmentSetToHeld: 0.65,
    appointmentHeldToContract: 0.50,
    contractToClosing: 0.85,
  },
  avgCommission: 3000,
  workingDaysPerMonth: 21,
  weeksOff: 4,
};
