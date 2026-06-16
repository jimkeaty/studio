'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useRef, useState, useCallback, type ChangeEvent } from 'react';
import { useSearchParams } from 'next/navigation';
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
import { CheckCircle2, Send, ClipboardList, FileCheck2, Paperclip, X, FileText, Loader2, PlusCircle, Trash2, UploadCloud, Upload, Sparkles, AlertCircle, ChevronRight, ChevronDown, Home, List, Users, ArrowRightLeft } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ContactAutocomplete } from '@/components/contacts/ContactAutocomplete';
import type { SavedContact } from '@/hooks/useContactSearch';
import Link from 'next/link';
import { resolveGCI } from '@/lib/commissions';
import { CANONICAL_SOURCES, normalizeDealSource } from '@/lib/normalizeDealSource';

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
  agentId: z.string().min(1, 'Agent is required'),
  agentDisplayName: z.string().min(1),

  // Status
  status: z.enum(['active', 'pending', 'closed', 'cancelled', 'temp_off_market'], { required_error: 'Please select a status to continue' }),

  // Basics
  closingType: z.enum(['buyer', 'listing', 'referral', 'dual'], { required_error: 'Type of closing is required' }),
  dealType: z.enum(['residential_sale', 'residential_lease', 'land', 'commercial_listing', 'commercial_sale', 'commercial_lease']),
  address: z.string().min(5, 'Full property address is required'),
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
  agentDollar: z.coerce.number().min(0).optional().or(z.literal('')),

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
  tcWorking: z.enum(['yes', 'no']).optional(),

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
  preListingTcScheduleInspections: z.enum(['yes', 'no', 'other']).optional(),
  preListingTcScheduleInspectionsOther: z.string().optional(),
  preListingInspectorName: z.string().optional(),
  // Buyer/Pending Inspections
  inspectionOrdered: z.enum(['yes', 'no']).optional(),
  targetInspectionDate: z.string().optional().or(z.literal('')),
  inspectionTypes: z.array(z.string()).optional(),
  tcScheduleInspections: z.enum(['yes', 'no', 'other']).optional(),
  tcScheduleInspectionsOther: z.string().optional(),
  inspectorName: z.string().optional(),
  // Media Order (listing-only)
  mediaTypes: z.array(z.string()).optional(),
  mediaRequestedDate: z.string().optional().or(z.literal('')),
  mediaNotes: z.string().optional(),
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
  occupancyAgreement: z.enum(['yes', 'no']).optional(),
  occupancyDates: z.string().optional(),
  shortageInCommission: z.enum(['yes', 'no']).optional(),
  shortageAmount: z.coerce.number().min(0).optional().or(z.literal('')),
  buyerBringToClosing: z.coerce.number().min(0).optional().or(z.literal('')),

  additionalComments: z.string().optional(),
  notes: z.string().optional(),

  // Outbound Referral fields — available for all transaction types (buyer, listing, dual, referral)
  hasOutboundReferral: z.boolean().optional(),
  outboundReferralAgentName: z.string().optional(),
  outboundReferralBrokerage: z.string().optional(),
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
  const { effectiveUid, effectiveName, isImpersonating } = useEffectiveUser();
  const { toast } = useToast();
  const urlSearchParams = useSearchParams();
  const urlDraftId = urlSearchParams?.get('draft') ?? null;
  const [submitted, setSubmitted] = useState(false);
  const [resultId, setResultId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);

  // ── URL params — must be read before any state that depends on them ────────
  const typeParamEarly = urlSearchParams?.get('type');

  // ── PDF extraction state ──────────────────────────────────────────────────
  // 'type' is the new first step — select Buyer / Listing / Dual / Referral
  // Skip 'type' step when closingType is pre-set from URL params (e.g. listing→pending flow)
  type PdfStep = 'type' | 'upload' | 'extracting' | 'review' | 'form';
  const [pdfStep, setPdfStep] = useState<PdfStep>(typeParamEarly ? 'upload' : 'type');
  const [pdfName, setPdfName] = useState<string>('');
  const [pdfConfidence, setPdfConfidence] = useState<Record<string, number>>({});
  const [pdfHighlightFields, setPdfHighlightFields] = useState<Set<string>>(new Set());
  const pdfInputRef = useRef<HTMLInputElement>(null);

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
      setPdfStep('form');
      toast({ title: '✅ Purchase agreement scanned', description: `${Object.values(conf).filter(v => (v as number) >= 0.7).length} fields auto-filled. Review highlighted fields before submitting.` });
    } catch (err: any) {
      toast({ title: 'Extraction error', description: err.message, variant: 'destructive' });
      setPdfStep('form');
    }
  };

  // ── Document upload state ──────────────────────────────────────────────────
  type UploadedDoc = { name: string; url: string; storagePath: string; uploadedAt: string };
  const [uploadedDocs, setUploadedDocs] = useState<UploadedDoc[]>([]);
  const [docUploading, setDocUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
  const commissionManualOverride = useRef(false);

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
  };
  // Extra buyer/seller visibility state
  const [showBuyer3, setShowBuyer3] = useState(false);
  const [showBuyer4, setShowBuyer4] = useState(false);
  const [showSeller3, setShowSeller3] = useState(false);
  const [showSeller4, setShowSeller4] = useState(false);

  // Collapsible listing-only sections (collapsed by default)
  const [mediaOrderOpen, setMediaOrderOpen] = useState(false);
  const [signOrderOpen, setSignOrderOpen] = useState(false);
  const [showingTimeOpen, setShowingTimeOpen] = useState(false);

  const { isAdmin: isAdminUser } = useIsAdminLike();
  const isAdmin = isAdminUser && !isImpersonating;
  // TC users (role === 'tc') get the same full commission view as admins
  const { role: staffRole } = useIsStaff();
  const isTC = !isAdmin && staffRole === 'tc';
  const isAdminOrTC = isAdmin || isTC;

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
      inspectionTypes: [],
      sellerPayingListingAgentUnknown: false,
      hasCoAgent: false,
      coAgentId: '',
      coAgentDisplayName: '',
      coAgentRole: 'co_list',
      primaryAgentSplitPercent: 50,
      coAgentSplitPercent: 50,
      hasOutboundReferral: false,
    },
  });

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
  const shortageInCommission = form.watch('shortageInCommission');
  const tcScheduleInspections = form.watch('tcScheduleInspections');
  const occupancyAgreement = form.watch('occupancyAgreement');
  const inspectionTypes = form.watch('inspectionTypes') || [];
  const watchedStatus = form.watch('status');
  const watchedDealType = form.watch('dealType');
  const isActiveListing = watchedStatus === 'active' && (watchedClosingType === 'listing' || watchedClosingType === 'dual');
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

  const cbpManuallyEdited = useRef(false);
  const commPctManuallyEdited = useRef(false);
  // When the user types a GCI value directly, lock it so CBP×pct auto-calc won't overwrite it.
  const gciManuallyEdited = useRef(false);

  useEffect(() => {
    if (cbpManuallyEdited.current) return;
    const sp = Number(watchedSalePrice) || 0;
    if (sp > 0) form.setValue('commissionBasePrice', sp as any);
  }, [watchedSalePrice]);

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
      const calcGCI = resolveGCI({ commissionBasePrice: cbp, commissionPercent: pct });
      form.setValue('gci', calcGCI as any);
    }
  }, [watchedCBP, watchedCommPct]);

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

  // Admin: load agent list
  useEffect(() => {
    if (!user || !isAdmin) return;
    const load = async () => {
      setAgentsLoading(true);
      try {
        const token = await user.getIdToken();
        const res = await fetch('/api/admin/agents?source=profiles', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.ok) setAgents(data.agents ?? []);
      } catch {}
      finally { setAgentsLoading(false); }
    };
    load();
  }, [user, isAdmin]);

  // Pre-fill agent
  useEffect(() => {
    if (!user) return;
    if (isImpersonating && effectiveUid && effectiveName) {
      form.setValue('agentId', effectiveUid);
      form.setValue('agentDisplayName', effectiveName);
    } else if (!isAdmin) {
      form.setValue('agentId', user.uid);
      form.setValue('agentDisplayName', user.displayName || user.email || user.uid);
    }
  }, [user, isAdmin, isImpersonating, effectiveUid, effectiveName]);

  // Fetch agent commission structure
  const watchedAgentId = form.watch('agentId');
  useEffect(() => {
    if (!user || !watchedAgentId) {
      setAgentCommission(null);
      setActiveTier(null);
      return;
    }
    let cancelled = false;
    const fetchCommission = async () => {
      setCommissionLoading(true);
      commissionManualOverride.current = false;
      try {
        const token = await user.getIdToken();
        const res = await fetch(`/api/admin/agent-profiles/${watchedAgentId}/commission`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!cancelled && data.ok) {
          setAgentCommission(data);
          if (data.defaultTransactionFee != null && data.defaultTransactionFee > 0) {
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
  }, [user, isAdmin, watchedAgentId]);

  // Auto-calculate commission split
  const watchedGCI = form.watch('gci');
  useEffect(() => {
    if (!agentCommission || commissionManualOverride.current) return;
    const gci = Number(watchedGCI) || 0;
    if (gci <= 0) { setActiveTier(null); return; }
    const ytd = agentCommission.ytdTierProgressionGci ?? agentCommission.ytdTierProgressionCompanyDollar ?? 0;
    const tierLookupAmount = ytd > 0 ? ytd : gci;
    const tier = findActiveTier(agentCommission.tiers, tierLookupAmount);
    setActiveTier(tier);
    if (tier) {
      // For team members on a team WITH a leader, the tier's agentSplitPercent is already
      // the EFFECTIVE % of full GCI (leaderPercent × memberPercent / 100), so the formula
      // agentNet = GCI × agentSplitPercent is correct for all agent types.
      // The leaderStructurePercent and memberPercentOfLeaderSide fields are only used
      // for the preview card display breakdown.
      const agentPct = tier.agentSplitPercent;    // Effective % of full GCI
      const brokerPct = tier.companySplitPercent;  // Company's % of full GCI
      const agentNet = Number((gci * (agentPct / 100)).toFixed(2));
      const brokerGci = Number((gci * (brokerPct / 100)).toFixed(2));
      const txFee = tier.transactionFee ?? agentCommission.defaultTransactionFee ?? 0;
      form.setValue('agentPct', agentPct as any);
      form.setValue('brokerPct', brokerPct as any);
      form.setValue('agentDollar', agentNet as any);
      form.setValue('brokerGci', brokerGci as any);
      if (txFee > 0) {
        form.setValue('txComplianceFee', 'yes');
        form.setValue('txComplianceFeeAmount', txFee as any);
        if (!form.getValues('txComplianceFeePaidBy')) {
          form.setValue('txComplianceFeePaidBy', 'agent');
        }
      }
    }
  }, [watchedGCI, agentCommission]);

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

  // ── Auto-save draft to Firestore every 30 seconds ─────────────────────────
  useEffect(() => {
    if (submitted) return;
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

  const restoreDraft = () => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (!saved) return;
      const { values } = JSON.parse(saved);
      Object.entries(values).forEach(([key, val]) => {
        if (val !== undefined && val !== null && val !== '') {
          form.setValue(key as any, val as any);
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
        body: JSON.stringify({ ...values, clientName: resolvedClientName, documents: uploadedDocs }),
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

  // ───────────────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-24">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Add Transaction</h1>
          <p className="text-muted-foreground mt-1">
            {pdfStep === 'upload' ? 'Upload a purchase agreement to auto-fill the form, or skip to fill manually.' : pdfStep === 'extracting' ? 'Reading your purchase agreement...' : 'Review the auto-filled details below and submit to the TC Queue.'}
          </p>
        </div>
        <Badge variant="outline" className="mt-1">
          <ClipboardList className="h-3 w-3 mr-1" /> TC Queue Review
        </Badge>
      </div>

      {/* ── Transaction Type Selection ─────────────────────────────────────── */}
      {pdfStep === 'type' && (
        <div className="space-y-6">
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold">What type of transaction is this?</h2>
            <p className="text-muted-foreground">Select the transaction type to load the right form fields.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl mx-auto">
            {/* Buyer */}
            <button
              type="button"
              onClick={() => {
                form.setValue('closingType', 'buyer');
                setPdfStep('upload');
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
                form.setValue('closingType', 'listing');
                setPdfStep('upload');
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
                form.setValue('closingType', 'dual');
                setPdfStep('upload');
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
                form.setValue('closingType', 'referral');
                setPdfStep('form');
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
      {pdfStep === 'upload' && (
        <Card className="border-2 border-dashed border-primary/30 bg-primary/5 hover:border-primary/60 transition-colors">
          <CardContent className="py-12">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Sparkles className="h-8 w-8 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-bold">Upload Purchase Agreement</h2>
                <p className="text-muted-foreground mt-1 max-w-md">Drop your PDF here and we'll auto-fill the form — property address, dates, buyer/seller info, lender, title company, co-agent, financing terms, and more.</p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 mt-2">
                <Button
                  type="button"
                  size="lg"
                  onClick={() => pdfInputRef.current?.click()}
                  className="gap-2"
                >
                  <UploadCloud className="h-5 w-5" /> Choose PDF
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
                <h2 className="text-xl font-bold">Reading Purchase Agreement</h2>
                <p className="text-muted-foreground mt-1">{pdfName}</p>
                <p className="text-sm text-muted-foreground mt-2">Extracting property details, dates, contacts, and financing terms...</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── PDF source banner (shown after extraction) ─────────────────────── */}
      {pdfStep === 'form' && pdfName && (
        <div className="flex items-center gap-3 rounded-xl border border-green-300 bg-green-50 dark:bg-green-950/30 dark:border-green-700 px-4 py-3">
          <FileText className="h-5 w-5 text-green-600 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-green-800 dark:text-green-300">Auto-filled from purchase agreement</p>
            <p className="text-xs text-green-700 dark:text-green-400 truncate">{pdfName}</p>
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
      {pdfStep === 'form' && !pdfName && (
        <div className="flex items-center gap-3 rounded-xl border border-dashed border-muted-foreground/30 bg-muted/30 px-4 py-3">
          <Upload className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <p className="text-sm text-muted-foreground flex-1">Changed your mind? Upload a purchase agreement to auto-fill the form.</p>
          <button
            type="button"
            onClick={() => { setPdfStep('upload'); setPdfName(''); setPdfHighlightFields(new Set()); }}
            className="text-sm font-medium text-primary underline underline-offset-2 hover:text-primary/80 flex-shrink-0"
          >
            Upload PDF Instead
          </button>
        </div>
      )}

      {/* Form — only shown after PDF step */}
      {(pdfStep === 'form') && (<>

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
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

          {/* ═══════════════════════════════════════════════════════════════════
              SECTION 1 — PROPERTY / TRANSACTION DETAILS
          ═══════════════════════════════════════════════════════════════════ */}
          <Section title="Property / Transaction Details">
            {/* Agent selector — admin only */}
            {isAdmin && (
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

            <Grid2>
              {/* Transaction type — read-only badge (set on type selection screen); change button goes back */}
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Transaction Type</label>
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ${
                    watchedClosingType === 'buyer' ? 'bg-blue-100 text-blue-800' :
                    watchedClosingType === 'listing' ? 'bg-green-100 text-green-800' :
                    watchedClosingType === 'dual' ? 'bg-purple-100 text-purple-800' :
                    'bg-amber-100 text-amber-800'
                  }`}>
                    {watchedClosingType === 'buyer' ? '🏠 Buyer Transaction' :
                     watchedClosingType === 'listing' ? '📋 New Listing' :
                     watchedClosingType === 'dual' ? '🤝 Dual Agency' :
                     '➡️ Outbound Referral'}
                  </span>
                  {!typeParam && (
                    <button
                      type="button"
                      onClick={() => setPdfStep('type')}
                      className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                    >
                      Change
                    </button>
                  )}
                </div>
              </div>

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
                <FormLabel>Property Address <span className="text-destructive">*</span></FormLabel>
                <FormControl><Input placeholder="123 Main St, Lafayette, LA 70508" {...field} /></FormControl>
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
              {(watchedClosingType === 'buyer' || watchedClosingType === 'dual') && (
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
                <FormLabel>Send to TC Working File?</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl><SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger></FormControl>
                  <SelectContent>
                    <SelectItem value="yes">Yes</SelectItem>
                    <SelectItem value="no">No</SelectItem>
                  </SelectContent>
                </Select>
                <FormDescription>If Yes, this transaction will appear in the TC Queue for processing.</FormDescription>
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
            {/* Listing dates — shown for listing and dual only */}
            {(watchedClosingType === 'listing' || watchedClosingType === 'dual') && (
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
            {(watchedClosingType === 'buyer' || watchedClosingType === 'dual') && (
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
          {/* Buyer/Seller section — hidden for outbound referral */}
          {watchedClosingType !== 'referral' && <Section title="Buyer / Seller Information">

            {/* Buyer section */}
            {(clientType === 'buyer' || clientType === 'dual') && (
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
          {(watchedClosingType === 'buyer' || watchedClosingType === 'dual') && (
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
          {(watchedClosingType === 'buyer' || watchedClosingType === 'dual') && <Section title="Mortgage / Lender">
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
          {(watchedClosingType === 'buyer' || watchedClosingType === 'dual') && <Section title="Title Company">
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
              OUTBOUND REFERRAL — minimal form (referral type only)
          ═══════════════════════════════════════════════════════════════════ */}
          {watchedClosingType === 'referral' && (
            <Section title="Outbound Referral Details" description="You are referring this client out. Fill in the receiving agent and your referral fee.">
              {/* Client name — optional for referrals */}
              <FormField control={form.control} name="clientName" render={({ field }) => (
                <FormItem>
                  <FormLabel>Client Name <span className="text-muted-foreground font-normal text-xs">(optional)</span></FormLabel>
                  <FormControl>
                    <Input placeholder="Client being referred (optional)" {...field} />
                  </FormControl>
                  <FormDescription className="text-xs">The person you are referring out. Not required to save.</FormDescription>
                </FormItem>
              )} />
              <Grid2>
                <FormField control={form.control} name="outboundReferralAgentName" render={({ field }) => (
                  <FormItem><FormLabel>Referred-To Agent Name</FormLabel><FormControl><Input placeholder="Agent receiving the referral" {...field} /></FormControl></FormItem>
                )} />
                <FormField control={form.control} name="outboundReferralBrokerage" render={({ field }) => (
                  <FormItem><FormLabel>Their Brokerage</FormLabel><FormControl><Input placeholder="Receiving brokerage" {...field} /></FormControl></FormItem>
                )} />
              </Grid2>
              <Grid2>
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
          )}

          {/* ═══════════════════════════════════════════════════════════════════
              SECTION 4 — FINANCIAL DETAILS (buyer/dual only — listing fills these at pending)
          ═══════════════════════════════════════════════════════════════════ */}
          {(watchedClosingType === 'buyer' || watchedClosingType === 'dual') && <Section title="Financial Details">
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
              {(watchedClosingType === 'buyer' || watchedClosingType === 'dual') && (
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
                  <FormItem><FormLabel>Target Inspection Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl></FormItem>
                )} />
              </Grid2>
              <div>
                <p className="text-sm font-medium mb-3">Check all that apply:</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                  {INSPECTION_TYPE_OPTIONS.map((type) => (
                    <label key={type} className="flex items-center gap-2 cursor-pointer text-sm">
                      <input
                        type="checkbox"
                        checked={preListingInspectionTypes.includes(type)}
                        onChange={() => togglePreListingInspectionType(type)}
                        className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                      />
                      {type}
                    </label>
                  ))}
                </div>
              </div>
              <FormField control={form.control} name="preListingTcScheduleInspections" render={({ field }) => (
                <FormItem>
                  <FormLabel>Do you want TC to help schedule pre-listing inspections?</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="yes">Yes</SelectItem>
                      <SelectItem value="no">No</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </FormItem>
              )} />
              {preListingTcScheduleInspections === 'other' && (
                <FormField control={form.control} name="preListingTcScheduleInspectionsOther" render={({ field }) => (
                  <FormItem><FormLabel>Please specify</FormLabel><FormControl><Input placeholder="Describe what you need..." {...field} /></FormControl></FormItem>
                )} />
              )}
              <div className="max-w-md">
                <FormField control={form.control} name="preListingInspectorName" render={({ field }) => (
                  <FormItem><FormLabel>Inspector Name / Company</FormLabel><FormControl>
                    <ContactAutocomplete
                      type="inspector"
                      placeholder="Inspector name or company"
                      value={field.value || ''}
                      onChange={field.onChange}
                      onSelect={(c: SavedContact) => { form.setValue('preListingInspectorName', c.name || ''); }}
                    />
                  </FormControl></FormItem>
                )} />
              </div>
            </Section>
          )}

          {/* ── Media Order (listing/dual only, collapsed by default) ─────────── */}
          {(watchedClosingType === 'listing' || watchedClosingType === 'dual') && (
            <Collapsible open={mediaOrderOpen} onOpenChange={setMediaOrderOpen}>
              <Card>
                <CardHeader
                  className="cursor-pointer select-none py-4"
                  onClick={() => setMediaOrderOpen(!mediaOrderOpen)}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base">Media Order</CardTitle>
                      <CardDescription>Select the media you want ordered for this listing. Leave blank and staff will coordinate for you.</CardDescription>
                    </div>
                    <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform duration-200 ${mediaOrderOpen ? 'rotate-180' : ''}`} />
                  </div>
                </CardHeader>
                <CollapsibleContent>
                  <CardContent className="space-y-5 pt-0">
                    <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800 p-4 flex items-start gap-3">
                      <span className="text-blue-600 dark:text-blue-400 text-xl mt-0.5">📸</span>
                      <div className="text-sm text-blue-800 dark:text-blue-300">
                        <p className="font-semibold mb-1">Need help scheduling media?</p>
                        <p>You can order directly through <a href="https://mediaengagellc.com/order/" target="_blank" rel="noopener noreferrer" className="underline font-medium hover:text-blue-600">Media Engage</a>, or leave this section blank and staff will coordinate scheduling for you.</p>
                      </div>
                    </div>
                    <div>
                      <p className="text-sm font-medium mb-3">Select media to order (check all that apply):</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                        {MEDIA_TYPE_OPTIONS.map((type) => (
                          <label key={type} className="flex items-center gap-2 cursor-pointer text-sm">
                            <input
                              type="checkbox"
                              checked={mediaTypes.includes(type)}
                              onChange={() => toggleMediaType(type)}
                              className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                            />
                            {type}
                          </label>
                        ))}
                      </div>
                    </div>
                    <Grid2>
                      <FormField control={form.control} name="mediaRequestedDate" render={({ field }) => (
                        <FormItem><FormLabel>Requested Media Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormDescription>When would you like media scheduled?</FormDescription></FormItem>
                      )} />
                    </Grid2>
                    <FormField control={form.control} name="mediaNotes" render={({ field }) => (
                      <FormItem><FormLabel>Media Notes</FormLabel><FormControl><Textarea placeholder="Any special instructions for the media team..." {...field} /></FormControl></FormItem>
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
                <FormItem><FormLabel>Target Inspection Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl></FormItem>
              )} />
            </div>

            <div>
              <p className="text-sm font-medium mb-3">Check all that apply:</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {INSPECTION_TYPE_OPTIONS.map((type) => (
                  <label key={type} className="flex items-center gap-2 cursor-pointer text-sm">
                    <input
                      type="checkbox"
                      checked={inspectionTypes.includes(type)}
                      onChange={() => toggleInspectionType(type)}
                      className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                    />
                    {type}
                  </label>
                ))}
              </div>
            </div>

            <FormField control={form.control} name="tcScheduleInspections" render={({ field }) => (
              <FormItem>
                <FormLabel>Do you want TC to help schedule inspections?</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl><SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger></FormControl>
                  <SelectContent>
                    <SelectItem value="yes">Yes</SelectItem>
                    <SelectItem value="no">No</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </FormItem>
            )} />
            {tcScheduleInspections === 'other' && (
              <FormField control={form.control} name="tcScheduleInspectionsOther" render={({ field }) => (
                <FormItem><FormLabel>Please specify</FormLabel><FormControl><Input placeholder="Describe what you need..." {...field} /></FormControl></FormItem>
              )} />
            )}
            <div className="max-w-md">
              <FormField control={form.control} name="inspectorName" render={({ field }) => (
                <FormItem><FormLabel>Inspector Name / Company</FormLabel><FormControl>
                  <ContactAutocomplete
                    type="inspector"
                    placeholder="Inspector name or company"
                    value={field.value || ''}
                    onChange={field.onChange}
                    onSelect={(c: SavedContact) => {
                      form.setValue('inspectorName', c.name || '');
                    }}
                  />
                </FormControl></FormItem>
              )} />
            </div>
          </Section>}

          {/* ═══════════════════════════════════════════════════════════════════
              SECTION 5 — COMMISSION & FEES (buyer/dual only)
          ═══════════════════════════════════════════════════════════════════ */}
          {(watchedClosingType === 'buyer' || watchedClosingType === 'dual') && <Section title="Buyer Closing Cost Paid by Seller">
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
            {!isAdminOrTC && (
              <>
                <Separator />
                {(() => {
                  const agentDollar = Number(form.watch('agentDollar')) || 0;
                  const gci = Number(form.watch('gci')) || 0;
                  const watchedTxCompFee = form.watch('txComplianceFee');
                  const watchedTxCompFeeAmt = Number(form.watch('txComplianceFeeAmount')) || 0;
                  const watchedTxCompFeePaidBy = form.watch('txComplianceFeePaidBy') || '';
                  const agentPaysFee = watchedTxCompFee === 'yes' && watchedTxCompFeeAmt > 0 && watchedTxCompFeePaidBy === 'agent';
                  const feeDeduction = agentPaysFee ? watchedTxCompFeeAmt : 0;
                  const agentNet = agentDollar - feeDeduction;
                  const splitPct = gci > 0 ? Math.round((agentDollar / gci) * 100) : (activeTier?.agentSplitPercent ?? 0);
                  const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n);
                  const fmtExact = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
                  if (agentDollar <= 0 && !activeTier) return (
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
                      {watchedTxCompFee === 'yes' && watchedTxCompFeeAmt > 0 && (
                        <div className="mt-2 pt-2 border-t border-green-200 dark:border-green-800 text-center">
                          <p className="text-xs text-muted-foreground">Transaction Fee</p>
                          {agentPaysFee ? (
                            <p className="text-sm font-bold text-red-600">-{fmt(watchedTxCompFeeAmt)} deducted from your commission</p>
                          ) : (
                            <p className="text-sm font-semibold text-blue-600">{fmt(watchedTxCompFeeAmt)} — not deducted from your commission</p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </>
            )}

            {/* Admin + TC: GCI & Commission % */}
            {isAdminOrTC && (
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
                      <FormDescription>Auto-filled from seller-paying % above</FormDescription>
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
                      <FormDescription>Gross Commission Income — type to override auto-calc</FormDescription>
                    </FormItem>
                  )} />
                </Grid3>
              </>
            )}

            {/* Commission Split (Admin + TC) */}
            {isAdminOrTC && (
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
                            form.setValue('agentPct', tier.agentSplitPercent as any);
                            form.setValue('brokerPct', tier.companySplitPercent as any);
                            form.setValue('agentDollar', Number((gci * (tier.agentSplitPercent / 100)).toFixed(2)) as any);
                            form.setValue('brokerGci', Number((gci * (tier.companySplitPercent / 100)).toFixed(2)) as any);
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
                <Grid2>
                  <FormField control={form.control} name="brokerPct" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Broker %</FormLabel>
                      <FormControl>
                        <PercentInput
                          value={field.value as any}
                          placeholder="30"
                          onChange={(e) => { commissionManualOverride.current = true; field.onChange(e); }}
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
                          onChange={(val) => { commissionManualOverride.current = true; field.onChange(val); }}
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
                          onChange={(e) => { commissionManualOverride.current = true; field.onChange(e); }}
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
                          onChange={(val) => { commissionManualOverride.current = true; field.onChange(val); }}
                          placeholder="0"
                        />
                      </FormControl>
                      <FormDescription>Auto-calculated from agent profile. Edit to override.</FormDescription>
                    </FormItem>
                  )} />
                </Grid2>

                {/* Inline Commission Preview */}
                {(() => {
                  const gci = Number(form.watch('gci')) || 0;
                  const agentDollar = Number(form.watch('agentDollar')) || 0;
                  const watchedTxCompFee = form.watch('txComplianceFee');
                  const watchedTxCompFeeAmt = Number(form.watch('txComplianceFeeAmount')) || 0;
                  const watchedTxCompFeePaidBy = form.watch('txComplianceFeePaidBy') || '';
                  if (gci <= 0) return null;
                  // Fee only reduces agent take-home when agent is paying
                  const agentPaysFee = watchedTxCompFee === 'yes' && watchedTxCompFeeAmt > 0 && watchedTxCompFeePaidBy === 'agent';
                  const feeDeduction = agentPaysFee ? watchedTxCompFeeAmt : 0;
                  const agentNet = agentDollar - feeDeduction;
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
                  const isTeamMemberWithLeader = !!(activeTier?.leaderStructurePercent && activeTier?.memberPercentOfLeaderSide);
                  const leaderStructurePct = activeTier?.leaderStructurePercent ?? 0;   // e.g. 75%
                  const memberDirectPct = activeTier?.agentSplitPercent ?? 0;           // e.g. 70%
                  const companyPct = activeTier?.companySplitPercent ?? 0;              // e.g. 25%
                  // leaderStructureGross = GCI × leaderPercent (the leader's side before member payout)
                  const leaderStructureGross = isTeamMemberWithLeader ? Number((gci * (leaderStructurePct / 100)).toFixed(2)) : 0;
                  const companyRetained = isTeamMemberWithLeader
                    ? Number((gci * (companyPct / 100)).toFixed(2))
                    : Number((gci - agentDollar).toFixed(2));
                  // Leader retains the spread: leaderStructureGross - memberPaid
                  const leaderRetained = isTeamMemberWithLeader
                    ? Number((leaderStructureGross - agentDollar).toFixed(2))
                    : 0;

                  return (
                    <div className="mt-4 rounded-xl border-2 border-green-300 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 dark:border-green-700 p-4">
                      <p className="text-xs font-bold text-green-700 dark:text-green-400 uppercase tracking-wider mb-3">💰 Your Estimated Earnings on This Deal</p>

                      {isTeamMemberWithLeader ? (
                        // ── Two-step team member breakdown ────────────────────────────────────
                        <>
                          {isAdminOrTC ? (
                            // Admin/TC sees full breakdown: GCI, broker cut, leader split, agent net
                            <>
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                                <div className="text-center">
                                  <p className="text-xs text-muted-foreground mb-0.5">Gross Commission</p>
                                  <p className="text-lg font-black text-foreground">{fmt(gci)}</p>
                                </div>
                                <div className="text-center">
                                  <p className="text-xs text-muted-foreground mb-0.5">Broker ({companyPct}%)</p>
                                  <p className="text-lg font-black text-foreground">{fmt(companyRetained)}</p>
                                </div>
                                <div className="text-center">
                                  <p className="text-xs text-muted-foreground mb-0.5">Your Split ({memberDirectPct}%)</p>
                                  <p className="text-lg font-black text-foreground">{fmtExact(agentDollar)}</p>
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
                                      <p className="text-sm font-bold text-red-600">-{fmt(watchedTxCompFeeAmt)}</p>
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
                                  <p className="text-xs text-muted-foreground mb-0.5">Your Split ({memberDirectPct}%)</p>
                                  <p className="text-lg font-black text-foreground">{fmtExact(agentDollar)}</p>
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
                                    <p className="text-sm font-bold text-red-600">-{fmt(watchedTxCompFeeAmt)} deducted from your commission</p>
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
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            {/* Gross Commission — admin and TC only */}
                            {isAdminOrTC && (
                              <div className="text-center">
                                <p className="text-xs text-muted-foreground mb-0.5">Gross Commission</p>
                                <p className="text-lg font-black text-foreground">{fmt(gci)}</p>
                              </div>
                            )}
                            <div className="text-center">
                              <p className="text-xs text-muted-foreground mb-0.5">Your Split ({gci > 0 ? Math.round((agentDollar / gci) * 100) : 0}%)</p>
                              <p className="text-lg font-black text-foreground">{fmt(agentDollar)}</p>
                            </div>
                            {watchedTxCompFee === 'yes' && watchedTxCompFeeAmt > 0 && (
                              <div className="text-center">
                                <p className="text-xs text-muted-foreground mb-0.5">Transaction Fee</p>
                                {agentPaysFee ? (
                                  <p className="text-lg font-black text-red-600">-{fmt(watchedTxCompFeeAmt)}</p>
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
          </Section>}

          {/* ═══════════════════════════════════════════════════════════════════
              SECTION 6 — ADDITIONAL INFO / COMMENTS (hidden for referral, listing, and active listings)
          ═══════════════════════════════════════════════════════════════════ */}
          {watchedClosingType !== 'referral' && watchedClosingType !== 'listing' && !isActiveListing && <Section title="Additional Info">
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
                          <SelectItem value="seller_closing_cost">Take out of Seller Paid Closing Cost</SelectItem>
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
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl><SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger></FormControl>
                  <SelectContent>
                    <SelectItem value="yes">Yes</SelectItem>
                    <SelectItem value="no">No</SelectItem>
                  </SelectContent>
                </Select>
              </FormItem>
            )} />
            {txComplianceFee === 'yes' && (
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
                        <SelectItem value="buyer">Buyer</SelectItem>
                        <SelectItem value="seller">Seller</SelectItem>
                        <SelectItem value="agent">Agent</SelectItem>
                        <SelectItem value="seller_closing_cost">Take out of Seller Paid Closing Cost</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />
              </Grid2>
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

            <Separator />

            {/* Shortage in Commission */}
            <FormField control={form.control} name="shortageInCommission" render={({ field }) => (
              <FormItem>
                <FormLabel>Shortage in Commission?</FormLabel>
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
                    <FormLabel>How much? ($)</FormLabel>
                    <FormControl>
                      <CurrencyInput value={field.value as any} onChange={(val) => field.onChange(val)} placeholder="0" />
                    </FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="buyerBringToClosing" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Buyer will bring to closing ($)</FormLabel>
                    <FormControl>
                      <CurrencyInput value={field.value as any} onChange={(val) => field.onChange(val)} placeholder="0" />
                    </FormControl>
                  </FormItem>
                )} />
              </Grid2>
            )}
          </Section>}

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

          {/* ── Additional Comments ───────────────────────────────────────── */}
          <Section title="Additional Comments">
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

          {/* Hidden fields */}
          <input type="hidden" {...form.register('notes')} />
          <input type="hidden" {...form.register('agentDisplayName')} />

          {/* ── Submit Button ─────────────────────────────────────────────── */}
          <div className="flex justify-end pt-2 pb-8">
            <Button
              type="submit"
              size="lg"
              disabled={submitting || (isAdmin && agentsLoading)}
              className="min-w-[200px]"
            >
              <Send className="mr-2 h-4 w-4" />
              {submitting ? 'Submitting...' : 'Submit to TC Queue'}
            </Button>
          </div>

        </form>
      </Form>
      </>)}
    </div>
  );
}
