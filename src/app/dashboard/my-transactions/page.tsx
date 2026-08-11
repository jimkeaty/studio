'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback } from 'react';
import { useUser } from '@/firebase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Plus, ChevronRight, Home, Users, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEffectiveUser } from '@/hooks/useEffectiveUser';
import { useIsAdminLike } from '@/hooks/useIsAdminLike';

const STATUS_COLORS: Record<string, string> = {
  active:          'bg-green-100 text-green-800',
  pending:         'bg-yellow-100 text-yellow-800',
  under_contract:  'bg-blue-100 text-blue-800',
  closed:          'bg-gray-100 text-gray-700',
  coming_soon:     'bg-purple-100 text-purple-800',
  expired:         'bg-red-100 text-red-800',
  canceled:        'bg-red-100 text-red-800',
  withdrawn:       'bg-orange-100 text-orange-800',
};

function formatDate(d?: string) {
  if (!d) return '—';
  try { return format(parseISO(d), 'MMM d, yyyy'); } catch { return d; }
}

export default function MyTransactionsPage() {
  const { user, loading: userLoading } = useUser();
  const router = useRouter();
  const { isImpersonating, impersonatedAgent, impersonationReady } = useEffectiveUser();
  const { isAdmin, loading: adminLoading } = useIsAdminLike();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      // When an admin is impersonating an agent, pass viewAs so the API
      // returns that agent's transactions instead of the admin's (empty) list.
      const viewAs = isImpersonating && impersonatedAgent ? impersonatedAgent.uid : null;
      const url = viewAs
        ? `/api/agent/transactions?viewAs=${encodeURIComponent(viewAs)}`
        : '/api/agent/transactions';
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.ok) {
        setTransactions(data.transactions || []);
      }
    } catch { /* non-fatal */ } finally {
      setLoading(false);
    }
  }, [user, isImpersonating, impersonatedAgent]);

  useEffect(() => {
    if (!userLoading && user) load();
    else if (!userLoading && !user) setLoading(false);
  }, [user, userLoading, load]);
  // Re-fetch when impersonation state changes (admin switches agents)
  useEffect(() => {
    if (impersonationReady && user) load();
  }, [impersonationReady, isImpersonating, impersonatedAgent?.uid]);

  if (userLoading || loading || adminLoading) {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <Skeleton className="h-10 w-1/3" />
        {[1,2,3].map(i => <Skeleton key={i} className="h-24 w-full" />)}
      </div>
    );
  }

  if (!user) {
    return (
      <Alert variant="destructive" className="max-w-lg mx-auto mt-8">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Not Logged In</AlertTitle>
        <AlertDescription>Please log in to view your transactions.</AlertDescription>
      </Alert>
    );
  }

  const active = transactions.filter(t => !['closed', 'canceled', 'expired', 'withdrawn'].includes(t.status || ''));
  const closed = transactions.filter(t => ['closed', 'canceled', 'expired', 'withdrawn'].includes(t.status || ''));

  const TxCard = ({ tx }: { tx: any }) => {
    const address = tx.propertyAddress || tx.address || 'Unknown Address';
    const status = tx.status || 'active';
    const side = tx.side || tx.dealType || tx.closingType || '';
    const closeDate = tx.projectedCloseDate || tx.closedDate || tx.closingDate;
    const clientName = tx.clientName || tx.sellerName || tx.buyerName || '';
    const hasTasksAlert = tx.pendingTasksCount > 0;

    // Commission fields — agent-visible only (no broker GCI $ or broker split %)
    const isCoAgentViewer = Boolean(tx.viewerIsCoAgent || tx._isCoAgentView);
    const participantAllocation = isCoAgentViewer
      ? tx.participantAllocations?.coAgent
      : tx.participantAllocations?.primary;
    const salePrice = Number(tx.salePrice) || Number(tx.listPrice) || 0;
    const viewerVolume = Number(participantAllocation?.volumeCredit) || salePrice;
    const isActive = status === 'active' || status === 'coming_soon';
    const priceLabel = participantAllocation ? 'My Volume' : (isActive ? 'List Price' : 'Sale Price');
    const commPct = tx.sellerPayingListingAgent ?? tx.commissionPercent ?? null;
    const viewerSplit = isCoAgentViewer ? tx.coAgent?.splitSnapshot : tx.splitSnapshot;
    const agentSplitPct = viewerSplit?.agentSplitPercent ?? (isCoAgentViewer ? tx.coAgent?.splitPercent : tx.agentPct) ?? null;
    const agentNet = participantAllocation?.netCommission ?? viewerSplit?.agentNetCommission ?? tx.agentDollar ?? null;
    const hasCommission = commPct !== null || agentSplitPct !== null || agentNet !== null;
    const fmt$ = (v: number) => '$' + v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });

    return (
      <Link href={`/dashboard/my-transactions/${tx.id}`}>
        <Card className="hover:shadow-md transition-shadow cursor-pointer">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <div className={cn('mt-0.5 rounded-full p-1.5', side === 'buyer' ? 'bg-blue-100' : 'bg-green-100')}>
                  {side === 'buyer'
                    ? <Users className="h-4 w-4 text-blue-600" />
                    : <Home className="h-4 w-4 text-green-600" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{address}</p>
                  {clientName && <p className="text-xs text-muted-foreground">{clientName}</p>}
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <Badge className={cn('text-xs', STATUS_COLORS[status] || 'bg-muted text-foreground')}>
                      {status.replace(/_/g, ' ')}
                    </Badge>
                    {isCoAgentViewer && (
                      <Badge variant="secondary" className="text-xs">Co-agent share</Badge>
                    )}
                    {side && (
                      <Badge variant="outline" className="text-xs capitalize">
                        {side.replace(/_/g, ' ')}
                      </Badge>
                    )}
                    {closeDate && (
                      <span className="text-xs text-muted-foreground">Close: {formatDate(closeDate)}</span>
                    )}
                  </div>
                  {/* Commission summary row */}
                  {(viewerVolume > 0 || hasCommission) && (
                    <div className="flex items-center gap-3 mt-2 flex-wrap text-xs text-muted-foreground">
                      {viewerVolume > 0 && (
                        <span className="font-medium text-foreground">{priceLabel}: {fmt$(viewerVolume)}</span>
                      )}
                      {commPct !== null && (
                        <span>Comm: {commPct}%</span>
                      )}
                      {agentSplitPct !== null && (
                        <span>My Split: {agentSplitPct}%</span>
                      )}
                      {agentNet !== null && (
                        <span className="font-semibold text-green-700 dark:text-green-400">
                          {isActive ? 'Est. ' : ''}Net: {fmt$(Number(agentNet))}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {hasTasksAlert && (
                  <Badge className="bg-amber-100 text-amber-800 text-xs">
                    {tx.pendingTasksCount} task{tx.pendingTasksCount !== 1 ? 's' : ''}
                  </Badge>
                )}
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>
          </CardContent>
        </Card>
      </Link>
    );
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-16">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My Transactions</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {active.length} active · {closed.length} closed
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/transactions/new">
            <Plus className="mr-2 h-4 w-4" /> Add Transaction
          </Link>
        </Button>
      </div>

      {transactions.length === 0 && isAdmin && !isImpersonating && (
        <Card>
          <CardContent className="py-8 text-center space-y-3">
            <AlertTriangle className="h-8 w-8 text-amber-500 mx-auto" />
            <p className="font-semibold text-base">You&apos;re signed in as an Admin</p>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              Admins don&apos;t have personal transactions here. Use the Transaction Ledger to view all agent transactions,
              or impersonate an agent from their profile to see their transactions on this page.
            </p>
            <div className="flex gap-3 justify-center pt-2">
              <Button onClick={() => router.push('/dashboard/admin/transactions')}>
                View Transaction Ledger
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
      {transactions.length === 0 && (!isAdmin || isImpersonating) && (
        <Card>
          <CardContent className="pt-8 pb-8 text-center">
            <p className="text-muted-foreground">No transactions submitted yet.</p>
            <Button asChild className="mt-4">
              <Link href="/dashboard/transactions/new">
                <Plus className="mr-2 h-4 w-4" /> Add Your First Transaction
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {active.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Active</h2>
          {active.map(tx => <TxCard key={tx.id} tx={tx} />)}
        </div>
      )}

      {closed.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Closed / Completed</h2>
          {closed.map(tx => <TxCard key={tx.id} tx={tx} />)}
        </div>
      )}
    </div>
  );
}
