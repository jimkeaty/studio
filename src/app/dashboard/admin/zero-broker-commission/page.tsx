'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useUser } from '@/firebase';
import { useIsAdminLike } from '@/hooks/useIsAdminLike';

type TxRow = {
  id: string;
  address: string;
  agentId: string;
  agentDisplayName: string;
  closingType: string;
  dealType: string;
  salePrice: number;
  grossCommission: number;
  brokerCommission: number;
  closedDate: string | null;
  year: number | null;
  isPassThrough: boolean;
  commissionOverridden: boolean;
};

function fmt$(n: number) {
  if (n === 0) return '$0';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${n.toLocaleString()}`;
}

function fmtDate(d: string | null) {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return d; }
}

export default function ZeroBrokerCommissionPage() {
  const { user, loading: userLoading } = useUser();
  const { isAdmin, loading: adminLoading } = useIsAdminLike();

  const [rows, setRows] = useState<TxRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError('');
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/zero-broker-commission', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load');
      setRows(data.transactions || []);
      setLoaded(true);
    } catch (err: any) {
      setError(err.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!userLoading && !adminLoading && user && isAdmin) load();
  }, [userLoading, adminLoading, user, isAdmin, load]);

  if (userLoading || adminLoading) return <div className="p-8 text-muted-foreground">Loading…</div>;
  if (!isAdmin) return <div className="p-8 text-red-600">Access denied.</div>;

  // Group by agent
  const grouped: Record<string, { agentDisplayName: string; agentId: string; txs: TxRow[] }> = {};
  for (const tx of rows) {
    const key = tx.agentId || tx.agentDisplayName;
    if (!grouped[key]) grouped[key] = { agentDisplayName: tx.agentDisplayName, agentId: tx.agentId, txs: [] };
    grouped[key].txs.push(tx);
  }
  const groups = Object.values(grouped).sort((a, b) => a.agentDisplayName.localeCompare(b.agentDisplayName));

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-1">$0 Broker Commission — Diagnostic Report</h1>
        <p className="text-muted-foreground text-sm">
          All <strong>closed</strong> transactions where the broker retained $0. Referral closings and already-marked pass-throughs are excluded.
          Review each transaction and mark as <strong>Pass-Through</strong> in the transaction editor if appropriate, then rebuild that agent&apos;s YTD rollup.
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
      )}

      {!loaded && !loading && (
        <button
          onClick={load}
          className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700"
        >
          Load Report
        </button>
      )}

      {loading && (
        <div className="text-muted-foreground text-sm py-8 text-center">Scanning all closed transactions…</div>
      )}

      {loaded && !loading && (
        <>
          <div className="mb-4 flex items-center gap-3">
            <span className="text-sm text-muted-foreground">
              Found <strong>{rows.length}</strong> transaction{rows.length !== 1 ? 's' : ''} across <strong>{groups.length}</strong> agent{groups.length !== 1 ? 's' : ''}
            </span>
            <button
              onClick={load}
              className="text-xs text-blue-600 hover:underline"
            >
              Refresh
            </button>
          </div>

          {groups.length === 0 && (
            <div className="py-12 text-center text-muted-foreground">
              ✅ No closed transactions with $0 broker commission found.
            </div>
          )}

          <div className="space-y-6">
            {groups.map(group => (
              <div key={group.agentId} className="border rounded-lg overflow-hidden">
                <div className="bg-muted/50 px-4 py-3 flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-sm">{group.agentDisplayName}</span>
                    <span className="ml-2 text-xs text-muted-foreground bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                      {group.txs.length} transaction{group.txs.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <Link
                    href={`/dashboard/admin/agents/${group.agentId}`}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    View Agent Profile →
                  </Link>
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/20 text-muted-foreground">
                      <th className="text-left px-4 py-2 font-medium">Address</th>
                      <th className="text-left px-4 py-2 font-medium">Type</th>
                      <th className="text-left px-4 py-2 font-medium">Closed</th>
                      <th className="text-right px-4 py-2 font-medium">Sale Price</th>
                      <th className="text-right px-4 py-2 font-medium">Gross GCI</th>
                      <th className="text-right px-4 py-2 font-medium">Broker $</th>
                      <th className="text-left px-4 py-2 font-medium">Flags</th>
                      <th className="text-left px-4 py-2 font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.txs.map((tx, i) => (
                      <tr key={tx.id} className={i % 2 === 0 ? 'bg-white dark:bg-transparent' : 'bg-muted/10'}>
                        <td className="px-4 py-2 font-medium max-w-[200px] truncate">{tx.address}</td>
                        <td className="px-4 py-2 text-muted-foreground capitalize">{tx.closingType}</td>
                        <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">{fmtDate(tx.closedDate)}</td>
                        <td className="px-4 py-2 text-right">{tx.salePrice > 0 ? fmt$(tx.salePrice) : '—'}</td>
                        <td className="px-4 py-2 text-right">{tx.grossCommission > 0 ? fmt$(tx.grossCommission) : '—'}</td>
                        <td className="px-4 py-2 text-right font-semibold text-red-600">$0</td>
                        <td className="px-4 py-2">
                          <div className="flex flex-wrap gap-1">
                            {tx.isPassThrough && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-700 border border-amber-300">
                                Pass-Through
                              </span>
                            )}
                            {tx.commissionOverridden && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-700 border border-blue-300">
                                Overridden
                              </span>
                            )}
                            {!tx.isPassThrough && !tx.commissionOverridden && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-100 text-red-700 border border-red-300">
                                Review Needed
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2">
                          <Link
                            href={`/dashboard/transactions/new?edit=${tx.id}`}
                            className="text-blue-600 hover:underline text-[11px] font-medium"
                          >
                            Edit →
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
