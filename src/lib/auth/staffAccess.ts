import 'server-only';
import { adminDb } from '@/lib/firebase/admin';

export type StaffRole = 'office_admin' | 'tc_admin' | 'tc';

export interface StaffUser {
  id: string;
  displayName: string;
  email: string;
  phone: string | null;
  role: StaffRole;
  status: 'active' | 'inactive';
  firebaseUid: string | null;
  createdAt: string;
  updatedAt: string;
}

const SUPER_ADMIN_UID = '1kJsXTU1JjZXMidmoIPXgXxizll1';

// Cache staff lookups for the duration of a request (module-level cache with TTL)
const cache = new Map<string, { role: StaffRole | null; ts: number }>();
const CACHE_TTL_MS = 30_000; // 30 seconds

/**
 * Returns the staff role for a given Firebase UID, or null if not a staff user.
 * The super admin UID always returns 'office_admin'.
 */
export async function getStaffRole(uid: string): Promise<StaffRole | null> {
  if (uid === SUPER_ADMIN_UID) return 'office_admin';

  const cached = cache.get(uid);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.role;

  try {
    const snap = await adminDb
      .collection('staffUsers')
      .where('firebaseUid', '==', uid)
      .where('status', '==', 'active')
      .limit(1)
      .get();

    const role = snap.empty ? null : (snap.docs[0].data().role as StaffRole);
    cache.set(uid, { role, ts: Date.now() });
    return role;
  } catch {
    return null;
  }
}

/**
 * Returns true if the UID has full admin-like access (office_admin or tc_admin).
 * These users can view agent dashboards, manage transactions, etc.
 */
export async function isAdminLike(uid: string): Promise<boolean> {
  const role = await getStaffRole(uid);
  return role === 'office_admin' || role === 'tc_admin';
}

/**
 * Returns true if the UID has any staff access (including TC-only).
 */
export async function isStaff(uid: string): Promise<boolean> {
  const role = await getStaffRole(uid);
  return role !== null;
}
