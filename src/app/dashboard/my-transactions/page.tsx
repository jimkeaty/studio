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
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/agent/transactions', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.ok) {
        setTransactions(data.transactions || []);
      }
    } catch { /* non-fatal */ } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!userLoading && user) load();
    else if (!userLoading && !user) setLoading(false);
  }, [user, userLoading, load]);

  if (userLoading || loading) {
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
                    {side && (
                      <Badge variant="outline" className="text-xs capitalize">
                        {side.replace(/_/g, ' ')}
                      </Badge>
                    )}
                    {closeDate && (
                      <span className="text-xs text-muted-foreground">Close: {formatDate(closeDate)}</span>
                    )}
                  </div>
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

      {transactions.length === 0 && (
        <Card>
          <CardContent className="pt-8 pb-8 text-center">
            <p className="text-muted-foreground">No transactions yet.</p>
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
