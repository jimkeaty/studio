import type { PlanAssumptions } from './types';

export const defaultAssumptions: PlanAssumptions = {
  conversionRates: {
    callToEngagement: 0.15,
    engagementToAppointmentSet: 0.03,
    appointmentSetToHeld: 0.65,
    appointmentHeldToContract: 0.5,
    contractToClosing: 0.85,
  },
  avgCommission: 3000,
  workingDaysPerMonth: 21,
};
