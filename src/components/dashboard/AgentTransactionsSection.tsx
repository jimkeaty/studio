'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AgentTx {
  id: string;
  status: string;
  propertyAddress?: string | null;
  clientName?: string | null;
  buyerName?: string | null;
  sellerName?: string | null;
  salePrice?: number | null;
  listPrice?: number | null;
  netIncome?: number | null;
  closedDate?: string | null;
  closingDate?: string | null;
  contractDate?: string | null;
  listingDate?: string | null;
  dealType?: string | null;
  agentRole?: string | null;
  year?: number | null;
  [key: string]: any;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt$(n: number | null | undefined): string {
  if (!n) return '—';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

function fmtFull$(n: number | null | undefined): string {
  if (!n) return '—';
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return '—';
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getDisplayName(tx: AgentTx): string {
  return tx.propertyAddress || tx.clientName || tx.buyerName || tx.sellerName || 'Unnamed Transaction';
}

function getClientName(tx: AgentTx): string {
  if (tx.dealType === 'listing' || tx.agentRole === 'listing') {
    return tx.sellerName || tx.clientName || '—';
  }
  return tx.buyerName || tx.clientName || '—';
}

function getTxYear(tx: AgentTx): number {
  if (tx.year) return Number(tx.year);
  const d = tx.closedDate ?? tx.closingDate ?? '';
  const m = d.match(/^(\d{4})/);
  return m ? Number(m[1]) : new Date().getFullYear();
}

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, { label: string; cls: string }> = {
  active:          { label: 'Active',          cls: 'bg-green-100 text-green-800 border-green-200' },
  temp_off_market: { label: 'Temp Off Market', cls: 'bg-orange-100 text-orange-800 border-orange-200' },
  pending:         { label: 'Pending',         cls: 'bg-amber-100 text-amber-800 border-amber-200' },
  closed:          { label: 'Closed',          cls: 'bg-slate-100 text-slate-700 border-slate-200' },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_STYLES[status] ?? { label: status, cls: 'bg-gray-100 text-gray-700 border-gray-200' };
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border', cfg.cls)}>
      {cfg.label}
    </span>
  );
}

// ─── Agent Edit Modal ─────────────────────────────────────────────────────────

interface EditModalProps {
  tx: AgentTx;
  onClose: () => void;
  onSaved: () => void;
}

function AgentEditModal({ tx, onClose, onSaved }: EditModalProps) {
  const { user } = useUser();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const isListing = tx.dealType === 'listing' || tx.agentRole === 'listing';

  const [form, setForm] = useState({
    status: tx.status ?? 'active',
    propertyAddress: tx.propertyAddress ?? '',
    salePrice: tx.salePrice ? String(tx.salePrice) : '',
    listPrice: tx.listPrice ? String(tx.listPrice) : '',
    contractDate: tx.contractDate ?? '',
    closingDate: tx.closingDate ?? tx.closedDate ?? '',
    listingDate: tx.listingDate ?? '',
    // Seller info
    sellerName: tx.sellerName ?? '',
    sellerEmail: tx.sellerEmail ?? '',
    sellerPhone: tx.sellerPhone ?? '',
    // Buyer info
    buyerName: tx.buyerName ?? '',
    buyerEmail: tx.buyerEmail ?? '',
    buyerPhone: tx.buyerPhone ?? '',
    // Other agent
    otherAgentName: tx.otherAgentName ?? '',
    otherAgentEmail: tx.otherAgentEmail ?? '',
    otherAgentPhone: tx.otherAgentPhone ?? '',
    otherAgentBrokerage: tx.otherAgentBrokerage ?? '',
    // Commission
    sellerCommissionPct: tx.sellerCommissionPct ? String(tx.sellerCommissionPct) : '',
    buyerCommissionPct: tx.buyerCommissionPct ? String(tx.buyerCommissionPct) : '',
    // Notes
    notes: tx.notes ?? '',
  });

  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }));

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    try {
      const token = await user.getIdToken();
      const wasActive = tx.status === 'active' || tx.status === 'temp_off_market';
      const goingPending = form.status === 'pending';
      const resubmit = wasActive && goingPending;

      const payload: any = {
        status: form.status,
        propertyAddress: form.propertyAddress || null,
        salePrice: form.salePrice ? Number(form.salePrice) : null,
        listPrice: form.listPrice ? Number(form.listPrice) : null,
        contractDate: form.contractDate || null,
        closingDate: form.closingDate || null,
        listingDate: form.listingDate || null,
        sellerName: form.sellerName || null,
        sellerEmail: form.sellerEmail || null,
        sellerPhone: form.sellerPhone || null,
        buyerName: form.buyerName || null,
        buyerEmail: form.buyerEmail || null,
        buyerPhone: form.buyerPhone || null,
        otherAgentName: form.otherAgentName || null,
        otherAgentEmail: form.otherAgentEmail || null,
        otherAgentPhone: form.otherAgentPhone || null,
        otherAgentBrokerage: form.otherAgentBrokerage || null,
        sellerCommissionPct: form.sellerCommissionPct ? Number(form.sellerCommissionPct) : null,
        buyerCommissionPct: form.buyerCommissionPct ? Number(form.buyerCommissionPct) : null,
        notes: form.notes || null,
        resubmitToTc: resubmit,
      };

      const res = await fetch(`/api/agent/transactions/${tx.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? 'Save failed');

      toast({
        title: resubmit ? 'Submitted to TC Queue' : 'Transaction updated',
        description: resubmit
          ? 'Your transaction has been updated and sent to the TC for review.'
          : 'Your changes have been saved.',
      });
      onSaved();
      onClose();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    } finally {
      setSaving(false);
    }
  }

  const inputCls = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white';
  const labelCls = 'block text-xs font-semibold text-gray-600 mb-1';

  const goingPending = form.status === 'pending';
  const wasActive = tx.status === 'active' || tx.status === 'temp_off_market';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-700 px-6 py-4 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-lg font-bold text-white">Update Transaction</h2>
            <p className="text-blue-200 text-xs mt-0.5 truncate max-w-sm">{getDisplayName(tx)}</p>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white text-2xl leading-none">&times;</button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto p-6 space-y-5 flex-1">

          {/* Status */}
          <div>
            <label className={labelCls}>Transaction Status *</label>
            <select value={form.status} onChange={e => set('status', e.target.value)} className={inputCls}>
              <option value="active">Active</option>
              <option value="temp_off_market">Temp Off Market</option>
              <option value="pending">Pending</option>
            </select>
            {wasActive && goingPending && (
              <p className="mt-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                ⚠️ Changing to <strong>Pending</strong> will re-submit this transaction to the TC Queue for review.
              </p>
            )}
          </div>

          {/* Property */}
          <div>
            <label className={labelCls}>Property Address</label>
            <input value={form.propertyAddress} onChange={e => set('propertyAddress', e.target.value)} className={inputCls} placeholder="123 Main St, City, State" />
          </div>

          {/* Prices */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>List Price ($)</label>
              <input type="number" value={form.listPrice} onChange={e => set('listPrice', e.target.value)} className={inputCls} placeholder="350000" />
            </div>
            <div>
              <label className={labelCls}>Sale Price ($)</label>
              <input type="number" value={form.salePrice} onChange={e => set('salePrice', e.target.value)} className={inputCls} placeholder="345000" />
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            {isListing && (
              <div>
                <label className={labelCls}>Listing Date</label>
                <input type="date" value={form.listingDate} onChange={e => set('listingDate', e.target.value)} className={inputCls} />
              </div>
            )}
            <div>
              <label className={labelCls}>Contract Date</label>
              <input type="date" value={form.contractDate} onChange={e => set('contractDate', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Closing Date</label>
              <input type="date" value={form.closingDate} onChange={e => set('closingDate', e.target.value)} className={inputCls} />
            </div>
          </div>

          {/* Seller info */}
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Seller Information</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={labelCls}>Seller Name</label>
                <input value={form.sellerName} onChange={e => set('sellerName', e.target.value)} className={inputCls} placeholder="Jane Doe" />
              </div>
              <div>
                <label className={labelCls}>Seller Email</label>
                <input type="email" value={form.sellerEmail} onChange={e => set('sellerEmail', e.target.value)} className={inputCls} placeholder="jane@email.com" />
              </div>
              <div>
                <label className={labelCls}>Seller Phone</label>
                <input value={form.sellerPhone} onChange={e => set('sellerPhone', e.target.value)} className={inputCls} placeholder="(555) 000-0000" />
              </div>
            </div>
          </div>

          {/* Buyer info */}
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Buyer Information</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={labelCls}>Buyer Name</label>
                <input value={form.buyerName} onChange={e => set('buyerName', e.target.value)} className={inputCls} placeholder="John Doe" />
              </div>
              <div>
                <label className={labelCls}>Buyer Email</label>
                <input type="email" value={form.buyerEmail} onChange={e => set('buyerEmail', e.target.value)} className={inputCls} placeholder="john@email.com" />
              </div>
              <div>
                <label className={labelCls}>Buyer Phone</label>
                <input value={form.buyerPhone} onChange={e => set('buyerPhone', e.target.value)} className={inputCls} placeholder="(555) 000-0000" />
              </div>
            </div>
          </div>

          {/* Other agent */}
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Other Agent / Co-Op</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Agent Name</label>
                <input value={form.otherAgentName} onChange={e => set('otherAgentName', e.target.value)} className={inputCls} placeholder="Agent name" />
              </div>
              <div>
                <label className={labelCls}>Brokerage</label>
                <input value={form.otherAgentBrokerage} onChange={e => set('otherAgentBrokerage', e.target.value)} className={inputCls} placeholder="Brokerage name" />
              </div>
              <div>
                <label className={labelCls}>Agent Email</label>
                <input type="email" value={form.otherAgentEmail} onChange={e => set('otherAgentEmail', e.target.value)} className={inputCls} placeholder="agent@brokerage.com" />
              </div>
              <div>
                <label className={labelCls}>Agent Phone</label>
                <input value={form.otherAgentPhone} onChange={e => set('otherAgentPhone', e.target.value)} className={inputCls} placeholder="(555) 000-0000" />
              </div>
            </div>
          </div>

          {/* Commission */}
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Commission</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Seller Commission (%)</label>
                <input type="number" step="0.01" value={form.sellerCommissionPct} onChange={e => set('sellerCommissionPct', e.target.value)} className={inputCls} placeholder="3.00" />
              </div>
              <div>
                <label className={labelCls}>Buyer Commission (%)</label>
                <input type="number" step="0.01" value={form.buyerCommissionPct} onChange={e => set('buyerCommissionPct', e.target.value)} className={inputCls} placeholder="3.00" />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className={labelCls}>Notes</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={3}
              className={inputCls + ' resize-none'} placeholder="Any additional notes..." />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-gray-50 flex items-center justify-between shrink-0">
          <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700 font-medium">Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors"
          >
            {saving ? 'Saving…' : wasActive && goingPending ? 'Submit to TC Queue' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Transaction Row ──────────────────────────────────────────────────────────

function TxRow({ tx, onClick, showNet = true }: { tx: AgentTx; onClick?: () => void; showNet?: boolean }) {
  const price = tx.salePrice ?? tx.listPrice;
  const client = getClientName(tx);
  const addr = tx.propertyAddress || '—';
  const isClickable = !!onClick;

  return (
    <div
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 px-4 py-3 border-b last:border-b-0 text-sm transition-colors',
        isClickable ? 'cursor-pointer hover:bg-blue-50/60 group' : 'cursor-default'
      )}
    >
      {/* Address + client */}
      <div className="flex-1 min-w-0">
        <p className={cn('font-semibold text-sm truncate', isClickable && 'group-hover:text-blue-700')}>
          {addr}
        </p>
        <p className="text-xs text-muted-foreground truncate">{client}</p>
      </div>

      {/* Status */}
      <StatusBadge status={tx.status} />

      {/* Price */}
      <div className="text-right shrink-0 hidden sm:block">
        <p className="text-xs text-muted-foreground">Price</p>
        <p className="text-sm font-semibold">{fmt$(price)}</p>
      </div>

      {/* Net to agent */}
      {showNet && (
        <div className="text-right shrink-0">
          <p className="text-xs text-muted-foreground">Net to Me</p>
          <p className="text-sm font-bold text-green-700">{tx.netIncome != null ? fmtFull$(tx.netIncome) : '—'}</p>
        </div>
      )}

      {/* Edit hint */}
      {isClickable && (
        <div className="shrink-0 text-gray-300 group-hover:text-blue-400 transition-colors">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props {
  agentId: string;
  viewAs?: string;
}

export function AgentTransactionsSection({ agentId, viewAs }: Props) {
  const { user } = useUser();
  const currentYear = new Date().getFullYear();

  const [activeListings, setActiveListings] = useState<AgentTx[]>([]);
  const [pendingTx, setPendingTx] = useState<AgentTx[]>([]);
  const [allClosed, setAllClosed] = useState<AgentTx[]>([]);
  const [closedYears, setClosedYears] = useState<number[]>([currentYear]);
  const [selectedClosedYear, setSelectedClosedYear] = useState<number>(currentYear);
  const [loading, setLoading] = useState(true);
  const [editTx, setEditTx] = useState<AgentTx | null>(null);

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const url = viewAs
        ? `/api/agent/pipeline?year=${currentYear}&viewAs=${viewAs}`
        : `/api/agent/pipeline?year=${currentYear}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (data.ok) {
        setActiveListings(data.activeTransactions ?? []);
        setPendingTx(data.pendingTransactions ?? []);
        setAllClosed(data.allClosedTransactions ?? []);
        const years: number[] = data.closedYears ?? [currentYear];
        setClosedYears(years.length > 0 ? years : [currentYear]);
        if (!years.includes(selectedClosedYear)) {
          setSelectedClosedYear(years[0] ?? currentYear);
        }
      }
    } catch (err) {
      console.error('[AgentTransactionsSection]', err);
    } finally {
      setLoading(false);
    }
  }, [user, viewAs, currentYear]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const closedForYear = allClosed.filter(tx => getTxYear(tx) === selectedClosedYear);

  const totalActiveVol = activeListings.reduce((s, t) => s + (t.listPrice ?? t.salePrice ?? 0), 0);
  const totalPendingVol = pendingTx.reduce((s, t) => s + (t.salePrice ?? t.listPrice ?? 0), 0);
  const totalPendingNet = pendingTx.reduce((s, t) => s + (t.netIncome ?? 0), 0);
  const totalClosedVol = closedForYear.reduce((s, t) => s + (t.salePrice ?? 0), 0);
  const totalClosedNet = closedForYear.reduce((s, t) => s + (t.netIncome ?? 0), 0);

  const colConfig = [
    {
      key: 'active',
      title: 'Active Listings',
      color: 'border-t-green-500',
      headerBg: 'bg-green-50',
      count: activeListings.length,
      vol: totalActiveVol,
      volLabel: 'List Vol',
      rows: activeListings,
      editable: true,
      showNet: false,
      empty: { icon: '🏠', title: 'No active listings', desc: 'Submit a new transaction to get started.' },
    },
    {
      key: 'pending',
      title: 'Pending',
      color: 'border-t-amber-500',
      headerBg: 'bg-amber-50',
      count: pendingTx.length,
      vol: totalPendingVol,
      volLabel: 'Sale Vol',
      net: totalPendingNet,
      rows: pendingTx,
      editable: true,
      showNet: true,
      empty: { icon: '📋', title: 'No pending deals', desc: 'When a listing goes under contract, update it to Pending.' },
    },
    {
      key: 'closed',
      title: `Closed`,
      color: 'border-t-slate-500',
      headerBg: 'bg-slate-50',
      count: closedForYear.length,
      vol: totalClosedVol,
      volLabel: 'Closed Vol',
      net: totalClosedNet,
      rows: closedForYear,
      editable: false,
      showNet: true,
      empty: { icon: '✅', title: `No closed deals in ${selectedClosedYear}`, desc: 'Closed transactions will appear here.' },
    },
  ];

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-6 w-48 bg-muted rounded animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[0, 1, 2].map(i => <div key={i} className="h-48 bg-muted rounded-xl animate-pulse" />)}
        </div>
      </div>
    );
  }

  return (
    <>
      {editTx && (
        <AgentEditModal
          tx={editTx}
          onClose={() => setEditTx(null)}
          onSaved={() => { setEditTx(null); fetchData(); }}
        />
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">My Transactions</h2>
            <p className="text-sm text-muted-foreground">
              Active listings, pending deals, and closed transactions. Click any active or pending row to update.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {colConfig.map(col => (
            <div key={col.key} className={cn('rounded-xl border border-t-[3px] bg-card overflow-hidden', col.color)}>
              {/* Column header */}
              <div className={cn('px-4 py-3 flex items-center justify-between border-b', col.headerBg)}>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-600">{col.title}</span>
                  {col.key === 'closed' && closedYears.length > 0 && (
                    <select
                      value={selectedClosedYear}
                      onChange={e => setSelectedClosedYear(Number(e.target.value))}
                      className="text-xs border border-slate-300 rounded px-1 py-0.5 bg-white text-slate-700 font-semibold focus:outline-none"
                      onClick={e => e.stopPropagation()}
                    >
                      {closedYears.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {col.vol > 0 && (
                    <span className="text-xs font-semibold text-muted-foreground">{fmt$(col.vol)}</span>
                  )}
                  <span className="bg-slate-200 text-slate-700 text-xs font-bold px-2 py-0.5 rounded-full">{col.count}</span>
                </div>
              </div>

              {/* Net summary for pending/closed */}
              {col.net != null && col.net > 0 && (
                <div className="px-4 py-2 bg-white border-b flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Net to Me</span>
                  <span className="text-sm font-bold text-green-700">{fmtFull$(col.net)}</span>
                </div>
              )}

              {/* Rows */}
              <div className="max-h-80 overflow-y-auto">
                {col.rows.length === 0 ? (
                  <div className="py-6 px-3 flex flex-col items-center text-center">
                    <div className="text-3xl mb-2">{col.empty.icon}</div>
                    <p className="text-xs font-bold text-foreground mb-1">{col.empty.title}</p>
                    <p className="text-[11px] text-muted-foreground leading-snug">{col.empty.desc}</p>
                    {col.key === 'active' && (
                      <a href="/dashboard/transactions/new" className="mt-3 text-xs font-bold text-primary hover:underline">+ Add a Transaction →</a>
                    )}
                  </div>
                ) : (
                  col.rows.map(tx => (
                    <TxRow
                      key={tx.id}
                      tx={tx}
                      onClick={col.editable ? () => setEditTx(tx) : undefined}
                      showNet={col.showNet}
                    />
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
