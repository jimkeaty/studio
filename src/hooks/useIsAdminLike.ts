'use client';

import { useState, useEffect } from 'react';
import { useUser } from '@/firebase';

const SUPER_ADMIN_UID = '1kJsXTU1JjZXMidmoIPXgXxizll1';

/**
 * Returns { isAdmin, loading } where isAdmin is true for:
 *   - The super admin UID
 *   - Any staff user with role 'office_admin' or 'tc_admin'
 *
 * Use this hook in client pages instead of checking user.uid === ADMIN_UID directly.
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
    user.getIdToken().then((token) => {
      fetch('/api/admin/check-access', { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.json())
        .then((d) => {
          if (!cancelled) {
            setIsStaffAdmin(!!d.ok);
            setStaffChecked(true);
          }
        })
        .catch(() => {
          if (!cancelled) setStaffChecked(true);
        });
    });
    return () => { cancelled = true; };
  }, [user, userLoading]);

  const loading = userLoading || !staffChecked;
  const isAdmin = !userLoading && !!user && (user.uid === SUPER_ADMIN_UID || isStaffAdmin);

  return { isAdmin, loading };
}
