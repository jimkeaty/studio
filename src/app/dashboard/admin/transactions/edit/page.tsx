'use client';
// Full-edit transaction page — mirrors Add Transaction form exactly.
// Opened from Transaction Ledger via /dashboard/admin/transactions/edit?id=<txId>
// Saves directly via PATCH /api/admin/transactions (no TC Queue).

import { useEffect, useRef, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useUser } from '@/firebase';
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
import { ArrowLeft, Save, AlertTriangle } from 'lucide-react';
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
};

function findActiveTier(tiers: CommissionTier[], gci: number): CommissionTier | null {
  for (const tier of tiers) {
    const from = tier.fromCompanyDollar;
    const to = tier.toCompanyDollar;
    if (gci >= from && (to === null || gci < to)) return tier;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Schema — identical to Add Transaction form
// ─────────────────────────────────────────────────────────────────────────────
const schema = z.object({
  agentId: z.string().min(1, 'Agent is required'),
  agentDisplayName: z.string().min(1),
  status: z.enum(['pending', 'under_contract', 'closed', 'cancelled']).optional(),
  closingType: z.enum(['buyer', 'listing', 'referral', 'dual'], { required_error: 'Type of closing is required' }),
  dealType: z.enum(['residential_sale', 'residential_lease', 'land', 'commercial_sale', 'commercial_lease']),
  address: z.string().min(5, 'Full property address is required'),
  clientName: z.string().min(1, 'Client name is required'),
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
  contractDate: z.string().min(1, 'Under contract date is required'),
  optionExpiration: z.string().optional().or(z.literal('')),
  inspectionDeadline: z.string().optional().or(z.literal('')),
  surveyDeadline: z.string().optional().or(z.literal('')),
  projectedCloseDate: z.string().optional().or(z.literal('')),
  closedDate: z.string().optional().or(z.literal('')),
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
  sellerName: z.string().optional(),
  sellerEmail: z.string().email().optional().or(z.literal('')),
  sellerPhone: z.string().optional(),
  seller2Name: z.string().optional(),
  seller2Email: z.string().email().optional().or(z.literal('')),
  seller2Phone: z.string().optional(),
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
  const { isAdmin } = useIsAdminLike();
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const txId = searchParams.get('id');

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [agentCommission, setAgentCommission] = useState<AgentCommissionData | null>(null);
  const [commissionLoading, setCommissionLoading] = useState(false);
  const [activeTier, setActiveTier] = useState<CommissionTier | null>(null);
  const commissionManualOverride = useRef(false);
  const cbpManuallyEdited = useRef(false);
  const commPctManuallyEdited = useRef(false);

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

  // Reset CBP + commPct locks when deal type or closing type changes
  useEffect(() => {
    cbpManuallyEdited.current = false;
    commPctManuallyEdited.current = false;
  }, [watchedClosingType, watchedDealType]);

  // Auto-fill commissionBasePrice from salePrice when not manually overridden
  useEffect(() => {
    if (cbpManuallyEdited.current) return;
    const sp = Number(watchedSalePrice) || 0;
    if (sp > 0) form.setValue('commissionBasePrice', sp as any);
  }, [watchedSalePrice]);

  // Auto-assign commissionPercent from seller-paying % based on deal side
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

  // Auto-calculate GCI when commissionBasePrice × commissionPercent both set
  useEffect(() => {
    const cbp = Number(watchedCBP) || 0;
    const pct = Number(watchedCommPct) || 0;
    if (cbp > 0 && pct > 0) {
      const calcGCI = resolveGCI({ commissionBasePrice: cbp, commissionPercent: pct });
      form.setValue('gci', calcGCI as any);
    }
  }, [watchedCBP, watchedCommPct]);

  // Auto-calculate commission split when GCI or agent commission profile changes
  useEffect(() => {
    if (!agentCommission || commissionManualOverride.current) return;
    const gci = Number(watchedGCI) || 0;
    if (gci <= 0) { setActiveTier(null); return; }
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
  }, [watchedGCI, agentCommission]);

  // When agent changes and commission profile loads, re-run split calc with current GCI
  // (agentCommission change above handles this, but we also need to re-trigger CBP→GCI
  // in case the agent change doesn't change GCI but the tier structure is different)
  useEffect(() => {
    if (!agentCommission || commissionManualOverride.current) return;
    const gci = Number(form.getValues('gci')) || 0;
    if (gci <= 0) return;
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
          sellerName: tx.sellerName || '',
          sellerEmail: tx.sellerEmail || '',
          sellerPhone: tx.sellerPhone || '',
          seller2Name: tx.seller2Name || '',
          seller2Email: tx.seller2Email || '',
          seller2Phone: tx.seller2Phone || '',
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
        payload.splitSnapshot = {
          grossCommission: gci,
          agentNetCommission: agentDollar || null,
          companyRetained: brokerGci,
          agentSplitPercent: agentPct || null,
          companySplitPercent: brokerPct || null,
        };
        payload.commission = gci;
        payload.brokerProfit = brokerGci;
      }

      const res = await fetch('/api/admin/transactions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Save failed');

      toast({ title: 'Transaction saved', description: 'All changes have been saved to the ledger.' });
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
                <FormItem><FormLabel>Option Period Expiration</FormLabel><FormControl><Input type="date" {...field} /></FormControl></FormItem>
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
                  <FormLabel>Status</FormLabel>
                  <Select value={field.value || ''} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Auto (based on close date)" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="under_contract">Under Contract</SelectItem>
                      <SelectItem value="closed">Closed</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>Override status manually, or leave blank to auto-detect from close date.</FormDescription>
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
          {/* ── Client Info ─────────────────────────────────── */}
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
          </Section>}

          {/* ── Mortgage / Lender ──────────────────────────────────────────── */}
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

          {/* ── Title Company ──────────────────────────────────── */}
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

          {/* ── Inspections ────────────────────────────────────── */}
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
            <Separator />
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Breakdown</p>
              <p className="text-xs text-muted-foreground mt-1">This is the buyer closing cost amount the seller is paying toward the following: buyer agent commission, transaction fee, home warranty, and any other buyer closing costs.</p>
            </div>
            <Grid3>
              <FormField control={form.control} name="buyerClosingCostAgentCommission" render={({ field }) => (
                <FormItem>
                  <FormLabel>Buyer&apos;s Agent Commission ($)</FormLabel>
                  <FormControl><Input type="number" step="0.01" placeholder="0" {...field} /></FormControl>
                </FormItem>
              )} />
              <FormField control={form.control} name="buyerClosingCostTxFee" render={({ field }) => (
                <FormItem>
                  <FormLabel>Transaction Fee ($)</FormLabel>
                  <FormControl><Input type="number" step="0.01" placeholder="0" {...field} /></FormControl>
                </FormItem>
              )} />
              <FormField control={form.control} name="buyerClosingCostOther" render={({ field }) => (
                <FormItem>
                  <FormLabel>All Other Buyer&apos;s Closing Costs ($)</FormLabel>
                  <FormControl><Input type="number" step="0.01" placeholder="0" {...field} /></FormControl>
                </FormItem>
              )} />
            </Grid3>
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
                {/* Auto-calculation status banner */}
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
                          {activeTier.transactionFee != null && ` / Fee $${activeTier.transactionFee}`}
                        </span>
                        {commissionManualOverride.current && (
                          <Badge variant="outline" className="text-amber-700 border-amber-300">Manual Override</Badge>
                        )}
                      </div>
                    ) : (
                      <span>
                        Commission structure loaded ({agentCommission.tiers.length} tier{agentCommission.tiers.length !== 1 ? 's' : ''}).
                        {Number(watchedGCI) > 0 ? ' No matching tier for this GCI amount.' : ' Enter GCI to auto-calculate split.'}
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
                        <Input type="number" step="0.01" placeholder="30" {...field}
                          onChange={(e) => { commissionManualOverride.current = true; field.onChange(e); }}
                        />
                      </FormControl>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="brokerGci" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Broker GCI ($)</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" placeholder="0" {...field}
                          onChange={(e) => { commissionManualOverride.current = true; field.onChange(e); }}
                        />
                      </FormControl>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="agentPct" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Agent %</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" placeholder="70" {...field}
                          onChange={(e) => { commissionManualOverride.current = true; field.onChange(e); }}
                        />
                      </FormControl>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="agentDollar" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Agent Net $</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" placeholder="0" {...field}
                          onChange={(e) => { commissionManualOverride.current = true; field.onChange(e); }}
                        />
                      </FormControl>
                      <FormDescription>Auto-calculated from agent profile. Edit to override.</FormDescription>
                    </FormItem>
                  )} />
                </Grid2>
              </>
            )}
          </Section>

          {/* ── Additional Info ───────────────────────────────── */}
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

          {/* ── Save ───────────────────────────────────────────── */}
          <div className="flex items-center gap-4 pb-8">
            <Button type="submit" size="lg" disabled={saving}>
              <Save className="mr-2 h-4 w-4" />
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
            <Link href="/dashboard/admin/transactions">
              <Button type="button" variant="outline" size="lg">Cancel</Button>
            </Link>
            <p className="text-sm text-muted-foreground">
              Changes save directly to the ledger.
            </p>
          </div>

          {/* Hidden field */}
          <input type="hidden" {...form.register('agentDisplayName')} />
        </form>
      </Form>
    </div>
  );
}
