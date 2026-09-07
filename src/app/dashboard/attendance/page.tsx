'use client';

import { AttendanceAndFloorTimePanel } from '@/components/dashboard/agent/AttendanceAndFloorTimePanel';
import { AttendanceManagementPanel } from '@/components/dashboard/broker/AttendanceManagementPanel';
import { useIsAdminLike } from '@/hooks/useIsAdminLike';

export const dynamic = 'force-dynamic';

export default function AttendancePage() {
  const { isAdmin, loading } = useIsAdminLike();
  const year = new Date().getFullYear();

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <AttendanceAndFloorTimePanel />
      {!loading && isAdmin && (
        <section aria-label="Attendance management">
          <AttendanceManagementPanel year={year} />
        </section>
      )}
    </div>
  );
}
