'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function KeatyCupRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/dashboard/admin/competitions');
  }, [router]);
  return (
    <div className="flex items-center justify-center h-64">
      <p className="text-muted-foreground">Redirecting to Competition Center…</p>
    </div>
  );
}
