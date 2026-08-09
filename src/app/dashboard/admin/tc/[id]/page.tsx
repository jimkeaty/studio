'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState, use } from 'react';
import { useUser } from '@/firebase';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

/**
 * TC Queue Detail Page
 *
 * Redirects to the unified add/edit transaction form with:
 *   ?edit={transactionId}   — loads the transaction data
 *   &intakeId={id}          — tells the form to show the TC action bar (Approve, Save & Sync)
 *   &role=tc                — confirms TC role for the action bar
 *
 * This gives TC the exact same form as agents and admins — one form, one source of truth.
 * The TC action bar (Approve, Save & Sync, back link) is rendered inside the unified form.
 */
export default function TcQueueDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, loading: userLoading } = useUser();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (userLoading || !user || !id) return;

    const load = async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch(`/api/admin/tc/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to load intake');

        const intake = data.intake;
        // Use the linked transaction ID if available; fall back to the intake ID itself
        const txId = intake?.transactionId || intake?.approvedTransactionId || id;

        // Redirect to the unified form with TC action bar params
        router.replace(
          `/dashboard/transactions/new?edit=${txId}&intakeId=${id}&role=tc`
        );
      } catch (err: any) {
        setError(err.message || 'Failed to load TC intake');
      }
    };

    load();
  }, [id, user, userLoading, router]);

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3 text-center max-w-sm">
          <p className="text-sm font-semibold text-destructive">Failed to load TC intake</p>
          <p className="text-xs text-muted-foreground">{error}</p>
          <button
            onClick={() => router.push('/dashboard/admin/tc')}
            className="text-xs text-primary underline mt-2"
          >
            ← Back to TC Queue
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
