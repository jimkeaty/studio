'use client';
import { useState, useEffect } from 'react';
import { useUser } from '@/firebase';

const SUPER_ADMIN_UID = '1kJsXTU1JjZXMidmoIPXgXxizll1';

/**
 * Returns { isStaff, isAdmin, role, loading } where:
 *   - isStaff: true for any staff user (tc, tc_admin, office_admin) + super admin
 *   - isAdmin: true for office_admin and tc_admin + super admin
 *   - role: the staff role string, or null if not staff
 */
export function useIsStaff(): {
  isStaff: boolean;
  isAdmin: boolean;
  role: string | null;
  loading: boolean;
} {
  const { user, loading: userLoading } = useUser();
  const [staffChecked, setStaffChecked] = useState(false);
  const [isStaffUser, setIsStaffUser] = useState(false);
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    if (userLoading || !user) {
      setStaffChecked(false);
      setIsStaffUser(false);
      setIsAdminUser(false);
      setRole(null);
      return;
    }

    // Super admin — always full access
    if (user.uid === SUPER_ADMIN_UID) {
      setIsStaffUser(true);
      setIsAdminUser(true);
      setRole('office_admin');
      setStaffChecked(true);
      return;
    }

    let cancelled = false;
    const run = async () => {
      try {
        const token = await user.getIdToken();
        // Self-link to ensure UID is linked to staffUsers record
        try {
          await fetch('/api/admin/staff-self-link', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
          });
        } catch {
          // Non-fatal
        }
        // Check TC staff access
        const r = await fetch('/api/admin/check-tc-access', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const d = await r.json();
        if (!cancelled) {
          const staffOk = !!d.ok;
          const staffRole = d.role ?? null;
          setIsStaffUser(staffOk);
          setIsAdminUser(staffOk && (staffRole === 'office_admin' || staffRole === 'tc_admin'));
          setRole(staffRole);
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
  const isStaff = !userLoading && !!user && isStaffUser;
  const isAdmin = !userLoading && !!user && isAdminUser;

  return { isStaff, isAdmin, role, loading };
}
