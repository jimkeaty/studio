'use client';
// This page has been replaced by the unified transaction form.
// All admin transaction editing now goes through /dashboard/transactions/new?edit=<txId>
// This redirect exists to handle any old bookmarks or links using the old URL pattern.
import { useSearchParams, useRouter } from 'next/navigation';
import { useEffect, Suspense } from 'react';

function AdminTransactionEditRedirect() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const txId = searchParams.get('id');

  useEffect(() => {
    if (txId) {
      router.replace(`/dashboard/transactions/new?edit=${txId}`);
    } else {
      router.replace('/dashboard/admin/transactions');
    }
  }, [txId, router]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <p className="text-muted-foreground">Loading transaction...</p>
    </div>
  );
}

export default function AdminTransactionEditPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><p className="text-muted-foreground">Loading...</p></div>}>
      <AdminTransactionEditRedirect />
    </Suspense>
  );
}
