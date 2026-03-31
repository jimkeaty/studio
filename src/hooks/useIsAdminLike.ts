'use client';

import { useState, useEffect } from 'react';
import { useUser } from '@/firebase';

const SUPER_ADMIN_UID = '1kJsXTU1JjZXMidmoIPXgXxizll1';

/**
 * Returns { isAdmin, loading } where isAdmin is true for:
 *   - The super admin UID
 *   - Any staff user with role 'office_admin' or 'tc_admin'
 *
 * On every login, this hook also calls /api/admin/staff-self-link to ensure
 * the user's Firebase UID is linked to their staffUsers record (needed when
 * staff accounts are created before the user first signs in via Google).
 */
export function useIsAdminLike(): { isAdmin: boolean; loading: boolean } {
  const { user, loading: userLoading } = useUser();
  const [staffChecked, setStaffChecked] = useState(false);
  const [isStaffAdmin, setIsStaffAdmin] = useState(false);

  useEffect(() => {
    if (userLoading || !user) {
      setStaffChecked(false);
      setIsStaffAdmin(false);
      return;
    }
    // Super admin — no need to check staff role
    if (user.uid === SUPER_ADMIN_UID) {
      setIsStaffAdmin(false);
      setStaffChecked(true);
      return;
    }
    let cancelled = false;

    const run = async () => {
      try {
        const token = await user.getIdToken();

        // Step 1: Self-link — ensures this Firebase UID is linked to the
        // staffUsers record (by email match) if it isn't already.
        // This is a no-op for regular agents.
        try {
          await fetch('/api/admin/staff-self-link', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
          });
        } catch {
          // Self-link failure is non-fatal — proceed to access check
        }

        // Step 2: Check if this user has admin-like access
        const r = await fetch('/api/admin/check-access', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const d = await r.json();
        if (!cancelled) {
          setIsStaffAdmin(!!d.ok);
          setStaffChecked(true);
        }
      } catch {
        if (!cancelled) setStaffChecked(true);
      }
    };

    run();
    return () => { cancelled = true; };
  }, [user, userLoading]);

  const loading = userLoading || !staffChecked;
  const isAdmin = !userLoading && !!user && (user.uid === SUPER_ADMIN_UID || isStaffAdmin);

  return { isAdmin, loading };
}
