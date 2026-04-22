'use client';

/**
 * AgentTransactionsSection
 * 
 * A full ledger-style "My Transactions" table for the agent dashboard.
 * Mirrors the admin Transaction Ledger in layout and functionality, but:
 *   - Scoped to the current agent's own transactions
 *   - Shows "Net to Me" instead of Gross Comm / Co. Retained
 *   - Clicking a row opens the agent TC edit form (pre-filled) in a drawer
 *   - Moving Active → Pending re-submits to TC Queue for TC approval
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useUser } from '@/firebase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel } from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { AlertTriangle, Search, ArrowUpDown, ArrowUp, ArrowDown, ClipboardList, Save, X, RefreshCw } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';

/* ─── Types ──────────────────────────────────────────────────────────────── */

type AgentTx = {
  id: string;
  status: string;
  address?: string;
  propertyAddress?: string;
  agentDisplayName?: string;
  agentId?: string;
  transactionType?: string;
  closingType?: string;
  dealType?: string;
  contractDate?: string | null;
  closedDate?: string | null;
  closingDate?: string | null;
  listingDate?: string | null;
  dealValue?: number;
  listPrice?: number;
  salePrice?: number;
  commission?: number;
  splitSnapshot?: { agentNetCommission?: number; grossCommission?: number; companyRetained?: number } | null;
  netCommission?: number;
  netIncome?: number;
  clientName?: string;
  clientEmail?: string;
  clientPhone?: string;
  sellerName?: string; sellerEmail?: string; sellerPhone?: string;
  seller2Name?: string; seller2Email?: string; seller2Phone?: string;
  buyerName?: string; buyerEmail?: string; buyerPhone?: string;
  buyer2Name?: string; buyer2Email?: string; buyer2Phone?: string;
  otherAgentName?: string; otherAgentEmail?: string; otherAgentPhone?: string; otherAgentBrokerage?: string;
  sellerCommissionPct?: number;
  buyerCommissionPct?: number;
  notes?: string;
  year?: number;
  source?: string;
};

/* ─── Constants ──────────────────────────────────────────────────────────── */

const formatCurrency = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n);

const formatDate = (dateStr?: string | null) => {
  if (!dateStr) return '—';
  try { return format(parseISO(dateStr), 'MMM d, yyyy'); } catch { return dateStr; }
};

const txTypeLabel: Record<string, string> = {
  residential_sale: 'Residential',
  rental: 'Rental',
  commercial_lease: 'Comm. Lease',
  commercial_sale: 'Comm. Sale',
};

const closingTypeLabel: Record<string, string> = {
  buyer: 'Buyer',
  listing: 'Seller/Listing',
  referral: 'Referral',
  dual: 'Dual Agent',
};

const statusConfig: Record<string, { label: string; color: string }> = {
  active:          { label: 'Active',          color: 'bg-blue-500/80 text-white' },
  temp_off_market: { label: 'Temp Off Market', color: 'bg-orange-500/80 text-white' },
  pending:         { label: 'Pending',         color: 'bg-yellow-500/80 text-white' },
  sold:            { label: 'Sold',            color: 'bg-green-600/80 text-white' },
  closed:          { label: 'Closed',          color: 'bg-green-600/80 text-white' },
  canceled:        { label: 'Canceled',        color: 'bg-red-500/80 text-white' },
  cancelled:       { label: 'Canceled',        color: 'bg-red-500/80 text-white' },
  expired:         { label: 'Expired',         color: 'bg-gray-500/80 text-white' },
};

const AGENT_STATUSES = ['active', 'temp_off_market', 'pending', 'closed', 'canceled'] as const;
const YEARS = Array.from({ length: 6 }, (_, i) => String(new Date().getFullYear() - i));

type SortKey = 'status' | 'address' | 'closingType' | 'dealType' | 'contractDate' | 'closedDate' | 'dealValue' | 'netToMe';
type SortDir = 'asc' | 'desc';

function getSortValue(tx: AgentTx, key: SortKey): string | number {
  switch (key) {
    case 'status': return tx.status || '';
    case 'address': return (tx.address || tx.propertyAddress || '').toLowerCase();
    case 'closingType': return tx.closingType || '';
    case 'dealType': return tx.transactionType || '';
    case 'contractDate': return tx.contractDate || '';
    case 'closedDate': return tx.closedDate || tx.closingDate || '';
    case 'dealValue': return tx.dealValue || tx.salePrice || 0;
    case 'netToMe': return tx.splitSnapshot?.agentNetCommission ?? tx.netIncome ?? tx.netCommission ?? 0;
    default: return '';
  }
}

/* ─── Agent Edit Form (TC-style drawer) ─────────────────────────────────── */

type EditFormProps = {
  tx: AgentTx;
  open: boolean;
  onClose: () => void;
  onSaved: (updated: AgentTx) => void;
};

function AgentEditForm({ tx, open, onClose, onSaved }: EditFormProps) {
  const { user } = useUser();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Form state — pre-filled from the transaction
  const [status, setStatus] = useState(tx.status || 'active');
  const [propertyAddress, setPropertyAddress] = useState(tx.address || tx.propertyAddress || '');
  const [listPrice, setListPrice] = useState(String(tx.listPrice || ''));
  const [salePrice, setSalePrice] = useState(String(tx.salePrice || tx.dealValue || ''));
  const [listingDate, setListingDate] = useState(tx.listingDate || '');
  const [contractDate, setContractDate] = useState(tx.contractDate || '');
  const [closingDate, setClosingDate] = useState(tx.closingDate || tx.closedDate || '');
  const [sellerName, setSellerName] = useState(tx.sellerName || '');
  const [sellerEmail, setSellerEmail] = useState(tx.sellerEmail || '');
  const [sellerPhone, setSellerPhone] = useState(tx.sellerPhone || '');
  const [seller2Name, setSeller2Name] = useState(tx.seller2Name || '');
  const [seller2Email, setSeller2Email] = useState(tx.seller2Email || '');
  const [seller2Phone, setSeller2Phone] = useState(tx.seller2Phone || '');
  const [buyerName, setBuyerName] = useState(tx.buyerName || '');
  const [buyerEmail, setBuyerEmail] = useState(tx.buyerEmail || '');
  const [buyerPhone, setBuyerPhone] = useState(tx.buyerPhone || '');
  const [buyer2Name, setBuyer2Name] = useState(tx.buyer2Name || '');
  const [buyer2Email, setBuyer2Email] = useState(tx.buyer2Email || '');
  const [buyer2Phone, setBuyer2Phone] = useState(tx.buyer2Phone || '');
  const [otherAgentName, setOtherAgentName] = useState(tx.otherAgentName || '');
  const [otherAgentEmail, setOtherAgentEmail] = useState(tx.otherAgentEmail || '');
  const [otherAgentPhone, setOtherAgentPhone] = useState(tx.otherAgentPhone || '');
  const [otherAgentBrokerage, setOtherAgentBrokerage] = useState(tx.otherAgentBrokerage || '');
  const [sellerCommissionPct, setSellerCommissionPct] = useState(String(tx.sellerCommissionPct || ''));
  const [buyerCommissionPct, setBuyerCommissionPct] = useState(String(tx.buyerCommissionPct || ''));
  const [notes, setNotes] = useState(tx.notes || '');

  // Reset form when tx changes
  useEffect(() => {
    setStatus(tx.status || 'active');
    setPropertyAddress(tx.address || tx.propertyAddress || '');
    setListPrice(String(tx.listPrice || ''));
    setSalePrice(String(tx.salePrice || tx.dealValue || ''));
    setListingDate(tx.listingDate || '');
    setContractDate(tx.contractDate || '');
    setClosingDate(tx.closingDate || tx.closedDate || '');
    setSellerName(tx.sellerName || '');
    setSellerEmail(tx.sellerEmail || '');
    setSellerPhone(tx.sellerPhone || '');
    setSeller2Name(tx.seller2Name || '');
    setSeller2Email(tx.seller2Email || '');
    setSeller2Phone(tx.seller2Phone || '');
    setBuyerName(tx.buyerName || '');
    setBuyerEmail(tx.buyerEmail || '');
    setBuyerPhone(tx.buyerPhone || '');
    setBuyer2Name(tx.buyer2Name || '');
    setBuyer2Email(tx.buyer2Email || '');
    setBuyer2Phone(tx.buyer2Phone || '');
    setOtherAgentName(tx.otherAgentName || '');
    setOtherAgentEmail(tx.otherAgentEmail || '');
    setOtherAgentPhone(tx.otherAgentPhone || '');
    setOtherAgentBrokerage(tx.otherAgentBrokerage || '');
    setSellerCommissionPct(String(tx.sellerCommissionPct || ''));
    setBuyerCommissionPct(String(tx.buyerCommissionPct || ''));
    setNotes(tx.notes || '');
    setSaveError(null);
    setSaveSuccess(false);
  }, [tx.id]);

  const isMovingToPending = status === 'pending' && tx.status !== 'pending';

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      const token = await user.getIdToken();
      const body: Record<string, any> = {
        status,
        propertyAddress,
        listPrice: listPrice ? Number(listPrice) : undefined,
        salePrice: salePrice ? Number(salePrice) : undefined,
        listingDate: listingDate || undefined,
        contractDate: contractDate || undefined,
        closingDate: closingDate || undefined,
        sellerName, sellerEmail, sellerPhone,
        seller2Name, seller2Email, seller2Phone,
        buyerName, buyerEmail, buyerPhone,
        buyer2Name, buyer2Email, buyer2Phone,
        otherAgentName, otherAgentEmail, otherAgentPhone, otherAgentBrokerage,
        sellerCommissionPct: sellerCommissionPct ? Number(sellerCommissionPct) : undefined,
        buyerCommissionPct: buyerCommissionPct ? Number(buyerCommissionPct) : undefined,
        notes,
        resubmitToTc: isMovingToPending,
      };

      const res = await fetch(`/api/agent/transactions/${tx.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to save');

      setSaveSuccess(true);
      onSaved({ ...tx, status, propertyAddress, listPrice: listPrice ? Number(listPrice) : tx.listPrice, salePrice: salePrice ? Number(salePrice) : tx.salePrice, contractDate, closingDate, listingDate, sellerName, sellerEmail, sellerPhone, buyerName, buyerEmail, buyerPhone, otherAgentName, otherAgentEmail, otherAgentPhone, otherAgentBrokerage, notes });
      setTimeout(() => { setSaveSuccess(false); onClose(); }, 1200);
    } catch (err: any) {
      setSaveError(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const addr = tx.address || tx.propertyAddress || 'Transaction';

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto p-0">
        <SheetHeader className="px-6 pt-6 pb-4 border-b sticky top-0 bg-background z-10">
          <SheetTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" />
            Update Transaction
          </SheetTitle>
          <SheetDescription className="truncate">{addr}</SheetDescription>
        </SheetHeader>

        <div className="px-6 py-5 space-y-6">

          {/* Status */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-foreground border-b pb-1">Transaction Status</h3>
            <div className="space-y-1">
              <Label htmlFor="edit-status">Status <span className="text-destructive">*</span></Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger id="edit-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="temp_off_market">Temp Off Market</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                </SelectContent>
              </Select>
              {isMovingToPending && (
                <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mt-1">
                  Changing to Pending will submit this transaction to the TC Queue for review and approval.
                </p>
              )}
            </div>
          </div>

          {/* Property Details */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground border-b pb-1">Property Details</h3>
            <div className="space-y-1">
              <Label htmlFor="edit-address">Property Address</Label>
              <Input id="edit-address" value={propertyAddress} onChange={e => setPropertyAddress(e.target.value)} placeholder="123 Main St, City, TX 75001" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="edit-list-price">List Price</Label>
                <Input id="edit-list-price" type="number" value={listPrice} onChange={e => setListPrice(e.target.value)} placeholder="450000" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-sale-price">Sale Price</Label>
                <Input id="edit-sale-price" type="number" value={salePrice} onChange={e => setSalePrice(e.target.value)} placeholder="445000" />
              </div>
            </div>
          </div>

          {/* Key Dates */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground border-b pb-1">Key Dates</h3>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label htmlFor="edit-listing-date">Listing Date</Label>
                <Input id="edit-listing-date" type="date" value={listingDate} onChange={e => setListingDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-contract-date">Contract Date</Label>
                <Input id="edit-contract-date" type="date" value={contractDate} onChange={e => setContractDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-closing-date">Closing Date</Label>
                <Input id="edit-closing-date" type="date" value={closingDate} onChange={e => setClosingDate(e.target.value)} />
              </div>
            </div>
          </div>

          {/* Seller Information */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground border-b pb-1">Seller Information</h3>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label htmlFor="edit-seller-name">Seller Name</Label>
                <Input id="edit-seller-name" value={sellerName} onChange={e => setSellerName(e.target.value)} placeholder="John Smith" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-seller-email">Seller Email</Label>
                <Input id="edit-seller-email" type="email" value={sellerEmail} onChange={e => setSellerEmail(e.target.value)} placeholder="john@email.com" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-seller-phone">Seller Phone</Label>
                <Input id="edit-seller-phone" value={sellerPhone} onChange={e => setSellerPhone(e.target.value)} placeholder="(555) 000-0000" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label htmlFor="edit-seller2-name">Seller 2 Name</Label>
                <Input id="edit-seller2-name" value={seller2Name} onChange={e => setSeller2Name(e.target.value)} placeholder="Jane Smith" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-seller2-email">Seller 2 Email</Label>
                <Input id="edit-seller2-email" type="email" value={seller2Email} onChange={e => setSeller2Email(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-seller2-phone">Seller 2 Phone</Label>
                <Input id="edit-seller2-phone" value={seller2Phone} onChange={e => setSeller2Phone(e.target.value)} />
              </div>
            </div>
          </div>

          {/* Buyer Information */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground border-b pb-1">Buyer Information</h3>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label htmlFor="edit-buyer-name">Buyer Name</Label>
                <Input id="edit-buyer-name" value={buyerName} onChange={e => setBuyerName(e.target.value)} placeholder="Alice Johnson" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-buyer-email">Buyer Email</Label>
                <Input id="edit-buyer-email" type="email" value={buyerEmail} onChange={e => setBuyerEmail(e.target.value)} placeholder="alice@email.com" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-buyer-phone">Buyer Phone</Label>
                <Input id="edit-buyer-phone" value={buyerPhone} onChange={e => setBuyerPhone(e.target.value)} placeholder="(555) 000-0000" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label htmlFor="edit-buyer2-name">Buyer 2 Name</Label>
                <Input id="edit-buyer2-name" value={buyer2Name} onChange={e => setBuyer2Name(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-buyer2-email">Buyer 2 Email</Label>
                <Input id="edit-buyer2-email" type="email" value={buyer2Email} onChange={e => setBuyer2Email(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-buyer2-phone">Buyer 2 Phone</Label>
                <Input id="edit-buyer2-phone" value={buyer2Phone} onChange={e => setBuyer2Phone(e.target.value)} />
              </div>
            </div>
          </div>

          {/* Other Agent / Co-op */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground border-b pb-1">Other Agent / Co-op</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="edit-other-agent-name">Other Agent Name</Label>
                <Input id="edit-other-agent-name" value={otherAgentName} onChange={e => setOtherAgentName(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-other-agent-brokerage">Other Agent Brokerage</Label>
                <Input id="edit-other-agent-brokerage" value={otherAgentBrokerage} onChange={e => setOtherAgentBrokerage(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-other-agent-email">Other Agent Email</Label>
                <Input id="edit-other-agent-email" type="email" value={otherAgentEmail} onChange={e => setOtherAgentEmail(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-other-agent-phone">Other Agent Phone</Label>
                <Input id="edit-other-agent-phone" value={otherAgentPhone} onChange={e => setOtherAgentPhone(e.target.value)} />
              </div>
            </div>
          </div>

          {/* Commission */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground border-b pb-1">Commission</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="edit-seller-comm">Seller Commission %</Label>
                <Input id="edit-seller-comm" type="number" step="0.01" value={sellerCommissionPct} onChange={e => setSellerCommissionPct(e.target.value)} placeholder="3.0" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-buyer-comm">Buyer Commission %</Label>
                <Input id="edit-buyer-comm" type="number" step="0.01" value={buyerCommissionPct} onChange={e => setBuyerCommissionPct(e.target.value)} placeholder="3.0" />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-foreground border-b pb-1">Notes</h3>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any additional notes for the TC..." rows={3} />
          </div>

          {/* Error / Success */}
          {saveError && (
            <div className="rounded-md bg-destructive/10 border border-destructive/30 px-4 py-3 text-sm text-destructive">
              {saveError}
            </div>
          )}
          {saveSuccess && (
            <div className="rounded-md bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
              {isMovingToPending ? 'Transaction updated and submitted to TC Queue for review.' : 'Transaction updated successfully.'}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-background border-t px-6 py-4 flex items-center justify-between gap-3">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            <X className="h-4 w-4 mr-2" /> Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving} className={cn(isMovingToPending && 'bg-amber-600 hover:bg-amber-700')}>
            {saving ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            {isMovingToPending ? 'Submit to TC Queue' : 'Save Changes'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ─── Main Component ─────────────────────────────────────────────────────── */

type Props = {
  agentId: string;
  viewAs?: string;
};

export function AgentTransactionsSection({ agentId, viewAs }: Props) {
  const { user } = useUser();

  const [transactions, setTransactions] = useState<AgentTx[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [yearFilter, setYearFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [addressSearch, setAddressSearch] = useState('');

  // Sort
  const [sortKey, setSortKey] = useState<SortKey>('closedDate');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // Edit drawer
  const [editTx, setEditTx] = useState<AgentTx | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  /* ─── Load transactions ──────────────────────────────────────────────── */

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const effectiveId = viewAs || agentId;
      const res = await fetch(`/api/agent/pipeline?agentId=${effectiveId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to load transactions');

      // Combine active, pending, and all closed into one flat list
      const all: AgentTx[] = [
        ...(data.activeTransactions ?? []),
        ...(data.pendingTransactions ?? []),
        ...(data.allClosedTransactions ?? data.closedTransactions ?? []),
      ];
      // Deduplicate by id
      const seen = new Set<string>();
      const deduped = all.filter(t => { if (seen.has(t.id)) return false; seen.add(t.id); return true; });
      setTransactions(deduped);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [user, agentId, viewAs]);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  /* ─── Filtering & sorting ────────────────────────────────────────────── */

  const filtered = useMemo(() => {
    let list = [...transactions];

    if (yearFilter !== 'all') {
      list = list.filter(t => {
        const year = t.year || (t.closedDate ? new Date(t.closedDate).getFullYear() : null) || (t.contractDate ? new Date(t.contractDate).getFullYear() : null);
        return String(year) === yearFilter;
      });
    }
    if (statusFilter !== 'all') {
      list = list.filter(t => t.status === statusFilter);
    }
    if (addressSearch.trim()) {
      const q = addressSearch.toLowerCase();
      list = list.filter(t => (t.address || t.propertyAddress || '').toLowerCase().includes(q));
    }

    list.sort((a, b) => {
      const av = getSortValue(a, sortKey);
      const bv = getSortValue(b, sortKey);
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return list;
  }, [transactions, yearFilter, statusFilter, addressSearch, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="ml-1 h-3 w-3 opacity-40" />;
    return sortDir === 'asc' ? <ArrowUp className="ml-1 h-3 w-3" /> : <ArrowDown className="ml-1 h-3 w-3" />;
  };

  /* ─── Inline status change ───────────────────────────────────────────── */

  const handleInlineStatusChange = async (tx: AgentTx, newStatus: string) => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const resubmitToTc = newStatus === 'pending' && tx.status !== 'pending';
      const res = await fetch(`/api/agent/transactions/${tx.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: newStatus, resubmitToTc }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Failed');
      setTransactions(prev => prev.map(t => t.id === tx.id ? { ...t, status: newStatus } : t));
    } catch (err: any) {
      setError(err.message);
    }
  };

  /* ─── Open edit drawer ───────────────────────────────────────────────── */

  const openEdit = (tx: AgentTx) => {
    setEditTx(tx);
    setEditOpen(true);
  };

  const handleSaved = (updated: AgentTx) => {
    setTransactions(prev => prev.map(t => t.id === updated.id ? { ...t, ...updated } : t));
  };

  /* ─── Summary counts ─────────────────────────────────────────────────── */

  const activeCount = transactions.filter(t => t.status === 'active' || t.status === 'temp_off_market').length;
  const pendingCount = transactions.filter(t => t.status === 'pending').length;
  const closedCount = transactions.filter(t => t.status === 'closed' || t.status === 'sold').length;
  const netPending = transactions.filter(t => t.status === 'pending').reduce((s, t) => s + (t.splitSnapshot?.agentNetCommission ?? t.netIncome ?? t.netCommission ?? 0), 0);
  const netClosed = transactions.filter(t => t.status === 'closed' || t.status === 'sold').reduce((s, t) => s + (t.splitSnapshot?.agentNetCommission ?? t.netIncome ?? t.netCommission ?? 0), 0);

  /* ─── Render ─────────────────────────────────────────────────────────── */

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight">My Transactions</h2>
          <p className="text-sm text-muted-foreground">Your active listings, pending deals, and closed transactions</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={cn('h-4 w-4 mr-2', loading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground font-medium">Active Listings</p>
          <p className="text-2xl font-bold text-blue-600 mt-1">{activeCount}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground font-medium">Pending</p>
          <p className="text-2xl font-bold text-yellow-600 mt-1">{pendingCount}</p>
          {netPending > 0 && <p className="text-xs text-muted-foreground mt-0.5">{formatCurrency(netPending)} net</p>}
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground font-medium">Closed (All)</p>
          <p className="text-2xl font-bold text-green-600 mt-1">{closedCount}</p>
          {netClosed > 0 && <p className="text-xs text-muted-foreground mt-0.5">{formatCurrency(netClosed)} net</p>}
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground font-medium">Total Transactions</p>
          <p className="text-2xl font-bold mt-1">{transactions.length}</p>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap items-end gap-3">
            {/* Address search */}
            <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
              <span className="text-xs font-medium text-muted-foreground">Search Address</span>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder="Search by address..."
                  value={addressSearch}
                  onChange={e => setAddressSearch(e.target.value)}
                />
              </div>
            </div>
            {/* Year filter */}
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Year</span>
              <Select value={yearFilter} onValueChange={setYearFilter}>
                <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Years</SelectItem>
                  {YEARS.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {/* Status filter */}
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Status</span>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {AGENT_STATUSES.map(s => (
                    <SelectItem key={s} value={s}>{statusConfig[s]?.label ?? s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Transactions</CardTitle>
          <CardDescription>
            {filtered.length} record{filtered.length !== 1 ? 's' : ''}
            {yearFilter !== 'all' ? ` in ${yearFilter}` : ''} · Click a row to view or update
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="rounded-md bg-destructive/10 border border-destructive/30 px-4 py-3 text-sm text-destructive mb-4">
              {error}
            </div>
          )}
          {loading ? (
            <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 space-y-3">
              <AlertTriangle className="h-8 w-8 text-muted-foreground mx-auto" />
              <p className="text-sm text-muted-foreground">No transactions found for the selected filters.</p>
            </div>
          ) : (
            <>
              {/* Mobile cards */}
              <div className="flex flex-col gap-3 sm:hidden">
                {filtered.map((t) => {
                  const net = t.splitSnapshot?.agentNetCommission ?? t.netIncome ?? t.netCommission ?? 0;
                  const sc = statusConfig[t.status] || statusConfig.pending;
                  const addr = t.address || t.propertyAddress || '—';
                  return (
                    <div
                      key={t.id}
                      className="rounded-xl border bg-card p-4 space-y-3 cursor-pointer hover:bg-muted/40 transition-colors"
                      onClick={() => openEdit(t)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-sm leading-tight truncate">{addr}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{closingTypeLabel[t.closingType || ''] ?? t.closingType ?? '—'} · {txTypeLabel[t.transactionType || ''] ?? '—'}</p>
                        </div>
                        <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap shrink-0', sc.color)}>
                          {sc.label}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-center">
                        <div>
                          <p className="text-xs text-muted-foreground">Sale Price</p>
                          <p className="text-sm font-semibold">{(t.dealValue || t.salePrice) ? formatCurrency(t.dealValue || t.salePrice || 0) : '—'}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Net to Me</p>
                          <p className="text-sm font-semibold text-primary">{net ? formatCurrency(net) : '—'}</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground border-t pt-2">
                        <span>Contract: {formatDate(t.contractDate)}</span>
                        <span>Close: {formatDate(t.closedDate ?? t.closingDate)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop table */}
              <div className="hidden sm:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="cursor-pointer select-none whitespace-nowrap w-[130px]" onClick={() => toggleSort('status')}>
                        <span className="flex items-center">Status<SortIcon col="status" /></span>
                      </TableHead>
                      <TableHead className="cursor-pointer select-none whitespace-nowrap min-w-[180px] max-w-[260px]" onClick={() => toggleSort('address')}>
                        <span className="flex items-center">Address<SortIcon col="address" /></span>
                      </TableHead>
                      <TableHead className="cursor-pointer select-none whitespace-nowrap min-w-[90px]" onClick={() => toggleSort('closingType')}>
                        <span className="flex items-center">Side<SortIcon col="closingType" /></span>
                      </TableHead>
                      <TableHead className="cursor-pointer select-none whitespace-nowrap min-w-[110px]" onClick={() => toggleSort('dealType')}>
                        <span className="flex items-center">Deal Type<SortIcon col="dealType" /></span>
                      </TableHead>
                      <TableHead className="cursor-pointer select-none whitespace-nowrap min-w-[120px]" onClick={() => toggleSort('contractDate')}>
                        <span className="flex items-center">Contract Date<SortIcon col="contractDate" /></span>
                      </TableHead>
                      <TableHead className="cursor-pointer select-none whitespace-nowrap min-w-[110px]" onClick={() => toggleSort('closedDate')}>
                        <span className="flex items-center">Close Date<SortIcon col="closedDate" /></span>
                      </TableHead>
                      <TableHead className="cursor-pointer select-none whitespace-nowrap min-w-[110px] text-right" onClick={() => toggleSort('dealValue')}>
                        <span className="flex items-center justify-end">Sale Price<SortIcon col="dealValue" /></span>
                      </TableHead>
                      <TableHead className="cursor-pointer select-none whitespace-nowrap min-w-[110px] text-right" onClick={() => toggleSort('netToMe')}>
                        <span className="flex items-center justify-end">Net to Me<SortIcon col="netToMe" /></span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((t) => {
                      const net = t.splitSnapshot?.agentNetCommission ?? t.netIncome ?? t.netCommission ?? 0;
                      const sc = statusConfig[t.status] || statusConfig.pending;
                      const addr = t.address || t.propertyAddress || '—';
                      const canEdit = t.status === 'active' || t.status === 'temp_off_market' || t.status === 'pending';
                      return (
                        <TableRow
                          key={t.id}
                          className={cn('transition-colors group', canEdit && 'cursor-pointer hover:bg-muted/40')}
                          onClick={() => canEdit && openEdit(t)}
                        >
                          {/* Inline status dropdown */}
                          <TableCell className="w-[130px]">
                            {canEdit ? (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                                  <button className={cn(
                                    'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap cursor-pointer hover:opacity-80 transition-opacity',
                                    sc.color
                                  )}>
                                    {sc.label}
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-2.5 w-2.5 opacity-70" viewBox="0 0 20 20" fill="currentColor">
                                      <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                                    </svg>
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start" className="w-48">
                                  <DropdownMenuLabel className="text-xs text-muted-foreground">Change Status</DropdownMenuLabel>
                                  <DropdownMenuSeparator />
                                  {(['active', 'temp_off_market', 'pending'] as const)
                                    .filter(s => s !== t.status)
                                    .map(s => (
                                      <DropdownMenuItem
                                        key={s}
                                        onClick={async (e) => { e.stopPropagation(); await handleInlineStatusChange(t, s); }}
                                        className="flex items-center gap-2 text-xs cursor-pointer"
                                      >
                                        <span className={cn(
                                          'inline-block w-2 h-2 rounded-full flex-shrink-0',
                                          s === 'active' ? 'bg-blue-500' :
                                          s === 'temp_off_market' ? 'bg-orange-500' :
                                          'bg-yellow-500'
                                        )} />
                                        {statusConfig[s]?.label ?? s}
                                        {s === 'pending' && t.status !== 'pending' && (
                                          <span className="ml-auto text-[10px] text-amber-600 font-medium">→ TC Queue</span>
                                        )}
                                      </DropdownMenuItem>
                                    ))}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            ) : (
                              <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap', sc.color)}>
                                {sc.label}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="min-w-[180px] max-w-[260px]">
                            <div className="font-medium truncate text-sm">{addr}</div>
                            {(t.sellerName || t.buyerName) && (
                              <div className="text-xs text-muted-foreground truncate">{t.sellerName || t.buyerName}</div>
                            )}
                          </TableCell>
                          <TableCell className="min-w-[90px]">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border bg-muted/50 whitespace-nowrap">
                              {closingTypeLabel[t.closingType || ''] ?? t.closingType ?? '—'}
                            </span>
                          </TableCell>
                          <TableCell className="min-w-[110px]">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border bg-muted/50 whitespace-nowrap">
                              {txTypeLabel[t.transactionType || ''] ?? t.transactionType ?? '—'}
                            </span>
                          </TableCell>
                          <TableCell className="min-w-[120px] whitespace-nowrap text-sm">{formatDate(t.contractDate)}</TableCell>
                          <TableCell className="min-w-[110px] whitespace-nowrap text-sm">{formatDate(t.closedDate ?? t.closingDate)}</TableCell>
                          <TableCell className="min-w-[110px] text-right whitespace-nowrap text-sm">
                            {(t.dealValue || t.salePrice) ? formatCurrency(t.dealValue || t.salePrice || 0) : '—'}
                          </TableCell>
                          <TableCell className="min-w-[110px] text-right whitespace-nowrap font-semibold text-primary text-sm">
                            {net ? formatCurrency(net) : '—'}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Edit drawer */}
      {editTx && (
        <AgentEditForm
          tx={editTx}
          open={editOpen}
          onClose={() => setEditOpen(false)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
