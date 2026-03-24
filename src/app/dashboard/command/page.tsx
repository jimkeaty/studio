'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Redirect to the combined dashboard page (Performance tab)
export default function AgentCommandRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/dashboard');
  }, [router]);
  return null;
}
