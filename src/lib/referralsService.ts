import {
  Firestore,
  collection,
  query,
  where,
  getDocs,
  documentId,
} from 'firebase/firestore';
import type { AgentReferral, DownlineMember } from './types/incentives';
import { computeQualificationProgress } from './incentivesService';

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
 * Fetches the full downline (Tier 1 and Tier 2) and their qualification progress.
 * @param db - The Firestore instance.
 * @param agentId - The ID of the top-level agent.
 * @returns A promise resolving to an array of DownlineMember objects.
 */
export async function getFullDownline(
  db: Firestore,
  agentId: string
): Promise<DownlineMember[]> {
  const tier1Referrals = await getTier1Downline(db, agentId);
  const tier1Ids = tier1Referrals.map((r) => r.recruitedAgentId);
  const tier2Referrals = await getTier2Downline(db, tier1Ids);

  const allReferrals = [
    ...tier1Referrals.map((r) => ({ ...r, tier: 1 as const })),
    ...tier2Referrals.map((r) => ({ ...r, tier: 2 as const })),
  ];

  if (allReferrals.length === 0) return [];

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
}
