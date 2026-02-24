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
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

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

    const activityQuery = query(
        collection(db, 'daily_activity'),
        where('agentId', '==', agentId)
    );
    const transactionsQuery = query(
        collection(db, 'transactions'),
        where('agentId', '==', agentId)
        // where('status', '==', 'closed') // This requires a composite index. Filter on client.
    );
    const planRef = doc(db, 'users', agentId, 'plans', String(year));

    const [activitySnap, transactionsSnap, planSnap] = await Promise.all([
        getDocs(activityQuery).catch(err => {
            errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'daily_activity', operation: 'list' }));
            throw err;
        }),
        getDocs(transactionsQuery).catch(err => {
            if ((err as any).code === 'permission-denied') {
                errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'transactions', operation: 'list' }));
            }
            console.warn("Could not fetch transactions for value metrics. This may be expected.");
            return null;
        }),
        getDoc(planRef).catch(err => {
            if ((err as any).code === 'permission-denied') {
                errorEmitter.emit('permission-error', new FirestorePermissionError({ path: planRef.path, operation: 'get' }));
            }
            return null;
        })
    ]);


  // 2. Sum activity counts with client-side year filtering
  let totalEngagements = 0;
  let totalAppointmentsHeld = 0;
  if (activitySnap) {
    activitySnap.forEach((doc) => {
        const data = doc.data() as DailyActivity;
        if (data.date.startsWith(String(year))) {
            totalEngagements += data.engagementsCount || 0;
            totalAppointmentsHeld += data.appointmentsHeldCount || 0;
        }
    });
  }

  // 3. Sum closed net commission from transactions
  let totalClosedNetCommission = 0;
  if (transactionsSnap) {
    transactionsSnap.forEach((doc) => {
        const data = doc.data() as Transaction;
        
        // Client-side filtering for status
        if (data.status !== 'closed') {
            return;
        }

        // Client-side filtering by year
        const closeDate = data.closeDate?.toDate();
        const docYear = data.year || (closeDate ? closeDate.getFullYear() : null);

        if (docYear === year) {
          totalClosedNetCommission += data.commissionNet || 0;
        }
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
