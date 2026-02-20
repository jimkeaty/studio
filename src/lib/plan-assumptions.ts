import type { PlanAssumptions } from './types';

export const defaultAssumptions: PlanAssumptions = {
  conversionRates: {
    callToEngagement: 0.25, // 25% of calls result in an engagement
    engagementToAppointmentSet: 0.1, // 10% of engagements become appointments
    appointmentSetToHeld: 0.75, // 75% of appointments set are held
    appointmentHeldToContract: 0.2, // 20% of appointments held become contracts
    contractToClosing: 0.8, // 80% of contracts close
  },
  avgCommission: 3000,
  workingDaysPerMonth: 21,
};
