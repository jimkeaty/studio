'use client';

/**
 * TeamTransactionsLedger
 *
 * Full-featured team transaction ledger for the Team Leader dashboard.
 * Mirrors the "My Transactions" layout from AgentTransactionsSection, but:
 *   - Shows ALL team members' transactions (fetched from /api/agent/team-pipeline)
 *   - Adds an "Agent" filter to narrow by team member
 *   - Shows GCI, Agent Net, and Leader Retained columns (team leader can see splits)
 *   - Clicking a row opens the same AgentEditForm drawer (team leader can edit any member's tx)
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { PendingContractModal, type ContractFields } from '@/components/dashboard/PendingContractModal';
import { useUser } from '@/firebase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel } from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { AlertTriangle, Search, ArrowUpDown, ArrowUp, ArrowDown, ClipboardList, Save, X, RefreshCw, Paperclip, FileText, PlusCircle, Users, Download } from 'lucide-react';
import { exportToCsv } from '@/lib/exportToCsv';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';

/* ─── Types ──────────────────────────────────────────────────────────────── */

type UploadedDoc = { name: string; url: string; storagePath: string; uploadedAt: string };

type TeamTx = {
  id: string;
  status: string;
  agentId?: string;
  _agentDisplayName?: string;
  address?: string;
  propertyAddress?: string;
  transactionType?: string;
  closingType?: string;
  contractDate?: string | null;
  closedDate?: string | null;
  closingDate?: string | null;
  listingDate?: string | null;
  dealValue?: number;
  listPrice?: number;
  salePrice?: number;
  splitSnapshot?: {
    agentNetCommission?: number;
    grossCommission?: number;
    companyRetained?: number;
    leaderRetainedAfterMember?: number;
  } | null;
  netCommission?: number;
  netIncome?: number;
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

type SortKey = 'status' | 'agent' | 'address' | 'closingType' | 'dealType' | 'contractDate' | 'closedDate' | 'dealValue' | 'agentNet' | 'gci' | 'leaderRetained';
type SortDir = 'asc' | 'desc';

function getSortValue(tx: TeamTx, key: SortKey): string | number {
  switch (key) {
    case 'status': return tx.status || '';
    case 'agent': return (tx._agentDisplayName || '').toLowerCase();
    case 'address': return (tx.address || tx.propertyAddress || '').toLowerCase();
    case 'closingType': return tx.closingType || '';
    case 'dealType': return tx.transactionType || '';
    case 'contractDate': return tx.contractDate || '';
    case 'closedDate': return tx.closedDate || tx.closingDate || '';
    case 'dealValue': return tx.dealValue || tx.salePrice || 0;
    case 'agentNet': return tx.splitSnapshot?.agentNetCommission ?? tx.netIncome ?? tx.netCommission ?? 0;
    case 'gci': return tx.splitSnapshot?.grossCommission ?? 0;
    // NOTE: leaderRetained sort uses the raw snapshot value; the isLeaderOwnDeal
    // override is applied at render time where leaderAgentIds is in scope.
    case 'leaderRetained': return tx.splitSnapshot?.leaderRetainedAfterMember ?? tx.splitSnapshot?.agentNetCommission ?? tx.netIncome ?? tx.netCommission ?? 0;
    default: return '';
  }
}

/* ─── Team Edit Form ─────────────────────────────────────────────────────── */

type EditFormProps = {
  tx: TeamTx;
  open: boolean;
  onClose: () => void;
  onSaved: (updated: TeamTx) => void;
  viewAs?: string;
};

function TeamEditForm({ tx, open, onClose, onSaved, viewAs }: EditFormProps) {
  const { user } = useUser();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

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
  const [otherAgentName, setOtherAgentName] = useState(tx.otherAgentName || '');
  const [otherAgentEmail, setOtherAgentEmail] = useState(tx.otherAgentEmail || '');
  const [otherAgentPhone, setOtherAgentPhone] = useState(tx.otherAgentPhone || '');
  const [otherAgentBrokerage, setOtherAgentBrokerage] = useState(tx.otherAgentBrokerage || '');
  const [mortgageCompany, setMortgageCompany] = useState(tx.mortgageCompany || '');
  const [loanOfficer, setLoanOfficer] = useState(tx.loanOfficer || '');
  const [loanOfficerEmail, setLoanOfficerEmail] = useState(tx.loanOfficerEmail || '');
  const [loanOfficerPhone, setLoanOfficerPhone] = useState(tx.loanOfficerPhone || '');
  const [titleCompany, setTitleCompany] = useState(tx.titleCompany || '');
  const [titleOfficer, setTitleOfficer] = useState(tx.titleOfficer || '');
  const [titleOfficerEmail, setTitleOfficerEmail] = useState(tx.titleOfficerEmail || '');
  const [titleOfficerPhone, setTitleOfficerPhone] = useState(tx.titleOfficerPhone || '');
  const [sellerCommissionPct, setSellerCommissionPct] = useState(String(tx.sellerCommissionPct || ''));
  const [buyerCommissionPct, setBuyerCommissionPct] = useState(String(tx.buyerCommissionPct || ''));
  const [notes, setNotes] = useState(tx.notes || '');
  const [additionalComments, setAdditionalComments] = useState(tx.additionalComments || '');
  const [documents, setDocuments] = useState<UploadedDoc[]>(tx.documents || []);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

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
  const isMlsStatusChange = isMovingToPending || isMovingToClosed ||
    (status === 'temp_off_market' && tx.status !== 'temp_off_market') ||
    (status === 'cancelled' && tx.status !== 'cancelled') ||
    (status === 'expired' && tx.status !== 'expired');

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

      // The PATCH endpoint now allows team leaders to edit their team members' transactions.
      // We send the request as the current user (team leader) — the server-side permission
      // check will verify they are a team leader for this transaction's agent.
      const res = await fetch(`/api/agent/transactions/${tx.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to save');

      setSaveSuccess(true);
      onSaved({
        ...tx, status, propertyAddress,
        listPrice: listPrice ? Number(listPrice) : tx.listPrice,
        salePrice: salePrice ? Number(salePrice) : tx.salePrice,
        contractDate, closingDate, listingDate,
        sellerName, sellerEmail, sellerPhone,
        buyerName, buyerEmail, buyerPhone,
        otherAgentName, otherAgentEmail, otherAgentPhone, otherAgentBrokerage,
        mortgageCompany, loanOfficer, titleCompany, notes, additionalComments, documents,
      });
      setTimeout(() => { setSaveSuccess(false); onClose(); }, 1200);
    } catch (err: any) {
      setSaveError(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const addr = tx.address || tx.propertyAddress || 'Transaction';
  const agentLabel = tx._agentDisplayName ? ` · ${tx._agentDisplayName}` : '';

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto p-0">
        <SheetHeader className="px-6 pt-6 pb-4 border-b sticky top-0 bg-background z-10">
          <SheetTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" />
            Update Transaction
          </SheetTitle>
          <SheetDescription className="truncate">{addr}{agentLabel}</SheetDescription>
        </SheetHeader>

        <div className="px-6 py-5 space-y-6">
          {/* Status */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-foreground border-b pb-1">Transaction Status</h3>
            <div className="space-y-1">
              <Label htmlFor="team-edit-status">Status <span className="text-destructive">*</span></Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger id="team-edit-status"><SelectValue /></SelectTrigger>
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
            </div>
          </div>

          {/* Property Details */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground border-b pb-1">Property Details</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1">
                <Label>Property Address</Label>
                <Input value={propertyAddress} onChange={e => setPropertyAddress(e.target.value)} placeholder="123 Main St, City, ST 00000" />
              </div>
              <div className="space-y-1">
                <Label>List Price</Label>
                <Input type="number" value={listPrice} onChange={e => setListPrice(e.target.value)} placeholder="250000" />
              </div>
              <div className="space-y-1">
                <Label>Sale Price</Label>
                <Input type="number" value={salePrice} onChange={e => setSalePrice(e.target.value)} placeholder="245000" />
              </div>
              <div className="space-y-1">
                <Label>Listing Date</Label>
                <Input type="date" value={listingDate} onChange={e => setListingDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Contract Date</Label>
                <Input type="date" value={contractDate} onChange={e => setContractDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Closing Date {status === 'closed' && <span className="text-destructive">*</span>}</Label>
                <Input type="date" value={closingDate} onChange={e => setClosingDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Projected Close Date</Label>
                <Input type="date" value={projectedCloseDate} onChange={e => setProjectedCloseDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Option Expiration</Label>
                <Input type="date" value={optionExpiration} onChange={e => setOptionExpiration(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Inspection Deadline</Label>
                <Input type="date" value={inspectionDeadline} onChange={e => setInspectionDeadline(e.target.value)} />
              </div>
            </div>
          </div>

          {/* Seller */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground border-b pb-1">Seller(s)</h3>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1"><Label>Seller 1 Name</Label><Input value={sellerName} onChange={e => setSellerName(e.target.value)} /></div>
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
                <div className="space-y-1 flex flex-col"><Label>Seller 3 Phone</Label><div className="flex gap-2"><Input value={seller3Phone} onChange={e => setSeller3Phone(e.target.value)} /><Button type="button" variant="ghost" size="icon" className="shrink-0" onClick={() => { setShowSeller3(false); setShowSeller4(false); }}><X className="h-4 w-4" /></Button></div></div>
              </div>
            )}
            {showSeller3 && showSeller4 && (
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1"><Label>Seller 4 Name</Label><Input value={seller4Name} onChange={e => setSeller4Name(e.target.value)} /></div>
                <div className="space-y-1"><Label>Seller 4 Email</Label><Input type="email" value={seller4Email} onChange={e => setSeller4Email(e.target.value)} /></div>
                <div className="space-y-1 flex flex-col"><Label>Seller 4 Phone</Label><div className="flex gap-2"><Input value={seller4Phone} onChange={e => setSeller4Phone(e.target.value)} /><Button type="button" variant="ghost" size="icon" className="shrink-0" onClick={() => { setShowSeller4(false); }}><X className="h-4 w-4" /></Button></div></div>
              </div>
            )}
            <div className="flex gap-2">
              {!showSeller3 && <Button type="button" variant="outline" size="sm" onClick={() => setShowSeller3(true)}><PlusCircle className="h-3.5 w-3.5 mr-1" />Add 3rd Seller</Button>}
              {showSeller3 && !showSeller4 && <Button type="button" variant="outline" size="sm" onClick={() => setShowSeller4(true)}><PlusCircle className="h-3.5 w-3.5 mr-1" />Add 4th Seller</Button>}
            </div>
          </div>

          {/* Buyer */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground border-b pb-1">Buyer(s)</h3>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1"><Label>Buyer 1 Name</Label><Input value={buyerName} onChange={e => setBuyerName(e.target.value)} /></div>
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
                <div className="space-y-1 flex flex-col"><Label>Buyer 3 Phone</Label><div className="flex gap-2"><Input value={buyer3Phone} onChange={e => setBuyer3Phone(e.target.value)} /><Button type="button" variant="ghost" size="icon" className="shrink-0" onClick={() => { setShowBuyer3(false); setShowBuyer4(false); }}><X className="h-4 w-4" /></Button></div></div>
              </div>
            )}
            {showBuyer3 && showBuyer4 && (
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1"><Label>Buyer 4 Name</Label><Input value={buyer4Name} onChange={e => setBuyer4Name(e.target.value)} /></div>
                <div className="space-y-1"><Label>Buyer 4 Email</Label><Input type="email" value={buyer4Email} onChange={e => setBuyer4Email(e.target.value)} /></div>
                <div className="space-y-1 flex flex-col"><Label>Buyer 4 Phone</Label><div className="flex gap-2"><Input value={buyer4Phone} onChange={e => setBuyer4Phone(e.target.value)} /><Button type="button" variant="ghost" size="icon" className="shrink-0" onClick={() => { setShowBuyer4(false); }}><X className="h-4 w-4" /></Button></div></div>
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
                <Label>Seller Commission %</Label>
                <Input type="number" step="0.01" value={sellerCommissionPct} onChange={e => setSellerCommissionPct(e.target.value)} placeholder="3.0" />
              </div>
              <div className="space-y-1">
                <Label>Buyer Commission %</Label>
                <Input type="number" step="0.01" value={buyerCommissionPct} onChange={e => setBuyerCommissionPct(e.target.value)} placeholder="3.0" />
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
            {documents.length > 0 && (
              <div className="space-y-2">
                {documents.map((doc, idx) => (
                  <div key={idx} className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    <a href={doc.url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline truncate flex-1">{doc.name}</a>
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

          {saveError && (
            <div className="rounded-md bg-destructive/10 border border-destructive/30 px-4 py-3 text-sm text-destructive">{saveError}</div>
          )}
          {saveSuccess && (
            <div className="rounded-md bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">Transaction updated successfully.</div>
          )}
        </div>

        <div className="sticky bottom-0 bg-background border-t px-6 py-4 flex items-center justify-between gap-3">
          <Button variant="outline" onClick={onClose} disabled={saving}><X className="h-4 w-4 mr-2" /> Cancel</Button>
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
  teamId?: string;
  teamName?: string;
  viewAs?: string;
  isAdminViewer?: boolean;
};

export function TeamTransactionsLedger({ teamId, teamName, viewAs, isAdminViewer }: Props) {
  const { user } = useUser();
  const [transactions, setTransactions] = useState<TeamTx[]>([]);
  const [leaderAgentIds, setLeaderAgentIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [yearFilter, setYearFilter] = useState(String(new Date().getFullYear()));
  const [statusFilter, setStatusFilter] = useState('all');
  const [agentFilter, setAgentFilter] = useState('all');
  const [addressSearch, setAddressSearch] = useState('');

  // Sort
  const [sortKey, setSortKey] = useState<SortKey>('closedDate');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // Edit drawer
  const [editTx, setEditTx] = useState<TeamTx | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  // Pending contract modal
  const [pendingModalOpen, setPendingModalOpen] = useState(false);
  const [pendingModalTx, setPendingModalTx] = useState<TeamTx | null>(null);
  const [pendingModalToken, setPendingModalToken] = useState('');

  /* ─── Load ───────────────────────────────────────────────────────────── */

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const params = new URLSearchParams();
      if (viewAs) params.set('viewAs', viewAs);
      const res = await fetch(`/api/agent/team-pipeline?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to load team transactions');

      const all: TeamTx[] = data.allTransactions ?? [];
      setTransactions(all);
      setLeaderAgentIds(new Set<string>(data.leaderAgentIds ?? []));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [user, viewAs]);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  /* ─── Derived agent list for filter ─────────────────────────────────── */

  const agentOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of transactions) {
      const id = t.agentId || '';
      const name = t._agentDisplayName || id;
      if (id && !map.has(id)) map.set(id, name);
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [transactions]);

  /* ─── Filtering & sorting ────────────────────────────────────────────── */

  const filtered = useMemo(() => {
    let list = [...transactions];

    if (yearFilter !== 'all') {
      const ALWAYS_SHOW = new Set(['active', 'temp_off_market', 'pending']);
      list = list.filter(t => {
        if (ALWAYS_SHOW.has(t.status)) return true;
        const yr = t.year || (t.closedDate ? new Date(t.closedDate).getFullYear() : null) || (t.contractDate ? new Date(t.contractDate).getFullYear() : null);
        return String(yr) === yearFilter;
      });
    }
    if (statusFilter !== 'all') {
      list = list.filter(t => t.status === statusFilter);
    }
    if (agentFilter !== 'all') {
      list = list.filter(t => t.agentId === agentFilter);
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
  }, [transactions, yearFilter, statusFilter, agentFilter, addressSearch, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="ml-1 h-3 w-3 opacity-40" />;
    return sortDir === 'asc' ? <ArrowUp className="ml-1 h-3 w-3" /> : <ArrowDown className="ml-1 h-3 w-3" />;
  };

  /* ─── Inline status change ───────────────────────────────────────────── */

  const handleInlineStatusChange = async (tx: TeamTx, newStatus: string) => {
    if (!user) return;
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
      body: JSON.stringify({ status: 'pending', resubmitToTc: true, notifyStaffQueue: true, notifyPendingContract: true, ...fields }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || 'Failed');
    setTransactions(prev => prev.map(t => t.id === pendingModalTx.id ? { ...t, status: 'pending' } : t));
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

  const openEdit = (tx: TeamTx) => { setEditTx(tx); setEditOpen(true); };
  const handleSaved = (updated: TeamTx) => {
    setTransactions(prev => prev.map(t => t.id === updated.id ? { ...t, ...updated } : t));
  };

  /* ─── Summary counts ─────────────────────────────────────────────────── */

  const activeCount = transactions.filter(t => t.status === 'active' || t.status === 'temp_off_market').length;
  const pendingCount = transactions.filter(t => t.status === 'pending').length;
  const closedCount = transactions.filter(t => t.status === 'closed').length;
  const netPending = transactions.filter(t => t.status === 'pending')
    .reduce((s, t) => s + (t.splitSnapshot?.agentNetCommission ?? t.netIncome ?? t.netCommission ?? 0), 0);
  const netClosed = transactions.filter(t => t.status === 'closed')
    .reduce((s, t) => s + (t.splitSnapshot?.agentNetCommission ?? t.netIncome ?? t.netCommission ?? 0), 0);

  /* ─── Render ─────────────────────────────────────────────────────────── */

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <Users className="h-5 w-5 text-muted-foreground" />
            Team Transactions
          </h2>
          <p className="text-sm text-muted-foreground">
            {teamName ? `${teamName} — ` : ''}All active listings, pending deals, and closed transactions
          </p>
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
            {/* Agent filter */}
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Agent</span>
              <Select value={agentFilter} onValueChange={setAgentFilter}>
                <SelectTrigger className="w-[180px]"><SelectValue placeholder="All Agents" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Agents</SelectItem>
                  {agentOptions.map(([id, name]) => (
                    <SelectItem key={id} value={id}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">Transactions</CardTitle>
              <CardDescription>
                {filtered.length} record{filtered.length !== 1 ? 's' : ''}
                {yearFilter !== 'all' ? ` in ${yearFilter}` : ''} · Click a row to view or update
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 gap-1.5"
              disabled={filtered.length === 0}
              onClick={() => {
                const rows = filtered.map(t => {
                  const isLeaderRow = leaderAgentIds.has(t.agentId || '');
                  const agentNetExport = t.splitSnapshot?.agentNetCommission ?? t.netIncome ?? t.netCommission ?? '';
                  const leaderRetainedExport = isLeaderRow
                    ? agentNetExport
                    : (t.splitSnapshot?.leaderRetainedAfterMember ?? '');
                  return {
                    Status: statusConfig[t.status]?.label ?? t.status,
                    Agent: t._agentDisplayName || '',
                    Address: t.address || t.propertyAddress || '',
                    'Closing Type': closingTypeLabel[t.closingType || ''] ?? t.closingType ?? '',
                    'Transaction Type': txTypeLabel[t.transactionType || ''] ?? t.transactionType ?? '',
                    'Seller Name': t.sellerName || '',
                    'Buyer Name': t.buyerName || '',
                    'Contract Date': t.contractDate || '',
                    'Closed Date': t.closedDate || t.closingDate || '',
                    'Listing Date': t.listingDate || '',
                    'Projected Close': t.projectedCloseDate || '',
                    'Inspection Deadline': t.inspectionDeadline || '',
                    'List Price': t.listPrice ?? '',
                    'Sale Price': t.salePrice ?? t.dealValue ?? '',
                    'GCI': t.splitSnapshot?.grossCommission ?? '',
                    'Agent Net': agentNetExport,
                    'Leader Retained': leaderRetainedExport,
                    'Other Agent': t.otherAgentName || '',
                    'Other Agent Brokerage': t.otherAgentBrokerage || '',
                    'Mortgage Company': t.mortgageCompany || '',
                    'Loan Officer': t.loanOfficer || '',
                    'Title Company': t.titleCompany || '',
                    Notes: t.notes || '',
                  };
                });
                const yearLabel = yearFilter !== 'all' ? yearFilter : 'all-years';
                const agentLabel = agentFilter !== 'all'
                  ? `-${(agentOptions.find(([id]) => id === agentFilter)?.[1] ?? agentFilter).replace(/\s+/g, '-').toLowerCase()}`
                  : '';
                exportToCsv(rows, `team-transactions-${yearLabel}${agentLabel}.csv`);
              }}
            >
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="rounded-md bg-destructive/10 border border-destructive/30 px-4 py-3 text-sm text-destructive mb-4">{error}</div>
          )}
          {loading ? (
            <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 space-y-3">
              <AlertTriangle className="h-8 w-8 text-muted-foreground mx-auto" />
              <p className="text-sm text-muted-foreground">No transactions found for the selected filters.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="cursor-pointer select-none whitespace-nowrap w-[130px]" onClick={() => toggleSort('status')}>
                      <span className="flex items-center">Status<SortIcon col="status" /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none whitespace-nowrap min-w-[140px]" onClick={() => toggleSort('agent')}>
                      <span className="flex items-center">Agent<SortIcon col="agent" /></span>
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
                    <TableHead className="whitespace-nowrap min-w-[130px]">Proj. Close</TableHead>
                    <TableHead className="whitespace-nowrap min-w-[130px]">Inspection Deadline</TableHead>
                    <TableHead className="cursor-pointer select-none whitespace-nowrap min-w-[110px] text-right" onClick={() => toggleSort('dealValue')}>
                      <span className="flex items-center justify-end">Sale Price<SortIcon col="dealValue" /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none whitespace-nowrap min-w-[110px] text-right" onClick={() => toggleSort('gci')}>
                      <span className="flex items-center justify-end">GCI<SortIcon col="gci" /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none whitespace-nowrap min-w-[110px] text-right" onClick={() => toggleSort('agentNet')}>
                      <span className="flex items-center justify-end">Agent Net<SortIcon col="agentNet" /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none whitespace-nowrap min-w-[120px] text-right" onClick={() => toggleSort('leaderRetained')}>
                      <span className="flex items-center justify-end text-amber-600">Leader Retained<SortIcon col="leaderRetained" /></span>
                    </TableHead>
                    <TableHead className="whitespace-nowrap min-w-[90px] text-center">Docs</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((t) => {
                    const gci = t.splitSnapshot?.grossCommission ?? 0;
                    const isLeaderOwnDeal = leaderAgentIds.has(t.agentId || '');
                    // For the leader's own transactions, their full agent net IS their retained amount.
                    // For team member transactions, use leaderRetainedAfterMember from the split snapshot.
                    const agentNet = t.splitSnapshot?.agentNetCommission ?? t.netIncome ?? t.netCommission ?? 0;
                    const leaderRetained = isLeaderOwnDeal
                      ? agentNet
                      : (t.splitSnapshot?.leaderRetainedAfterMember ?? 0);
                    const sc = statusConfig[t.status] || statusConfig.pending;
                    const addr = t.address || t.propertyAddress || '—';
                    const canEdit = t.status !== 'closed' || !!isAdminViewer;
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
                        <TableCell className="min-w-[140px]">
                          <span className="text-sm font-medium">{t._agentDisplayName || t.agentId || '—'}</span>
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
                        <TableCell className="min-w-[130px] whitespace-nowrap text-sm">{formatDate(t.projectedCloseDate) || '—'}</TableCell>
                        <TableCell className="min-w-[130px] whitespace-nowrap text-sm">{formatDate(t.inspectionDeadline) || '—'}</TableCell>
                        <TableCell className="min-w-[110px] text-right whitespace-nowrap text-sm">
                          {(t.dealValue || t.salePrice) ? formatCurrency(t.dealValue || t.salePrice || 0) : '—'}
                        </TableCell>
                        <TableCell className="min-w-[110px] text-right whitespace-nowrap text-sm font-medium">
                          {gci ? formatCurrency(gci) : '—'}
                        </TableCell>
                        <TableCell className="min-w-[110px] text-right whitespace-nowrap font-semibold text-primary text-sm">
                          {agentNet ? formatCurrency(agentNet) : '—'}
                        </TableCell>
                        <TableCell className="min-w-[120px] text-right whitespace-nowrap font-semibold text-amber-600 text-sm">
                          {leaderRetained ? formatCurrency(leaderRetained) : '—'}
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
          )}
        </CardContent>
      </Card>

      {/* Edit drawer */}
      {editTx && (
        <TeamEditForm
          tx={editTx}
          open={editOpen}
          onClose={() => setEditOpen(false)}
          onSaved={handleSaved}
          viewAs={viewAs}
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
