'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState, use, useCallback } from 'react';
import { useUser } from '@/firebase';
import { useIsStaff } from '@/hooks/useIsStaff';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  ArrowLeft, CheckCircle2, XCircle, Eye, Save, AlertTriangle, ExternalLink,
  MapPin, User, Phone, Mail, RefreshCw, Clock, Tag,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type QueueStatus = 'pending_review' | 'in_progress' | 'completed' | 'dismissed';

type StaffQueueItem = {
  id: string;
  transactionId: string;
  transactionAddress: string;
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
  n != null ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n) : '—';

const TX_STATUS_LABELS: Record<string, string> = {
  active: 'Active', pending: 'Pending', temp_off_market: 'Temp Off Market',
  closed: 'Closed', cancelled: 'Cancelled', canceled: 'Canceled',
  expired: 'Expired', sold: 'Sold',
};

const STATUS_CONFIG: Record<QueueStatus, { label: string; color: string }> = {
  pending_review: { label: 'Pending Review', color: 'bg-amber-500/80 text-white' },
  in_progress: { label: 'In Progress', color: 'bg-blue-500/80 text-white' },
  completed: { label: 'Completed', color: 'bg-green-600/80 text-white' },
  dismissed: { label: 'Dismissed', color: 'bg-gray-500/80 text-white' },
};

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-0.5 sm:gap-3 py-1.5">
      <span className="text-xs text-muted-foreground sm:w-36 shrink-0">{label}</span>
      <span className="text-sm font-medium">{value || '—'}</span>
    </div>
  );
}

export default function StaffQueueDetailPage({ params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = use(params);
  const { user } = useUser();
  const isStaff = useIsStaff();
  const router = useRouter();
  const { toast } = useToast();

  const [item, setItem] = useState<StaffQueueItem | null>(null);
  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Editable transaction fields
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
        setTxContractDate(tx.contractDate || '');
        setTxClosedDate(tx.closedDate || tx.closingDate || '');
        setTxProjectedCloseDate(tx.projectedCloseDate || '');
        setTxInspectionDeadline(tx.inspectionDeadline || '');
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
        description: action === 'complete' ? 'Transaction updated and queue item completed.' : action === 'save_tx' ? 'Transaction updated in ledger.' : 'Queue item updated.',
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
  const isActive = item.status === 'pending_review' || item.status === 'in_progress';

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-5xl mx-auto">
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
            {item.transactionAddress || 'Staff Queue Item'}
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold', sc.color)}>
              {sc.label}
            </span>
            <span className="text-xs text-muted-foreground">
              Submitted {formatDate(item.createdAt)} by {item.submittedByName || item.agentName || '—'}
            </span>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {transaction && (
            <Link href={`/dashboard/admin/transactions/edit?id=${item.transactionId}`} target="_blank">
              <Button variant="outline" size="sm">
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                Open in Ledger
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left — Queue Item Info */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Queue Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-0.5">
              <InfoRow label="Action Type" value={item.actionType === 'new_listing' ? 'New Listing' : item.actionType === 'status_change' ? 'Status Change' : 'Update'} />
              {item.actionType === 'status_change' && (
                <InfoRow
                  label="Status Change"
                  value={`${TX_STATUS_LABELS[item.previousStatus || ''] || item.previousStatus || '?'} → ${TX_STATUS_LABELS[item.newStatus || ''] || item.newStatus || '?'}`}
                />
              )}
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
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Staff Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={staffNotes}
                onChange={(e) => setStaffNotes(e.target.value)}
                placeholder="Add internal notes about MLS updates, actions taken, etc."
                rows={4}
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
                  Save Notes Only
                </Button>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right — Transaction Edit */}
        <div className="lg:col-span-2 space-y-4">
          {transaction ? (
            <>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Transaction Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Status */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Status</label>
                      <Select value={txStatus} onValueChange={setTxStatus} disabled={!isActive}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
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

                  {/* Address */}
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Property Address</label>
                    <Input value={txAddress} onChange={e => setTxAddress(e.target.value)} disabled={!isActive} />
                  </div>

                  {/* Dates */}
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
                </CardContent>
              </Card>

              {/* Buyer Info */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <User className="h-4 w-4" />Buyer Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                </CardContent>
              </Card>

              {/* Seller Info */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <User className="h-4 w-4" />Seller Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                </CardContent>
              </Card>

              {/* Notes */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Transaction Notes</CardTitle>
                </CardHeader>
                <CardContent>
                  <Textarea value={txNotes} onChange={e => setTxNotes(e.target.value)} rows={3} disabled={!isActive} placeholder="Transaction notes..." />
                </CardContent>
              </Card>

              {isActive && (
                <div className="flex gap-3 justify-end">
                  <Button variant="outline" onClick={() => handleAction('dismiss')} disabled={saving}>
                    <XCircle className="h-4 w-4 mr-1.5" />
                    Dismiss
                  </Button>
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
