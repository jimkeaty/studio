/**
 * getRecipientUids — helpers to resolve notification recipient UIDs
 * from the staffUsers collection.
 *
 * staffUsers documents contain:
 *   - firebaseUid  (the Firebase Auth UID)
 *   - role         ('office_admin' | 'tc_admin' | 'tc' | 'staff')
 *   - email, displayName, phone
 */

import type { Firestore } from 'firebase-admin/firestore';

/** Get UIDs of all TC coordinators (role = 'tc' or 'tc_admin') */
export async function getTcUids(db: Firestore): Promise<string[]> {
  const snap = await db
    .collection('staffUsers')
    .where('role', 'in', ['tc', 'tc_admin'])
    .get();
  return snap.docs
    .map((d) => d.data().firebaseUid as string | undefined)
    .filter((uid): uid is string => !!uid);
}

/** Get UIDs of all staff users (role = 'office_admin', 'tc_admin', 'tc', or 'staff') */
export async function getAllStaffUids(db: Firestore): Promise<string[]> {
  const snap = await db.collection('staffUsers').get();
  return snap.docs
    .map((d) => d.data().firebaseUid as string | undefined)
    .filter((uid): uid is string => !!uid);
}

/** Get UIDs of staff users assigned to a specific transaction/agent */
export async function getStaffUidsForAgent(db: Firestore, agentId: string): Promise<string[]> {
  // First check if the agent has a specific TC assigned in agentProfiles
  const agentDoc = await db.collection('agentProfiles').doc(agentId).get();
  if (agentDoc.exists) {
    const assignedTcUid = agentDoc.data()?.assignedTcUid as string | undefined;
    if (assignedTcUid) return [assignedTcUid];
  }
  // Fall back to all TC coordinators
  return getTcUids(db);
}

/**
 * Get the Firebase UID for an agent by their agentId (slug).
 *
 * Resolution order:
 *  1. If a submittedByUid is provided directly, use it — this is the most reliable
 *     since it is the actual Firebase Auth UID captured at submission time.
 *  2. agentProfiles/{agentId}.firebaseUid  (set when agent logs in and links their account)
 *  3. agentProfiles where firebaseUid == agentId  (in case agentId IS the UID)
 *  4. users collection where agentId field matches
 *  5. Legacy 'agents' collection (fallback for old data)
 */
export async function getAgentUid(
  db: Firestore,
  agentId: string,
  submittedByUid?: string | null,
): Promise<string | null> {
  // Strategy 0: Use the directly supplied submittedByUid if available
  if (submittedByUid) return submittedByUid;

  // Strategy 1: agentProfiles doc by slug ID, check firebaseUid field
  try {
    const profileDoc = await db.collection('agentProfiles').doc(agentId).get();
    if (profileDoc.exists) {
      const data = profileDoc.data() as Record<string, any>;
      const uid = data.firebaseUid || data.uid || data.userId || null;
      if (uid) return uid as string;
    }
  } catch { /* non-fatal */ }

  // Strategy 2: agentProfiles where firebaseUid field == agentId (agentId might be a UID)
  try {
    const byUidSnap = await db
      .collection('agentProfiles')
      .where('firebaseUid', '==', agentId)
      .limit(1)
      .get();
    if (!byUidSnap.empty) return agentId; // agentId IS the Firebase UID
  } catch { /* non-fatal */ }

  // Strategy 3: users collection where agentId field matches the slug
  try {
    const userSnap = await db
      .collection('users')
      .where('agentId', '==', agentId)
      .limit(1)
      .get();
    if (!userSnap.empty) return userSnap.docs[0].id;
  } catch { /* non-fatal */ }

  // Strategy 4: Legacy 'agents' collection (old data path)
  try {
    const agentDoc = await db.collection('agents').doc(agentId).get();
    if (agentDoc.exists) {
      const data = agentDoc.data() as Record<string, any>;
      return (data.uid || data.firebaseUid || data.userId || null) as string | null;
    }
  } catch { /* non-fatal */ }

  return null;
}
