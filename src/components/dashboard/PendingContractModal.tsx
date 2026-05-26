'use client';

/**
 * PendingContractModal
 *
 * Shown when any user changes a listing status from Active → Pending.
 * Offers two paths:
 *   1. Upload a purchase agreement PDF → AI extracts fields → agent reviews
 *   2. Manually fill in the contract details
 *
 * On save, calls onSave(fields) with the contract data so the caller can
 * PATCH the transaction and trigger notifications.
 */

import React, { useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  Upload,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  PenLine,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ContractFields {
  contractDate?: string;
  salePrice?: number | null;
  listPrice?: number | null;
  projectedCloseDate?: string;
  inspectionDeadline?: string;
  surveyDeadline?: string;
  loanApplicationDeadline?: string;
  appraisalDeadline?: string;
  finalLoanCommitmentDeadline?: string;
  titleDeadline?: string;
  earnestMoney?: number | null;
  depositHolder?: string;
  buyerName?: string;
  buyerEmail?: string;
  buyerPhone?: string;
  buyer2Name?: string;
  buyer2Email?: string;
  buyer2Phone?: string;
  sellerName?: string;
  sellerEmail?: string;
  sellerPhone?: string;
  otherAgentName?: string;
  otherAgentEmail?: string;
  otherAgentPhone?: string;
  otherAgentBrokerage?: string;
  mortgageCompany?: string;
  loanOfficer?: string;
  loanOfficerEmail?: string;
  loanOfficerPhone?: string;
  titleCompany?: string;
  titleOfficer?: string;
  titleOfficerEmail?: string;
  titleOfficerPhone?: string;
  notes?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transactionAddress: string;
  /** Firebase ID token for API calls */
  idToken: string;
  /** Called when the user saves contract details */
  onSave: (fields: ContractFields) => Promise<void>;
  /** Called when the user skips (saves status change without contract details) */
  onSkip: () => Promise<void>;
}

// ─── Step type ────────────────────────────────────────────────────────────────

type Step = 'choose' | 'uploading' | 'extracting' | 'review' | 'manual' | 'saving';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function FieldRow({
  label,
  id,
  type = 'text',
  value,
  onChange,
  placeholder,
  highlight,
  required,
}: {
  label: string;
  id: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  highlight?: boolean;
  required?: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="flex items-center gap-1">
        {label}
        {required && <span className="text-destructive">*</span>}
        {highlight && (
          <Badge variant="outline" className="text-amber-600 border-amber-300 text-[10px] py-0 px-1 ml-1">
            Review
          </Badge>
        )}
      </Label>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(highlight && 'border-amber-300 bg-amber-50/40')}
      />
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-sm font-semibold text-foreground border-b pb-1 pt-2">{children}</h3>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PendingContractModal({
  open,
  onOpenChange,
  transactionAddress,
  idToken,
  onSave,
  onSkip,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>('choose');
  const [pdfName, setPdfName] = useState('');
  const [extractError, setExtractError] = useState<string | null>(null);
  const [highlightFields, setHighlightFields] = useState<Set<string>>(new Set());

  // ── Form state ──────────────────────────────────────────────────────────────
  const [contractDate, setContractDate] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [listPrice, setListPrice] = useState('');
  const [projectedCloseDate, setProjectedCloseDate] = useState('');
  const [inspectionDeadline, setInspectionDeadline] = useState('');
  const [surveyDeadline, setSurveyDeadline] = useState('');
  const [loanApplicationDeadline, setLoanApplicationDeadline] = useState('');
  const [appraisalDeadline, setAppraisalDeadline] = useState('');
  const [finalLoanCommitmentDeadline, setFinalLoanCommitmentDeadline] = useState('');
  const [titleDeadline, setTitleDeadline] = useState('');
  const [earnestMoney, setEarnestMoney] = useState('');
  const [depositHolder, setDepositHolder] = useState('');
  const [buyerName, setBuyerName] = useState('');
  const [buyerEmail, setBuyerEmail] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [buyer2Name, setBuyer2Name] = useState('');
  const [buyer2Email, setBuyer2Email] = useState('');
  const [buyer2Phone, setBuyer2Phone] = useState('');
  const [sellerName, setSellerName] = useState('');
  const [sellerEmail, setSellerEmail] = useState('');
  const [sellerPhone, setSellerPhone] = useState('');
  const [otherAgentName, setOtherAgentName] = useState('');
  const [otherAgentEmail, setOtherAgentEmail] = useState('');
  const [otherAgentPhone, setOtherAgentPhone] = useState('');
  const [otherAgentBrokerage, setOtherAgentBrokerage] = useState('');
  const [mortgageCompany, setMortgageCompany] = useState('');
  const [loanOfficer, setLoanOfficer] = useState('');
  const [loanOfficerEmail, setLoanOfficerEmail] = useState('');
  const [loanOfficerPhone, setLoanOfficerPhone] = useState('');
  const [titleCompany, setTitleCompany] = useState('');
  const [titleOfficer, setTitleOfficer] = useState('');
  const [titleOfficerEmail, setTitleOfficerEmail] = useState('');
  const [titleOfficerPhone, setTitleOfficerPhone] = useState('');
  const [notes, setNotes] = useState('');

  // ── Reset on close ──────────────────────────────────────────────────────────
  const handleOpenChange = (v: boolean) => {
    if (!v) {
      setStep('choose');
      setPdfName('');
      setExtractError(null);
      setHighlightFields(new Set());
    }
    onOpenChange(v);
  };

  // ── PDF upload + extraction ─────────────────────────────────────────────────
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPdfName(file.name);
    setExtractError(null);
    setStep('uploading');

    try {
      setStep('extracting');
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/agent/parse-purchase-agreement', {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}` },
        body: fd,
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setExtractError(data.error || 'Could not read the PDF. Please fill the form manually.');
        setStep('manual');
        return;
      }

      const f = data.fields || {};
      const conf: Record<string, number> = data.confidence || {};

      // Fields with confidence < 0.7 get highlighted for review
      const low = new Set<string>(
        Object.entries(conf)
          .filter(([, v]) => (v as number) < 0.7 && (v as number) > 0)
          .map(([k]) => k),
      );
      setHighlightFields(low);

      const set = (val: unknown, setter: (s: string) => void) => {
        if (val !== null && val !== undefined && val !== '') setter(String(val));
      };

      set(f.contractDate, setContractDate);
      set(f.salePrice, setSalePrice);
      set(f.listPrice, setListPrice);
      set(f.projectedCloseDate, setProjectedCloseDate);
      set(f.inspectionDeadline, setInspectionDeadline);
      set(f.surveyDeadline, setSurveyDeadline);
      set(f.loanApplicationDeadline, setLoanApplicationDeadline);
      set(f.appraisalDeadline, setAppraisalDeadline);
      set(f.finalLoanCommitmentDeadline, setFinalLoanCommitmentDeadline);
      set(f.titleDeadline, setTitleDeadline);
      set(f.earnestMoney, setEarnestMoney);
      if (f.depositHeldBy) {
        const dh = String(f.depositHeldBy).toLowerCase().replace(/\s+/g, '_');
        setDepositHolder(
          dh === 'listing_broker' ? 'listing_broker'
          : dh === 'selling_broker' ? 'selling_broker'
          : dh === 'title_company' ? 'title_company'
          : dh === 'escrow' ? 'escrow'
          : 'other',
        );
      }
      set(f.buyerName, setBuyerName);
      set(f.buyerEmail, setBuyerEmail);
      set(f.buyerPhone, setBuyerPhone);
      set(f.buyer2Name, setBuyer2Name);
      set(f.buyer2Email, setBuyer2Email);
      set(f.buyer2Phone, setBuyer2Phone);
      set(f.sellerName, setSellerName);
      set(f.sellerEmail, setSellerEmail);
      set(f.sellerPhone, setSellerPhone);
      set(f.otherAgentName, setOtherAgentName);
      set(f.otherAgentEmail, setOtherAgentEmail);
      set(f.otherAgentPhone, setOtherAgentPhone);
      set(f.otherAgentBrokerage, setOtherAgentBrokerage);
      set(f.mortgageCompany, setMortgageCompany);
      set(f.loanOfficer, setLoanOfficer);
      set(f.loanOfficerEmail, setLoanOfficerEmail);
      set(f.loanOfficerPhone, setLoanOfficerPhone);
      set(f.titleCompany, setTitleCompany);
      set(f.titleOfficer, setTitleOfficer);
      set(f.titleOfficerEmail, setTitleOfficerEmail);
      set(f.titleOfficerPhone, setTitleOfficerPhone);

      setStep('review');
    } catch (err: any) {
      setExtractError(err.message || 'Extraction failed. Please fill the form manually.');
      setStep('manual');
    }
  };

  // ── Build fields object ─────────────────────────────────────────────────────
  const buildFields = (): ContractFields => ({
    contractDate: contractDate || undefined,
    salePrice: salePrice ? Number(salePrice) : undefined,
    listPrice: listPrice ? Number(listPrice) : undefined,
    projectedCloseDate: projectedCloseDate || undefined,
    inspectionDeadline: inspectionDeadline || undefined,
    surveyDeadline: surveyDeadline || undefined,
    loanApplicationDeadline: loanApplicationDeadline || undefined,
    appraisalDeadline: appraisalDeadline || undefined,
    finalLoanCommitmentDeadline: finalLoanCommitmentDeadline || undefined,
    titleDeadline: titleDeadline || undefined,
    earnestMoney: earnestMoney ? Number(earnestMoney) : undefined,
    depositHolder: depositHolder || undefined,
    buyerName: buyerName || undefined,
    buyerEmail: buyerEmail || undefined,
    buyerPhone: buyerPhone || undefined,
    buyer2Name: buyer2Name || undefined,
    buyer2Email: buyer2Email || undefined,
    buyer2Phone: buyer2Phone || undefined,
    sellerName: sellerName || undefined,
    sellerEmail: sellerEmail || undefined,
    sellerPhone: sellerPhone || undefined,
    otherAgentName: otherAgentName || undefined,
    otherAgentEmail: otherAgentEmail || undefined,
    otherAgentPhone: otherAgentPhone || undefined,
    otherAgentBrokerage: otherAgentBrokerage || undefined,
    mortgageCompany: mortgageCompany || undefined,
    loanOfficer: loanOfficer || undefined,
    loanOfficerEmail: loanOfficerEmail || undefined,
    loanOfficerPhone: loanOfficerPhone || undefined,
    titleCompany: titleCompany || undefined,
    titleOfficer: titleOfficer || undefined,
    titleOfficerEmail: titleOfficerEmail || undefined,
    titleOfficerPhone: titleOfficerPhone || undefined,
    notes: notes || undefined,
  });

  // ── Save ────────────────────────────────────────────────────────────────────
  const [isSaving, setIsSaving] = useState(false);
  const handleSave = async () => {
    setIsSaving(true);
    const prevStep = step;
    try {
      await onSave(buildFields());
      handleOpenChange(false);
    } catch {
      setStep(prevStep === 'review' ? 'review' : 'manual');
    } finally {
      setIsSaving(false);
    }
  };
  const handleSkip = async () => {
    setIsSaving(true);
    try {
      await onSkip();
      handleOpenChange(false);
    } catch {
      setStep('choose');
    } finally {
      setIsSaving(false);
    }
  };

  // ── Form fields (shared between review + manual steps) ─────────────────────
  const renderForm = () => (
    <div className="space-y-4 overflow-y-auto max-h-[60vh] pr-1">
      {extractError && (
        <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-700">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{extractError}</span>
        </div>
      )}
      {step === 'review' && highlightFields.size > 0 && (
        <div className="flex items-start gap-2 rounded-md bg-blue-50 border border-blue-200 px-3 py-2 text-sm text-blue-700">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>Fields marked <strong>Review</strong> had low confidence — please verify them before saving.</span>
        </div>
      )}

      <SectionHeading>Contract Details</SectionHeading>
      <div className="grid grid-cols-2 gap-3">
        <FieldRow label="Contract Date" id="pcm-contractDate" type="date" value={contractDate} onChange={setContractDate} highlight={highlightFields.has('contractDate')} required />
        <FieldRow label="Sale Price ($)" id="pcm-salePrice" type="number" value={salePrice} onChange={setSalePrice} placeholder="250000" highlight={highlightFields.has('salePrice')} required />
        <FieldRow label="List Price ($)" id="pcm-listPrice" type="number" value={listPrice} onChange={setListPrice} placeholder="255000" highlight={highlightFields.has('listPrice')} />
        <FieldRow label="Projected Close Date" id="pcm-projectedCloseDate" type="date" value={projectedCloseDate} onChange={setProjectedCloseDate} highlight={highlightFields.has('projectedCloseDate')} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <FieldRow label="Earnest Money ($)" id="pcm-earnestMoney" type="number" value={earnestMoney} onChange={setEarnestMoney} placeholder="1000" highlight={highlightFields.has('earnestMoney')} />
        <div className="space-y-1">
          <Label htmlFor="pcm-depositHolder">Deposit Held By</Label>
          <Select value={depositHolder} onValueChange={setDepositHolder}>
            <SelectTrigger id="pcm-depositHolder"><SelectValue placeholder="Select…" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="listing_broker">Listing Broker</SelectItem>
              <SelectItem value="selling_broker">Selling Broker</SelectItem>
              <SelectItem value="title_company">Title Company</SelectItem>
              <SelectItem value="escrow">Escrow</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <SectionHeading>Deadlines</SectionHeading>
      <div className="grid grid-cols-2 gap-3">
        <FieldRow label="Inspection Deadline" id="pcm-inspection" type="date" value={inspectionDeadline} onChange={setInspectionDeadline} highlight={highlightFields.has('inspectionDeadline')} />
        <FieldRow label="Survey Deadline" id="pcm-survey" type="date" value={surveyDeadline} onChange={setSurveyDeadline} highlight={highlightFields.has('surveyDeadline')} />
        <FieldRow label="Loan Application Deadline" id="pcm-loanApp" type="date" value={loanApplicationDeadline} onChange={setLoanApplicationDeadline} highlight={highlightFields.has('loanApplicationDeadline')} />
        <FieldRow label="Appraisal Deadline" id="pcm-appraisal" type="date" value={appraisalDeadline} onChange={setAppraisalDeadline} highlight={highlightFields.has('appraisalDeadline')} />
        <FieldRow label="Final Loan Commitment" id="pcm-finalLoan" type="date" value={finalLoanCommitmentDeadline} onChange={setFinalLoanCommitmentDeadline} highlight={highlightFields.has('finalLoanCommitmentDeadline')} />
        <FieldRow label="Title Deadline" id="pcm-title" type="date" value={titleDeadline} onChange={setTitleDeadline} highlight={highlightFields.has('titleDeadline')} />
      </div>

      <SectionHeading>Buyer Information</SectionHeading>
      <div className="grid grid-cols-3 gap-3">
        <FieldRow label="Buyer Name" id="pcm-buyerName" value={buyerName} onChange={setBuyerName} highlight={highlightFields.has('buyerName')} />
        <FieldRow label="Buyer Email" id="pcm-buyerEmail" type="email" value={buyerEmail} onChange={setBuyerEmail} highlight={highlightFields.has('buyerEmail')} />
        <FieldRow label="Buyer Phone" id="pcm-buyerPhone" type="tel" value={buyerPhone} onChange={setBuyerPhone} highlight={highlightFields.has('buyerPhone')} />
        <FieldRow label="Buyer 2 Name" id="pcm-buyer2Name" value={buyer2Name} onChange={setBuyer2Name} highlight={highlightFields.has('buyer2Name')} />
        <FieldRow label="Buyer 2 Email" id="pcm-buyer2Email" type="email" value={buyer2Email} onChange={setBuyer2Email} highlight={highlightFields.has('buyer2Email')} />
        <FieldRow label="Buyer 2 Phone" id="pcm-buyer2Phone" type="tel" value={buyer2Phone} onChange={setBuyer2Phone} highlight={highlightFields.has('buyer2Phone')} />
      </div>

      <SectionHeading>Seller Information</SectionHeading>
      <div className="grid grid-cols-3 gap-3">
        <FieldRow label="Seller Name" id="pcm-sellerName" value={sellerName} onChange={setSellerName} highlight={highlightFields.has('sellerName')} />
        <FieldRow label="Seller Email" id="pcm-sellerEmail" type="email" value={sellerEmail} onChange={setSellerEmail} highlight={highlightFields.has('sellerEmail')} />
        <FieldRow label="Seller Phone" id="pcm-sellerPhone" type="tel" value={sellerPhone} onChange={setSellerPhone} highlight={highlightFields.has('sellerPhone')} />
      </div>

      <SectionHeading>Other Agent / Cooperating Broker</SectionHeading>
      <div className="grid grid-cols-2 gap-3">
        <FieldRow label="Other Agent Name" id="pcm-otherAgentName" value={otherAgentName} onChange={setOtherAgentName} highlight={highlightFields.has('otherAgentName')} />
        <FieldRow label="Brokerage" id="pcm-otherAgentBrokerage" value={otherAgentBrokerage} onChange={setOtherAgentBrokerage} highlight={highlightFields.has('otherAgentBrokerage')} />
        <FieldRow label="Other Agent Email" id="pcm-otherAgentEmail" type="email" value={otherAgentEmail} onChange={setOtherAgentEmail} highlight={highlightFields.has('otherAgentEmail')} />
        <FieldRow label="Other Agent Phone" id="pcm-otherAgentPhone" type="tel" value={otherAgentPhone} onChange={setOtherAgentPhone} highlight={highlightFields.has('otherAgentPhone')} />
      </div>

      <SectionHeading>Lender</SectionHeading>
      <div className="grid grid-cols-2 gap-3">
        <FieldRow label="Mortgage Company" id="pcm-mortgageCompany" value={mortgageCompany} onChange={setMortgageCompany} highlight={highlightFields.has('mortgageCompany')} />
        <FieldRow label="Loan Officer" id="pcm-loanOfficer" value={loanOfficer} onChange={setLoanOfficer} highlight={highlightFields.has('loanOfficer')} />
        <FieldRow label="Loan Officer Email" id="pcm-loanOfficerEmail" type="email" value={loanOfficerEmail} onChange={setLoanOfficerEmail} highlight={highlightFields.has('loanOfficerEmail')} />
        <FieldRow label="Loan Officer Phone" id="pcm-loanOfficerPhone" type="tel" value={loanOfficerPhone} onChange={setLoanOfficerPhone} highlight={highlightFields.has('loanOfficerPhone')} />
      </div>

      <SectionHeading>Title Company</SectionHeading>
      <div className="grid grid-cols-2 gap-3">
        <FieldRow label="Title Company" id="pcm-titleCompany" value={titleCompany} onChange={setTitleCompany} highlight={highlightFields.has('titleCompany')} />
        <FieldRow label="Title Officer" id="pcm-titleOfficer" value={titleOfficer} onChange={setTitleOfficer} highlight={highlightFields.has('titleOfficer')} />
        <FieldRow label="Title Officer Email" id="pcm-titleOfficerEmail" type="email" value={titleOfficerEmail} onChange={setTitleOfficerEmail} highlight={highlightFields.has('titleOfficerEmail')} />
        <FieldRow label="Title Officer Phone" id="pcm-titleOfficerPhone" type="tel" value={titleOfficerPhone} onChange={setTitleOfficerPhone} highlight={highlightFields.has('titleOfficerPhone')} />
      </div>

      <SectionHeading>Notes</SectionHeading>
      <textarea
        className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        placeholder="Any additional notes about this contract…"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
    </div>
  );

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl w-full">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Listing Going Under Contract
          </DialogTitle>
          <DialogDescription className="truncate">
            {transactionAddress} — Add contract details to mark as Pending
          </DialogDescription>
        </DialogHeader>

        {/* ── Step: Choose ── */}
        {step === 'choose' && (
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              This listing is moving to <strong>Pending</strong>. Would you like to upload the purchase agreement to auto-fill the contract details, or enter them manually?
            </p>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 p-6 hover:bg-primary/10 transition-colors text-center"
              >
                <Upload className="h-8 w-8 text-primary" />
                <div>
                  <p className="font-semibold text-sm">Upload Contract</p>
                  <p className="text-xs text-muted-foreground mt-1">PDF, Word, or image — AI will extract the fields</p>
                </div>
              </button>
              <button
                onClick={() => setStep('manual')}
                className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-muted-foreground/30 bg-muted/30 p-6 hover:bg-muted/50 transition-colors text-center"
              >
                <PenLine className="h-8 w-8 text-muted-foreground" />
                <div>
                  <p className="font-semibold text-sm">Fill Manually</p>
                  <p className="text-xs text-muted-foreground mt-1">Enter contract details by hand</p>
                </div>
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,.heic"
              className="hidden"
              onChange={handleFileChange}
            />
            <DialogFooter>
              <Button variant="ghost" size="sm" onClick={handleSkip}>
                Skip for now — just mark as Pending
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* ── Step: Uploading / Extracting ── */}
        {(step === 'uploading' || step === 'extracting') && (
          <div className="flex flex-col items-center gap-4 py-8">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <div className="text-center">
              <p className="font-semibold">{step === 'uploading' ? 'Uploading…' : 'Extracting contract data…'}</p>
              <p className="text-sm text-muted-foreground mt-1">{pdfName}</p>
            </div>
            <Skeleton className="h-3 w-48 rounded-full" />
          </div>
        )}

        {/* ── Step: Review (post-extraction) ── */}
        {step === 'review' && (
          <>
            <div className="flex items-center gap-2 rounded-md bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-700 mb-2">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>Contract data extracted from <strong>{pdfName}</strong>. Review and confirm below.</span>
            </div>
            {renderForm()}
            <DialogFooter className="pt-2 gap-2">
              <Button variant="outline" onClick={() => setStep('choose')}>Back</Button>
                            <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Save &amp; Mark Pending
              </Button>
            </DialogFooter>
          </>
        )}
        {/* ── Step: Manual ── */}
        {step === 'manual' && (
          <>
            {renderForm()}
            <DialogFooter className="pt-2 gap-2">
              <Button variant="outline" onClick={() => setStep('choose')}>Back</Button>
              <Button variant="ghost" size="sm" onClick={handleSkip}>Skip for now</Button>
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Save &amp; Mark Pending
              </Button>
            </DialogFooter>
          </>
        )}

        {/* ── Step: Saving ── */}
        {step === 'saving' && (
          <div className="flex flex-col items-center gap-4 py-8">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="font-semibold">Saving &amp; notifying team…</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
