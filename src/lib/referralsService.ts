// src/lib/referralsService.ts
'use client';

import {
  Firestore,
  collection,
  query,
  where,
  getDocs,
  documentId,
  doc,
  getDoc
} from 'firebase/firestore';
import type {
  AgentReferral,
  DownlineMember,
  QualificationProgress,
  ReferralQualification,
} from './types/incentives';
import { computeQualificationProgress } from './incentivesService';
import { add, subDays } from 'date-fns';

// TODO: Replace with a real agent profile fetching service
// For now, it converts an agentId like 'john-doe' to 'John D.'
const getAgentDisplayName = (agentId: string): string => {
  if (!agentId) return "Unknown";
  return agentId
    .split('-')
    .map((part) =>
        part.charAt(0).toUpperCase() + part.slice(1)
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
    closedGci: number,
    pendingGci: number
  ): QualificationProgress => {
    const remaining = Math.max(0, 40000 - closedGci);
    return {
      status,
      closedCompanyGciGrossInWindow: closedGci,
      pendingCompanyGciGrossInWindow: pendingGci,
      remainingToThreshold: remaining,
      progressPercentage: (closedGci / 40000) * 100,
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
      qualificationProgress: createMockProgress('qualified', 55000, 5000),
    },
    {
      agentId: 'brian-miller',
      displayName: 'Brian Miller',
      tier: 1,
      hireDate: subDays(now, 150),
      qualificationProgress: createMockProgress('in_progress', 25000, 8000),
    },
    {
      agentId: 'sam-wilson',
      displayName: 'Sam Wilson',
      tier: 2,
      referrerId: 'brian-miller',
      hireDate: subDays(now, 400),
      qualificationProgress: createMockProgress('expired', 15000, 0),
    },
     {
      agentId: 'olivia-chen',
      displayName: 'Olivia Chen',
      tier: 2,
      referrerId: 'jenna-stone',
      hireDate: subDays(now, 90),
      qualificationProgress: createMockProgress('in_progress', 8000, 12000),
    },
     {
      agentId: 'missing-data-agent',
      displayName: 'Missing Data Agent',
      tier: 1,
      hireDate: subDays(now, 60),
      qualificationProgress: null, // Simulate a permissions error
    },
  ];
}


/**
 * Fetches the full downline (Tier 1 and Tier 2) and their qualification progress.
 * This is for the individual agent's dashboard view.
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
    
    const recruitIds = allReferrals.map(r => r.recruitedAgentId);
    const qualificationDocs: (ReferralQualification | null)[] = [];
    for (const recruitId of recruitIds) {
        const qualDocSnap = await getDoc(doc(db, 'referral_qualifications', recruitId));
        qualificationDocs.push(qualDocSnap.exists() ? qualDocSnap.data() as ReferralQualification : null);
    }
    
    // Fetch qualification progress for all downline members, handling individual errors.
    const progressResults = await Promise.all(
      qualificationDocs.map((qualDoc) => {
        if (!qualDoc) return Promise.resolve(null);
        return computeQualificationProgress(db, qualDoc).catch(err => {
          console.error(`Could not compute progress for ${qualDoc.recruitedAgentId}:`, err.message);
          return null; // Return null on failure for this specific recruit
        });
      })
    );
    
    return allReferrals.map((referral, index) => {
      return {
        agentId: referral.recruitedAgentId,
        displayName: getAgentDisplayName(referral.recruitedAgentId),
        tier: referral.tier,
        hireDate: qualificationDocs[index]?.hireDate.toDate() ?? null,
        qualificationProgress: progressResults[index],
      };
    });
  } catch(error: any) {
      console.error("Failed to fetch real downline data:", error.message);
      // If there's an error (e.g., permissions), fall back to mock data in dev.
      if (process.env.NODE_ENV === 'development') {
          return getMockFullDownline(agentId);
      }
      // In production, return an empty array to show a clean state instead of an error.
      return [];
  }
}

/**
 * Fetches ALL recruits in the brokerage and their full downline for the Admin Console.
 * @param db - The Firestore instance.
 * @returns A promise resolving to an array of all DownlineMember objects in the system.
 */
export async function getAllBrokerageRecruits(db: Firestore): Promise<DownlineMember[]> {
    try {
        const referralsSnap = await getDocs(collection(db, 'agent_referrals'));
        if (referralsSnap.empty) {
             if (process.env.NODE_ENV === 'development') return getMockFullDownline('broker-admin');
             return [];
        }

        const allReferrals = referralsSnap.docs.map(d => d.data() as AgentReferral);
        const allRecruitIds = allReferrals.map(r => r.recruitedAgentId);

        const qualDocsSnap = await getDocs(query(collection(db, 'referral_qualifications'), where(documentId(), 'in', allRecruitIds)));
        const qualMap = new Map<string, ReferralQualification>();
        qualDocsSnap.forEach(d => qualMap.set(d.id, d.data() as ReferralQualification));

        const progressResults = await Promise.all(
            Array.from(qualMap.values()).map(q => 
                computeQualificationProgress(db, q).catch(err => {
                    console.error(`Admin Console: Could not compute progress for ${q.recruitedAgentId}:`, err.message);
                    return null;
                })
            )
        );
        
        const progressMap = new Map<string, QualificationProgress | null>();
        progressResults.forEach((p, i) => {
            const qual = Array.from(qualMap.values())[i];
            progressMap.set(qual.recruitedAgentId, p);
        });

        const referralMap = new Map<string, string>(); // Map<recruitId, referrerId>
        allReferrals.forEach(r => referralMap.set(r.recruitedAgentId, r.referrerAgentId));

        return allRecruitIds.map(recruitId => {
            const referrerId = referralMap.get(recruitId)!;
            const uplineId = referralMap.get(referrerId); // Might be undefined (if referrer is T1)
            
            return {
                agentId: recruitId,
                displayName: getAgentDisplayName(recruitId),
                tier: uplineId ? 2 : 1, // Simplified logic: if your referrer was referred, you're T2.
                referrerId: getAgentDisplayName(referrerId),
                uplineId: uplineId ? getAgentDisplayName(uplineId) : '—',
                hireDate: qualMap.get(recruitId)?.hireDate.toDate() ?? null,
                qualificationProgress: progressMap.get(recruitId) ?? null,
            };
        });

    } catch (error: any) {
        console.error("Failed to fetch brokerage-wide recruits:", error.message);
        if (process.env.NODE_ENV === 'development') {
            return getMockFullDownline('broker-admin');
        }
        return [];
    }
}
