import type { PlanAssumptions } from './types';

export const defaultAssumptions: PlanAssumptions = {
  conversionRates: {
    callToEngagement: 0.25, // 25% of calls result in an engagement
    engagementToAppointment: 0.1, // 10% of engagements become appointments
    appointmentToContract: 0.2, // 20% of appointments held become contracts
    contractToClosing: 0.8, // 80% of contracts close
  },
  avgCommission: 3000,
  workingDaysPerMonth: 21,
};
