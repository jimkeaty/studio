'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * TC Profiles have been merged into Staff Users.
 * This page redirects any bookmarked links to the new location.
 */
export default function TcProfilesRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/dashboard/admin/staff-users');
  }, [router]);

  return null;
}
