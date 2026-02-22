'use client';

import {
  Firestore,
  collection,
  query,
  where,
  getDocs,
  getDoc,
  doc,
  Timestamp,
} from 'firebase/firestore';
import type { YtdValueMetrics, DailyActivity, BusinessPlan } from './types';

interface Transaction {
    id: string;
    agentId: string;
    status: 'closed' | 'pending' | 'cancelled';
    closeDate: Timestamp;
    year?: number;
    commissionNet: number;
}

/**
 * Fetches and calculates Year-to-Date (YTD) value metrics for a given agent and year.
 *
 * @param db The Firestore instance.
 * @param agentId The ID of the agent.
 * @param year The year for which to calculate metrics.
 * @returns A promise that resolves to the YtdValueMetrics object.
 */
export async function getYtdValueMetrics(
  db: Firestore,
  agentId: string,
  year: number
): Promise<YtdValueMetrics> {

  const startDate = `${year}-01-01`;
  const endDate = `${year}-12-31`;

  // 1. Fetch daily activities and transactions in parallel
  const [activitySnap, transactionsSnap, planSnap] = await Promise.all([
    getDocs(
      query(
        collection(db, 'daily_activity'),
        where('agentId', '==', agentId),
        where('date', '>=', startDate),
        where('date', '<=', endDate)
      )
    ),
    getDocs(
        query(
          collection(db, 'transactions'),
          where('agentId', '==', agentId),
          where('status', '==', 'closed'),
          where('year', '==', year)
        )
      ).catch(() => null), // Gracefully handle if transactions collection doesn't exist
      getDoc(doc(db, 'users', agentId, 'plans', String(year))).catch(() => null)
  ]);

  // 2. Sum activity counts
  let totalEngagements = 0;
  let totalAppointmentsHeld = 0;
  activitySnap.forEach((doc) => {
    const data = doc.data() as DailyActivity;
    totalEngagements += data.engagementsCount || 0;
    totalAppointmentsHeld += data.appointmentsHeldCount || 0;
  });

  // 3. Sum closed net commission from transactions
  let totalClosedNetCommission = 0;
  if (transactionsSnap) {
    transactionsSnap.forEach((doc) => {
        const data = doc.data() as Transaction;
        totalClosedNetCommission += data.commissionNet || 0;
    });
  }

  // 4. Calculate actual values
  const valuePerEngagement =
    totalClosedNetCommission > 0 && totalEngagements > 0
      ? totalClosedNetCommission / totalEngagements
      : null;
  const valuePerAppointmentHeld =
    totalClosedNetCommission > 0 && totalAppointmentsHeld > 0
      ? totalClosedNetCommission / totalAppointmentsHeld
      : null;

  // 5. Calculate target values from business plan
  let targetValuePerEngagement: number | null = null;
  let targetValuePerAppointmentHeld: number | null = null;

  if (planSnap && planSnap.exists()) {
    const plan = planSnap.data() as BusinessPlan;
    const incomeGoal = plan.annualIncomeGoal;
    const engagementGoal = plan.calculatedTargets?.engagements.yearly;
    const apptsHeldGoal = plan.calculatedTargets?.appointmentsHeld.yearly;

    if (incomeGoal > 0 && engagementGoal > 0) {
      targetValuePerEngagement = incomeGoal / engagementGoal;
    }
    if (incomeGoal > 0 && apptsHeldGoal > 0) {
      targetValuePerAppointmentHeld = incomeGoal / apptsHeldGoal;
    }
  }


  return {
    year,
    closedNetCommission: totalClosedNetCommission,
    engagements: totalEngagements,
    appointmentsHeld: totalAppointmentsHeld,
    valuePerEngagement,
    valuePerAppointmentHeld,
    targetValuePerEngagement,
    targetValuePerAppointmentHeld,
  };
}
