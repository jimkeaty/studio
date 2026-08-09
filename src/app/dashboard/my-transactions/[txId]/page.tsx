'use client';

import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export default function AgentTransactionDetailPage() {
  const router = useRouter();
  const params = useParams();
  const txId = params?.txId as string;

  useEffect(() => {
    if (txId) {
      router.replace(`/dashboard/transactions/new?edit=${txId}`);
    }
  }, [txId, router]);

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="text-sm">Loading transaction...</p>
      </div>
    </div>
  );
}
