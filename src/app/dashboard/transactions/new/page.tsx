'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useRef, useState, useCallback, type ChangeEvent } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useUser } from '@/firebase';
import { useEffectiveUser } from '@/hooks/useEffectiveUser';
import { useIsAdminLike } from '@/hooks/useIsAdminLike';
import { useIsStaff } from '@/hooks/useIsStaff';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle2, Send, ClipboardList, FileCheck2, Paperclip, X, FileText, Loader2, PlusCircle, Trash2, UploadCloud, Upload, Sparkles, AlertCircle, ChevronRight, ChevronDown, Home, List, Users, ArrowRightLeft, Info, Paintbrush, WandSparkles, RefreshCw, Copy, CheckCheck, Trees, Building2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ContactAutocomplete } from '@/components/contacts/ContactAutocomplete';
import type { SavedContact } from '@/hooks/useContactSearch';
import Link from 'next/link';
import { resolveGCI } from '@/lib/commissions';
import { CANONICAL_SOURCES, normalizeDealSource } from '@/lib/normalizeDealSource';
import { AgentDocumentChecklist } from '@/components/transactions/AgentDocumentChecklist';
import { resolveTransactionSide, type TransactionSide } from '@/lib/transactions/resolveTransactionSide';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const SOURCES = CANONICAL_SOURCES;

const INSPECTION_TYPE_OPTIONS = [
  'General Home Inspection',
  'Roof Inspection',
  'Termite Inspection',
  'Radon Inspection',
  'Sewer Scope Inspection',
  'Water Well Inspection',
  'Septic/Sewer Inspection',
  'HVAC Inspection',
  'Generator Inspection',
  'Foundation Inspection',
  'Pool',
  'Survey',
  'Water Well Inspection',
  'Septic/Sewer Inspection',
  'Elevation Certificate',
];

const MEDIA_TYPE_OPTIONS = [
  'Photos',
  'Twilight',
  'Blue Sky',
  'Stars',
  'Full Production Video',
  'Virtual Tour',
  '3D Floor Plan',
  'Virtual Staging',
  'Floor Plan',
  'Drone',
  'Sun Dial (Time-Lapse Sunlight)',
];

const SIGN_SERVICE_OPTIONS = [
  'Install Sign Post',
  'Repair Sign Post or Panel',
  'Remove Sign Post (No Fee)',
  'Commercial Sign-Frame 4x4',
  'Commercial Sign-Frame 4x8',
  'Other',
];

const SIGN_ADDITIONAL_OPTIONS = [
  'Directional Sign (+$2.00)',
  'Attach Personalized Name Rider',
  'Text2 Rider',
  'Phone# Rider EXT',
];

const SHOWING_NOTES_TO_AGENT_OPTIONS = [
  'Leave card',
  'Lock doors',
  'Turn off lights',
  'Scramble lockbox when leaving',
  'Remove shoes or wear booties',
  'Return and secure key in lockbox',
];

type AgentOption = { agentId: string; agentName: string };

type CommissionTier = {
  tierName: string;
  fromCompanyDollar: number;
  toCompanyDollar: number | null;
  agentSplitPercent: number;          // Effective % of full GCI the agent takes home
  companySplitPercent: number;
  transactionFee: number | null;
  capAmount: number | null;
  notes: string;
  // Present only for team members on a team WITH a leader
  leaderStructurePercent?: number;    // Leader's cut of GCI (e.g. 80%)
  memberPercentOfLeaderSide?: number; // Member's cut of leader side (e.g. 75%)
};

type TeamMemberLeaderSplitBand = {
  fromCompanyDollar: number;
  toCompanyDollar: number | null;
  leaderPercent: number;
  companyPercent: number;
};

type TeamMemberBand = {
  fromCompanyDollar: number;
  toCompanyDollar: number | null;
  memberPercent: number;
};

type AgentCommissionData = {
  agentType: string;
  teamGroup: string;
  commissionMode: string;
  tiersSource?: string;
  defaultTransactionFee: number | null;
  tiers: CommissionTier[];
  // Non-null only for team members on a team WITH a leader.
  // When present, the commission preview shows the two-step breakdown.
  teamMemberLeaderSplit?: {
    leaderStructureBands: TeamMemberLeaderSplitBand[];
    memberDefaultBands: TeamMemberBand[];
  } | null;
  ytdTierProgressionGci?: number;
  ytdTierProgressionCompanyDollar?: number;
  cycleStart?: string | null;
  cycleEnd?: string | null;
};

function findActiveTier(tiers: CommissionTier[], gci: number): CommissionTier | null {
  if (!tiers || tiers.length === 0) return null;
  for (const tier of tiers) {
    const from = tier.fromCompanyDollar;
    const to = tier.toCompanyDollar;
    if (gci >= from && (to === null || gci < to)) return tier;
  }
  return tiers[tiers.length - 1];
}

// ─────────────────────────────────────────────────────────────────────────────
// Currency formatting helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Format a raw number string with commas for display (e.g. "1000000" → "1,000,000") */
function formatCurrencyDisplay(raw: string | number | undefined): string {
  if (raw === '' || raw === undefined || raw === null) return '';
  const str = String(raw).replace(/,/g, '');
  const num = parseFloat(str);
  if (isNaN(num)) return String(raw);
  // Preserve decimal places from the raw input
  const decimalMatch = str.match(/\.(\d+)$/);
  const decimals = decimalMatch ? decimalMatch[1].length : 0;
  // Round to the number of decimal places the user typed to eliminate floating-point
  // drift (e.g. parseFloat('500000') → 499999.99... or parseFloat('3') → 2.9999...).
  // We round to at most 6 significant decimal places so we never silently lose precision.
  const rounded = parseFloat(num.toFixed(Math.min(decimals, 6)));
  return rounded.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: Math.max(decimals, 2),
  });
}

/** Strip commas to get the clean numeric string for the form value */
function parseCurrencyInput(val: string): string {
  return val.replace(/,/g, '');
}

/**
 * Round a numeric string to eliminate floating-point drift.
 * Strategy: round to the number of decimal places the user typed, capped at maxDecimals.
 * e.g. roundNumericString('2.9999999') → '3'  (0 user decimals → round to 0)
 *      roundNumericString('3.00')      → '3'  (2 user decimals → round to 2 → '3.00' → strip trailing zeros)
 *      roundNumericString('2.995')     → '2.995' (3 user decimals → round to 3)
 */
function roundNumericString(str: string, maxDecimals = 6): string {
  const n = parseFloat(str);
  if (isNaN(n)) return str;
  // Detect how many decimal places the user typed
  const decMatch = str.match(/\.(\d+)$/);
  const userDecimals = decMatch ? decMatch[1].length : 0;
  const places = Math.min(userDecimals, maxDecimals);
  // toFixed eliminates float drift (2.9999999 → '3.00' when places=2)
  const fixed = n.toFixed(places);
  // Strip unnecessary trailing zeros after decimal (e.g. '3.00' → '3', '3.50' → '3.5')
  return fixed.includes('.') ? fixed.replace(/\.?0+$/, '') : fixed;
}

/** A percent input that avoids browser type=number float drift (3 → 2.9999...) */
function PercentInput({
  value,
  onChange,
  placeholder,
  step = '0.01',
  min = '0',
  max = '100',
  className,
  disabled,
}: {
  value: string | number | undefined;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  step?: string;
  min?: string;
  max?: string;
  className?: string;
  disabled?: boolean;
}) {
  const [displayVal, setDisplayVal] = useState(() =>
    value !== undefined && value !== '' && value !== null ? String(value) : ''
  );

  // Sync when form value changes externally
  useEffect(() => {
    const v = value !== undefined && value !== '' && value !== null ? String(value) : '';
    setDisplayVal(v);
  }, [value]);

  return (
    <Input
      type="text"
      inputMode="decimal"
      placeholder={placeholder}
      disabled={disabled}
      className={className}
      value={displayVal}
      onChange={(e) => {
        // Allow free typing (digits, dot, minus)
        const raw = e.target.value.replace(/[^0-9.-]/g, '');
        setDisplayVal(e.target.value);
        // Fire a synthetic event so existing field.onChange(e) callers work
        const synth = { ...e, target: { ...e.target, value: raw } } as ChangeEvent<HTMLInputElement>;
        onChange(synth);
      }}
      onBlur={(e) => {
        // On blur, snap to clean rounded value to eliminate float drift
        const raw = displayVal.replace(/[^0-9.-]/g, '');
        const rounded = roundNumericString(raw, 4);
        setDisplayVal(rounded);
        const synth = { ...e, target: { ...e.target, value: rounded } } as ChangeEvent<HTMLInputElement>;
        onChange(synth);
      }}
    />
  );
}

/** A currency input that displays with commas but stores as a plain number string */
function CurrencyInput({
  value,
  onChange,
  placeholder,
  readOnly,
  className,
}: {
  value: string | number | undefined;
  onChange: (val: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  className?: string;
}) {
  const [displayVal, setDisplayVal] = useState(() => formatCurrencyDisplay(value));

  // Sync display when form value changes externally (e.g. auto-calc)
  useEffect(() => {
    const formatted = formatCurrencyDisplay(value);
    setDisplayVal(formatted);
  }, [value]);

  return (
    <Input
      type="text"
      inputMode="decimal"
      placeholder={placeholder}
      readOnly={readOnly}
      className={className}
      value={displayVal}
      onChange={(e) => {
        const raw = parseCurrencyInput(e.target.value);
        setDisplayVal(e.target.value); // let user type freely
        onChange(raw);
      }}
      onBlur={() => {
        // Reformat on blur for clean display
        const raw = parseCurrencyInput(displayVal);
        const formatted = formatCurrencyDisplay(raw);
        setDisplayVal(formatted);
      }}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Schema
// ─────────────────────────────────────────────────────────────────────────────
const schema = z.object({
  // Agent
  agentId: z.string().optional(),
  isPassThrough: z.boolean().optional(),
  agentDisplayName: z.string().optional(),

  // Status
  status: z.enum(['active', 'coming_soon', 'pending', 'closed', 'cancelled', 'temp_off_market'], { required_error: 'Please select a status to continue' }),

  // Basics
  closingType: z.enum(['buyer', 'listing', 'referral', 'dual'], { required_error: 'Type of closing is required' }),
  dealType: z.enum(['residential_sale', 'residential_lease', 'land', 'commercial_listing', 'commercial_sale', 'commercial_lease']),
  // Referrals may be created before a property is identified; all other deal types require an address.
  address: z.string().optional().or(z.literal('')),
  clientName: z.string().optional(),  // Populated from Buyer/Seller section; not shown in Property Details
  dealSource: z.string().optional(),

  // Financial
  listPrice: z.coerce.number().min(0).optional().or(z.literal('')),
  salePrice: z.coerce.number().min(0).optional().or(z.literal('')),
  commissionPercent: z.coerce.number().min(0).max(100).optional().or(z.literal('')),
  commissionBasePrice: z.coerce.number().min(0).optional().or(z.literal('')),
  gci: z.coerce.number().min(0).optional().or(z.literal('')),
  transactionFee: z.coerce.number().min(0).optional().or(z.literal('')),
  earnestMoney: z.coerce.number().min(0).optional().or(z.literal('')),
  depositHolder: z.enum(['listing_broker', 'selling_broker', 'other']).optional(),
  depositHolderOther: z.string().optional(),
  brokerPct: z.coerce.number().min(0).max(100).optional().or(z.literal('')),
  brokerGci: z.coerce.number().min(0).optional().or(z.literal('')),
  agentPct: z.coerce.number().min(0).max(100).optional().or(z.literal('')),
  // Agent net can legitimately be negative on a fee-heavy file. Do not block a
  // status save merely because the agent owes more in allocated fees than this
  // transaction pays; staff can correct the underlying allocation afterward.
  agentDollar: z.coerce.number().optional().or(z.literal('')),

  // MLS Number
  mlsNumber: z.string().optional(),
  // Dates — contractDate is now OPTIONAL
  listingDate: z.string().optional().or(z.literal('')),
  listingExpirationDate: z.string().optional().or(z.literal('')),
  contractDate: z.string().optional().or(z.literal('')),
  // optionExpiration removed — not needed at listing stage
  optionExpiration: z.string().optional().or(z.literal('')),

  // Commercial Lease/Sale listing fields
  commercialForSale: z.boolean().optional(),
  commercialSalePrice: z.coerce.number().min(0).optional().or(z.literal('')),
  commercialForLease: z.boolean().optional(),
  commercialLeaseMonthly: z.coerce.number().min(0).optional().or(z.literal('')),
  commercialLeasePricePerSqft: z.coerce.number().min(0).optional().or(z.literal('')),
  commercialLeaseTerm: z.coerce.number().min(0).optional().or(z.literal('')),
  commercialTotalLeaseValue: z.coerce.number().min(0).optional().or(z.literal('')),
  commercialLeaseGci: z.coerce.number().min(0).optional().or(z.literal('')),
  commercialLeaseCommissionMode: z.enum(['percent', 'flat']).optional(),
  commercialLeaseCommissionPct: z.coerce.number().min(0).max(100).optional().or(z.literal('')),
  commercialLeaseCommissionFlat: z.coerce.number().min(0).optional().or(z.literal('')),
  commercialLeaseEffectivePct: z.coerce.number().min(0).optional().or(z.literal('')),
  inspectionDeadline: z.string().optional().or(z.literal('')),
  surveyDeadline: z.string().optional().or(z.literal('')),
  projectedCloseDate: z.string().optional().or(z.literal('')),
  closedDate: z.string().optional().or(z.literal('')),
  loanApplicationDeadline: z.string().optional().or(z.literal('')),
  appraisalDeadline: z.string().optional().or(z.literal('')),
  titleDeadline: z.string().optional().or(z.literal('')),
  finalLoanCommitmentDeadline: z.string().optional().or(z.literal('')),
  // Preserve printed commercial agreement periods even when the agreement does
  // not provide a signed effective date for calculating calendar deadlines.
  appraisalConditioned: z.boolean().optional(),
  appraisalPeriodDays: z.coerce.number().min(0).optional().or(z.literal('')),
  depositDueDays: z.coerce.number().min(0).optional().or(z.literal('')),
  financingCommitmentDays: z.coerce.number().min(0).optional().or(z.literal('')),
  closingDays: z.coerce.number().min(0).optional().or(z.literal('')),

  // Client contact info (legacy)
  clientEmail: z.string().email().optional().or(z.literal('')),
  clientPhone: z.string().optional(),
  clientNewAddress: z.string().optional(),

  // Second client (legacy)
  client2Name: z.string().optional(),
  client2Email: z.string().email().optional().or(z.literal('')),
  client2Phone: z.string().optional(),

  // Parties — Other Agent
  otherAgentName: z.string().optional(),
  otherAgentEmail: z.string().email().optional().or(z.literal('')),
  otherAgentPhone: z.string().optional(),
  otherBrokerage: z.string().optional(),

  // Parties — Mortgage/Lender
  mortgageCompany: z.string().optional(),
  loanOfficer: z.string().optional(),
  loanOfficerEmail: z.string().email().optional().or(z.literal('')),
  loanOfficerPhone: z.string().optional(),
  lenderOffice: z.string().optional(),

  // Parties — Title
  titleCompany: z.string().optional(),
  titleOfficer: z.string().optional(),
  titleOfficerEmail: z.string().email().optional().or(z.literal('')),
  titleOfficerPhone: z.string().optional(),
  titleAttorney: z.string().optional(),
  titleOffice: z.string().optional(),

  // TC Working File
  tcWorking: z.enum(['yes', 'no'], { required_error: 'Please select Yes or No.' }),
  // Canonical routing flag stored on transactions. The UI exposes tcWorking for
  // clarity, but every save also carries this boolean for queue/notification logic.
  workingWithTc: z.boolean().optional(),

  // Client Type
  clientType: z.enum(['buyer', 'seller', 'dual']).optional(),

  // Buyer info
  buyerName: z.string().optional(),
  buyerEmail: z.string().email().optional().or(z.literal('')),
  buyerPhone: z.string().optional(),
  buyer2Name: z.string().optional(),
  buyer2Email: z.string().email().optional().or(z.literal('')),
  buyer2Phone: z.string().optional(),
  buyer3Name: z.string().optional(),
  buyer3Email: z.string().email().optional().or(z.literal('')),
  buyer3Phone: z.string().optional(),
  buyer4Name: z.string().optional(),
  buyer4Email: z.string().email().optional().or(z.literal('')),
  buyer4Phone: z.string().optional(),

  // Seller info
  sellerName: z.string().optional(),
  sellerEmail: z.string().email().optional().or(z.literal('')),
  sellerPhone: z.string().optional(),
  seller2Name: z.string().optional(),
  seller2Email: z.string().email().optional().or(z.literal('')),
  seller2Phone: z.string().optional(),
  seller3Name: z.string().optional(),
  seller3Email: z.string().email().optional().or(z.literal('')),
  seller3Phone: z.string().optional(),
  seller4Name: z.string().optional(),
  seller4Email: z.string().email().optional().or(z.literal('')),
  seller4Phone: z.string().optional(),

  // Pre-Listing Inspections (listing-only)
  preListingInspectionOrdered: z.enum(['yes', 'no']).optional(),
  preListingTargetInspectionDate: z.string().optional().or(z.literal('')),
  preListingInspectionTypes: z.array(z.string()).optional(),
  preListingTcScheduleInspections: z.enum(['yes', 'no', 'other', 'already_scheduled']).optional(),
  preListingTcScheduleInspectionsOther: z.string().optional(),
  preListingInspectorName: z.string().optional(),
  // Buyer/Pending Inspections
  inspectionOrdered: z.enum(['yes', 'no']).optional(),
  targetInspectionDate: z.string().optional().or(z.literal('')),
  inspectionTypes: z.array(z.string()).optional(),
  tcScheduleInspections: z.enum(['yes', 'no', 'other', 'already_scheduled']).optional(),
  tcScheduleInspectionsOther: z.string().optional(),
  inspectorName: z.string().optional(),
  // Media Order (listing-only)
  mediaTypes: z.array(z.string()).optional(),
  mediaRequestedDate: z.string().optional().or(z.literal('')),
  mediaNotes: z.string().optional(),
  // MLS Description Builder (listing-only)
  mlsDescription: z.string().optional(),
  // Sign Order (listing-only)
  signOrderRequested: z.boolean().optional(),
  signServiceType: z.string().optional(),
  signAdditionalOptions: z.array(z.string()).optional(),
  signRiderExt: z.string().optional(),
  signRequestedDate: z.string().optional().or(z.literal('')),
  signSpecialRequests: z.string().optional(),
  signOwnerName: z.string().optional(),
  // ShowingTime Setup (listing-only)
  showingTimeRequested: z.boolean().optional(),
  showingNewOrChange: z.enum(['new', 'change']).optional(),
  showingApptHandling: z.array(z.string()).optional(),
  showingVirtualPreference: z.string().optional(),
  showingApptType: z.string().optional(),
  showingNoSameDayAppts: z.boolean().optional(),
  showingLeadTimeRequired: z.string().optional(),
  showingLeadTimeSuggested: z.string().optional(),
  showingMaxApptLength: z.string().optional(),
  showingApptOverlaps: z.string().optional(),
  showingCallOrder2Name: z.string().optional(),
  showingCallOrder2Mobile: z.string().optional(),
  showingCallOrder2AltPhone: z.string().optional(),
  showingCallOrder2Email: z.string().optional(),
  showingCallOrder2Type: z.enum(['agent', 'owner', 'occupant']).optional(),
  showingCallOrder2Confirm: z.string().optional(),
  showingCallOrder2Notify: z.array(z.string()).optional(),
  showingCallOrder3Name: z.string().optional(),
  showingCallOrder3Mobile: z.string().optional(),
  showingCallOrder3AltPhone: z.string().optional(),
  showingCallOrder3Email: z.string().optional(),
  showingCallOrder3Type: z.enum(['agent', 'owner', 'occupant']).optional(),
  showingCallOrder3Confirm: z.string().optional(),
  showingCallOrder3Notify: z.array(z.string()).optional(),
  showingShareAgentInfo: z.string().optional(),
  showingAccessType: z.string().optional(),
  showingAccessNotes: z.string().optional(),
  showingAccessDoor: z.string().optional(),
  showingDisarmCode: z.string().optional(),
  showingArmCode: z.string().optional(),
  showingPasscode: z.string().optional(),
  showingAlarmNotes: z.string().optional(),
  showingNotesToStaff: z.string().optional(),
  showingNotesToAgent: z.array(z.string()).optional(),
  showingNotesToAgentOther: z.string().optional(),

  // Commission paid by seller
  // When commissionMode is 'flat', sellerPayingListingAgent / sellerPayingBuyerAgent hold dollar amounts
  sellerPayingListingAgent: z.coerce.number().min(0).optional().or(z.literal('')),
  sellerPayingListingAgentUnknown: z.boolean().optional(),
  sellerPayingBuyerAgent: z.coerce.number().min(0).optional().or(z.literal('')),
  // 'percent' (default) or 'flat' — controls whether seller-paying fields are % or $
  commissionMode: z.enum(['percent', 'flat']).optional(),

  // Buyer closing cost paid by seller
  buyerClosingCostTotal: z.coerce.number().min(0).optional().or(z.literal('')),
  buyerClosingCostAgentCommission: z.coerce.number().min(0).optional().or(z.literal('')),
  buyerClosingCostTxFee: z.coerce.number().min(0).optional().or(z.literal('')),
  buyerClosingCostHomeWarranty: z.coerce.number().min(0).optional().or(z.literal('')),
  buyerClosingCostOther: z.coerce.number().min(0).optional().or(z.literal('')),

  // Additional info
  warrantyAtClosing: z.enum(['yes', 'no']).optional(),
  warrantyAmount: z.coerce.number().min(0).optional().or(z.literal('')),
  warrantyPaidBy: z.string().optional(),
  txComplianceFee: z.enum(['yes', 'no']).optional(),
  txComplianceFeeAmount: z.coerce.number().min(0).optional().or(z.literal('')),
  txComplianceFeePaidBy: z.string().optional(),
  txComplianceFeeAgentAllocation: z.enum(['primary_agent', 'co_agent', 'split_equal', 'custom']).optional(),
  txComplianceFeePrimaryAgentAmount: z.coerce.number().min(0).optional().or(z.literal('')),
  txComplianceFeeCoAgentAmount: z.coerce.number().min(0).optional().or(z.literal('')),
  occupancyAgreement: z.enum(['yes', 'no']).optional(),
  occupancyDates: z.string().optional(),
  shortageInCommission: z.enum(['yes', 'no']).optional(),
  shortageAmount: z.coerce.number().min(0).optional().or(z.literal('')),
  buyerBringToClosing: z.coerce.number().min(0).optional().or(z.literal('')),
  shortageHandledBy: z.string().optional(),

  additionalComments: z.string().optional(),
  notes: z.string().optional(),

  // Outbound Referral fields — available for all transaction types (buyer, listing, dual, referral)
  hasOutboundReferral: z.boolean().optional(),
  outboundReferralAgentName: z.string().optional(),
  outboundReferralBrokerage: z.string().optional(),
  outboundReferralEmail: z.string().email().optional().or(z.literal('')),
  outboundReferralPhone: z.string().optional(),
  outboundReferralFeePercent: z.coerce.number().min(0).max(100).optional().or(z.literal('')),
  outboundReferralFeeDollar: z.coerce.number().min(0).optional().or(z.literal('')),

  // Inbound referral fee (we received a referred client and owe a referral fee)
  hasInboundReferral: z.boolean().optional(),
  inboundReferralAgentName: z.string().optional(),
  inboundReferralFeePercent: z.coerce.number().min(0).max(100).optional().or(z.literal('')),
  inboundReferralFeeDollar: z.coerce.number().min(0).optional().or(z.literal('')),

  // Co-agent fields
  hasCoAgent: z.boolean().optional(),
  coAgentId: z.string().optional(),
  coAgentDisplayName: z.string().optional(),
  coAgentRole: z.enum(['co_list', 'co_buyer', 'referral', 'other']).optional(),
  primaryAgentSplitPercent: z.coerce.number().min(0).max(100).optional().or(z.literal('')),
  coAgentSplitPercent: z.coerce.number().min(0).max(100).optional().or(z.literal('')),
}).refine(
  (data) => data.closingType === 'referral' || String(data.address || '').trim().length >= 5,
  { message: 'Full property address is required for buyer, listing, and dual transactions.', path: ['address'] }
).refine(
  (data) => {
    if (!data.hasCoAgent) return true;
    const p = Number(data.primaryAgentSplitPercent || 0);
    const c = Number(data.coAgentSplitPercent || 0);
    return Math.abs(p + c - 100) < 0.01;
  },
  { message: 'Primary and co-agent split percentages must total 100%', path: ['coAgentSplitPercent'] }
);

type FormValues = z.infer<typeof schema>;

// ─────────────────────────────────────────────────────────────────────────────
// Layout helpers
// ─────────────────────────────────────────────────────────────────────────────
function Section({ title, description, children }: {
  title: string; description?: string; children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-5">{children}</CardContent>
    </Card>
  );
}

function Grid2({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 md:grid-cols-2 gap-5">{children}</div>;
}

function Grid3({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 md:grid-cols-3 gap-5">{children}</div>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────
export default function AddTransactionPage() {
  const { user, loading: userLoading } = useUser();
  const router = useRouter();
  const { effectiveUid, effectiveName, isImpersonating } = useEffectiveUser();
  const { toast } = useToast();
  const urlSearchParams = useSearchParams();
  const urlDraftId = urlSearchParams?.get('draft') ?? null;
  const editTxId = urlSearchParams?.get('edit') ?? null;
  const editMode = Boolean(editTxId);
  // TC/Staff queue mode — when intakeId is present the form shows an action bar
  const intakeId = urlSearchParams?.get('intakeId') ?? null;
  const queueRole = urlSearchParams?.get('role') ?? null; // 'tc' | 'staff' | null
  const isTcQueueMode = Boolean(intakeId && (queueRole === 'tc' || queueRole === 'staff'));
  const [submitted, setSubmitted] = useState(false);
  const [resultId, setResultId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [intakeStatus, setIntakeStatus] = useState<string | null>(null);
  // Preserve the status that was actually stored when an edit session opened.
  // An agent may transition a Pending file to Closed, but must become read-only
  // after a persisted Closed file is reopened.
  const [persistedEditStatus, setPersistedEditStatus] = useState<string | null>(null);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectSubmitting, setRejectSubmitting] = useState(false);
  const [archiveSubmitting, setArchiveSubmitting] = useState(false);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [intakeApproving, setIntakeApproving] = useState(false);
  const lastSaveSucceededRef = useRef(false);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  // ── Checklist drawer state ─────────────────────────────────────────────────
  type ChecklistItem = { id: string; order: number; label: string; completed: boolean; completedBy: string | null; completedAt: string | null };
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [checklistSaving, setChecklistSaving] = useState<string | null>(null); // itemId being saved

  // ── URL params — must be read before any state that depends on them ────────
  const typeParamEarly = urlSearchParams?.get('type');

  // ── PDF extraction state ──────────────────────────────────────────────────
  // 'type' is the new first step — select Buyer / Listing / Dual / Referral
  // Skip 'type' step when closingType is pre-set from URL params (e.g. listing→pending flow)
  type PdfStep = 'loading' | 'type' | 'upload' | 'extracting' | 'review' | 'form';
  // An edit session begins in a neutral loading state so a legacy record never
  // flashes the Buyer or Listing layout before its stored side is resolved.
  const [pdfStep, setPdfStep] = useState<PdfStep>(editMode ? 'loading' : (typeParamEarly ? 'upload' : 'type'));
  const [pdfName, setPdfName] = useState<string>('');
  const [pdfConfidence, setPdfConfidence] = useState<Record<string, number>>({});
  const [pdfHighlightFields, setPdfHighlightFields] = useState<Set<string>>(new Set());
  const pdfInputRef = useRef<HTMLInputElement>(null);
  // MLS Input Form upload (for listing transactions)
  const mlsPdfInputRef = useRef<HTMLInputElement>(null);
  const [mlsPdfName, setMlsPdfName] = useState<string>('');
  // Land agreement upload
  const landPdfInputRef = useRef<HTMLInputElement>(null);
  const commercialPdfInputRef = useRef<HTMLInputElement>(null);
  const [pdfDocType, setPdfDocType] = useState<'residential' | 'land' | 'commercial' | null>(null);
  // ── Document upload state — MUST be declared before PDF upload handlers ──────
  // These handlers call setUploadedDocs; if the state is declared after them,
  // the closures capture a stale/undefined reference and uploads are silently lost.
  type UploadedDoc = { name: string; url: string; storagePath: string; uploadedAt: string };
  const [uploadedDocs, setUploadedDocs] = useState<UploadedDoc[]>([]);
  const [docUploading, setDocUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePdfUpload = async (file: File) => {
    if (!user) return;
    setPdfStep('extracting');
    setPdfName(file.name);
    try {
      const token = await user.getIdToken();
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/agent/parse-purchase-agreement', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast({ title: 'Extraction failed', description: data.error || 'Could not read the PDF. Please fill the form manually.', variant: 'destructive' });
        setPdfStep('form');
        return;
      }
      const f = data.fields || {};
      const conf = data.confidence || {};
      setPdfConfidence(conf);
      // Fields with confidence < 0.7 get highlighted for agent review
      const lowConf = new Set<string>(Object.entries(conf).filter(([, v]) => (v as number) < 0.7 && (v as number) > 0).map(([k]) => k));
      setPdfHighlightFields(lowConf);
      // Map extracted fields to form values
      const setIfPresent = (key: string, val: unknown) => {
        if (val !== null && val !== undefined && val !== '') form.setValue(key as any, val as any);
      };
      setIfPresent('address', f.address);
      setIfPresent('salePrice', f.salePrice);
      setIfPresent('listPrice', f.listPrice);
      setIfPresent('contractDate', f.contractDate);
      setIfPresent('projectedCloseDate', f.projectedCloseDate);
      setIfPresent('inspectionDeadline', f.inspectionDeadline);
      setIfPresent('surveyDeadline', f.surveyDeadline);
      setIfPresent('loanApplicationDeadline', f.loanApplicationDeadline);
      setIfPresent('appraisalDeadline', f.appraisalDeadline);
      setIfPresent('finalLoanCommitmentDeadline', f.finalLoanCommitmentDeadline);
      setIfPresent('titleDeadline', f.titleDeadline);
      setIfPresent('optionExpiration', f.optionExpiration);
      setIfPresent('earnestMoney', f.earnestMoney);
      // Deposit holder: map depositHeldBy from API to depositHolder form field
      if (f.depositHeldBy) {
        const dh = String(f.depositHeldBy).toLowerCase().replace(/\s+/g, '_');
        if (dh === 'listing_broker') {
          form.setValue('depositHolder', 'listing_broker');
        } else if (dh === 'selling_broker') {
          form.setValue('depositHolder', 'selling_broker');
        } else {
          form.setValue('depositHolder', 'other');
          form.setValue('depositHolderOther', String(f.depositHeldBy));
        }
      }
      setIfPresent('buyerName', f.buyerName);
      setIfPresent('buyerEmail', f.buyerEmail);
      setIfPresent('buyerPhone', f.buyerPhone);
      setIfPresent('buyer2Name', f.buyer2Name);
      setIfPresent('buyer2Email', f.buyer2Email);
      setIfPresent('buyer2Phone', f.buyer2Phone);
      setIfPresent('sellerName', f.sellerName);
      setIfPresent('sellerEmail', f.sellerEmail);
      setIfPresent('sellerPhone', f.sellerPhone);
      setIfPresent('seller2Name', f.seller2Name);
      setIfPresent('seller2Email', f.seller2Email);
      setIfPresent('seller2Phone', f.seller2Phone);
      setIfPresent('otherAgentName', f.otherAgentName);
      setIfPresent('otherAgentEmail', f.otherAgentEmail);
      setIfPresent('otherAgentPhone', f.otherAgentPhone);
      setIfPresent('otherBrokerage', f.otherBrokerage);
      setIfPresent('mortgageCompany', f.mortgageCompany);
      setIfPresent('loanOfficer', f.loanOfficer);
      setIfPresent('loanOfficerEmail', f.loanOfficerEmail);
      setIfPresent('loanOfficerPhone', f.loanOfficerPhone);
      setIfPresent('titleCompany', f.titleCompany);
      setIfPresent('titleOfficer', f.titleOfficer);
      setIfPresent('titleOfficerEmail', f.titleOfficerEmail);
      setIfPresent('titleOfficerPhone', f.titleOfficerPhone);
      setIfPresent('titleAttorney', f.titleAttorney);
      setIfPresent('inspectorName', f.inspectorName);
      // Auto-select well/septic inspection types from PDF
      if (f.hasPrivateWell || f.hasSepticSystem) {
        const currentTypes = form.getValues('inspectionTypes') || [];
        const updated = [...currentTypes];
        if (f.hasPrivateWell && !updated.includes('Water Well Inspection')) {
          updated.push('Water Well Inspection');
        }
        if (f.hasSepticSystem && !updated.includes('Septic/Sewer Inspection')) {
          updated.push('Septic/Sewer Inspection');
        }
        if (updated.length !== currentTypes.length) {
          form.setValue('inspectionTypes', updated);
        }
      }
      // clientName fallback — use buyer or seller name
      if (!form.getValues('clientName')) {
        const cn = f.buyerName || f.sellerName || '';
        if (cn) form.setValue('clientName', cn as string);
      }
      // closingType inference
      if (f.closingType && ['buyer','listing','dual','referral'].includes(f.closingType as string)) {
        form.setValue('closingType', f.closingType as any);
      }
      // dealType inference
      if (f.dealType && ['residential_sale','residential_lease','land','commercial_sale','commercial_lease'].includes(f.dealType as string)) {
        form.setValue('dealType', f.dealType as any);
      }
      // clientType inference
      if (f.clientType && ['buyer','seller','dual'].includes(f.clientType as string)) {
        form.setValue('clientType', f.clientType as any);
      }
      // Store extra fields in notes if present
      const extraNotes: string[] = [];
      if (f.loanType) extraNotes.push(`Loan Type: ${f.loanType}`);
      if (f.loanAmount) extraNotes.push(`Loan Amount: $${Number(f.loanAmount).toLocaleString()}`);
      if (f.downPaymentAmount) extraNotes.push(`Down Payment: $${Number(f.downPaymentAmount).toLocaleString()}`);
      if (f.downPaymentPercent) extraNotes.push(`Down Payment %: ${f.downPaymentPercent}%`);
      if (f.interestRate) extraNotes.push(`Interest Rate: ${f.interestRate}%`);
      if (f.loanTerm) extraNotes.push(`Loan Term: ${f.loanTerm} years`);
      if (f.financingContingency && f.financingContingency !== 'no') extraNotes.push(`Financing Contingency: ${f.financingContingency}`);
      if (f.mineralRights && f.mineralRights !== 'not_mentioned') extraNotes.push(`Mineral Rights: ${f.mineralRights}${f.mineralRightsClause ? ' — ' + f.mineralRightsClause : ''}`);
      // Map commissionPaidBySeller → sellerPayingBuyerAgent (% mode only)
      if (f.commissionPaidBySeller != null && Number(f.commissionPaidBySeller) > 0 && commissionMode === 'percent') {
        form.setValue('sellerPayingBuyerAgent', Number(f.commissionPaidBySeller) as any);
      }
      // Map homeWarranty fields → warrantyAtClosing / warrantyAmount / warrantyPaidBy
      if (f.homeWarranty === 'yes') {
        form.setValue('warrantyAtClosing', 'yes');
        if (f.homeWarrantyAmount && Number(f.homeWarrantyAmount) > 0) {
          form.setValue('warrantyAmount', Number(f.homeWarrantyAmount) as any);
        }
        if (f.homeWarrantyPaidBy) {
          const paidBy = String(f.homeWarrantyPaidBy).toLowerCase();
          if (paidBy === 'seller') form.setValue('warrantyPaidBy', 'seller');
          else if (paidBy === 'buyer') form.setValue('warrantyPaidBy', 'buyer');
          // If unclear/other, leave blank per business rule
        }
      } else if (f.homeWarranty === 'no') {
        form.setValue('warrantyAtClosing', 'no');
      }
      // (homeWarranty === '' or null means unclear — leave blank)
      if (f.sellerConcessions) extraNotes.push(`Seller Concessions: $${Number(f.sellerConcessions).toLocaleString()}`);
      if (f.notes) extraNotes.push(f.notes as string);
      if (extraNotes.length > 0) {
        const existing = form.getValues('notes') || '';
        form.setValue('notes', (existing ? existing + '\n\n' : '') + '[AI Extracted]\n' + extraNotes.join('\n'));
      }
      // ── Auto-save the uploaded PDF as a transaction document ────────────
      if (data.savedDoc) {
        setUploadedDocs(prev => {
          // Avoid duplicates if the user re-uploads the same file
          const alreadyExists = prev.some((d: UploadedDoc) => d.storagePath === data.savedDoc.storagePath);
          return alreadyExists ? prev : [data.savedDoc as UploadedDoc, ...prev];
        });
      }
      setPdfStep('form');
      toast({ title: '✅ Purchase agreement scanned', description: `${Object.values(conf).filter(v => (v as number) >= 0.7).length} fields auto-filled. Review highlighted fields before submitting.` });
    } catch (err: any) {
      toast({ title: 'Extraction error', description: err.message, variant: 'destructive' });
      setPdfStep('form');
    }
  };

  // ── Land Agreement upload handler ───────────────────────────────────────────
  const handleLandPdfUpload = async (file: File) => {
    if (!user) return;
    setPdfStep('extracting');
    setPdfName(file.name);
    try {
      const token = await user.getIdToken();
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/agent/parse-land-agreement', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast({ title: 'Extraction failed', description: data.error || 'Could not read the land agreement. Please fill the form manually.', variant: 'destructive' });
        setPdfStep('form');
        return;
      }
      const f = data.fields || {};
      const conf = data.confidence || {};
      setPdfConfidence(conf);
      const lowConf = new Set<string>(Object.entries(conf).filter(([, v]) => (v as number) < 0.7 && (v as number) > 0).map(([k]) => k));
      setPdfHighlightFields(lowConf);
      const setIfPresent = (key: string, val: unknown) => {
        if (val !== null && val !== undefined && val !== '') form.setValue(key as any, val as any);
      };
      // Core fields
      setIfPresent('address', f.address);
      setIfPresent('salePrice', f.salePrice);
      setIfPresent('contractDate', f.contractDate);
      setIfPresent('projectedCloseDate', f.projectedCloseDate);
      setIfPresent('inspectionDeadline', f.inspectionDeadline);
      setIfPresent('appraisalDeadline', f.appraisalDeadline);
      setIfPresent('earnestMoney', f.earnestMoney);
      // Deposit holder
      if (f.depositHeldBy) {
        const dh = String(f.depositHeldBy).toLowerCase().replace(/\s+/g, '_');
        if (dh === 'listing_broker') form.setValue('depositHolder', 'listing_broker');
        else if (dh === 'selling_broker') form.setValue('depositHolder', 'selling_broker');
        else { form.setValue('depositHolder', 'other'); form.setValue('depositHolderOther', String(f.depositHeldBy)); }
      }
      // Buyer / Seller names
      setIfPresent('buyerName', f.buyerName);
      setIfPresent('buyer2Name', f.buyer2Name);
      setIfPresent('sellerName', f.sellerName);
      setIfPresent('seller2Name', f.seller2Name);
      // Agent info — map based on closing type
      // For a listing transaction: the other agent is the buyer's agent
      // For a buyer transaction: the other agent is the listing agent
      const isListingSide = f.closingType === 'listing' || f.isDualAgent;
      if (isListingSide) {
        setIfPresent('otherAgentName', f.buyerAgentName);
        setIfPresent('otherAgentPhone', f.buyerAgentPhone);
        setIfPresent('otherAgentEmail', f.buyerAgentEmail);
        setIfPresent('otherBrokerage', f.buyerBrokerage);
      } else {
        setIfPresent('otherAgentName', f.listingAgentName);
        setIfPresent('otherAgentPhone', f.listingAgentPhone);
        setIfPresent('otherAgentEmail', f.listingAgentEmail);
        setIfPresent('otherBrokerage', f.listingBrokerage);
      }
      // closingType / dealType / clientType
      if (f.closingType && ['buyer','listing','dual'].includes(f.closingType as string)) {
        form.setValue('closingType', f.closingType as any);
      }
      // Always set dealType to land
      form.setValue('dealType', 'land' as any);
      if (f.clientType && ['buyer','seller','dual'].includes(f.clientType as string)) {
        form.setValue('clientType', f.clientType as any);
      }
      // clientName fallback
      if (!form.getValues('clientName')) {
        const cn = (f.closingType === 'listing' ? f.sellerName : f.buyerName) || f.buyerName || f.sellerName || '';
        if (cn) form.setValue('clientName', cn as string);
      }
      // Extra notes
      const extraNotes: string[] = [];
      if (f.legalDescription) extraNotes.push(`Legal Description: ${f.legalDescription}`);
      if (f.acres) extraNotes.push(`Acreage: ${f.acres} acres`);
      if (f.lotDimensions) extraNotes.push(`Lot Dimensions: ${f.lotDimensions}`);
      if (f.mineralRights && f.mineralRights !== 'not_mentioned') extraNotes.push(`Mineral Rights: ${f.mineralRights}`);
      if (f.surveyResponsibility) extraNotes.push(`Survey Responsibility: ${f.surveyResponsibility}`);
      if (f.loanType) extraNotes.push(`Loan Type: ${f.loanType}`);
      if (f.loanAmount) extraNotes.push(`Loan Amount: $${Number(f.loanAmount).toLocaleString()}`);
      if (f.downPaymentAmount) extraNotes.push(`Down Payment: $${Number(f.downPaymentAmount).toLocaleString()}`);
      if (f.commissionNotes) extraNotes.push(`Commission: ${f.commissionNotes}`);
      if (f.additionalTerms && f.additionalTerms !== 'No Additional Terms.') extraNotes.push(`Additional Terms:\n${f.additionalTerms}`);
      if (f.notes) extraNotes.push(f.notes as string);
      if (extraNotes.length > 0) {
        const existing = form.getValues('notes') || '';
        form.setValue('notes', (existing ? existing + '\n\n' : '') + '[Land Agreement – AI Extracted]\n' + extraNotes.join('\n'));
      }
      // Auto-save the uploaded PDF as a transaction document
      if (data.savedDoc) {
        setUploadedDocs(prev => {
          const alreadyExists = prev.some((d: UploadedDoc) => d.storagePath === data.savedDoc.storagePath);
          return alreadyExists ? prev : [data.savedDoc as UploadedDoc, ...prev];
        });
      }
      setPdfStep('form');
      const filledCount = Object.values(conf).filter(v => (v as number) >= 0.7).length;
      toast({ title: '✅ Land agreement scanned', description: `${filledCount} fields auto-filled. Review highlighted fields before submitting.` });
    } catch (err: any) {
      toast({ title: 'Extraction error', description: err.message, variant: 'destructive' });
      setPdfStep('form');
    }
  };

  // ── Commercial Agreement upload handler ─────────────────────────────────────
  const handleCommercialPdfUpload = async (file: File) => {
    if (!user) return;
    setPdfStep('extracting');
    setPdfName(file.name);
    try {
      const token = await user.getIdToken();
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/agent/parse-commercial-agreement', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast({ title: 'Extraction failed', description: data.error || 'Could not read the commercial agreement. Please fill the form manually.', variant: 'destructive' });
        setPdfStep('form');
        return;
      }
      const f = data.data?.fields || {};
      const conf = data.data?._confidence || {};
      setPdfConfidence(conf);
      const lowConf = new Set<string>(Object.entries(conf).filter(([, v]) => (v as number) < 0.7 && (v as number) > 0).map(([k]) => k));
      setPdfHighlightFields(lowConf);
      const setIfPresent = (key: string, val: unknown) => {
        if (val !== null && val !== undefined && val !== '') form.setValue(key as any, val as any);
      };
      // Core fields
      setIfPresent('address', f.address);
      setIfPresent('salePrice', f.salePrice);
      setIfPresent('contractDate', f.contractDate);
      setIfPresent('projectedCloseDate', f.projectedCloseDate);
      setIfPresent('inspectionDeadline', f.inspectionDeadline);
      setIfPresent('appraisalDeadline', f.appraisalDeadline);
      setIfPresent('earnestMoney', f.earnestMoney);
      setIfPresent('finalLoanCommitmentDeadline', f.financingCommitmentDeadline);
      // Deposit holder
      if (f.depositHeldBy) {
        const dh = String(f.depositHeldBy).toLowerCase().replace(/\s+/g, '_');
        if (dh === 'listing_broker') form.setValue('depositHolder', 'listing_broker');
        else if (dh === 'selling_broker') form.setValue('depositHolder', 'selling_broker');
        else { form.setValue('depositHolder', 'other'); form.setValue('depositHolderOther', String(f.depositHeldBy)); }
      }
      // Buyer / Seller names
      setIfPresent('buyerName', f.buyerName);
      setIfPresent('buyer2Name', f.buyer2Name);
      setIfPresent('sellerName', f.sellerName);
      setIfPresent('seller2Name', f.seller2Name);
      // The header names agents on opposite sides of the deal. Keep the
      // representation side selected by the user; never infer dual agency.
      const selectedSide = form.getValues('closingType');
      const isListingSide = selectedSide === 'listing' || selectedSide === 'dual';
      if (isListingSide) {
        setIfPresent('otherAgentName', f.buyerAgentName);
        setIfPresent('otherAgentPhone', f.buyerAgentPhone);
        setIfPresent('otherBrokerage', f.buyerBrokerage);
      } else {
        setIfPresent('otherAgentName', f.listingAgentName);
        setIfPresent('otherAgentPhone', f.listingAgentPhone);
        setIfPresent('otherBrokerage', f.listingBrokerage);
      }
      // Always set dealType to commercial_sale
      form.setValue('dealType', 'commercial_sale' as any);
      if (!form.getValues('clientType')) {
        form.setValue('clientType', selectedSide === 'listing' ? 'seller' : selectedSide === 'dual' ? 'dual' : 'buyer');
      }
      setIfPresent('appraisalConditioned', f.appraisalConditioned);
      setIfPresent('appraisalPeriodDays', f.appraisalPeriodDays);
      setIfPresent('depositDueDays', f.depositDueDays);
      setIfPresent('financingCommitmentDays', f.financingCommitmentDays);
      setIfPresent('closingDays', f.closingDays);
      // clientName fallback
      if (!form.getValues('clientName')) {
        const cn = (selectedSide === 'listing' ? f.sellerName : f.buyerName) || f.buyerName || f.sellerName || '';
        if (cn) form.setValue('clientName', cn as string);
      }
      // Extra notes — commercial-specific fields
      const extraNotes: string[] = [];
      if (f.legalDescription) extraNotes.push(`Legal Description: ${f.legalDescription}`);
      if (f.approximateLotSize) extraNotes.push(`Approximate Lot Size: ${f.approximateLotSize}`);
      if (f.mineralRights && f.mineralRights !== 'not_mentioned') extraNotes.push(`Mineral Rights: ${f.mineralRights}`);
      if (f.surveyResponsibility) extraNotes.push(`Survey Responsibility: ${f.surveyResponsibility}`);
      if (f.loanType) extraNotes.push(`Loan Type: ${f.loanType}`);
      if (f.loanAmount) extraNotes.push(`Loan Amount: $${Number(f.loanAmount).toLocaleString()}`);
      if (f.downPaymentAmount) extraNotes.push(`Down Payment: $${Number(f.downPaymentAmount).toLocaleString()}`);
      if (f.financingCommitmentDays && !f.financingCommitmentDeadline) extraNotes.push(`Final Loan Commitment: ${f.financingCommitmentDays} days after Effective Date (calendar date requires the effective date)`);
      if (f.titleCurativeDays) extraNotes.push(`Title Curative Period: ${f.titleCurativeDays} days`);
      if (f.serviceContractDisclosureDays) extraNotes.push(`Service Contract Disclosure: ${f.serviceContractDisclosureDays} days`);
      if (f.depositDueDays) extraNotes.push(`Deposit Due: ${f.depositDueDays} days after Effective Date`);
      if (f.commissionNotes) extraNotes.push(`Commission: ${f.commissionNotes}`);
      if (f.sellerEmail) extraNotes.push(`Seller Email: ${f.sellerEmail}`);
      if (f.buyerEmail) extraNotes.push(`Buyer Email: ${f.buyerEmail}`);
      if (f.additionalTerms && f.additionalTerms !== 'No Additional Terms.') extraNotes.push(`Additional Terms:\n${f.additionalTerms}`);
      if (f.notes) extraNotes.push(f.notes as string);
      if (extraNotes.length > 0) {
        const existing = form.getValues('notes') || '';
        form.setValue('notes', (existing ? existing + '\n\n' : '') + '[Commercial Agreement – AI Extracted]\n' + extraNotes.join('\n'));
      }
      // Auto-save the uploaded PDF as a transaction document
      if (data.savedDoc) {
        setUploadedDocs(prev => {
          const alreadyExists = prev.some((d: UploadedDoc) => d.storagePath === data.savedDoc.storagePath);
          return alreadyExists ? prev : [data.savedDoc as UploadedDoc, ...prev];
        });
      }
      setPdfStep('form');
      const filledCount = Object.values(conf).filter(v => (v as number) >= 0.7).length;
      toast({ title: '✅ Commercial agreement scanned', description: `${filledCount} fields auto-filled. Review highlighted fields before submitting.` });
    } catch (err: any) {
      toast({ title: 'Extraction error', description: err.message, variant: 'destructive' });
      setPdfStep('form');
    }
  };

  // ── MLS Input Form upload handler ──────────────────────────────────────────
  const handleMlsPdfUpload = async (file: File) => {
    if (!user) return;
    setPdfStep('extracting');
    setMlsPdfName(file.name);
    try {
      const token = await user.getIdToken();
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/agent/parse-mls-input-form', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast({ title: 'Extraction failed', description: data.error || 'Could not read the MLS form. Please fill manually.', variant: 'destructive' });
        setPdfStep('form');
        return;
      }
      const f = data.fields || {};
      const conf = data.confidence || {};
      setPdfConfidence(conf);
      const lowConf = new Set<string>(Object.entries(conf).filter(([, v]) => (v as number) < 0.7 && (v as number) > 0).map(([k]) => k));
      setPdfHighlightFields(lowConf);
      const setIfPresent = (key: string, val: unknown) => {
        if (val !== null && val !== undefined && val !== '') form.setValue(key as any, val as any);
      };
      // Convert MM/DD/YYYY or M/D/YYYY → YYYY-MM-DD for HTML date inputs
      const toInputDate = (raw: unknown): string => {
        if (!raw || typeof raw !== 'string') return '';
        const trimmed = raw.trim();
        // Already in YYYY-MM-DD format
        if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
        // MM/DD/YYYY or M/D/YYYY
        const parts = trimmed.split('/');
        if (parts.length === 3) {
          const [m, d, y] = parts;
          if (y.length === 4) {
            return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
          }
        }
        return '';
      };
      // Core address & price
      setIfPresent('address', f.address);
      setIfPresent('listPrice', f.listPrice);
      const listingDateConverted = toInputDate(f.listingDate);
      const expirationDateConverted = toInputDate(f.expirationDate);
      setIfPresent('listingDate', listingDateConverted);
      setIfPresent('listingExpirationDate', expirationDateConverted);
      // Seller info
      if (f.sellerName) form.setValue('clientName', f.sellerName as string);
      setIfPresent('clientPhone', f.sellerPhone);
      // Closing type — always listing for MLS form
      form.setValue('closingType', 'listing');
      form.setValue('clientType', 'seller');
      form.setValue('dealType', (f.dealType as any) || 'residential_sale');
      // Extra details → notes
      const extraNotes: string[] = [];
      if (f.bedrooms) extraNotes.push(`Bedrooms: ${f.bedrooms}`);
      if (f.bathsFull) extraNotes.push(`Baths Full: ${f.bathsFull}`);
      if (f.bathsHalf) extraNotes.push(`Baths Half: ${f.bathsHalf}`);
      if (f.sqftLiving) extraNotes.push(`SqFt Living: ${f.sqftLiving}`);
      if (f.yearBuilt) extraNotes.push(`Year Built: ${f.yearBuilt}`);
      if (f.acres) extraNotes.push(`Acres: ${f.acres}`);
      if (f.subdivision) extraNotes.push(`Subdivision: ${f.subdivision}`);
      if (f.floodZone) extraNotes.push(`Flood Zone: ${f.floodZone}`);
      if (f.legalDescription) extraNotes.push(`Legal Description: ${f.legalDescription}`);
      if (f.architecturalStyle) extraNotes.push(`Style: ${f.architecturalStyle}`);
      if (f.propertyCondition) extraNotes.push(`Condition: ${f.propertyCondition}`);
      if (f.hoaFee != null && Number(f.hoaFee) > 0) extraNotes.push(`HOA Fee: $${Number(f.hoaFee).toLocaleString()} ${f.hoaFeeTerms || ''}`.trim());
      if (f.hasPool) extraNotes.push('Pool: Yes');
      if (f.hasSepticSystem) extraNotes.push('Septic System: Yes');
      if (f.hasPrivateWell) extraNotes.push('Private Well: Yes');
      if (f.financing) extraNotes.push(`Financing: ${f.financing}`);
      if (f.remarks) extraNotes.push(`MLS Remarks:\n${f.remarks}`);
      if (extraNotes.length > 0) {
        const existing = form.getValues('notes') || '';
        form.setValue('notes', (existing ? existing + '\n\n' : '') + '[MLS Input Form]\n' + extraNotes.join('\n'));
      }
      // Auto-save the uploaded PDF as a transaction document
      if (data.savedDoc) {
        setUploadedDocs(prev => {
          const alreadyExists = prev.some((d: UploadedDoc) => d.storagePath === data.savedDoc.storagePath);
          return alreadyExists ? prev : [data.savedDoc as UploadedDoc, ...prev];
        });
      }
      setPdfStep('form');
      toast({ title: '✅ MLS Input Form scanned', description: `${Object.values(conf).filter(v => (v as number) >= 0.7).length} fields auto-filled. Review before submitting.` });
    } catch (err: any) {
      toast({ title: 'Extraction error', description: err.message, variant: 'destructive' });
      setPdfStep('form');
    }
  };

  const handleDocUpload = async (files: FileList | null) => {
    if (!files || !user) return;
    setDocUploading(true);
    try {
      const token = await user.getIdToken();
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append('file', file);
        const res = await fetch('/api/agent/transactions/upload-document', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: fd,
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          toast({ title: 'Upload failed', description: data.error || 'Unknown error', variant: 'destructive' });
        } else {
          setUploadedDocs((prev) => [
            ...prev,
            { name: data.name, url: data.url, storagePath: data.storagePath, uploadedAt: data.uploadedAt },
          ]);
        }
      }
    } catch (err: any) {
      toast({ title: 'Upload error', description: err.message, variant: 'destructive' });
    } finally {
      setDocUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeDoc = (storagePath: string) => {
    setUploadedDocs((prev) => prev.filter((d) => d.storagePath !== storagePath));
  };

  // Draft auto-save
  const DRAFT_KEY = 'sb_add_transaction_draft';
  const [hasDraft, setHasDraft] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(urlDraftId);

  // Commission auto-calculation state
  const [agentCommission, setAgentCommission] = useState<AgentCommissionData | null>(null);
  const [commissionLoading, setCommissionLoading] = useState(false);
  const [activeTier, setActiveTier] = useState<CommissionTier | null>(null);
  const [viewerIsCoAgent, setViewerIsCoAgent] = useState(false);
  const [viewerParticipantAllocation, setViewerParticipantAllocation] = useState<Record<string, any> | null>(null);
  const [viewerAgentId, setViewerAgentId] = useState('');
  const [participantAllocations, setParticipantAllocations] = useState<Record<string, any> | null>(null);
  const [coAgentViewerCommission, setCoAgentViewerCommission] = useState<AgentCommissionData | null>(null);
  const commissionManualOverride = useRef(false);
  // Saved transaction-specific overrides must survive the profile lookup in edit mode.
  const editCommissionOverride = useRef(false);
  // Tracks a newly entered manual percentage split for the current save attempt.
  // It is intentionally separate from a manual-dollar override, which clears both %s.
  const manualPercentageSplitEdited = useRef(false);

  // Commission mode toggle: 'percent' = % of sale price, 'flat' = flat dollar amount
  const [commissionMode, setCommissionMode] = useState<'percent' | 'flat'>('percent');
  const toggleCommissionMode = () => {
    const next = commissionMode === 'percent' ? 'flat' : 'percent';
    setCommissionMode(next);
    form.setValue('commissionMode', next);
    // Clear seller-paying fields when switching modes to avoid misinterpretation
    form.setValue('sellerPayingListingAgent', '' as any);
    form.setValue('sellerPayingBuyerAgent', '' as any);
    commPctManuallyEdited.current = false;
    gciManuallyEdited.current = false;
    manualPercentageSplitEdited.current = false;
  };
  // Extra buyer/seller visibility state
  const [showBuyer3, setShowBuyer3] = useState(false);
  const [showBuyer4, setShowBuyer4] = useState(false);
  const [showSeller3, setShowSeller3] = useState(false);
  const [showSeller4, setShowSeller4] = useState(false);

  // Collapsible listing-only sections (collapsed by default)
  const [mediaOrderOpen, setMediaOrderOpen] = useState(false);
  const [mlsDescriptionOpen, setMlsDescriptionOpen] = useState(false);
  const [mlsBrainDump, setMlsBrainDump] = useState('');
  const [mlsGenerating, setMlsGenerating] = useState(false);
  const [signOrderOpen, setSignOrderOpen] = useState(false);
  const [showingTimeOpen, setShowingTimeOpen] = useState(false);
  const [stagingOpen, setStagingOpen] = useState(false);

  // Staging request state
  type Stager = { id: string; name: string; email: string | null; phone: string | null; company: string | null };
  const [stagers, setStagers] = useState<Stager[]>([]);
  const [stagersLoading, setStagersLoading] = useState(false);
  const [stagingRequestData, setStagingRequestData] = useState({
    stagerId: '',
    serviceType: '',
    coordinateWith: '',
    photographerDate: '',
    consultationDate: '',
    consultationTime: '',
    paymentMethod: '',
    currentlyOnMarket: '',
    targetedMarketDate: '',
    homeStyle: '',
    occupancy: '',
    reasonForSelling: '',
    specialNotes: '',
  });
  const [stagingSubmitting, setStagingSubmitting] = useState(false);
  const [stagingSent, setStagingSent] = useState(false);
  const [stagingError, setStagingError] = useState('');

  // ── Inspection vendor state ──────────────────────────────────────────────
  type InspVendor = { id: string; name: string; email: string | null; phone: string | null; company: string | null };
  const [inspVendors, setInspVendors] = useState<Record<string, InspVendor[]>>({});
  const [inspVendorsLoading, setInspVendorsLoading] = useState(false);
  // Inline add-inspector form state
  const [addInspectorFor, setAddInspectorFor] = useState<string | null>(null); // inspection key
  const [newInspForm, setNewInspForm] = useState({ name: '', company: '', phone: '', email: '' });
  const [addInspectorSaving, setAddInspectorSaving] = useState(false);
  type InspRowState = {
    vendorId: string;
    sendMode: 'selected' | 'all';
    preferredDate: string;
    preferredTimeStart: string;
    preferredTimeEnd: string;
    fallbackDateStart: string;
    fallbackDateEnd: string;
    sent: boolean;
    sending: boolean;
  };
  const INSP_TYPES = [
    { key: 'inspector_general',    label: 'General Home Inspection' },
    { key: 'inspector_roof',       label: 'Roof Inspection' },
    { key: 'inspector_termite',    label: 'Termite Inspection' },
    { key: 'inspector_foundation', label: 'Foundation Inspection' },
    { key: 'inspector_sewer',      label: 'Sewer Inspection' },
    { key: 'inspector_hvac',       label: 'HVAC Inspection' },
    { key: 'inspector_pool',       label: 'Pool Inspection' },
    { key: 'inspector_water_well', label: 'Water Well Inspection' },
    { key: 'inspector_survey',     label: 'Survey' },
    { key: 'inspector_elevation',  label: 'Elevation Certificate' },
    { key: 'inspector_stucco',     label: 'Stucco Inspection' },
  ];
  const makeDefaultInspRow = (): InspRowState => ({
    vendorId: '',
    sendMode: 'selected',
    preferredDate: '',
    preferredTimeStart: '08:00',
    preferredTimeEnd: '17:00',
    fallbackDateStart: new Date().toISOString().split('T')[0],
    fallbackDateEnd: '',
    sent: false,
    sending: false,
  });
  const [inspRows, setInspRows] = useState<Record<string, InspRowState>>(
    () => Object.fromEntries(INSP_TYPES.map(t => [t.key, makeDefaultInspRow()]))
  );
  const updateInspRow = useCallback((key: string, patch: Partial<InspRowState>) => {
    setInspRows(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }, []);

  const { isAdmin: isAdminUser, loading: adminLoading } = useIsAdminLike();
  const isAdmin = isAdminUser && !isImpersonating;
  // TC users (role === 'tc') get the same full commission view as admins
  const { isStaff: isStaffUser, role: staffRole } = useIsStaff();
  const isTC = !isAdmin && staffRole === 'tc';
  // All staff roles, TCs, and admins have the same transaction-edit authority.
  // They must use the authoritative transaction save route rather than the
  // agent-only route, which intentionally filters operational fields.
  const isAdminOrTC = isAdmin || isStaffUser || isTC;
  // An administrator impersonating an agent must receive the same fields,
  // permissions, and safeguards as that agent—not the administrator's own
  // staff/admin capabilities.
  const hasOperationalEditAuthority = isAdminOrTC && !isImpersonating;

  const typeParam = urlSearchParams?.get('type');
  const initialClosingType = typeParam === 'listing' ? 'listing' : 'buyer';

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      agentId: '',
      agentDisplayName: '',
      closingType: initialClosingType as 'buyer' | 'listing' | 'referral' | 'dual',
      dealType: 'residential_sale',
      address: '',
      clientName: '',
      dealSource: '',
      contractDate: '',
      appraisalConditioned: false,
      appraisalPeriodDays: '',
      depositDueDays: '',
      financingCommitmentDays: '',
      closingDays: '',
      inspectionTypes: [],
      sellerPayingListingAgentUnknown: false,
      tcWorking: 'yes',
      hasCoAgent: false,
      coAgentId: '',
      coAgentDisplayName: '',
      coAgentRole: 'co_list',
      primaryAgentSplitPercent: 50,
      coAgentSplitPercent: 50,
      // Buyer transactions always begin with the standard compliance fee. The
      // fee remains fully editable, including payer, before the transaction is
      // saved. Listing-side and legacy edit records retain their saved values.
      txComplianceFee: initialClosingType === 'buyer' ? 'yes' : '',
      txComplianceFeeAmount: initialClosingType === 'buyer' ? 395 : '',
      txComplianceFeePaidBy: initialClosingType === 'buyer' ? 'agent' : '',
      txComplianceFeeAgentAllocation: 'primary_agent',
      txComplianceFeePrimaryAgentAmount: '',
      txComplianceFeeCoAgentAmount: '',
      hasOutboundReferral: false,
    },
  });
  const [, setBrokerFeeDefaults] = useState<{ buyerDefault: number; listingDefault: number } | null>(null);
  const [brokerFeeDefaultsLoaded, setBrokerFeeDefaultsLoaded] = useState(false);

  // Watched values for conditional rendering
  const clientType = form.watch('clientType');
  const watchedClosingType = form.watch('closingType');
  const preListingInspectionTypes = form.watch('preListingInspectionTypes') || [];
  const preListingInspectionOrdered = form.watch('preListingInspectionOrdered');
  const preListingTcScheduleInspections = form.watch('preListingTcScheduleInspections');
  const mediaTypes = form.watch('mediaTypes') || [];
  const signOrderRequested = form.watch('signOrderRequested');
  const signServiceType = form.watch('signServiceType');
  const signAdditionalOptions = form.watch('signAdditionalOptions') || [];
  const showingTimeRequested = form.watch('showingTimeRequested');
  const showingNotesToAgent = form.watch('showingNotesToAgent') || [];
  const showingCallOrder2Notify = form.watch('showingCallOrder2Notify') || [];
  const showingCallOrder3Notify = form.watch('showingCallOrder3Notify') || [];
  const showingNoSameDayAppts = form.watch('showingNoSameDayAppts');
  const inspectionOrdered = form.watch('inspectionOrdered');
  const warrantyAtClosing = form.watch('warrantyAtClosing');
  const txComplianceFee = form.watch('txComplianceFee');
  const txComplianceFeeAmount = Number(form.watch('txComplianceFeeAmount')) || 0;
  const txComplianceFeePaidBy = form.watch('txComplianceFeePaidBy') || '';
  const txComplianceFeeAgentAllocation = form.watch('txComplianceFeeAgentAllocation') || 'primary_agent';
  const txComplianceFeePrimaryAgentAmount = Number(form.watch('txComplianceFeePrimaryAgentAmount')) || 0;
  const txComplianceFeeCoAgentAmount = Number(form.watch('txComplianceFeeCoAgentAmount')) || 0;

  // A user can switch an add form from a listing/referral into a buyer
  // transaction after the initial type selection. Apply the standard $395
  // default only when the fee is still blank, never over an intentional value.
  useEffect(() => {
    if (editMode || watchedClosingType !== 'buyer') return;
    const currentAmount = Number(form.getValues('txComplianceFeeAmount')) || 0;
    if (currentAmount > 0) return;
    form.setValue('txComplianceFee', 'yes');
    form.setValue('txComplianceFeeAmount', 395 as any);
    if (!form.getValues('txComplianceFeePaidBy')) {
      form.setValue('txComplianceFeePaidBy', 'agent');
    }
  }, [editMode, watchedClosingType]);
  const shortageInCommission = form.watch('shortageInCommission');
  const shortageAmount = Number(form.watch('shortageAmount')) || 0;
  const shortageHandledBy = form.watch('shortageHandledBy') || '';
  const warrantyAmount = Number(form.watch('warrantyAmount')) || 0;
  const warrantyPaidBy = form.watch('warrantyPaidBy') || '';
  const tcScheduleInspections = form.watch('tcScheduleInspections');
  const occupancyAgreement = form.watch('occupancyAgreement');
  const inspectionTypes = form.watch('inspectionTypes') || [];
  const watchedStatus = form.watch('status');
  const watchedDealType = form.watch('dealType');
  // Agents may review closed files, but only admin, staff, and TC users may
  // correct them. An impersonated admin is intentionally treated as an agent
  // here so the agent view cannot bypass the same permission rule.
  const isClosedAgentView = editMode && persistedEditStatus === 'closed' && !hasOperationalEditAuthority;
  const isListingSideTransaction = watchedClosingType === 'listing' || watchedClosingType === 'dual';
  const isActiveListing = watchedStatus === 'active' && isListingSideTransaction;
  // When a listing goes pending/under_contract, reveal all buyer/contract fields on the same form
  const PENDING_STATUSES = ['pending', 'under_contract', 'closed'];
  const isPendingListing = watchedClosingType === 'listing' && PENDING_STATUSES.includes(watchedStatus as string);
  const isCommercialListing = watchedDealType === 'commercial_listing';

  // Commercial lease state
  const [commLeaseMode, setCommLeaseMode] = useState<'percent' | 'flat'>('percent');
  const watchedCommForLease = form.watch('commercialForLease');
  const watchedCommForSale = form.watch('commercialForSale');
  const watchedCommLeaseMonthly = form.watch('commercialLeaseMonthly');
  const watchedCommLeaseTerm = form.watch('commercialLeaseTerm');
  const watchedCommLeasePct = form.watch('commercialLeaseCommissionPct');
  const watchedCommLeaseFlat = form.watch('commercialLeaseCommissionFlat');

  // Auto-sync clientType from closingType so the Buyer/Seller section shows the right contacts
  useEffect(() => {
    const map: Record<string, 'buyer' | 'seller' | 'dual'> = {
      buyer: 'buyer',
      listing: 'seller',
      dual: 'dual',
    };
    const derived = map[watchedClosingType];
    if (derived) form.setValue('clientType', derived);
    // For referral, leave clientType blank — buyer/seller section is hidden
  }, [watchedClosingType]);

  // Seller info is only relevant when NOT purely buyer-side and NOT referral
  // closingType: 'buyer' → hide seller; 'listing' | 'dual' → show seller; 'referral' → hide all
  const showSellerInfo = watchedClosingType === 'listing' || watchedClosingType === 'dual';

  // Co-agent watched values
  const hasCoAgent = form.watch('hasCoAgent');
  const watchedPrimaryPct = Number(form.watch('primaryAgentSplitPercent') || 0);
  const watchedCoPct = Number(form.watch('coAgentSplitPercent') || 0);
  const splitTotal = watchedPrimaryPct + watchedCoPct;

  const primaryAgentFeeShare = (() => {
    if (txComplianceFee !== 'yes' || txComplianceFeePaidBy !== 'agent') return 0;
    if (!hasCoAgent || txComplianceFeeAgentAllocation === 'primary_agent') return txComplianceFeeAmount;
    if (txComplianceFeeAgentAllocation === 'co_agent') return 0;
    if (txComplianceFeeAgentAllocation === 'split_equal') return Math.round((txComplianceFeeAmount / 2) * 100) / 100;
    return Math.min(txComplianceFeeAmount, txComplianceFeePrimaryAgentAmount);
  })();

  const coAgentFeeShare = (() => {
    if (txComplianceFee !== 'yes' || txComplianceFeePaidBy !== 'agent' || !hasCoAgent) return 0;
    if (txComplianceFeeAgentAllocation === 'co_agent') return txComplianceFeeAmount;
    if (txComplianceFeeAgentAllocation === 'split_equal') return Math.round((txComplianceFeeAmount - primaryAgentFeeShare) * 100) / 100;
    if (txComplianceFeeAgentAllocation === 'custom') return Math.round((txComplianceFeeAmount - primaryAgentFeeShare) * 100) / 100;
    return 0;
  })();

  // Legacy shared files may have a co-agent name that survived an older save path
  // while the read response is still resolving identity. During an admin's explicit
  // agent impersonation, the selected co-agent name is a safe display-only fallback.
  // It never changes the transaction's primary-agent fields or saved ownership.
  const selectedCoAgentId = String(form.watch('coAgentId') || '').trim();
  const resolvedViewerId = String(viewerAgentId || effectiveUid || '').trim();
  const normalizedViewerName = String(effectiveName || '').trim().toLowerCase();
  const normalizedCoAgentName = String(form.watch('coAgentDisplayName') || '').trim().toLowerCase();
  const isCanonicalCoAgentView = Boolean(
    hasCoAgent &&
    resolvedViewerId &&
    selectedCoAgentId &&
    resolvedViewerId === selectedCoAgentId
  );
  const isLegacyImpersonatedCoAgentView = Boolean(
    isImpersonating &&
    hasCoAgent &&
    normalizedViewerName &&
    normalizedCoAgentName &&
    normalizedViewerName === normalizedCoAgentName
  );
  const shouldUseCoAgentPreview = viewerIsCoAgent || isCanonicalCoAgentView || isLegacyImpersonatedCoAgentView;

  // A shared file always keeps the primary agent's transaction fields intact. When the
  // current viewer is the co-agent, load that viewer's own profile separately for a
  // display-only preview; never overwrite the primary agent's saved split fields.
  useEffect(() => {
    const commissionProfileId = viewerAgentId || effectiveUid;
    if (!shouldUseCoAgentPreview || !user || !commissionProfileId) {
      setCoAgentViewerCommission(null);
      return;
    }
    let cancelled = false;
    const loadViewerCommission = async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch(`/api/admin/agent-profiles/${commissionProfileId}/commission`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!cancelled && data.ok) setCoAgentViewerCommission(data);
      } catch {
        if (!cancelled) setCoAgentViewerCommission(null);
      }
    };
    loadViewerCommission();
    return () => { cancelled = true; };
  }, [shouldUseCoAgentPreview, viewerAgentId, user, effectiveUid]);

  // Some established transactions hold only a legacy co-listing name. Once the
  // agent list is available, resolve that name to the current canonical ID so a
  // later save preserves both the relationship and downstream split processing.
  useEffect(() => {
    if (!hasCoAgent || agentsLoading) return;
    const existingId = String(form.getValues('coAgentId') || '');
    const displayName = String(form.getValues('coAgentDisplayName') || '').trim();
    if (existingId || !displayName) return;
    const match = agents.find(
      a => String(a.agentName || '').trim().toLowerCase() === displayName.toLowerCase()
    );
    if (match?.agentId) form.setValue('coAgentId', match.agentId, { shouldDirty: false });
  }, [hasCoAgent, agents, agentsLoading, form]);

  // Outbound referral fee watched values
  const hasOutboundReferral = form.watch('hasOutboundReferral');
  const watchedReferralPct = Number(form.watch('outboundReferralFeePercent') || 0);
  const watchedReferralDollar = Number(form.watch('outboundReferralFeeDollar') || 0);

  // Watched values for commission auto-calc
  const watchedSalePrice = form.watch('salePrice');
  const watchedCommPct = form.watch('commissionPercent');
  const watchedCBP = form.watch('commissionBasePrice');
  const watchedSellerPayingListing = form.watch('sellerPayingListingAgent');
  const watchedSellerPayingBuyer = form.watch('sellerPayingBuyerAgent');
  const watchedListPrice = form.watch('listPrice');

  const cbpManuallyEdited = useRef(false);
  const commPctManuallyEdited = useRef(false);
  // When the user types a GCI value directly, lock it so CBP×pct auto-calc won't overwrite it.
  const gciManuallyEdited = useRef(false);

  useEffect(() => {
    if (cbpManuallyEdited.current) return;
    const sp = Number(watchedSalePrice) || 0;
    const lp = Number(watchedListPrice) || 0;
    const currentStatus = form.getValues('status') as string || '';
    const isActiveListing = ['active', 'coming_soon', 'temp_off_market'].includes(currentStatus);
    if (sp > 0) {
      // Sale price is set — always use it as commission base
      form.setValue('commissionBasePrice', sp as any);
    } else if (isActiveListing && lp > 0) {
      // Active listing with no sale price — use list price as estimated base
      form.setValue('commissionBasePrice', lp as any);
    }
  }, [watchedSalePrice, watchedListPrice]);

  useEffect(() => {
    // Only auto-fill commissionPercent when in percent mode
    if (commPctManuallyEdited.current || commissionMode === 'flat') return;
    const listingPct = Number(watchedSellerPayingListing) || 0;
    const buyerPct = Number(watchedSellerPayingBuyer) || 0;
    let autoPct = 0;
    if (watchedClosingType === 'listing') autoPct = listingPct;
    else if (watchedClosingType === 'buyer') autoPct = buyerPct;
    else if (watchedClosingType === 'dual') autoPct = listingPct + buyerPct;
    if (autoPct > 0) form.setValue('commissionPercent', autoPct as any);
  }, [watchedClosingType, watchedSellerPayingListing, watchedSellerPayingBuyer, commissionMode]);

  useEffect(() => {
    // Skip if user has manually typed a GCI — their value takes priority over auto-calc.
    if (gciManuallyEdited.current) return;
    const cbp = Number(watchedCBP) || 0;
    const pct = Number(watchedCommPct) || 0;
    if (cbp > 0 && pct > 0) {
      // Base commission from seller (CBP × %)
      const baseGCI = resolveGCI({ commissionBasePrice: cbp, commissionPercent: pct });
      // Add shortage if buyer is paying directly or through seller closing cost
      const shortageAddsToGCI = ['buyer', 'seller_closing_cost'].includes(
        form.getValues('shortageHandledBy') || ''
      );
      const shortageAdd = (form.getValues('shortageInCommission') === 'yes' && shortageAddsToGCI)
        ? (Number(form.getValues('shortageAmount')) || 0)
        : 0;
      // Add tx compliance fee if buyer is paying directly or through seller closing cost
      const txFeeAddsToGCI = ['buyer', 'seller_closing_cost'].includes(
        form.getValues('txComplianceFeePaidBy') || ''
      );
      const txFeeAdd = (form.getValues('txComplianceFee') === 'yes' && txFeeAddsToGCI)
        ? (Number(form.getValues('txComplianceFeeAmount')) || 0)
        : 0;
      // Add warranty if buyer is paying directly or through seller closing cost
      const warrantyAddsToGCI = ['buyer', 'seller_closing_cost'].includes(
        form.getValues('warrantyPaidBy') || ''
      );
      const warrantyAdd = (form.getValues('warrantyAtClosing') === 'yes' && warrantyAddsToGCI)
        ? (Number(form.getValues('warrantyAmount')) || 0)
        : 0;
      // If agent absorbs warranty → deduct from GCI BEFORE split (reduces the base the split is calculated on)
      const warrantyAgentAbsorbs = form.getValues('warrantyAtClosing') === 'yes' && form.getValues('warrantyPaidBy') === 'agent';
      const warrantyDeductFromGCI = warrantyAgentAbsorbs ? (Number(form.getValues('warrantyAmount')) || 0) : 0;
      const calcGCI = baseGCI + shortageAdd + txFeeAdd + warrantyAdd - warrantyDeductFromGCI;
      form.setValue('gci', calcGCI as any);
    }
  }, [watchedCBP, watchedCommPct, shortageInCommission, shortageAmount, shortageHandledBy, txComplianceFee, txComplianceFeeAmount, txComplianceFeePaidBy, warrantyAtClosing, warrantyAmount, warrantyPaidBy]);

  // Commercial lease auto-calc: monthly × 12 × term = total lease value; then GCI
  useEffect(() => {
    const monthly = Number(watchedCommLeaseMonthly) || 0;
    const term = Number(watchedCommLeaseTerm) || 0;
    if (monthly > 0 && term > 0) {
      const totalLease = monthly * 12 * term;
      form.setValue('commercialTotalLeaseValue', totalLease as any);
      if (commLeaseMode === 'percent') {
        const pct = Number(watchedCommLeasePct) || 0;
        if (pct > 0) {
          const gci = totalLease * (pct / 100);
          form.setValue('commercialLeaseGci', gci as any);
          form.setValue('commercialLeaseEffectivePct', pct as any);
        }
      } else {
        const flat = Number(watchedCommLeaseFlat) || 0;
        if (flat > 0) {
          form.setValue('commercialLeaseGci', flat as any);
          const effPct = totalLease > 0 ? (flat / totalLease) * 100 : 0;
          form.setValue('commercialLeaseEffectivePct', parseFloat(effPct.toFixed(2)) as any);
        }
      }
    }
  }, [watchedCommLeaseMonthly, watchedCommLeaseTerm, watchedCommLeasePct, watchedCommLeaseFlat, commLeaseMode]);

  // Admin/TC: live recalculate agentDollar and brokerGci when percentages change manually
  // This fires even when commissionManualOverride is true (intentional — admin is changing the split)
  const watchedAgentPct = form.watch('agentPct');
  const watchedBrokerPct = form.watch('brokerPct');
  const watchedGci = form.watch('gci');
  useEffect(() => {
    if (!hasOperationalEditAuthority) return;
    const gci = Number(watchedGci) || 0;
    if (gci <= 0) return;
    const agentPctNum = Number(watchedAgentPct) || 0;
    const brokerPctNum = Number(watchedBrokerPct) || 0;
    // Only recalculate the dollar if the percent was explicitly changed (non-zero)
    if (agentPctNum > 0) {
      const agentDollar = Number((gci * (agentPctNum / 100)).toFixed(2));
      form.setValue('agentDollar', agentDollar as any, { shouldDirty: false });
    }
    if (brokerPctNum > 0) {
      const brokerGci = Number((gci * (brokerPctNum / 100)).toFixed(2));
      form.setValue('brokerGci', brokerGci as any, { shouldDirty: false });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedAgentPct, watchedBrokerPct, watchedGci, hasOperationalEditAuthority]);

  // Admin: load agent list
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setAgentsLoading(true);
      try {
        const token = await user.getIdToken();
        // Admins use the full admin endpoint; agents use the agent-accessible endpoint
        const endpoint = isAdmin
          ? '/api/admin/agents?source=profiles'
          : '/api/agent/agents-list';
        const res = await fetch(endpoint, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.ok) setAgents(data.agents ?? []);
      } catch {}
      finally { setAgentsLoading(false); }
    };
    load();
  }, [user, isAdmin]);

  // Load stagers list
  useEffect(() => {
    if (!user) return;
    const loadStagers = async () => {
      setStagersLoading(true);
      try {
        const token = await user.getIdToken();
        const res = await fetch('/api/admin/vendors?category=stager', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.ok) setStagers((data.vendors ?? []).filter((v: any) => v.active !== false));
      } catch {}
      finally { setStagersLoading(false); }
    };
    loadStagers();
  }, [user]);

  // Add a new inspector inline from the inspection card
  const addInspectorInline = async (inspKey: string) => {
    if (!newInspForm.name.trim()) return;
    if (!user) return;
    setAddInspectorSaving(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/vendors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: newInspForm.name.trim(),
          company: newInspForm.company.trim() || null,
          phone: newInspForm.phone.trim() || null,
          email: newInspForm.email.trim() || null,
          category: inspKey, // e.g. 'inspector_pool', 'inspector_general', etc.
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: 'Could not add inspector', description: data.error, variant: 'destructive' });
        return;
      }
      // Add to local vendor list and auto-select
      const newVendor = { id: data.id, name: newInspForm.name.trim(), company: newInspForm.company.trim() || null } as InspVendor;
      setInspVendors(prev => ({
        ...prev,
        [inspKey]: [...(prev[inspKey] || []), newVendor].sort((a, b) => a.name.localeCompare(b.name)),
      }));
      updateInspRow(inspKey, { vendorId: data.id });
      setAddInspectorFor(null);
      setNewInspForm({ name: '', company: '', phone: '', email: '' });
      toast({ title: 'Inspector added', description: `${newInspForm.name} added and selected.` });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setAddInspectorSaving(false);
    }
  };

  // Load inspection vendors (all inspector categories at once)
  useEffect(() => {
    if (!user) return;
    const loadInspVendors = async () => {
      setInspVendorsLoading(true);
      try {
        const token = await user.getIdToken();
        const res = await fetch('/api/admin/vendors?category=inspector_all', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.ok && data.vendors) {
          // Group by category
          const grouped: Record<string, InspVendor[]> = {};
          for (const v of data.vendors) {
            if (!grouped[v.category]) grouped[v.category] = [];
            grouped[v.category].push(v);
          }
          setInspVendors(grouped);
        }
      } catch {}
      finally { setInspVendorsLoading(false); }
    };
    loadInspVendors();
  }, [user]);

  // Pre-fill agent — wait for admin check to resolve before pre-filling.
  // Without this guard, staff/admin users (e.g. office_admin) would get their
  // Firebase UID pre-filled as agentId during the loading window when isAdmin
  // is temporarily false, poisoning the form before the agent picker appears.
  useEffect(() => {
    if (!user) return;
    if (adminLoading) return; // Wait until we know if this user is admin or not
    // In edit mode, agentId is already loaded from the transaction document — don't overwrite it
    if (editMode) return;
    if (isImpersonating && effectiveUid && effectiveName) {
      form.setValue('agentId', effectiveUid);
      form.setValue('agentDisplayName', effectiveName);
    } else if (!isAdmin) {
      // Only pre-fill with user.uid for confirmed non-admin users (regular agents)
      form.setValue('agentId', user.uid);
      form.setValue('agentDisplayName', user.displayName || user.email || user.uid);
    }
    // For admins adding a NEW transaction: leave agentId empty — they must select from the agent picker
  }, [user, isAdmin, adminLoading, isImpersonating, effectiveUid, effectiveName, editMode]);

  // Fetch agent commission structure
  const watchedAgentId = form.watch('agentId');
  // Broker defaults apply only to new files. Existing files retain their saved fee
  // decision, including an explicit "No", regardless of a profile/tier default.
  useEffect(() => {
    if (!user || editMode) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await user.getIdToken();
        const response = await fetch('/api/admin/transaction-fee-settings', { headers: { Authorization: `Bearer ${token}` } });
        const data = await response.json();
        if (!response.ok || !data.ok || cancelled) return;
        const defaults = data.settings as { buyerDefault: number; listingDefault: number };
        setBrokerFeeDefaults(defaults);
        const fee = watchedClosingType === 'listing' || watchedClosingType === 'dual'
          ? Number(defaults.listingDefault || 0)
          : Number(defaults.buyerDefault || 0);
        form.setValue('txComplianceFee', fee > 0 ? 'yes' : 'no');
        form.setValue('txComplianceFeeAmount', fee > 0 ? fee as any : '');
        form.setValue('txComplianceFeePaidBy', fee > 0 ? (form.getValues('txComplianceFeePaidBy') || 'agent') : '');
      } catch {
        // Existing hard-coded new-buyer default remains a safe fallback if settings are unavailable.
      } finally {
        if (!cancelled) setBrokerFeeDefaultsLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [user, editMode, watchedClosingType]);

  useEffect(() => {
    if (!user || !watchedAgentId) {
      setAgentCommission(null);
      setActiveTier(null);
      return;
    }
    let cancelled = false;
    const fetchCommission = async () => {
      setCommissionLoading(true);
      // Preserve a saved per-transaction split while this profile lookup finishes.
      commissionManualOverride.current = editCommissionOverride.current;
      try {
        const token = await user.getIdToken();
        const res = await fetch(`/api/admin/agent-profiles/${watchedAgentId}/commission`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!cancelled && data.ok) {
          setAgentCommission(data);
          if (!editMode && !brokerFeeDefaultsLoaded && !editCommissionOverride.current && data.defaultTransactionFee != null && data.defaultTransactionFee > 0) {
            form.setValue('txComplianceFee', 'yes');
            form.setValue('txComplianceFeeAmount', data.defaultTransactionFee as any);
            // Default to agent-pays so the math is conservative
            if (!form.getValues('txComplianceFeePaidBy')) {
              form.setValue('txComplianceFeePaidBy', 'agent');
            }
          }
        }
      } catch {}
      finally { if (!cancelled) setCommissionLoading(false); }
    };
    fetchCommission();
    return () => { cancelled = true; };
  }, [user, isAdmin, watchedAgentId, editMode, brokerFeeDefaultsLoaded]);

  // Auto-calculate commission split
  const watchedGCI = form.watch('gci');
  useEffect(() => {
    if (!agentCommission || commissionManualOverride.current) return;
    const grossGci = Number(watchedGCI) || 0;
    if (grossGci <= 0) { setActiveTier(null); return; }

    // ── Outbound referral fee deduction ─────────────────────────────────────
    // The referral fee is paid off the top before the broker/agent split.
    // e.g. $3,000 GCI × 25% referral = $750 fee → $2,250 net for split.
    const referralPct = Number(form.getValues('outboundReferralFeePercent') || 0);
    const referralDollarOverride = Number(form.getValues('outboundReferralFeeDollar') || 0);
    const hasReferral = form.getValues('hasOutboundReferral');
    let referralFee = 0;
    if (hasReferral && referralPct > 0) {
      // Auto-calculate from pct; if user manually entered a dollar amount use that instead
      const autoDollar = Math.round(grossGci * (referralPct / 100) * 100) / 100;
      referralFee = referralDollarOverride > 0 ? referralDollarOverride : autoDollar;
      // Keep the dollar field in sync
      form.setValue('outboundReferralFeeDollar', referralFee as any);
    }
    const netGci = Math.max(0, grossGci - referralFee);

    // Tier lookup uses the full gross GCI (per knowledge base: tier lookup on full GCI)
    const ytd = agentCommission.ytdTierProgressionGci ?? agentCommission.ytdTierProgressionCompanyDollar ?? 0;
    const tierLookupAmount = ytd > 0 ? ytd : grossGci;
    const tier = findActiveTier(agentCommission.tiers, tierLookupAmount);
    setActiveTier(tier);
    if (tier) {
      // For team members on a team WITH a leader, the tier's agentSplitPercent is already
      // the EFFECTIVE % of full GCI (leaderPercent × memberPercent / 100), so the formula
      // agentNet = netGci × agentSplitPercent is correct for all agent types.
      const agentPct = tier.agentSplitPercent;    // Effective % of full GCI
      const brokerPct = tier.companySplitPercent;  // Company's % of full GCI
      // Split is applied to netGci (after referral fee deduction)
      const agentGross = Number((netGci * (agentPct / 100)).toFixed(2));
      const brokerGci = Number((netGci * (brokerPct / 100)).toFixed(2));
      const txFee = tier.transactionFee ?? agentCommission.defaultTransactionFee ?? 0;

      // Set fee fields first so we can read them back for the deduction
      if (!editMode && !brokerFeeDefaultsLoaded && txFee > 0) {
        form.setValue('txComplianceFee', 'yes');
        form.setValue('txComplianceFeeAmount', txFee as any);
        if (!form.getValues('txComplianceFeePaidBy')) {
          form.setValue('txComplianceFeePaidBy', 'agent');
        }
      }

      // ── Agent-paid compliance fee deduction ──────────────────────────────
      // If the agent is paying the transaction/listing fee personally, subtract
      // it from their net so agentDollar reflects what they actually take home.
      // This matches the deduction applied at TC approval and in the admin edit form.
      // Tier lookup and broker split are NOT affected by this deduction.
      const currentFeePaidBy = String(form.getValues('txComplianceFeePaidBy') || '').toLowerCase().trim();
      const currentFeeEnabled = form.getValues('txComplianceFee') === 'yes';
      const currentFeeAmt = Number(form.getValues('txComplianceFeeAmount')) || 0;
      const agentPaysThisFee = currentFeeEnabled && currentFeeAmt > 0 && currentFeePaidBy === 'agent';
      // Always store agentGross (before fee) in agentDollar.
      // The fee deduction is shown in the "You Take Home" display card
      // and applied to splitSnapshot.agentNetCommission at save time.
      // Storing agentNet here caused a double-deduction.

      form.setValue('agentPct', agentPct as any);
      form.setValue('brokerPct', brokerPct as any);
      form.setValue('agentDollar', agentGross as any);
      form.setValue('brokerGci', brokerGci as any);
    }
  }, [watchedGCI, agentCommission, watchedReferralPct, watchedReferralDollar, hasOutboundReferral, txComplianceFee, txComplianceFeeAmount, txComplianceFeePaidBy, editMode, brokerFeeDefaultsLoaded]);

  // Sync additionalComments → notes
  const watchedAdditionalComments = form.watch('additionalComments');
  useEffect(() => {
    form.setValue('notes', watchedAdditionalComments || '');
  }, [watchedAdditionalComments]);

    // ── Load draft from URL param (?draft=draftId) ────────────────────────────
  useEffect(() => {
    if (!urlDraftId || !user || draftRestored) return;
    const loadDraft = async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch(`/api/agent/drafts/${urlDraftId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          toast({ title: 'Draft not found', description: 'Could not load the draft.', variant: 'destructive' });
          return;
        }
        const values = data.fields || {};
        Object.entries(values).forEach(([key, val]) => {
          if (val !== undefined && val !== null && val !== '') {
            form.setValue(key as any, val as any);
          }
        });
        setActiveDraftId(urlDraftId);
        setDraftRestored(true);
        setHasDraft(false);
        toast({ title: 'Draft loaded', description: 'Your saved draft has been restored.' });
      } catch (err: any) {
        toast({ title: 'Error loading draft', description: err.message, variant: 'destructive' });
      }
    };
    loadDraft();
  }, [urlDraftId, user]);

  // ── Load existing transaction for edit mode (?edit=txId) ─────────────────────
  const [editLoaded, setEditLoaded] = useState(false);
  const [legacySideNeedsReview, setLegacySideNeedsReview] = useState(false);
  const legacySideResolutionRef = useRef({ preventsAutomaticPersistence: false });
  // The form component remains mounted when an admin exits impersonation. Clear the
  // co-agent-only response state and reload the transaction for the new viewer so an
  // administrative payout card cannot retain a prior co-agent allocation.
  useEffect(() => {
    setEditLoaded(false);
    setViewerIsCoAgent(false);
    setViewerParticipantAllocation(null);
    setViewerAgentId('');
    setParticipantAllocations(null);
    setLegacySideNeedsReview(false);
    legacySideResolutionRef.current = { preventsAutomaticPersistence: false };
    if (editTxId) setPdfStep('loading');
  }, [editTxId, isImpersonating, effectiveUid, effectiveName]);

  useEffect(() => {
    if (!editTxId || !user || editLoaded) return;
    const loadTx = async () => {
      try {
        const token = await user.getIdToken();
        const viewAsParam = isImpersonating && effectiveUid
          ? `?viewAs=${encodeURIComponent(effectiveUid)}${effectiveName ? `&viewAsName=${encodeURIComponent(effectiveName)}` : ''}`
          : '';
        const res = await fetch(`/api/agent/transactions/${editTxId}${viewAsParam}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok || !data.transaction) {
          toast({ title: 'Transaction not found', description: 'Could not load the transaction for editing.', variant: 'destructive' });
          return;
        }
        const tx = data.transaction;
        setViewerIsCoAgent(Boolean(tx.viewerIsCoAgent));
        setViewerParticipantAllocation(tx.viewerParticipantAllocation ?? null);
        setViewerAgentId(String(tx.viewerAgentId || ''));
        setParticipantAllocations(tx.participantAllocations ?? null);
        // This override is authoritative for this transaction only. Set it before
        // form values load so the profile-tier effect cannot replace it with 70/30.
        editCommissionOverride.current = Boolean(tx.commissionOverridden);
        commissionManualOverride.current = editCommissionOverride.current;
        manualPercentageSplitEdited.current = false;
        // Manual GCI and gross-rate decisions have their own durable flags. Keep
        // legacy broad overrides compatible, but do not let a profile lookup or
        // seller-paid percentage overwrite a saved operational decision on reload.
        gciManuallyEdited.current = Boolean(tx.manualGciOverride || editCommissionOverride.current);
        commPctManuallyEdited.current = Boolean(tx.manualCommissionPercentOverride || editCommissionOverride.current);
        // Pre-fill all form fields from the transaction document
        // Helper: if a Firestore value is an array (legacy data), take the first element
        // This prevents z.enum() and z.string() validation failures when old data has arrays
        const safeEnum = (val: unknown, fallback = '') => {
          if (Array.isArray(val)) return val[0] ?? fallback;
          return val ?? fallback;
        };
        const safeStr = (val: unknown, fallback = '') => {
          if (Array.isArray(val)) return val[0] ?? fallback;
          if (val === null || val === undefined) return fallback;
          return String(val);
        };

        // The current form uses closingType, while older files may use the legacy
        // type field. Resolve for display without writing the inferred value back.
        const sideResolution = resolveTransactionSide(tx);
        legacySideResolutionRef.current = {
          preventsAutomaticPersistence: sideResolution.preventsAutomaticPersistence,
        };
        setLegacySideNeedsReview(sideResolution.requiresManualReview);

        // Date aliases accumulated across the legacy ledger, TC queue, and unified
        // form. The rendered field is `closedDate`, so always hydrate it from the
        // first saved close-date value rather than leaving the editable field blank.
        const resolvedClosedDate = safeStr(
          tx.closedDate || tx.closingDate || tx.actualCloseDate,
          '',
        );

        // Some legacy listing saves used `transactionFee` while newer files use
        // txComplianceFee*. Resolve every saved representation into the editable
        // controls so a fee deduction can never be hidden from the editor.
        const resolvedLegacyListingFee = Number(tx.transactionFee ?? 0) || 0;
        // Some legacy saves retained a fee amount/payer (or a recorded agent fee
        // deduction) while omitting or changing the yes/no toggle. Treat that saved
        // financial state as authoritative so staff can always see and correct the
        // payer instead of having the related controls disappear after reload.
        const rawComplianceFee = safeStr(tx.txComplianceFee, '').trim().toLowerCase();
        const resolvedFeePayer = safeStr(tx.txComplianceFeePaidBy, '').trim().toLowerCase()
          || ((resolvedLegacyListingFee > 0 || Number(tx.splitSnapshot?.agentFeeDeduction ?? 0) > 0) ? 'agent' : '');
        const resolvedFeeAmount = Number(tx.txComplianceFeeAmount ?? 0) || 0;
        const resolvedRecordedFee = Number(tx.splitSnapshot?.agentFeeDeduction ?? 0) || 0;
        const feeExplicitlyDisabled = ['no', 'false', 'off', '0'].includes(rawComplianceFee) || tx.txComplianceFee === false;
        const resolvedComplianceFee = feeExplicitlyDisabled
          ? 'no'
          : (
            rawComplianceFee === 'yes' ||
            rawComplianceFee === 'true' ||
            tx.txComplianceFee === true ||
            resolvedFeeAmount > 0 ||
            resolvedRecordedFee > 0 ||
            resolvedLegacyListingFee > 0 ||
            ['buyer', 'seller', 'seller_closing_cost', 'agent'].includes(resolvedFeePayer)
          ) ? 'yes' : 'no';

        // Co-agent compatibility bridge -------------------------------------------------
        // Older transaction documents stored an internal co-listing partner as
        // isCoListing + coListingAgent*. The unified form stores the same business
        // relationship as hasCoAgent + coAgent*. Resolve both shapes into the
        // canonical form fields so a status-only edit never turns an existing
        // co-agent relationship off or hides it from the editor.
        const legacyCoAgent = tx.coAgent && typeof tx.coAgent === 'object' ? tx.coAgent : {};
        const legacyCoAgentName = safeStr(
          tx.coAgentDisplayName || legacyCoAgent.agentName || legacyCoAgent.displayName || tx.coListingAgentName || tx.coAgentName,
          ''
        );
        const legacyCoAgentId = safeStr(tx.coAgentId || legacyCoAgent.agentId || '', '');
        const matchedCoAgent = !legacyCoAgentId && legacyCoAgentName
          ? agents.find(a => String(a.agentName || '').trim().toLowerCase() === legacyCoAgentName.trim().toLowerCase())
          : undefined;
        const resolvedCoAgentId = legacyCoAgentId || matchedCoAgent?.agentId || '';
        const resolvedCoAgentPct = Number(
          tx.coAgentSplitPercent ?? legacyCoAgent.splitPercent ?? tx.coListingAgentSplit ?? 50
        ) || 50;
        const resolvedPrimaryPct = Number(
          tx.primaryAgentSplitPercent ?? legacyCoAgent.primarySplitPercent ?? (100 - resolvedCoAgentPct)
        ) || 50;
        // Use OR deliberately: a previous buggy unified-form save may have written
        // hasCoAgent=false while leaving the still-authoritative legacy fields intact.
        const resolvedHasCoAgent = Boolean(
          tx.hasCoAgent || tx.isCoListing || resolvedCoAgentId || legacyCoAgentName
        );

        // Some closed legacy files retained their sale price and commission rate but
        // stored `gci` as 0. A zero must not suppress the commission calculation or
        // hide the earnings card when the inputs prove a gross commission. Preserve
        // an explicit positive GCI first, then calculate it from the saved base and
        // rate, and only then infer it from finalized split dollars. Pass-through
        // files intentionally retain zero broker economics and are excluded.
        const resolvedSalePrice = tx.salePrice || tx.finalSalePrice || tx.closedSalePrice || '';
        const resolvedCommissionBasePrice = tx.commissionBasePrice || resolvedSalePrice || '';
        const resolvedCommissionPercent = tx.commissionPercent || tx.sellerCommissionPct || '';
        const resolvedBrokerGci = tx.brokerGci || tx.splitSnapshot?.companyRetained || tx.companyRetained || '';
        const resolvedAgentDollar = tx.agentDollar || tx.splitSnapshot?.agentNetCommission || tx.splitSnapshot?.agentDollar || tx.agentNetCommission || tx.agentCommission || '';
        const explicitGci = tx.gci || tx.splitSnapshot?.grossCommission || tx.splitSnapshot?.grossCommissionAmount || tx.grossCommission || tx.commission || tx.commissionAmount || tx.grossCommissionIncome || '';
        const isPassThroughTransaction = Boolean(tx.passThrough || tx.isPassThrough);
        const calculatedLegacyGci = !isPassThroughTransaction && Number(explicitGci) <= 0 && Number(resolvedCommissionBasePrice) > 0 && Number(resolvedCommissionPercent) > 0
          ? resolveGCI({ commissionBasePrice: Number(resolvedCommissionBasePrice), commissionPercent: Number(resolvedCommissionPercent) })
          : 0;
        const inferredLegacyGci = !isPassThroughTransaction && Number(explicitGci) <= 0 && calculatedLegacyGci <= 0 && Number(resolvedBrokerGci) > 0 && Number(resolvedAgentDollar) > 0
          ? Number(resolvedBrokerGci) + Number(resolvedAgentDollar)
          : 0;
        const resolvedGci = Number(explicitGci) > 0 ? explicitGci : (calculatedLegacyGci || inferredLegacyGci || '');

        const fieldMap: Record<string, unknown> = {
          agentId: tx.agentId || effectiveUid || '',
          agentDisplayName: tx.agentDisplayName || effectiveName || '',
          status: safeEnum(tx.status || tx.listingStatus, 'active') as any,
          // A record with no safe side must choose one before editing. Buyer is a
          // temporary non-displayed form value only; it is never silently saved.
          closingType: (sideResolution.side || 'buyer') as any,
          dealType: safeEnum(tx.dealType, 'residential_sale') as any,
          address: tx.address || '',
          clientName: tx.clientName || '',
          dealSource: tx.dealSource || '',
          listPrice: tx.listPrice || '',
          salePrice: resolvedSalePrice,
          commissionPercent: resolvedCommissionPercent,
          commissionBasePrice: resolvedCommissionBasePrice,
          sellerCommissionPct: tx.sellerCommissionPct || tx.commissionPercent || '',
          buyerCommissionPct: tx.buyerCommissionPct || '',
          // Historical listing files may carry their finalized commission under
          // `commission` or `grossCommission` rather than the unified `gci` field.
          // Hydrate those aliases so the editable commission values—and the
          // earnings breakdown that depends on GCI—remain available after reopen.
          gci: resolvedGci,
          brokerPct: tx.brokerPct || tx.splitSnapshot?.companySplitPercent || tx.companySplitPercent || '',
          brokerGci: resolvedBrokerGci,
          agentPct: tx.agentPct || tx.splitSnapshot?.agentSplitPercent || tx.agentSplitPercent || '',
          agentDollar: resolvedAgentDollar,
          mlsNumber: tx.mlsNumber || '',
          // Listings saved before the unified form used legacy aliases. Preserve
          // those dates when the same transaction is reopened by any role.
          listingDate: tx.listingDate || tx.listDate || '',
          listingExpirationDate: tx.listingExpirationDate || tx.expirationDate || tx.listingExpiration || '',
          contractDate: tx.contractDate || '',
          optionExpiration: tx.optionExpiration || '',
          inspectionDeadline: tx.inspectionDeadline || '',
          surveyDeadline: tx.surveyDeadline || '',
          appraisalDeadline: tx.appraisalDeadline || '',
          titleDeadline: tx.titleDeadline || '',
          loanApplicationDeadline: tx.loanApplicationDeadline || '',
          finalLoanCommitmentDeadline: tx.finalLoanCommitmentDeadline || tx.finalLoanCommitment || '',
          appraisalConditioned: Boolean(tx.appraisalConditioned),
          appraisalPeriodDays: tx.appraisalPeriodDays || '',
          depositDueDays: tx.depositDueDays || '',
          financingCommitmentDays: tx.financingCommitmentDays || '',
          closingDays: tx.closingDays || '',
          finalLoanCommitment: tx.finalLoanCommitment || '',
          projectedCloseDate: tx.projectedCloseDate || '',
          closedDate: resolvedClosedDate,
          closingDate: resolvedClosedDate,
          actualCloseDate: resolvedClosedDate,
          workingWithTc: Boolean(tx.workingWithTc || tx.tcWorking === 'yes'),
          tcWorking: (tx.workingWithTc || tx.tcWorking === 'yes') ? 'yes' : 'no',
          hasCoAgent: resolvedHasCoAgent,
          coAgentId: resolvedCoAgentId,
          coAgentDisplayName: legacyCoAgentName,
          coAgentRole: safeEnum(tx.coAgentRole || legacyCoAgent.role, 'co_list') as any,
          primaryAgentSplitPercent: resolvedPrimaryPct,
          coAgentSplitPercent: resolvedCoAgentPct,
          isCoListing: resolvedHasCoAgent,
          coListingAgentName: tx.coListingAgentName || '',
          coListingAgentEmail: tx.coListingAgentEmail || '',
          coListingAgentBrokerage: tx.coListingAgentBrokerage || '',
          coListingAgentPhone: tx.coListingAgentPhone || '',
          coListingAgentSplit: tx.coListingAgentSplit || '',
          outboundReferral: tx.outboundReferral || '',
          outboundReferralAgentName: tx.outboundReferralAgentName || '',
          outboundReferralBrokerage: tx.outboundReferralBrokerage || '',
          outboundReferralFee: tx.outboundReferralFee || '',
          outboundReferralEmail: tx.outboundReferralEmail || '',
          outboundReferralPhone: tx.outboundReferralPhone || '',
          inboundReferral: tx.inboundReferral || '',
          inboundReferralAgentName: tx.inboundReferralAgentName || '',
          inboundReferralBrokerage: tx.inboundReferralBrokerage || '',
          inboundReferralFee: tx.inboundReferralFee || '',
          inboundReferralEmail: tx.inboundReferralEmail || '',
          inboundReferralPhone: tx.inboundReferralPhone || '',
          clientEmail: tx.clientEmail || '',
          clientPhone: tx.clientPhone || '',
          client2Name: tx.client2Name || '',
          client2Email: tx.client2Email || '',
          client2Phone: tx.client2Phone || '',
          buyerName: tx.buyerName || '',
          buyerEmail: tx.buyerEmail || '',
          buyerPhone: tx.buyerPhone || '',
          buyer2Name: tx.buyer2Name || '',
          buyer2Email: tx.buyer2Email || '',
          buyer2Phone: tx.buyer2Phone || '',
          buyer3Name: tx.buyer3Name || '',
          buyer3Email: tx.buyer3Email || '',
          buyer3Phone: tx.buyer3Phone || '',
          buyer4Name: tx.buyer4Name || '',
          buyer4Email: tx.buyer4Email || '',
          buyer4Phone: tx.buyer4Phone || '',
          sellerName: tx.sellerName || '',
          sellerEmail: tx.sellerEmail || '',
          sellerPhone: tx.sellerPhone || '',
          seller2Name: tx.seller2Name || '',
          seller2Email: tx.seller2Email || '',
          seller2Phone: tx.seller2Phone || '',
          seller3Name: tx.seller3Name || '',
          seller3Email: tx.seller3Email || '',
          seller3Phone: tx.seller3Phone || '',
          seller4Name: tx.seller4Name || '',
          seller4Email: tx.seller4Email || '',
          seller4Phone: tx.seller4Phone || '',
          otherAgentName: tx.otherAgentName || '',
          otherAgentEmail: tx.otherAgentEmail || '',
          otherAgentPhone: tx.otherAgentPhone || '',
          otherBrokerage: tx.otherBrokerage || '',
          mortgageCompany: tx.mortgageCompany || '',
          lenderOffice: tx.lenderOffice || '',
          loanOfficer: tx.loanOfficer || '',
          loanOfficerEmail: tx.loanOfficerEmail || '',
          loanOfficerPhone: tx.loanOfficerPhone || '',
          loanOfficerStreet: tx.loanOfficerStreet || '',
          loanOfficeNumber: tx.loanOfficeNumber || '',
          titleCompany: tx.titleCompany || '',
          titleOfficer: tx.titleOfficer || '',
          titleOfficerEmail: tx.titleOfficerEmail || '',
          titleOfficerPhone: tx.titleOfficerPhone || '',
          titleAttorney: tx.titleAttorney || '',
          titleOffice: tx.titleOffice || '',
          titleOfficerStreet: tx.titleOfficerStreet || '',
          earnestMoney: tx.earnestMoney || '',
          depositHolder: safeEnum(tx.depositHolder, ''),
          depositHolderOther: tx.depositHolderOther || '',
          buyerClosingCostTotal: tx.buyerClosingCostTotal || '',
          warrantyAtClosing: safeEnum(tx.warrantyAtClosing, ''),
          warrantyAmount: tx.warrantyAmount || '',
          warrantyPaidBy: tx.warrantyPaidBy || '',
          txComplianceFee: resolvedComplianceFee,
          txComplianceFeeAmount: resolvedComplianceFee === 'yes' ? (resolvedFeeAmount || resolvedRecordedFee || resolvedLegacyListingFee || '') : '',
          txComplianceFeePaidBy: resolvedComplianceFee === 'yes' ? resolvedFeePayer : '',
          // Keep the legacy listing field aligned on the next save. This prevents
          // older commission calculations from retaining a stale hidden deduction.
          transactionFee: resolvedComplianceFee === 'yes' ? (resolvedFeeAmount || resolvedLegacyListingFee || resolvedRecordedFee || '') : 0,
          txComplianceFeeAgentAllocation: tx.txComplianceFeeAgentAllocation || 'primary_agent',
          txComplianceFeePrimaryAgentAmount: tx.txComplianceFeePrimaryAgentAmount ?? '',
          txComplianceFeeCoAgentAmount: tx.txComplianceFeeCoAgentAmount ?? '',
          occupancyAgreement: safeEnum(tx.occupancyAgreement, ''),
          occupancyDate: tx.occupancyDate || '',
          occupancyNotes: tx.occupancyNotes || '',
          shortageInCommission: safeEnum(tx.shortageInCommission, ''),
          shortageAmount: tx.shortageAmount || '',
          shortageHandledBy: tx.shortageHandledBy || '',
          inspectionOrdered: safeEnum(tx.inspectionOrdered, ''),
          targetInspectionDate: tx.targetInspectionDate || '',
          tcScheduleInspections: safeEnum(tx.tcScheduleInspections, ''),
          inspectionTypes: tx.inspectionTypes || [],
          preListingInspectionOrdered: safeEnum(tx.preListingInspectionOrdered, ''),
          preListingTargetInspectionDate: tx.preListingTargetInspectionDate || '',
          preListingTcScheduleInspections: safeEnum(tx.preListingTcScheduleInspections, ''),
          preListingInspectionTypes: tx.preListingInspectionTypes || [],
          preListingInspectorName: tx.preListingInspectorName || '',
          signOrderRequested: tx.signOrderRequested ?? false,
          signServiceType: tx.signServiceType || '',
          signRiderExt: Array.isArray(tx.signRiderExt) ? (tx.signRiderExt[0] ?? '') : (tx.signRiderExt || ''),
          signAdditionalOptions: tx.signAdditionalOptions || [],
          signRequestedDate: tx.signRequestedDate || '',
          signNotes: tx.signNotes || '',
          showingTimeRequested: tx.showingTimeRequested ?? false,
          showingApptType: tx.showingApptType || '',
          showingApptHandling: Array.isArray(tx.showingApptHandling) ? tx.showingApptHandling : (tx.showingApptHandling ? [tx.showingApptHandling] : []),
          showingLockboxType: tx.showingLockboxType || '',
          showingLockboxLocation: tx.showingLockboxLocation || '',
          showingAlarmDisarm: tx.showingAlarmDisarm || '',
          showingAlarmArm: tx.showingAlarmArm || '',
          showingNotesToAgentOther: tx.showingNotesToAgentOther || '',
          showingCallOrder1Name: tx.showingCallOrder1Name || '',
          showingCallOrder1Phone: tx.showingCallOrder1Phone || '',
          showingCallOrder2Name: tx.showingCallOrder2Name || '',
          showingCallOrder2Phone: tx.showingCallOrder2Phone || '',
          showingCallOrder3Name: tx.showingCallOrder3Name || '',
          showingCallOrder3Phone: tx.showingCallOrder3Phone || '',
          mediaRequested: tx.mediaRequested ?? false,
          mediaTypes: tx.mediaTypes || [],
          mediaRequestedDate: tx.mediaRequestedDate || '',
          mediaNotes: tx.mediaNotes || '',
          mlsDescription: tx.mlsDescription || '',
          additionalNotes: tx.additionalNotes || '',
          additionalComments: tx.additionalComments || '',
          isPassThrough: tx.isPassThrough ?? false,
          isCommercial: tx.isCommercial ?? false,
          showingTimeId: tx.showingTimeId || '',
        };
        setPersistedEditStatus(String(fieldMap.status || '').toLowerCase() || null);
        // Global sanitization: for any string field that has an array value in Firestore
        // (legacy data from old form versions), coerce it to the first element or empty string.
        // This prevents z.string() validation failures across all 80+ string fields at once.
        const KNOWN_ARRAY_FIELDS = new Set([
          'preListingInspectionTypes', 'inspectionTypes', 'mediaTypes',
          'signAdditionalOptions', 'showingApptHandling', 'showingCallOrder2Notify',
          'showingCallOrder3Notify', 'showingNotesToAgent',
        ]);
        Object.entries(fieldMap).forEach(([key, val]) => {
          if (val !== undefined && val !== null && val !== '') {
            if (KNOWN_ARRAY_FIELDS.has(key)) {
              // These are legitimately array fields — keep as-is
              form.setValue(key as any, val as any);
            } else if (Array.isArray(val)) {
              // String/enum field got an array from Firestore — take first element
              const coerced = val[0] ?? '';
              if (coerced !== '') form.setValue(key as any, coerced as any);
            } else {
              form.setValue(key as any, val as any);
            }
          }
        });
        // Documents are stored on the authoritative transaction document, not
        // the ledger projection. Hydrate the local document state from that
        // saved array so every editor sees uploaded files after reopening the
        // same shared form. Normalize legacy aliases defensively.
        const hydratedDocs = (Array.isArray(tx.documents) ? tx.documents : [])
          .map((doc: any, index: number): UploadedDoc | null => {
            if (!doc || typeof doc !== 'object') return null;
            const storagePath = String(
              doc.storagePath || doc.path || doc.storageKey || doc.url || `legacy-document-${index}`,
            ).trim();
            const url = String(doc.url || doc.downloadUrl || doc.downloadURL || doc.fileUrl || doc.fileURL || '').trim();
            const name = String(doc.name || doc.fileName || doc.filename || doc.originalName || `Document ${index + 1}`).trim();
            if (!storagePath || !url) return null;
            return {
              name,
              url,
              storagePath,
              uploadedAt: String(doc.uploadedAt || doc.createdAt || ''),
            };
          })
          .filter((doc: UploadedDoc | null): doc is UploadedDoc => Boolean(doc));
        setUploadedDocs(Array.from(new Map(hydratedDocs.map((doc) => [doc.storagePath, doc])).values()));
        // Also restore inspection row data
        if (tx.inspectionRowData) {
          const newRows: Record<string, any> = {};
          Object.entries(tx.inspectionRowData).forEach(([key, row]: [string, any]) => {
            if (row) {
              newRows[key] = {
                vendorId: row.vendorId || '',
                sendMode: row.sendMode || 'selected_only',
                preferredDate: row.preferredDate || '',
                preferredTimeStart: row.preferredTimeStart || '08:00',
                preferredTimeEnd: row.preferredTimeEnd || '17:00',
                fallbackDateStart: row.fallbackDateStart || '',
                fallbackDateEnd: row.fallbackDateEnd || '',
                sent: row.sent || false,
              };
            }
          });
          setInspRows(newRows);
        }
        setPdfStep(sideResolution.requiresManualReview ? 'type' : 'form');
        setEditLoaded(true);
        toast({ title: 'Transaction loaded', description: 'All fields have been pre-filled. Make your changes and save.' });
      } catch (err: any) {
        toast({ title: 'Error loading transaction', description: err.message, variant: 'destructive' });
      }
    };
    loadTx();
  }, [editTxId, user, editLoaded]);

  // ── Load intake status when in TC/staff queue mode ────────────────────────
  useEffect(() => {
    if (!intakeId || !user || !isTcQueueMode) return;
    const loadIntake = async () => {
      try {
        const token = await user.getIdToken();
        const apiPath = queueRole === 'staff'
          ? `/api/admin/staff-queue/${intakeId}`
          : `/api/admin/tc/${intakeId}`;
        const res = await fetch(apiPath, { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        if (data.ok) {
          const status = data.intake?.status || data.item?.status || null;
          setIntakeStatus(status);
        }
      } catch { /* non-fatal */ }
    };
    loadIntake();
  }, [intakeId, user, isTcQueueMode, queueRole]);

  // ── Load checklist items when in TC/staff queue mode ──────────────────────
  useEffect(() => {
    if (!intakeId || !user || !isTcQueueMode) return;
    const loadChecklist = async () => {
      try {
        const token = await user.getIdToken();
        const apiPath = queueRole === 'staff'
          ? `/api/admin/staff-queue/${intakeId}`
          : `/api/admin/tc/${intakeId}`;
        const res = await fetch(apiPath, { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        if (data.ok) {
          const items: ChecklistItem[] = (data.checklist || data.intake?.checklist || [])
            .sort((a: ChecklistItem, b: ChecklistItem) => (a.order ?? 0) - (b.order ?? 0));
          setChecklistItems(items);
        }
      } catch { /* non-fatal */ }
    };
    loadChecklist();
  }, [intakeId, user, isTcQueueMode, queueRole]);

  // ── Toggle a checklist item ────────────────────────────────────────────────
  const handleChecklistToggle = async (itemId: string, currentCompleted: boolean) => {
    if (!user || !intakeId) return;
    const newCompleted = !currentCompleted;
    // Optimistic update
    setChecklistItems(prev => prev.map(i => i.id === itemId ? { ...i, completed: newCompleted } : i));
    setChecklistSaving(itemId);
    try {
      const token = await user.getIdToken();
      const apiPath = queueRole === 'staff'
        ? `/api/admin/staff-queue/${intakeId}`
        : `/api/admin/tc/${intakeId}`;
      await fetch(apiPath, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          checklist: [{ itemId, completed: newCompleted }],
        }),
      });
    } catch {
      // Revert on error
      setChecklistItems(prev => prev.map(i => i.id === itemId ? { ...i, completed: currentCompleted } : i));
    } finally {
      setChecklistSaving(null);
    }
  };

  // ── Auto-save draft to Firestore every 30 seconds ─────────────────────────
  useEffect(() => {
    if (submitted) return;
    // In edit mode, the transaction document is the source of truth — ignore any saved draft
    if (editMode) return;
    // Also check localStorage for legacy drafts
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) setHasDraft(true);
    } catch {}
    if (!user) return;
    const interval = setInterval(async () => {
      try {
        const values = form.getValues();
        const hasContent = values.address || values.clientName || values.salePrice;
        if (!hasContent) return;
        const token = await user.getIdToken();
        const res = await fetch('/api/agent/drafts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            draftId: activeDraftId || undefined,
            fields: values,
            label: values.address || values.clientName || 'Untitled Draft',
          }),
        });
        const data = await res.json();
        if (data.ok && data.draftId && !activeDraftId) {
          setActiveDraftId(data.draftId);
        }
        // Also keep localStorage as fallback
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ values, savedAt: Date.now() }));
      } catch {}
    }, 30000);
    return () => clearInterval(interval);
  }, [submitted, user, activeDraftId]);

  // Fields that must always be arrays in the form schema
  const ARRAY_FORM_FIELDS = new Set(['preListingInspectionTypes', 'inspectionTypes', 'mediaTypes',
    'signAdditionalOptions', 'showingApptHandling', 'showingCallOrder2Notify',
    'showingCallOrder3Notify', 'showingNotesToAgent']);
  const restoreDraft = () => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (!saved) return;
      const { values } = JSON.parse(saved);
      Object.entries(values).forEach(([key, val]) => {
        if (val !== undefined && val !== null && val !== '') {
          // Ensure array fields are always restored as arrays, never as strings
          if (ARRAY_FORM_FIELDS.has(key)) {
            form.setValue(key as any, Array.isArray(val) ? val : (val ? [val as string] : []) as any);
          } else {
            form.setValue(key as any, val as any);
          }
        }
      });
      setHasDraft(false);
      setDraftRestored(true);
      toast({ title: 'Draft restored', description: 'Your previous form data has been loaded.' });
    } catch {}
  };
  const discardDraft = async () => {
    try { localStorage.removeItem(DRAFT_KEY); } catch {}
    setHasDraft(false);
    // Also delete from Firestore if we have an activeDraftId
    if (activeDraftId && user) {
      try {
        const token = await user.getIdToken();
        await fetch('/api/agent/drafts', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ draftId: activeDraftId }),
        });
        setActiveDraftId(null);
      } catch {}
    }
  };

  const toggleInspectionType = (type: string) => {
    const current = form.getValues('inspectionTypes') || [];
    if (current.includes(type)) {
      form.setValue('inspectionTypes', current.filter((t: string) => t !== type));
    } else {
      form.setValue('inspectionTypes', [...current, type]);
    }
  };
  const togglePreListingInspectionType = (type: string) => {
    const current = form.getValues('preListingInspectionTypes') || [];
    if (current.includes(type)) {
      form.setValue('preListingInspectionTypes', current.filter((t: string) => t !== type));
    } else {
      form.setValue('preListingInspectionTypes', [...current, type]);
    }
  };
  const toggleMediaType = (type: string) => {
    const current = form.getValues('mediaTypes') || [];
    if (current.includes(type)) {
      form.setValue('mediaTypes', current.filter((t: string) => t !== type));
    } else {
      form.setValue('mediaTypes', [...current, type]);
    }
  };
  const toggleSignAdditionalOption = (opt: string) => {
    const current = form.getValues('signAdditionalOptions') || [];
    if (current.includes(opt)) {
      form.setValue('signAdditionalOptions', current.filter((t: string) => t !== opt));
    } else {
      form.setValue('signAdditionalOptions', [...current, opt]);
    }
  };
  const toggleShowingNotesToAgent = (note: string) => {
    const current = form.getValues('showingNotesToAgent') || [];
    if (current.includes(note)) {
      form.setValue('showingNotesToAgent', current.filter((t: string) => t !== note));
    } else {
      form.setValue('showingNotesToAgent', [...current, note]);
    }
  };
  const toggleShowingCallOrder2Notify = (method: string) => {
    const current = form.getValues('showingCallOrder2Notify') || [];
    if (current.includes(method)) {
      form.setValue('showingCallOrder2Notify', current.filter((t: string) => t !== method));
    } else {
      form.setValue('showingCallOrder2Notify', [...current, method]);
    }
  };
  const toggleShowingCallOrder3Notify = (method: string) => {
    const current = form.getValues('showingCallOrder3Notify') || [];
    if (current.includes(method)) {
      form.setValue('showingCallOrder3Notify', current.filter((t: string) => t !== method));
    } else {
      form.setValue('showingCallOrder3Notify', [...current, method]);
    }
  };

  if (userLoading) {
    return <div className="space-y-4"><Skeleton className="h-12 w-1/2" /><Skeleton className="h-96 w-full" /></div>;
  }

  if (!user) {
    return (
      <Alert>
        <AlertTitle>Sign In Required</AlertTitle>
        <AlertDescription>Please sign in to add a transaction.</AlertDescription>
      </Alert>
    );
  }

  // ── Success screen ─────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="max-w-xl mx-auto text-center space-y-6 py-16 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none select-none" aria-hidden>
          {Array.from({ length: 18 }).map((_, i) => (
            <span
              key={i}
              className="absolute text-2xl animate-bounce"
              style={{
                left: `${5 + (i * 5.5) % 90}%`,
                top: `${10 + (i * 7) % 60}%`,
                animationDelay: `${(i * 0.12).toFixed(2)}s`,
                animationDuration: `${0.8 + (i % 4) * 0.2}s`,
                opacity: 0.7,
              }}
            >
              {['🎉','🏠','⭐','💰','🎊','✨'][i % 6]}
            </span>
          ))}
        </div>
        <div className="relative z-10">
          <div className="w-24 h-24 rounded-full bg-green-100 dark:bg-green-950/40 border-4 border-green-400 flex items-center justify-center mx-auto mb-2">
            <CheckCircle2 className="h-12 w-12 text-green-500" />
          </div>
          <h1 className="text-3xl font-black text-foreground">Deal Submitted! 🎉</h1>
          <p className="text-muted-foreground mt-2">
            Your transaction is in the TC Queue for review and will appear in the ledger once approved.
          </p>
          {resultId && (
            <p className="mt-2 font-mono text-xs text-muted-foreground">Ref: {resultId}</p>
          )}
          <div className="flex justify-center gap-3 flex-wrap mt-8">
            <Button onClick={() => {
              setSubmitted(false);
              setResultId(null);
              form.reset({
                agentId: isAdmin ? '' : user.uid,
                agentDisplayName: isAdmin ? '' : (user.displayName || user.email || ''),
                closingType: 'buyer',
                dealType: 'residential_sale',
                address: '',
                clientName: '',
                contractDate: '',
                inspectionTypes: [],
                sellerPayingListingAgentUnknown: false,
                tcWorking: 'yes',
              });
            }}>
              Add Another Deal
            </Button>
            <Link href="/dashboard/admin/tc">
              <Button variant="outline"><ClipboardList className="mr-2 h-4 w-4" /> TC Queue</Button>
            </Link>
            <Link href={isAdmin ? '/dashboard/admin/transactions' : '/dashboard'}>
              <Button variant="outline">{isAdmin ? 'View Ledger' : 'Back to Dashboard'}</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── Submit handler ─────────────────────────────────────────────────────────
  const onSubmit = async (values: FormValues) => {
    // Keep the visible Yes/No selector and the canonical routing field in lockstep.
    // Existing queue and notification routes depend on workingWithTc, while older
    // records may carry only tcWorking.
    values = {
      ...values,
      workingWithTc: values.tcWorking === 'yes' || values.workingWithTc === true,
    };
    // An operational user may intentionally use a manual percentage split, but
    // both sides must be present and total 100%. Dollar overrides clear both
    // fields and bypass this check because their entered dollars are authoritative.
    if (hasOperationalEditAuthority && manualPercentageSplitEdited.current) {
      const hasBrokerPct = values.brokerPct !== '' && values.brokerPct !== null && values.brokerPct !== undefined;
      const hasAgentPct = values.agentPct !== '' && values.agentPct !== null && values.agentPct !== undefined;
      if (hasBrokerPct || hasAgentPct) {
        const brokerPct = Number(values.brokerPct);
        const agentPct = Number(values.agentPct);
        if (!hasBrokerPct || !hasAgentPct || !Number.isFinite(brokerPct) || !Number.isFinite(agentPct) || Math.abs((brokerPct + agentPct) - 100) > 0.01) {
          toast({
            title: 'Commission split must equal 100%',
            description: 'Enter both Broker % and Agent % so they total exactly 100%, or clear both percentages and use a manual dollar override.',
            variant: 'destructive',
          });
          return;
        }
      }
    }
    // ── Edit mode: PATCH the existing transaction ─────────────────────────
    if (editMode && editTxId) {
      if (isClosedAgentView) {
        toast({
          title: 'Closed transaction',
          description: 'Agents cannot edit closed transactions. Contact your admin, staff, or TC if a correction is needed.',
          variant: 'destructive',
        });
        return;
      }
      lastSaveSucceededRef.current = false;
      setSubmitting(true);
      try {
        const token = await user!.getIdToken();

        // Build inspectionRowData — skip rows with no vendor selected (avoids validation errors)
        const inspectionRowData = Object.fromEntries(
          INSP_TYPES.map(({ key, label }) => {
            const row = inspRows[key];
            if (!row) return [key, null];
            const vendors = inspVendors[key] || [];
            const generalVendors = inspVendors['inspector_general'] || [];
            const effectiveVendorId = row.vendorId === 'USE_GENERAL'
              ? (inspRows['inspector_general']?.vendorId || '')
              : row.vendorId;
            // Skip rows with no vendor and no dates — they're empty placeholders
            if (!effectiveVendorId && !row.preferredDate && !row.sent) return [key, null];
            const vendorList = row.vendorId === 'USE_GENERAL' ? generalVendors : vendors;
            const vendor = vendorList.find(v => v.id === effectiveVendorId) || null;
            return [key, {
              label,
              vendorId: effectiveVendorId,
              vendorName: vendor?.name || '',
              vendorCompany: vendor?.company || '',
              sendMode: row.sendMode,
              preferredDate: row.preferredDate,
              preferredTimeStart: row.preferredTimeStart,
              preferredTimeEnd: row.preferredTimeEnd,
              fallbackDateStart: row.fallbackDateStart,
              fallbackDateEnd: row.fallbackDateEnd,
              sent: row.sent,
            }];
          })
        );

        // Route to the correct API based on role:
        // - Admin/TC/Staff → admin transactions route (full field access, commission overrides)
        // - Agent (or impersonating as agent) → agent route
        const isAdminEdit = hasOperationalEditAuthority;
        // Persist one canonical co-agent object and legacy aliases together while
        // older transactions are still in circulation. This prevents a status-only
        // save from erasing or hiding a co-agent relationship created under the
        // former coListingAgent* schema.
        const coAgentCompatibility = values.hasCoAgent
          ? {
              hasCoAgent: true,
              coAgent: {
                agentId: values.coAgentId || '',
                agentName: values.coAgentDisplayName || '',
                displayName: values.coAgentDisplayName || '',
                role: values.coAgentRole || 'co_list',
                splitPercent: Number(values.coAgentSplitPercent || 50),
                primarySplitPercent: Number(values.primaryAgentSplitPercent || 50),
              },
              isCoListing: true,
              coListingAgentName: values.coAgentDisplayName || '',
              coListingAgentSplit: Number(values.coAgentSplitPercent || 50),
            }
          : {
              hasCoAgent: false,
              coAgent: null,
              coAgentId: '',
              coAgentDisplayName: '',
              coAgentRole: '',
              primaryAgentSplitPercent: '',
              coAgentSplitPercent: '',
              isCoListing: false,
              coListingAgentName: '',
              coListingAgentEmail: '',
              coListingAgentBrokerage: '',
              coListingAgentPhone: '',
              coListingAgentSplit: '',
            };
        // A legacy side inferred only for display must not be backfilled merely
        // because someone saved an unrelated note, date, or document. The later
        // approved migration owns those writes. An explicit user selection clears
        // this safeguard below and may be saved normally.
        const valuesForSave: Record<string, any> = { ...values };
        if (legacySideResolutionRef.current.preventsAutomaticPersistence) {
          delete valuesForSave.closingType;
        }

        let apiUrl: string;
        let apiBody: Record<string, any>;

        if (isAdminEdit) {
          // Admin/TC/staff edit: use admin transactions PATCH which accepts all fields
          // including agentPct, brokerPct, agentDollar, brokerGci, splitSnapshot
          apiUrl = `/api/admin/transactions`;
          apiBody = {
            id: editTxId,
            ...valuesForSave,
            ...coAgentCompatibility,
            documents: uploadedDocs,
            // The hydrated document list is authoritative for this shared
            // edit form. This prevents a stale editor from dropping files and
            // allows intentional document removal to persist for agents too.
            _replaceDocuments: true,
            inspectionRowData,
            // Mark that commission was manually overridden if split fields changed
            ...(commissionManualOverride.current ? {
              commissionOverridden: true,
              commissionOverriddenBy: user!.uid,
              commissionOverriddenAt: new Date().toISOString(),
            } : {}),
            ...(gciManuallyEdited.current ? {
              manualGciOverride: true,
              manualGciOverriddenBy: user!.uid,
              manualGciOverriddenAt: new Date().toISOString(),
            } : {}),
            ...(commPctManuallyEdited.current ? {
              manualCommissionPercentOverride: true,
              manualCommissionPercentOverriddenBy: user!.uid,
              manualCommissionPercentOverriddenAt: new Date().toISOString(),
            } : {}),
            ...(manualPercentageSplitEdited.current ? { validateManualPercentageSplit: true } : {}),
          };
        } else {
          // Agent edit (or admin impersonating an agent)
          const viewAsParam = isImpersonating && effectiveUid ? `?viewAs=${effectiveUid}` : '';
          apiUrl = `/api/agent/transactions/${editTxId}${viewAsParam}`;
          apiBody = {
            ...valuesForSave,
            ...coAgentCompatibility,
            documents: uploadedDocs,
            _replaceDocuments: true,
            inspectionRowData,
          };
        }

        const res = await fetch(apiUrl, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(apiBody),
        });
        const data = await res.json();
        if (!res.ok) {
          toast({ title: 'Save failed', description: data.error || 'Could not save changes.', variant: 'destructive' });
          return;
        }
        lastSaveSucceededRef.current = true;
        if (!hasOperationalEditAuthority && String(values.status || '').toLowerCase() === 'closed') {
          setPersistedEditStatus('closed');
        }
        toast({ title: 'Changes saved', description: 'Transaction updated successfully.' });
        // Reset dirty state
        setEditLoaded(false);
        setTimeout(() => setEditLoaded(true), 100);
      } catch (err: any) {
        toast({ title: 'Error saving', description: err.message, variant: 'destructive' });
      } finally {
        setSubmitting(false);
      }
      return;
    }
    // ── Normal add mode: POST to /api/tc ─────────────────────────────────
    if (!user) return;
    setSubmitting(true);
    try {
      const token = await user.getIdToken();

      // ── Auto-save contacts to the Contacts Book ──────────────────────────
      const saveContact = async (type: string, fields: Record<string, any>) => {
        const hasData = Object.values(fields).some((v) => v && String(v).trim());
        if (!hasData) return;
        try {
          await fetch('/api/contacts', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ type, upsert: true, ...(isImpersonating && effectiveUid ? { viewAs: effectiveUid } : {}), ...fields }),
          });
        } catch { /* non-fatal */ }
      };
      // Save lender
      await saveContact('lender', {
        mortgageCompany: values.mortgageCompany,
        loanOfficer: values.loanOfficer,
        loanOfficerEmail: values.loanOfficerEmail,
        loanOfficerPhone: values.loanOfficerPhone,
        lenderOffice: values.lenderOffice,
      });
      // Save title company
      await saveContact('title', {
        titleCompany: values.titleCompany,
        titleOfficer: values.titleOfficer,
        titleOfficerEmail: values.titleOfficerEmail,
        titleOfficerPhone: values.titleOfficerPhone,
        titleAttorney: values.titleAttorney,
        titleOffice: values.titleOffice,
      });
      // Save cooperating agent
      await saveContact('other_agent', {
        otherAgentName: values.otherAgentName,
        otherAgentEmail: values.otherAgentEmail,
        otherAgentPhone: values.otherAgentPhone,
        otherBrokerage: values.otherBrokerage,
      });
      // Save inspector
      await saveContact('inspector', { inspectorName: values.inspectorName });
      // Save clients (buyer/seller/client)
      const clientFields = [
        { name: values.clientName, email: values.clientEmail, phone: values.clientPhone },
        { name: values.client2Name, email: values.client2Email, phone: values.client2Phone },
        { name: values.buyerName, email: values.buyerEmail, phone: values.buyerPhone },
        { name: values.buyer2Name, email: values.buyer2Email, phone: values.buyer2Phone },
        { name: values.sellerName, email: values.sellerEmail, phone: values.sellerPhone },
        { name: values.seller2Name, email: values.seller2Email, phone: values.seller2Phone },
      ];
      for (const cf of clientFields) {
        if (cf.name || cf.email) await saveContact('client', cf);
      }
      // ── End auto-save ─────────────────────────────────────────────────────

      // Ensure clientName is never blank — fall back to seller/buyer name so
      // the API never rejects a listing that has no top-level clientName field.
      const resolvedClientName =
        values.clientName ||
        values.sellerName ||
        values.buyerName ||
        '';

      const res = await fetch('/api/tc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          ...values,
          clientName: resolvedClientName,
          ...(hasOperationalEditAuthority && gciManuallyEdited.current ? {
            manualGciOverride: true,
            manualGciOverriddenBy: user.uid,
            manualGciOverriddenAt: new Date().toISOString(),
          } : {}),
          ...(hasOperationalEditAuthority && commPctManuallyEdited.current ? {
            manualCommissionPercentOverride: true,
            manualCommissionPercentOverriddenBy: user.uid,
            manualCommissionPercentOverriddenAt: new Date().toISOString(),
          } : {}),
          documents: uploadedDocs,
          // Inspection row data — per-type inspector details with resolved vendor names
          inspectionRowData: Object.fromEntries(
            INSP_TYPES.map(({ key, label }) => {
              const row = inspRows[key];
              if (!row) return [key, null];
              const vendors = inspVendors[key] || [];
              const generalVendors = inspVendors['inspector_general'] || [];
              const effectiveVendorId = row.vendorId === 'USE_GENERAL'
                ? (inspRows['inspector_general']?.vendorId || '')
                : row.vendorId;
              const vendorList = row.vendorId === 'USE_GENERAL' ? generalVendors : vendors;
              const vendor = vendorList.find(v => v.id === effectiveVendorId) || null;
              return [key, {
                label,
                vendorId: effectiveVendorId,
                vendorName: vendor?.name || '',
                vendorCompany: vendor?.company || '',
                sendMode: row.sendMode,
                preferredDate: row.preferredDate,
                preferredTimeStart: row.preferredTimeStart,
                preferredTimeEnd: row.preferredTimeEnd,
                fallbackDateStart: row.fallbackDateStart,
                fallbackDateEnd: row.fallbackDateEnd,
                sent: row.sent,
              }];
            })
          ),
          // Staging consult — include in main payload so it saves to the transaction document
          ...(stagingSent ? {
            stagingConsultRequested: true,
            stagingServiceType: stagingRequestData.serviceType,
            stagingCoordinateWith: stagingRequestData.coordinateWith,
            stagingPhotographerDate: stagingRequestData.photographerDate,
            stagingConsultationDate: stagingRequestData.consultationDate,
            stagingConsultationTime: stagingRequestData.consultationTime,
            stagingPaymentMethod: stagingRequestData.paymentMethod,
            stagingCurrentlyOnMarket: stagingRequestData.currentlyOnMarket,
            stagingTargetedMarketDate: stagingRequestData.targetedMarketDate,
            stagingHomeStyle: stagingRequestData.homeStyle,
            stagingOccupancy: stagingRequestData.occupancy,
            stagingReasonForSelling: stagingRequestData.reasonForSelling,
            stagingSpecialNotes: stagingRequestData.specialNotes,
            stagingStagerName: stagers.find(s => s.id === stagingRequestData.stagerId)?.name || '',
            stagingStagerEmail: stagers.find(s => s.id === stagingRequestData.stagerId)?.email || '',
            stagingRequestSentAt: new Date().toISOString(),
          } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Submission failed');
      setResultId(data.id);
      // Clear draft on successful submit
      try { localStorage.removeItem(DRAFT_KEY); } catch {}
      if (activeDraftId && user) {
        try {
          const token = await user.getIdToken();
          await fetch('/api/agent/drafts', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ draftId: activeDraftId }),
          });
        } catch {}
      }
      setSubmitted(true);
      toast({
        title: 'Transaction submitted to TC Queue',
        description: 'It will appear in the ledger once approved.',
      });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleInvalidSubmit = (errors: Record<string, any>) => {
    const firstError = Object.values(errors)[0] as any;
    const message = firstError?.message || 'Please fill in all required fields before submitting.';
    const firstKey = Object.keys(errors)[0];
    console.error('[Form validation errors]', JSON.stringify(errors, null, 2));
    toast({ title: 'Cannot save — required field missing', description: `Field: ${firstKey} — ${String(message)}`, variant: 'destructive' });
    const el = document.querySelector(`[name="${firstKey}"]`) as HTMLElement | null;
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const setManualDollarSplit = (field: 'brokerGci' | 'agentDollar', value: unknown) => {
    // A deliberate dollar override and a percentage split are competing inputs.
    // Clear both percentages so the percentage-driven live calculation cannot
    // overwrite the manually entered broker and agent dollar amounts.
    commissionManualOverride.current = true;
    if (value !== '' && value !== null && value !== undefined) {
      form.setValue('brokerPct', '' as any, { shouldDirty: true, shouldValidate: true });
      form.setValue('agentPct', '' as any, { shouldDirty: true, shouldValidate: true });
    }
    form.setValue(field, value as any, { shouldDirty: true, shouldValidate: true });
  };

  const applyRepresentationSide = (side: TransactionSide) => {
    form.setValue('closingType', side);
    form.setValue('clientType', side === 'listing' ? 'seller' : side === 'dual' ? 'dual' : side === 'buyer' ? 'buyer' : '');
    // This is a deliberate human selection. It is allowed to persist on the
    // next normal save; simply loading an inferred legacy side is not.
    legacySideResolutionRef.current = { preventsAutomaticPersistence: false };
    setLegacySideNeedsReview(false);
    if (!editMode && side === 'listing') form.setValue('status', 'active');
  };

  const chooseTransactionType = (side: TransactionSide) => {
    applyRepresentationSide(side);
    setPdfStep(editMode || side === 'referral' ? 'form' : 'upload');
  };

  // ───────────────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-24">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {editMode ? 'Edit Transaction' : 'Add Transaction'}
          </h1>
          <p className="text-muted-foreground mt-1">
            {editMode
              ? isClosedAgentView
                ? 'This transaction is closed and is available for review only. Contact your admin, staff, or TC if a correction is needed.'
                : 'Make changes below and click Save Changes when done.'
              : pdfStep === 'upload' ? 'Upload a purchase agreement to auto-fill the form, or skip to fill manually.' : pdfStep === 'extracting' ? 'Reading your purchase agreement...' : 'Review the auto-filled details below and submit to the TC Queue.'}
          </p>
        </div>
        <Badge variant="outline" className="mt-1">
          <ClipboardList className="h-3 w-3 mr-1" /> TC Queue Review
        </Badge>
      </div>

      {pdfStep === 'loading' && (
        <Card>
          <CardContent className="py-12 flex items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading transaction details…
          </CardContent>
        </Card>
      )}

      {/* ── Transaction Type Selection ─────────────────────────────────────── */}
      {pdfStep === 'type' && (
        <div className="space-y-6">
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold">What type of transaction is this?</h2>
            <p className="text-muted-foreground">
              {legacySideNeedsReview
                ? 'This older file does not clearly identify the representation side. Select a type only if you know it is correct; nothing is changed until you save.'
                : 'Select the transaction type to load the right form fields.'}
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl mx-auto">
            {/* Buyer */}
            <button
              type="button"
              onClick={() => {
                chooseTransactionType('buyer');
              }}
              className="group flex flex-col items-center gap-3 rounded-2xl border-2 border-blue-200 bg-blue-50 hover:border-blue-500 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/30 dark:hover:border-blue-500 p-6 text-center transition-all shadow-sm hover:shadow-md"
            >
              <div className="w-14 h-14 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center group-hover:bg-blue-200 transition-colors">
                <Home className="h-7 w-7 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-base font-bold text-blue-900 dark:text-blue-100">Buyer Transaction</p>
                <p className="text-xs text-blue-700 dark:text-blue-400 mt-0.5">You are representing the buyer</p>
              </div>
            </button>
            {/* New Listing */}
            <button
              type="button"
              onClick={() => {
                chooseTransactionType('listing');
              }}
              className="group flex flex-col items-center gap-3 rounded-2xl border-2 border-green-200 bg-green-50 hover:border-green-500 hover:bg-green-100 dark:border-green-800 dark:bg-green-950/30 dark:hover:border-green-500 p-6 text-center transition-all shadow-sm hover:shadow-md"
            >
              <div className="w-14 h-14 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center group-hover:bg-green-200 transition-colors">
                <List className="h-7 w-7 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-base font-bold text-green-900 dark:text-green-100">New Listing</p>
                <p className="text-xs text-green-700 dark:text-green-400 mt-0.5">You are the listing (seller) agent</p>
              </div>
            </button>
            {/* Dual Agency */}
            <button
              type="button"
              onClick={() => {
                chooseTransactionType('dual');
              }}
              className="group flex flex-col items-center gap-3 rounded-2xl border-2 border-purple-200 bg-purple-50 hover:border-purple-500 hover:bg-purple-100 dark:border-purple-800 dark:bg-purple-950/30 dark:hover:border-purple-500 p-6 text-center transition-all shadow-sm hover:shadow-md"
            >
              <div className="w-14 h-14 rounded-full bg-purple-100 dark:bg-purple-900 flex items-center justify-center group-hover:bg-purple-200 transition-colors">
                <Users className="h-7 w-7 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="text-base font-bold text-purple-900 dark:text-purple-100">Dual Agency</p>
                <p className="text-xs text-purple-700 dark:text-purple-400 mt-0.5">You represent both buyer and seller</p>
              </div>
            </button>
            {/* Outbound Referral */}
            <button
              type="button"
              onClick={() => {
                chooseTransactionType('referral');
              }}
              className="group flex flex-col items-center gap-3 rounded-2xl border-2 border-amber-200 bg-amber-50 hover:border-amber-500 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/30 dark:hover:border-amber-500 p-6 text-center transition-all shadow-sm hover:shadow-md"
            >
              <div className="w-14 h-14 rounded-full bg-amber-100 dark:bg-amber-900 flex items-center justify-center group-hover:bg-amber-200 transition-colors">
                <ArrowRightLeft className="h-7 w-7 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-base font-bold text-amber-900 dark:text-amber-100">Outbound Referral</p>
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">Referring out — receiving a referral check only</p>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* ── PDF Upload Landing ──────────────────────────────────────────────── */}
      {/* MLS Input Form upload — for listing transactions */}
      {pdfStep === 'upload' && watchedClosingType === 'listing' && (
        <Card className="border-2 border-dashed border-green-400/40 bg-green-50/50 dark:bg-green-950/20 hover:border-green-500/70 transition-colors">
          <CardContent className="py-12">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
                <ClipboardList className="h-8 w-8 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <h2 className="text-xl font-bold">Upload MLS Input Form</h2>
                <p className="text-muted-foreground mt-1 max-w-md">Upload your completed ROAM MLS Residential Input Form and we’ll auto-fill the listing details — property address, list price, seller info, property description, flood zone, legal description, and more.</p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 mt-2">
                <Button
                  type="button"
                  size="lg"
                  className="gap-2 bg-green-600 hover:bg-green-700 text-white"
                  onClick={() => mlsPdfInputRef.current?.click()}
                >
                  <UploadCloud className="h-5 w-5" /> Upload MLS Input Form
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  onClick={() => setPdfStep('form')}
                  className="gap-2"
                >
                  Skip — Fill Manually <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">PDF only · Max 25 MB · ROAM MLS Residential Input Form (text-based PDF)</p>
              <input
                ref={mlsPdfInputRef}
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleMlsPdfUpload(file);
                  e.target.value = '';
                }}
              />
            </div>
          </CardContent>
        </Card>
      )}
      {/* Purchase Agreement upload — for buyer / dual transactions */}
      {pdfStep === 'upload' && watchedClosingType !== 'listing' && (
        <Card className="border-2 border-dashed border-primary/30 bg-primary/5 hover:border-primary/60 transition-colors">
          <CardContent className="py-12">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Sparkles className="h-8 w-8 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-bold">Upload Purchase Agreement</h2>
                <p className="text-muted-foreground mt-1 max-w-md">Select your agreement type, then upload the PDF and we'll auto-fill the form — property address, dates, buyer/seller info, financing terms, and more.</p>
              </div>

              {/* Document type selector */}
              <div className="grid grid-cols-3 gap-3 w-full max-w-lg mt-1">
                <button
                  type="button"
                  onClick={() => setPdfDocType('residential')}
                  className={`flex flex-col items-center gap-2 rounded-xl border-2 p-4 text-center transition-all ${
                    pdfDocType === 'residential'
                      ? 'border-primary bg-primary/10 ring-2 ring-primary/30'
                      : 'border-muted-foreground/20 bg-background hover:border-primary/40 hover:bg-primary/5'
                  }`}
                >
                  <Home className="h-6 w-6 text-primary" />
                  <div>
                    <p className="text-sm font-semibold">Residential</p>
                    <p className="text-xs text-muted-foreground">LA LREC Agreement to Buy &amp; Sell</p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setPdfDocType('land')}
                  className={`flex flex-col items-center gap-2 rounded-xl border-2 p-4 text-center transition-all ${
                    pdfDocType === 'land'
                      ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/30 ring-2 ring-amber-400/30'
                      : 'border-muted-foreground/20 bg-background hover:border-amber-400/40 hover:bg-amber-50/50'
                  }`}
                >
                  <Trees className="h-6 w-6 text-amber-600" />
                  <div>
                    <p className="text-sm font-semibold">Vacant Land</p>
                    <p className="text-xs text-muted-foreground">LA Lot(s) or Vacant Land Agreement</p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setPdfDocType('commercial')}
                  className={`flex flex-col items-center gap-2 rounded-xl border-2 p-4 text-center transition-all ${
                    pdfDocType === 'commercial'
                      ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/30 ring-2 ring-blue-400/30'
                      : 'border-muted-foreground/20 bg-background hover:border-blue-400/40 hover:bg-blue-50/50'
                  }`}
                >
                  <Building2 className="h-6 w-6 text-blue-600" />
                  <div>
                    <p className="text-sm font-semibold">Commercial</p>
                    <p className="text-xs text-muted-foreground">LA Commercial Agreement to Buy &amp; Sell</p>
                  </div>
                </button>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 mt-2">
                <Button
                  type="button"
                  size="lg"
                  disabled={!pdfDocType}
                  onClick={() => {
                    if (pdfDocType === 'land') landPdfInputRef.current?.click();
                    else if (pdfDocType === 'commercial') commercialPdfInputRef.current?.click();
                    else pdfInputRef.current?.click();
                  }}
                  className="gap-2"
                >
                  <UploadCloud className="h-5 w-5" /> {pdfDocType ? `Upload ${pdfDocType === 'land' ? 'Land' : pdfDocType === 'commercial' ? 'Commercial' : 'Residential'} Agreement` : 'Select Agreement Type First'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  onClick={() => setPdfStep('form')}
                  className="gap-2"
                >
                  Skip — Fill Manually <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">PDF only · Max 25 MB · Text-based PDFs only (not scanned images)</p>
              {/* Residential agreement input */}
              <input
                ref={pdfInputRef}
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handlePdfUpload(file);
                  e.target.value = '';
                }}
              />
              {/* Land agreement input */}
              <input
                ref={landPdfInputRef}
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleLandPdfUpload(file);
                  e.target.value = '';
                }}
              />
              {/* Commercial agreement input */}
              <input
                ref={commercialPdfInputRef}
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleCommercialPdfUpload(file);
                  e.target.value = '';
                }}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Extracting spinner ─────────────────────────────────────────────── */}
      {pdfStep === 'extracting' && (
        <Card>
          <CardContent className="py-16">
            <div className="flex flex-col items-center text-center space-y-4">
              <Loader2 className="h-12 w-12 text-primary animate-spin" />
              <div>
                <h2 className="text-xl font-bold">
                  {watchedClosingType === 'listing' ? 'Reading MLS Input Form' : 'Reading Purchase Agreement'}
                </h2>
                <p className="text-muted-foreground mt-1">{watchedClosingType === 'listing' ? mlsPdfName : pdfName}</p>
                <p className="text-sm text-muted-foreground mt-2">
                  {watchedClosingType === 'listing'
                    ? 'Extracting property address, list price, seller info, property details, flood zone, and legal description...'
                    : 'Extracting property details, dates, contacts, and financing terms...'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── PDF source banner (shown after extraction) ─────────────────── */}
      {pdfStep === 'form' && (pdfName || mlsPdfName) && (
        <div className="flex items-center gap-3 rounded-xl border border-green-300 bg-green-50 dark:bg-green-950/30 dark:border-green-700 px-4 py-3">
          <FileText className="h-5 w-5 text-green-600 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-green-800 dark:text-green-300">
              {mlsPdfName ? 'Auto-filled from MLS Input Form' : 'Auto-filled from purchase agreement'}
            </p>
            <p className="text-xs text-green-700 dark:text-green-400 truncate">{mlsPdfName || pdfName}</p>
          </div>
          {pdfHighlightFields.size > 0 && (
            <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400 flex-shrink-0">
              <AlertCircle className="h-4 w-4" />
              <span className="text-xs font-medium">{pdfHighlightFields.size} fields need review</span>
            </div>
          )}
        </div>
      )}

      {/* Back to upload button — shown when agent skipped to manual */}
      {pdfStep === 'form' && !pdfName && !mlsPdfName && (
        <div className="flex items-center gap-3 rounded-xl border border-dashed border-muted-foreground/30 bg-muted/30 px-4 py-3">
          <Upload className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <p className="text-sm text-muted-foreground flex-1">
            {watchedClosingType === 'listing'
              ? 'Changed your mind? Upload your MLS Input Form to auto-fill the listing details.'
              : 'Changed your mind? Upload a purchase agreement to auto-fill the form.'}
          </p>
          <button
            type="button"
            onClick={() => { setPdfStep('upload'); setPdfName(''); setMlsPdfName(''); setPdfHighlightFields(new Set()); }}
            className="text-sm font-medium text-primary underline underline-offset-2 hover:text-primary/80 flex-shrink-0"
          >
            {watchedClosingType === 'listing' ? 'Upload MLS Form' : 'Upload PDF Instead'}
          </button>
        </div>
      )}

      {/* Form — only shown after PDF step */}
      {(pdfStep === 'form') && (<>

      {/* ── TC / Staff Queue Action Bar ─────────────────────────────────────
          Shown when opened from TC queue (?intakeId=...&role=tc) or
          staff queue (?intakeId=...&role=staff). Provides Approve, Save & Sync,
          and a back link — all using the same unified form below.
      ──────────────────────────────────────────────────────────────────────── */}
      {isTcQueueMode && intakeId && (
        <div className="sticky top-0 z-40 flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-primary/30 bg-background/95 backdrop-blur px-4 py-3 shadow-md mb-2">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                if (queueRole === 'staff') window.location.href = '/dashboard/admin/staff-queue';
                else window.location.href = '/dashboard/admin/tc';
              }}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              ← {queueRole === 'staff' ? 'Staff Queue' : 'TC Queue'}
            </button>
            <span className="text-xs text-muted-foreground">|</span>
            <span className="text-xs font-semibold text-foreground">
              {queueRole === 'staff' ? '📋 Staff Queue' : '📋 TC Queue'} — {queueRole === 'staff' ? 'Staff' : 'TC'} View
            </span>
            {intakeStatus && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                intakeStatus === 'approved' ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' :
                intakeStatus === 'in_review' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' :
                intakeStatus === 'rejected' ? 'bg-red-100 text-red-700' :
                'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
              }`}>
                {intakeStatus === 'approved' ? '✓ Approved' :
                 intakeStatus === 'in_review' ? '👁 In Review' :
                 intakeStatus === 'rejected' ? '✗ Rejected' :
                 '⏳ Submitted'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Save Changes — same as the bottom submit button but inline */}
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={submitting}
              onClick={() => form.handleSubmit(onSubmit, handleInvalidSubmit)()}
              className="text-xs"
            >
              {submitting ? <><Loader2 className="h-3 w-3 animate-spin mr-1" />Saving...</> : '💾 Save Changes'}
            </Button>
            {/* Approve — saves first then calls the approve API */}
            {intakeStatus !== 'approved' && (
              <Button
                type="button"
                size="sm"
                disabled={intakeApproving || submitting}
                onClick={async () => {
                  if (!user || !intakeId) return;
                  setIntakeApproving(true);
                  try {
                    // Save form first
                    lastSaveSucceededRef.current = false;
                    await form.handleSubmit(onSubmit, handleInvalidSubmit)();
                    if (!lastSaveSucceededRef.current) return;
                    // Then approve
                    const token = await user.getIdToken();
                    const apiPath = queueRole === 'staff'
                      ? `/api/admin/staff-queue/${intakeId}`
                      : `/api/admin/tc/${intakeId}`;
                    const res = await fetch(apiPath, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                      body: JSON.stringify({ action: 'approve' }),
                    });
                    const data = await res.json();
                    if (!res.ok || !data.ok) throw new Error(data.error || 'Approval failed');
                    setIntakeStatus('approved');
                    toast({ title: '✅ Transaction Approved', description: 'Saved and approved successfully.' });
                  } catch (err: any) {
                    toast({ title: 'Approval Failed', description: err.message, variant: 'destructive' });
                  } finally {
                    setIntakeApproving(false);
                  }
                }}
                className="text-xs bg-green-600 hover:bg-green-700 text-white"
              >
                {intakeApproving ? <><Loader2 className="h-3 w-3 animate-spin mr-1" />Approving...</> : '✓ Approve'}
              </Button>
            )}
            {intakeStatus === 'approved' && (
              <span className="text-xs text-green-700 dark:text-green-400 font-semibold">✓ Already Approved</span>
            )}
            {/* Archive, Reject, Delete — TC queue only */}
            {queueRole === 'tc' && (
              <>
                <Button
                  type="button" size="sm" variant="outline"
                  disabled={archiveSubmitting}
                  onClick={async () => {
                    if (!user || !intakeId) return;
                    if (!confirm('Archive this intake? It will be removed from the active TC queue but can be restored.')) return;
                    setArchiveSubmitting(true);
                    try {
                      const token = await user.getIdToken();
                      const res = await fetch(`/api/admin/tc/${intakeId}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                        body: JSON.stringify({ action: 'archive' }),
                      });
                      const data = await res.json();
                      if (!res.ok || !data.ok) throw new Error(data.error || 'Archive failed');
                      toast({ title: '📦 Archived', description: 'Intake moved to archive.' });
                      router.push('/dashboard/admin/tc');
                    } catch (err: any) {
                      toast({ title: 'Archive Failed', description: err.message, variant: 'destructive' });
                    } finally { setArchiveSubmitting(false); }
                  }}
                  className="text-xs border-amber-300 text-amber-700 hover:bg-amber-50"
                >
                  {archiveSubmitting ? <><Loader2 className="h-3 w-3 animate-spin mr-1" />Archiving...</> : '📦 Archive'}
                </Button>
                <Button
                  type="button" size="sm" variant="outline"
                  onClick={() => { setRejectReason(''); setRejectDialogOpen(true); }}
                  className="text-xs border-orange-300 text-orange-700 hover:bg-orange-50"
                >
                  ✗ Reject
                </Button>
                <Button
                  type="button" size="sm" variant="outline"
                  disabled={deleteSubmitting}
                  onClick={async () => {
                    if (!user || !intakeId) return;
                    if (!confirm('⚠️ PERMANENTLY DELETE this intake and its transaction? This cannot be undone. Use only for test/mock files.')) return;
                    setDeleteSubmitting(true);
                    try {
                      const token = await user.getIdToken();
                      const res = await fetch(`/api/admin/tc/${intakeId}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                        body: JSON.stringify({ action: 'remove' }),
                      });
                      const data = await res.json();
                      if (!res.ok || !data.ok) throw new Error(data.error || 'Delete failed');
                      toast({ title: '🗑 Deleted', description: 'Intake and transaction permanently deleted.' });
                      router.push('/dashboard/admin/tc');
                    } catch (err: any) {
                      toast({ title: 'Delete Failed', description: err.message, variant: 'destructive' });
                    } finally { setDeleteSubmitting(false); }
                  }}
                  className="text-xs border-red-300 text-red-700 hover:bg-red-50"
                >
                  {deleteSubmitting ? <><Loader2 className="h-3 w-3 animate-spin mr-1" />Deleting...</> : '🗑 Delete'}
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Reject Dialog */}
      {rejectDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background rounded-xl border shadow-xl p-6 max-w-md w-full mx-4 space-y-4">
            <h3 className="text-lg font-bold">Reject Intake</h3>
            <p className="text-sm text-muted-foreground">Provide a reason for rejection. This will be sent to the agent as a notification.</p>
            <textarea
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder="Reason for rejection (required)..."
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring min-h-[100px]"
            />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setRejectDialogOpen(false)}>Cancel</Button>
              <Button
                size="sm"
                disabled={rejectSubmitting || !rejectReason.trim()}
                onClick={async () => {
                  if (!user || !intakeId || !rejectReason.trim()) return;
                  setRejectSubmitting(true);
                  try {
                    const token = await user.getIdToken();
                    const res = await fetch(`/api/admin/tc/${intakeId}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                      body: JSON.stringify({ action: 'reject', rejectionReason: rejectReason.trim() }),
                    });
                    const data = await res.json();
                    if (!res.ok || !data.ok) throw new Error(data.error || 'Reject failed');
                    setIntakeStatus('rejected');
                    setRejectDialogOpen(false);
                    toast({ title: '✗ Rejected', description: 'Intake rejected and agent notified.' });
                  } catch (err: any) {
                    toast({ title: 'Reject Failed', description: err.message, variant: 'destructive' });
                  } finally { setRejectSubmitting(false); }
                }}
                className="bg-orange-600 hover:bg-orange-700 text-white"
              >
                {rejectSubmitting ? <><Loader2 className="h-3 w-3 animate-spin mr-1" />Rejecting...</> : 'Reject & Notify Agent'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Draft restore banner */}
      {hasDraft && !draftRestored && (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="text-xl">📝</span>
            <div>
              <p className="text-sm font-bold text-amber-800 dark:text-amber-300">You have an unsaved draft</p>
              <p className="text-xs text-amber-700 dark:text-amber-400">Would you like to restore your previous form data?</p>
            </div>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <Button size="sm" variant="outline" onClick={discardDraft} className="text-xs border-amber-300 text-amber-700 hover:bg-amber-100">Discard</Button>
            <Button size="sm" onClick={restoreDraft} className="text-xs bg-amber-600 hover:bg-amber-700 text-white">Restore Draft</Button>
          </div>
        </div>
      )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit, handleInvalidSubmit)} className="space-y-6">
          {isClosedAgentView && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-100">
              <p className="font-semibold">Closed transaction — review only</p>
              <p className="mt-1 text-xs">Agents cannot change a closed transaction. Admin, staff, and TC users retain correction access.</p>
            </div>
          )}
          <fieldset disabled={isClosedAgentView} className="m-0 min-w-0 border-0 p-0">

          {/* ═══════════════════════════════════════════════════════════════════
              SECTION 1 — PROPERTY / TRANSACTION DETAILS
          ═══════════════════════════════════════════════════════════════════ */}
          <Section title="Property / Transaction Details">
            {/* Agent selector — admin only */}
            {/* Agent selector — admin only, and only for NEW transactions (not edit mode) */}
            {isAdmin && !editMode && (
              <FormField control={form.control} name="agentId" render={({ field }) => (
                <FormItem>
                  <FormLabel>Agent <span className="text-destructive">*</span></FormLabel>
                  <Select
                    onValueChange={(val) => {
                      field.onChange(val);
                      const found = agents.find(a => a.agentId === val);
                      form.setValue('agentDisplayName', found?.agentName || '');
                    }}
                    value={field.value}
                    disabled={agentsLoading}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={agentsLoading ? 'Loading agents...' : 'Select an agent'} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {agents.map(a => (
                        <SelectItem key={a.agentId} value={a.agentId}>{a.agentName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            )}
            {/* In edit mode, show agent name as read-only — agent ownership cannot be changed */}
            {isAdmin && editMode && form.watch('agentDisplayName') && (
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-muted-foreground">Agent</label>
                <div className="flex items-center gap-2 px-3 py-2 bg-muted rounded-md text-sm font-medium">
                  👤 {form.watch('agentDisplayName')}
                  <span className="ml-auto text-xs text-muted-foreground">(read-only)</span>
                </div>
              </div>
            )}

            <Grid2>
              {/* The initial selection is authoritative for a new transaction,
                  so do not ask again. Existing files retain an in-form
                  correction control without returning to the add-flow start. */}
              {editMode && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium">Representation Side</label>
                  <Select value={watchedClosingType} onValueChange={(value) => applyRepresentationSide(value as TransactionSide)}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="buyer">Buyer — you represent the buyer</SelectItem>
                      <SelectItem value="listing">Listing — you represent the seller</SelectItem>
                      <SelectItem value="dual">Dual — you represent both sides</SelectItem>
                      <SelectItem value="referral">Outbound referral</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              <FormField control={form.control} name="dealType" render={({ field }) => (
                <FormItem>
                  <FormLabel>Deal / Property Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="residential_sale">Residential Sale</SelectItem>
                      <SelectItem value="residential_lease">Residential Lease</SelectItem>
                      <SelectItem value="land">Land</SelectItem>
                      <SelectItem value="commercial_listing">Commercial Lease/Sale</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            </Grid2>

            <FormField control={form.control} name="status" render={({ field }) => (
              <FormItem>
                <FormLabel>Listing / Transaction Status <span className="text-destructive">*</span></FormLabel>
                <Select value={field.value || ''} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a status (required)" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="coming_soon">Coming Soon</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="temp_off_market">Temp Off Market</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
                <FormDescription>Select the current status of this listing or transaction.</FormDescription>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="address" render={({ field }) => (
              <FormItem>
                <FormLabel>Property Address {watchedClosingType !== 'referral' && <span className="text-destructive">*</span>} {watchedClosingType === 'referral' && <span className="text-muted-foreground font-normal text-xs">(optional)</span>}</FormLabel>
                <FormControl><Input placeholder="123 Main St, Lafayette, LA 70508" {...field} /></FormControl>
                {watchedClosingType === 'referral' && <FormDescription>Enter the property address when known. It is not required for a referral.</FormDescription>}
                <FormMessage />
              </FormItem>
            )} />

            <Grid2>
              {/* Client Name removed — use Buyer/Seller Information section below */}
              <FormField control={form.control} name="dealSource" render={({ field }) => (
                <FormItem>
                  <FormLabel>Lead Source</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Where did this lead come from?" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {SOURCES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            </Grid2>
            {/* Client email/phone removed — captured in Buyer/Seller Information section below */}

            {/* ── Pricing fields (listing/dual: list price; buyer/dual: sale price) ── */}
            <Grid2>
              {/* List Price — listing and dual only */}
              {(watchedClosingType === 'listing' || watchedClosingType === 'dual') && (
                <FormField control={form.control} name="listPrice" render={({ field }) => (
                  <FormItem>
                    <FormLabel>List Price ($)</FormLabel>
                    <FormControl>
                      <CurrencyInput value={field.value as any} onChange={(val) => field.onChange(val)} placeholder="0" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              )}
              {/* Sale Price — buyer and dual only (listing shows this when going pending) */}
              {(watchedClosingType === 'buyer' || watchedClosingType === 'dual' || isPendingListing) && (
                <FormField control={form.control} name="salePrice" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sale / Contract Price ($)</FormLabel>
                    <FormControl>
                      <CurrencyInput value={field.value as any} onChange={(val) => field.onChange(val)} placeholder="0" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              )}
            </Grid2>

            {/* ── Listing Commission block (listing transactions) ── */}
            {watchedClosingType === 'listing' && (() => {
              const listingPct = Number(watchedSellerPayingListing) || 0;
              const buyerPct = Number(watchedSellerPayingBuyer) || 0;
              const totalPct = listingPct + buyerPct;
              const lp = Number(watchedListPrice) || 0;
              const estimatedGci = lp > 0 && listingPct > 0 ? Math.round(lp * listingPct / 100) : null;
              return (
                <div className="space-y-4 rounded-lg border border-green-200 dark:border-green-700 bg-green-50 dark:bg-green-950/20 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-green-800 dark:text-green-300">Listing Commission</p>
                    {estimatedGci !== null && (
                      <span className="text-sm font-bold text-green-700 dark:text-green-400">
                        Est. GCI: ${estimatedGci.toLocaleString('en-US')}
                      </span>
                    )}
                  </div>
                  <Grid2>
                    <FormField control={form.control} name="sellerPayingListingAgent" render={({ field }) => (
                      <FormItem>
                        <FormLabel>% Seller Paying Listing Agent</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <PercentInput value={field.value as any} onChange={(e) => field.onChange(e)} placeholder="3" />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
                          </div>
                        </FormControl>
                        <FormDescription>Your listing side commission %</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="sellerPayingBuyerAgent" render={({ field }) => (
                      <FormItem>
                        <FormLabel>% Seller Paying Buyer&apos;s Agent</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <PercentInput value={field.value as any} onChange={(e) => field.onChange(e)} placeholder="3" />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
                          </div>
                        </FormControl>
                        <FormDescription>Offered to buyer&apos;s agent</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </Grid2>
                  {totalPct > 0 && (
                    <div className="flex items-center gap-6 text-sm text-green-700 dark:text-green-400">
                      <span>Total commission: <strong>{totalPct}%</strong></span>
                      {lp > 0 && <span>= <strong>${Math.round(lp * totalPct / 100).toLocaleString('en-US')}</strong> total</span>}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Estimated based on list price — will be recalculated at closing.
                  </p>
                </div>
              );
            })()}

            {/* ── Commercial Lease/Sale fields ── */}
            {isCommercialListing && (
              <div className="space-y-4 rounded-lg border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/20 p-4">
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Commercial Property Details</p>

                {/* For Sale toggle */}
                <FormField control={form.control} name="commercialForSale" render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border bg-background p-3">
                    <div className="space-y-0.5">
                      <FormLabel className="text-sm">Listed for Sale?</FormLabel>
                      <FormDescription className="text-xs">Is this property available for purchase?</FormDescription>
                    </div>
                    <FormControl>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={!!field.value}
                        onClick={() => field.onChange(!field.value)}
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                          field.value ? 'bg-primary' : 'bg-input'
                        }`}
                      >
                        <span className={`pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform ${
                          field.value ? 'translate-x-4' : 'translate-x-0'
                        }`} />
                      </button>
                    </FormControl>
                  </FormItem>
                )} />

                {watchedCommForSale && (
                  <div className="max-w-xs">
                    <FormField control={form.control} name="commercialSalePrice" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Sale Price ($)</FormLabel>
                        <FormControl>
                          <CurrencyInput value={field.value as any} onChange={(val) => field.onChange(val)} placeholder="0" />
                        </FormControl>
                      </FormItem>
                    )} />
                  </div>
                )}

                {/* For Lease toggle */}
                <FormField control={form.control} name="commercialForLease" render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border bg-background p-3">
                    <div className="space-y-0.5">
                      <FormLabel className="text-sm">Listed for Lease?</FormLabel>
                      <FormDescription className="text-xs">Is this property available to lease?</FormDescription>
                    </div>
                    <FormControl>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={!!field.value}
                        onClick={() => field.onChange(!field.value)}
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                          field.value ? 'bg-primary' : 'bg-input'
                        }`}
                      >
                        <span className={`pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform ${
                          field.value ? 'translate-x-4' : 'translate-x-0'
                        }`} />
                      </button>
                    </FormControl>
                  </FormItem>
                )} />

                {watchedCommForLease && (
                  <div className="space-y-4">
                    <Grid3>
                      <FormField control={form.control} name="commercialLeaseMonthly" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Lease Price / Month ($)</FormLabel>
                          <FormControl>
                            <CurrencyInput value={field.value as any} onChange={(val) => field.onChange(val)} placeholder="0" />
                          </FormControl>
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="commercialLeasePricePerSqft" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Lease Price / Sq Ft ($)</FormLabel>
                          <FormControl>
                            <CurrencyInput value={field.value as any} onChange={(val) => field.onChange(val)} placeholder="0" />
                          </FormControl>
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="commercialLeaseTerm" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Lease Term (years)</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.5" min="0" placeholder="e.g. 5" {...field} />
                          </FormControl>
                        </FormItem>
                      )} />
                    </Grid3>

                    {/* Auto-calculated total lease value */}
                    {Number(form.watch('commercialTotalLeaseValue')) > 0 && (
                      <div className="rounded-md bg-background border px-4 py-3 text-sm">
                        <span className="text-muted-foreground">Total Lease Value: </span>
                        <span className="font-semibold text-primary">
                          ${Number(form.watch('commercialTotalLeaseValue')).toLocaleString('en-US', { minimumFractionDigits: 0 })}
                        </span>
                        <span className="text-muted-foreground text-xs ml-2">
                          (${Number(form.watch('commercialLeaseMonthly') || 0).toLocaleString()}/mo × 12 × {Number(form.watch('commercialLeaseTerm') || 0)} yrs)
                        </span>
                      </div>
                    )}

                    {/* Commission for lease */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Lease Commission</p>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-medium ${commLeaseMode === 'percent' ? 'text-primary' : 'text-muted-foreground'}`}>%</span>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={commLeaseMode === 'flat'}
                            onClick={() => {
                              const next = commLeaseMode === 'percent' ? 'flat' : 'percent';
                              setCommLeaseMode(next);
                              form.setValue('commercialLeaseCommissionMode', next);
                              form.setValue('commercialLeaseCommissionPct', '' as any);
                              form.setValue('commercialLeaseCommissionFlat', '' as any);
                              form.setValue('commercialLeaseGci', '' as any);
                              form.setValue('commercialLeaseEffectivePct', '' as any);
                            }}
                            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                              commLeaseMode === 'flat' ? 'bg-primary' : 'bg-input'
                            }`}
                          >
                            <span className={`pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform ${
                              commLeaseMode === 'flat' ? 'translate-x-4' : 'translate-x-0'
                            }`} />
                          </button>
                          <span className={`text-xs font-medium ${commLeaseMode === 'flat' ? 'text-primary' : 'text-muted-foreground'}`}>Flat $</span>
                        </div>
                      </div>

                      <Grid2>
                        {commLeaseMode === 'percent' ? (
                          <FormField control={form.control} name="commercialLeaseCommissionPct" render={({ field }) => (
                            <FormItem>
                              <FormLabel>Commission %</FormLabel>
                              <FormControl>
                                <div className="relative">
                                  <PercentInput value={field.value as any} onChange={(e) => field.onChange(e)} placeholder="3" />
                                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
                                </div>
                              </FormControl>
                            </FormItem>
                          )} />
                        ) : (
                          <FormField control={form.control} name="commercialLeaseCommissionFlat" render={({ field }) => (
                            <FormItem>
                              <FormLabel>Flat Commission ($)</FormLabel>
                              <FormControl>
                                <CurrencyInput value={field.value as any} onChange={(val) => field.onChange(val)} placeholder="0" />
                              </FormControl>
                            </FormItem>
                          )} />
                        )}

                        <FormField control={form.control} name="commercialLeaseGci" render={({ field }) => (
                          <FormItem>
                            <FormLabel>GCI ($) {commLeaseMode === 'flat' && Number(form.watch('commercialLeaseEffectivePct')) > 0 && (
                              <span className="text-xs text-muted-foreground font-normal ml-1">({Number(form.watch('commercialLeaseEffectivePct')).toFixed(2)}% effective)</span>
                            )}</FormLabel>
                            <FormControl>
                              <CurrencyInput value={field.value as any} onChange={(val) => field.onChange(val)} placeholder="Auto-calculated" readOnly className="bg-muted cursor-default" />
                            </FormControl>
                            <FormDescription>Auto-calculated from lease value × commission</FormDescription>
                          </FormItem>
                        )} />
                      </Grid2>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TC Working File */}
            <FormField control={form.control} name="tcWorking" render={({ field }) => (
              <FormItem>
                <div className="flex items-center gap-1.5">
                  <FormLabel>
                    Are you working with a TC?{' '}
                    <span className="text-destructive">*</span>
                  </FormLabel>
                  <TooltipProvider delayDuration={100}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button type="button" className="inline-flex items-center text-muted-foreground hover:text-foreground transition-colors">
                          <Info className="h-3.5 w-3.5" />
                          <span className="sr-only">TC info</span>
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-xs text-sm leading-snug">
                        <p className="font-semibold mb-1">Working with a Transaction Coordinator?</p>
                        <p>
                          Select <strong>Yes</strong> if a TC will be assisting with this file at any stage —
                          including <strong>listings</strong> and <strong>under-contract</strong> transactions.
                          Even if the TC only steps in later, select Yes now so the file is routed to the
                          TC queue from the start.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl><SelectTrigger><SelectValue placeholder="Select Yes or No..." /></SelectTrigger></FormControl>
                  <SelectContent>
                    <SelectItem value="yes">Yes — TC will be working this file</SelectItem>
                    <SelectItem value="no">No — I am handling this myself</SelectItem>
                  </SelectContent>
                </Select>
                <FormDescription>
                  Required. If Yes, this transaction will be routed to the TC queue for processing.
                  Select Yes even for listings if a TC will be involved at any point.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )} />
          </Section>

          {/* ═══════════════════════════════════════════════════════════════════
              SECTION 1B — AGENT PARTICIPATION (CO-AGENT)
          ═══════════════════════════════════════════════════════════════════ */}
          <Section
            title="Agent Participation"
            description="Is another internal agent co-representing on this transaction?"
          >
            {/* Co-agent toggle */}
            <FormField control={form.control} name="hasCoAgent" render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <FormLabel className="text-base">Co-Agent on This Transaction</FormLabel>
                  <FormDescription>
                    Enable if another agent from this brokerage is sharing this side with you.
                    Their commission will be calculated separately from their own profile.
                  </FormDescription>
                </div>
                <FormControl>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={!!field.value}
                    onClick={() => field.onChange(!field.value)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                      field.value ? 'bg-primary' : 'bg-input'
                    }`}
                  >
                    <span
                      className={`pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform ${
                        field.value ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </FormControl>
              </FormItem>
            )} />

            {/* Co-agent fields — shown only when hasCoAgent is true */}
            {hasCoAgent && (
              <div className="space-y-5 rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800 p-4">
                <p className="text-sm font-medium text-blue-800 dark:text-blue-300">
                  Co-Agent Details
                </p>

                <Grid2>
                  {/* Co-agent selector */}
                  <FormField control={form.control} name="coAgentId" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Co-Agent <span className="text-destructive">*</span></FormLabel>
                      <Select
                        onValueChange={(val) => {
                          field.onChange(val);
                          const found = agents.find(a => a.agentId === val);
                          form.setValue('coAgentDisplayName', found?.agentName || '');
                        }}
                        value={field.value}
                        disabled={agentsLoading}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={agentsLoading ? 'Loading agents...' : 'Select co-agent'} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {agents.map(a => (
                            <SelectItem key={a.agentId} value={a.agentId}>{a.agentName}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />

                  {/* Co-agent role */}
                  <FormField control={form.control} name="coAgentRole" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Co-Agent Role</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="co_list">Co-Listing Agent</SelectItem>
                          <SelectItem value="co_buyer">Co-Buyer Agent</SelectItem>
                          <SelectItem value="referral">Referral</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                </Grid2>

                {/* Split percentages */}
                <div className="space-y-3">
                  <p className="text-sm font-medium">Commission Split</p>
                  <p className="text-xs text-muted-foreground">
                    The side gross commission will be divided by these percentages first.
                    Each agent&apos;s own commission structure (tiers or fixed) is then applied
                    to their respective share.
                  </p>
                  <Grid2>
                    <FormField control={form.control} name="primaryAgentSplitPercent" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Primary Agent Split %</FormLabel>
                        <FormControl>
                          <PercentInput
                            value={field.value as any}
                            placeholder="50"
                            onChange={(e) => {
                              field.onChange(e);
                              const p = Number(e.target.value || 0);
                              form.setValue('coAgentSplitPercent', 100 - p);
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="coAgentSplitPercent" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Co-Agent Split %</FormLabel>
                        <FormControl>
                          <PercentInput
                            value={field.value as any}
                            placeholder="50"
                            onChange={(e) => {
                              field.onChange(e);
                              const c = Number(e.target.value || 0);
                              form.setValue('primaryAgentSplitPercent', 100 - c);
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </Grid2>
                  {/* Live split total indicator */}
                  <div className={`flex items-center gap-2 text-sm font-medium ${
                    Math.abs(splitTotal - 100) < 0.01 ? 'text-green-600' : 'text-destructive'
                  }`}>
                    <span>Total: {splitTotal.toFixed(1)}%</span>
                    {Math.abs(splitTotal - 100) < 0.01
                      ? <span className="text-xs font-normal text-muted-foreground">✓ Splits are balanced</span>
                      : <span className="text-xs font-normal">— must equal 100%</span>
                    }
                  </div>
                </div>

                {/* Live split preview */}
                {(() => {
                  const gci = Number(form.watch('gci') || 0);
                  const sp = Number(form.watch('salePrice') || 0);
                  const primaryName = form.watch('agentDisplayName') || 'Primary Agent';
                  const coName = form.watch('coAgentDisplayName') || 'Co-Agent';
                  const pPct = watchedPrimaryPct;
                  const cPct = watchedCoPct;
                  const fmt = (n: number) => n > 0 ? '$' + Math.round(n).toLocaleString() : '—';
                  // ── Referral fee deduction ──────────────────────────────────────────────────
                  // Co-agent splits are calculated on post-referral GCI, not gross GCI.
                  const _hasRef = form.watch('hasOutboundReferral');
                  const _refPct = Number(form.watch('outboundReferralFeePercent') || 0);
                  const _refDollar = Number(form.watch('outboundReferralFeeDollar') || 0);
                  const _refFee = _hasRef && _refPct > 0
                    ? (_refDollar > 0 ? _refDollar : Math.round(gci * (_refPct / 100) * 100) / 100)
                    : 0;
                  const _netGci = Math.max(0, gci - _refFee);
                  if (gci <= 0 && sp <= 0) return null;
                  return (
                    <div className="rounded-lg border border-blue-300 bg-white p-3 space-y-2">
                      <p className="text-xs font-bold text-blue-800">Live Split Preview</p>
                      {_refFee > 0 && (
                        <p className="text-[10px] text-orange-600 font-medium">
                          ⚠️ {_refPct}% referral fee (${Math.round(_refFee).toLocaleString()}) deducted from GCI. Splits based on ${Math.round(_netGci).toLocaleString()} net.
                        </p>
                      )}
                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-md bg-blue-50 border border-blue-200 p-2 text-center">
                          <p className="text-[10px] font-semibold text-blue-600 truncate">{primaryName}</p>
                          <p className="text-sm font-bold text-gray-900">{pPct}%</p>
                          {sp > 0 && <p className="text-[10px] text-gray-500">Vol: {fmt(sp * pPct / 100)}</p>}
                          {gci > 0 && <p className="text-[10px] text-green-700 font-semibold">GCI: {fmt(_netGci * pPct / 100)}</p>}
                        </div>
                        <div className="rounded-md bg-indigo-50 border border-indigo-200 p-2 text-center">
                          <p className="text-[10px] font-semibold text-indigo-600 truncate">{coName}</p>
                          <p className="text-sm font-bold text-gray-900">{cPct}%</p>
                          {sp > 0 && <p className="text-[10px] text-gray-500">Vol: {fmt(sp * cPct / 100)}</p>}
                          {gci > 0 && <p className="text-[10px] text-green-700 font-semibold">GCI: {fmt(_netGci * cPct / 100)}</p>}
                        </div>
                      </div>
                      <p className="text-[10px] text-blue-600 italic">
                        ✓ This one shared transaction stays intact. Sale price, volume, GCI, closed-unit credit, and fees are allocated to each participant when the transaction is marked Closed.
                        Each agent’s individual commission tier is applied to their allocated share.
                      </p>
                    </div>
                  );
                })()}

                {/* Hidden field for co-agent display name */}
                <input type="hidden" {...form.register('coAgentDisplayName')} />
              </div>
            )}

            {/* ── Outbound Referral Fee ─────────────────────────────────────── */}
            {watchedClosingType !== 'referral' && (
              <div className="border rounded-lg p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">Outbound Referral Fee</p>
                    <p className="text-xs text-muted-foreground">Paid to an outside broker or relocation company. This % is deducted from GCI before the agent/broker split.</p>
                  </div>
                  <FormField control={form.control} name="hasOutboundReferral" render={({ field }) => (
                    <button
                      type="button"
                      role="switch"
                      aria-checked={!!field.value}
                      onClick={() => field.onChange(!field.value)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                        field.value ? 'bg-primary' : 'bg-input'
                      }`}
                    >
                      <span className={`pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform ${
                        field.value ? 'translate-x-5' : 'translate-x-0'
                      }`} />
                    </button>
                  )} />
                </div>

                {hasOutboundReferral && (
                  <div className="space-y-4">
                    <Grid2>
                      <FormField control={form.control} name="outboundReferralFeePercent" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Referral % <span className="text-destructive">*</span></FormLabel>
                          <FormControl>
                            <PercentInput
                              value={field.value as any}
                              placeholder="e.g. 25"
                              onChange={(e) => {
                                field.onChange(e);
                                const pct = Number(e.target.value) || 0;
                                const gci = Number(form.getValues('gci')) || 0;
                                if (pct > 0 && gci > 0) {
                                  form.setValue('outboundReferralFeeDollar', Math.round(gci * (pct / 100) * 100) / 100 as any);
                                }
                              }}
                            />
                          </FormControl>
                          <FormDescription className="text-xs">Percentage of GCI paid to the outside broker (e.g. 25 for 25%)</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="outboundReferralFeeDollar" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Referral Dollar Amount</FormLabel>
                          <FormControl>
                            <Input type="number" min={0} step={0.01} placeholder="Auto-calculated" {...field} />
                          </FormControl>
                          <FormDescription className="text-xs">Auto-calculated from % above. Override if needed.</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </Grid2>
                    <Grid2>
                      <FormField control={form.control} name="outboundReferralBrokerage" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Outside Broker / Company Name</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g. Keller Williams Dallas or Cartus Relocation" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="outboundReferralAgentName" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Referring Agent / Contact Name</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g. John Smith" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </Grid2>
                    {watchedReferralPct > 0 && (() => {
                      const gci = Number(form.watch('gci')) || 0;
                      const dollar = watchedReferralDollar || (gci > 0 ? Math.round(gci * (watchedReferralPct / 100) * 100) / 100 : 0);
                      const net = gci - dollar;
                      if (gci > 0) return (
                        <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800 space-y-1 dark:bg-amber-950/20 dark:border-amber-700 dark:text-amber-300">
                          <p className="font-semibold">Referral Fee Summary</p>
                          <p>Gross GCI: <strong>${gci.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></p>
                          <p>Referral Fee ({watchedReferralPct}%): <strong>-${dollar.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></p>
                          <p>Net to Agent/Broker Split: <strong>${net.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></p>
                        </div>
                      );
                      return null;
                    })()}
                  </div>
                )}
              </div>
            )}
          </Section>

          {/* ═══════════════════════════════════════════════════════════════════
              SECTION 2 — KEY DATES
          ═══════════════════════════════════════════════════════════════════ */}
          <Section title="Key Dates">
            {/* Listing lifecycle dates remain visible through every listing status. */}
            {isListingSideTransaction && (
              <Grid3>
                <FormField control={form.control} name="listingDate" render={({ field }) => (
                  <FormItem><FormLabel>Listing Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl></FormItem>
                )} />
                <FormField control={form.control} name="listingExpirationDate" render={({ field }) => (
                  <FormItem><FormLabel>Listing Expiration Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl></FormItem>
                )} />
              </Grid3>
            )}
            {/* Contract / closing dates — shown for buyer and dual only */}
            {(watchedClosingType === 'buyer' || watchedClosingType === 'dual' || isPendingListing) && (
              <>
                <Grid3>
                  <FormField control={form.control} name="contractDate" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Under Contract Date</FormLabel>
                      <FormControl><Input type="date" {...field} /></FormControl>
                      <FormDescription>Leave blank if not yet under contract.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="inspectionDeadline" render={({ field }) => (
                    <FormItem><FormLabel>Inspection Deadline</FormLabel><FormControl><Input type="date" {...field} /></FormControl></FormItem>
                  )} />
                  <FormField control={form.control} name="surveyDeadline" render={({ field }) => (
                    <FormItem><FormLabel>Survey Deadline</FormLabel><FormControl><Input type="date" {...field} /></FormControl></FormItem>
                  )} />
                </Grid3>
                <Grid3>
                  <FormField control={form.control} name="projectedCloseDate" render={({ field }) => (
                    <FormItem><FormLabel>Projected Close Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl></FormItem>
                  )} />
                  <FormField control={form.control} name="loanApplicationDeadline" render={({ field }) => (
                    <FormItem><FormLabel>Loan Application Deadline</FormLabel><FormControl><Input type="date" {...field} /></FormControl></FormItem>
                  )} />
                  <FormField control={form.control} name="appraisalDeadline" render={({ field }) => (
                    <FormItem><FormLabel>Appraisal Deadline</FormLabel><FormControl><Input type="date" {...field} /></FormControl></FormItem>
                  )} />
                </Grid3>
                <Grid3>
                  <FormField control={form.control} name="titleDeadline" render={({ field }) => (
                    <FormItem><FormLabel>Title Deadline</FormLabel><FormControl><Input type="date" {...field} /></FormControl></FormItem>
                  )} />
                  <FormField control={form.control} name="finalLoanCommitmentDeadline" render={({ field }) => (
                    <FormItem><FormLabel>Final Loan Commitment Deadline</FormLabel><FormControl><Input type="date" {...field} /></FormControl></FormItem>
                  )} />
                  <FormField control={form.control} name="closedDate" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Actual Close Date</FormLabel>
                      <FormControl><Input type="date" {...field} /></FormControl>
                      <FormDescription>
                        {isAdmin ? 'Sets status to Closed automatically.' : 'Leave blank if not yet closed.'}
                      </FormDescription>
                    </FormItem>
                  )} />
                </Grid3>
                {(form.watch('dealType') === 'commercial_sale' || form.watch('dealType') === 'commercial_lease') && (
                  <Card className="border-slate-200 bg-slate-50/60">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Commercial Agreement Terms</CardTitle>
                      <CardDescription>These printed periods remain visible even when the agreement does not provide an effective date for calculating a calendar deadline.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <FormField control={form.control} name="appraisalConditioned" render={({ field }) => (
                        <FormItem className="flex items-center justify-between rounded-md border bg-background px-3 py-2">
                          <div><FormLabel>Sale is conditioned on appraisal</FormLabel><FormDescription>Commercial agreement appraisal contingency.</FormDescription></div>
                          <FormControl><Switch checked={Boolean(field.value)} onCheckedChange={field.onChange} /></FormControl>
                        </FormItem>
                      )} />
                      <Grid3>
                        <FormField control={form.control} name="appraisalPeriodDays" render={({ field }) => (
                          <FormItem><FormLabel>Appraisal Period (days)</FormLabel><FormControl><Input type="number" min="0" {...field} /></FormControl></FormItem>
                        )} />
                        <FormField control={form.control} name="depositDueDays" render={({ field }) => (
                          <FormItem><FormLabel>Deposit Due (days)</FormLabel><FormControl><Input type="number" min="0" {...field} /></FormControl></FormItem>
                        )} />
                        <FormField control={form.control} name="financingCommitmentDays" render={({ field }) => (
                          <FormItem><FormLabel>Final Loan Commitment (days)</FormLabel><FormControl><Input type="number" min="0" {...field} /></FormControl></FormItem>
                        )} />
                      </Grid3>
                      <Grid3>
                        <FormField control={form.control} name="closingDays" render={({ field }) => (
                          <FormItem><FormLabel>Close After Due Diligence (days)</FormLabel><FormControl><Input type="number" min="0" {...field} /></FormControl></FormItem>
                        )} />
                      </Grid3>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
            {/* For listing-only: show close date only when NOT active (pending/closed) */}
            {watchedClosingType === 'listing' && !isActiveListing && (
              <Grid3>
                <FormField control={form.control} name="closedDate" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Actual Close Date</FormLabel>
                    <FormControl><Input type="date" {...field} /></FormControl>
                    <FormDescription>Leave blank if not yet closed.</FormDescription>
                  </FormItem>
                )} />
              </Grid3>
            )}
          </Section>

          {/* ═══════════════════════════════════════════════════════════════════
              SECTION 3 — BUYER / SELLER INFORMATION
          ═══════════════════════════════════════════════════════════════════ */}
          {/* Pending listing banner — shows when a listing goes pending */}
          {isPendingListing && (
            <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-700 px-4 py-3">
              <span className="text-xl flex-shrink-0">🏠→📋</span>
              <div>
                <p className="text-sm font-semibold text-blue-800 dark:text-blue-300">Listing is now Pending — Contract fields unlocked</p>
                <p className="text-xs text-blue-700 dark:text-blue-400 mt-0.5">
                  Fill in the buyer contact, lender, title company, and contract dates below. All listing details above are preserved.
                </p>
              </div>
            </div>
          )}
          {/* Buyer/Seller section — hidden for outbound referral */}
          {watchedClosingType !== 'referral' && <Section title="Buyer / Seller Information">

            {/* Buyer section */}
            {(clientType === 'buyer' || clientType === 'dual' || isPendingListing) && (
              <>
                <Separator className="my-2" />
                <p className="text-sm font-semibold text-primary">Buyer Information</p>
                <Grid3>
                  <FormField control={form.control} name="buyerName" render={({ field }) => (
                    <FormItem><FormLabel>Buyer Name</FormLabel><FormControl><Input placeholder="Primary buyer" {...field} /></FormControl></FormItem>
                  )} />
                  <FormField control={form.control} name="buyerEmail" render={({ field }) => (
                    <FormItem><FormLabel>Buyer Email</FormLabel><FormControl><Input type="email" placeholder="buyer@email.com" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="buyerPhone" render={({ field }) => (
                    <FormItem><FormLabel>Buyer Phone</FormLabel><FormControl><Input type="tel" placeholder="(337) 555-1234" {...field} /></FormControl></FormItem>
                  )} />
                </Grid3>
                <p className="text-xs text-muted-foreground mt-1">Second Buyer (co-buyer, spouse, etc.)</p>
                <Grid3>
                  <FormField control={form.control} name="buyer2Name" render={({ field }) => (
                    <FormItem><FormLabel>Name</FormLabel><FormControl><Input placeholder="Optional" {...field} /></FormControl></FormItem>
                  )} />
                  <FormField control={form.control} name="buyer2Email" render={({ field }) => (
                    <FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" placeholder="Optional" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="buyer2Phone" render={({ field }) => (
                    <FormItem><FormLabel>Phone</FormLabel><FormControl><Input type="tel" placeholder="Optional" {...field} /></FormControl></FormItem>
                  )} />
                </Grid3>
                {/* 3rd Buyer */}
                {showBuyer3 ? (
                  <>
                    <div className="flex items-center justify-between mt-1">
                      <p className="text-xs text-muted-foreground">Third Buyer</p>
                      <Button type="button" variant="ghost" size="sm" className="h-6 text-xs text-destructive" onClick={() => { setShowBuyer3(false); setShowBuyer4(false); form.setValue('buyer3Name', ''); form.setValue('buyer3Email', ''); form.setValue('buyer3Phone', ''); form.setValue('buyer4Name', ''); form.setValue('buyer4Email', ''); form.setValue('buyer4Phone', ''); }}><Trash2 className="h-3 w-3 mr-1" />Remove</Button>
                    </div>
                    <Grid3>
                      <FormField control={form.control} name="buyer3Name" render={({ field }) => (
                        <FormItem><FormLabel>Name</FormLabel><FormControl><Input placeholder="Optional" {...field} /></FormControl></FormItem>
                      )} />
                      <FormField control={form.control} name="buyer3Email" render={({ field }) => (
                        <FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" placeholder="Optional" {...field} /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={form.control} name="buyer3Phone" render={({ field }) => (
                        <FormItem><FormLabel>Phone</FormLabel><FormControl><Input type="tel" placeholder="Optional" {...field} /></FormControl></FormItem>
                      )} />
                    </Grid3>
                  </>
                ) : (
                  <Button type="button" variant="outline" size="sm" className="mt-1 text-xs" onClick={() => setShowBuyer3(true)}><PlusCircle className="h-3 w-3 mr-1" />Add 3rd Buyer</Button>
                )}
                {/* 4th Buyer */}
                {showBuyer3 && (showBuyer4 ? (
                  <>
                    <div className="flex items-center justify-between mt-1">
                      <p className="text-xs text-muted-foreground">Fourth Buyer</p>
                      <Button type="button" variant="ghost" size="sm" className="h-6 text-xs text-destructive" onClick={() => { setShowBuyer4(false); form.setValue('buyer4Name', ''); form.setValue('buyer4Email', ''); form.setValue('buyer4Phone', ''); }}><Trash2 className="h-3 w-3 mr-1" />Remove</Button>
                    </div>
                    <Grid3>
                      <FormField control={form.control} name="buyer4Name" render={({ field }) => (
                        <FormItem><FormLabel>Name</FormLabel><FormControl><Input placeholder="Optional" {...field} /></FormControl></FormItem>
                      )} />
                      <FormField control={form.control} name="buyer4Email" render={({ field }) => (
                        <FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" placeholder="Optional" {...field} /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={form.control} name="buyer4Phone" render={({ field }) => (
                        <FormItem><FormLabel>Phone</FormLabel><FormControl><Input type="tel" placeholder="Optional" {...field} /></FormControl></FormItem>
                      )} />
                    </Grid3>
                  </>
                ) : (
                  <Button type="button" variant="outline" size="sm" className="mt-1 text-xs" onClick={() => setShowBuyer4(true)}><PlusCircle className="h-3 w-3 mr-1" />Add 4th Buyer</Button>
                ))}
              </>
            )}

            {/* Seller section — hidden when closingType is 'buyer' */}
            {showSellerInfo && (clientType === 'seller' || clientType === 'dual') && (
              <>
                <Separator className="my-2" />
                <p className="text-sm font-semibold text-primary">Seller Information</p>
                <Grid3>
                  <FormField control={form.control} name="sellerName" render={({ field }) => (
                    <FormItem><FormLabel>Seller Name</FormLabel><FormControl><Input placeholder="Primary seller" {...field} /></FormControl></FormItem>
                  )} />
                  <FormField control={form.control} name="sellerEmail" render={({ field }) => (
                    <FormItem><FormLabel>Seller Email</FormLabel><FormControl><Input type="email" placeholder="seller@email.com" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="sellerPhone" render={({ field }) => (
                    <FormItem><FormLabel>Seller Phone</FormLabel><FormControl><Input type="tel" placeholder="(337) 555-5678" {...field} /></FormControl></FormItem>
                  )} />
                </Grid3>
                <p className="text-xs text-muted-foreground mt-1">Second Seller (co-seller, spouse, etc.)</p>
                <Grid3>
                  <FormField control={form.control} name="seller2Name" render={({ field }) => (
                    <FormItem><FormLabel>Name</FormLabel><FormControl><Input placeholder="Optional" {...field} /></FormControl></FormItem>
                  )} />
                  <FormField control={form.control} name="seller2Email" render={({ field }) => (
                    <FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" placeholder="Optional" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="seller2Phone" render={({ field }) => (
                    <FormItem><FormLabel>Phone</FormLabel><FormControl><Input type="tel" placeholder="Optional" {...field} /></FormControl></FormItem>
                  )} />
                </Grid3>
                {/* 3rd Seller */}
                {showSeller3 ? (
                  <>
                    <div className="flex items-center justify-between mt-1">
                      <p className="text-xs text-muted-foreground">Third Seller</p>
                      <Button type="button" variant="ghost" size="sm" className="h-6 text-xs text-destructive" onClick={() => { setShowSeller3(false); setShowSeller4(false); form.setValue('seller3Name', ''); form.setValue('seller3Email', ''); form.setValue('seller3Phone', ''); form.setValue('seller4Name', ''); form.setValue('seller4Email', ''); form.setValue('seller4Phone', ''); }}><Trash2 className="h-3 w-3 mr-1" />Remove</Button>
                    </div>
                    <Grid3>
                      <FormField control={form.control} name="seller3Name" render={({ field }) => (
                        <FormItem><FormLabel>Name</FormLabel><FormControl><Input placeholder="Optional" {...field} /></FormControl></FormItem>
                      )} />
                      <FormField control={form.control} name="seller3Email" render={({ field }) => (
                        <FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" placeholder="Optional" {...field} /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={form.control} name="seller3Phone" render={({ field }) => (
                        <FormItem><FormLabel>Phone</FormLabel><FormControl><Input type="tel" placeholder="Optional" {...field} /></FormControl></FormItem>
                      )} />
                    </Grid3>
                  </>
                ) : (
                  <Button type="button" variant="outline" size="sm" className="mt-1 text-xs" onClick={() => setShowSeller3(true)}><PlusCircle className="h-3 w-3 mr-1" />Add 3rd Seller</Button>
                )}
                {/* 4th Seller */}
                {showSeller3 && (showSeller4 ? (
                  <>
                    <div className="flex items-center justify-between mt-1">
                      <p className="text-xs text-muted-foreground">Fourth Seller</p>
                      <Button type="button" variant="ghost" size="sm" className="h-6 text-xs text-destructive" onClick={() => { setShowSeller4(false); form.setValue('seller4Name', ''); form.setValue('seller4Email', ''); form.setValue('seller4Phone', ''); }}><Trash2 className="h-3 w-3 mr-1" />Remove</Button>
                    </div>
                    <Grid3>
                      <FormField control={form.control} name="seller4Name" render={({ field }) => (
                        <FormItem><FormLabel>Name</FormLabel><FormControl><Input placeholder="Optional" {...field} /></FormControl></FormItem>
                      )} />
                      <FormField control={form.control} name="seller4Email" render={({ field }) => (
                        <FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" placeholder="Optional" {...field} /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={form.control} name="seller4Phone" render={({ field }) => (
                        <FormItem><FormLabel>Phone</FormLabel><FormControl><Input type="tel" placeholder="Optional" {...field} /></FormControl></FormItem>
                      )} />
                    </Grid3>
                  </>
                ) : (
                  <Button type="button" variant="outline" size="sm" className="mt-1 text-xs" onClick={() => setShowSeller4(true)}><PlusCircle className="h-3 w-3 mr-1" />Add 4th Seller</Button>
                ))}
                <FormField control={form.control} name="clientNewAddress" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Client New Address</FormLabel>
                    <FormDescription>Where the seller is moving to (for mailers)</FormDescription>
                    <FormControl><Input placeholder="New address after closing" {...field} /></FormControl>
                  </FormItem>
                )} />
              </>
            )}

          </Section>}

          {/* ── Cooperating Agent (buyer/dual only — not needed until under contract for listings) */}
          {(watchedClosingType === 'buyer' || watchedClosingType === 'dual' || isPendingListing) && (
            <Section title="Cooperating Agent">
              <Grid2>
                <FormField control={form.control} name="otherAgentName" render={({ field }) => (
                  <FormItem><FormLabel>Agent Name</FormLabel><FormControl>
                    <ContactAutocomplete
                      type="other_agent"
                      placeholder="Other agent on this deal"
                      value={field.value || ''}
                      onChange={field.onChange}
                      onSelect={(c: SavedContact) => {
                        form.setValue('otherAgentName', c.name || '');
                        form.setValue('otherAgentEmail', c.email || '');
                        form.setValue('otherAgentPhone', c.phone || '');
                        form.setValue('otherBrokerage', c.brokerage || '');
                      }}
                    />
                  </FormControl></FormItem>
                )} />
                <FormField control={form.control} name="otherBrokerage" render={({ field }) => (
                  <FormItem><FormLabel>Brokerage</FormLabel><FormControl><Input placeholder="Their brokerage" {...field} /></FormControl></FormItem>
                )} />
                <FormField control={form.control} name="otherAgentEmail" render={({ field }) => (
                  <FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" placeholder="agent@brokerage.com" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="otherAgentPhone" render={({ field }) => (
                  <FormItem><FormLabel>Phone</FormLabel><FormControl><Input type="tel" placeholder="(337) 555-5678" {...field} /></FormControl></FormItem>
                )} />
              </Grid2>

              {/* Inbound referral fee — did we receive this client from a referring agent? */}
              <Separator className="my-2" />
              <FormField control={form.control} name="hasInboundReferral" render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                  <div className="space-y-0.5">
                    <FormLabel className="text-sm font-medium">Inbound Referral Fee</FormLabel>
                    <FormDescription className="text-xs">Did you receive this client from a referring agent? (Reduces GCI before broker/agent split)</FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={!!field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )} />
              {form.watch('hasInboundReferral') && (
                <Grid3>
                  <FormField control={form.control} name="inboundReferralAgentName" render={({ field }) => (
                    <FormItem><FormLabel>Referring Agent Name</FormLabel><FormControl><Input placeholder="Agent / Company name" {...field} /></FormControl></FormItem>
                  )} />
                  <FormField control={form.control} name="inboundReferralFeePercent" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Referral Fee %</FormLabel>
                      <FormControl>
                        <PercentInput
                          value={field.value as any}
                          placeholder="25"
                          onChange={(e) => {
                            field.onChange(e);
                            const pct = parseFloat(e.target.value) || 0;
                            const gci = Number(form.getValues('gci')) || 0;
                            if (gci > 0 && pct > 0) {
                              form.setValue('inboundReferralFeeDollar', Math.round(gci * pct / 100) as any);
                            }
                          }}
                        />
                      </FormControl>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="inboundReferralFeeDollar" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Referral Fee $ (auto-calc)</FormLabel>
                      <FormControl>
                        <CurrencyInput
                          value={field.value as any}
                          onChange={(val) => field.onChange(val)}
                          placeholder="0"
                        />
                      </FormControl>
                      <FormDescription className="text-xs">Auto-calculated from GCI × %. Edit to override.</FormDescription>
                    </FormItem>
                  )} />
                </Grid3>
              )}
            </Section>
          )}

          {/* ── Mortgage / Lender (buyer/dual only) ────────────────────── */}
          {(watchedClosingType === 'buyer' || watchedClosingType === 'dual' || isPendingListing) && <Section title="Mortgage / Lender">
            <Grid2>
              <FormField control={form.control} name="mortgageCompany" render={({ field }) => (
                <FormItem><FormLabel>Mortgage Company</FormLabel><FormControl>
                  <ContactAutocomplete
                    type="lender"
                    placeholder="First Federal Bank"
                    value={field.value || ''}
                    onChange={field.onChange}
                    onSelect={(c: SavedContact) => {
                      form.setValue('mortgageCompany', c.companyName || c.name || '');
                      form.setValue('loanOfficer', c.officerName || '');
                      form.setValue('loanOfficerEmail', c.email || '');
                      form.setValue('loanOfficerPhone', c.phone || '');
                      form.setValue('lenderOffice', c.office || '');
                    }}
                  />
                </FormControl></FormItem>
              )} />
              <FormField control={form.control} name="loanOfficer" render={({ field }) => (
                <FormItem><FormLabel>Loan Officer Name</FormLabel><FormControl><Input placeholder="John Smith" {...field} /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name="loanOfficerEmail" render={({ field }) => (
                <FormItem><FormLabel>Loan Officer Email</FormLabel><FormControl><Input type="email" placeholder="lo@bank.com" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="loanOfficerPhone" render={({ field }) => (
                <FormItem><FormLabel>Loan Officer Phone</FormLabel><FormControl><Input type="tel" placeholder="(337) 555-9012" {...field} /></FormControl></FormItem>
              )} />
            </Grid2>
            <div className="max-w-xs">
              <FormField control={form.control} name="lenderOffice" render={({ field }) => (
                <FormItem><FormLabel>Office #</FormLabel><FormControl><Input placeholder="Office number" {...field} /></FormControl></FormItem>
              )} />
            </div>
          </Section>}

          {/* ── Title Company (buyer/dual only) ───────────────────────────── */}
          {(watchedClosingType === 'buyer' || watchedClosingType === 'dual' || isPendingListing) && <Section title="Title Company">
            <Grid2>
              <FormField control={form.control} name="titleCompany" render={({ field }) => (
                <FormItem><FormLabel>Title Company</FormLabel><FormControl>
                  <ContactAutocomplete
                    type="title"
                    placeholder="Acadian Title"
                    value={field.value || ''}
                    onChange={field.onChange}
                    onSelect={(c: SavedContact) => {
                      form.setValue('titleCompany', c.companyName || c.name || '');
                      form.setValue('titleOfficer', c.officerName || '');
                      form.setValue('titleOfficerEmail', c.email || '');
                      form.setValue('titleOfficerPhone', c.phone || '');
                      form.setValue('titleAttorney', c.attorney || '');
                      form.setValue('titleOffice', c.office || '');
                    }}
                  />
                </FormControl></FormItem>
              )} />
              <FormField control={form.control} name="titleOfficer" render={({ field }) => (
                <FormItem><FormLabel>Title Officer Name</FormLabel><FormControl><Input placeholder="Jane Doe" {...field} /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name="titleOfficerEmail" render={({ field }) => (
                <FormItem><FormLabel>Title Officer Email</FormLabel><FormControl><Input type="email" placeholder="closer@title.com" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="titleOfficerPhone" render={({ field }) => (
                <FormItem><FormLabel>Title Officer Phone</FormLabel><FormControl><Input type="tel" placeholder="(337) 555-3456" {...field} /></FormControl></FormItem>
              )} />
            </Grid2>
            <Grid2>
              <FormField control={form.control} name="titleAttorney" render={({ field }) => (
                <FormItem><FormLabel>Attorney</FormLabel><FormControl><Input placeholder="Attorney name" {...field} /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name="titleOffice" render={({ field }) => (
                <FormItem><FormLabel>Office #</FormLabel><FormControl><Input placeholder="Office number" {...field} /></FormControl></FormItem>
              )} />
            </Grid2>
          </Section>}

          {/* ═══════════════════════════════════════════════════════════════════
              OUTBOUND REFERRAL — streamlined, with all optional referral context
          ═══════════════════════════════════════════════════════════════════ */}
          {watchedClosingType === 'referral' && (
            <>
            <Section title="Outbound Referral Details" description="All referral details are optional. Capture what is known so the referral can be followed through completion.">
              <Grid2>
                <FormField control={form.control} name="clientName" render={({ field }) => (
                  <FormItem><FormLabel>Client Name <span className="text-muted-foreground font-normal text-xs">(optional)</span></FormLabel><FormControl><Input placeholder="Client being referred" {...field} /></FormControl></FormItem>
                )} />
                <FormField control={form.control} name="clientEmail" render={({ field }) => (
                  <FormItem><FormLabel>Client Email <span className="text-muted-foreground font-normal text-xs">(optional)</span></FormLabel><FormControl><Input type="email" placeholder="client@email.com" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
              </Grid2>
              <Grid2>
                <FormField control={form.control} name="clientPhone" render={({ field }) => (
                  <FormItem><FormLabel>Client Phone <span className="text-muted-foreground font-normal text-xs">(optional)</span></FormLabel><FormControl><Input type="tel" placeholder="(337) 555-1234" {...field} /></FormControl></FormItem>
                )} />
                <FormField control={form.control} name="clientNewAddress" render={({ field }) => (
                  <FormItem><FormLabel>Client Forwarding / New Address <span className="text-muted-foreground font-normal text-xs">(optional)</span></FormLabel><FormControl><Input placeholder="Forwarding address" {...field} /></FormControl></FormItem>
                )} />
              </Grid2>
              <Grid2>
                <FormField control={form.control} name="outboundReferralAgentName" render={({ field }) => (
                  <FormItem><FormLabel>Referred-To Agent Name</FormLabel><FormControl><Input placeholder="Agent receiving the referral" {...field} /></FormControl></FormItem>
                )} />
                <FormField control={form.control} name="outboundReferralBrokerage" render={({ field }) => (
                  <FormItem><FormLabel>Their Brokerage</FormLabel><FormControl><Input placeholder="Receiving brokerage" {...field} /></FormControl></FormItem>
                )} />
              </Grid2>
              <Grid2>
                <FormField control={form.control} name="outboundReferralEmail" render={({ field }) => (
                  <FormItem><FormLabel>Referred-To Agent Email <span className="text-muted-foreground font-normal text-xs">(optional)</span></FormLabel><FormControl><Input type="email" placeholder="agent@brokerage.com" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="outboundReferralPhone" render={({ field }) => (
                  <FormItem><FormLabel>Referred-To Agent Phone <span className="text-muted-foreground font-normal text-xs">(optional)</span></FormLabel><FormControl><Input type="tel" placeholder="(337) 555-6789" {...field} /></FormControl></FormItem>
                )} />
              </Grid2>
              <Grid2>
                <FormField control={form.control} name="gci" render={({ field }) => (
                  <FormItem><FormLabel>Expected Gross Commission ($) <span className="text-muted-foreground font-normal text-xs">(optional)</span></FormLabel><FormControl><CurrencyInput value={field.value as any} onChange={(value) => field.onChange(value)} placeholder="0" /></FormControl><FormDescription className="text-xs">Use when known to estimate the referral fee. It is not required to save.</FormDescription></FormItem>
                )} />
                <FormField control={form.control} name="outboundReferralFeePercent" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Referral Fee % (optional)</FormLabel>
                    <FormControl>
                      <PercentInput value={field.value as any} onChange={(e) => field.onChange(e)} placeholder="25" />
                    </FormControl>
                    <FormDescription className="text-xs">Typical range: 25–40%</FormDescription>
                  </FormItem>
                )} />
                <FormField control={form.control} name="outboundReferralFeeDollar" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Referral Fee $ (optional)</FormLabel>
                    <FormControl>
                      <CurrencyInput
                        value={field.value as any}
                        onChange={(val) => field.onChange(val)}
                        placeholder="0"
                      />
                    </FormControl>
                    <FormDescription className="text-xs">Enter the estimated referral check amount.</FormDescription>
                  </FormItem>
                )} />
              </Grid2>
              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl><Textarea placeholder="Any notes about this referral..." rows={3} {...field} /></FormControl>
                </FormItem>
              )} />
            </Section>
            <Section title="Referral Key Dates" description="Optional dates for tracking the referral lifecycle.">
              <Grid2>
                <FormField control={form.control} name="listingDate" render={({ field }) => (
                  <FormItem><FormLabel>Listing / Referral Start Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl></FormItem>
                )} />
                <FormField control={form.control} name="listingExpirationDate" render={({ field }) => (
                  <FormItem><FormLabel>Listing Expiration Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl></FormItem>
                )} />
              </Grid2>
              <Grid2>
                <FormField control={form.control} name="contractDate" render={({ field }) => (
                  <FormItem><FormLabel>Contract Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl></FormItem>
                )} />
                <FormField control={form.control} name="projectedCloseDate" render={({ field }) => (
                  <FormItem><FormLabel>Expected Close Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl></FormItem>
                )} />
              </Grid2>
              <FormField control={form.control} name="closedDate" render={({ field }) => (
                <FormItem className="max-w-sm"><FormLabel>Completed / Closed Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl></FormItem>
              )} />
            </Section>
            </>
          )}

          {/* ═══════════════════════════════════════════════════════════════════
              SECTION 4 — FINANCIAL DETAILS (buyer/dual only — listing fills these at pending)
          ═══════════════════════════════════════════════════════════════════ */}
          {(watchedClosingType === 'buyer' || watchedClosingType === 'dual' || isPendingListing) && <Section title="Financial Details">
            <Grid2>
              {/* List price — dual only (listing is hidden at this level) */}
              {((watchedClosingType as string) === 'listing' || watchedClosingType === 'dual') && (
                <FormField control={form.control} name="listPrice" render={({ field }) => (
                  <FormItem>
                    <FormLabel>List Price ($)</FormLabel>
                    <FormControl>
                      <CurrencyInput
                        value={field.value as any}
                        onChange={(val) => field.onChange(val)}
                        placeholder="0"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              )}
              {/* Sale price — buyer and dual only */}
              {(watchedClosingType === 'buyer' || watchedClosingType === 'dual' || isPendingListing) && (
                <FormField control={form.control} name="salePrice" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sale Price ($)</FormLabel>
                    <FormControl>
                      <CurrencyInput
                        value={field.value as any}
                        onChange={(val) => field.onChange(val)}
                        placeholder="0"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              )}
            </Grid2>
            <Grid2>
              <FormField control={form.control} name="earnestMoney" render={({ field }) => (
                <FormItem>
                  <FormLabel>Earnest Money / Deposit ($)</FormLabel>
                  <FormControl>
                    <CurrencyInput
                      value={field.value as any}
                      onChange={(val) => field.onChange(val)}
                      placeholder="0"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="depositHolder" render={({ field }) => (
                <FormItem>
                  <FormLabel>Who is holding the deposit?</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="listing_broker">Listing Broker</SelectItem>
                      <SelectItem value="selling_broker">Selling Broker</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </FormItem>
              )} />
            </Grid2>
            {form.watch('depositHolder') === 'other' && (
              <div className="max-w-xs">
                <FormField control={form.control} name="depositHolderOther" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Specify deposit holder</FormLabel>
                    <FormControl><Input placeholder="Name or company..." {...field} /></FormControl>
                  </FormItem>
                )} />
              </div>
            )}
          </Section>}

          {/* ── Pre-Listing Inspections (listing/dual only) ───────────────── */}
          {(watchedClosingType === 'listing' || watchedClosingType === 'dual') && (
            <Section title="Pre-Listing Inspections" description="Optional: Order inspections before the listing goes live. Leave blank if not applicable.">
              <Grid2>
                <FormField control={form.control} name="preListingInspectionOrdered" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Pre-Listing Inspection Ordered?</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="yes">Yes</SelectItem>
                        <SelectItem value="no">No</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />
                <FormField control={form.control} name="preListingTargetInspectionDate" render={({ field }) => (
                  <FormItem><FormLabel>Target Inspection Date</FormLabel><FormControl><Input type="date" {...field}
                    onChange={e => {
                      field.onChange(e);
                      // Auto-fill all inspection rows with the general inspection date
                      const newDate = e.target.value;
                      if (newDate) {
                        const today = new Date().toISOString().split('T')[0];
                        const fallbackEnd = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                        setInspRows(prev => {
                          const updated = { ...prev };
                          for (const key of Object.keys(updated)) {
                            if (!updated[key].sent) {
                              updated[key] = { ...updated[key], preferredDate: newDate, fallbackDateStart: today, fallbackDateEnd: fallbackEnd };
                            }
                          }
                          return updated;
                        });
                      }
                    }}
                  /></FormControl></FormItem>
                )} />
              </Grid2>
              <FormField control={form.control} name="preListingTcScheduleInspections" render={({ field }) => (
                <FormItem>
                  <FormLabel>Pre-Listing Inspection Scheduling Status</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select status..." /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="already_scheduled">✅ Already Scheduled — I contacted the inspector</SelectItem>
                      <SelectItem value="yes">📋 TC / Staff to Schedule</SelectItem>
                      <SelectItem value="other">📝 Other / Notes</SelectItem>
                    </SelectContent>
                  </Select>
                </FormItem>
              )} />
              {preListingTcScheduleInspections === 'other' && (
                <FormField control={form.control} name="preListingTcScheduleInspectionsOther" render={({ field }) => (
                  <FormItem><FormLabel>Please specify</FormLabel><FormControl><Input placeholder="Describe what you need..." {...field} /></FormControl></FormItem>
                )} />
              )}
              {/* Per-type inspector rows — checkbox to expand */}
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground mb-2">Inspection Types</p>
                <p className="text-xs text-muted-foreground mb-3">Check each inspection needed. Each row expands to assign an inspector and send a request.</p>
                {INSP_TYPES.map(({ key, label }) => {
                  const isChecked = preListingInspectionTypes.includes(label);
                  const row = inspRows[key] || makeDefaultInspRow();
                  const vendors = inspVendors[key] || [];
                  const generalVendorId = inspRows['inspector_general']?.vendorId;
                  const generalVendors = inspVendors['inspector_general'] || [];
                  const generalVendor = generalVendorId && generalVendorId !== 'USE_GENERAL'
                    ? generalVendors.find(v => v.id === generalVendorId) || null
                    : null;
                  const today = new Date().toISOString().split('T')[0];
                  const fallbackEnd = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                  return (
                    <div key={key} className={`rounded-lg border transition-colors ${isChecked ? 'border-primary/30 bg-primary/5' : 'border-border bg-transparent'}`}>
                      {/* Checkbox row — always visible */}
                      <label className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => togglePreListingInspectionType(label)}
                          className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                        />
                        <span className="text-sm font-medium flex-1">{label}</span>
                        {row.sent && <Badge variant="outline" className="text-green-600 border-green-300 bg-green-50 text-xs"><CheckCircle2 className="h-3 w-3 mr-1" />Sent</Badge>}
                        {isChecked && !row.sent && <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                      </label>
                      {/* Expanded details — only when checked */}
                      {isChecked && (
                        <div className="px-4 pb-4 space-y-3 border-t border-border/50 pt-3">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="text-xs font-medium text-muted-foreground mb-1 block">Inspector</label>
                              <select
                                value={row.vendorId}
                                onChange={e => {
                                  if (e.target.value === '__ADD_NEW__') {
                                    setAddInspectorFor(key);
                                    setNewInspForm({ name: '', company: '', phone: '', email: '' });
                                  } else {
                                    updateInspRow(key, { vendorId: e.target.value });
                                    setAddInspectorFor(null);
                                  }
                                }}
                                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                              >
                                <option value="">— Select inspector —</option>
                                {key !== 'inspector_general' && (
                                  <option value="USE_GENERAL">
                                    {generalVendor ? `Use General Inspector (${generalVendor.name})` : 'Use General Inspector'}
                                  </option>
                                )}
                                {vendors.map(v => <option key={v.id} value={v.id}>{v.name}{v.company ? ` — ${v.company}` : ''}</option>)}
                                <option value="__ADD_NEW__">➕ Add new inspector...</option>
                              </select>
                              {addInspectorFor === key && (
                                <div className="mt-2 p-3 rounded-md border border-primary/30 bg-primary/5 space-y-2">
                                  <p className="text-xs font-semibold text-primary">Add New Inspector</p>
                                  <div className="grid grid-cols-2 gap-2">
                                    <input type="text" placeholder="Name *" value={newInspForm.name}
                                      onChange={e => setNewInspForm(p => ({ ...p, name: e.target.value }))}
                                      className="rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring col-span-2" />
                                    <input type="text" placeholder="Company" value={newInspForm.company}
                                      onChange={e => setNewInspForm(p => ({ ...p, company: e.target.value }))}
                                      className="rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                                    <input type="tel" placeholder="Phone" value={newInspForm.phone}
                                      onChange={e => setNewInspForm(p => ({ ...p, phone: e.target.value }))}
                                      className="rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                                    <input type="email" placeholder="Email" value={newInspForm.email}
                                      onChange={e => setNewInspForm(p => ({ ...p, email: e.target.value }))}
                                      className="rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring col-span-2" />
                                  </div>
                                  <div className="flex gap-2">
                                    <button type="button" onClick={() => addInspectorInline(key)}
                                      disabled={addInspectorSaving || !newInspForm.name.trim()}
                                      className="flex-1 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium disabled:opacity-50">
                                      {addInspectorSaving ? 'Saving...' : 'Save & Select'}
                                    </button>
                                    <button type="button"
                                      onClick={() => { setAddInspectorFor(null); setNewInspForm({ name: '', company: '', phone: '', email: '' }); }}
                                      className="rounded-md border border-input px-3 py-1.5 text-xs">Cancel</button>
                                  </div>
                                </div>
                              )}
                            </div>
                            <div>
                              <label className="text-xs font-medium text-muted-foreground mb-1 block">Send To</label>
                              <select
                                value={row.sendMode}
                                onChange={e => updateInspRow(key, { sendMode: e.target.value as 'selected' | 'all' })}
                                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                              >
                                <option value="selected">Selected inspector only</option>
                                <option value="all">All {label} inspectors</option>
                              </select>
                            </div>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                              <label className="text-xs font-medium text-muted-foreground mb-1 block">Preferred Date</label>
                              <Input type="date" value={row.preferredDate}
                                onChange={e => {
                                  updateInspRow(key, { preferredDate: e.target.value });
                                  if (key === 'inspector_general' && e.target.value) {
                                    setInspRows(prev => {
                                      const updated = { ...prev };
                                      for (const k of Object.keys(updated)) {
                                        if (k !== 'inspector_general' && !updated[k].sent) {
                                          updated[k] = { ...updated[k], preferredDate: e.target.value };
                                        }
                                      }
                                      return updated;
                                    });
                                  }
                                }}
                              />
                            </div>
                            <div>
                              <label className="text-xs font-medium text-muted-foreground mb-1 block">Time Start</label>
                              <Input type="time" value={row.preferredTimeStart} onChange={e => updateInspRow(key, { preferredTimeStart: e.target.value })} />
                            </div>
                            <div>
                              <label className="text-xs font-medium text-muted-foreground mb-1 block">Time End</label>
                              <Input type="time" value={row.preferredTimeEnd} onChange={e => updateInspRow(key, { preferredTimeEnd: e.target.value })} />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="text-xs font-medium text-muted-foreground mb-1 block">Available From</label>
                              <Input type="date" value={row.fallbackDateStart || today}
                                onChange={e => updateInspRow(key, { fallbackDateStart: e.target.value })} />
                            </div>
                            <div>
                              <label className="text-xs font-medium text-muted-foreground mb-1 block">Available Until</label>
                              <Input type="date" value={row.fallbackDateEnd || fallbackEnd}
                                onChange={e => updateInspRow(key, { fallbackDateEnd: e.target.value })} />
                            </div>
                          </div>
                          {!row.sent && (
                            <div className="flex justify-end">
                              <Button
                                type="button"
                                size="sm"
                                disabled={row.sending || (!row.vendorId && row.sendMode === 'selected')}
                                onClick={async () => {
                                  if (!user) return;
                                  updateInspRow(key, { sending: true });
                                  try {
                                    const token = await user.getIdToken();
                                    const formVals = form.getValues();
                                    const effectiveVendorId = row.vendorId === 'USE_GENERAL' ? generalVendorId : row.vendorId;
                                    const today2 = new Date().toISOString().split('T')[0];
                                    const fallbackEnd2 = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                                    const res = await fetch('/api/agent/inspection-request', {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                                      body: JSON.stringify({
                                        transactionId: null,
                                        transactionType: 'listing',
                                        inspectionCategory: key,
                                        vendorId: effectiveVendorId || undefined,
                                        sendMode: row.sendMode,
                                        preferredDate: row.preferredDate || today2,
                                        preferredTimeStart: row.preferredTimeStart,
                                        preferredTimeEnd: row.preferredTimeEnd,
                                        fallbackDateStart: row.fallbackDateStart || today2,
                                        fallbackDateEnd: row.fallbackDateEnd || fallbackEnd2,
                                        propertyAddress: formVals.address || '',
                                        clientName: formVals.sellerName || '',
                                        clientPhone: formVals.sellerPhone || '',
                                        clientEmail: formVals.sellerEmail || '',
                                        agentName: formVals.agentDisplayName || effectiveName || '',
                                        agentPhone: '',
                                        agentEmail: user.email || '',
                                        sqft: '',
                                        accessNotes: formVals.showingAccessNotes || '',
                                      }),
                                    });
                                    const data = await res.json();
                                    if (data.ok) {
                                      updateInspRow(key, { sent: true, sending: false });
                                      toast({ title: 'Request sent!', description: `Inspection request sent to ${data.vendorCount} inspector(s).` });
                                    } else {
                                      updateInspRow(key, { sending: false });
                                      toast({ title: 'Error', description: data.error || 'Failed to send request', variant: 'destructive' });
                                    }
                                  } catch (err: any) {
                                    updateInspRow(key, { sending: false });
                                    toast({ title: 'Error', description: err.message, variant: 'destructive' });
                                  }
                                }}
                              >
                                {row.sending ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Sending...</> : <><Send className="h-3 w-3 mr-1" />Send Request</>}
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Section>
          )}

          {/* ── Media Order (listing/dual only, collapsed by default) ─────────── */}
          {(watchedClosingType === 'listing' || watchedClosingType === 'dual') && (
            <Collapsible open={mediaOrderOpen} onOpenChange={setMediaOrderOpen}>
              <Card>
                <CardHeader className="py-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base">Media Order</CardTitle>
                      <CardDescription>Order media directly through Media Engage for this listing.</CardDescription>
                    </div>
                    <span className="text-2xl">📸</span>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800 p-5 flex flex-col items-center gap-4 text-center">
                    <div>
                      <p className="font-semibold text-blue-900 dark:text-blue-200 text-base mb-1">Order Media Through Media Engage</p>
                      <p className="text-sm text-blue-700 dark:text-blue-300">All media orders are placed directly through Media Engage. Click below to open their order form. Staff will follow up to confirm scheduling.</p>
                    </div>
                    <a
                      href="https://mediaengagellc.com/order/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-md bg-blue-700 hover:bg-blue-800 text-white font-semibold px-6 py-3 text-sm transition-colors"
                    >
                      📷 Order Media at Media Engage
                    </a>
                  </div>
                </CardContent>
              </Card>
            </Collapsible>
          )}

          {/* ── MLS Description Builder (listing/dual only, collapsed by default) ─── */}
          {(watchedClosingType === 'listing' || watchedClosingType === 'dual') && (
            <Collapsible open={mlsDescriptionOpen} onOpenChange={setMlsDescriptionOpen}>
              <Card>
                <CardHeader
                  className="cursor-pointer select-none py-4"
                  onClick={() => setMlsDescriptionOpen(!mlsDescriptionOpen)}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        <WandSparkles className="h-4 w-4 text-violet-500" />
                        MLS Description Builder
                        <Badge className="bg-violet-100 text-violet-700 text-xs font-medium border-0">AI</Badge>
                      </CardTitle>
                      <CardDescription>Brain-dump your property features and let AI craft a polished, fair-housing-compliant MLS description.</CardDescription>
                    </div>
                    <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform duration-200 ${mlsDescriptionOpen ? 'rotate-180' : ''}`} />
                  </div>
                </CardHeader>
                <CollapsibleContent>
                  <CardContent className="space-y-5 pt-0">
                    {/* Info banner */}
                    <div className="rounded-lg border border-violet-200 bg-violet-50 dark:bg-violet-950/20 dark:border-violet-800 p-4 flex items-start gap-3">
                      <WandSparkles className="h-5 w-5 text-violet-600 dark:text-violet-400 mt-0.5 shrink-0" />
                      <div className="text-sm text-violet-800 dark:text-violet-300">
                        <p className="font-semibold mb-1">How it works</p>
                        <p>Type anything — features, upgrades, neighborhood highlights, lot details, unique selling points. Don&apos;t worry about grammar or order. The AI will organize it into a compelling, fair-housing-compliant MLS description ready to copy into ROAM.</p>
                      </div>
                    </div>

                    {/* Brain-dump input */}
                    <div>
                      <label className="text-sm font-medium block mb-1.5">Your Notes &amp; Features</label>
                      <Textarea
                        placeholder={`Example:\n• 4 bed / 3 bath, 2,400 sqft\n• Open floor plan, vaulted ceilings\n• Granite countertops, stainless appliances\n• Primary suite with walk-in closet and soaking tub\n• Large backyard, covered patio, new roof 2022\n• Quiet cul-de-sac, top-rated schools nearby\n• Minutes from I-10, restaurants, and shopping`}
                        className="min-h-[160px] font-mono text-sm"
                        value={mlsBrainDump}
                        onChange={(e) => setMlsBrainDump(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground mt-1">Just brain-dump — bullet points, fragments, anything goes. The AI handles the rest.</p>
                    </div>

                    {/* Generate button */}
                    <div className="flex items-center gap-3">
                      <Button
                        type="button"
                        className="bg-violet-600 hover:bg-violet-700 text-white gap-2"
                        disabled={mlsGenerating || !mlsBrainDump.trim()}
                        onClick={async () => {
                          if (!mlsBrainDump.trim()) return;
                          setMlsGenerating(true);
                          try {
                            const token = await user?.getIdToken();
                            const res = await fetch('/api/agent/generate-mls-description', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                              body: JSON.stringify({
                                brainDump: mlsBrainDump,
                                address: form.getValues('address'),
                                propertyType: form.getValues('closingType'),
                              }),
                            });
                            const data = await res.json();
                            if (data.description) {
                              form.setValue('mlsDescription', data.description);
                              toast({ title: 'Description generated!', description: 'Review and edit as needed before copying to MLS.' });
                            } else {
                              toast({ title: 'Generation failed', description: data.error || 'Please try again.', variant: 'destructive' });
                            }
                          } catch {
                            toast({ title: 'Error', description: 'Failed to generate description. Please try again.', variant: 'destructive' });
                          } finally {
                            setMlsGenerating(false);
                          }
                        }}
                      >
                        {mlsGenerating ? (
                          <><Loader2 className="h-4 w-4 animate-spin" /> Generating...</>
                        ) : (
                          <><WandSparkles className="h-4 w-4" /> Generate MLS Description</>
                        )}
                      </Button>
                      {form.watch('mlsDescription') && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="gap-2"
                          disabled={mlsGenerating || !mlsBrainDump.trim()}
                          onClick={async () => {
                            if (!mlsBrainDump.trim()) return;
                            setMlsGenerating(true);
                            try {
                              const token = await user?.getIdToken();
                              const res = await fetch('/api/agent/generate-mls-description', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                                body: JSON.stringify({
                                  brainDump: mlsBrainDump,
                                  address: form.getValues('address'),
                                  propertyType: form.getValues('closingType'),
                                }),
                              });
                              const data = await res.json();
                              if (data.description) {
                                form.setValue('mlsDescription', data.description);
                                toast({ title: 'Description regenerated!' });
                              }
                            } catch { /* non-fatal */ } finally {
                              setMlsGenerating(false);
                            }
                          }}
                        >
                          <RefreshCw className="h-3.5 w-3.5" /> Regenerate
                        </Button>
                      )}
                    </div>

                    {/* Generated description output */}
                    <FormField control={form.control} name="mlsDescription" render={({ field }) => (
                      <FormItem>
                        <div className="flex items-center justify-between mb-1.5">
                          <FormLabel className="mb-0">Generated MLS Description</FormLabel>
                          {field.value && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
                              onClick={() => {
                                navigator.clipboard.writeText(field.value || '');
                                toast({ title: 'Copied to clipboard!' });
                              }}
                            >
                              <Copy className="h-3.5 w-3.5" /> Copy
                            </Button>
                          )}
                        </div>
                        <FormControl>
                          <Textarea
                            placeholder="Your AI-generated description will appear here. You can edit it before copying to MLS."
                            className="min-h-[200px] text-sm"
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>
                          Review and edit the description as needed. This will be saved with your listing submission.
                        </FormDescription>
                      </FormItem>
                    )} />
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          )}

          {/* ── Sign Order (listing/dual only, collapsed by default) ───────────── */}
          {(watchedClosingType === 'listing' || watchedClosingType === 'dual') && (
            <Collapsible open={signOrderOpen} onOpenChange={setSignOrderOpen}>
              <Card>
                <CardHeader
                  className="cursor-pointer select-none py-4"
                  onClick={() => setSignOrderOpen(!signOrderOpen)}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base">Sign Order</CardTitle>
                      <CardDescription>Order a sign post for this listing. Leave blank and staff will handle the order.</CardDescription>
                    </div>
                    <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform duration-200 ${signOrderOpen ? 'rotate-180' : ''}`} />
                  </div>
                </CardHeader>
                <CollapsibleContent>
                  <CardContent className="space-y-5 pt-0">
                    <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-700 p-4 text-sm text-amber-800 dark:text-amber-300">
                      <p className="font-semibold mb-1">Sign orders are sent to staff for review.</p>
                      <p>Staff will add your personalized QR code or text rider number before forwarding to J Allen / PostMan337. You can also order directly at <a href="https://www.PostMan337.com" target="_blank" rel="noopener noreferrer" className="underline font-medium">PostMan337.com</a>.</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium mb-2">Type of Service:</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                        {SIGN_SERVICE_OPTIONS.map((opt) => (
                          <label key={opt} className="flex items-center gap-2 cursor-pointer text-sm">
                            <input
                              type="radio"
                              name="signServiceType"
                              value={opt}
                              checked={signServiceType === opt}
                              onChange={() => form.setValue('signServiceType', opt)}
                              className="h-4 w-4 border-gray-300 text-primary focus:ring-primary"
                            />
                            {opt}
                          </label>
                        ))}
                      </div>
                      {signServiceType === 'Other' && (
                        <div className="mt-3 max-w-xs">
                          <Input placeholder="Describe the service needed..." onChange={(e) => form.setValue('signServiceType', e.target.value)} />
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium mb-2">Additional Sign Post Options:</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {SIGN_ADDITIONAL_OPTIONS.map((opt) => (
                          <label key={opt} className="flex items-center gap-2 cursor-pointer text-sm">
                            <input
                              type="checkbox"
                              checked={signAdditionalOptions.includes(opt)}
                              onChange={() => toggleSignAdditionalOption(opt)}
                              className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                            />
                            {opt}
                          </label>
                        ))}
                      </div>
                      {(signAdditionalOptions.includes('Text2 Rider') || signAdditionalOptions.includes('Phone# Rider EXT')) && (
                        <div className="mt-3 max-w-xs">
                          <FormField control={form.control} name="signRiderExt" render={({ field }) => (
                            <FormItem><FormLabel>Phone# Rider EXT</FormLabel><FormControl><Input placeholder="Extension number..." {...field} /></FormControl></FormItem>
                          )} />
                        </div>
                      )}
                    </div>
                    <Grid2>
                      <FormField control={form.control} name="signOwnerName" render={({ field }) => (
                        <FormItem><FormLabel>Owner Name</FormLabel><FormControl><Input placeholder="Property owner name" {...field} /></FormControl></FormItem>
                      )} />
                      <FormField control={form.control} name="signRequestedDate" render={({ field }) => (
                        <FormItem><FormLabel>Requested Date of Service</FormLabel><FormControl><Input type="date" {...field} /></FormControl></FormItem>
                      )} />
                    </Grid2>
                    <FormField control={form.control} name="signSpecialRequests" render={({ field }) => (
                      <FormItem><FormLabel>Special Requests</FormLabel><FormControl><Textarea placeholder="Any special instructions for the sign company..." {...field} /></FormControl></FormItem>
                    )} />
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          )}

          {/* ── Staging Request (listing/dual only) ──────────────────────── */}
          {(watchedClosingType === 'listing' || watchedClosingType === 'dual') && (
            <Collapsible open={stagingOpen} onOpenChange={setStagingOpen}>
              <Card>
                <CardHeader
                  className="cursor-pointer select-none py-4"
                  onClick={() => setStagingOpen(!stagingOpen)}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2"><Paintbrush className="h-4 w-4" /> Staging Request</CardTitle>
                      <CardDescription>Request a home staging consultation. Fill out the details and send directly to your chosen stager.</CardDescription>
                    </div>
                    <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform duration-200 ${stagingOpen ? 'rotate-180' : ''}`} />
                  </div>
                </CardHeader>
                <CollapsibleContent>
                  <CardContent className="space-y-5 pt-0">
                    {stagingSent ? (
                      <div className="rounded-lg border border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-700 p-4 text-sm text-green-800 dark:text-green-300 flex items-center gap-3">
                        <CheckCircle2 className="h-5 w-5 shrink-0" />
                        <div>
                          <p className="font-semibold">Staging request sent!</p>
                          <p>The stager has been emailed with the property and seller details.</p>
                        </div>
                      </div>
                    ) : (
                      <>
                        {stagingError && (
                          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 flex items-center gap-2">
                            <AlertCircle className="h-4 w-4 shrink-0" />
                            {stagingError}
                          </div>
                        )}
                        {/* Stager selection + Service Type */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                          <div>
                            <label className="text-sm font-medium">Select Stager</label>
                            <select
                              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                              value={stagingRequestData.stagerId}
                              onChange={e => setStagingRequestData(d => ({ ...d, stagerId: e.target.value }))}
                            >
                              <option value="">-- Choose a stager --</option>
                              {stagersLoading ? (
                                <option disabled>Loading stagers...</option>
                              ) : (
                                stagers.map(s => (
                                  <option key={s.id} value={s.id}>
                                    {s.name}{s.company ? ` — ${s.company}` : ''}
                                  </option>
                                ))
                              )}
                            </select>
                          </div>
                          <div>
                            <label className="text-sm font-medium">Payment Method</label>
                            <select
                              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                              value={stagingRequestData.paymentMethod}
                              onChange={e => setStagingRequestData(d => ({ ...d, paymentMethod: e.target.value }))}
                            >
                              <option value="">-- Select payment method --</option>
                              <option value="Prepaid Keaty Listing Package">Prepaid Keaty Listing Package (Keaty invoiced)</option>
                              <option value="Agent">Agent pays directly</option>
                              <option value="Seller">Seller pays directly</option>
                            </select>
                          </div>
                        </div>

                        {/* Service type + Coordinate with */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                          <div>
                            <label className="text-sm font-medium">Staging Service Type</label>
                            <select
                              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                              value={stagingRequestData.serviceType}
                              onChange={e => setStagingRequestData(d => ({ ...d, serviceType: e.target.value }))}
                            >
                              <option value="">-- Select service type --</option>
                              <option value="Walk &amp; Talk Consultation">Walk &amp; Talk Consultation</option>
                              <option value="Staging Furniture Package">Staging Furniture Package</option>
                              <option value="Accessory Package">Accessory Package</option>
                              <option value="Other">Other</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-sm font-medium">Stager Should Coordinate With</label>
                            <select
                              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                              value={stagingRequestData.coordinateWith}
                              onChange={e => setStagingRequestData(d => ({ ...d, coordinateWith: e.target.value }))}
                            >
                              <option value="">-- Select who to contact --</option>
                              <option value="Seller">Seller</option>
                              <option value="Agent">Agent</option>
                              <option value="TC">Transaction Coordinator (TC)</option>
                            </select>
                          </div>
                        </div>

                        {/* Photographer date */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                          <div>
                            <label className="text-sm font-medium">Photographer Date</label>
                            <input
                              type="date"
                              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                              value={stagingRequestData.photographerDate}
                              onChange={e => setStagingRequestData(d => ({ ...d, photographerDate: e.target.value }))}
                            />
                            <p className="mt-1 text-xs text-muted-foreground">Staging should be completed a few days before this date.</p>
                          </div>
                          <div />
                        </div>

                        {/* Consultation date/time */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                          <div>
                            <label className="text-sm font-medium">Consultation Appointment Target Date</label>
                            <input
                              type="date"
                              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                              value={stagingRequestData.consultationDate}
                              onChange={e => setStagingRequestData(d => ({ ...d, consultationDate: e.target.value }))}
                            />
                          </div>
                          <div>
                            <label className="text-sm font-medium">Preferred Time</label>
                            <input
                              type="time"
                              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                              value={stagingRequestData.consultationTime}
                              onChange={e => setStagingRequestData(d => ({ ...d, consultationTime: e.target.value }))}
                            />
                          </div>
                        </div>

                        {/* Property details */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                          <div>
                            <label className="text-sm font-medium">Currently on Market?</label>
                            <select
                              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                              value={stagingRequestData.currentlyOnMarket}
                              onChange={e => setStagingRequestData(d => ({ ...d, currentlyOnMarket: e.target.value }))}
                            >
                              <option value="">-- Select --</option>
                              <option value="Yes">Yes</option>
                              <option value="No">No</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-sm font-medium">Targeted Market Date</label>
                            <input
                              type="date"
                              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                              value={stagingRequestData.targetedMarketDate}
                              onChange={e => setStagingRequestData(d => ({ ...d, targetedMarketDate: e.target.value }))}
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                          <div>
                            <label className="text-sm font-medium">Home Style</label>
                            <input
                              type="text"
                              placeholder="e.g. Ranch, Two-Story, Craftsman..."
                              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                              value={stagingRequestData.homeStyle}
                              onChange={e => setStagingRequestData(d => ({ ...d, homeStyle: e.target.value }))}
                            />
                          </div>
                          <div>
                            <label className="text-sm font-medium">Occupied or Vacant?</label>
                            <select
                              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                              value={stagingRequestData.occupancy}
                              onChange={e => setStagingRequestData(d => ({ ...d, occupancy: e.target.value }))}
                            >
                              <option value="">-- Select --</option>
                              <option value="Occupied">Occupied</option>
                              <option value="Vacant">Vacant</option>
                            </select>
                          </div>
                        </div>
                        <div>
                          <label className="text-sm font-medium">Reason for Selling</label>
                          <input
                            type="text"
                            placeholder="e.g. Downsizing, Relocating, Estate sale..."
                            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                            value={stagingRequestData.reasonForSelling}
                            onChange={e => setStagingRequestData(d => ({ ...d, reasonForSelling: e.target.value }))}
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium">Special Notes from Agent to Stager</label>
                          <textarea
                            rows={3}
                            placeholder="Any special instructions, concerns, or notes for the stager..."
                            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                            value={stagingRequestData.specialNotes}
                            onChange={e => setStagingRequestData(d => ({ ...d, specialNotes: e.target.value }))}
                          />
                        </div>

                        {/* Auto-filled info note */}
                        <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-700 p-3 text-sm text-blue-800 dark:text-blue-300">
                          <p className="font-semibold mb-1">Auto-filled from your listing:</p>
                          <p>Property address, list price, sqft, seller name/phone/email, and your agent contact info will be included automatically in the email to the stager.</p>
                        </div>

                        {/* Send button */}
                        <div className="flex justify-end">
                          <Button
                            type="button"
                            disabled={stagingSubmitting || !stagingRequestData.stagerId}
                            onClick={async () => {
                              if (!user) return;
                              setStagingSubmitting(true);
                              setStagingError('');
                              try {
                                const token = await user.getIdToken();
                                const formVals = form.getValues();
                                const res = await fetch('/api/agent/staging-request', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                                  body: JSON.stringify({
                                    stagerId: stagingRequestData.stagerId,
                                    serviceType: stagingRequestData.serviceType,
                                    coordinateWith: stagingRequestData.coordinateWith,
                                    photographerDate: stagingRequestData.photographerDate,
                                    consultationDate: stagingRequestData.consultationDate,
                                    consultationTime: stagingRequestData.consultationTime,
                                    paymentMethod: stagingRequestData.paymentMethod,
                                    currentlyOnMarket: stagingRequestData.currentlyOnMarket,
                                    targetedMarketDate: stagingRequestData.targetedMarketDate,
                                    homeStyle: stagingRequestData.homeStyle,
                                    occupancy: stagingRequestData.occupancy,
                                    reasonForSelling: stagingRequestData.reasonForSelling,
                                    specialNotes: stagingRequestData.specialNotes,
                                    // Auto-filled from form
                                    propertyAddress: formVals.address || '',
                                    listPrice: formVals.listPrice || '',
                                    sellerName: formVals.sellerName || '',
                                    sellerPhone: formVals.sellerPhone || '',
                                    sellerEmail: formVals.sellerEmail || '',
                                    agentName: formVals.agentDisplayName || effectiveName || '',
                                    agentEmail: user.email || '',
                                  }),
                                });
                                const data = await res.json();
                                if (data.ok) {
                                  setStagingSent(true);
                                  toast({ title: 'Staging request sent!', description: data.emailSent ? 'The stager has been emailed.' : 'Saved — email could not be sent (check Resend config).' });
                                } else {
                                  setStagingError(data.error || 'Failed to send staging request');
                                }
                              } catch (err: any) {
                                setStagingError(err.message || 'Unexpected error');
                              } finally {
                                setStagingSubmitting(false);
                              }
                            }}
                          >
                            {stagingSubmitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sending...</> : <><Send className="h-4 w-4 mr-2" /> Send Staging Request</>}
                          </Button>
                        </div>
                      </>
                    )}
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          )}

          {/* ── ShowingTime Setup (listing/dual only) ──────────────────────── */}
          {(watchedClosingType === 'listing' || watchedClosingType === 'dual') && (
            <Collapsible open={showingTimeOpen} onOpenChange={setShowingTimeOpen}>
              <Card>
                <CardHeader
                  className="cursor-pointer select-none py-4"
                  onClick={() => setShowingTimeOpen(!showingTimeOpen)}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base">ShowingTime Setup</CardTitle>
                      <CardDescription>Set up showing instructions. Leave blank and staff will set up ShowingTime for you.</CardDescription>
                    </div>
                    <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform duration-200 ${showingTimeOpen ? 'rotate-180' : ''}`} />
                  </div>
                </CardHeader>
                <CollapsibleContent>
                  <CardContent className="space-y-5 pt-0">
              <div className="rounded-lg border border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-700 p-4 text-sm text-green-800 dark:text-green-300">
                <p className="font-semibold mb-1">ShowingTime instructions are sent to staff for setup.</p>
                <p>Staff will enter this information into the ShowingTime portal. Your agent info (Call Order #1) is pre-filled from your profile.</p>
              </div>
              <Grid2>
                <FormField control={form.control} name="showingNewOrChange" render={({ field }) => (
                  <FormItem>
                    <FormLabel>New Listing or Change to Existing?</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="new">New Listing</SelectItem>
                        <SelectItem value="change">Change to Existing Listing</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />
                <FormField control={form.control} name="showingMaxApptLength" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Max Appointment Length</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="15">15 minutes</SelectItem>
                        <SelectItem value="30">30 minutes</SelectItem>
                        <SelectItem value="45">45 minutes</SelectItem>
                        <SelectItem value="60">1 hour</SelectItem>
                        <SelectItem value="90">1 hour 30 minutes</SelectItem>
                        <SelectItem value="120">2 hours</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />
              </Grid2>
              <Grid2>
                <FormField control={form.control} name="showingApptType" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Appointment Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="conf_any">Appt. Required — Conf. with ANY</SelectItem>
                        <SelectItem value="conf_all">Appt. Required — Conf. with ALL</SelectItem>
                        <SelectItem value="courtesy_call">Courtesy Call</SelectItem>
                        <SelectItem value="go_show">Go &amp; Show</SelectItem>
                        <SelectItem value="refer_listing">Refer to Listing Agent</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />
                <FormField control={form.control} name="showingApptOverlaps" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Appointment Overlaps</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="yes_no_inform">Yes — No Need to Inform Showing Agent</SelectItem>
                        <SelectItem value="yes_inform">Yes — Please Inform the Showing Agent</SelectItem>
                        <SelectItem value="no_exclusive">No — Exclusive Showings Only</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />
              </Grid2>
              <div>
                <p className="text-sm font-medium mb-2">Appointment Handling:</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {[
                    { value: 'no_appt_center', label: "Don't Allow Appt Center to Take Appts" },
                    { value: 'no_online', label: "Don't Allow Online Scheduling" },
                  ].map((opt) => {
                    const current = form.watch('showingApptHandling') || [];
                    return (
                      <label key={opt.value} className="flex items-center gap-2 cursor-pointer text-sm">
                        <input
                          type="checkbox"
                          checked={current.includes(opt.value)}
                          onChange={() => {
                            if (current.includes(opt.value)) {
                              form.setValue('showingApptHandling', current.filter((v: string) => v !== opt.value));
                            } else {
                              form.setValue('showingApptHandling', [...current, opt.value]);
                            }
                          }}
                          className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                        />
                        {opt.label}
                      </label>
                    );
                  })}
                </div>
              </div>
              <FormField control={form.control} name="showingVirtualPreference" render={({ field }) => (
                <FormItem>
                  <FormLabel>Virtual Appointment Preference</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="in_person_virtual">In-Person and Virtual Appointments</SelectItem>
                      <SelectItem value="virtual_only">Virtual Appointments Only</SelectItem>
                      <SelectItem value="in_person_only">In-Person Appointments Only</SelectItem>
                    </SelectContent>
                  </Select>
                </FormItem>
              )} />
              <div>
                <p className="text-sm font-medium mb-1">Advanced Notice:</p>
                <label className="flex items-center gap-2 cursor-pointer text-sm mb-3">
                  <input
                    type="checkbox"
                    checked={showingNoSameDayAppts || false}
                    onChange={(e) => form.setValue('showingNoSameDayAppts', e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  No Same Day Appointments
                </label>
                <Grid2>
                  <FormField control={form.control} name="showingLeadTimeRequired" render={({ field }) => (
                    <FormItem><FormLabel>Lead Time Required (minutes)</FormLabel><FormControl><Input type="number" placeholder="e.g. 60" {...field} /></FormControl></FormItem>
                  )} />
                  <FormField control={form.control} name="showingLeadTimeSuggested" render={({ field }) => (
                    <FormItem><FormLabel>Lead Time Suggested (minutes)</FormLabel><FormControl><Input type="number" placeholder="e.g. 120" {...field} /></FormControl></FormItem>
                  )} />
                </Grid2>
              </div>
              <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
                <p className="text-sm font-semibold">Call Order #1 — Listing Agent (auto-filled from your profile)</p>
                <p className="text-xs text-muted-foreground">Your name, phone, and email will be pre-filled as Call Order #1 when staff sets up ShowingTime.</p>
                <Grid2>
                  <FormField control={form.control} name="showingCallOrder2Type" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Call Order #2 — Contact Type</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="agent">Agent</SelectItem>
                          <SelectItem value="owner">Owner</SelectItem>
                          <SelectItem value="occupant">Occupant</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="showingCallOrder2Confirm" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Call Order #2 — Confirmation Preference</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="confirm">I want to Confirm</SelectItem>
                          <SelectItem value="fyi">Just send an FYI</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )} />
                </Grid2>
                <Grid2>
                  <FormField control={form.control} name="showingCallOrder2Name" render={({ field }) => (
                    <FormItem><FormLabel>Name</FormLabel><FormControl><Input placeholder="Contact name" {...field} /></FormControl></FormItem>
                  )} />
                  <FormField control={form.control} name="showingCallOrder2Mobile" render={({ field }) => (
                    <FormItem><FormLabel>Mobile</FormLabel><FormControl><Input placeholder="Mobile phone" {...field} /></FormControl></FormItem>
                  )} />
                </Grid2>
                <Grid2>
                  <FormField control={form.control} name="showingCallOrder2AltPhone" render={({ field }) => (
                    <FormItem><FormLabel>Alt. Phone</FormLabel><FormControl><Input placeholder="Alt. phone" {...field} /></FormControl></FormItem>
                  )} />
                  <FormField control={form.control} name="showingCallOrder2Email" render={({ field }) => (
                    <FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" placeholder="Email" {...field} /></FormControl></FormItem>
                  )} />
                </Grid2>
                <div>
                  <p className="text-xs font-medium mb-2">Notification of Conf &amp; Canc&apos;d Appts via:</p>
                  <div className="flex gap-4">
                    {['Phone', 'Email', 'Text'].map((method) => (
                      <label key={method} className="flex items-center gap-1.5 cursor-pointer text-sm">
                        <input
                          type="checkbox"
                          checked={showingCallOrder2Notify.includes(method)}
                          onChange={() => toggleShowingCallOrder2Notify(method)}
                          className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                        />
                        {method}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
                <p className="text-sm font-semibold">Call Order #3 (Optional)</p>
                <Grid2>
                  <FormField control={form.control} name="showingCallOrder3Type" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contact Type</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="agent">Agent</SelectItem>
                          <SelectItem value="owner">Owner</SelectItem>
                          <SelectItem value="occupant">Occupant</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="showingCallOrder3Confirm" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirmation Preference</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="confirm">I want to Confirm</SelectItem>
                          <SelectItem value="fyi">Just send an FYI</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )} />
                </Grid2>
                <Grid2>
                  <FormField control={form.control} name="showingCallOrder3Name" render={({ field }) => (
                    <FormItem><FormLabel>Name</FormLabel><FormControl><Input placeholder="Contact name" {...field} /></FormControl></FormItem>
                  )} />
                  <FormField control={form.control} name="showingCallOrder3Mobile" render={({ field }) => (
                    <FormItem><FormLabel>Mobile</FormLabel><FormControl><Input placeholder="Mobile phone" {...field} /></FormControl></FormItem>
                  )} />
                </Grid2>
                <Grid2>
                  <FormField control={form.control} name="showingCallOrder3AltPhone" render={({ field }) => (
                    <FormItem><FormLabel>Alt. Phone</FormLabel><FormControl><Input placeholder="Alt. phone" {...field} /></FormControl></FormItem>
                  )} />
                  <FormField control={form.control} name="showingCallOrder3Email" render={({ field }) => (
                    <FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" placeholder="Email" {...field} /></FormControl></FormItem>
                  )} />
                </Grid2>
                <div>
                  <p className="text-xs font-medium mb-2">Notification of Conf &amp; Canc&apos;d Appts via:</p>
                  <div className="flex gap-4">
                    {['Phone', 'Email', 'Text'].map((method) => (
                      <label key={method} className="flex items-center gap-1.5 cursor-pointer text-sm">
                        <input
                          type="checkbox"
                          checked={showingCallOrder3Notify.includes(method)}
                          onChange={() => toggleShowingCallOrder3Notify(method)}
                          className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                        />
                        {method}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <Grid2>
                <FormField control={form.control} name="showingShareAgentInfo" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Share Showing Agent Info?</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="no">No, do not share</SelectItem>
                        <SelectItem value="company_only">Yes, share agent&apos;s company</SelectItem>
                        <SelectItem value="name_company">Yes, share agent&apos;s name and company</SelectItem>
                        <SelectItem value="all">Yes, share all agent details</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />
                <FormField control={form.control} name="showingAccessType" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Access Information — Lockbox Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="combo">Combo</SelectItem>
                        <SelectItem value="supra">Supra</SelectItem>
                        <SelectItem value="sentrilock">SentriLock</SelectItem>
                        <SelectItem value="risco_lb">Risco LB</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />
              </Grid2>
              <Grid2>
                <FormField control={form.control} name="showingAccessNotes" render={({ field }) => (
                  <FormItem><FormLabel>Access Notes</FormLabel><FormControl><Input placeholder="e.g. lockbox code, gate code..." {...field} /></FormControl></FormItem>
                )} />
                <FormField control={form.control} name="showingAccessDoor" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Door Location</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="front">Front Door</SelectItem>
                        <SelectItem value="back">Back Door</SelectItem>
                        <SelectItem value="side">Side Door</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />
              </Grid2>
              <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
                <p className="text-sm font-semibold">Alarm Information</p>
                <Grid3>
                  <FormField control={form.control} name="showingDisarmCode" render={({ field }) => (
                    <FormItem><FormLabel>Disarm Code</FormLabel><FormControl><Input placeholder="Disarm code" {...field} /></FormControl></FormItem>
                  )} />
                  <FormField control={form.control} name="showingArmCode" render={({ field }) => (
                    <FormItem><FormLabel>Arm Code</FormLabel><FormControl><Input placeholder="Arm code" {...field} /></FormControl></FormItem>
                  )} />
                  <FormField control={form.control} name="showingPasscode" render={({ field }) => (
                    <FormItem><FormLabel>Passcode</FormLabel><FormControl><Input placeholder="Passcode" {...field} /></FormControl></FormItem>
                  )} />
                </Grid3>
                <FormField control={form.control} name="showingAlarmNotes" render={({ field }) => (
                  <FormItem><FormLabel>Alarm Notes</FormLabel><FormControl><Input placeholder="Additional alarm notes..." {...field} /></FormControl></FormItem>
                )} />
              </div>
              <FormField control={form.control} name="showingNotesToStaff" render={({ field }) => (
                <FormItem><FormLabel>Notes to Appointment Staff</FormLabel><FormControl><Textarea placeholder="Special instructions for the appointment staff..." {...field} /></FormControl></FormItem>
              )} />
              <div>
                <p className="text-sm font-medium mb-2">Notes to Showing Agent (check all that apply):</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {SHOWING_NOTES_TO_AGENT_OPTIONS.map((note) => (
                    <label key={note} className="flex items-center gap-2 cursor-pointer text-sm">
                      <input
                        type="checkbox"
                        checked={showingNotesToAgent.includes(note)}
                        onChange={() => toggleShowingNotesToAgent(note)}
                        className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                      />
                      {note}
                    </label>
                  ))}
                </div>
                <div className="mt-3">
                  <FormField control={form.control} name="showingNotesToAgentOther" render={({ field }) => (
                    <FormItem><FormLabel>Additional Notes to Showing Agent</FormLabel><FormControl><Textarea placeholder="Any other instructions for showing agents..." {...field} /></FormControl></FormItem>
                  )} />
                </div>
              </div>
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          )}

          {/* ── Inspections (buyer/dual only — listing adds these when going under contract) */}
          {(watchedClosingType === "buyer" || watchedClosingType === "dual") && <Section title={watchedClosingType === "dual" ? "Buyer Inspections" : "Inspections"}>
            <FormField control={form.control} name="inspectionOrdered" render={({ field }) => (
              <FormItem>
                <FormLabel>Has Inspection Been Ordered?</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl><SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger></FormControl>
                  <SelectContent>
                    <SelectItem value="yes">Yes</SelectItem>
                    <SelectItem value="no">No</SelectItem>
                  </SelectContent>
                </Select>
              </FormItem>
            )} />

            <div className="max-w-xs">
              <FormField control={form.control} name="targetInspectionDate" render={({ field }) => (
                <FormItem><FormLabel>Target Inspection Date (General)</FormLabel><FormControl><Input type="date" {...field}
                  onChange={e => {
                    field.onChange(e);
                    const newDate = e.target.value;
                    if (newDate) {
                      const today = new Date().toISOString().split('T')[0];
                      const inspDeadline = form.getValues('inspectionDeadline');
                      let fallbackEnd = '';
                      if (inspDeadline) {
                        const d = new Date(inspDeadline + 'T12:00:00');
                        d.setDate(d.getDate() - 1);
                        fallbackEnd = d.toISOString().split('T')[0];
                      } else {
                        fallbackEnd = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                      }
                      setInspRows(prev => {
                        const updated = { ...prev };
                        for (const k of Object.keys(updated)) {
                          if (!updated[k].sent) {
                            updated[k] = { ...updated[k], preferredDate: newDate, fallbackDateStart: today, fallbackDateEnd: fallbackEnd };
                          }
                        }
                        return updated;
                      });
                    }
                  }}
                /></FormControl></FormItem>
              )} />
            </div>

            <FormField control={form.control} name="tcScheduleInspections" render={({ field }) => (
              <FormItem>
                <FormLabel>Inspection Scheduling Status</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl><SelectTrigger><SelectValue placeholder="Select status..." /></SelectTrigger></FormControl>
                  <SelectContent>
                    <SelectItem value="already_scheduled">✅ Already Scheduled — I contacted the inspector</SelectItem>
                    <SelectItem value="yes">📋 TC / Staff to Schedule</SelectItem>
                    <SelectItem value="other">📝 Other / Notes</SelectItem>
                  </SelectContent>
                </Select>
              </FormItem>
            )} />
            {tcScheduleInspections === 'other' && (
              <FormField control={form.control} name="tcScheduleInspectionsOther" render={({ field }) => (
                <FormItem><FormLabel>Please specify</FormLabel><FormControl><Input placeholder="Describe what you need..." {...field} /></FormControl></FormItem>
              )} />
            )}

              {/* Per-type inspector rows — checkbox to expand (same pattern as Pre-Listing Inspections) */}
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground mb-2">Inspection Types</p>
                <p className="text-xs text-muted-foreground mb-3">Check each inspection needed. Each row expands to assign an inspector and send a request.</p>
                {INSP_TYPES.map(({ key, label }) => {
                  const isChecked = inspectionTypes.includes(label);
                  const row = inspRows[key] || makeDefaultInspRow();
                  const vendors = inspVendors[key] || [];
                  const generalVendorId = inspRows['inspector_general']?.vendorId;
                  const generalVendors = inspVendors['inspector_general'] || [];
                  const generalVendor = generalVendorId && generalVendorId !== 'USE_GENERAL'
                    ? generalVendors.find(v => v.id === generalVendorId) || null
                    : null;
                  const today2 = new Date().toISOString().split('T')[0];
                  const inspDeadline2 = form.watch('inspectionDeadline');
                  let fbEnd = '';
                  if (inspDeadline2) {
                    const d = new Date(inspDeadline2 + 'T12:00:00');
                    d.setDate(d.getDate() - 1);
                    fbEnd = d.toISOString().split('T')[0];
                  } else {
                    fbEnd = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                  }
                  return (
                    <div key={key} className={`rounded-lg border transition-colors ${isChecked ? 'border-primary/30 bg-primary/5' : 'border-border bg-transparent'}`}>
                      {/* Checkbox row — always visible */}
                      <label className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleInspectionType(label)}
                          className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                        />
                        <span className="text-sm font-medium flex-1">{label}</span>
                        {row.sent && <Badge variant="outline" className="text-green-600 border-green-300 bg-green-50 text-xs"><CheckCircle2 className="h-3 w-3 mr-1" />Sent</Badge>}
                        {isChecked && !row.sent && <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                      </label>
                      {/* Expanded details — only when checked */}
                      {isChecked && (
                        <div className="px-4 pb-4 space-y-3 border-t border-border/50 pt-3">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="text-xs font-medium text-muted-foreground mb-1 block">Inspector</label>
                              <select
                                value={row.vendorId}
                                onChange={e => {
                                  if (e.target.value === '__ADD_NEW__') {
                                    setAddInspectorFor(key);
                                    setNewInspForm({ name: '', company: '', phone: '', email: '' });
                                  } else {
                                    updateInspRow(key, { vendorId: e.target.value });
                                    setAddInspectorFor(null);
                                  }
                                }}
                                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                              >
                                <option value="">— Select inspector —</option>
                                {key !== 'inspector_general' && (
                                  <option value="USE_GENERAL">
                                    {generalVendor ? `Use General Inspector (${generalVendor.name})` : 'Use General Inspector'}
                                  </option>
                                )}
                                {vendors.map(v => <option key={v.id} value={v.id}>{v.name}{v.company ? ` — ${v.company}` : ''}</option>)}
                                <option value="__ADD_NEW__">➕ Add new inspector...</option>
                              </select>
                              {addInspectorFor === key && (
                                <div className="mt-2 p-3 rounded-md border border-primary/30 bg-primary/5 space-y-2">
                                  <p className="text-xs font-semibold text-primary">Add New Inspector</p>
                                  <div className="grid grid-cols-2 gap-2">
                                    <input type="text" placeholder="Name *" value={newInspForm.name}
                                      onChange={e => setNewInspForm(p => ({ ...p, name: e.target.value }))}
                                      className="rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring col-span-2" />
                                    <input type="text" placeholder="Company" value={newInspForm.company}
                                      onChange={e => setNewInspForm(p => ({ ...p, company: e.target.value }))}
                                      className="rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                                    <input type="tel" placeholder="Phone" value={newInspForm.phone}
                                      onChange={e => setNewInspForm(p => ({ ...p, phone: e.target.value }))}
                                      className="rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                                    <input type="email" placeholder="Email" value={newInspForm.email}
                                      onChange={e => setNewInspForm(p => ({ ...p, email: e.target.value }))}
                                      className="rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring col-span-2" />
                                  </div>
                                  <div className="flex gap-2">
                                    <button type="button" onClick={() => addInspectorInline(key)}
                                      disabled={addInspectorSaving || !newInspForm.name.trim()}
                                      className="flex-1 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium disabled:opacity-50">
                                      {addInspectorSaving ? 'Saving...' : 'Save & Select'}
                                    </button>
                                    <button type="button"
                                      onClick={() => { setAddInspectorFor(null); setNewInspForm({ name: '', company: '', phone: '', email: '' }); }}
                                      className="rounded-md border border-input px-3 py-1.5 text-xs">Cancel</button>
                                  </div>
                                </div>
                              )}
                            </div>
                            <div>
                              <label className="text-xs font-medium text-muted-foreground mb-1 block">Send To</label>
                              <select
                                value={row.sendMode}
                                onChange={e => updateInspRow(key, { sendMode: e.target.value as 'selected' | 'all' })}
                                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                              >
                                <option value="selected">Selected inspector only</option>
                                <option value="all">All {label} inspectors</option>
                              </select>
                            </div>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                              <label className="text-xs font-medium text-muted-foreground mb-1 block">Preferred Date</label>
                              <Input type="date" value={row.preferredDate}
                                onChange={e => {
                                  updateInspRow(key, { preferredDate: e.target.value });
                                  if (key === 'inspector_general' && e.target.value) {
                                    setInspRows(prev => {
                                      const updated = { ...prev };
                                      for (const k of Object.keys(updated)) {
                                        if (k !== 'inspector_general' && !updated[k].sent) {
                                          updated[k] = { ...updated[k], preferredDate: e.target.value };
                                        }
                                      }
                                      return updated;
                                    });
                                  }
                                }}
                              />
                            </div>
                            <div>
                              <label className="text-xs font-medium text-muted-foreground mb-1 block">Time Start</label>
                              <Input type="time" value={row.preferredTimeStart} onChange={e => updateInspRow(key, { preferredTimeStart: e.target.value })} />
                            </div>
                            <div>
                              <label className="text-xs font-medium text-muted-foreground mb-1 block">Time End</label>
                              <Input type="time" value={row.preferredTimeEnd} onChange={e => updateInspRow(key, { preferredTimeEnd: e.target.value })} />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="text-xs font-medium text-muted-foreground mb-1 block">Available From</label>
                              <Input type="date" value={row.fallbackDateStart || today2}
                                onChange={e => updateInspRow(key, { fallbackDateStart: e.target.value })} />
                            </div>
                            <div>
                              <label className="text-xs font-medium text-muted-foreground mb-1 block">Available Until</label>
                              <Input type="date" value={row.fallbackDateEnd || fbEnd}
                                onChange={e => updateInspRow(key, { fallbackDateEnd: e.target.value })} />
                            </div>
                          </div>
                          {!row.sent && (
                            <div className="flex justify-end">
                              <Button
                                type="button"
                                size="sm"
                                disabled={row.sending || (!row.vendorId && row.sendMode === 'selected')}
                                onClick={async () => {
                                  if (!user) return;
                                  updateInspRow(key, { sending: true });
                                  try {
                                    const token = await user.getIdToken();
                                    const formVals = form.getValues();
                                    const effectiveVendorId = row.vendorId === 'USE_GENERAL' ? generalVendorId : row.vendorId;
                                    const res = await fetch('/api/agent/send-inspection-request', {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                                      body: JSON.stringify({
                                        vendorId: effectiveVendorId,
                                        sendMode: row.sendMode,
                                        inspectionType: label,
                                        preferredDate: row.preferredDate,
                                        preferredTimeStart: row.preferredTimeStart,
                                        preferredTimeEnd: row.preferredTimeEnd,
                                        fallbackDateStart: row.fallbackDateStart || today2,
                                        fallbackDateEnd: row.fallbackDateEnd || fbEnd,
                                        propertyAddress: formVals.address || '',
                                        clientName: formVals.buyerName || '',
                                        clientPhone: formVals.buyerPhone || '',
                                        clientEmail: formVals.buyerEmail || '',
                                        agentName: formVals.agentDisplayName || effectiveName || '',
                                        agentPhone: '',
                                        agentEmail: user.email || '',
                                        sqft: '',
                                        accessNotes: formVals.showingAccessNotes || '',
                                      }),
                                    });
                                    const data = await res.json();
                                    if (data.ok) {
                                      updateInspRow(key, { sent: true, sending: false });
                                      toast({ title: 'Request sent!', description: `Inspection request sent to ${data.vendorCount} inspector(s).` });
                                    } else {
                                      updateInspRow(key, { sending: false });
                                      toast({ title: 'Error', description: data.error || 'Failed to send request', variant: 'destructive' });
                                    }
                                  } catch (err: any) {
                                    updateInspRow(key, { sending: false });
                                    toast({ title: 'Error', description: err.message, variant: 'destructive' });
                                  }
                                }}
                              >
                                {row.sending ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Sending...</> : <><Send className="h-3 w-3 mr-1" />Send Request</>}
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
          </Section>}

          {/* ── Additional Info (warranty / compliance / occupancy / shortage) ──────────────────────────
              Moved above Buyer Closing Cost so agents fill in these details before entering commission.
          ─────────────────────────────────────────────────────────────────── */}
          {watchedClosingType !== 'referral' && <Section title="Additional Info">
            {/* Warranty */}
            <FormField control={form.control} name="warrantyAtClosing" render={({ field }) => (
              <FormItem>
                <FormLabel>Warranty Paid at Closing?</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl><SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger></FormControl>
                  <SelectContent>
                    <SelectItem value="yes">Yes</SelectItem>
                    <SelectItem value="no">No</SelectItem>
                  </SelectContent>
                </Select>
              </FormItem>
            )} />
            {warrantyAtClosing === 'yes' && (
              <div className="flex flex-wrap gap-4">
                <div className="max-w-xs">
                  <FormField control={form.control} name="warrantyPaidBy" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Who is paying?</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="buyer">Buyer</SelectItem>
                          <SelectItem value="seller">Seller</SelectItem>
                          <SelectItem value="agent">Agent Absorbed</SelectItem>
                          <SelectItem value="seller_closing_cost">Seller — from Closing Cost Paid to Buyer</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )} />
                </div>
                <div className="max-w-xs">
                  <FormField control={form.control} name="warrantyAmount" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Not to Exceed ($)</FormLabel>
                      <FormControl>
                        <CurrencyInput
                          value={field.value as any}
                          onChange={(val) => field.onChange(val)}
                          placeholder="700"
                        />
                      </FormControl>
                    </FormItem>
                  )} />
                </div>
              </div>
            )}

            <Separator />

            {/* Transaction Compliance Fee */}
            <FormField control={form.control} name="txComplianceFee" render={({ field }) => (
              <FormItem>
                <FormLabel>Transaction Compliance Fee?</FormLabel>
                <Select onValueChange={(value) => {
                  field.onChange(value);
                  if (value === 'no') {
                    form.setValue('txComplianceFeeAmount', '');
                    form.setValue('txComplianceFeePaidBy', '');
                    form.setValue('txComplianceFeePrimaryAgentAmount', '');
                    form.setValue('txComplianceFeeCoAgentAmount', '');
                    form.setValue('transactionFee', '');
                  }
                }} value={field.value}>
                  <FormControl><SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger></FormControl>
                  <SelectContent>
                    <SelectItem value="yes">Yes</SelectItem>
                    <SelectItem value="no">No</SelectItem>
                  </SelectContent>
                </Select>
              </FormItem>
            )} />
            {txComplianceFee === 'yes' && (
              <>
              <Grid2>
                <FormField control={form.control} name="txComplianceFeeAmount" render={({ field }) => (
                  <FormItem>
                    <FormLabel>How much? ($)</FormLabel>
                    <FormControl>
                      <CurrencyInput value={field.value as any} onChange={(val) => field.onChange(val)} placeholder="0" />
                    </FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="txComplianceFeePaidBy" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Who is paying for it?</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="buyer">Buyer pays directly</SelectItem>
                        <SelectItem value="seller">Seller pays directly</SelectItem>
                        <SelectItem value="seller_closing_cost">Seller pays from buyer closing cost</SelectItem>
                        <SelectItem value="agent">Agent(s) pay from commission</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />
              </Grid2>
              {txComplianceFeePaidBy === 'agent' && hasCoAgent && (
                <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50/60 p-4 dark:border-blue-900 dark:bg-blue-950/20">
                  <p className="text-sm font-semibold text-blue-900 dark:text-blue-200">Co-Agent Transaction Fee Allocation</p>
                  <p className="mt-1 text-xs text-blue-700 dark:text-blue-300">This only changes each agent’s net on this transaction. It does not change the co-agent commission split.</p>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <FormField control={form.control} name="txComplianceFeeAgentAllocation" render={({ field }) => (
                      <FormItem>
                        <FormLabel>How should the agents split the fee?</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl><SelectTrigger><SelectValue placeholder="Choose allocation" /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="primary_agent">Primary agent pays all</SelectItem>
                            <SelectItem value="co_agent">Co-agent pays all</SelectItem>
                            <SelectItem value="split_equal">Split equally</SelectItem>
                            <SelectItem value="custom">Custom dollar split</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )} />
                    <div className="rounded-md border border-blue-100 bg-white p-3 text-sm dark:border-blue-900 dark:bg-slate-950">
                      <p><span className="font-medium">Primary agent:</span> {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(primaryAgentFeeShare)}</p>
                      <p><span className="font-medium">Co-agent:</span> {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(coAgentFeeShare)}</p>
                    </div>
                  </div>
                  {txComplianceFeeAgentAllocation === 'custom' && (
                    <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
                      <FormField control={form.control} name="txComplianceFeePrimaryAgentAmount" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Primary agent fee amount ($)</FormLabel>
                          <FormControl><CurrencyInput value={field.value as any} onChange={field.onChange} placeholder="0.00" /></FormControl>
                        </FormItem>
                      )} />
                      <FormItem>
                        <FormLabel>Co-agent fee amount ($)</FormLabel>
                        <div className="flex h-10 items-center rounded-md border bg-muted px-3 text-sm font-medium">
                          {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(coAgentFeeShare)}
                        </div>
                        <FormDescription>Calculated as the remaining portion of the total fee.</FormDescription>
                      </FormItem>
                    </div>
                  )}
                </div>
              )}
              </>
            )}

            <Separator />

            {/* Occupancy Agreement */}
            <FormField control={form.control} name="occupancyAgreement" render={({ field }) => (
              <FormItem>
                <FormLabel>Occupancy Agreement?</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl><SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger></FormControl>
                  <SelectContent>
                    <SelectItem value="yes">Yes</SelectItem>
                    <SelectItem value="no">No</SelectItem>
                  </SelectContent>
                </Select>
              </FormItem>
            )} />
            {occupancyAgreement === 'yes' && (
              <FormField control={form.control} name="occupancyDates" render={({ field }) => (
                <FormItem>
                  <FormLabel>When does occupancy start &amp; end?</FormLabel>
                  <FormControl><Input placeholder="e.g. 3/15/2026 - 4/15/2026" {...field} /></FormControl>
                </FormItem>
              )} />
            )}

          </Section>}
          {/* NOTE: Shortage in Commission moved to Buyer Closing Cost section below */}
          {/* Shortage in Commission moved — now lives in Buyer Closing Cost section */}
          {/* Shortage section removed from Additional Info — it now lives in Buyer Closing Cost section below */}

          {/* ═══════════════════════════════════════════════════════════════════
              SECTION 5 — COMMISSION & FEES (buyer/dual only)
          ═══════════════════════════════════════════════════════════════════ */}
          {(watchedClosingType === 'buyer' || watchedClosingType === 'dual' || isPendingListing) && <Section title="Buyer Closing Cost Paid by Seller">
            {/* Buyer closing cost paid by seller */}
            {/* Buyer closing cost breakdown header */}
            <div className="max-w-xs">
              <FormField control={form.control} name="buyerClosingCostTotal" render={({ field }) => (
                <FormItem>
                  <FormLabel>Total Buyer&apos;s Closing Cost Paid by Seller ($)</FormLabel>
                  <FormControl>
                    <CurrencyInput
                      value={field.value as any}
                      onChange={(val) => field.onChange(val)}
                      placeholder="0"
                    />
                  </FormControl>
                </FormItem>
              )} />
            </div>
{/* Breakdown fields hidden per broker request — fields preserved in code and Firestore but not shown in UI */}

            <Separator />

            {/* Commission base price */}
            <FormField control={form.control} name="commissionBasePrice" render={({ field }) => (
              <FormItem>
                <FormLabel>Price Commission Is Based On (Sale Price – Seller Concessions)</FormLabel>
                <FormControl>
                  <CurrencyInput
                    value={field.value as any}
                    onChange={(val) => {
                      cbpManuallyEdited.current = true;
                      field.onChange(val);
                    }}
                    placeholder="Auto-filled from Sale Price"
                  />
                </FormControl>
                <FormDescription>Defaults to Sale Price. Edit if seller concessions reduce the commission base.</FormDescription>
                <FormMessage />
              </FormItem>
            )} />

            {/* Commission paid by seller */}
            <Separator />
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Commission Paid by Seller</p>
              {/* % / $ toggle */}
              <div className="flex items-center gap-2">
                <span className={`text-xs font-medium ${commissionMode === 'percent' ? 'text-primary' : 'text-muted-foreground'}`}>%</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={commissionMode === 'flat'}
                  onClick={toggleCommissionMode}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                    commissionMode === 'flat' ? 'bg-primary' : 'bg-input'
                  }`}
                >
                  <span
                    className={`pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform ${
                      commissionMode === 'flat' ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
                <span className={`text-xs font-medium ${commissionMode === 'flat' ? 'text-primary' : 'text-muted-foreground'}`}>Flat $</span>
              </div>
            </div>
            {commissionMode === 'flat' && (
              <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-700 rounded px-3 py-2">
                <strong>Flat Rate Mode:</strong> Enter the exact dollar amount the seller is paying. GCI % will not be auto-filled — enter GCI manually below.
              </p>
            )}
            <div className="space-y-4">
              {((watchedClosingType as string) === 'listing' || watchedClosingType === 'dual') && (
              <div className="flex items-end gap-4">
                <div className="flex-1 max-w-xs">
                  <FormField control={form.control} name="sellerPayingListingAgent" render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {commissionMode === 'flat' ? '$ Seller Paying Listing Agent' : '% Seller Paying Listing Agent'}
                      </FormLabel>
                      <FormControl>
                        {commissionMode === 'flat' ? (
                          <CurrencyInput
                            value={field.value as any}
                            onChange={(val) => field.onChange(val)}
                            placeholder="0"
                          />
                        ) : (
                          <div className="relative">
                            <PercentInput value={field.value as any} onChange={(e) => field.onChange(e)} placeholder="3" />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
                          </div>
                        )}
                      </FormControl>
                      <FormDescription>
                        {commissionMode === 'flat' ? 'Flat dollar amount paid to listing agent' : '% of Commission Base Price'}
                      </FormDescription>
                    </FormItem>
                  )} />
                </div>
                <label className="flex items-center gap-2 cursor-pointer text-sm pb-2">
                  <input
                    type="checkbox"
                    checked={form.watch('sellerPayingListingAgentUnknown') || false}
                    onChange={(e) => form.setValue('sellerPayingListingAgentUnknown', e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  Unknown / Confirm with listing agent
                </label>
              </div>
              )}
              <div className="max-w-xs">
                <FormField control={form.control} name="sellerPayingBuyerAgent" render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {commissionMode === 'flat' ? "$ Seller Paying Buyer's Agent" : "% Seller Paying Buyer's Agent"}
                    </FormLabel>
                    <FormControl>
                      {commissionMode === 'flat' ? (
                        <CurrencyInput
                          value={field.value as any}
                          onChange={(val) => field.onChange(val)}
                          placeholder="0"
                        />
                      ) : (
                        <div className="relative">
                          <PercentInput value={field.value as any} onChange={(e) => field.onChange(e)} placeholder="3" />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
                        </div>
                      )}
                    </FormControl>
                    <FormDescription>
                      {commissionMode === 'flat' ? "Flat dollar amount paid to buyer's agent" : '% of Commission Base Price'}
                    </FormDescription>
                  </FormItem>
                )} />
              </div>
            </div>

            {/* Agent view: Estimated earnings bar — shows split % and take-home; hides GCI and broker details */}
            {/* ── Shortage in Commission ──────────────────────────────────────── */}
            <Separator />
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Shortage in Commission</p>
            <FormField control={form.control} name="shortageInCommission" render={({ field }) => (
              <FormItem>
                <FormLabel>Is there a shortage in commission?</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl><SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger></FormControl>
                  <SelectContent>
                    <SelectItem value="yes">Yes</SelectItem>
                    <SelectItem value="no">No</SelectItem>
                  </SelectContent>
                </Select>
              </FormItem>
            )} />
            {shortageInCommission === 'yes' && (
              <Grid2>
                <FormField control={form.control} name="shortageAmount" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Shortage Amount ($)</FormLabel>
                    <FormControl>
                      <CurrencyInput value={field.value as any} onChange={(val) => field.onChange(val)} placeholder="0" />
                    </FormControl>
                    <FormDescription>Dollar amount of the commission shortage</FormDescription>
                  </FormItem>
                )} />
                <FormField control={form.control} name="shortageHandledBy" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Who is covering the shortage?</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="agent">Agent Absorbed (deducted from agent net)</SelectItem>
                        <SelectItem value="buyer">Buyer Paying Directly (adds to GCI)</SelectItem>
                        <SelectItem value="seller_closing_cost">Seller — from Closing Cost Paid to Buyer (adds to GCI)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      {shortageHandledBy === 'agent' && 'Shortage is deducted from your take-home. GCI is unchanged.'}
                      {shortageHandledBy === 'buyer' && 'Buyer brings this amount to closing. Added to GCI before split.'}
                      {shortageHandledBy === 'seller_closing_cost' && 'Paid from seller\'s closing cost contribution. Added to GCI before split and subtracted from closing cost pool.'}
                    </FormDescription>
                  </FormItem>
                )} />
              </Grid2>
            )}

            {/* ── Closing Cost Pool Breakdown ──────────────────────────────────── */}
            {(() => {
              const pool = Number(form.watch('buyerClosingCostTotal')) || 0;
              if (pool <= 0) return null;
              const shortageFromPool = shortageInCommission === 'yes' && shortageHandledBy === 'seller_closing_cost' ? shortageAmount : 0;
              const txFeeFromPool = txComplianceFee === 'yes' && txComplianceFeePaidBy === 'seller_closing_cost' ? txComplianceFeeAmount : 0;
              const warrantyFromPool = warrantyAtClosing === 'yes' && warrantyPaidBy === 'seller_closing_cost' ? warrantyAmount : 0;
              const totalAllocated = shortageFromPool + txFeeFromPool + warrantyFromPool;
              const remaining = pool - totalAllocated;
              const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
              return (
                <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 p-4 space-y-2">
                  <p className="text-xs font-bold text-blue-700 dark:text-blue-400 uppercase tracking-wide">📋 Seller-Paid Closing Cost Allocation</p>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total Seller-Paid Closing Cost</span>
                      <span className="font-semibold">{fmt(pool)}</span>
                    </div>
                    {shortageFromPool > 0 && (
                      <div className="flex justify-between text-amber-700 dark:text-amber-400">
                        <span>− Shortage in Commission</span>
                        <span className="font-semibold">({fmt(shortageFromPool)})</span>
                      </div>
                    )}
                    {txFeeFromPool > 0 && (
                      <div className="flex justify-between text-amber-700 dark:text-amber-400">
                        <span>− Transaction Compliance Fee</span>
                        <span className="font-semibold">({fmt(txFeeFromPool)})</span>
                      </div>
                    )}
                    {warrantyFromPool > 0 && (
                      <div className="flex justify-between text-amber-700 dark:text-amber-400">
                        <span>− Home Warranty</span>
                        <span className="font-semibold">({fmt(warrantyFromPool)})</span>
                      </div>
                    )}
                    <div className={`flex justify-between border-t pt-1 font-bold ${remaining < 0 ? 'text-red-600' : 'text-green-700 dark:text-green-400'}`}>
                      <span>Remaining for Buyer Closing Costs</span>
                      <span>{fmt(remaining)}</span>
                    </div>
                    {remaining < 0 && (
                      <p className="text-xs text-red-600 font-semibold">⚠️ Allocations exceed the seller-paid closing cost total by {fmt(Math.abs(remaining))}.</p>
                    )}
                  </div>
                </div>
              );
            })()}

            {!hasOperationalEditAuthority && (
              <>
                <Separator />
                {(() => {
                  const primaryAgentDollar = Number(form.watch('agentDollar')) || 0;
                  const gci = Number(form.watch('gci')) || 0;
                  // Compute netGci after referral deduction for correct split % display
                  const previewRefPct = Number(form.watch('outboundReferralFeePercent') || 0);
                  const previewRefDollar = Number(form.watch('outboundReferralFeeDollar') || 0);
                  const previewHasRef = form.watch('hasOutboundReferral');
                  const previewRefFee = previewHasRef && previewRefPct > 0
                    ? (previewRefDollar > 0 ? previewRefDollar : Math.round(gci * (previewRefPct / 100) * 100) / 100)
                    : 0;
                  const previewNetGci = Math.max(0, gci - previewRefFee);
                  const watchedTxCompFee = form.watch('txComplianceFee');
                  const watchedTxCompFeeAmt = Number(form.watch('txComplianceFeeAmount')) || 0;
                  const watchedTxCompFeePaidBy = form.watch('txComplianceFeePaidBy') || '';
                  // The transaction GET route only includes this object for an authorized
                  // co-agent. Use it directly so the agent-facing card cannot fall back to
                  // the primary agent's tier or fee responsibility.
                  const participantAllocation = viewerParticipantAllocation;
                  const hasParticipantAllocation = Boolean(participantAllocation);
                  const participantFeeShare = hasParticipantAllocation
                    ? Number(participantAllocation?.transactionFeeDeduction || 0)
                    : watchedTxCompFeeAmt;
                  const agentPaysFee = watchedTxCompFee === 'yes' && watchedTxCompFeeAmt > 0 && watchedTxCompFeePaidBy === 'agent' && participantFeeShare > 0;
                  const feeDeduction = agentPaysFee ? participantFeeShare : 0;
                  // Shortage absorbed by agent = write-off, no deduction from agent net or GCI
                  const shortageAbsorbed = 0; // no financial effect when agent absorbs
                  // Warranty absorbed by agent = already deducted from GCI before split (in auto-calc useEffect)
                  // so agentDollar already reflects the reduced GCI — no additional deduction here
                  const warrantyAbsorbed = warrantyAtClosing === 'yes' && warrantyPaidBy === 'agent' ? warrantyAmount : 0;
                  const agentDollar = hasParticipantAllocation
                    ? Number(participantAllocation?.netCommission || 0) + participantFeeShare
                    : primaryAgentDollar;
                  const agentNet = hasParticipantAllocation
                    ? Number(participantAllocation?.netCommission || 0)
                    : agentDollar - feeDeduction; // only tx fee deducted after split
                  // Split % is relative to netGci (after referral), not gross GCI
                  const splitBase = hasParticipantAllocation
                    ? Number(participantAllocation?.grossCommission || 0)
                    : previewNetGci;
                  const splitPct = splitBase > 0 ? Math.round((agentDollar / splitBase) * 100) : (activeTier?.agentSplitPercent ?? 0);
                  const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n);
                  const fmtExact = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
                  if (agentDollar <= 0 && !activeTier && !hasParticipantAllocation) return (
                    <div className="max-w-xs">
                      <FormField control={form.control} name="agentDollar" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Agent Net $</FormLabel>
                          <FormControl>
                            <CurrencyInput value={field.value as any} onChange={(val) => field.onChange(val)} placeholder="Auto-calculated" readOnly className="bg-background cursor-default" />
                          </FormControl>
                          <FormDescription>Calculated from your commission profile and tier.</FormDescription>
                        </FormItem>
                      )} />
                    </div>
                  );
                  return (
                    <div className="mt-2 rounded-xl border-2 border-green-300 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 dark:border-green-700 p-4">
                      <p className="text-xs font-bold text-green-700 dark:text-green-400 uppercase tracking-wider mb-3">💰 Your Estimated Earnings on This Deal</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="text-center">
                          <p className="text-xs text-muted-foreground mb-0.5">Your Split ({splitPct}%)</p>
                          <p className="text-lg font-black text-foreground">{fmt(agentDollar)}</p>
                        </div>
                        <div className="text-center bg-green-100 dark:bg-green-900/40 rounded-lg p-2">
                          <p className="text-xs font-bold text-green-700 dark:text-green-400 mb-0.5">You Take Home</p>
                          <p className="text-xl font-black text-green-700 dark:text-green-300">{fmtExact(agentNet)}</p>
                        </div>
                      </div>
                      {previewRefFee > 0 && (
                        <div className="mt-2 pt-2 border-t border-green-200 dark:border-green-800 text-xs text-amber-800 dark:text-amber-300 space-y-0.5">
                          <p className="font-semibold">Referral Fee Breakdown</p>
                          <p>Gross GCI: <strong>{fmtExact(gci)}</strong></p>
                          <p>Outbound Referral ({previewRefPct}%): <strong>-{fmtExact(previewRefFee)}</strong></p>
                          <p>Net for Split: <strong>{fmtExact(previewNetGci)}</strong></p>
                        </div>
                      )}
                      {watchedTxCompFee === 'yes' && watchedTxCompFeeAmt > 0 && (
                        <div className="mt-2 pt-2 border-t border-green-200 dark:border-green-800 text-center">
                          <p className="text-xs text-muted-foreground">Transaction Fee</p>
                          {agentPaysFee ? (
                            <p className="text-sm font-bold text-red-600">-{fmt(feeDeduction)} deducted from your commission</p>
                          ) : hasParticipantAllocation ? (
                            <p className="text-sm font-semibold text-blue-600">Primary agent pays — $0 deducted from your commission</p>
                          ) : (
                            <p className="text-sm font-semibold text-blue-600">{fmt(watchedTxCompFeeAmt)} — not deducted from your commission</p>
                          )}
                        </div>
                      )}
                      {shortageInCommission === 'yes' && shortageHandledBy === 'agent' && shortageAmount > 0 && (
                        <div className="mt-2 pt-2 border-t border-green-200 dark:border-green-800 text-center">
                          <p className="text-xs text-muted-foreground">Shortage in Commission (Agent Absorbed)</p>
                          <p className="text-sm font-semibold text-amber-600">Write-off — not collected. No deduction from your net.</p>
                        </div>
                      )}
                      {warrantyAbsorbed > 0 && (
                        <div className="mt-2 pt-2 border-t border-green-200 dark:border-green-800 text-center">
                          <p className="text-xs text-muted-foreground">Home Warranty (Agent Pays — deducted from GCI before split)</p>
                          <p className="text-sm font-bold text-amber-600">-{fmt(warrantyAbsorbed)} taken off GCI before your split was calculated</p>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </>
            )}

            {/* Admin + TC: GCI & Commission % */}
            {hasOperationalEditAuthority && (
              <>
                <Separator />
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Gross Commission</p>
                <Grid3>
                  <FormField control={form.control} name="commissionPercent" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Gross Commission %</FormLabel>
                      <FormControl>
                        <PercentInput
                          value={field.value as any}
                          placeholder="3"
                          onChange={(e) => {
                            commPctManuallyEdited.current = true;
                            field.onChange(e);
                          }}
                        />
                      </FormControl>
                      <FormDescription>{commPctManuallyEdited.current ? 'Manual rate override — saved as entered until staff changes it.' : 'Auto-filled from seller-paying % above'}</FormDescription>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="gci" render={({ field }) => (
                    <FormItem>
                      <FormLabel>GCI ($)</FormLabel>
                      <FormControl>
                        <CurrencyInput
                          value={field.value as any}
                          onChange={(val) => {
                            // Lock GCI so CBP×pct auto-calc won't overwrite this value.
                            gciManuallyEdited.current = true;
                            field.onChange(val);
                          }}
                          placeholder="0"
                        />
                      </FormControl>
                      <FormDescription>{gciManuallyEdited.current ? 'Manual GCI override — saved as entered until staff changes it.' : 'Gross Commission Income — type to override auto-calc'}</FormDescription>
                    </FormItem>
                  )} />
                </Grid3>
              </>
            )}

            {/* Commission Split (Admin + TC) */}
            {hasOperationalEditAuthority && (
              <>
                <Separator />
                {agentCommission && (
                  <div className={`rounded-md border px-4 py-3 text-sm ${
                    activeTier
                      ? 'border-green-200 bg-green-50 text-green-800'
                      : commissionLoading
                        ? 'border-blue-200 bg-blue-50 text-blue-800'
                        : 'border-amber-200 bg-amber-50 text-amber-800'
                  }`}>
                    {commissionLoading ? (
                      <span>Loading commission structure...</span>
                    ) : activeTier ? (
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <span>
                            <strong>Auto-calculated</strong> using tier &quot;{activeTier.tierName}&quot; &mdash;
                            Agent {activeTier.agentSplitPercent}% / Broker {activeTier.companySplitPercent}%
                            {activeTier.transactionFee != null && ` / Fee $${activeTier.transactionFee.toLocaleString('en-US')}`}
                          </span>
                          {commissionManualOverride.current && (
                            <Badge variant="outline" className="text-amber-700 border-amber-300">Manual Override</Badge>
                          )}
                        </div>
                        {agentCommission && (
                          <span className="text-xs text-green-700 opacity-80">
                            YTD GCI: <strong>${(agentCommission.ytdTierProgressionGci ?? agentCommission.ytdTierProgressionCompanyDollar ?? 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</strong>
                            {agentCommission.cycleStart && agentCommission.cycleEnd && (
                              <> &nbsp;&mdash;&nbsp; Cycle: {agentCommission.cycleStart} &ndash; {agentCommission.cycleEnd}</>
                            )}
                            {(agentCommission.ytdTierProgressionGci ?? agentCommission.ytdTierProgressionCompanyDollar ?? 0) === 0 && (
                              <span className="ml-2 font-semibold text-amber-700">(YTD is $0 — tier based on current GCI. Rebuild rollup if incorrect.)</span>
                            )}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span>
                        {agentCommission.tiers.length === 0
                          ? 'No commission tiers found for this agent. Please set up their commission profile.'
                          : Number(watchedGCI) > 0
                            ? `Commission structure loaded (${agentCommission.tiers.length} tier${agentCommission.tiers.length !== 1 ? 's' : ''}). No matching tier for GCI $${Number(watchedGCI).toLocaleString('en-US')}.`
                            : `Commission structure loaded (${agentCommission.tiers.length} tier${agentCommission.tiers.length !== 1 ? 's' : ''}${agentCommission.tiersSource === 'team_template' ? ' — from team default' : ''}). Enter GCI to auto-calculate split.`
                        }
                      </span>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Broker / Agent Split</p>
                  {agentCommission && commissionManualOverride.current && (
                    <button
                      type="button"
                      className="text-xs font-medium text-blue-600 hover:underline"
                      onClick={() => {
                        commissionManualOverride.current = false;
                        const gci = Number(form.getValues('gci')) || 0;
                        if (gci > 0 && agentCommission) {
                          const ytd2 = agentCommission.ytdTierProgressionGci ?? agentCommission.ytdTierProgressionCompanyDollar ?? 0;
                          const tierLookup2 = ytd2 > 0 ? ytd2 : gci;
                          const tier = findActiveTier(agentCommission.tiers, tierLookup2);
                          setActiveTier(tier);
                          if (tier) {
                            // Deduct outbound referral fee before split (same logic as auto-calc useEffect)
                            const refPct2 = Number(form.getValues('outboundReferralFeePercent') || 0);
                            const refDollar2 = Number(form.getValues('outboundReferralFeeDollar') || 0);
                            const hasRef2 = form.getValues('hasOutboundReferral');
                            let refFee2 = 0;
                            if (hasRef2 && refPct2 > 0) {
                              const autoDollar2 = Math.round(gci * (refPct2 / 100) * 100) / 100;
                              refFee2 = refDollar2 > 0 ? refDollar2 : autoDollar2;
                              form.setValue('outboundReferralFeeDollar', refFee2 as any);
                            }
                            const netGci2 = Math.max(0, gci - refFee2);
                            form.setValue('agentPct', tier.agentSplitPercent as any);
                            form.setValue('brokerPct', tier.companySplitPercent as any);
                            form.setValue('agentDollar', Number((netGci2 * (tier.agentSplitPercent / 100)).toFixed(2)) as any);
                            form.setValue('brokerGci', Number((netGci2 * (tier.companySplitPercent / 100)).toFixed(2)) as any);
                            const txFee2 = tier.transactionFee ?? agentCommission.defaultTransactionFee ?? 0;
                            if (txFee2 > 0) {
                              form.setValue('txComplianceFee', 'yes');
                              form.setValue('txComplianceFeeAmount', txFee2 as any);
                              if (!form.getValues('txComplianceFeePaidBy')) {
                                form.setValue('txComplianceFeePaidBy', 'agent');
                              }
                            }
                          }
                        }
                      }}
                    >
                      Re-calculate from agent profile
                    </button>
                  )}
                </div>
                {hasOperationalEditAuthority && commissionManualOverride.current && !Number(watchedBrokerPct) && !Number(watchedAgentPct) && (
                  <p className="text-xs text-amber-700">
                    Manual dollar override: percentage splits are cleared so the entered dollar amounts remain authoritative.
                  </p>
                )}
                <Grid2>
                  <FormField control={form.control} name="brokerPct" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Broker %</FormLabel>
                      <FormControl>
                        <PercentInput
                          value={field.value as any}
                          placeholder="30"
                          onChange={(e) => { commissionManualOverride.current = true; manualPercentageSplitEdited.current = true; field.onChange(e); }}
                        />
                      </FormControl>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="brokerGci" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Broker GCI ($)</FormLabel>
                      <FormControl>
                        <CurrencyInput
                          value={field.value as any}
                          onChange={(val) => setManualDollarSplit('brokerGci', val)}
                          placeholder="0"
                        />
                      </FormControl>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="agentPct" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Agent %</FormLabel>
                      <FormControl>
                        <PercentInput
                          value={field.value as any}
                          placeholder="70"
                          onChange={(e) => { commissionManualOverride.current = true; manualPercentageSplitEdited.current = true; field.onChange(e); }}
                        />
                      </FormControl>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="agentDollar" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Agent Net $</FormLabel>
                      <FormControl>
                        <CurrencyInput
                          value={field.value as any}
                          onChange={(val) => setManualDollarSplit('agentDollar', val)}
                          placeholder="0"
                        />
                      </FormControl>
                      <FormDescription>Auto-calculated from agent profile. Editing a dollar amount clears both percentage splits and saves a manual override.</FormDescription>
                    </FormItem>
                  )} />
                </Grid2>

                {/* Inline Commission Preview */}
                {(() => {
                  const gci = Number(form.watch('gci')) || 0;
                  const agentDollar = Number(form.watch('agentDollar')) || 0;
                  // Referral fee deduction for admin/TC preview card
                  const adminRefPct = Number(form.watch('outboundReferralFeePercent') || 0);
                  const adminRefDollar = Number(form.watch('outboundReferralFeeDollar') || 0);
                  const adminHasRef = form.watch('hasOutboundReferral');
                  const adminRefFee = adminHasRef && adminRefPct > 0
                    ? (adminRefDollar > 0 ? adminRefDollar : Math.round(gci * (adminRefPct / 100) * 100) / 100)
                    : 0;
                  const adminNetGci = Math.max(0, gci - adminRefFee);
                  const watchedTxCompFee = form.watch('txComplianceFee');
                  const watchedTxCompFeeAmt = Number(form.watch('txComplianceFeeAmount')) || 0;
                  const watchedTxCompFeePaidBy = form.watch('txComplianceFeePaidBy') || '';
                  if (gci <= 0) return null;
                  const coAgentGci = Number((gci * (watchedCoPct / 100)).toFixed(2));
                  const coAgentYtd = coAgentViewerCommission?.ytdTierProgressionGci
                    ?? coAgentViewerCommission?.ytdTierProgressionCompanyDollar
                    ?? 0;
                  const coAgentTier = coAgentViewerCommission
                    ? findActiveTier(coAgentViewerCommission.tiers, coAgentYtd > 0 ? coAgentYtd : coAgentGci)
                    : null;
                  const calculatedCoAgentGross = coAgentTier
                    ? Number((coAgentGci * (coAgentTier.agentSplitPercent / 100)).toFixed(2))
                    : 0;
                  // Agent views use their own authorized allocation. Operational views always
                  // use the primary participant's allocation, which prevents a prior
                  // impersonated co-agent view from changing the admin payout card.
                  const exactCoAgentAllocation = viewerParticipantAllocation;
                  const primaryParticipantAllocation = participantAllocations?.primary;
                  const hasCoAgentParticipantPreview = !hasOperationalEditAuthority && Boolean(exactCoAgentAllocation);
                  const hasPrimaryParticipantPreview = hasOperationalEditAuthority && Boolean(primaryParticipantAllocation);
                  const payoutAllocation = hasPrimaryParticipantPreview
                    ? primaryParticipantAllocation
                    : exactCoAgentAllocation;
                  const hasParticipantPreview = hasCoAgentParticipantPreview || hasPrimaryParticipantPreview;
                  const displayedTier = hasCoAgentParticipantPreview ? coAgentTier : activeTier;
                  const displayedSplitGci = hasParticipantPreview
                    ? Number(payoutAllocation?.grossCommission || (hasCoAgentParticipantPreview ? coAgentGci : adminNetGci))
                    : adminNetGci;
                  const displayedAgentDollar = hasParticipantPreview
                    ? (payoutAllocation
                        ? Number(payoutAllocation.netCommission || 0) + Number(payoutAllocation.transactionFeeDeduction || 0)
                        : calculatedCoAgentGross)
                    : agentDollar;
                  // In a shared file, deduct only the fee assigned to the participant viewing it.
                  const viewerFeeShare = hasParticipantPreview
                    ? Number(payoutAllocation?.transactionFeeDeduction || 0)
                    : primaryAgentFeeShare;
                  const agentPaysFee = watchedTxCompFee === 'yes' && watchedTxCompFeeAmt > 0 && watchedTxCompFeePaidBy === 'agent' && viewerFeeShare > 0;
                  const feeDeduction = agentPaysFee ? viewerFeeShare : 0;
                  const agentNet = hasParticipantPreview && payoutAllocation
                    ? Number(payoutAllocation.netCommission || 0)
                    : displayedAgentDollar - feeDeduction;
                  const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n);
                  const fmtExact = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
                  const feeLabel: Record<string, string> = {
                    buyer: 'Collect from Buyer/Title at Closing',
                    seller: 'Covered by Seller',
                    seller_closing_cost: 'From Seller Closing Cost Concession',
                  };

                  // Detect team-member-with-leader scenario from the active tier.
                  // leaderStructurePercent = leader's side % (used only to compute broker cut)
                  // agentSplitPercent (= memberPercentOfLeaderSide) = member's direct % of full GCI
                  const isTeamMemberWithLeader = !!(displayedTier?.leaderStructurePercent && displayedTier?.memberPercentOfLeaderSide);
                  const leaderStructurePct = displayedTier?.leaderStructurePercent ?? 0;   // e.g. 75%
                  const memberDirectPct = displayedTier?.agentSplitPercent ?? 0;           // e.g. 70%
                  const companyPct = displayedTier?.companySplitPercent ?? 0;              // e.g. 25%
                  // leaderStructureGross = netGci × leaderPercent (the leader's side before member payout)
                  // All split math uses adminNetGci (after referral deduction)
                  const leaderStructureGross = isTeamMemberWithLeader ? Number((displayedSplitGci * (leaderStructurePct / 100)).toFixed(2)) : 0;
                  const companyRetained = isTeamMemberWithLeader
                    ? Number((displayedSplitGci * (companyPct / 100)).toFixed(2))
                    : Number((displayedSplitGci - displayedAgentDollar).toFixed(2));
                  // Leader retains the spread: leaderStructureGross - memberPaid
                  const leaderRetained = isTeamMemberWithLeader
                    ? Number((leaderStructureGross - displayedAgentDollar).toFixed(2))
                    : 0;

                  const currentSalePrice = Number(form.watch('salePrice')) || 0;
                  const currentListPrice = Number(form.watch('listPrice')) || 0;
                  const currentStatus2 = form.watch('status') as string || '';
                  const isActiveListing2 = ['active', 'coming_soon', 'temp_off_market'].includes(currentStatus2);
                  const isEstimatedFromListPrice = isActiveListing2 && currentSalePrice === 0 && currentListPrice > 0;
                  return (
                    <div className="mt-4 rounded-xl border-2 border-green-300 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 dark:border-green-700 p-4">
                      <p className="text-xs font-bold text-green-700 dark:text-green-400 uppercase tracking-wider mb-3">💰 Your Estimated Earnings on This Deal</p>
                      {isEstimatedFromListPrice && (
                        <p className="text-xs text-amber-600 dark:text-amber-400 mb-2 font-medium">⚠️ Estimated based on list price — will update to sale price when pending</p>
                      )}

                      {isTeamMemberWithLeader ? (
                        // ── Two-step team member breakdown ────────────────────────────────────
                        <>
                          {hasOperationalEditAuthority ? (
                            // Admin/TC sees full breakdown: GCI, broker cut, leader split, agent net
                            <>
                              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-3">
                                <div className="text-center">
                                  <p className="text-xs text-muted-foreground mb-0.5">Gross Commission</p>
                                  <p className="text-lg font-black text-foreground">{fmt(gci)}</p>
                                </div>
                                {hasPrimaryParticipantPreview && (
                                  <div className="text-center">
                                    <p className="text-xs text-muted-foreground mb-0.5">{primaryParticipantAllocation?.agentDisplayName || 'Primary Agent'} Allocated GCI</p>
                                    <p className="text-lg font-black text-foreground">{fmt(displayedSplitGci)}</p>
                                  </div>
                                )}
                                <div className="text-center">
                                  <p className="text-xs text-muted-foreground mb-0.5">Broker ({companyPct}%)</p>
                                  <p className="text-lg font-black text-foreground">{fmt(companyRetained)}</p>
                                </div>
                                <div className="text-center">
                                  <p className="text-xs text-muted-foreground mb-0.5">Your Split ({memberDirectPct}%)</p>
                                  <p className="text-lg font-black text-foreground">{fmtExact(displayedAgentDollar)}</p>
                                </div>
                                <div className="text-center bg-green-100 dark:bg-green-900/40 rounded-lg p-2">
                                  <p className="text-xs font-bold text-green-700 dark:text-green-400 mb-0.5">You Take Home</p>
                                  <p className="text-xl font-black text-green-700 dark:text-green-300">{fmtExact(agentNet)}</p>
                                </div>
                              </div>
                              {/* Admin-only: commission flow breakdown */}
                              <div className="mt-2 pt-2 border-t border-green-200 dark:border-green-800 grid grid-cols-3 gap-2 text-center">
                                <div>
                                  <p className="text-xs text-muted-foreground">Leader Retains (spread)</p>
                                  <p className="text-sm font-bold text-amber-600 dark:text-amber-400">{fmtExact(leaderRetained)}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-muted-foreground">Leader Side ({leaderStructurePct}%)</p>
                                  <p className="text-sm font-bold text-muted-foreground">{fmt(leaderStructureGross)}</p>
                                </div>
                                {watchedTxCompFee === 'yes' && watchedTxCompFeeAmt > 0 && (
                                  <div>
                                    <p className="text-xs text-muted-foreground">Transaction Fee</p>
                                    {agentPaysFee ? (
                                      <p className="text-sm font-bold text-red-600">-{fmt(feeDeduction)}</p>
                                    ) : (
                                      <p className="text-sm font-semibold text-blue-600">{fmt(watchedTxCompFeeAmt)}</p>
                                    )}
                                  </div>
                                )}
                              </div>
                              {!agentPaysFee && watchedTxCompFee === 'yes' && watchedTxCompFeeAmt > 0 && (
                                <p className="text-xs text-blue-600 mt-2 font-medium">Transaction fee is not deducted from your commission — collect {fmt(watchedTxCompFeeAmt)} separately at closing.</p>
                              )}
                            </>
                          ) : (
                            // Agent sees only their net take-home — no GCI, broker, or leader details
                            <>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                                <div className="text-center">
                                  <p className="text-xs text-muted-foreground mb-0.5">Your Split ({displayedSplitGci > 0 ? Math.round((displayedAgentDollar / displayedSplitGci) * 100) : memberDirectPct}%)</p>
                                  <p className="text-lg font-black text-foreground">{fmtExact(displayedAgentDollar)}</p>
                                </div>
                                <div className="text-center bg-green-100 dark:bg-green-900/40 rounded-lg p-2">
                                  <p className="text-xs font-bold text-green-700 dark:text-green-400 mb-0.5">You Take Home</p>
                                  <p className="text-xl font-black text-green-700 dark:text-green-300">{fmtExact(agentNet)}</p>
                                </div>
                              </div>
                              {watchedTxCompFee === 'yes' && watchedTxCompFeeAmt > 0 && (
                                <div className="mt-2 pt-2 border-t border-green-200 dark:border-green-800 text-center">
                                  <p className="text-xs text-muted-foreground">Transaction Fee</p>
                                  {agentPaysFee ? (
                                    <p className="text-sm font-bold text-red-600">-{fmt(feeDeduction)} deducted from your commission</p>
                                  ) : (
                                    <p className="text-sm font-semibold text-blue-600">{fmt(watchedTxCompFeeAmt)} — not deducted from your commission</p>
                                  )}
                                </div>
                              )}
                            </>
                          )}
                        </>
                      ) : (
                        // ── Standard single-step breakdown ──────────────────────────────────
                        <>
                          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                            {/* Gross Commission — admin and TC only */}
                            {hasOperationalEditAuthority && (
                              <div className="text-center">
                                <p className="text-xs text-muted-foreground mb-0.5">Gross Commission</p>
                                <p className="text-lg font-black text-foreground">{fmt(gci)}</p>
                              </div>
                            )}
                            {hasPrimaryParticipantPreview && (
                              <div className="text-center">
                                <p className="text-xs text-muted-foreground mb-0.5">{primaryParticipantAllocation?.agentDisplayName || 'Primary Agent'} Allocated GCI</p>
                                <p className="text-lg font-black text-foreground">{fmt(displayedSplitGci)}</p>
                              </div>
                            )}
                            <div className="text-center">
                              <p className="text-xs text-muted-foreground mb-0.5">Your Split ({displayedSplitGci > 0 ? Math.round((displayedAgentDollar / displayedSplitGci) * 100) : 0}%)</p>
                              <p className="text-lg font-black text-foreground">{fmt(displayedAgentDollar)}</p>
                            </div>
                            {watchedTxCompFee === 'yes' && watchedTxCompFeeAmt > 0 && (
                              <div className="text-center">
                                <p className="text-xs text-muted-foreground mb-0.5">Transaction Fee</p>
                                {agentPaysFee ? (
                                  <p className="text-lg font-black text-red-600">-{fmt(feeDeduction)}</p>
                                ) : (
                                  <p className="text-sm font-semibold text-blue-600">{fmt(watchedTxCompFeeAmt)}</p>
                                )}
                                {!agentPaysFee && watchedTxCompFeePaidBy && (
                                  <p className="text-xs text-blue-500 mt-0.5">{feeLabel[watchedTxCompFeePaidBy] || 'Not deducted'}</p>
                                )}
                              </div>
                            )}
                            <div className="text-center bg-green-100 dark:bg-green-900/40 rounded-lg p-2">
                              <p className="text-xs font-bold text-green-700 dark:text-green-400 mb-0.5">You Take Home</p>
                              <p className="text-xl font-black text-green-700 dark:text-green-300">{fmt(agentNet)}</p>
                            </div>
                          </div>
                          {!agentPaysFee && watchedTxCompFee === 'yes' && watchedTxCompFeeAmt > 0 && (
                            <p className="text-xs text-blue-600 mt-2 font-medium">Transaction fee is not deducted from your commission — collect {fmt(watchedTxCompFeeAmt)} separately at closing.</p>
                          )}
                        </>
                      )}
                    </div>
                  );
                })()}
              </>
            )}

            {/* Pass-Through Transaction Toggle — admin/TC/staff only */}
            {hasOperationalEditAuthority && (
              <>
                <Separator />
                <div className="flex items-start gap-4 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 p-4">
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Pass-Through Transaction</p>
                    <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                      Agent is buying/selling personal property. No broker commission collected.
                      This transaction will count as a closed unit but will NOT count toward leaderboard volume, tier advancement, or broker GCI.
                    </p>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer flex-shrink-0 mt-0.5">
                    <input
                      type="checkbox"
                      checked={!!form.watch('isPassThrough')}
                      onChange={e => form.setValue('isPassThrough', e.target.checked, { shouldDirty: true })}
                      className="h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                    />
                    <span className="text-sm font-medium text-amber-800 dark:text-amber-300">Mark as Pass-Through</span>
                  </label>
                </div>
              </>
            )}
          </Section>}

          {/* ── Additional Information (free-text comments) ───────────────────────────────────────────────────
              Moved below commission section.
          ─────────────────────────────────────────────────────────────────── */}
          <Section title="Additional Information">
            <FormField control={form.control} name="additionalComments" render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Textarea
                    placeholder="Any additional comments, special conditions, contingencies, HOA info, key location, anything important..."
                    className="min-h-[100px]"
                    {...field}
                  />
                </FormControl>
              </FormItem>
            )} />
          </Section>

          {/* ── Documents ────────────────────────────────────────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Paperclip className="h-4 w-4" />
                Documents
              </CardTitle>
              <CardDescription>
                Upload your Purchase Agreement, Listing Agreement, or any other relevant paperwork.
                Accepted formats: PDF, JPG, PNG, WEBP, HEIC, DOC, DOCX (max 25 MB each).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Uploaded file list */}
              {uploadedDocs.length > 0 && (
                <div className="space-y-2">
                  {uploadedDocs.map((doc) => (
                    <div
                      key={doc.storagePath}
                      className="flex items-center justify-between gap-3 rounded-lg border bg-muted/40 px-3 py-2"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <a
                          href={doc.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-medium truncate hover:underline text-primary"
                        >
                          {doc.name}
                        </a>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 flex-shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => removeDoc(doc.storagePath)}
                      >
                        <X className="h-4 w-4" />
                        <span className="sr-only">Remove</span>
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {/* Upload button */}
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.doc,.docx,application/pdf,image/*,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  className="hidden"
                  onChange={(e) => handleDocUpload(e.target.files)}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={docUploading}
                  onClick={() => fileInputRef.current?.click()}
                  className="gap-2"
                >
                  {docUploading ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Uploading...</>
                  ) : (
                    <><Paperclip className="h-4 w-4" /> Attach Files</>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* ── Agent Document Checklist ─────────────────────────────────────────── */}
          <AgentDocumentChecklist closingType={watchedClosingType} />

          {/* Hidden fields */}
          <input type="hidden" {...form.register('notes')} />
          <input type="hidden" {...form.register('agentDisplayName')} />

          {/* ── Submit Button ─────────────────────────────────────────────── */}
          <div className="flex justify-end pt-2 pb-8">
            <Button
              type="submit"
              size="lg"
              disabled={isClosedAgentView || submitting || (isAdmin && agentsLoading)}
              className="min-w-[200px]"
            >
              <Send className="mr-2 h-4 w-4" />
              {isClosedAgentView
                ? 'Closed — Review Only'
                : submitting ? (editMode ? 'Saving...' : 'Submitting...') : (editMode ? 'Save Changes' : 'Submit to TC Queue')}
            </Button>
          </div>

          </fieldset>
        </form>
      </Form>
      </>)}

      {/* ── Floating Checklist Button + Slide-in Drawer ─────────────────────
          Only shown when opened from TC queue or staff queue (?intakeId=...)
          Fixed to bottom-right corner. Opens a slide-in panel from the right.
      ──────────────────────────────────────────────────────────────────────── */}
      {isTcQueueMode && checklistItems.length > 0 && (
        <>
          {/* Floating trigger button */}
          <button
            type="button"
            onClick={() => setChecklistOpen(o => !o)}
            className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-primary text-primary-foreground shadow-lg px-4 py-3 text-sm font-semibold hover:bg-primary/90 transition-all"
            aria-label="Open checklist"
          >
            <ClipboardList className="h-4 w-4" />
            {(() => {
              const done = checklistItems.filter(i => i.completed).length;
              const total = checklistItems.length;
              return <span>{done}/{total} done</span>;
            })()}
          </button>

          {/* Backdrop */}
          {checklistOpen && (
            <div
              className="fixed inset-0 z-40 bg-black/20"
              onClick={() => setChecklistOpen(false)}
            />
          )}

          {/* Slide-in drawer */}
          <div
            className={`fixed top-0 right-0 z-50 h-full w-80 bg-background border-l shadow-2xl flex flex-col transition-transform duration-300 ${checklistOpen ? 'translate-x-0' : 'translate-x-full'}`}
          >
            {/* Drawer header */}
            <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/50">
              <div>
                <p className="text-sm font-bold">
                  {queueRole === 'staff' ? '📋 Staff Checklist' : '📋 TC Checklist'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {checklistItems.filter(i => i.completed).length} of {checklistItems.length} completed
                </p>
              </div>
              <button
                type="button"
                onClick={() => setChecklistOpen(false)}
                className="text-muted-foreground hover:text-foreground p-1 rounded"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Progress bar */}
            <div className="px-4 pt-3 pb-1">
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-green-500 rounded-full transition-all duration-300"
                  style={{ width: `${checklistItems.length > 0 ? Math.round((checklistItems.filter(i => i.completed).length / checklistItems.length) * 100) : 0}%` }}
                />
              </div>
            </div>

            {/* Checklist items */}
            <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1">
              {checklistItems.map(item => (
                <button
                  key={item.id}
                  type="button"
                  disabled={checklistSaving === item.id}
                  onClick={() => handleChecklistToggle(item.id, item.completed)}
                  className={`w-full flex items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                    item.completed
                      ? 'bg-green-50 dark:bg-green-950/30 text-green-800 dark:text-green-300'
                      : 'hover:bg-muted/60 text-foreground'
                  }`}
                >
                  <div className={`mt-0.5 flex-shrink-0 h-4 w-4 rounded border-2 flex items-center justify-center transition-colors ${
                    item.completed ? 'bg-green-500 border-green-500' : 'border-muted-foreground'
                  }`}>
                    {item.completed && (
                      <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                    {checklistSaving === item.id && (
                      <Loader2 className="h-2.5 w-2.5 animate-spin text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className={`text-xs font-medium leading-snug ${item.completed ? 'line-through opacity-70' : ''}`}>
                      {item.label}
                    </p>
                    {item.completed && item.completedBy && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        ✓ {item.completedBy.split('@')[0]}
                        {item.completedAt ? ` · ${new Date(item.completedAt).toLocaleDateString()}` : ''}
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>

            {/* Drawer footer */}
            <div className="px-4 py-3 border-t bg-muted/30">
              <p className="text-xs text-muted-foreground text-center">
                Changes save instantly · Click any item to toggle
              </p>
            </div>
          </div>
        </>
      )}

    </div>
  );
}
