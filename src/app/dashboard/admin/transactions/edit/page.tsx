'use client';
export const dynamic = 'force-dynamic';
// Full-edit transaction page — mirrors Add Transaction form exactly.
// Opened from Transaction Ledger via /dashboard/admin/transactions/edit?id=<txId>
// Saves directly via PATCH /api/admin/transactions (no TC Queue).

import { useEffect, useRef, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useUser } from '@/firebase';
import { useIsStaff } from '@/hooks/useIsStaff';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { ContactAutocomplete } from '@/components/contacts/ContactAutocomplete';
import type { SavedContact } from '@/hooks/useContactSearch';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Save, AlertTriangle, ChevronLeft, ChevronRight, Check, PlusCircle, Trash2, GitMerge } from 'lucide-react';
import Link from 'next/link';
import { resolveGCI } from '@/lib/commissions';
import { CANONICAL_SOURCES } from '@/lib/normalizeDealSource';

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
  'HVAC Inspection',
  'Generator Inspection',
  'Foundation Inspection',
  'Pool',
  'Survey',
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
type AgentCommissionData = {
  agentType: string;
  teamGroup: string;
  commissionMode: string;
  tiersSource?: string;
  defaultTransactionFee: number | null;
  tiers: CommissionTier[];
  // Non-null only for team members on a team WITH a leader.
  teamMemberLeaderSplit?: {
    leaderStructureBands: Array<{ fromCompanyDollar: number; toCompanyDollar: number | null; leaderPercent: number; companyPercent: number }>;
    memberDefaultBands: Array<{ fromCompanyDollar: number; toCompanyDollar: number | null; memberPercent: number }>;
  } | null;
  /** YTD cumulative companyDollar for tier band lookup. For team leaders this
   * includes team member production credits. 0 if rollup not yet available. */
  ytdTierProgressionCompanyDollar?: number;
};

function findActiveTier(tiers: CommissionTier[], gci: number): CommissionTier | null {
  if (!tiers || tiers.length === 0) return null;
  // Sort tiers by threshold ascending to ensure correct matching order
  const sorted = [...tiers].sort((a, b) => a.fromCompanyDollar - b.fromCompanyDollar);
  for (const tier of sorted) {
    const from = tier.fromCompanyDollar;
    const to = tier.toCompanyDollar;
    if (gci >= from && (to === null || gci < to)) return tier;
  }
  // GCI is below the first tier's threshold (legacy data gap) — use the first tier.
  // Tiers must always cover $0 upward; this is a safety net for misconfigured profiles.
  return sorted[0];
}

// ─────────────────────────────────────────────────────────────────────────────
// Schema — identical to Add Transaction form
// ─────────────────────────────────────────────────────────────────────────────
const schema = z.object({
  agentId: z.string().min(1, 'Agent is required'),
  agentDisplayName: z.string().min(1),
  status: z.enum(['active', 'pending', 'closed', 'cancelled', 'canceled', 'expired', 'temp_off_market'], { required_error: 'Please select a status to continue' }),
  closingType: z.enum(['buyer', 'listing', 'referral', 'dual'], { required_error: 'Type of closing is required' }),
  dealType: z.enum(['residential_sale', 'residential_lease', 'land', 'commercial_sale', 'commercial_lease']),
  address: z.string().min(5, 'Full property address is required'),
  // clientName is optional for referral and listing types (client may not be known yet)
  clientName: z.string().optional().or(z.literal('')),
  dealSource: z.string().optional(),
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
  listingDate: z.string().optional().or(z.literal('')),
  contractDate: z.string().optional().or(z.literal('')),
  optionExpiration: z.string().optional().or(z.literal('')),
  inspectionDeadline: z.string().optional().or(z.literal('')),
  surveyDeadline: z.string().optional().or(z.literal('')),
  projectedCloseDate: z.string().optional().or(z.literal('')),
  closedDate: z.string().optional().or(z.literal('')),
  loanApplicationDeadline: z.string().optional().or(z.literal('')),
  appraisalDeadline: z.string().optional().or(z.literal('')),
  titleDeadline: z.string().optional().or(z.literal('')),
  finalLoanCommitmentDeadline: z.string().optional().or(z.literal('')),
  clientEmail: z.string().email().optional().or(z.literal('')),
  clientPhone: z.string().optional(),
  clientNewAddress: z.string().optional(),
  client2Name: z.string().optional(),
  client2Email: z.string().email().optional().or(z.literal('')),
  client2Phone: z.string().optional(),
  otherAgentName: z.string().optional(),
  otherAgentEmail: z.string().email().optional().or(z.literal('')),
  otherAgentPhone: z.string().optional(),
  otherBrokerage: z.string().optional(),
  mortgageCompany: z.string().optional(),
  loanOfficer: z.string().optional(),
  loanOfficerEmail: z.string().email().optional().or(z.literal('')),
  loanOfficerPhone: z.string().optional(),
  lenderOffice: z.string().optional(),
  titleCompany: z.string().optional(),
  titleOfficer: z.string().optional(),
  titleOfficerEmail: z.string().email().optional().or(z.literal('')),
  titleOfficerPhone: z.string().optional(),
  titleAttorney: z.string().optional(),
  titleOffice: z.string().optional(),
  tcWorking: z.enum(['yes', 'no']).optional(),
  clientType: z.enum(['buyer', 'seller', 'dual']).optional(),
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
  inspectionOrdered: z.enum(['yes', 'no']).optional(),
  targetInspectionDate: z.string().optional().or(z.literal('')),
  inspectionTypes: z.array(z.string()).optional(),
  tcScheduleInspections: z.enum(['yes', 'no', 'other']).optional(),
  tcScheduleInspectionsOther: z.string().optional(),
  inspectorName: z.string().optional(),
  sellerPayingListingAgent: z.coerce.number().min(0).max(100).optional().or(z.literal('')),
  sellerPayingListingAgentUnknown: z.boolean().optional(),
  sellerPayingBuyerAgent: z.coerce.number().min(0).max(100).optional().or(z.literal('')),
  buyerClosingCostTotal: z.coerce.number().min(0).optional().or(z.literal('')),
  buyerClosingCostAgentCommission: z.coerce.number().min(0).optional().or(z.literal('')),
  buyerClosingCostTxFee: z.coerce.number().min(0).optional().or(z.literal('')),
  buyerClosingCostHomeWarranty: z.coerce.number().min(0).optional().or(z.literal('')),
  buyerClosingCostOther: z.coerce.number().min(0).optional().or(z.literal('')),
  warrantyAtClosing: z.enum(['yes', 'no']).optional(),
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
  // Outbound referral fee fields
  hasOutboundReferral: z.boolean().optional(),
  outboundReferralPercent: z.coerce.number().min(0).max(100).optional().or(z.literal('')),
  outboundReferralDollar: z.coerce.number().min(0).optional().or(z.literal('')),
  outboundReferralBrokerName: z.string().optional(),
  outboundReferralContactName: z.string().optional(),
});
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
// Helper: coerce null/undefined to empty string for date inputs
// ─────────────────────────────────────────────────────────────────────────────
function d(val: any): string {
  if (!val) return '';
  // Firestore timestamps come as ISO strings after serialization
  if (typeof val === 'string') return val.split('T')[0]; // strip time if present
  return '';
}
function n(val: any): any {
  if (val == null) return '';
  return val;
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────
export default function EditTransactionPage() {
  const { user, loading: userLoading } = useUser();
  const { isStaff: isAdmin } = useIsStaff(); // any staff user (office_admin, tc_admin, tc) can edit transactions
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const txId = searchParams.get('id');

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [wizardStep, setWizardStep] = useState(1);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [agentCommission, setAgentCommission] = useState<AgentCommissionData | null>(null);
  const [commissionLoading, setCommissionLoading] = useState(false);
  const [activeTier, setActiveTier] = useState<CommissionTier | null>(null);
  const commissionManualOverride = useRef(false);
  const cbpManuallyEdited = useRef(false);
  const commPctManuallyEdited = useRef(false);
  // True once the existing transaction has been loaded and commission values populated.
  // When true, the agent commission fetch must NOT reset commissionManualOverride — the
  // saved values on the transaction are the source of truth until the user explicitly
  // changes a commission field.
  const txLoadedWithCommission = useRef(false);
  // Per-transaction commission override state — loaded from Firestore, persisted on save
  // Extra buyer/seller visibility state
  const [showBuyer3, setShowBuyer3] = useState(false);
  const [showBuyer4, setShowBuyer4] = useState(false);
  const [showSeller3, setShowSeller3] = useState(false);
  const [showSeller4, setShowSeller4] = useState(false);
  // Co-agent state — managed outside the form schema so it can hold the nested coAgent object
  const [hasCoAgent, setHasCoAgent] = useState(false);
  const [coAgentId, setCoAgentId] = useState('');
  const [coAgentRole, setCoAgentRole] = useState<'co_listing' | 'co_buyer'>('co_listing');
  const [primarySplit, setPrimarySplit] = useState(50);
  const [coAgentSplit, setCoAgentSplit] = useState(50);
  const [txStatus, setTxStatus] = useState<string>('');
  const [triggeringSplit, setTriggeringSplit] = useState(false);
  // Outbound referral fee state
  const [hasOutboundReferral, setHasOutboundReferral] = useState(false);

  // Team split manual overrides — null means "use auto-calc"
  const [overrideLeaderSide, setOverrideLeaderSide] = useState<string>('');
  const [overrideMemberPay, setOverrideMemberPay] = useState<string>('');
  const [overrideLeaderRetained, setOverrideLeaderRetained] = useState<string>('');

  // Commission override state removed — agent profile is always the source of truth

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      agentId: '',
      agentDisplayName: '',
      closingType: 'buyer',
      dealType: 'residential_sale',
      address: '',
      clientName: '',
      dealSource: '',
      contractDate: '',
      inspectionTypes: [],
      sellerPayingListingAgentUnknown: false,
    },
  });

  // Watched values for conditional rendering
  const clientType = form.watch('clientType');
  const inspectionOrdered = form.watch('inspectionOrdered');
  const warrantyAtClosing = form.watch('warrantyAtClosing');
  const txComplianceFee = form.watch('txComplianceFee');
  const shortageInCommission = form.watch('shortageInCommission');
  const tcScheduleInspections = form.watch('tcScheduleInspections');
  const occupancyAgreement = form.watch('occupancyAgreement');
  const inspectionTypes = form.watch('inspectionTypes') || [];
  const watchedSalePrice = form.watch('salePrice');
  const watchedCommPct = form.watch('commissionPercent');
  const watchedCBP = form.watch('commissionBasePrice');
  const watchedGCI = form.watch('gci');
  const watchedAgentId = form.watch('agentId');
  const watchedClosingType = form.watch('closingType');
  const watchedDealType = form.watch('dealType');
  const watchedSellerPayingListing = form.watch('sellerPayingListingAgent');
  const watchedSellerPayingBuyer = form.watch('sellerPayingBuyerAgent');
  const watchedReferralPct = form.watch('outboundReferralPercent');
  const watchedReferralDollar = form.watch('outboundReferralDollar');

  // Reset CBP + commPct locks when deal type or closing type changes
  useEffect(() => {
    cbpManuallyEdited.current = false;
    commPctManuallyEdited.current = false;
  }, [watchedClosingType, watchedDealType]);

  // Auto-fill commissionBasePrice from salePrice when not manually overridden
  // Skip if the transaction was loaded with existing commission values.
  useEffect(() => {
    if (cbpManuallyEdited.current || txLoadedWithCommission.current) return;
    const sp = Number(watchedSalePrice) || 0;
    if (sp > 0) form.setValue('commissionBasePrice', sp as any);
  }, [watchedSalePrice]);

  // Auto-assign commissionPercent from seller-paying % based on deal side
  // Skip if the transaction was loaded with existing commission values.
  useEffect(() => {
    if (commPctManuallyEdited.current || txLoadedWithCommission.current) return;
    const listingPct = Number(watchedSellerPayingListing) || 0;
    const buyerPct = Number(watchedSellerPayingBuyer) || 0;
    let autoPct = 0;
    if (watchedClosingType === 'listing') autoPct = listingPct;
    else if (watchedClosingType === 'buyer') autoPct = buyerPct;
    else if (watchedClosingType === 'dual') autoPct = listingPct + buyerPct;
    if (autoPct > 0) form.setValue('commissionPercent', autoPct as any);
  }, [watchedClosingType, watchedSellerPayingListing, watchedSellerPayingBuyer]);

  // Auto-calculate GCI when commissionBasePrice × commissionPercent both set
  // Skip if the transaction was loaded with existing commission values.
  useEffect(() => {
    if (txLoadedWithCommission.current) return;
    const cbp = Number(watchedCBP) || 0;
    const pct = Number(watchedCommPct) || 0;
    if (cbp > 0 && pct > 0) {
      const calcGCI = resolveGCI({ commissionBasePrice: cbp, commissionPercent: pct });
      form.setValue('gci', calcGCI as any);
    }
  }, [watchedCBP, watchedCommPct]);

  // Watched split percentages for auto-recalc of dollar amounts when user manually types a %
  const watchedBrokerPct = form.watch('brokerPct');
  const watchedAgentPct = form.watch('agentPct');

  // When user manually overrides a split %, auto-recalc the corresponding dollar amount.
  // Only fires when commissionManualOverride is true (user has typed into a split field).
  useEffect(() => {
    if (!commissionManualOverride.current) return;
    const gci = Number(form.getValues('gci')) || 0;
    if (gci <= 0) return;
    const refPct = Number(form.getValues('outboundReferralPercent')) || 0;
    const refDollar = hasOutboundReferral
      ? (Number(form.getValues('outboundReferralDollar')) || (refPct > 0 ? Math.round(gci * (refPct / 100) * 100) / 100 : 0))
      : 0;
    const netGci = Math.max(0, gci - refDollar);
    const aPct = Number(form.getValues('agentPct')) || 0;
    const bPct = Number(form.getValues('brokerPct')) || 0;
    if (aPct > 0) form.setValue('agentDollar', Number((netGci * (aPct / 100)).toFixed(2)) as any);
    if (bPct > 0) form.setValue('brokerGci', Number((netGci * (bPct / 100)).toFixed(2)) as any);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedBrokerPct, watchedAgentPct]);

  // Auto-calculate commission split when GCI or agent commission profile changes.
  // NOTE: For team members on a team WITH a leader, tier.agentSplitPercent is already
  // the EFFECTIVE % of full GCI (leaderPercent × memberPercent / 100), so the formula
  // agentNet = netGci × agentSplitPercent is correct for ALL agent types.
  // The leaderStructurePercent and memberPercentOfLeaderSide fields on the tier are
  // only used for the preview card display breakdown.
  // IMPORTANT: All splits are calculated on netGci (after referral fee deduction).
  useEffect(() => {
    if (!agentCommission || commissionManualOverride.current) return;
    // CRITICAL: When editing an existing transaction that already has saved commission
    // values, do NOT overwrite them with the agent's current profile tier.
    // Only update the active tier badge display; leave the saved split fields intact.
    if (txLoadedWithCommission.current) {
      const gciForBadge = Number(watchedGCI) || 0;
      if (gciForBadge > 0) {
        const ytdBadge = agentCommission.ytdTierProgressionCompanyDollar ?? 0;
        setActiveTier(findActiveTier(agentCommission.tiers, ytdBadge > 0 ? ytdBadge : gciForBadge));
      }
      return;
    }
    const gci = Number(watchedGCI) || 0;
    if (gci <= 0) { setActiveTier(null); return; }
    // Deduct outbound referral fee before computing any splits
    const referralDollar = hasOutboundReferral
      ? (Number(watchedReferralDollar) || (Number(watchedReferralPct) > 0 ? Math.round(gci * (Number(watchedReferralPct) / 100) * 100) / 100 : 0))
      : 0;
    const netGci = Math.max(0, gci - referralDollar);
    // Use cumulative YTD companyDollar for tier band lookup so team leaders
    // progress through bands based on total team production, not per-transaction GCI.
    const ytd1 = agentCommission.ytdTierProgressionCompanyDollar ?? 0;
    const tierLookupAmount1 = ytd1 > 0 ? ytd1 : gci;
    const tier = findActiveTier(agentCommission.tiers, tierLookupAmount1);
    setActiveTier(tier);
    if (tier) {
      form.setValue('agentPct', tier.agentSplitPercent as any);
      form.setValue('brokerPct', tier.companySplitPercent as any);
      form.setValue('agentDollar', Number((netGci * (tier.agentSplitPercent / 100)).toFixed(2)) as any);
      form.setValue('brokerGci', Number((netGci * (tier.companySplitPercent / 100)).toFixed(2)) as any);
      const txFee = tier.transactionFee ?? agentCommission.defaultTransactionFee ?? 0;
      if (txFee > 0) {
        form.setValue('txComplianceFee', 'yes');
        form.setValue('txComplianceFeeAmount', txFee as any);
        if (!form.getValues('txComplianceFeePaidBy')) {
          form.setValue('txComplianceFeePaidBy', 'agent');
        }
      }
    }
  }, [watchedGCI, watchedReferralPct, watchedReferralDollar, hasOutboundReferral, agentCommission]);

  // When agent changes and commission profile loads, re-run split calc with current GCI
  // (agentCommission change above handles this, but we also need to re-trigger CBP→GCI
  // in case the agent change doesn't change GCI but the tier structure is different)
  useEffect(() => {
    if (!agentCommission || commissionManualOverride.current) return;
    // CRITICAL: When editing an existing transaction with saved commission values,
    // do NOT recalculate splits from the agent's current profile tier.
    // The saved values are the source of truth; only update the tier badge display.
    if (txLoadedWithCommission.current) {
      const gciForBadge2 = Number(form.getValues('gci')) || 0;
      if (gciForBadge2 > 0) {
        const ytdBadge2 = agentCommission.ytdTierProgressionCompanyDollar ?? 0;
        setActiveTier(findActiveTier(agentCommission.tiers, ytdBadge2 > 0 ? ytdBadge2 : gciForBadge2));
      }
      return;
    }
    const gci = Number(form.getValues('gci')) || 0;
    if (gci <= 0) return;
    // Deduct outbound referral fee before computing any splits
    const refPct = Number(form.getValues('outboundReferralPercent')) || 0;
    const refDollar = hasOutboundReferral
      ? (Number(form.getValues('outboundReferralDollar')) || (refPct > 0 ? Math.round(gci * (refPct / 100) * 100) / 100 : 0))
      : 0;
    const netGci2 = Math.max(0, gci - refDollar);
    const ytd2 = agentCommission.ytdTierProgressionCompanyDollar ?? 0;
    const tierLookupAmount2 = ytd2 > 0 ? ytd2 : gci;
    const tier = findActiveTier(agentCommission.tiers, tierLookupAmount2);
    setActiveTier(tier);
    if (tier) {
      form.setValue('agentPct', tier.agentSplitPercent as any);
      form.setValue('brokerPct', tier.companySplitPercent as any);
      form.setValue('agentDollar', Number((netGci2 * (tier.agentSplitPercent / 100)).toFixed(2)) as any);
      form.setValue('brokerGci', Number((netGci2 * (tier.companySplitPercent / 100)).toFixed(2)) as any);
      const txFee = tier.transactionFee ?? agentCommission.defaultTransactionFee ?? 0;
      if (txFee > 0) {
        form.setValue('txComplianceFee', 'yes');
        form.setValue('txComplianceFeeAmount', txFee as any);
        if (!form.getValues('txComplianceFeePaidBy')) {
          form.setValue('txComplianceFeePaidBy', 'agent');
        }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentCommission]);

  // Load agent list
  useEffect(() => {
    if (!user || !isAdmin) return;
    const load = async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch('/api/admin/agents?source=profiles', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.ok) setAgents(data.agents ?? []);
      } catch { /* silently ignore */ }
    };
    load();
  }, [user, isAdmin]);

  // Fetch agent commission structure when agent changes
  useEffect(() => {
    if (!user || !isAdmin || !watchedAgentId) {
      setAgentCommission(null);
      setActiveTier(null);
      return;
    }
    let cancelled = false;
    const fetchCommission = async () => {
      setCommissionLoading(true);
      // CRITICAL: Only reset the manual-override lock if we are NOT editing an existing
      // transaction that already has commission values saved. If txLoadedWithCommission is
      // true it means the form was pre-populated from Firestore — the saved values are the
      // source of truth and must not be overwritten by the agent's default profile.
      if (!txLoadedWithCommission.current) {
        commissionManualOverride.current = false;
      }
      try {
        const token = await user.getIdToken();
        const res = await fetch(`/api/admin/agent-profiles/${watchedAgentId}/commission`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!cancelled && data.ok) {
          setAgentCommission(data);
          // Only apply the default transaction fee when we are NOT preserving saved commission
          if (!txLoadedWithCommission.current && data.defaultTransactionFee != null && data.defaultTransactionFee > 0) {
            form.setValue('txComplianceFee', 'yes');
            form.setValue('txComplianceFeeAmount', data.defaultTransactionFee as any);
            if (!form.getValues('txComplianceFeePaidBy')) {
              form.setValue('txComplianceFeePaidBy', 'agent');
            }
          }
        }
      } catch { /* silently ignore */ }
      finally { if (!cancelled) setCommissionLoading(false); }
    };
    fetchCommission();
    return () => { cancelled = true; };
  }, [user, isAdmin, watchedAgentId]);

  // Load the existing transaction and pre-populate the form
  useEffect(() => {
    if (!user || !isAdmin || !txId) return;
    const load = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const token = await user.getIdToken();
        const res = await fetch(`/api/admin/transactions/${txId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to load transaction');
        const tx = data.transaction;

        // Map Firestore fields → form values
        // For splitSnapshot fields, extract agentPct/brokerPct/agentDollar/brokerGci
        const split = tx.splitSnapshot || {};
        cbpManuallyEdited.current = !!(tx.commissionBasePrice && tx.commissionBasePrice !== tx.salePrice);

        // When loading an existing transaction, preserve the saved commission values.
        // The fields will be pre-populated from Firestore; the agent profile fetch
        // will NOT overwrite them (txLoadedWithCommission guards this).
        const hasSavedCommission = !!(tx.gci || split.grossCommission || tx.agentPct || tx.agentDollar);
        if (hasSavedCommission) {
          txLoadedWithCommission.current = true;
        }

        form.reset({
          agentId: tx.agentId || '',
          agentDisplayName: tx.agentDisplayName || '',
          status: tx.status || undefined,
          closingType: (tx.closingType as any) || 'buyer',
          dealType: (tx.dealType || tx.transactionType || 'residential_sale') as any,
          address: tx.address || '',
          clientName: tx.clientName || '',
          dealSource: tx.dealSource || '',
          listPrice: n(tx.listPrice),
          salePrice: n(tx.salePrice),
          commissionPercent: n(tx.commissionPercent),
          commissionBasePrice: n(tx.commissionBasePrice),
          gci: n(tx.gci ?? split.grossCommission),
          transactionFee: n(tx.transactionFee),
          earnestMoney: n(tx.earnestMoney),
          depositHolder: (tx.depositHolder as any) || undefined,
          depositHolderOther: tx.depositHolderOther || '',
          brokerPct: n(split.companySplitPercent ?? tx.brokerPct),
          brokerGci: n(split.companyRetained ?? tx.brokerGci),
          agentPct: n(split.agentSplitPercent ?? tx.agentPct),
          agentDollar: n(split.agentNetCommission ?? tx.agentDollar),
          listingDate: d(tx.listingDate),
          contractDate: d(tx.contractDate) || '',
          optionExpiration: d(tx.optionExpiration),
          inspectionDeadline: d(tx.inspectionDeadline),
          surveyDeadline: d(tx.surveyDeadline),
          projectedCloseDate: d(tx.projectedCloseDate),
          closedDate: d(tx.closedDate || tx.closingDate),
          loanApplicationDeadline: d(tx.loanApplicationDeadline),
          appraisalDeadline: d(tx.appraisalDeadline),
          titleDeadline: d(tx.titleDeadline),
          finalLoanCommitmentDeadline: d(tx.finalLoanCommitmentDeadline),
          clientEmail: tx.clientEmail || '',
          clientPhone: tx.clientPhone || '',
          clientNewAddress: tx.clientNewAddress || '',
          clientType: (tx.clientType as any) || undefined,
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
          client2Name: tx.client2Name || '',
          client2Email: tx.client2Email || '',
          client2Phone: tx.client2Phone || '',
          otherAgentName: tx.otherAgentName || '',
          otherAgentEmail: tx.otherAgentEmail || '',
          otherAgentPhone: tx.otherAgentPhone || '',
          otherBrokerage: tx.otherBrokerage || '',
          mortgageCompany: tx.mortgageCompany || '',
          loanOfficer: tx.loanOfficer || '',
          loanOfficerEmail: tx.loanOfficerEmail || '',
          loanOfficerPhone: tx.loanOfficerPhone || '',
          lenderOffice: tx.lenderOffice || '',
          titleCompany: tx.titleCompany || '',
          titleOfficer: tx.titleOfficer || '',
          titleOfficerEmail: tx.titleOfficerEmail || '',
          titleOfficerPhone: tx.titleOfficerPhone || '',
          titleAttorney: tx.titleAttorney || '',
          titleOffice: tx.titleOffice || '',
          tcWorking: (tx.tcWorking as any) || undefined,
          inspectionOrdered: (tx.inspectionOrdered as any) || undefined,
          targetInspectionDate: d(tx.targetInspectionDate),
          inspectionTypes: Array.isArray(tx.inspectionTypes) ? tx.inspectionTypes : [],
          tcScheduleInspections: (tx.tcScheduleInspections as any) || undefined,
          tcScheduleInspectionsOther: tx.tcScheduleInspectionsOther || '',
          inspectorName: tx.inspectorName || '',
          sellerPayingListingAgent: n(tx.sellerPayingListingAgent),
          sellerPayingListingAgentUnknown: tx.sellerPayingListingAgentUnknown || false,
          sellerPayingBuyerAgent: n(tx.sellerPayingBuyerAgent),
          buyerClosingCostTotal: n(tx.buyerClosingCostTotal),
          buyerClosingCostAgentCommission: n(tx.buyerClosingCostAgentCommission),
          buyerClosingCostTxFee: n(tx.buyerClosingCostTxFee),
          buyerClosingCostHomeWarranty: n(tx.buyerClosingCostHomeWarranty),
          buyerClosingCostOther: n(tx.buyerClosingCostOther),
          warrantyAtClosing: (tx.warrantyAtClosing as any) || undefined,
          warrantyPaidBy: tx.warrantyPaidBy || '',
          txComplianceFee: (tx.txComplianceFee as any) || undefined,
          txComplianceFeeAmount: n(tx.txComplianceFeeAmount),
          txComplianceFeePaidBy: tx.txComplianceFeePaidBy || '',
          occupancyAgreement: (tx.occupancyAgreement as any) || undefined,
          occupancyDates: tx.occupancyDates || '',
          shortageInCommission: (tx.shortageInCommission as any) || undefined,
          shortageAmount: n(tx.shortageAmount),
          buyerBringToClosing: n(tx.buyerBringToClosing),
          additionalComments: tx.additionalComments || '',
          notes: tx.notes || '',
        });
        // Auto-show extra buyer/seller rows if they have saved data
        if (tx.buyer3Name || tx.buyer3Email || tx.buyer3Phone) setShowBuyer3(true);
        if (tx.buyer4Name || tx.buyer4Email || tx.buyer4Phone) { setShowBuyer3(true); setShowBuyer4(true); }
        if (tx.seller3Name || tx.seller3Email || tx.seller3Phone) setShowSeller3(true);
        if (tx.seller4Name || tx.seller4Email || tx.seller4Phone) { setShowSeller3(true); setShowSeller4(true); }
        // Load co-agent data from the transaction
        setTxStatus(tx.status || '');
        if (tx.hasCoAgent && tx.coAgent?.agentId) {
          setHasCoAgent(true);
          setCoAgentId(tx.coAgent.agentId || '');
          setCoAgentRole((tx.coAgent.role as 'co_listing' | 'co_buyer') || 'co_listing');
          setPrimarySplit(tx.coAgent.primarySplitPct ?? 50);
          setCoAgentSplit(tx.coAgent.coAgentSplitPct ?? 50);
        }
        // Load saved team split values into override state (so they show as pre-filled editable inputs)
        const savedSplit = tx.splitSnapshot || {};
        if (savedSplit.leaderStructureGross != null) setOverrideLeaderSide(String(savedSplit.leaderStructureGross));
        if (savedSplit.memberPaid != null) setOverrideMemberPay(String(savedSplit.memberPaid));
        if (savedSplit.leaderRetainedAfterMember != null) setOverrideLeaderRetained(String(savedSplit.leaderRetainedAfterMember));

        // Load outbound referral fee data
        if (tx.outboundReferralFee?.referralPercent) {
          setHasOutboundReferral(true);
          form.setValue('hasOutboundReferral', true);
          form.setValue('outboundReferralPercent', tx.outboundReferralFee.referralPercent ?? '');
          form.setValue('outboundReferralDollar', tx.outboundReferralFee.referralDollar ?? '');
          form.setValue('outboundReferralBrokerName', tx.outboundReferralFee.brokerName ?? '');
          form.setValue('outboundReferralContactName', tx.outboundReferralFee.contactName ?? '');
        }
      } catch (err: any) {
        setLoadError(err.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user, isAdmin, txId]);

  // Toggle inspection type checkbox
  const toggleInspectionType = (type: string) => {
    const current = form.getValues('inspectionTypes') || [];
    if (current.includes(type)) {
      form.setValue('inspectionTypes', current.filter((t: string) => t !== type));
    } else {
      form.setValue('inspectionTypes', [...current, type]);
    }
  };

  // ── Manual retroactive split trigger ────────────────────────────────────────
  const handleTriggerSplit = async () => {
    if (!user || !txId) return;
    if (!window.confirm('This will split this transaction into two separate ledger entries — one for each agent. The original transaction will be deleted. This cannot be undone. Continue?')) return;
    setTriggeringSplit(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/transactions/${txId}/trigger-split`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Split failed');
      toast({
        title: 'Transaction split successfully',
        description: `Created two ledger entries: primary (${data.primaryTransactionId}) and co-agent (${data.coAgentTransactionId}).`,
      });
      router.push('/dashboard/admin/transactions');
    } catch (err: any) {
      toast({ title: 'Split failed', description: err.message, variant: 'destructive' });
    } finally {
      setTriggeringSplit(false);
    }
  };

  const onSubmit = async (values: FormValues) => {
    if (!user || !txId) return;
    setSaving(true);
    setSaveError(null);
    try {
      const token = await user.getIdToken();

      // Build the payload — include splitSnapshot if split fields are set
      const payload: any = { id: txId, ...values };

      // Rebuild splitSnapshot from individual split fields
      const gci = Number(values.gci) || 0;
      const agentPct = Number(values.agentPct) || 0;
      const brokerPct = Number(values.brokerPct) || 0;
      const agentDollar = Number(values.agentDollar) || 0;
      const brokerGci = Number(values.brokerGci) || 0;
      if (gci > 0 || agentDollar > 0 || brokerGci > 0) {
        // Resolve team split values:
        // 1. If manually overridden, use the override value
        // 2. Otherwise, auto-compute from the team leader band percentages (same logic as the display card)
        let teamLeaderSide: number | null = overrideLeaderSide !== '' ? Number(overrideLeaderSide) : null;
        let teamMemberPay: number | null = overrideMemberPay !== '' ? Number(overrideMemberPay) : null;
        let teamLeaderRetained: number | null = overrideLeaderRetained !== '' ? Number(overrideLeaderRetained) : null;

        // Auto-compute if the agent is a team member and values are not manually overridden
        if (agentCommission?.teamMemberLeaderSplit && (teamLeaderSide === null || teamMemberPay === null || teamLeaderRetained === null)) {
          const refDollar = hasOutboundReferral
            ? (Number(values.outboundReferralDollar) || (Number(values.outboundReferralPercent) > 0 ? Math.round(gci * (Number(values.outboundReferralPercent) / 100) * 100) / 100 : 0))
            : 0;
          const netGci = Math.max(0, gci - refDollar);
          const bands = agentCommission.teamMemberLeaderSplit.leaderStructureBands || [];
          const band = bands.find(b => {
            const from = Number(b.fromCompanyDollar || 0);
            const to = b.toCompanyDollar === null || b.toCompanyDollar === undefined ? null : Number(b.toCompanyDollar);
            return netGci >= from && (to === null || netGci < to);
          }) || bands[0];
          if (band) {
            const leaderPct = Number(band.leaderPercent || 0);
            const autoLeaderSide = netGci > 0 ? Number((netGci * (leaderPct / 100)).toFixed(2)) : 0;
            const autoMemberPay = agentDollar;
            const autoLeaderRetained = autoLeaderSide > 0 ? Number((autoLeaderSide - autoMemberPay).toFixed(2)) : 0;
            if (teamLeaderSide === null) teamLeaderSide = autoLeaderSide;
            if (teamMemberPay === null) teamMemberPay = autoMemberPay;
            if (teamLeaderRetained === null) teamLeaderRetained = autoLeaderRetained;
          }
        }
        payload.splitSnapshot = {
          grossCommission: gci,
          agentNetCommission: agentDollar || null,
          companyRetained: brokerGci,
          agentSplitPercent: agentPct || null,
          companySplitPercent: brokerPct || null,
          // Team split fields — saved whenever present
          ...(teamLeaderSide != null ? { leaderStructureGross: teamLeaderSide } : {}),
          ...(teamMemberPay != null ? { memberPaid: teamMemberPay } : {}),
          ...(teamLeaderRetained != null ? { leaderRetainedAfterMember: teamLeaderRetained } : {}),
        };
        payload.commission = gci;
        payload.brokerProfit = brokerGci;
      }

      // If the user manually changed any split field, mark the transaction as commission-overridden.
      // The server-side PATCH route checks this flag to skip profile-based recalculation.
      if (commissionManualOverride.current) {
        payload.commissionOverridden = true;
        payload.commissionOverriddenBy = user.uid;
        payload.commissionOverriddenAt = new Date().toISOString();
      } else {
        // No manual override — clear any legacy override flags
        payload.commissionOverridden = false;
        payload.commissionOverriddenBy = null;
        payload.commissionOverriddenAt = null;
      }

      // Add co-agent data to the payload
      payload.hasCoAgent = hasCoAgent;
      if (hasCoAgent && coAgentId) {
        payload.coAgent = {
          agentId: coAgentId,
          role: coAgentRole,
          primarySplitPct: primarySplit,
          coAgentSplitPct: coAgentSplit,
        };
      } else {
        payload.coAgent = null;
      }

      // Add outbound referral fee to the payload
      const referralPct = Number(values.outboundReferralPercent) || 0;
      if (hasOutboundReferral && referralPct > 0) {
        const referralGci = Number(values.gci) || 0;
        const calculatedReferralDollar = Number(values.outboundReferralDollar) || Math.round(referralGci * (referralPct / 100) * 100) / 100;
        payload.outboundReferralFee = {
          referralPercent: referralPct,
          referralDollar: calculatedReferralDollar,
          brokerName: values.outboundReferralBrokerName || '',
          contactName: values.outboundReferralContactName || '',
        };
      } else {
        payload.outboundReferralFee = null;
      }
      // Remove individual referral form fields from the payload (they live in outboundReferralFee)
      delete payload.hasOutboundReferral;
      delete payload.outboundReferralPercent;
      delete payload.outboundReferralDollar;
      delete payload.outboundReferralBrokerName;
      delete payload.outboundReferralContactName;

      const res = await fetch('/api/admin/transactions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Save failed');

      if (data.split) {
        toast({ title: 'Transaction split into two', description: 'The co-agent transaction has been created and both agents\u2019 commissions have been calculated separately.' });
      } else {
        toast({ title: 'Transaction saved', description: 'All changes have been saved to the ledger.' });
      }
      router.push('/dashboard/admin/transactions');
    } catch (err: any) {
      setSaveError(err.message);
      toast({ title: 'Error saving transaction', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  if (userLoading || loading) {
    return (
      <div className="max-w-4xl mx-auto space-y-6 p-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Failed to load transaction</AlertTitle>
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
        <div className="mt-4">
          <Link href="/dashboard/admin/transactions">
            <Button variant="outline"><ArrowLeft className="mr-2 h-4 w-4" />Back to Ledger</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Link href="/dashboard/admin/transactions">
              <Button variant="ghost" size="sm" className="gap-1.5 -ml-2">
                <ArrowLeft className="h-4 w-4" /> Back to Ledger
              </Button>
            </Link>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Edit Transaction</h1>
          <p className="text-muted-foreground mt-1">
            All changes save directly to the ledger — no TC Queue review required.
          </p>
        </div>
        <Badge variant="outline" className="mt-1">Admin Edit</Badge>
      </div>

      {saveError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Save failed</AlertTitle>
          <AlertDescription>{saveError}</AlertDescription>
        </Alert>
      )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

          {/* ── Wizard Progress Bar ──────────────────────────────────────── */}
          {(() => {
            const steps = [
              { id: 1, label: 'The Deal' },
              { id: 2, label: 'The People' },
              { id: 3, label: 'Inspections' },
              { id: 4, label: 'Final Details' },
            ];
            return (
              <div className="flex items-center gap-0 mb-2">
                {steps.map((step, idx) => (
                  <div key={step.id} className="flex items-center flex-1">
                    <button
                      type="button"
                      onClick={() => setWizardStep(step.id)}
                      className="flex flex-col items-center gap-1"
                    >
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                        wizardStep === step.id
                          ? 'bg-primary text-primary-foreground shadow-md scale-110'
                          : wizardStep > step.id
                          ? 'bg-green-500 text-white'
                          : 'bg-muted text-muted-foreground'
                      }`}>
                        {wizardStep > step.id ? <Check className="h-4 w-4" /> : step.id}
                      </div>
                      <span className={`text-xs font-medium hidden sm:block ${
                        wizardStep === step.id ? 'text-primary' : 'text-muted-foreground'
                      }`}>{step.label}</span>
                    </button>
                    {idx < steps.length - 1 && (
                      <div className={`flex-1 h-0.5 mx-2 transition-all ${
                        wizardStep > step.id ? 'bg-green-500' : 'bg-muted'
                      }`} />
                    )}
                  </div>
                ))}
              </div>
            );
          })()}

          {/* ── Step 1: The Deal ─────────────────────────────────────────── */}
          <div className={wizardStep !== 1 ? 'hidden' : ''}>
          {/* ── Section 1: Transaction Basics ────────────────────────────── */}
          <Section title="Transaction Basics">
            {/* Agent selector */}
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
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select an agent" />
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

            <Grid2>
              <FormField control={form.control} name="closingType" render={({ field }) => (
                <FormItem>
                  <FormLabel>Type of Closing <span className="text-destructive">*</span></FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="buyer">Buyer Representation</SelectItem>
                      <SelectItem value="listing">Listing / Seller Side</SelectItem>
                      <SelectItem value="dual">Dual Agent</SelectItem>
                      <SelectItem value="referral">Referral</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="dealType" render={({ field }) => (
                <FormItem>
                  <FormLabel>Deal / Property Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="residential_sale">Residential Sale</SelectItem>
                      <SelectItem value="residential_lease">Residential Lease</SelectItem>
                      <SelectItem value="land">Land</SelectItem>
                      <SelectItem value="commercial_sale">Commercial Sale</SelectItem>
                      <SelectItem value="commercial_lease">Commercial Lease</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            </Grid2>

            <FormField control={form.control} name="address" render={({ field }) => (
              <FormItem>
                <FormLabel>Property Address <span className="text-destructive">*</span></FormLabel>
                <FormControl><Input placeholder="123 Main St, Lafayette, LA 70508" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <Grid2>
              <FormField control={form.control} name="clientName" render={({ field }) => (
                <FormItem>
                  <FormLabel>Client Name <span className="text-destructive">*</span></FormLabel>
                  <FormControl>
                    <ContactAutocomplete
                      type="client"
                      placeholder="Search saved contacts…"
                      value={field.value || ''}
                      onChange={field.onChange}
                      onSelect={(c: SavedContact) => {
                        form.setValue('clientName', c.name || '');
                        if (c.email) form.setValue('clientEmail' as any, c.email);
                        if (c.phone) form.setValue('clientPhone' as any, c.phone);
                        if (c.newAddress) form.setValue('clientNewAddress' as any, c.newAddress);
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="dealSource" render={({ field }) => (
                <FormItem>
                  <FormLabel>Lead Source</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Where did this lead come from?" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {SOURCES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </FormItem>
              )} />
            </Grid2>
          </Section>

          {/* ── TC Working File ───────────────────────────────────────────── */}
          <Section title="TC Working File">
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
              </FormItem>
            )} />
          </Section>

          {/* ── Key Dates ─────────────────────────────────────── */}
          <Section title="Key Dates">
            <Grid3>
              <FormField control={form.control} name="listingDate" render={({ field }) => (
                <FormItem><FormLabel>Listing Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name="contractDate" render={({ field }) => (
                <FormItem>
                  <FormLabel>Under Contract Date <span className="text-destructive">*</span></FormLabel>
                  <FormControl><Input type="date" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="optionExpiration" render={({ field }) => (
                <FormItem><FormLabel>Expiration</FormLabel><FormControl><Input type="date" {...field} /></FormControl></FormItem>
              )} />
            </Grid3>
            <Grid3>
              <FormField control={form.control} name="inspectionDeadline" render={({ field }) => (
                <FormItem><FormLabel>Inspection Deadline</FormLabel><FormControl><Input type="date" {...field} /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name="surveyDeadline" render={({ field }) => (
                <FormItem><FormLabel>Survey Deadline</FormLabel><FormControl><Input type="date" {...field} /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name="projectedCloseDate" render={({ field }) => (
                <FormItem><FormLabel>Projected Close Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl></FormItem>
              )} />
            </Grid3>
            <Grid3>
              <FormField control={form.control} name="loanApplicationDeadline" render={({ field }) => (
                <FormItem><FormLabel>Loan Application Deadline</FormLabel><FormControl><Input type="date" {...field} /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name="appraisalDeadline" render={({ field }) => (
                <FormItem><FormLabel>Appraisal Deadline</FormLabel><FormControl><Input type="date" {...field} /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name="titleDeadline" render={({ field }) => (
                <FormItem><FormLabel>Title Deadline</FormLabel><FormControl><Input type="date" {...field} /></FormControl></FormItem>
              )} />
            </Grid3>
            <Grid3>
              <FormField control={form.control} name="finalLoanCommitmentDeadline" render={({ field }) => (
                <FormItem><FormLabel>Final Loan Commitment Deadline</FormLabel><FormControl><Input type="date" {...field} /></FormControl></FormItem>
              )} />
            </Grid3>
            <Grid2>
              <FormField control={form.control} name="closedDate" render={({ field }) => (
                <FormItem>
                  <FormLabel>Actual Close Date</FormLabel>
                  <FormControl><Input type="date" {...field} /></FormControl>
                  <FormDescription>Sets status to Closed automatically.</FormDescription>
                </FormItem>
              )} />
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
                      <SelectItem value="temp_off_market">Temp Off Market</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="closed">Closed</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                      <SelectItem value="canceled">Canceled</SelectItem>
                      <SelectItem value="expired">Expired</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>Select the current status of this transaction.</FormDescription>
                  <FormMessage />
                </FormItem>
              )} />
            </Grid2>
          </Section>

          {/* ── Deal Value ─────────────────────────────────── */}
          <Section title="Deal Value">
            <Grid2>
              <FormField control={form.control} name="listPrice" render={({ field }) => (
                <FormItem><FormLabel>List Price / Buyer Rep Price ($)</FormLabel><FormControl><Input type="number" step="1" placeholder="0" {...field} /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name="salePrice" render={({ field }) => (
                <FormItem><FormLabel>Sale Price ($)</FormLabel><FormControl><Input type="number" step="1" placeholder="0" {...field} /></FormControl></FormItem>
              )} />
            </Grid2>
            <Grid2>
              <FormField control={form.control} name="earnestMoney" render={({ field }) => (
                <FormItem><FormLabel>Earnest Money / Deposit ($)</FormLabel><FormControl><Input type="number" step="1" placeholder="0" {...field} /></FormControl></FormItem>
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
          </Section>
          </div>{/* end Step 1 */}

          {/* ── Step 2: The People ──────────────────────────────────────── */}
          <div className={wizardStep !== 2 ? 'hidden' : ''}>
          {/* ── Client Info ─────────────────────────────────────────────── */}
          <Section title="Client Info" description="Select client type to show the appropriate contact fields.">
            <FormField control={form.control} name="clientType" render={({ field }) => (
              <FormItem>
                <FormLabel>Client Type</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl><SelectTrigger><SelectValue placeholder="Select client type..." /></SelectTrigger></FormControl>
                  <SelectContent>
                    <SelectItem value="buyer">Buyer</SelectItem>
                    <SelectItem value="seller">Seller</SelectItem>
                    <SelectItem value="dual">Dual Agent (I&apos;m working both sides)</SelectItem>
                  </SelectContent>
                </Select>
              </FormItem>
            )} />
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
            {/* Seller section */}
            {(clientType === 'seller' || clientType === 'dual') && (
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
                  <FormItem><FormLabel>Client New Address</FormLabel><FormDescription>Where the seller is moving to (for mailers)</FormDescription><FormControl><Input placeholder="New address after closing" {...field} /></FormControl></FormItem>
                )} />
              </>
            )}
            {/* Legacy second contact */}
            {!clientType && (
              <>
                <Separator className="my-2" />
                <p className="text-sm font-medium text-muted-foreground">Second Contact (co-buyer, spouse, etc.)</p>
                <Grid3>
                  <FormField control={form.control} name="client2Name" render={({ field }) => (
                    <FormItem><FormLabel>Name</FormLabel><FormControl><Input placeholder="Optional" {...field} /></FormControl></FormItem>
                  )} />
                  <FormField control={form.control} name="client2Email" render={({ field }) => (
                    <FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" placeholder="Optional" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="client2Phone" render={({ field }) => (
                    <FormItem><FormLabel>Phone</FormLabel><FormControl><Input type="tel" placeholder="Optional" {...field} /></FormControl></FormItem>
                  )} />
                </Grid3>
              </>
            )}
          </Section>

          {/* ── Cooperating Agent (hidden for dual agent transactions) ──── */}
          {watchedClosingType !== 'dual' && <Section title="Cooperating Agent">
            <Grid2>
              <FormField control={form.control} name="otherAgentName" render={({ field }) => (
                <FormItem><FormLabel>Agent Name</FormLabel><FormControl>
                  <ContactAutocomplete
                    type="other_agent"
                    placeholder="Search saved agents…"
                    value={field.value || ''}
                    onChange={field.onChange}
                    onSelect={(c: SavedContact) => {
                      form.setValue('otherAgentName', c.name || '');
                      form.setValue('otherBrokerage' as any, c.brokerage || '');
                      form.setValue('otherAgentEmail' as any, c.email || '');
                      form.setValue('otherAgentPhone' as any, c.phone || '');
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
          </Section>}

          {/* ── Mortgage / Lender ──────────────────────────────────────────── */}
          <Section title="Mortgage / Lender">
            <Grid2>
              <FormField control={form.control} name="mortgageCompany" render={({ field }) => (
                <FormItem><FormLabel>Mortgage Company</FormLabel><FormControl>
                  <ContactAutocomplete
                    type="lender"
                    placeholder="Search saved lenders…"
                    value={field.value || ''}
                    onChange={field.onChange}
                    onSelect={(c: SavedContact) => {
                      form.setValue('mortgageCompany', c.companyName || c.name || '');
                      form.setValue('loanOfficer' as any, c.officerName || '');
                      form.setValue('loanOfficerEmail' as any, c.email || '');
                      form.setValue('loanOfficerPhone' as any, c.phone || '');
                      form.setValue('lenderOffice' as any, c.office || '');
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
          </Section>

          {/* ── Title Company ──────────────────────────────────── */}
          <Section title="Title Company">
            <Grid2>
              <FormField control={form.control} name="titleCompany" render={({ field }) => (
                <FormItem><FormLabel>Title Company</FormLabel><FormControl>
                  <ContactAutocomplete
                    type="title"
                    placeholder="Search saved title companies…"
                    value={field.value || ''}
                    onChange={field.onChange}
                    onSelect={(c: SavedContact) => {
                      form.setValue('titleCompany', c.companyName || c.name || '');
                      form.setValue('titleOfficer' as any, c.officerName || '');
                      form.setValue('titleOfficerEmail' as any, c.email || '');
                      form.setValue('titleOfficerPhone' as any, c.phone || '');
                      form.setValue('titleAttorney' as any, c.attorney || '');
                      form.setValue('titleOffice' as any, c.office || '');
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
          </Section>
          </div>{/* end Step 2 */}

          {/* ── Step 3: Inspections & Commission ───────────────────────────── */}
          <div className={wizardStep !== 3 ? 'hidden' : ''}>
          {/* ── Inspections ─────────────────────────────────────────────────────────────── */}
          <Section title="Inspections">
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
                <FormItem><FormLabel>Inspector Name / Company</FormLabel><FormControl><Input placeholder="Inspector name or company" {...field} /></FormControl></FormItem>
              )} />
            </div>
          </Section>

          {/* ── Buyer Closing Cost Paid by Seller ─────────────── */}
          <Section title="Buyer Closing Cost Paid by Seller">
            <div className="max-w-xs">
              <FormField control={form.control} name="buyerClosingCostTotal" render={({ field }) => (
                <FormItem>
                  <FormLabel>Total Buyer&apos;s Closing Cost Paid by Seller ($)</FormLabel>
                  <FormControl><Input type="number" step="0.01" placeholder="0" {...field} /></FormControl>
                </FormItem>
              )} />
            </div>
{/* Breakdown fields hidden per broker request — fields preserved in code and Firestore but not shown in UI */}
          </Section>

          {/* ── Commission & Fees ────────────────────────────────── */}
          <Section title="Commission & Fees">
            {/* Commission base price */}
            <FormField control={form.control} name="commissionBasePrice" render={({ field }) => (
              <FormItem>
                <FormLabel>Price Commission Is Based On (Sale Price – Seller Concessions)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="1"
                    placeholder="Auto-filled from Sale Price"
                    {...field}
                    onChange={(e) => {
                      cbpManuallyEdited.current = true;
                      field.onChange(e);
                    }}
                  />
                </FormControl>
                <FormDescription>
                  Defaults to Sale Price. Edit if seller concessions reduce the commission base.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )} />

            {/* Commission paid by seller */}
            <Separator />
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Commission Paid by Seller</p>
            <div className="space-y-4">
              <div className="flex items-end gap-4">
                <div className="flex-1 max-w-xs">
                  <FormField control={form.control} name="sellerPayingListingAgent" render={({ field }) => (
                    <FormItem>
                      <FormLabel>% Seller Paying Listing Agent</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input type="number" step="0.01" min="0" max="100" placeholder="3" {...field} />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
                        </div>
                      </FormControl>
                      <FormDescription>% of Commission Base Price</FormDescription>
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
              <div className="max-w-xs">
                <FormField control={form.control} name="sellerPayingBuyerAgent" render={({ field }) => (
                  <FormItem>
                    <FormLabel>% Seller Paying Buyer&apos;s Agent</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input type="number" step="0.01" min="0" max="100" placeholder="3" {...field} />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
                      </div>
                    </FormControl>
                    <FormDescription>% of Commission Base Price</FormDescription>
                  </FormItem>
                )} />
              </div>
            </div>

            {/* Agent view: Gross Commission % + Agent Net $ only (read-only) */}
            {!isAdmin && (
              <>
                <Separator />
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Gross Commission</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-lg">
                  <FormField control={form.control} name="commissionPercent" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Gross Commission %</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="3"
                          readOnly
                          className="bg-background cursor-default"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>% of Commission Base Price</FormDescription>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="agentDollar" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Agent Net $</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="Auto-calculated"
                          readOnly
                          className="bg-background cursor-default"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>Calculated from your commission profile and tier.</FormDescription>
                    </FormItem>
                  )} />
                </div>
              </>
            )}

            {/* GCI & Commission % — admin only */}
            {isAdmin && (
              <>
                <Separator />
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Gross Commission</p>
                <Grid3>
                  <FormField control={form.control} name="commissionPercent" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Gross Commission %</FormLabel>
                      <FormControl>
                        <Input
                          type="number" step="0.01" placeholder="3"
                          {...field}
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
                      <FormControl><Input type="number" step="0.01" placeholder="0" {...field} /></FormControl>
                      <FormDescription>Gross Commission Income</FormDescription>
                    </FormItem>
                  )} />
                </Grid3>

                {/* Commission Split */}
                <Separator />

                {/* Commission tier info banner — shows which tier is active */}
                {agentCommission && activeTier && (
                  <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
                    {commissionLoading ? (
                      <span>Loading commission structure...</span>
                    ) : (
                      <span>
                        <strong>Commission tier:</strong> {activeTier.tierName} — Agent {activeTier.agentSplitPercent}% / Broker {activeTier.companySplitPercent}%
                        {activeTier.transactionFee != null && ` / Fee $${activeTier.transactionFee}`}
                      </span>
                    )}
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Broker / Agent Split</p>
                </div>
                <Grid2>
                  <FormField control={form.control} name="brokerPct" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Broker %</FormLabel>
                      <FormControl>
                        <Input
                          type="number" step="0.01" placeholder="30"
                          {...field}
                          onChange={(e) => {
                            commissionManualOverride.current = true;
                            field.onChange(e);
                          }}
                        />
                      </FormControl>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="brokerGci" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Broker GCI ($)</FormLabel>
                      <FormControl>
                        <Input
                          type="number" step="0.01" placeholder="0"
                          {...field}
                          onChange={(e) => {
                            commissionManualOverride.current = true;
                            field.onChange(e);
                          }}
                        />
                      </FormControl>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="agentPct" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Agent %</FormLabel>
                      <FormControl>
                        <Input
                          type="number" step="0.01" placeholder="70"
                          {...field}
                          onChange={(e) => {
                            commissionManualOverride.current = true;
                            field.onChange(e);
                          }}
                        />
                      </FormControl>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="agentDollar" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Agent Net $</FormLabel>
                      <FormControl>
                        <Input
                          type="number" step="0.01" placeholder="0"
                          {...field}
                          onChange={(e) => {
                            commissionManualOverride.current = true;
                            field.onChange(e);
                          }}
                        />
                      </FormControl>
                      <FormDescription>Auto-calculated from agent profile. Editable — type to override.</FormDescription>
                    </FormItem>
                  )} />
                </Grid2>
              </>
            )}
          </Section>

          {/* ── Team Leader Commission Breakdown ────────────────────────────────────── */}
          {/* Only shown when the selected agent is a team member on a team WITH a leader */}
          {agentCommission?.teamMemberLeaderSplit && (() => {
            const gci = Number(form.watch('gci')) || 0;
            const agentDollar = Number(form.watch('agentDollar')) || 0;
            // Deduct outbound referral fee before all leader/broker split display math
            const dispRefDollar = hasOutboundReferral
              ? (Number(form.watch('outboundReferralDollar')) || (Number(form.watch('outboundReferralPercent')) > 0 ? Math.round(gci * (Number(form.watch('outboundReferralPercent')) / 100) * 100) / 100 : 0))
              : 0;
            const netGciDisplay = Math.max(0, gci - dispRefDollar);
            const bands = agentCommission.teamMemberLeaderSplit!.leaderStructureBands || [];
            // Find the active leader band based on net GCI
            const activeBand = bands.find(b => {
              const from = Number(b.fromCompanyDollar || 0);
              const to = b.toCompanyDollar === null || b.toCompanyDollar === undefined ? null : Number(b.toCompanyDollar);
              return netGciDisplay >= from && (to === null || netGciDisplay < to);
            }) || bands[0];
            if (!activeBand) return null;
            const leaderPct = Number(activeBand.leaderPercent || 0);
            const companyPct = Number(activeBand.companyPercent || 0);
            const leaderStructureGross = netGciDisplay > 0 ? Number((netGciDisplay * (leaderPct / 100)).toFixed(2)) : 0;
            const companyRetained = netGciDisplay > 0 ? Number((netGciDisplay * (companyPct / 100)).toFixed(2)) : 0;
            const leaderRetained = leaderStructureGross > 0 ? Number((leaderStructureGross - agentDollar).toFixed(2)) : 0;
            const fmt = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
            return (
              <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-amber-900">Team Leader Commission Breakdown</span>
                  <span className="text-xs text-amber-700 bg-amber-100 rounded px-2 py-0.5">Auto-calculated · editable</span>
                </div>
                <p className="text-xs text-amber-700">This agent is a team member. Values are auto-calculated from the team structure — edit any field to override.{dispRefDollar > 0 ? ` Referral fee of ${fmt(dispRefDollar)} has been deducted from gross GCI before these splits.` : ''}</p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {/* Gross GCI — read-only display (source of truth is the GCI field above) */}
                  <div className="rounded-md bg-white border border-amber-200 p-3">
                    <p className="text-xs text-muted-foreground">{dispRefDollar > 0 ? 'Net GCI (after referral)' : 'Gross GCI'}</p>
                    <p className="text-sm font-bold">{fmt(netGciDisplay)}</p>
                    {dispRefDollar > 0 && <p className="text-xs text-muted-foreground">Gross: {fmt(gci)}</p>}
                  </div>
                  {/* Leader Side — editable */}
                  <div className="rounded-md bg-white border border-amber-200 p-3 space-y-1">
                    <p className="text-xs text-muted-foreground">Leader Side ({leaderPct}%)</p>
                    <input
                      type="number"
                      step="0.01"
                      className="w-full text-sm font-bold text-amber-700 bg-transparent border-b border-amber-300 focus:outline-none focus:border-amber-600 py-0.5"
                      value={overrideLeaderSide !== '' ? overrideLeaderSide : leaderStructureGross}
                      onChange={e => setOverrideLeaderSide(e.target.value)}
                    />
                    {overrideLeaderSide !== '' && Number(overrideLeaderSide) !== leaderStructureGross && (
                      <p className="text-xs text-amber-500">calc: {fmt(leaderStructureGross)}</p>
                    )}
                  </div>
                  {/* Agent Net — read-only (driven by agentDollar field above) */}
                  <div className="rounded-md bg-white border border-amber-200 p-3">
                    <p className="text-xs text-muted-foreground">Agent Net (Member Pay)</p>
                    <p className="text-sm font-bold text-green-700">{fmt(agentDollar)}</p>
                    <p className="text-xs text-muted-foreground">Edit via Agent $ field</p>
                  </div>
                  {/* Leader Retains — editable */}
                  <div className="rounded-md bg-amber-100 border border-amber-300 p-3 space-y-1">
                    <p className="text-xs text-amber-800 font-medium">Leader Retains</p>
                    <input
                      type="number"
                      step="0.01"
                      className="w-full text-sm font-bold text-amber-900 bg-transparent border-b border-amber-400 focus:outline-none focus:border-amber-700 py-0.5"
                      value={overrideLeaderRetained !== '' ? overrideLeaderRetained : leaderRetained}
                      onChange={e => setOverrideLeaderRetained(e.target.value)}
                    />
                    {overrideLeaderRetained !== '' && Number(overrideLeaderRetained) !== leaderRetained && (
                      <p className="text-xs text-amber-500">calc: {fmt(leaderRetained)}</p>
                    )}
                    <p className="text-xs text-amber-600">= Leader Side − Agent Net</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs text-amber-700 pt-1 border-t border-amber-200">
                  <span>Company Retained: <strong>{fmt(companyRetained)}</strong> ({companyPct}%)</span>
                  <span className="text-amber-400">|</span>
                  <span>Check: {fmt(agentDollar)} + {fmt(overrideLeaderRetained !== '' ? Number(overrideLeaderRetained) : leaderRetained)} + {fmt(companyRetained)} = {fmt(agentDollar + (overrideLeaderRetained !== '' ? Number(overrideLeaderRetained) : leaderRetained) + companyRetained)}</span>
                </div>
              </div>
            );
          })()}

          {/* ── Agent Participation (Co-Agent) ────────────────────────────────────────── */}
          <Section title="Agent Participation" description="Is another internal agent co-representing on this transaction?">
            <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/30">
              <div>
                <p className="font-medium text-sm">Co-Agent on This Transaction</p>
                <p className="text-xs text-muted-foreground mt-0.5">Enable if another Keaty agent is sharing this side. Their commission will be calculated separately.</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={hasCoAgent}
                onClick={() => setHasCoAgent(v => !v)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                  hasCoAgent ? 'bg-blue-600' : 'bg-gray-200'
                }`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  hasCoAgent ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>

            {/* ── Outbound Referral Fee ───────────────────────────────────────── */}
            <div className="border rounded-lg p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">Outbound Referral Fee</p>
                  <p className="text-xs text-muted-foreground">Paid to an outside broker or relocation company. This % is deducted from the top of GCI before the agent/broker split.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setHasOutboundReferral(!hasOutboundReferral)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                    hasOutboundReferral ? 'bg-blue-600' : 'bg-gray-200'
                  }`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    hasOutboundReferral ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
              </div>
              {hasOutboundReferral && (
                <div className="space-y-4">
                  <Grid2>
                    <div>
                      <label className="text-sm font-medium">Referral % <span className="text-red-500">*</span></label>
                      <p className="text-xs text-muted-foreground mb-1">Percentage of GCI paid to the outside broker (e.g. 25 for 25%)</p>
                      <input
                        type="number" min={0} max={100} step={0.5}
                        placeholder="e.g. 25"
                        className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
                        {...form.register('outboundReferralPercent')}
                        onChange={e => {
                          form.setValue('outboundReferralPercent', e.target.value as any);
                          const pct = Number(e.target.value) || 0;
                          const gci = Number(form.getValues('gci')) || 0;
                          if (pct > 0 && gci > 0) {
                            form.setValue('outboundReferralDollar', Math.round(gci * (pct / 100) * 100) / 100 as any);
                          }
                        }}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Referral Dollar Amount</label>
                      <p className="text-xs text-muted-foreground mb-1">Auto-calculated from % above. Override if needed.</p>
                      <input
                        type="number" min={0} step={0.01}
                        placeholder="Auto-calculated"
                        className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
                        {...form.register('outboundReferralDollar')}
                      />
                    </div>
                  </Grid2>
                  <Grid2>
                    <div>
                      <label className="text-sm font-medium">Outside Broker / Company Name</label>
                      <input
                        type="text"
                        placeholder="e.g. Keller Williams Dallas or Cartus Relocation"
                        className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
                        {...form.register('outboundReferralBrokerName')}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Referring Agent / Contact Name</label>
                      <input
                        type="text"
                        placeholder="e.g. John Smith"
                        className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
                        {...form.register('outboundReferralContactName')}
                      />
                    </div>
                  </Grid2>
                  {(() => {
                    const pct = Number(form.watch('outboundReferralPercent')) || 0;
                    const gci = Number(form.watch('gci')) || 0;
                    const dollar = Number(form.watch('outboundReferralDollar')) || (pct > 0 && gci > 0 ? Math.round(gci * (pct / 100) * 100) / 100 : 0);
                    const net = gci - dollar;
                    if (pct > 0 && gci > 0) {
                      return (
                        <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800 space-y-1">
                          <p className="font-semibold">Referral Fee Summary</p>
                          <p>Gross GCI: <strong>${gci.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></p>
                          <p>Referral Fee ({pct}%): <strong>-${dollar.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></p>
                          <p>Net to Agent/Broker Split: <strong>${net.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></p>
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>
              )}
            </div>

            {hasCoAgent && (
              <div className="border rounded-lg p-4 bg-blue-50/50 space-y-4">
                <p className="text-sm font-semibold text-blue-800">Co-Agent Details</p>
                <Grid2>
                  <div>
                    <label className="text-sm font-medium">Co-Agent *</label>
                    <select
                      className="mt-1 w-full border rounded-md px-3 py-2 text-sm bg-white"
                      value={coAgentId}
                      onChange={e => setCoAgentId(e.target.value)}
                    >
                      <option value="">Select co-agent...</option>
                      {agents.map(a => (
                        <option key={a.agentId} value={a.agentId}>{a.agentName}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Co-Agent Role</label>
                    <select
                      className="mt-1 w-full border rounded-md px-3 py-2 text-sm bg-white"
                      value={coAgentRole}
                      onChange={e => setCoAgentRole(e.target.value as 'co_listing' | 'co_buyer')}
                    >
                      <option value="co_listing">Co-Listing Agent</option>
                      <option value="co_buyer">Co-Buyer Agent</option>
                    </select>
                  </div>
                </Grid2>
                <div>
                  <p className="text-sm font-medium mb-1">Commission Split</p>
                  <p className="text-xs text-muted-foreground mb-3">The side gross commission will be divided by these percentages first. Each agent&apos;s own commission structure is then applied to their respective share.</p>
                  <Grid2>
                    <div>
                      <label className="text-sm font-medium">Primary Agent Split %</label>
                      <input
                        type="number" min={0} max={100} step={1}
                        className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
                        value={primarySplit}
                        onChange={e => {
                          const v = Math.min(100, Math.max(0, Number(e.target.value)));
                          setPrimarySplit(v);
                          setCoAgentSplit(100 - v);
                        }}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Co-Agent Split %</label>
                      <input
                        type="number" min={0} max={100} step={1}
                        className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
                        value={coAgentSplit}
                        onChange={e => {
                          const v = Math.min(100, Math.max(0, Number(e.target.value)));
                          setCoAgentSplit(v);
                          setPrimarySplit(100 - v);
                        }}
                      />
                    </div>
                  </Grid2>
                  <p className={`text-xs mt-2 font-medium ${
                    primarySplit + coAgentSplit === 100 ? 'text-green-600' : 'text-red-500'
                  }`}>
                    Total: {primarySplit + coAgentSplit}%
                    {primarySplit + coAgentSplit === 100 ? ' ✓ Splits are balanced' : ' ⚠ Splits must total 100%'}
                  </p>
                </div>
                {txStatus === 'closed' && (
                  <div className="space-y-3">
                    <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
                      <strong>Note:</strong> This transaction is already closed. Saving with a co-agent will immediately split it into two separate ledger entries — one for each agent. This action cannot be undone.
                    </div>
                    <div className="rounded-md bg-blue-50 border border-blue-200 p-3 space-y-2">
                      <p className="text-xs text-blue-800 font-medium">Retroactive Split</p>
                      <p className="text-xs text-blue-700">If this transaction already has co-agent data saved but was never split (e.g. the split failed silently), click below to manually trigger the split now without re-saving the form.</p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="border-blue-400 text-blue-700 hover:bg-blue-100"
                        onClick={handleTriggerSplit}
                        disabled={triggeringSplit || !coAgentId}
                      >
                        <GitMerge className="mr-2 h-4 w-4" />
                        {triggeringSplit ? 'Splitting...' : 'Split Transaction Now'}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </Section>
          </div>{/* end Step 3 */}

          {/* ── Step 4: Final Details ────────────────────────────────────────────── */}
          <div className={wizardStep !== 4 ? 'hidden' : ''}>
          {/* ── Additional Info ────────────────────────────────────────────────────────────────────── */}
          <Section title="Additional Info">
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
                    <FormControl><Input type="number" step="0.01" placeholder="0" {...field} /></FormControl>
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
                    <FormControl><Input type="number" step="0.01" placeholder="0" {...field} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="buyerBringToClosing" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Buyer will bring to closing ($)</FormLabel>
                    <FormControl><Input type="number" step="0.01" placeholder="0" {...field} /></FormControl>
                  </FormItem>
                )} />
              </Grid2>
            )}
          </Section>

          {/* ── Additional Comments ──────────────────────────── */}
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

          {/* ── Notes (legacy) ────────────────────────────────── */}
          <Section title="Notes">
            <FormField control={form.control} name="notes" render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Textarea
                    placeholder="Special conditions, contingencies, HOA info, key location, anything important..."
                    className="min-h-[100px]"
                    {...field}
                  />
                </FormControl>
              </FormItem>
            )} />
          </Section>

          </div>{/* end Step 4 */}

          {/* ── Sticky Wizard Footer ─────────────────────────────────────── */}
          <div className="sticky bottom-0 left-0 right-0 z-40 bg-background/95 backdrop-blur border-t border-border shadow-lg">
            <div className="max-w-4xl mx-auto flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2">
                {wizardStep > 1 && (
                  <Button type="button" variant="outline" size="lg" onClick={() => setWizardStep(s => s - 1)}>
                    <ChevronLeft className="mr-1 h-4 w-4" /> Back
                  </Button>
                )}
                {wizardStep === 1 && (
                  <Link href="/dashboard/admin/transactions">
                    <Button type="button" variant="ghost" size="lg">Cancel</Button>
                  </Link>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground hidden sm:block">
                  Step {wizardStep} of 4
                </span>
                {wizardStep < 4 ? (
                  <Button type="button" size="lg" onClick={() => setWizardStep(s => s + 1)}>
                    Next <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                ) : (
                  <>
                    <Button type="submit" size="lg" disabled={saving} variant="outline" className="border-green-600 text-green-700 hover:bg-green-50">
                      <Save className="mr-2 h-4 w-4" />
                      {saving ? 'Saving...' : 'Save'}
                    </Button>
                    <Button type="submit" size="lg" disabled={saving} className="bg-green-600 hover:bg-green-700 text-white">
                      <Save className="mr-2 h-4 w-4" />
                      {saving ? 'Saving...' : 'Save Changes'}
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Hidden field */}
          <input type="hidden" {...form.register('agentDisplayName')} />
        </form>
      </Form>
    </div>
  );
}
