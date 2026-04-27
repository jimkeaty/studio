'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState, use, useCallback } from 'react';
import { useUser } from '@/firebase';
import { useIsStaff } from '@/hooks/useIsStaff';
import { useIsAdminLike } from '@/hooks/useIsAdminLike';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  ArrowLeft, CheckCircle2, XCircle, Save, AlertTriangle, ExternalLink,
  MapPin, User, Phone, Mail, RefreshCw, Clock, Tag, DollarSign, Calendar,
  Home, Building2, FileText, Wrench, Shield,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type QueueStatus = 'pending_review' | 'in_progress' | 'completed' | 'dismissed';

type StaffQueueItem = {
  id: string;
  transactionId: string;
  transactionAddress?: string;
  address?: string;
  agentId: string;
  agentName: string;
  actionType: string;
  previousStatus?: string | null;
  newStatus?: string | null;
  notes?: string;
  submittedBy: string;
  submittedByName: string;
  tcWorking: boolean;
  status: QueueStatus;
  reviewedBy?: string | null;
  reviewedByName?: string | null;
  reviewedAt?: string | null;
  staffNotes?: string;
  createdAt: string;
  updatedAt: string;
};

type Transaction = Record<string, any>;

const formatDate = (s?: string | null) => {
  if (!s) return '—';
  try { return format(parseISO(s), 'MMM d, yyyy'); } catch { return s; }
};

const formatCurrency = (n?: number | null) =>
  n != null && n !== 0
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n)
    : '—';

const formatPct = (n?: number | null) =>
  n != null && n !== 0 ? `${n}%` : '—';

const TX_STATUS_LABELS: Record<string, string> = {
  active: 'Active', pending: 'Pending', temp_off_market: 'Temp Off Market',
  closed: 'Closed', cancelled: 'Cancelled', canceled: 'Canceled',
  expired: 'Expired', sold: 'Sold', coming_soon: 'Coming Soon',
};

const CLOSING_TYPE_LABELS: Record<string, string> = {
  buyer: 'Buyer', listing: 'Listing', dual: 'Dual', referral: 'Referral',
};

const DEAL_TYPE_LABELS: Record<string, string> = {
  residential_sale: 'Residential Sale', residential_lease: 'Residential Lease',
  land: 'Land', commercial_sale: 'Commercial Sale', commercial_lease: 'Commercial Lease',
};

const STATUS_CONFIG: Record<QueueStatus, { label: string; color: string }> = {
  pending_review: { label: 'Pending Review', color: 'bg-amber-500/80 text-white' },
  in_progress: { label: 'In Progress', color: 'bg-blue-500/80 text-white' },
  completed: { label: 'Completed', color: 'bg-green-600/80 text-white' },
  dismissed: { label: 'Dismissed', color: 'bg-gray-500/80 text-white' },
};

const ACTION_CONFIG: Record<string, { label: string; color: string }> = {
  new_listing: { label: 'New Listing', color: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  status_change: { label: 'Status Change', color: 'bg-purple-100 text-purple-800 border-purple-200' },
  update: { label: 'Update', color: 'bg-blue-100 text-blue-800 border-blue-200' },
  closed_buyer: { label: 'Closed Buyer', color: 'bg-amber-100 text-amber-800 border-amber-200' },
};

// ── Read-only field display ───────────────────────────────────────────────────
function InfoRow({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-0.5 sm:gap-3 py-1.5 border-b border-muted/40 last:border-0">
      <span className="text-xs text-muted-foreground sm:w-44 shrink-0 pt-0.5">{label}</span>
      <span className={cn('text-sm font-medium', mono && 'font-mono')}>{value || '—'}</span>
    </div>
  );
}

function SectionCard({ icon, title, children }: {
  icon: React.ReactNode; title: string; children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          {icon}{title}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-0">{children}</CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
export default function StaffQueueDetailPage({ params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = use(params);
  const { user } = useUser();
  const isStaff = useIsStaff();
  const { isAdmin } = useIsAdminLike();
  const router = useRouter();
  const { toast } = useToast();

  const [item, setItem] = useState<StaffQueueItem | null>(null);
  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Editable fields (staff can update these inline)
  const [txStatus, setTxStatus] = useState('');
  const [txAddress, setTxAddress] = useState('');
  const [txSalePrice, setTxSalePrice] = useState('');
  const [txContractDate, setTxContractDate] = useState('');
  const [txClosedDate, setTxClosedDate] = useState('');
  const [txProjectedCloseDate, setTxProjectedCloseDate] = useState('');
  const [txInspectionDeadline, setTxInspectionDeadline] = useState('');
  const [txBuyerName, setTxBuyerName] = useState('');
  const [txBuyerEmail, setTxBuyerEmail] = useState('');
  const [txBuyerPhone, setTxBuyerPhone] = useState('');
  const [txSellerName, setTxSellerName] = useState('');
  const [txSellerEmail, setTxSellerEmail] = useState('');
  const [txSellerPhone, setTxSellerPhone] = useState('');
  const [txNotes, setTxNotes] = useState('');
  const [staffNotes, setStaffNotes] = useState('');

  const fetchItem = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/staff-queue/${itemId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to load');
      setItem(data.item);
      setStaffNotes(data.item.staffNotes || '');
      if (data.transaction) {
        const tx = data.transaction;
        setTransaction(tx);
        setTxStatus(tx.status || '');
        setTxAddress(tx.address || tx.propertyAddress || '');
        setTxSalePrice(String(tx.salePrice || tx.dealValue || ''));
        setTxContractDate(tx.contractDate ? tx.contractDate.split('T')[0] : '');
        setTxClosedDate((tx.closedDate || tx.closingDate) ? (tx.closedDate || tx.closingDate).split('T')[0] : '');
        setTxProjectedCloseDate(tx.projectedCloseDate ? tx.projectedCloseDate.split('T')[0] : '');
        setTxInspectionDeadline(tx.inspectionDeadline ? tx.inspectionDeadline.split('T')[0] : '');
        setTxBuyerName(tx.buyerName || '');
        setTxBuyerEmail(tx.buyerEmail || '');
        setTxBuyerPhone(tx.buyerPhone || '');
        setTxSellerName(tx.sellerName || '');
        setTxSellerEmail(tx.sellerEmail || '');
        setTxSellerPhone(tx.sellerPhone || '');
        setTxNotes(tx.notes || '');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [user, itemId]);

  useEffect(() => { fetchItem(); }, [fetchItem]);

  const handleAction = async (action: 'start_review' | 'complete' | 'dismiss' | 'save_tx') => {
    if (!user || !item) return;
    setSaving(true);
    try {
      const token = await user.getIdToken();
      const body: Record<string, any> = { staffNotes };

      if (action === 'save_tx') {
        body.action = 'start_review';
        body.txUpdates = {
          status: txStatus || undefined,
          address: txAddress || undefined,
          salePrice: txSalePrice ? Number(txSalePrice) : undefined,
          dealValue: txSalePrice ? Number(txSalePrice) : undefined,
          contractDate: txContractDate || undefined,
          closedDate: txClosedDate || undefined,
          projectedCloseDate: txProjectedCloseDate || undefined,
          inspectionDeadline: txInspectionDeadline || undefined,
          buyerName: txBuyerName || undefined,
          buyerEmail: txBuyerEmail || undefined,
          buyerPhone: txBuyerPhone || undefined,
          sellerName: txSellerName || undefined,
          sellerEmail: txSellerEmail || undefined,
          sellerPhone: txSellerPhone || undefined,
          notes: txNotes || undefined,
          staffNotes: staffNotes || undefined,
        };
      } else {
        body.action = action;
      }

      const res = await fetch(`/api/admin/staff-queue/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to save');

      toast({
        title: action === 'complete' ? 'Marked as Completed' : action === 'dismiss' ? 'Dismissed' : 'Saved',
        description: action === 'complete'
          ? 'Queue item completed.'
          : action === 'save_tx'
          ? 'Transaction updated in ledger.'
          : 'Queue item updated.',
      });

      if (action === 'complete' || action === 'dismiss') {
        router.push('/dashboard/admin/staff-queue');
      } else {
        fetchItem();
      }
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error', description: err.message || 'Failed to save' });
    } finally {
      setSaving(false);
    }
  };

  if (!isStaff) {
    return (
      <div className="p-8">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Access Denied</AlertTitle>
          <AlertDescription>You do not have permission to view the Staff Queue.</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error || 'Item not found'}</AlertDescription>
        </Alert>
      </div>
    );
  }

  const sc = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.pending_review;
  const ac = ACTION_CONFIG[item.actionType] ?? ACTION_CONFIG.update;
  const isActive = item.status === 'pending_review' || item.status === 'in_progress';
  const displayAddress = item.transactionAddress || item.address || transaction?.propertyAddress || transaction?.address || 'Staff Queue Item';
  const tx = transaction;

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-6xl mx-auto">

      {/* Back + Header */}
      <div className="flex items-center gap-3">
        <Link href="/dashboard/admin/staff-queue">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Staff Queue
          </Button>
        </Link>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            {displayAddress}
          </h1>
          <div className="flex flex-wrap items-center gap-2 mt-1.5">
            <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold', sc.color)}>
              {sc.label}
            </span>
            <span className={cn('inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border', ac.color)}>
              {ac.label}
            </span>
            {(item.actionType === 'status_change' || item.actionType === 'closed_buyer') && (item.previousStatus || item.newStatus) && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <span className="px-1.5 py-0.5 rounded bg-muted border">{TX_STATUS_LABELS[item.previousStatus || ''] || item.previousStatus || '?'}</span>
                →
                <span className="px-1.5 py-0.5 rounded bg-primary/10 border border-primary/20 text-primary font-medium">{TX_STATUS_LABELS[item.newStatus || ''] || item.newStatus || '?'}</span>
              </span>
            )}
            <span className="text-xs text-muted-foreground">
              Submitted {formatDate(item.createdAt)} by {item.submittedByName || item.agentName || '—'}
            </span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 flex-wrap shrink-0">
          {tx && isAdmin && (
            <Link href={`/dashboard/admin/transactions/edit?id=${item.transactionId}`} target="_blank">
              <Button variant="outline" size="sm">
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                Full Edit in Ledger
              </Button>
            </Link>
          )}
          {isActive && (
            <>
              <Button variant="outline" size="sm" onClick={() => handleAction('dismiss')} disabled={saving}>
                <XCircle className="h-3.5 w-3.5 mr-1.5" />
                Dismiss
              </Button>
              <Button size="sm" onClick={() => handleAction('complete')} disabled={saving} className="bg-green-600 hover:bg-green-700 text-white">
                <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                Mark Complete
              </Button>
            </>
          )}
        </div>
      </div>

      {/* ── Main layout: left sidebar (queue info + staff notes) + right (full tx) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">

        {/* ── Left sidebar ─────────────────────────────────────────────────── */}
        <div className="space-y-4 lg:col-span-1">

          {/* Queue Details */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold">Queue Details</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-0">
              <InfoRow label="Action Type" value={ac.label} />
              <InfoRow label="Agent" value={item.agentName || '—'} />
              <InfoRow label="Working with TC" value={item.tcWorking ? 'Yes' : 'No'} />
              <InfoRow label="Submitted By" value={item.submittedByName || '—'} />
              <InfoRow label="Submitted" value={formatDate(item.createdAt)} />
              {item.reviewedByName && <InfoRow label="Reviewed By" value={item.reviewedByName} />}
              {item.reviewedAt && <InfoRow label="Reviewed At" value={formatDate(item.reviewedAt)} />}
              {item.notes && (
                <div className="pt-2">
                  <p className="text-xs text-muted-foreground mb-1">Agent Notes</p>
                  <p className="text-sm bg-muted/50 rounded-md p-2 border">{item.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Staff Notes */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold">Staff Notes</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <Textarea
                value={staffNotes}
                onChange={(e) => setStaffNotes(e.target.value)}
                placeholder="Log MLS updates, actions taken, etc."
                rows={5}
                disabled={!isActive}
              />
              {isActive && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2 w-full"
                  onClick={() => handleAction('save_tx')}
                  disabled={saving}
                >
                  <Save className="h-3.5 w-3.5 mr-1.5" />
                  Save Notes
                </Button>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Right: Full transaction data ─────────────────────────────────── */}
        <div className="lg:col-span-3 space-y-4">
          {tx ? (
            <>
              {/* ── Editable: Core Deal Fields ─────────────────────────────── */}
              <Card className="border-primary/30">
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Tag className="h-4 w-4 text-primary" />
                    Editable Fields
                    {isActive && <Badge variant="outline" className="text-[10px] ml-1">Staff can edit</Badge>}
                    {!isActive && <Badge variant="secondary" className="text-[10px] ml-1">Read-only</Badge>}
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Status</label>
                      <Select value={txStatus} onValueChange={setTxStatus} disabled={!isActive}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="coming_soon">Coming Soon</SelectItem>
                          <SelectItem value="temp_off_market">Temp Off Market</SelectItem>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="closed">Closed</SelectItem>
                          <SelectItem value="cancelled">Cancelled</SelectItem>
                          <SelectItem value="expired">Expired</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Sale Price</label>
                      <Input type="number" value={txSalePrice} onChange={e => setTxSalePrice(e.target.value)} disabled={!isActive} />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Property Address</label>
                    <Input value={txAddress} onChange={e => setTxAddress(e.target.value)} disabled={!isActive} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Contract Date</label>
                      <Input type="date" value={txContractDate} onChange={e => setTxContractDate(e.target.value)} disabled={!isActive} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Close Date</label>
                      <Input type="date" value={txClosedDate} onChange={e => setTxClosedDate(e.target.value)} disabled={!isActive} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Projected Close Date</label>
                      <Input type="date" value={txProjectedCloseDate} onChange={e => setTxProjectedCloseDate(e.target.value)} disabled={!isActive} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Inspection Deadline</label>
                      <Input type="date" value={txInspectionDeadline} onChange={e => setTxInspectionDeadline(e.target.value)} disabled={!isActive} />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Buyer Name</label>
                      <Input value={txBuyerName} onChange={e => setTxBuyerName(e.target.value)} disabled={!isActive} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Buyer Email</label>
                      <Input type="email" value={txBuyerEmail} onChange={e => setTxBuyerEmail(e.target.value)} disabled={!isActive} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Buyer Phone</label>
                      <Input value={txBuyerPhone} onChange={e => setTxBuyerPhone(e.target.value)} disabled={!isActive} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Seller Name</label>
                      <Input value={txSellerName} onChange={e => setTxSellerName(e.target.value)} disabled={!isActive} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Seller Email</label>
                      <Input type="email" value={txSellerEmail} onChange={e => setTxSellerEmail(e.target.value)} disabled={!isActive} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Seller Phone</label>
                      <Input value={txSellerPhone} onChange={e => setTxSellerPhone(e.target.value)} disabled={!isActive} />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Transaction Notes</label>
                    <Textarea value={txNotes} onChange={e => setTxNotes(e.target.value)} rows={3} disabled={!isActive} placeholder="Transaction notes..." />
                  </div>
                  {isActive && (
                    <div className="flex gap-3 justify-end pt-1">
                      <Button variant="secondary" onClick={() => handleAction('save_tx')} disabled={saving}>
                        <Save className="h-4 w-4 mr-1.5" />
                        Save Changes
                      </Button>
                      <Button onClick={() => handleAction('complete')} disabled={saving} className="bg-green-600 hover:bg-green-700 text-white">
                        <CheckCircle2 className="h-4 w-4 mr-1.5" />
                        Save &amp; Mark Complete
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* ── Read-only: Full Transaction Data ───────────────────────── */}
              <SectionCard icon={<Home className="h-4 w-4" />} title="Deal Information">
                <InfoRow label="Closing Type" value={CLOSING_TYPE_LABELS[tx.closingType] || tx.closingType} />
                <InfoRow label="Deal Type" value={DEAL_TYPE_LABELS[tx.dealType || tx.transactionType] || tx.dealType || tx.transactionType} />
                <InfoRow label="Deal Source" value={tx.dealSource} />
                <InfoRow label="Agent" value={tx.agentDisplayName} />
                <InfoRow label="Working with TC" value={tx.tcWorking === 'yes' ? 'Yes' : tx.tcWorking === 'no' ? 'No' : tx.tcWorking} />
                <InfoRow label="List Price" value={formatCurrency(tx.listPrice)} />
                <InfoRow label="Sale Price" value={formatCurrency(tx.salePrice || tx.dealValue)} />
                <InfoRow label="Listing Date" value={formatDate(tx.listingDate)} />
                <InfoRow label="Option Expiration" value={formatDate(tx.optionExpiration)} />
                <InfoRow label="Survey Deadline" value={formatDate(tx.surveyDeadline)} />
                <InfoRow label="Earnest Money" value={formatCurrency(tx.earnestMoney)} />
                <InfoRow label="Deposit Holder" value={tx.depositHolder} />
              </SectionCard>

              <SectionCard icon={<DollarSign className="h-4 w-4" />} title="Commission & Financials">
                <InfoRow label="Commission %" value={formatPct(tx.commissionPercent)} />
                <InfoRow label="Commission Base Price" value={formatCurrency(tx.commissionBasePrice)} />
                <InfoRow label="GCI" value={formatCurrency(tx.gci ?? tx.splitSnapshot?.grossCommission)} />
                <InfoRow label="Agent Split %" value={formatPct(tx.agentPct ?? tx.splitSnapshot?.agentSplitPercent)} />
                <InfoRow label="Agent Net Commission" value={formatCurrency(tx.agentDollar ?? tx.splitSnapshot?.agentNetCommission)} />
                <InfoRow label="Broker Split %" value={formatPct(tx.brokerPct ?? tx.splitSnapshot?.companySplitPercent)} />
                <InfoRow label="Company Retained" value={formatCurrency(tx.brokerGci ?? tx.splitSnapshot?.companyRetained)} />
                <InfoRow label="Transaction Fee" value={formatCurrency(tx.transactionFee)} />
                <InfoRow label="Seller Paying Listing Agent" value={tx.sellerPayingListingAgentUnknown ? 'Unknown' : formatPct(tx.sellerPayingListingAgent)} />
                <InfoRow label="Seller Paying Buyer Agent" value={formatPct(tx.sellerPayingBuyerAgent)} />
                <InfoRow label="Buyer Closing Cost Total" value={formatCurrency(tx.buyerClosingCostTotal)} />
                <InfoRow label="Shortage in Commission" value={tx.shortageInCommission === 'yes' ? `Yes — ${formatCurrency(tx.shortageAmount)}` : tx.shortageInCommission === 'no' ? 'No' : '—'} />
                <InfoRow label="Compliance Fee" value={tx.txComplianceFee === 'yes' ? `Yes — ${formatCurrency(tx.txComplianceFeeAmount)} (paid by ${tx.txComplianceFeePaidBy || '?'})` : tx.txComplianceFee === 'no' ? 'No' : '—'} />
              </SectionCard>

              <SectionCard icon={<User className="h-4 w-4" />} title="Parties">
                <InfoRow label="Client Name" value={tx.clientName} />
                <InfoRow label="Client Email" value={tx.clientEmail} />
                <InfoRow label="Client Phone" value={tx.clientPhone} />
                <InfoRow label="Client Type" value={tx.clientType} />
                <InfoRow label="Client 2 Name" value={tx.client2Name} />
                <InfoRow label="Client 2 Email" value={tx.client2Email} />
                <InfoRow label="Buyer Name" value={tx.buyerName} />
                <InfoRow label="Buyer Email" value={tx.buyerEmail} />
                <InfoRow label="Buyer Phone" value={tx.buyerPhone} />
                <InfoRow label="Buyer 2 Name" value={tx.buyer2Name} />
                <InfoRow label="Seller Name" value={tx.sellerName} />
                <InfoRow label="Seller Email" value={tx.sellerEmail} />
                <InfoRow label="Seller Phone" value={tx.sellerPhone} />
                <InfoRow label="Seller 2 Name" value={tx.seller2Name} />
                <InfoRow label="Other Agent" value={tx.otherAgentName} />
                <InfoRow label="Other Agent Email" value={tx.otherAgentEmail} />
                <InfoRow label="Other Agent Phone" value={tx.otherAgentPhone} />
                <InfoRow label="Other Brokerage" value={tx.otherBrokerage} />
                <InfoRow label="Client New Address" value={tx.clientNewAddress} />
              </SectionCard>

              <SectionCard icon={<Building2 className="h-4 w-4" />} title="Lender & Title">
                <InfoRow label="Mortgage Company" value={tx.mortgageCompany} />
                <InfoRow label="Loan Officer" value={tx.loanOfficer} />
                <InfoRow label="Loan Officer Email" value={tx.loanOfficerEmail} />
                <InfoRow label="Loan Officer Phone" value={tx.loanOfficerPhone} />
                <InfoRow label="Lender Office" value={tx.lenderOffice} />
                <InfoRow label="Title Company" value={tx.titleCompany} />
                <InfoRow label="Title Officer" value={tx.titleOfficer} />
                <InfoRow label="Title Officer Email" value={tx.titleOfficerEmail} />
                <InfoRow label="Title Officer Phone" value={tx.titleOfficerPhone} />
                <InfoRow label="Title Attorney" value={tx.titleAttorney} />
                <InfoRow label="Title Office" value={tx.titleOffice} />
              </SectionCard>

              <SectionCard icon={<Wrench className="h-4 w-4" />} title="Inspections">
                <InfoRow label="Inspection Ordered" value={tx.inspectionOrdered === 'yes' ? 'Yes' : tx.inspectionOrdered === 'no' ? 'No' : '—'} />
                <InfoRow label="Target Inspection Date" value={formatDate(tx.targetInspectionDate)} />
                <InfoRow label="Inspection Types" value={Array.isArray(tx.inspectionTypes) && tx.inspectionTypes.length > 0 ? tx.inspectionTypes.join(', ') : '—'} />
                <InfoRow label="Inspector Name" value={tx.inspectorName} />
                <InfoRow label="TC Schedule Inspections" value={tx.tcScheduleInspections} />
              </SectionCard>

              <SectionCard icon={<Shield className="h-4 w-4" />} title="Additional Details">
                <InfoRow label="Warranty at Closing" value={tx.warrantyAtClosing === 'yes' ? `Yes — paid by ${tx.warrantyPaidBy || '?'}` : tx.warrantyAtClosing === 'no' ? 'No' : '—'} />
                <InfoRow label="Occupancy Agreement" value={tx.occupancyAgreement === 'yes' ? `Yes — ${tx.occupancyDates || 'dates TBD'}` : tx.occupancyAgreement === 'no' ? 'No' : '—'} />
                <InfoRow label="Buyer Bring to Closing" value={formatCurrency(tx.buyerBringToClosing)} />
                <InfoRow label="Additional Comments" value={tx.additionalComments} />
                <InfoRow label="Transaction Notes" value={tx.notes} />
                <InfoRow label="Transaction ID" value={item.transactionId} mono />
                <InfoRow label="Created" value={formatDate(tx.createdAt)} />
                <InfoRow label="Last Updated" value={formatDate(tx.updatedAt)} />
              </SectionCard>
            </>
          ) : (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <AlertTriangle className="h-8 w-8 mx-auto mb-3 opacity-30" />
                <p>Transaction not found or may have been deleted.</p>
                <p className="text-xs mt-1">Transaction ID: {item.transactionId}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
