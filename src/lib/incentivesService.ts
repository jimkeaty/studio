// src/lib/incentivesService.ts
'use client';

import {
  Firestore,
  collection,
  query,
  where,
  getDocs,
  Timestamp,
} from 'firebase/firestore';
import type {
  QualificationProgress,
  ReferralQualification,
} from './types/incentives';

// Minimal Transaction type definition to support GCI calculation.
interface Transaction {
  agentId: string;
  status: 'closed' | 'pending' | 'under_contract';
  closedDate?: Timestamp;
  contractDate?: Timestamp; // Assumed field for pending transactions
  companyGciGross: number;
}

/**
 * Computes the detailed qualification progress for a single recruited agent by
 * fetching and analyzing their transactions.
 *
 * @param db - The Firestore instance.
 * @param qualification - The base qualification document for the recruit.
 * @returns A promise resolving to the enriched QualificationProgress object.
 */
export async function computeQualificationProgress(
  db: Firestore,
  qualification: ReferralQualification
): Promise<QualificationProgress> {
  const {
    hireDate,
    windowEndsAt,
    thresholdCompanyGciGross,
  } = qualification;
  const hireDateObj = hireDate.toDate();
  const windowEndsAtObj = windowEndsAt.toDate();

  // Fetch all potentially relevant transactions for the agent.
  // status can be 'closed', 'pending', or 'under_contract'
  const transactionsQuery = query(
    collection(db, 'transactions'),
    where('agentId', '==', qualification.recruitedAgentId),
    where('status', 'in', ['closed', 'pending', 'under_contract'])
  );
  const transactionsSnap = await getDocs(transactionsQuery);

  let closedGciInWindow = 0;
  let pendingGciInWindow = 0;

  transactionsSnap.forEach((doc) => {
    const transaction = doc.data() as Transaction;
    
    // Process CLOSED transactions
    if (transaction.status === 'closed' && transaction.closedDate) {
      const closedDate = transaction.closedDate.toDate();
      if (closedDate >= hireDateObj && closedDate < windowEndsAtObj) {
        closedGciInWindow += transaction.companyGciGross || 0;
      }
    }

    // Process PENDING/UNDER CONTRACT transactions
    // SCHEMA ASSUMPTION: Assumes a `contractDate` field exists for pending deals.
    if ((transaction.status === 'pending' || transaction.status === 'under_contract') && transaction.contractDate) {
        const contractDate = transaction.contractDate.toDate();
        if (contractDate >= hireDateObj && contractDate < windowEndsAtObj) {
            pendingGciInWindow += transaction.companyGciGross || 0;
        }
    }
  });

  // Qualification status is based ONLY on CLOSED GCI.
  const remainingToThreshold = Math.max(
    0,
    thresholdCompanyGciGross - closedGciInWindow
  );
  const progressPercentage =
    thresholdCompanyGciGross > 0
      ? (closedGciInWindow / thresholdCompanyGciGross) * 100
      : 0;

  const timeRemainingDays = Math.max(
    0,
    Math.floor(
      (windowEndsAtObj.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
    )
  );

  let currentStatus = qualification.status;
  if (currentStatus === 'in_progress' && closedGciInWindow >= thresholdCompanyGciGross) {
    // This logic is for UI display. A separate backend job would officially update the doc.
    currentStatus = 'qualified';
  } else if (currentStatus === 'in_progress' && timeRemainingDays <= 0) {
    currentStatus = 'expired';
  }

  return {
    status: currentStatus,
    closedCompanyGciGrossInWindow: closedGciInWindow,
    pendingCompanyGciGrossInWindow: pendingGciInWindow,
    remainingToThreshold,
    progressPercentage,
    windowEndsAt: windowEndsAtObj,
    timeRemainingDays,
    qualifiedAt: qualification.qualifiedAt
      ? qualification.qualifiedAt.toDate()
      : null,
    annualPayout: currentStatus === 'qualified' ? 500 : 0,
  };
}
