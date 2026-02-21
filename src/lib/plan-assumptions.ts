import type { PlanAssumptions } from './types';

export const defaultAssumptions: PlanAssumptions = {
  conversionRates: {
    callToEngagement: 0.15,
    engagementToAppointmentSet: 0.03,
    appointmentSetToHeld: 0.60,
    appointmentHeldToContract: 0.60,
    contractToClosing: 0.90,
  },
  avgCommission: 3000,
  workingDaysPerMonth: 21,
};
