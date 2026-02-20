import type { PlanAssumptions } from './types';

export const defaultAssumptions: PlanAssumptions = {
  conversionRates: {
    callToEngagement: 0.15, // 15% of calls result in an engagement
    engagementToAppointmentSet: 0.03, // 3% of engagements become appointments
    appointmentSetToHeld: 0.60, // 60% of appointments set are held
    appointmentHeldToContract: 0.60, // 60% of appointments held become contracts
    contractToClosing: 0.9, // 90% of contracts close
  },
  avgCommission: 3000,
  workingDaysPerMonth: 21,
};
