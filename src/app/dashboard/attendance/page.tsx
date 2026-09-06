'use client';

import { AttendanceAndFloorTimePanel } from '@/components/dashboard/agent/AttendanceAndFloorTimePanel';

export const dynamic = 'force-dynamic';

export default function AttendancePage() {
  return <div className="mx-auto w-full max-w-6xl"><AttendanceAndFloorTimePanel /></div>;
}
