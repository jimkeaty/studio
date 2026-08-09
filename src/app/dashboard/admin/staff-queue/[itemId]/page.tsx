'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState, use } from 'react';
import { useUser } from '@/firebase';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

/**
 * Staff Queue Detail Page
 *
 * Redirects to the unified add/edit transaction form with:
 *   ?edit={transactionId}   — loads the transaction data
 *   &intakeId={itemId}      — tells the form to show the Staff action bar (Approve, Save)
 *   &role=staff             — confirms staff role for the action bar
 *
 * This gives staff the exact same form as agents, TC, and admins — one form, one source of truth.
 */
export default function StaffQueueDetailPage({ params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = use(params);
  const { user, loading: userLoading } = useUser();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (userLoading || !user || !itemId) return;

    const load = async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch(`/api/admin/staff-queue/${itemId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to load staff queue item');

        const item = data.item;
        const transaction = data.transaction;
        // Use the linked transaction ID if available; fall back to the queue item ID
        const txId = transaction?.id || item?.transactionId || itemId;

        // Redirect to the unified form with staff action bar params
        router.replace(
          `/dashboard/transactions/new?edit=${txId}&intakeId=${itemId}&role=staff`
        );
      } catch (err: any) {
        setError(err.message || 'Failed to load staff queue item');
      }
    };

    load();
  }, [itemId, user, userLoading, router]);

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3 text-center max-w-sm">
          <p className="text-sm font-semibold text-destructive">Failed to load staff queue item</p>
          <p className="text-xs text-muted-foreground">{error}</p>
          <button
            onClick={() => router.push('/dashboard/admin/staff-queue')}
            className="text-xs text-primary underline mt-2"
          >
            ← Back to Staff Queue
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="text-sm">Loading transaction...</p>
      </div>
    </div>
  );
}
