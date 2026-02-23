'use client';

import {
  Firestore,
  collection,
  query,
  where,
  getDocs,
  documentId,
} from 'firebase/firestore';
import type {
  AgentReferral,
  DownlineMember,
  QualificationProgress,
} from './types/incentives';
import { computeQualificationProgress } from './incentivesService';
import { add, subDays } from 'date-fns';

// TODO: Replace with a real agent profile fetching service
// For now, it converts an agentId like 'john-doe' to 'John D.'
const getAgentDisplayName = (agentId: string): string => {
  return agentId
    .split('-')
    .map((part, index) =>
      index === 0
        ? part.charAt(0).toUpperCase() + part.slice(1)
        : `${part.charAt(0).toUpperCase()}.`
    )
    .join(' ');
};

/**
 * Fetches the Tier 1 downline for a given agent.
 * @param db - The Firestore instance.
 * @param agentId - The ID of the referring agent.
 * @returns A promise resolving to an array of AgentReferral objects.
 */
async function getTier1Downline(
  db: Firestore,
  agentId: string
): Promise<AgentReferral[]> {
  const referralsQuery = query(
    collection(db, 'agent_referrals'),
    where('referrerAgentId', '==', agentId),
    where('status', '==', 'active')
  );
  const snapshot = await getDocs(referralsQuery);
  if (snapshot.empty) return [];
  return snapshot.docs.map(
    (doc) => ({ id: doc.id, ...doc.data() } as AgentReferral)
  );
}

/**
 * Fetches the Tier 2 downline for a given agent.
 * @param db - The Firestore instance.
 * @param tier1Ids - An array of agent IDs from the Tier 1 downline.
 * @returns A promise resolving to an array of AgentReferral objects.
 */
async function getTier2Downline(
  db: Firestore,
  tier1Ids: string[]
): Promise<AgentReferral[]> {
  if (tier1Ids.length === 0) return [];

  const allTier2: AgentReferral[] = [];
  // Firestore 'in' query supports a maximum of 30 elements.
  // We batch the queries to handle more than 30 Tier 1 agents.
  for (let i = 0; i < tier1Ids.length; i += 30) {
    const batchIds = tier1Ids.slice(i, i + 30);
    const referralsQuery = query(
      collection(db, 'agent_referrals'),
      where('referrerAgentId', 'in', batchIds),
      where('status', '==', 'active')
    );
    const snapshot = await getDocs(referralsQuery);
    snapshot.forEach((doc) => {
      allTier2.push({ id: doc.id, ...doc.data() } as AgentReferral);
    });
  }
  return allTier2;
}


/**
 * DEV ONLY MOCK DATA — REMOVE WHEN LIVE REFERRALS ARE ENABLED
 * Generates a realistic mock downline for a given agent.
 */
function getMockFullDownline(agentId: string): DownlineMember[] {
  console.warn("DEV-MODE: Using mock data for Recruiting Incentive Tracker.");
  const now = new Date();

  // Helper to create qualification progress
  const createMockProgress = (
    status: 'qualified' | 'in_progress' | 'expired',
    gci: number
  ): QualificationProgress => {
    const remaining = Math.max(0, 40000 - gci);
    return {
      status,
      companyGciGrossInWindow: gci,
      remainingToThreshold: remaining,
      progressPercentage: (gci / 40000) * 100,
      windowEndsAt: add(now, { months: status === 'in_progress' ? 6 : -6 }),
      timeRemainingDays: status === 'in_progress' ? 180 : 0,
      qualifiedAt: status === 'qualified' ? subDays(now, 100) : null,
      annualPayout: status === 'qualified' ? 500 : 0,
    };
  };

  return [
    {
      agentId: 'jenna-stone',
      displayName: 'Jenna Stone',
      tier: 1,
      hireDate: subDays(now, 200),
      qualificationProgress: createMockProgress('qualified', 55000),
    },
    {
      agentId: 'brian-miller',
      displayName: 'Brian Miller',
      tier: 1,
      hireDate: subDays(now, 150),
      qualificationProgress: createMockProgress('in_progress', 25000),
    },
    {
      agentId: 'sam-wilson',
      displayName: 'Sam Wilson',
      tier: 2,
      hireDate: subDays(now, 400),
      qualificationProgress: createMockProgress('expired', 15000),
    },
     {
      agentId: 'olivia-chen',
      displayName: 'Olivia Chen',
      tier: 2,
      hireDate: subDays(now, 90),
      qualificationProgress: createMockProgress('in_progress', 8000),
    },
  ];
}


/**
 * Fetches the full downline (Tier 1 and Tier 2) and their qualification progress.
 * @param db - The Firestore instance.
 * @param agentId - The ID of the top-level agent.
 * @returns A promise resolving to an array of DownlineMember objects.
 */
export async function getFullDownline(
  db: Firestore,
  agentId: string
): Promise<DownlineMember[]> {
  try {
    const tier1Referrals = await getTier1Downline(db, agentId);
    const tier1Ids = tier1Referrals.map((r) => r.recruitedAgentId);
    const tier2Referrals = await getTier2Downline(db, tier1Ids);

    const allReferrals = [
      ...tier1Referrals.map((r) => ({ ...r, tier: 1 as const })),
      ...tier2Referrals.map((r) => ({ ...r, tier: 2 as const })),
    ];

    // If no real data, use mock data in dev, otherwise return empty.
    if (allReferrals.length === 0) {
        if (process.env.NODE_ENV === 'development') {
            return getMockFullDownline(agentId);
        }
        return [];
    }

    // Fetch qualification progress for all downline members in parallel
    const progressPromises = allReferrals.map((referral) =>
      computeQualificationProgress(db, referral.recruitedAgentId)
    );
    const progressResults = await Promise.all(progressPromises);

    return allReferrals.map((referral, index) => {
      return {
        agentId: referral.recruitedAgentId,
        displayName: getAgentDisplayName(referral.recruitedAgentId),
        tier: referral.tier,
        // Note: hireDate is fetched inside computeQualificationProgress, but we expose it here.
        // A more optimized service would fetch qualification docs directly.
        hireDate: progressResults[index]?.windowEndsAt
          ? new Date(
              progressResults[index]!.windowEndsAt!.getFullYear() - 1,
              progressResults[index]!.windowEndsAt!.getMonth(),
              progressResults[index]!.windowEndsAt!.getDate()
            )
          : null,
        qualificationProgress: progressResults[index],
      };
    });
  } catch(error) {
      console.error("Failed to fetch real downline data:", error);
      // If there's an error (e.g., permissions), fall back to mock data in dev.
      if (process.env.NODE_ENV === 'development') {
          return getMockFullDownline(agentId);
      }
      // In production, return an empty array to show a clean state instead of an error.
      return [];
  }
}
