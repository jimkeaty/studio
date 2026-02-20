export const planAssumptions = {
  conversionRates: {
    appointmentToContract: 0.2, // 20% of appointments held become contracts
    contractToClosing: 0.8, // 80% of contracts close
    engagementToAppointment: 0.1, // 10% of engagements become appointments
    callToEngagement: 0.25, // 25% of calls result in an engagement
  },
  avgCommission: 3000,
  workingDaysPerMonth: 21,
};
