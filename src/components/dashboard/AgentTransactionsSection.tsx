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
import { PendingContractModal, type ContractFields } from '@/components/dashboard/PendingContractModal';
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
import { AlertTriangle, Search, ArrowUpDown, ArrowUp, ArrowDown, ClipboardList, Save, X, RefreshCw, Paperclip, FileText, Trash2, PlusCircle, FileEdit, Clock } from 'lucide-react';
import { format, parseISO, formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import Link from 'next/link';

/* ─── Types ──────────────────────────────────────────────────────────────── */

type UploadedDoc = { name: string; url: string; storagePath: string; uploadedAt: string };

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
  clientType?: string;
  sellerName?: string; sellerEmail?: string; sellerPhone?: string;
  seller2Name?: string; seller2Email?: string; seller2Phone?: string;
  seller3Name?: string; seller3Email?: string; seller3Phone?: string;
  seller4Name?: string; seller4Email?: string; seller4Phone?: string;
  buyerName?: string; buyerEmail?: string; buyerPhone?: string;
  buyer2Name?: string; buyer2Email?: string; buyer2Phone?: string;
  buyer3Name?: string; buyer3Email?: string; buyer3Phone?: string;
  buyer4Name?: string; buyer4Email?: string; buyer4Phone?: string;
  otherAgentName?: string; otherAgentEmail?: string; otherAgentPhone?: string; otherAgentBrokerage?: string;
  mortgageCompany?: string; loanOfficer?: string; loanOfficerEmail?: string; loanOfficerPhone?: string;
  titleCompany?: string; titleOfficer?: string; titleOfficerEmail?: string; titleOfficerPhone?: string;
  sellerCommissionPct?: number;
  buyerCommissionPct?: number;
  optionExpiration?: string | null;
  inspectionDeadline?: string | null;
  projectedCloseDate?: string | null;
  notes?: string;
  additionalComments?: string;
  documents?: UploadedDoc[];
  year?: number;
  source?: string;
  workingWithTc?: boolean;
  _isCoAgentView?: boolean;
  hasCoAgent?: boolean;
  coAgent?: { agentId?: string; agentDisplayName?: string; splitPercent?: number };
  primaryAgentSplitPercent?: number;
  primaryAgentDisplayName?: string;
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
  closed:          { label: 'Closed',          color: 'bg-green-600/80 text-white' },
  canceled:        { label: 'Canceled',        color: 'bg-red-500/80 text-white' },
  cancelled:       { label: 'Canceled',        color: 'bg-red-500/80 text-white' },
  expired:         { label: 'Expired',         color: 'bg-gray-500/80 text-white' },
};

const AGENT_STATUSES = ['active', 'temp_off_market', 'pending', 'closed', 'cancelled', 'canceled', 'expired'] as const;
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

  // Form state
  const [status, setStatus] = useState(tx.status || 'active');
  const [propertyAddress, setPropertyAddress] = useState(tx.address || tx.propertyAddress || '');
  const [listPrice, setListPrice] = useState(String(tx.listPrice || ''));
  const [salePrice, setSalePrice] = useState(String(tx.salePrice || tx.dealValue || ''));
  const [listingDate, setListingDate] = useState(tx.listingDate || '');
  const [contractDate, setContractDate] = useState(tx.contractDate || '');
  const [closingDate, setClosingDate] = useState(tx.closingDate || tx.closedDate || '');
  const [optionExpiration, setOptionExpiration] = useState(tx.optionExpiration || '');
  const [inspectionDeadline, setInspectionDeadline] = useState(tx.inspectionDeadline || '');
  const [projectedCloseDate, setProjectedCloseDate] = useState(tx.projectedCloseDate || '');
  // Sellers
  const [sellerName, setSellerName] = useState(tx.sellerName || '');
  const [sellerEmail, setSellerEmail] = useState(tx.sellerEmail || '');
  const [sellerPhone, setSellerPhone] = useState(tx.sellerPhone || '');
  const [seller2Name, setSeller2Name] = useState(tx.seller2Name || '');
  const [seller2Email, setSeller2Email] = useState(tx.seller2Email || '');
  const [seller2Phone, setSeller2Phone] = useState(tx.seller2Phone || '');
  const [seller3Name, setSeller3Name] = useState(tx.seller3Name || '');
  const [seller3Email, setSeller3Email] = useState(tx.seller3Email || '');
  const [seller3Phone, setSeller3Phone] = useState(tx.seller3Phone || '');
  const [seller4Name, setSeller4Name] = useState(tx.seller4Name || '');
  const [seller4Email, setSeller4Email] = useState(tx.seller4Email || '');
  const [seller4Phone, setSeller4Phone] = useState(tx.seller4Phone || '');
  const [showSeller3, setShowSeller3] = useState(!!(tx.seller3Name));
  const [showSeller4, setShowSeller4] = useState(!!(tx.seller4Name));
  // Buyers
  const [buyerName, setBuyerName] = useState(tx.buyerName || '');
  const [buyerEmail, setBuyerEmail] = useState(tx.buyerEmail || '');
  const [buyerPhone, setBuyerPhone] = useState(tx.buyerPhone || '');
  const [buyer2Name, setBuyer2Name] = useState(tx.buyer2Name || '');
  const [buyer2Email, setBuyer2Email] = useState(tx.buyer2Email || '');
  const [buyer2Phone, setBuyer2Phone] = useState(tx.buyer2Phone || '');
  const [buyer3Name, setBuyer3Name] = useState(tx.buyer3Name || '');
  const [buyer3Email, setBuyer3Email] = useState(tx.buyer3Email || '');
  const [buyer3Phone, setBuyer3Phone] = useState(tx.buyer3Phone || '');
  const [buyer4Name, setBuyer4Name] = useState(tx.buyer4Name || '');
  const [buyer4Email, setBuyer4Email] = useState(tx.buyer4Email || '');
  const [buyer4Phone, setBuyer4Phone] = useState(tx.buyer4Phone || '');
  const [showBuyer3, setShowBuyer3] = useState(!!(tx.buyer3Name));
  const [showBuyer4, setShowBuyer4] = useState(!!(tx.buyer4Name));
  // Other agent
  const [otherAgentName, setOtherAgentName] = useState(tx.otherAgentName || '');
  const [otherAgentEmail, setOtherAgentEmail] = useState(tx.otherAgentEmail || '');
  const [otherAgentPhone, setOtherAgentPhone] = useState(tx.otherAgentPhone || '');
  const [otherAgentBrokerage, setOtherAgentBrokerage] = useState(tx.otherAgentBrokerage || '');
  // Lender
  const [mortgageCompany, setMortgageCompany] = useState(tx.mortgageCompany || '');
  const [loanOfficer, setLoanOfficer] = useState(tx.loanOfficer || '');
  const [loanOfficerEmail, setLoanOfficerEmail] = useState(tx.loanOfficerEmail || '');
  const [loanOfficerPhone, setLoanOfficerPhone] = useState(tx.loanOfficerPhone || '');
  // Title
  const [titleCompany, setTitleCompany] = useState(tx.titleCompany || '');
  const [titleOfficer, setTitleOfficer] = useState(tx.titleOfficer || '');
  const [titleOfficerEmail, setTitleOfficerEmail] = useState(tx.titleOfficerEmail || '');
  const [titleOfficerPhone, setTitleOfficerPhone] = useState(tx.titleOfficerPhone || '');
  // Commission
  const [sellerCommissionPct, setSellerCommissionPct] = useState(String(tx.sellerCommissionPct || ''));
  const [buyerCommissionPct, setBuyerCommissionPct] = useState(String(tx.buyerCommissionPct || ''));
  // Notes
  const [notes, setNotes] = useState(tx.notes || '');
  const [additionalComments, setAdditionalComments] = useState(tx.additionalComments || '');
  // Documents
  const [documents, setDocuments] = useState<UploadedDoc[]>(tx.documents || []);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Reset form when tx changes
  useEffect(() => {
    setStatus(tx.status || 'active');
    setPropertyAddress(tx.address || tx.propertyAddress || '');
    setListPrice(String(tx.listPrice || ''));
    setSalePrice(String(tx.salePrice || tx.dealValue || ''));
    setListingDate(tx.listingDate || '');
    setContractDate(tx.contractDate || '');
    setClosingDate(tx.closingDate || tx.closedDate || '');
    setOptionExpiration(tx.optionExpiration || '');
    setInspectionDeadline(tx.inspectionDeadline || '');
    setProjectedCloseDate(tx.projectedCloseDate || '');
    setSellerName(tx.sellerName || ''); setSellerEmail(tx.sellerEmail || ''); setSellerPhone(tx.sellerPhone || '');
    setSeller2Name(tx.seller2Name || ''); setSeller2Email(tx.seller2Email || ''); setSeller2Phone(tx.seller2Phone || '');
    setSeller3Name(tx.seller3Name || ''); setSeller3Email(tx.seller3Email || ''); setSeller3Phone(tx.seller3Phone || '');
    setSeller4Name(tx.seller4Name || ''); setSeller4Email(tx.seller4Email || ''); setSeller4Phone(tx.seller4Phone || '');
    setShowSeller3(!!(tx.seller3Name)); setShowSeller4(!!(tx.seller4Name));
    setBuyerName(tx.buyerName || ''); setBuyerEmail(tx.buyerEmail || ''); setBuyerPhone(tx.buyerPhone || '');
    setBuyer2Name(tx.buyer2Name || ''); setBuyer2Email(tx.buyer2Email || ''); setBuyer2Phone(tx.buyer2Phone || '');
    setBuyer3Name(tx.buyer3Name || ''); setBuyer3Email(tx.buyer3Email || ''); setBuyer3Phone(tx.buyer3Phone || '');
    setBuyer4Name(tx.buyer4Name || ''); setBuyer4Email(tx.buyer4Email || ''); setBuyer4Phone(tx.buyer4Phone || '');
    setShowBuyer3(!!(tx.buyer3Name)); setShowBuyer4(!!(tx.buyer4Name));
    setOtherAgentName(tx.otherAgentName || ''); setOtherAgentEmail(tx.otherAgentEmail || ''); setOtherAgentPhone(tx.otherAgentPhone || ''); setOtherAgentBrokerage(tx.otherAgentBrokerage || '');
    setMortgageCompany(tx.mortgageCompany || ''); setLoanOfficer(tx.loanOfficer || ''); setLoanOfficerEmail(tx.loanOfficerEmail || ''); setLoanOfficerPhone(tx.loanOfficerPhone || '');
    setTitleCompany(tx.titleCompany || ''); setTitleOfficer(tx.titleOfficer || ''); setTitleOfficerEmail(tx.titleOfficerEmail || ''); setTitleOfficerPhone(tx.titleOfficerPhone || '');
    setSellerCommissionPct(String(tx.sellerCommissionPct || ''));
    setBuyerCommissionPct(String(tx.buyerCommissionPct || ''));
    setNotes(tx.notes || '');
    setAdditionalComments(tx.additionalComments || '');
    setDocuments(tx.documents || []);
    setSaveError(null);
    setSaveSuccess(false);
    setUploadError(null);
  }, [tx.id]);

  const isMovingToPending = status === 'pending' && tx.status !== 'pending';
  const isMovingToClosed = status === 'closed' && tx.status !== 'closed';
  const isMlsStatusChange = isMovingToPending || isMovingToClosed || (status === 'temp_off_market' && tx.status !== 'temp_off_market') || (status === 'cancelled' && tx.status !== 'cancelled') || (status === 'expired' && tx.status !== 'expired');

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length || !user) return;
    setUploading(true);
    setUploadError(null);
    try {
      const token = await user.getIdToken();
      const uploaded: UploadedDoc[] = [];
      for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch('/api/agent/transactions/upload-document', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || `Failed to upload ${file.name}`);
        uploaded.push({ name: file.name, url: data.url, storagePath: data.storagePath, uploadedAt: new Date().toISOString() });
      }
      setDocuments(prev => [...prev, ...uploaded]);
    } catch (err: any) {
      setUploadError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const removeDoc = (idx: number) => setDocuments(prev => prev.filter((_, i) => i !== idx));

  const handleSave = async () => {
    if (!user) return;
    if (status === 'closed' && !closingDate) {
      setSaveError('A closing date is required to mark this transaction as Closed.');
      return;
    }
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
        optionExpiration: optionExpiration || undefined,
        inspectionDeadline: inspectionDeadline || undefined,
        projectedCloseDate: projectedCloseDate || undefined,
        sellerName, sellerEmail, sellerPhone,
        seller2Name, seller2Email, seller2Phone,
        seller3Name: showSeller3 ? seller3Name : '',
        seller3Email: showSeller3 ? seller3Email : '',
        seller3Phone: showSeller3 ? seller3Phone : '',
        seller4Name: showSeller4 ? seller4Name : '',
        seller4Email: showSeller4 ? seller4Email : '',
        seller4Phone: showSeller4 ? seller4Phone : '',
        buyerName, buyerEmail, buyerPhone,
        buyer2Name, buyer2Email, buyer2Phone,
        buyer3Name: showBuyer3 ? buyer3Name : '',
        buyer3Email: showBuyer3 ? buyer3Email : '',
        buyer3Phone: showBuyer3 ? buyer3Phone : '',
        buyer4Name: showBuyer4 ? buyer4Name : '',
        buyer4Email: showBuyer4 ? buyer4Email : '',
        buyer4Phone: showBuyer4 ? buyer4Phone : '',
        otherAgentName, otherAgentEmail, otherAgentPhone, otherAgentBrokerage,
        mortgageCompany, loanOfficer, loanOfficerEmail, loanOfficerPhone,
        titleCompany, titleOfficer, titleOfficerEmail, titleOfficerPhone,
        sellerCommissionPct: sellerCommissionPct ? Number(sellerCommissionPct) : undefined,
        buyerCommissionPct: buyerCommissionPct ? Number(buyerCommissionPct) : undefined,
        notes,
        additionalComments,
        documents,
        resubmitToTc: isMovingToPending,
        notifyStaffQueue: isMlsStatusChange,
      };

      const res = await fetch(`/api/agent/transactions/${tx.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to save');

      setSaveSuccess(true);
      onSaved({ ...tx, status, propertyAddress, listPrice: listPrice ? Number(listPrice) : tx.listPrice, salePrice: salePrice ? Number(salePrice) : tx.salePrice, contractDate, closingDate, listingDate, sellerName, sellerEmail, sellerPhone, buyerName, buyerEmail, buyerPhone, otherAgentName, otherAgentEmail, otherAgentPhone, otherAgentBrokerage, mortgageCompany, loanOfficer, titleCompany, notes, additionalComments, documents });
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
                  <SelectItem value="closed">Closed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                </SelectContent>
              </Select>
              {isMovingToPending && (
                <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mt-1">
                  Changing to Pending will notify the Staff Queue and (if working with TC) the TC Queue for review.
                </p>
              )}
              {isMovingToClosed && (
                <p className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-md px-3 py-2 mt-1">
                  Closing this transaction will notify the Staff Queue to update MLS. A closing date is required.
                </p>
              )}
              {isMlsStatusChange && !isMovingToPending && !isMovingToClosed && (
                <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-md px-3 py-2 mt-1">
                  This status change will notify the Staff Queue to update MLS accordingly.
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
              <div className="space-y-1">
                <Label htmlFor="edit-option-exp">Listing Expiration Date</Label>
                <Input id="edit-option-exp" type="date" value={optionExpiration} onChange={e => setOptionExpiration(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-inspection-dl">Inspection Deadline</Label>
                <Input id="edit-inspection-dl" type="date" value={inspectionDeadline} onChange={e => setInspectionDeadline(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-proj-close">Projected Close Date</Label>
                <Input id="edit-proj-close" type="date" value={projectedCloseDate} onChange={e => setProjectedCloseDate(e.target.value)} />
              </div>
            </div>
          </div>

          {/* Seller Information */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground border-b pb-1">Seller Information</h3>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1"><Label>Seller 1 Name</Label><Input value={sellerName} onChange={e => setSellerName(e.target.value)} placeholder="John Smith" /></div>
              <div className="space-y-1"><Label>Seller 1 Email</Label><Input type="email" value={sellerEmail} onChange={e => setSellerEmail(e.target.value)} /></div>
              <div className="space-y-1"><Label>Seller 1 Phone</Label><Input value={sellerPhone} onChange={e => setSellerPhone(e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1"><Label>Seller 2 Name</Label><Input value={seller2Name} onChange={e => setSeller2Name(e.target.value)} /></div>
              <div className="space-y-1"><Label>Seller 2 Email</Label><Input type="email" value={seller2Email} onChange={e => setSeller2Email(e.target.value)} /></div>
              <div className="space-y-1"><Label>Seller 2 Phone</Label><Input value={seller2Phone} onChange={e => setSeller2Phone(e.target.value)} /></div>
            </div>
            {showSeller3 && (
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1"><Label>Seller 3 Name</Label><Input value={seller3Name} onChange={e => setSeller3Name(e.target.value)} /></div>
                <div className="space-y-1"><Label>Seller 3 Email</Label><Input type="email" value={seller3Email} onChange={e => setSeller3Email(e.target.value)} /></div>
                <div className="space-y-1 flex flex-col"><Label>Seller 3 Phone</Label><div className="flex gap-2"><Input value={seller3Phone} onChange={e => setSeller3Phone(e.target.value)} /><Button type="button" variant="ghost" size="icon" className="shrink-0" onClick={() => { setShowSeller3(false); setShowSeller4(false); setSeller3Name(''); setSeller3Email(''); setSeller3Phone(''); setSeller4Name(''); setSeller4Email(''); setSeller4Phone(''); }}><X className="h-4 w-4" /></Button></div></div>
              </div>
            )}
            {showSeller3 && showSeller4 && (
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1"><Label>Seller 4 Name</Label><Input value={seller4Name} onChange={e => setSeller4Name(e.target.value)} /></div>
                <div className="space-y-1"><Label>Seller 4 Email</Label><Input type="email" value={seller4Email} onChange={e => setSeller4Email(e.target.value)} /></div>
                <div className="space-y-1 flex flex-col"><Label>Seller 4 Phone</Label><div className="flex gap-2"><Input value={seller4Phone} onChange={e => setSeller4Phone(e.target.value)} /><Button type="button" variant="ghost" size="icon" className="shrink-0" onClick={() => { setShowSeller4(false); setSeller4Name(''); setSeller4Email(''); setSeller4Phone(''); }}><X className="h-4 w-4" /></Button></div></div>
              </div>
            )}
            <div className="flex gap-2">
              {!showSeller3 && <Button type="button" variant="outline" size="sm" onClick={() => setShowSeller3(true)}><PlusCircle className="h-3.5 w-3.5 mr-1" />Add 3rd Seller</Button>}
              {showSeller3 && !showSeller4 && <Button type="button" variant="outline" size="sm" onClick={() => setShowSeller4(true)}><PlusCircle className="h-3.5 w-3.5 mr-1" />Add 4th Seller</Button>}
            </div>
          </div>

          {/* Buyer Information */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground border-b pb-1">Buyer Information</h3>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1"><Label>Buyer 1 Name</Label><Input value={buyerName} onChange={e => setBuyerName(e.target.value)} placeholder="Alice Johnson" /></div>
              <div className="space-y-1"><Label>Buyer 1 Email</Label><Input type="email" value={buyerEmail} onChange={e => setBuyerEmail(e.target.value)} /></div>
              <div className="space-y-1"><Label>Buyer 1 Phone</Label><Input value={buyerPhone} onChange={e => setBuyerPhone(e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1"><Label>Buyer 2 Name</Label><Input value={buyer2Name} onChange={e => setBuyer2Name(e.target.value)} /></div>
              <div className="space-y-1"><Label>Buyer 2 Email</Label><Input type="email" value={buyer2Email} onChange={e => setBuyer2Email(e.target.value)} /></div>
              <div className="space-y-1"><Label>Buyer 2 Phone</Label><Input value={buyer2Phone} onChange={e => setBuyer2Phone(e.target.value)} /></div>
            </div>
            {showBuyer3 && (
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1"><Label>Buyer 3 Name</Label><Input value={buyer3Name} onChange={e => setBuyer3Name(e.target.value)} /></div>
                <div className="space-y-1"><Label>Buyer 3 Email</Label><Input type="email" value={buyer3Email} onChange={e => setBuyer3Email(e.target.value)} /></div>
                <div className="space-y-1 flex flex-col"><Label>Buyer 3 Phone</Label><div className="flex gap-2"><Input value={buyer3Phone} onChange={e => setBuyer3Phone(e.target.value)} /><Button type="button" variant="ghost" size="icon" className="shrink-0" onClick={() => { setShowBuyer3(false); setShowBuyer4(false); setBuyer3Name(''); setBuyer3Email(''); setBuyer3Phone(''); setBuyer4Name(''); setBuyer4Email(''); setBuyer4Phone(''); }}><X className="h-4 w-4" /></Button></div></div>
              </div>
            )}
            {showBuyer3 && showBuyer4 && (
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1"><Label>Buyer 4 Name</Label><Input value={buyer4Name} onChange={e => setBuyer4Name(e.target.value)} /></div>
                <div className="space-y-1"><Label>Buyer 4 Email</Label><Input type="email" value={buyer4Email} onChange={e => setBuyer4Email(e.target.value)} /></div>
                <div className="space-y-1 flex flex-col"><Label>Buyer 4 Phone</Label><div className="flex gap-2"><Input value={buyer4Phone} onChange={e => setBuyer4Phone(e.target.value)} /><Button type="button" variant="ghost" size="icon" className="shrink-0" onClick={() => { setShowBuyer4(false); setBuyer4Name(''); setBuyer4Email(''); setBuyer4Phone(''); }}><X className="h-4 w-4" /></Button></div></div>
              </div>
            )}
            <div className="flex gap-2">
              {!showBuyer3 && <Button type="button" variant="outline" size="sm" onClick={() => setShowBuyer3(true)}><PlusCircle className="h-3.5 w-3.5 mr-1" />Add 3rd Buyer</Button>}
              {showBuyer3 && !showBuyer4 && <Button type="button" variant="outline" size="sm" onClick={() => setShowBuyer4(true)}><PlusCircle className="h-3.5 w-3.5 mr-1" />Add 4th Buyer</Button>}
            </div>
          </div>

          {/* Other Agent */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground border-b pb-1">Other Agent / Co-op</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Other Agent Name</Label><Input value={otherAgentName} onChange={e => setOtherAgentName(e.target.value)} /></div>
              <div className="space-y-1"><Label>Other Agent Brokerage</Label><Input value={otherAgentBrokerage} onChange={e => setOtherAgentBrokerage(e.target.value)} /></div>
              <div className="space-y-1"><Label>Other Agent Email</Label><Input type="email" value={otherAgentEmail} onChange={e => setOtherAgentEmail(e.target.value)} /></div>
              <div className="space-y-1"><Label>Other Agent Phone</Label><Input value={otherAgentPhone} onChange={e => setOtherAgentPhone(e.target.value)} /></div>
            </div>
          </div>

          {/* Lender */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground border-b pb-1">Lender / Mortgage</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Mortgage Company</Label><Input value={mortgageCompany} onChange={e => setMortgageCompany(e.target.value)} /></div>
              <div className="space-y-1"><Label>Loan Officer</Label><Input value={loanOfficer} onChange={e => setLoanOfficer(e.target.value)} /></div>
              <div className="space-y-1"><Label>Loan Officer Email</Label><Input type="email" value={loanOfficerEmail} onChange={e => setLoanOfficerEmail(e.target.value)} /></div>
              <div className="space-y-1"><Label>Loan Officer Phone</Label><Input value={loanOfficerPhone} onChange={e => setLoanOfficerPhone(e.target.value)} /></div>
            </div>
          </div>

          {/* Title */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground border-b pb-1">Title Company</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Title Company</Label><Input value={titleCompany} onChange={e => setTitleCompany(e.target.value)} /></div>
              <div className="space-y-1"><Label>Title Officer</Label><Input value={titleOfficer} onChange={e => setTitleOfficer(e.target.value)} /></div>
              <div className="space-y-1"><Label>Title Officer Email</Label><Input type="email" value={titleOfficerEmail} onChange={e => setTitleOfficerEmail(e.target.value)} /></div>
              <div className="space-y-1"><Label>Title Officer Phone</Label><Input value={titleOfficerPhone} onChange={e => setTitleOfficerPhone(e.target.value)} /></div>
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
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground border-b pb-1">Notes</h3>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes for the TC..." rows={3} />
            <Textarea value={additionalComments} onChange={e => setAdditionalComments(e.target.value)} placeholder="Additional comments..." rows={2} />
          </div>

          {/* Documents */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground border-b pb-1 flex items-center gap-2">
              <Paperclip className="h-4 w-4" /> Documents
            </h3>
            <p className="text-xs text-muted-foreground">Upload Purchase Agreement, Listing Paperwork, or any other transaction documents (PDF, Word, images — max 25 MB each).</p>
            {documents.length > 0 && (
              <div className="space-y-2">
                {documents.map((doc, idx) => (
                  <div key={idx} className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    <a href={doc.url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline truncate flex-1">{doc.name}</a>
                    <span className="text-xs text-muted-foreground shrink-0">{doc.uploadedAt ? new Date(doc.uploadedAt).toLocaleDateString() : ''}</span>
                    <Button type="button" variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => removeDoc(idx)}><X className="h-3 w-3" /></Button>
                  </div>
                ))}
              </div>
            )}
            {uploadError && <p className="text-xs text-destructive">{uploadError}</p>}
            <label className={cn('flex items-center gap-2 cursor-pointer rounded-md border border-dashed px-4 py-3 text-sm text-muted-foreground hover:bg-muted/30 transition-colors', uploading && 'opacity-50 pointer-events-none')}>
              <Paperclip className="h-4 w-4" />
              {uploading ? 'Uploading...' : 'Attach Files'}
              <input type="file" multiple accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,.heic" className="sr-only" onChange={handleFileUpload} disabled={uploading} />
            </label>
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
  // Pending contract modal
  const [pendingModalOpen, setPendingModalOpen] = useState(false);
  const [pendingModalTx, setPendingModalTx] = useState<AgentTx | null>(null);
  const [pendingModalToken, setPendingModalToken] = useState('');

  // Drafts
  type DraftSummary = { draftId: string; label: string | null; address: string | null; clientName: string | null; salePrice: number | null; savedAt: string | null };
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const [draftsLoading, setDraftsLoading] = useState(false);
  const [deletingDraftId, setDeletingDraftId] = useState<string | null>(null);

  /* ─── Load transactions ──────────────────────────────────────────────── */

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const url = viewAs
        ? `/api/agent/pipeline?viewAs=${viewAs}`
        : `/api/agent/pipeline`;
      const res = await fetch(url, {
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

  /* ─── Load drafts ────────────────────────────────────────────────────── */

  const loadDrafts = useCallback(async () => {
    if (!user) return;
    setDraftsLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/agent/drafts', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.ok) setDrafts(data.drafts || []);
    } catch {}
    finally { setDraftsLoading(false); }
  }, [user]);

  useEffect(() => {
    if (user) loadDrafts();
  }, [user, loadDrafts]);

  const deleteDraft = async (draftId: string) => {
    if (!user) return;
    setDeletingDraftId(draftId);
    try {
      const token = await user.getIdToken();
      await fetch('/api/agent/drafts', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ draftId }),
      });
      setDrafts(prev => prev.filter(d => d.draftId !== draftId));
    } catch {}
    finally { setDeletingDraftId(null); }
  };

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
    // Listings going to Pending → show contract details modal first
    const isSeller = tx.closingType === 'listing' || tx.closingType === 'dual';
    const isListingGoingPending = newStatus === 'pending' && tx.status !== 'pending' && isSeller;
    if (isListingGoingPending) {
      const token = await user.getIdToken();
      setPendingModalToken(token);
      setPendingModalTx(tx);
      setPendingModalOpen(true);
      return;
    }
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

  const handlePendingContractSave = async (fields: ContractFields) => {
    if (!pendingModalTx) return;
    const res = await fetch(`/api/agent/transactions/${pendingModalTx.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pendingModalToken}` },
      body: JSON.stringify({
        status: 'pending',
        resubmitToTc: true,
        notifyStaffQueue: true,
        notifyPendingContract: true,
        ...fields,
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || 'Failed');
    setTransactions(prev => prev.map(t => t.id === pendingModalTx.id ? { ...t, status: 'pending', contractDate: fields.contractDate ?? undefined, salePrice: fields.salePrice ?? undefined, listPrice: fields.listPrice ?? undefined, projectedCloseDate: fields.projectedCloseDate ?? undefined, inspectionDeadline: fields.inspectionDeadline ?? undefined, buyerName: fields.buyerName ?? undefined, buyerEmail: fields.buyerEmail ?? undefined, buyerPhone: fields.buyerPhone ?? undefined, buyer2Name: fields.buyer2Name ?? undefined, buyer2Email: fields.buyer2Email ?? undefined, buyer2Phone: fields.buyer2Phone ?? undefined, otherAgentName: fields.otherAgentName ?? undefined, otherAgentEmail: fields.otherAgentEmail ?? undefined, otherAgentPhone: fields.otherAgentPhone ?? undefined, otherAgentBrokerage: fields.otherAgentBrokerage ?? undefined, mortgageCompany: fields.mortgageCompany ?? undefined, loanOfficer: fields.loanOfficer ?? undefined, loanOfficerEmail: fields.loanOfficerEmail ?? undefined, loanOfficerPhone: fields.loanOfficerPhone ?? undefined, titleCompany: fields.titleCompany ?? undefined, titleOfficer: fields.titleOfficer ?? undefined, titleOfficerEmail: fields.titleOfficerEmail ?? undefined, titleOfficerPhone: fields.titleOfficerPhone ?? undefined, notes: fields.notes ?? undefined } : t));
    setPendingModalTx(null);
  };

  const handlePendingContractSkip = async () => {
    if (!pendingModalTx) return;
    const res = await fetch(`/api/agent/transactions/${pendingModalTx.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pendingModalToken}` },
      body: JSON.stringify({ status: 'pending', resubmitToTc: true, notifyStaffQueue: true, notifyPendingContract: true }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || 'Failed');
    setTransactions(prev => prev.map(t => t.id === pendingModalTx.id ? { ...t, status: 'pending' } : t));
    setPendingModalTx(null);
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
  const closedCount = transactions.filter(t => t.status === 'closed').length;
  const netPending = transactions.filter(t => t.status === 'pending').reduce((s, t) => s + (t.splitSnapshot?.agentNetCommission ?? t.netIncome ?? t.netCommission ?? 0), 0);
  const netClosed = transactions.filter(t => t.status === 'closed').reduce((s, t) => s + (t.splitSnapshot?.agentNetCommission ?? t.netIncome ?? t.netCommission ?? 0), 0);

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

      {/* Drafts */}
      {(drafts.length > 0 || draftsLoading) && (
        <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20">
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileEdit className="h-4 w-4 text-amber-600" />
                <CardTitle className="text-sm font-semibold text-amber-800 dark:text-amber-300">Saved Drafts</CardTitle>
                <Badge variant="outline" className="text-xs border-amber-300 text-amber-700">{drafts.length}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">Resume or delete incomplete transactions</p>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {draftsLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (
              <div className="space-y-2">
                {drafts.map((draft) => {
                  const title = draft.address || draft.label || draft.clientName || 'Untitled Draft';
                  const subtitle = [
                    draft.address && draft.clientName ? draft.clientName : null,
                    draft.salePrice ? `$${Number(draft.salePrice).toLocaleString()}` : null,
                  ].filter(Boolean).join(' · ');
                  const savedAgo = draft.savedAt
                    ? formatDistanceToNow(new Date(draft.savedAt), { addSuffix: true })
                    : null;
                  return (
                    <div
                      key={draft.draftId}
                      className="flex items-center justify-between gap-3 rounded-md border border-amber-200 dark:border-amber-800 bg-white dark:bg-amber-950/30 px-3 py-2.5"
                    >
                      <div className="flex items-start gap-2 min-w-0 flex-1">
                        <FileText className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{title}</p>
                          {subtitle && <p className="text-xs text-muted-foreground truncate">{subtitle}</p>}
                          {savedAgo && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                              <Clock className="h-3 w-3" />
                              Saved {savedAgo}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Link href={`/dashboard/transactions/new?draft=${draft.draftId}`}>
                          <Button size="sm" variant="outline" className="text-xs h-7 border-amber-400 text-amber-700 hover:bg-amber-100">
                            <FileEdit className="h-3 w-3 mr-1" />
                            Resume
                          </Button>
                        </Link>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-xs h-7 text-red-500 hover:text-red-700 hover:bg-red-50"
                          onClick={() => deleteDraft(draft.draftId)}
                          disabled={deletingDraftId === draft.draftId}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

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
                  const isCoAgentViewMobile = !!(t as any)._isCoAgentView;
                  const canEditMobile = t.status !== 'closed' && !isCoAgentViewMobile;
                  return (
                    <div
                      key={t.id}
                      className={cn('rounded-xl border bg-card p-4 space-y-3 transition-colors', canEditMobile ? 'cursor-pointer hover:bg-muted/40' : 'opacity-90')}
                      onClick={() => canEditMobile && openEdit(t)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-sm leading-tight truncate">{addr}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{closingTypeLabel[t.closingType || ''] ?? t.closingType ?? '—'} · {txTypeLabel[t.transactionType || ''] ?? '—'}</p>
                          {(t as any).reviewStatus === 'pending_review' && (
                            <span className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-300 whitespace-nowrap">
                              ⏳ Pending TC Review
                            </span>
                          )}
                          {isCoAgentViewMobile && (
                            <span className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-800 border border-blue-300 whitespace-nowrap">
                              🤝 Co-Agent · {t.primaryAgentDisplayName || (t as any).agentDisplayName || 'Primary Agent'}
                            </span>
                          )}
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
                      {t.documents && t.documents.length > 0 && (
                        <div className="border-t pt-2">
                          <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1"><Paperclip className="h-3 w-3" /> Documents ({t.documents.length})</p>
                          <div className="flex flex-col gap-1">
                            {t.documents.map((doc, i) => (
                              <a key={i} href={doc.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="flex items-center gap-1.5 text-xs text-primary hover:underline truncate">
                                <FileText className="h-3 w-3 shrink-0" />
                                <span className="truncate">{doc.name}</span>
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
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
                      <TableHead className="whitespace-nowrap min-w-[130px]">
                        Proj. Close
                      </TableHead>
                      <TableHead className="whitespace-nowrap min-w-[130px]">
                        Inspection Deadline
                      </TableHead>
                      <TableHead className="cursor-pointer select-none whitespace-nowrap min-w-[110px] text-right" onClick={() => toggleSort('dealValue')}>
                        <span className="flex items-center justify-end">Sale Price<SortIcon col="dealValue" /></span>
                      </TableHead>
                      <TableHead className="cursor-pointer select-none whitespace-nowrap min-w-[110px] text-right" onClick={() => toggleSort('netToMe')}>
                        <span className="flex items-center justify-end">Net to Me<SortIcon col="netToMe" /></span>
                      </TableHead>
                      <TableHead className="whitespace-nowrap min-w-[90px] text-center">Docs</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((t) => {
                      const net = t.splitSnapshot?.agentNetCommission ?? t.netIncome ?? t.netCommission ?? 0;
                      const sc = statusConfig[t.status] || statusConfig.pending;
                      const addr = t.address || t.propertyAddress || '—';
                      const isCoAgentView = !!(t as any)._isCoAgentView;
                      const canEdit = t.status !== 'closed' && !isCoAgentView; // closed + co-agent views are read-only
                      return (
                        <TableRow
                          key={t.id}
                          className={cn('transition-colors group', canEdit && 'cursor-pointer hover:bg-muted/40', isCoAgentView && 'opacity-90')}
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
                                  {(['active', 'temp_off_market', 'pending', 'closed', 'cancelled', 'expired'] as string[])
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
                                          s === 'pending' ? 'bg-yellow-500' :
                                          s === 'closed' ? 'bg-green-600' :
                                          s === 'cancelled' || s === 'canceled' ? 'bg-red-500' :
                                          'bg-gray-500'
                                        )} />
                                        {statusConfig[s]?.label ?? s}
                                        {(s === 'pending' || s === 'closed') && (
                                          <span className="ml-auto text-[10px] text-amber-600 font-medium">→ Staff Queue</span>
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
                            {(t as any).reviewStatus === 'pending_review' && (
                              <span className="inline-flex items-center gap-1 mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-300 whitespace-nowrap">
                                ⏳ Pending TC Review
                              </span>
                            )}
                            {isCoAgentView && (
                              <span className="inline-flex items-center gap-1 mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-800 border border-blue-300 whitespace-nowrap">
                                🤝 Co-Agent · {t.primaryAgentDisplayName || (t as any).agentDisplayName || 'Primary Agent'}
                              </span>
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
                          <TableCell className="min-w-[130px] whitespace-nowrap text-sm">{formatDate(t.projectedCloseDate) || '—'}</TableCell>
                          <TableCell className="min-w-[130px] whitespace-nowrap text-sm">{formatDate(t.inspectionDeadline) || '—'}</TableCell>
                          <TableCell className="min-w-[110px] text-right whitespace-nowrap text-sm">
                            {(t.dealValue || t.salePrice) ? formatCurrency(t.dealValue || t.salePrice || 0) : '—'}
                          </TableCell>
                          <TableCell className="min-w-[110px] text-right whitespace-nowrap font-semibold text-primary text-sm">
                            {net ? formatCurrency(net) : '—'}
                          </TableCell>
                          <TableCell className="min-w-[90px] text-center" onClick={e => e.stopPropagation()}>
                            {t.documents && t.documents.length > 0 ? (
                              <div className="flex flex-col gap-1 items-start">
                                {t.documents.map((doc, i) => (
                                  <a key={i} href={doc.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-primary hover:underline whitespace-nowrap" title={doc.name}>
                                    <FileText className="h-3 w-3 shrink-0" />
                                    <span className="truncate max-w-[120px]">{doc.name}</span>
                                  </a>
                                ))}
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
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

      {/* Active → Pending contract details modal */}
      {pendingModalTx && (
        <PendingContractModal
          open={pendingModalOpen}
          onOpenChange={(v) => { if (!v) { setPendingModalOpen(false); setPendingModalTx(null); } }}
          transactionAddress={pendingModalTx.address || pendingModalTx.propertyAddress || 'Transaction'}
          idToken={pendingModalToken}
          onSave={handlePendingContractSave}
          onSkip={handlePendingContractSkip}
        />
      )}
    </div>
  );
}
