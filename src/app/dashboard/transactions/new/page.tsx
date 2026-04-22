'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useRef, useState } from 'react';
import { useUser } from '@/firebase';
import { useEffectiveUser } from '@/hooks/useEffectiveUser';
import { useIsAdminLike } from '@/hooks/useIsAdminLike';
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
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle2, Send, ClipboardList, FileCheck2 } from 'lucide-react';
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
  agentSplitPercent: number;
  companySplitPercent: number;
  transactionFee: number | null;
  capAmount: number | null;
  notes: string;
};

type AgentCommissionData = {
  agentType: string;
  teamGroup: string;
  commissionMode: string;
  tiersSource?: string;
  defaultTransactionFee: number | null;
  tiers: CommissionTier[];
  ytdTierProgressionCompanyDollar?: number;
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
  return num.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: Math.max(decimals, 2),
  });
}

/** Strip commas to get the clean numeric string for the form value */
function parseCurrencyInput(val: string): string {
  return val.replace(/,/g, '');
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
  dealType: z.enum(['residential_sale', 'residential_lease', 'land', 'commercial_sale', 'commercial_lease']),
  address: z.string().min(5, 'Full property address is required'),
  clientName: z.string().min(1, 'Client name is required'),
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

  // Dates — contractDate is now OPTIONAL
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

  // Seller info
  sellerName: z.string().optional(),
  sellerEmail: z.string().email().optional().or(z.literal('')),
  sellerPhone: z.string().optional(),
  seller2Name: z.string().optional(),
  seller2Email: z.string().email().optional().or(z.literal('')),
  seller2Phone: z.string().optional(),

  // Inspections
  inspectionOrdered: z.enum(['yes', 'no']).optional(),
  targetInspectionDate: z.string().optional().or(z.literal('')),
  inspectionTypes: z.array(z.string()).optional(),
  tcScheduleInspections: z.enum(['yes', 'no', 'other']).optional(),
  tcScheduleInspectionsOther: z.string().optional(),
  inspectorName: z.string().optional(),

  // Commission paid by seller
  sellerPayingListingAgent: z.coerce.number().min(0).max(100).optional().or(z.literal('')),
  sellerPayingListingAgentUnknown: z.boolean().optional(),
  sellerPayingBuyerAgent: z.coerce.number().min(0).max(100).optional().or(z.literal('')),

  // Buyer closing cost paid by seller
  buyerClosingCostTotal: z.coerce.number().min(0).optional().or(z.literal('')),
  buyerClosingCostAgentCommission: z.coerce.number().min(0).optional().or(z.literal('')),
  buyerClosingCostTxFee: z.coerce.number().min(0).optional().or(z.literal('')),
  buyerClosingCostHomeWarranty: z.coerce.number().min(0).optional().or(z.literal('')),
  buyerClosingCostOther: z.coerce.number().min(0).optional().or(z.literal('')),

  // Additional info
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
  const [submitted, setSubmitted] = useState(false);
  const [resultId, setResultId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);

  // Draft auto-save
  const DRAFT_KEY = 'sb_add_transaction_draft';
  const [hasDraft, setHasDraft] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);

  // Commission auto-calculation state
  const [agentCommission, setAgentCommission] = useState<AgentCommissionData | null>(null);
  const [commissionLoading, setCommissionLoading] = useState(false);
  const [activeTier, setActiveTier] = useState<CommissionTier | null>(null);
  const commissionManualOverride = useRef(false);

  const { isAdmin: isAdminUser } = useIsAdminLike();
  const isAdmin = isAdminUser && !isImpersonating;

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
      hasCoAgent: false,
      coAgentId: '',
      coAgentDisplayName: '',
      coAgentRole: 'co_list',
      primaryAgentSplitPercent: 50,
      coAgentSplitPercent: 50,
    },
  });

  // Watched values for conditional rendering
  const clientType = form.watch('clientType');
  const watchedClosingType = form.watch('closingType');
  const inspectionOrdered = form.watch('inspectionOrdered');
  const warrantyAtClosing = form.watch('warrantyAtClosing');
  const txComplianceFee = form.watch('txComplianceFee');
  const shortageInCommission = form.watch('shortageInCommission');
  const tcScheduleInspections = form.watch('tcScheduleInspections');
  const occupancyAgreement = form.watch('occupancyAgreement');
  const inspectionTypes = form.watch('inspectionTypes') || [];

  // Seller info is only relevant when NOT purely buyer-side
  // closingType: 'buyer' → hide seller; 'listing' | 'dual' | 'referral' → show seller
  const showSellerInfo = watchedClosingType !== 'buyer';

  // Co-agent watched values
  const hasCoAgent = form.watch('hasCoAgent');
  const watchedPrimaryPct = Number(form.watch('primaryAgentSplitPercent') || 0);
  const watchedCoPct = Number(form.watch('coAgentSplitPercent') || 0);
  const splitTotal = watchedPrimaryPct + watchedCoPct;

  // Watched values for commission auto-calc
  const watchedSalePrice = form.watch('salePrice');
  const watchedCommPct = form.watch('commissionPercent');
  const watchedCBP = form.watch('commissionBasePrice');
  const watchedSellerPayingListing = form.watch('sellerPayingListingAgent');
  const watchedSellerPayingBuyer = form.watch('sellerPayingBuyerAgent');

  const cbpManuallyEdited = useRef(false);
  const commPctManuallyEdited = useRef(false);

  useEffect(() => {
    if (cbpManuallyEdited.current) return;
    const sp = Number(watchedSalePrice) || 0;
    if (sp > 0) form.setValue('commissionBasePrice', sp as any);
  }, [watchedSalePrice]);

  useEffect(() => {
    if (commPctManuallyEdited.current) return;
    const listingPct = Number(watchedSellerPayingListing) || 0;
    const buyerPct = Number(watchedSellerPayingBuyer) || 0;
    let autoPct = 0;
    if (watchedClosingType === 'listing') autoPct = listingPct;
    else if (watchedClosingType === 'buyer') autoPct = buyerPct;
    else if (watchedClosingType === 'dual') autoPct = listingPct + buyerPct;
    if (autoPct > 0) form.setValue('commissionPercent', autoPct as any);
  }, [watchedClosingType, watchedSellerPayingListing, watchedSellerPayingBuyer]);

  useEffect(() => {
    const cbp = Number(watchedCBP) || 0;
    const pct = Number(watchedCommPct) || 0;
    if (cbp > 0 && pct > 0) {
      const calcGCI = resolveGCI({ commissionBasePrice: cbp, commissionPercent: pct });
      form.setValue('gci', calcGCI as any);
    }
  }, [watchedCBP, watchedCommPct]);

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
          if (data.defaultTransactionFee != null) {
            form.setValue('transactionFee', data.defaultTransactionFee as any);
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
    const ytd = agentCommission.ytdTierProgressionCompanyDollar ?? 0;
    const tierLookupAmount = ytd > 0 ? ytd : gci;
    const tier = findActiveTier(agentCommission.tiers, tierLookupAmount);
    setActiveTier(tier);
    if (tier) {
      const agentPct = tier.agentSplitPercent;
      const brokerPct = tier.companySplitPercent;
      const agentNet = Number((gci * (agentPct / 100)).toFixed(2));
      const brokerGci = Number((gci * (brokerPct / 100)).toFixed(2));
      const txFee = tier.transactionFee ?? agentCommission.defaultTransactionFee ?? 0;
      form.setValue('agentPct', agentPct as any);
      form.setValue('brokerPct', brokerPct as any);
      form.setValue('agentDollar', agentNet as any);
      form.setValue('brokerGci', brokerGci as any);
      if (txFee > 0) form.setValue('transactionFee', txFee as any);
    }
  }, [watchedGCI, agentCommission]);

  // Sync additionalComments → notes
  const watchedAdditionalComments = form.watch('additionalComments');
  useEffect(() => {
    form.setValue('notes', watchedAdditionalComments || '');
  }, [watchedAdditionalComments]);

  // Auto-save draft to localStorage every 30 seconds
  useEffect(() => {
    if (submitted) return;
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) setHasDraft(true);
    } catch {}
    const interval = setInterval(() => {
      try {
        const values = form.getValues();
        const hasContent = values.address || values.clientName || values.salePrice;
        if (hasContent) {
          localStorage.setItem(DRAFT_KEY, JSON.stringify({ values, savedAt: Date.now() }));
        }
      } catch {}
    }, 30000);
    return () => clearInterval(interval);
  }, [submitted]);

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

  const discardDraft = () => {
    try { localStorage.removeItem(DRAFT_KEY); } catch {}
    setHasDraft(false);
  };

  const toggleInspectionType = (type: string) => {
    const current = form.getValues('inspectionTypes') || [];
    if (current.includes(type)) {
      form.setValue('inspectionTypes', current.filter((t: string) => t !== type));
    } else {
      form.setValue('inspectionTypes', [...current, type]);
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
      const res = await fetch('/api/tc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(values),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Submission failed');
      setResultId(data.id);
      // Clear draft on successful submit
      try { localStorage.removeItem(DRAFT_KEY); } catch {}
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
            Fill in all relevant details below. Transaction will be submitted to the TC Queue for review before appearing in the ledger.
          </p>
        </div>
        <Badge variant="outline" className="mt-1">
          <ClipboardList className="h-3 w-3 mr-1" /> TC Queue Review
        </Badge>
      </div>

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
              <FormField control={form.control} name="clientName" render={({ field }) => (
                <FormItem>
                  <FormLabel>Client Name <span className="text-destructive">*</span></FormLabel>
                  <FormControl><Input placeholder="Buyer or seller name" {...field} /></FormControl>
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
                  <FormMessage />
                </FormItem>
              )} />
            </Grid2>

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
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            step={0.5}
                            placeholder="50"
                            {...field}
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
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            step={0.5}
                            placeholder="50"
                            {...field}
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
          </Section>

          {/* ═══════════════════════════════════════════════════════════════════
              SECTION 2 — KEY DATES
          ═══════════════════════════════════════════════════════════════════ */}
          <Section title="Key Dates">
            <Grid3>
              <FormField control={form.control} name="listingDate" render={({ field }) => (
                <FormItem><FormLabel>Listing Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl></FormItem>
              )} />
              {/* Under Contract Date — OPTIONAL */}
              <FormField control={form.control} name="contractDate" render={({ field }) => (
                <FormItem>
                  <FormLabel>Under Contract Date</FormLabel>
                  <FormControl><Input type="date" {...field} /></FormControl>
                  <FormDescription>Leave blank if not yet under contract.</FormDescription>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="optionExpiration" render={({ field }) => (
                <FormItem><FormLabel>Option Expiration</FormLabel><FormControl><Input type="date" {...field} /></FormControl></FormItem>
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
          </Section>

          {/* ═══════════════════════════════════════════════════════════════════
              SECTION 3 — BUYER / SELLER INFORMATION
          ═══════════════════════════════════════════════════════════════════ */}
          <Section title="Buyer / Seller Information" description="Select client type to show the appropriate contact fields.">
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
                <FormField control={form.control} name="clientNewAddress" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Client New Address</FormLabel>
                    <FormDescription>Where the seller is moving to (for mailers)</FormDescription>
                    <FormControl><Input placeholder="New address after closing" {...field} /></FormControl>
                  </FormItem>
                )} />
              </>
            )}

            {/* Legacy second contact (shown when no clientType selected) */}
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

          {/* ── Cooperating Agent (hidden for dual) ──────────────────────────── */}
          {watchedClosingType !== 'dual' && (
            <Section title="Cooperating Agent">
              <Grid2>
                <FormField control={form.control} name="otherAgentName" render={({ field }) => (
                  <FormItem><FormLabel>Agent Name</FormLabel><FormControl><Input placeholder="Other agent on this deal" {...field} /></FormControl></FormItem>
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
            </Section>
          )}

          {/* ── Mortgage / Lender ─────────────────────────────────────────── */}
          <Section title="Mortgage / Lender">
            <Grid2>
              <FormField control={form.control} name="mortgageCompany" render={({ field }) => (
                <FormItem><FormLabel>Mortgage Company</FormLabel><FormControl><Input placeholder="First Federal Bank" {...field} /></FormControl></FormItem>
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

          {/* ── Title Company ─────────────────────────────────────────────── */}
          <Section title="Title Company">
            <Grid2>
              <FormField control={form.control} name="titleCompany" render={({ field }) => (
                <FormItem><FormLabel>Title Company</FormLabel><FormControl><Input placeholder="Acadian Title" {...field} /></FormControl></FormItem>
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

          {/* ═══════════════════════════════════════════════════════════════════
              SECTION 4 — FINANCIAL DETAILS
          ═══════════════════════════════════════════════════════════════════ */}
          <Section title="Financial Details">
            <Grid2>
              <FormField control={form.control} name="listPrice" render={({ field }) => (
                <FormItem>
                  <FormLabel>List Price / Buyer Rep Price ($)</FormLabel>
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
          </Section>

          {/* ── Inspections ───────────────────────────────────────────────── */}
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

          {/* ═══════════════════════════════════════════════════════════════════
              SECTION 5 — COMMISSION & FEES
          ═══════════════════════════════════════════════════════════════════ */}
          <Section title="Buyer Closing Cost Paid by Seller">
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
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Breakdown</p>
              <p className="text-xs text-muted-foreground mt-1">This is the buyer closing cost amount the seller is paying toward: buyer agent commission, transaction fee, home warranty, and any other buyer closing costs.</p>
            </div>
            <Grid3>
              <FormField control={form.control} name="buyerClosingCostAgentCommission" render={({ field }) => (
                <FormItem>
                  <FormLabel>Buyer&apos;s Agent Commission ($)</FormLabel>
                  <FormControl>
                    <CurrencyInput value={field.value as any} onChange={(val) => field.onChange(val)} placeholder="0" />
                  </FormControl>
                </FormItem>
              )} />
              <FormField control={form.control} name="buyerClosingCostTxFee" render={({ field }) => (
                <FormItem>
                  <FormLabel>Transaction Fee ($)</FormLabel>
                  <FormControl>
                    <CurrencyInput value={field.value as any} onChange={(val) => field.onChange(val)} placeholder="0" />
                  </FormControl>
                </FormItem>
              )} />
              <FormField control={form.control} name="buyerClosingCostHomeWarranty" render={({ field }) => (
                <FormItem>
                  <FormLabel>Home Warranty ($)</FormLabel>
                  <FormControl>
                    <CurrencyInput value={field.value as any} onChange={(val) => field.onChange(val)} placeholder="0" />
                  </FormControl>
                </FormItem>
              )} />
              <FormField control={form.control} name="buyerClosingCostOther" render={({ field }) => (
                <FormItem>
                  <FormLabel>All Other Buyer&apos;s Closing Costs ($)</FormLabel>
                  <FormControl>
                    <CurrencyInput value={field.value as any} onChange={(val) => field.onChange(val)} placeholder="0" />
                  </FormControl>
                </FormItem>
              )} />
            </Grid3>

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

            {/* Agent view: Agent Net $ only (read-only) — GCI, Broker %, Broker GCI, Agent % are hidden from agents */}
            {!isAdmin && (
              <>
                <Separator />
                <div className="max-w-xs">
                  <FormField control={form.control} name="agentDollar" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Agent Net $</FormLabel>
                      <FormControl>
                        <CurrencyInput
                          value={field.value as any}
                          onChange={(val) => field.onChange(val)}
                          placeholder="Auto-calculated"
                          readOnly
                          className="bg-background cursor-default"
                        />
                      </FormControl>
                      <FormDescription>Calculated from your commission profile and tier.</FormDescription>
                    </FormItem>
                  )} />
                </div>
              </>
            )}

            {/* Admin: GCI & Commission % */}
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
                          type="number" inputMode="decimal" step="0.01" placeholder="3"
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
                      <FormControl>
                        <CurrencyInput
                          value={field.value as any}
                          onChange={(val) => field.onChange(val)}
                          placeholder="0"
                        />
                      </FormControl>
                      <FormDescription>Gross Commission Income</FormDescription>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="transactionFee" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Transaction Fee ($)</FormLabel>
                      <FormControl>
                        <CurrencyInput
                          value={field.value as any}
                          onChange={(val) => field.onChange(val)}
                          placeholder="0"
                        />
                      </FormControl>
                    </FormItem>
                  )} />
                </Grid3>
              </>
            )}

            {/* Commission Split (Admin) */}
            {isAdmin && (
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
                          const tier = findActiveTier(agentCommission.tiers, gci);
                          setActiveTier(tier);
                          if (tier) {
                            form.setValue('agentPct', tier.agentSplitPercent as any);
                            form.setValue('brokerPct', tier.companySplitPercent as any);
                            form.setValue('agentDollar', Number((gci * (tier.agentSplitPercent / 100)).toFixed(2)) as any);
                            form.setValue('brokerGci', Number((gci * (tier.companySplitPercent / 100)).toFixed(2)) as any);
                            const txFee = tier.transactionFee ?? agentCommission.defaultTransactionFee ?? 0;
                            if (txFee > 0) form.setValue('transactionFee', txFee as any);
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
                        <Input type="number" inputMode="decimal" step="0.01" placeholder="30" {...field}
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
                        <Input type="number" inputMode="decimal" step="0.01" placeholder="70" {...field}
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
                  const brokerGci = Number(form.watch('brokerGci')) || 0;
                  const txFee = Number(form.watch('transactionFee')) || 0;
                  if (gci <= 0) return null;
                  const agentNet = agentDollar - txFee;
                  const agentPct = gci > 0 ? Math.round((agentDollar / gci) * 100) : 0;
                  const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n);
                  return (
                    <div className="mt-4 rounded-xl border-2 border-green-300 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 dark:border-green-700 p-4">
                      <p className="text-xs font-bold text-green-700 dark:text-green-400 uppercase tracking-wider mb-3">💰 Your Estimated Earnings on This Deal</p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="text-center">
                          <p className="text-xs text-muted-foreground mb-0.5">Gross Commission</p>
                          <p className="text-lg font-black text-foreground">{fmt(gci)}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-muted-foreground mb-0.5">Your Split ({agentPct}%)</p>
                          <p className="text-lg font-black text-foreground">{fmt(agentDollar)}</p>
                        </div>
                        {txFee > 0 && (
                          <div className="text-center">
                            <p className="text-xs text-muted-foreground mb-0.5">Transaction Fee</p>
                            <p className="text-lg font-black text-red-600">-{fmt(txFee)}</p>
                          </div>
                        )}
                        <div className="text-center bg-green-100 dark:bg-green-900/40 rounded-lg p-2">
                          <p className="text-xs font-bold text-green-700 dark:text-green-400 mb-0.5">You Take Home</p>
                          <p className="text-xl font-black text-green-700 dark:text-green-300">{fmt(agentNet)}</p>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </>
            )}
          </Section>

          {/* ═══════════════════════════════════════════════════════════════════
              SECTION 6 — ADDITIONAL INFO / COMMENTS
          ═══════════════════════════════════════════════════════════════════ */}
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
          </Section>

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
    </div>
  );
}
