import {
  Firestore,
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  Timestamp,
} from 'firebase/firestore';
import { add } from 'date-fns';
import type {
  QualificationProgress,
  ReferralQualification,
} from './types/incentives';

// Assuming a Transaction type exists or defining a minimal one for this service.
interface Transaction {
  agentId: string;
  status: 'closed';
  closedDate: Timestamp;
  companyGciGross: number;
}

/**
 * Computes the qualification progress for a single recruited agent.
 * @param db - The Firestore instance.
 * @param recruitedAgentId - The ID of the agent whose progress to compute.
 * @returns A promise resolving to the QualificationProgress object.
 */
export async function computeQualificationProgress(
  db: Firestore,
  recruitedAgentId: string
): Promise<QualificationProgress> {
  const qualificationDocRef = doc(db, 'referral_qualifications', recruitedAgentId);
  const qualificationSnap = await getDoc(qualificationDocRef);

  if (!qualificationSnap.exists()) {
    return {
      status: 'missing_data',
      companyGciGrossInWindow: 0,
      remainingToThreshold: 40000,
      progressPercentage: 0,
      windowEndsAt: null,
      timeRemainingDays: null,
      qualifiedAt: null,
      annualPayout: 0,
    };
  }

  const qualificationData =
    qualificationSnap.data() as ReferralQualification;
  const { hireDate, thresholdCompanyGciGross } = qualificationData;
  const hireDateObj = hireDate.toDate();
  const windowEndsAtObj = add(hireDateObj, { years: 1 });

  // Fetch all closed transactions for the agent
  const transactionsQuery = query(
    collection(db, 'transactions'),
    where('agentId', '==', recruitedAgentId),
    where('status', '==', 'closed')
  );

  const transactionsSnap = await getDocs(transactionsQuery);

  // Filter transactions within the 12-month window client-side
  let gciInWindow = 0;
  transactionsSnap.forEach((doc) => {
    const transaction = doc.data() as Transaction;
    const closedDate = transaction.closedDate.toDate();
    if (closedDate >= hireDateObj && closedDate < windowEndsAtObj) {
      gciInWindow += transaction.companyGciGross || 0;
    }
  });

  const remainingToThreshold = Math.max(
    0,
    thresholdCompanyGciGross - gciInWindow
  );
  const progressPercentage =
    thresholdCompanyGciGross > 0
      ? (gciInWindow / thresholdCompanyGciGross) * 100
      : 0;

  const timeRemainingDays = Math.max(
    0,
    Math.floor(
      (windowEndsAtObj.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
    )
  );

  return {
    status: qualificationData.status,
    companyGciGrossInWindow: gciInWindow,
    remainingToThreshold,
    progressPercentage,
    windowEndsAt: windowEndsAtObj,
    timeRemainingDays,
    qualifiedAt: qualificationData.qualifiedAt
      ? qualificationData.qualifiedAt.toDate()
      : null,
    annualPayout: qualificationData.status === 'qualified' ? 500 : 0,
  };
}
