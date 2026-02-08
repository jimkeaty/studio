'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function SignupPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/login');
  }, [router]);

  return (
    <div className="flex h-screen w-full items-center justify-center bg-background">
      <div className="text-center">
        <p className="text-lg font-semibold text-primary">Redirecting...</p>
      </div>
    </div>
  );
}
