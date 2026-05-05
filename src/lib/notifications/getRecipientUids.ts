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
  // First check if the agent has a specific TC assigned
  const agentDoc = await db.collection('agents').doc(agentId).get();
  if (agentDoc.exists) {
    const assignedTcUid = agentDoc.data()?.assignedTcUid as string | undefined;
    if (assignedTcUid) return [assignedTcUid];
  }
  // Fall back to all TC coordinators
  return getTcUids(db);
}

/** Get the Firebase UID for an agent by their agentId */
export async function getAgentUid(db: Firestore, agentId: string): Promise<string | null> {
  // Agents may be stored in 'agents' collection with a 'uid' or 'firebaseUid' field
  const agentDoc = await db.collection('agents').doc(agentId).get();
  if (agentDoc.exists) {
    const data = agentDoc.data() as Record<string, any>;
    return (data.uid || data.firebaseUid || data.userId || null) as string | null;
  }
  // Also try users collection
  const userSnap = await db.collection('users').where('agentId', '==', agentId).limit(1).get();
  if (!userSnap.empty) return userSnap.docs[0].id;
  return null;
}
