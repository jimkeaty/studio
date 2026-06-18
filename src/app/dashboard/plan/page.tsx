"use client";

import { useState, useEffect, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/firebase";
import { useEffectiveUser } from "@/hooks/useEffectiveUser";
import { defaultAssumptions } from "@/lib/plan-assumptions";
import type { BusinessPlan, PlanAssumptions, PlanTargets } from "@/lib/types";
import {
  Calendar,
  Phone,
  Users,
  FileText,
  CheckCircle,
  DollarSign,
  Target,
  Percent,
  TrendingUp,
  Award,
  CalendarCheck,
  Sailboat,
  Zap,
  BookOpen,
  ArrowDownToLine,
  BarChart3,
  Save,
  ChevronDown,
  ChevronUp,
  UserPlus,
  Layers,
  RefreshCw,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Info } from "lucide-react";

type SeasonalityMonth = { month: number; label: string; volumePct: number; salesPct: number };
type HistoricalStats = {
  year: number;
  hasData: boolean;
  closedUnits: number;
  netEarned: number;
  totalVolume: number;
  totalGCI: number;
  avgNetCommission: number | null;
  avgSalePrice: number | null;
  avgCommissionPct: number | null; // GCI / Volume %
  avgNetPct: number | null;        // agent net / GCI %
  seasonality: SeasonalityMonth[];
  allTimeSeasonality: SeasonalityMonth[];
  allTimeHasData: boolean;
  activityTotals: {
    calls: number;
    engagements: number;
    appointmentsSet: number;
    appointmentsHeld: number;
    contractsWritten: number;
    closings: number;
  };
  conversionRates: {
    callToEngagement: number | null;
    engagementToAppointmentSet: number | null;
    appointmentSetToHeld: number | null;
    appointmentHeldToContract: number | null;
    contractToClosing: number | null;
  };
};

const planFormSchema = z.object({
  annualIncomeGoal: z.coerce.number().min(0, "Goal must be positive."),
  planStartDate: z.string().optional(),
  resetStartDate: z.string().optional(),
  avgCommission: z.coerce.number().min(0, "Commission must be positive."),
  workingDaysPerMonth: z.coerce.number().int().min(1, "Must be at least 1.").max(31, "Cannot exceed 31."),
  weeksOff: z.coerce.number().int().min(0, "Cannot be negative.").max(52, "Cannot exceed 52."),
  conversions: z.object({
    callToEngagement: z.coerce.number().min(0).max(100),
    engagementToAppointmentSet: z.coerce.number().min(0).max(100),
    appointmentSetToHeld: z.coerce.number().min(0).max(100),
    appointmentHeldToContract: z.coerce.number().min(0).max(100),
    contractToClosing: z.coerce.number().min(0).max(100),
  }),
});
type PlanFormValues = z.infer<typeof planFormSchema>;

const calculatePlan = (incomeGoal: number, assumptions: PlanAssumptions): BusinessPlan["calculatedTargets"] => {
  const { conversionRates, avgCommission, workingDaysPerMonth, weeksOff } = assumptions;

  const emptyTargets: PlanTargets = { yearly: 0, monthly: 0, weekly: 0, daily: 0 };

  if (incomeGoal <= 0 || avgCommission <= 0) {
    return {
      monthlyNetIncome: 0,
      closings: emptyTargets,
      contractsWritten: emptyTargets,
      appointmentsHeld: emptyTargets,
      appointmentsSet: emptyTargets,
      engagements: emptyTargets,
      calls: emptyTargets,
    };
  }

  const yearlyClosings = incomeGoal / avgCommission;
  if (yearlyClosings <= 0) {
    return {
      monthlyNetIncome: 0,
      closings: emptyTargets,
      contractsWritten: emptyTargets,
      appointmentsHeld: emptyTargets,
      appointmentsSet: emptyTargets,
      engagements: emptyTargets,
      calls: emptyTargets,
    };
  }

  const yearlyContracts = yearlyClosings / (conversionRates.contractToClosing > 0 ? conversionRates.contractToClosing : 1);
  const yearlyAppointmentsHeld =
    yearlyContracts / (conversionRates.appointmentHeldToContract > 0 ? conversionRates.appointmentHeldToContract : 1);
  const yearlyAppointmentsSet =
    yearlyAppointmentsHeld / (conversionRates.appointmentSetToHeld > 0 ? conversionRates.appointmentSetToHeld : 1);
  const yearlyEngagements =
    yearlyAppointmentsSet / (conversionRates.engagementToAppointmentSet > 0 ? conversionRates.engagementToAppointmentSet : 1);
  const yearlyCalls = yearlyEngagements / (conversionRates.callToEngagement > 0 ? conversionRates.callToEngagement : 1);

  const workingWeeksInYear = 52 - (weeksOff || 0);
  const workingDaysInYear = workingDaysPerMonth * 12 - (weeksOff || 0) * 5;

  const createTargets = (yearlyValue: number): PlanTargets => {
    if (yearlyValue <= 0 || !isFinite(yearlyValue)) return emptyTargets;

    const monthly = yearlyValue / 12;
    const weekly = workingWeeksInYear > 0 ? yearlyValue / workingWeeksInYear : 0;
    const daily = workingDaysInYear > 0 ? yearlyValue / workingDaysInYear : 0;

    // Store raw fractional values for daily/weekly so the dashboard API can multiply
    // by elapsed workdays and get an accurate YTD target (e.g. 0.228 appts/day × 135 days = 31).
    // Rounding to whole numbers happens at display time, not here.
    // yearly and monthly are rounded up for display in the business plan table.
    return {
      yearly: Math.ceil(yearlyValue),
      monthly: Math.ceil(monthly),
      weekly: weekly <= 0 ? 0 : weekly,
      daily: daily <= 0 ? 0 : daily,
    };
  };

  return {
    monthlyNetIncome: incomeGoal / 12,
    closings: createTargets(yearlyClosings),
    contractsWritten: createTargets(yearlyContracts),
    appointmentsHeld: createTargets(yearlyAppointmentsHeld),
    appointmentsSet: createTargets(yearlyAppointmentsSet),
    engagements: createTargets(yearlyEngagements),
    calls: createTargets(yearlyCalls),
  };
};

const PlanSkeleton = () => (
  <div className="space-y-8">
    <div>
      <Skeleton className="h-9 w-1/2" />
      <Skeleton className="h-5 w-1/3 mt-2" />
    </div>
    <Card>
      <CardContent className="p-6">
        <Skeleton className="h-24 w-full" />
      </CardContent>
    </Card>
    <Card>
      <CardContent className="p-6">
        <Skeleton className="h-40 w-full" />
      </CardContent>
    </Card>
  </div>
);

const PlanResultCard = ({
  icon: Icon,
  label,
  value,
  unit,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  unit?: string;
}) => (
  <div className="flex items-center gap-4 rounded-lg border p-4">
    <Icon className="h-8 w-8 text-muted-foreground" />
    <div>
      <p className="text-sm font-medium">{label}</p>
      <p className="text-2xl font-bold">
        {value} {unit && <span className="text-sm font-normal">{unit}</span>}
      </p>
    </div>
  </div>
);

type PlanGetResponse = { ok: boolean; plan?: any; error?: string };
type PlanPostResponse = { ok: boolean; plan?: any; error?: string };

async function fetchPlan(year: string, token: string, viewAs?: string | null): Promise<PlanGetResponse> {
  const params = new URLSearchParams({ year });
  if (viewAs) params.set('viewAs', viewAs);
  const res = await fetch(`/api/plan?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  return res.json();
}

async function savePlan(year: string, plan: any, token: string, viewAs?: string | null): Promise<PlanPostResponse> {
  const res = await fetch(`/api/plan`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ year, plan, ...(viewAs ? { viewAs } : {}) }),
  });
  return res.json();
}

export default function BusinessPlanPage() {
  const { user, loading: userLoading } = useUser();
  const { effectiveUid, isImpersonating, impersonatedAgent } = useEffectiveUser();
  const { toast } = useToast();

  const [year, setYear] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [resetNote, setResetNote] = useState('');
  const [isResetting, setIsResetting] = useState(false);

  const handleSelfReset = async () => {
    if (!user) return;
    setIsResetting(true);
    try {
      const token = await user.getIdToken();
      const body: Record<string, string> = {};
      if (resetNote) body.note = resetNote;
      const res = await fetch('/api/plan/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Reset failed'); }
      toast({ title: 'Plan Reset', description: 'Your business plan has been reset to start from today. Your goals remain the same.' });
      setShowResetDialog(false);
      setResetNote('');
    } catch (e: any) {
      toast({ title: 'Reset Failed', description: e.message, variant: 'destructive' });
    } finally { setIsResetting(false); }
  };
  const [calculatedPlan, setCalculatedPlan] = useState<BusinessPlan["calculatedTargets"] | null>(null);
  const [historicalStats, setHistoricalStats] = useState<HistoricalStats | null>(null);
  const [histLoading, setHistLoading] = useState(false);

  // Brokerage-wide seasonality (fetched once on load, available to all agents)
  type BrokerageSeasonality = { month: number; label: string; salesPct: number; volumePct: number };
  const [brokerageSeasonality, setBrokerageSeasonality] = useState<BrokerageSeasonality[] | null>(null);
  const [brokerageSeasonalityYear, setBrokerageSeasonalityYear] = useState<number | null>(null);

  // Monthly Goals state
  const [monthlyGoals, setMonthlyGoals] = useState<Record<number, { margin: string; volume: string; sales: string }>>({});
  const [seasonWeights, setSeasonWeights] = useState<Record<number, { salesPct: string; volumePct: string }>>(() => {
    const sw: Record<number, { salesPct: string; volumePct: string }> = {};
    for (let m = 1; m <= 12; m++) sw[m] = { salesPct: '8.33', volumePct: '8.33' };
    return sw;
  });
  const [goalSegment, setGoalSegment] = useState('');
  const [isSavingGoals, setIsSavingGoals] = useState(false);
  const [goalsOpen, setGoalsOpen] = useState(true);
  const [growthTarget, setGrowthTarget] = useState<number | 'other' | null>(null);

  // ── Recruiting Income Pillar state ──────────────────────────────────────
  // Industry standard: ~25% of direct recruits will also recruit 1-2 others (Tier 2)
  const INDUSTRY_TIER2_RATE = 0.25; // 25% of direct recruits also recruit someone
  const INDUSTRY_TIER2_AVG = 1.5;   // avg number of Tier 2 recruits per Tier 1 who recruits

  const [recruitingGoalIncome, setRecruitingGoalIncome] = useState('');
  const [recruitingConfig, setRecruitingConfig] = useState<{ tier1PayoutAmount: number; tier2PayoutAmount: number; gciThreshold: number; enabled: boolean } | null>(null);
  const [recruitingActual, setRecruitingActual] = useState<{ totalAnnualIncome: number; tier1QualifiedCount: number; tier2QualifiedCount: number } | null>(null);
  const [recruitingPillarOpen, setRecruitingPillarOpen] = useState(false);
  const [customGrowthPct, setCustomGrowthPct] = useState('');
  const [yearlyVolume, setYearlyVolume] = useState('');
  const [yearlySales, setYearlySales] = useState('');
  const [yearlyIncome, setYearlyIncome] = useState('');
  const [isNewAgent, setIsNewAgent] = useState(false);
  const [gracePeriodMonths, setGracePeriodMonths] = useState(3);

  const form = useForm<PlanFormValues>({
    resolver: zodResolver(planFormSchema),
    defaultValues: {
      annualIncomeGoal: 100000,
      planStartDate: "",
      resetStartDate: "",
      avgCommission: defaultAssumptions.avgCommission,
      workingDaysPerMonth: defaultAssumptions.workingDaysPerMonth,
      weeksOff: defaultAssumptions.weeksOff,
      conversions: {
        callToEngagement: defaultAssumptions.conversionRates.callToEngagement * 100,
        engagementToAppointmentSet: defaultAssumptions.conversionRates.engagementToAppointmentSet * 100,
        appointmentSetToHeld: defaultAssumptions.conversionRates.appointmentSetToHeld * 100,
        appointmentHeldToContract: defaultAssumptions.conversionRates.appointmentHeldToContract * 100,
        contractToClosing: defaultAssumptions.conversionRates.contractToClosing * 100,
      },
    },
  });

  useEffect(() => {
    setYear(String(new Date().getFullYear()));
  }, []);

  const handleCalculate = useCallback(() => {
    const data = form.getValues();
    if (!data.conversions) return;

    const assumptions: PlanAssumptions = {
      avgCommission: data.avgCommission,
      workingDaysPerMonth: data.workingDaysPerMonth,
      weeksOff: data.weeksOff,
      conversionRates: {
        callToEngagement: data.conversions.callToEngagement / 100,
        engagementToAppointmentSet: data.conversions.engagementToAppointmentSet / 100,
        appointmentSetToHeld: data.conversions.appointmentSetToHeld / 100,
        appointmentHeldToContract: data.conversions.appointmentHeldToContract / 100,
        contractToClosing: data.conversions.contractToClosing / 100,
      },
    };

    const newCalculatedTargets = calculatePlan(data.annualIncomeGoal, assumptions);
    setCalculatedPlan(newCalculatedTargets);
  }, [form]);

  // ── Sync volume & sales from calculatedPlan ─────────────────────────────
  useEffect(() => {
    if (!calculatedPlan) return;
    const closings = calculatedPlan.closings.yearly || 0;
    const income = form.getValues('annualIncomeGoal') || 0;
    const asp = historicalStats?.avgSalePrice ?? 0;
    // Volume = closings × avg sale price (fall back to income / avgCommPct if no price data)
    const vol = asp > 0
      ? Math.round(closings * asp)
      : avgCommPct > 0
        ? Math.round(income / (avgCommPct / 100))
        : 0;
    setYearlyIncome(String(income));
    if (vol > 0) setYearlyVolume(String(vol));
    if (closings > 0) setYearlySales(String(closings));
  }, [calculatedPlan]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Monthly Goals helpers ────────────────────────────────────────────────
  const fmtCurrencyCompact = (v: number) => {
    if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
    return `$${v.toLocaleString()}`;
  };

  const avgSalePrice = historicalStats?.avgSalePrice ?? 0;
  const avgCommPct = historicalStats?.avgCommissionPct ?? 0;
  const avgNetPct = historicalStats?.avgNetPct ?? 0;

  // Goal-year assumption inputs (live in Advanced Assumptions, pre-filled from historical data)
  const [goalAvgSalePrice, setGoalAvgSalePrice] = useState(0);
  const [goalAvgCommPct, setGoalAvgCommPct] = useState(0);
  const [goalAvgNetPct, setGoalAvgNetPct] = useState(0);
  const [loadingLiveCommission, setLoadingLiveCommission] = useState(false);

  // Pre-fill goal assumptions from historical stats when they load
  useEffect(() => {
    if (!historicalStats) return;
    if (historicalStats.avgSalePrice) setGoalAvgSalePrice(historicalStats.avgSalePrice);
    if (historicalStats.avgCommissionPct) setGoalAvgCommPct(historicalStats.avgCommissionPct);
    // avgNetPct pre-fill — will be overwritten by live commission fetch below
    if (historicalStats.avgNetPct) setGoalAvgNetPct(historicalStats.avgNetPct);
  }, [historicalStats]);

  // Fetch live commission structure and compute effective avg net %
  const fetchLiveCommission = useCallback(async () => {
    if (!user) return;
    const agentId = isImpersonating && effectiveUid ? effectiveUid : user.uid;
    setLoadingLiveCommission(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/agent-profiles/${agentId}/commission`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      // Compute effective avg net % from tiers
      // Use the agent's current YTD GCI to determine which tier they are in,
      // or use the first tier as the baseline if no YTD data
      // API returns agentSplitPercent (not agentPct) and company-dollar thresholds
      const tiers: Array<{ agentSplitPercent?: number; agentPct?: number; fromCompanyDollar?: number; minGci?: number }> = data.tiers ?? [];
      if (tiers.length > 0) {
        const ytdGci: number = data.ytdTierProgressionGci ?? 0;
        // Find the active tier based on YTD GCI vs tier thresholds
        let activeTier = tiers[0];
        for (const tier of tiers) {
          const min = tier.fromCompanyDollar ?? tier.minGci ?? 0;
          if (ytdGci >= min) activeTier = tier;
        }
        // Support both field names from different commission plan shapes
        const liveNetPct = activeTier.agentSplitPercent ?? activeTier.agentPct ?? 0;
        if (liveNetPct > 0) {
          setGoalAvgNetPct(liveNetPct);
          // Compute dollar avg net and sync to the Advanced Assumptions avgCommission field
          const commPct = goalAvgCommPct > 0 ? goalAvgCommPct : avgCommPct;
          const asp = goalAvgSalePrice > 0 ? goalAvgSalePrice : avgSalePrice;
          if (asp > 0 && commPct > 0) {
            const liveAvgNet = Math.round(asp * (commPct / 100) * (liveNetPct / 100));
            form.setValue('avgCommission', liveAvgNet);
            handleCalculate();
          }
          toast({ title: 'Live Commission Loaded', description: `Active tier: ${liveNetPct}% agent net (based on $${ytdGci.toLocaleString()} YTD GCI)` });
        } else {
          toast({ variant: 'destructive', title: 'Could not read commission tier', description: 'No agent split percentage found in commission plan.' });
        }
      }
    } catch {
      toast({ variant: 'destructive', title: 'Failed to load live commission' });
    } finally {
      setLoadingLiveCommission(false);
    }
  }, [user, isImpersonating, effectiveUid, avgCommPct, avgSalePrice, goalAvgCommPct, goalAvgSalePrice, form, handleCalculate, toast]);

  const handleVolumeChange = (val: string) => {
    setYearlyVolume(val);
    const vol = parseFloat(val) || 0;
    const asp = goalAvgSalePrice > 0 ? goalAvgSalePrice : avgSalePrice;
    const commPct = goalAvgCommPct > 0 ? goalAvgCommPct : avgCommPct;
    const netPct = goalAvgNetPct > 0 ? goalAvgNetPct : avgNetPct;
    if (vol > 0 && asp > 0) setYearlySales(String(Math.round(vol / asp)));
    if (vol > 0 && commPct > 0 && netPct > 0) {
      const totalGCI = vol * (commPct / 100);
      setYearlyIncome(String(Math.round(totalGCI * (netPct / 100))));
    }
    setTimeout(distributeGoals, 50);
  };

  const handleSalesChange = (val: string) => {
    setYearlySales(val);
    const sales = parseInt(val, 10) || 0;
    const asp = goalAvgSalePrice > 0 ? goalAvgSalePrice : avgSalePrice;
    const commPct = goalAvgCommPct > 0 ? goalAvgCommPct : avgCommPct;
    const netPct = goalAvgNetPct > 0 ? goalAvgNetPct : avgNetPct;
    if (sales > 0 && asp > 0) {
      const calcVol = Math.round(sales * asp);
      setYearlyVolume(String(calcVol));
      if (commPct > 0 && netPct > 0) {
        setYearlyIncome(String(Math.round(calcVol * (commPct / 100) * (netPct / 100))));
      }
    }
    setTimeout(distributeGoals, 50);
  };

  const handleGoalIncomeChange = (val: string) => {
    setYearlyIncome(val);
    const income = parseFloat(val) || 0;
    const asp = goalAvgSalePrice > 0 ? goalAvgSalePrice : avgSalePrice;
    const commPct = goalAvgCommPct > 0 ? goalAvgCommPct : avgCommPct;
    const netPct = goalAvgNetPct > 0 ? goalAvgNetPct : avgNetPct;
    if (income > 0 && netPct > 0 && commPct > 0) {
      const calcVol = Math.round(income / ((commPct / 100) * (netPct / 100)));
      setYearlyVolume(String(calcVol));
      if (asp > 0) setYearlySales(String(Math.round(calcVol / asp)));
    }
    setTimeout(distributeGoals, 50);
  };

  const distributeGoals = useCallback(() => {
    const vol = parseFloat(yearlyVolume) || 0;
    const sales = parseInt(yearlySales, 10) || 0;
    const income = parseFloat(yearlyIncome) || 0;
    const newGoals: typeof monthlyGoals = {};
    for (let m = 1; m <= 12; m++) {
      const sw = seasonWeights[m];
      const volPct = parseFloat(sw?.volumePct) || 8.33;
      const salesPct = parseFloat(sw?.salesPct) || 8.33;
      newGoals[m] = {
        volume: vol > 0 ? String(Math.round(vol * (volPct / 100))) : '',
        sales: sales > 0 ? String(Math.round(sales * (salesPct / 100))) : '',
        margin: income > 0 ? String(Math.round(income * (salesPct / 100))) : '',
      };
    }
    setMonthlyGoals(newGoals);
  }, [yearlyVolume, yearlySales, yearlyIncome, seasonWeights, setMonthlyGoals]);

  const applySeasonality = (source: 'lastYear' | 'allTime' | 'brokerage' | 'even') => {
    const sw: typeof seasonWeights = {};
    for (let m = 1; m <= 12; m++) {
      if (source === 'even') {
        sw[m] = { salesPct: '8.33', volumePct: '8.33' };
      } else if (source === 'lastYear' && historicalStats?.seasonality) {
        const s = historicalStats.seasonality[m - 1];
        sw[m] = { salesPct: String(s?.salesPct ?? 8.33), volumePct: String(s?.volumePct ?? 8.33) };
      } else if (source === 'allTime' && historicalStats?.allTimeSeasonality) {
        const s = historicalStats.allTimeSeasonality[m - 1];
        sw[m] = { salesPct: String(s?.salesPct ?? 8.33), volumePct: String(s?.volumePct ?? 8.33) };
      } else if (source === 'brokerage' && brokerageSeasonality) {
        const s = brokerageSeasonality[m - 1];
        sw[m] = { salesPct: String(s?.salesPct ?? 8.33), volumePct: String(s?.volumePct ?? 8.33) };
      } else {
        // Fallback to even if source data not available
        sw[m] = { salesPct: '8.33', volumePct: '8.33' };
      }
    }
    setSeasonWeights(sw);
    setTimeout(distributeGoals, 50);
  };

  const saveMonthlyGoals = async () => {
    if (!user || !goalSegment) return;
    setIsSavingGoals(true);
    try {
      const token = await user.getIdToken();
      const promises = [];
      for (let m = 1; m <= 12; m++) {
        const g = monthlyGoals[m];
        if (!g) continue;
        promises.push(
          fetch('/api/broker/goals', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              year: parseInt(year, 10),
              month: m,
              segment: goalSegment,
              grossMarginGoal: g.margin ? parseFloat(g.margin) : null,
              volumeGoal: g.volume ? parseFloat(g.volume) : null,
              salesCountGoal: g.sales ? parseInt(g.sales, 10) : null,
            }),
          })
        );
      }
      await Promise.all(promises);
      toast({ title: 'Goals Saved!', description: 'Monthly goals have been updated.' });
    } catch (err) {
      console.error('Failed to save goals:', err);
      toast({ variant: 'destructive', title: 'Save failed', description: 'Could not save monthly goals.' });
    } finally {
      setIsSavingGoals(false);
    }
  };


  useEffect(() => {
    if (userLoading || !year) return;

    const loadPlan = async () => {
      setIsLoading(true);

      try {
        if (!user) {
          // Not signed in: use defaults
          handleCalculate();
          return;
        }

        const token = await user.getIdToken();
        const json = await fetchPlan(year, token, isImpersonating ? effectiveUid : null);

        // Load last year's historical stats for the reference box
        const histYear = parseInt(year) - 1;
        setHistLoading(true);
        const histParams = new URLSearchParams({ year: String(histYear) });
        if (isImpersonating && effectiveUid) histParams.set('viewAs', effectiveUid);
        fetch(`/api/historical-stats?${histParams}`, { headers: { Authorization: `Bearer ${token}` } })
          .then(r => r.json())
          .then((d: HistoricalStats) => { setHistoricalStats(d.hasData ? d : null); })
          .catch(() => {})
          .finally(() => setHistLoading(false));

        // Load recruiting config and actual incentive income in parallel
        fetch('/api/admin/recruiting-config', { headers: { Authorization: `Bearer ${token}` } })
          .then(r => r.json())
          .then((d: any) => { if (d.ok) setRecruitingConfig(d.config); })
          .catch(() => {});
        fetch(`/api/recruiting?${isImpersonating && effectiveUid ? `viewAs=${effectiveUid}` : ''}`, { headers: { Authorization: `Bearer ${token}` } })
          .then(r => r.json())
          .then((d: any) => {
            if (d.ok && d.summary) {
              setRecruitingActual({
                totalAnnualIncome: d.summary.totalAnnualIncome ?? 0,
                tier1QualifiedCount: d.summary.tier1QualifiedCount ?? 0,
                tier2QualifiedCount: d.summary.tier2QualifiedCount ?? 0,
              });
            }
          })
          .catch(() => {});

        // Load brokerage-wide seasonality (available to all agents as a baseline)
        if (brokerageSeasonalityYear !== histYear) {
          fetch(`/api/brokerage-seasonality?year=${histYear}`, { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.json())
            .then((d: { hasData: boolean; seasonality: BrokerageSeasonality[] }) => {
              if (d.hasData && d.seasonality?.length === 12) {
                setBrokerageSeasonality(d.seasonality);
                setBrokerageSeasonalityYear(histYear);
              }
            })
            .catch(() => {});
        }

        // Load monthly goals from command-metrics
        const metricsParams = new URLSearchParams({ year });
        if (isImpersonating && effectiveUid) metricsParams.set('viewAs', effectiveUid);
        fetch(`/api/agent/command-metrics?${metricsParams}`, { headers: { Authorization: `Bearer ${token}` } })
          .then(r => r.json())
          .then((d: any) => {
            if (d?.agentView?.goalSegment) setGoalSegment(d.agentView.goalSegment);
            if (d?.overview?.months) {
              const map: Record<number, { margin: string; volume: string; sales: string }> = {};
              for (const m of d.overview.months) {
                map[m.month] = {
                  margin: m.grossMarginGoal != null ? String(Math.round(m.grossMarginGoal)) : '',
                  volume: m.volumeGoal != null ? String(Math.round(m.volumeGoal)) : '',
                  sales: m.salesCountGoal != null ? String(m.salesCountGoal) : '',
                };
              }
              setMonthlyGoals(map);
              // Seed yearly totals from saved goals
              const totalMargin = Object.values(map).reduce((s, g) => s + (parseFloat(g.margin) || 0), 0);
              const totalVolume = Object.values(map).reduce((s, g) => s + (parseFloat(g.volume) || 0), 0);
              const totalSales = Object.values(map).reduce((s, g) => s + (parseInt(g.sales, 10) || 0), 0);
              if (totalMargin > 0) setYearlyIncome(String(Math.round(totalMargin)));
              if (totalVolume > 0) setYearlyVolume(String(Math.round(totalVolume)));
              if (totalSales > 0) setYearlySales(String(totalSales));
            }
          })
          .catch(() => {});

        // If no plan exists, server returns ok:true with plan:{} — keep defaults
        if (json?.ok && json.plan && typeof json.plan === "object" && Object.keys(json.plan).length > 0) {
          const plan = json.plan as BusinessPlan & { recruitingGoalIncome?: number };
          // Restore recruiting pillar goal if saved
          if (plan.recruitingGoalIncome != null && plan.recruitingGoalIncome > 0) {
            setRecruitingGoalIncome(String(plan.recruitingGoalIncome));
          }

          // Restore Financial & Timing block values
          if (plan.goalAvgSalePrice != null && plan.goalAvgSalePrice > 0) setGoalAvgSalePrice(plan.goalAvgSalePrice);
          if (plan.goalAvgCommPct != null && plan.goalAvgCommPct > 0) setGoalAvgCommPct(plan.goalAvgCommPct);
          if (plan.goalAvgNetPct != null && plan.goalAvgNetPct > 0) setGoalAvgNetPct(plan.goalAvgNetPct);
          if (plan.yearlyVolume != null && plan.yearlyVolume > 0) setYearlyVolume(String(plan.yearlyVolume));
          if (plan.yearlySales != null && plan.yearlySales > 0) setYearlySales(String(plan.yearlySales));
          if (plan.yearlyIncome != null && plan.yearlyIncome > 0) setYearlyIncome(String(plan.yearlyIncome));
          if (plan.isNewAgent != null) setIsNewAgent(!!plan.isNewAgent);
          if (plan.gracePeriodMonths != null) setGracePeriodMonths(plan.gracePeriodMonths);
          // Restore seasonality weights so the volume column populates correctly
          if ((plan as any).seasonWeights && typeof (plan as any).seasonWeights === 'object') {
            setSeasonWeights((plan as any).seasonWeights);
          }

          // Only reset if we have plan assumptions; otherwise defaults stay
          if (plan?.assumptions?.conversionRates) {
            form.reset({
              annualIncomeGoal: plan.annualIncomeGoal ?? 100000,
              planStartDate: plan.planStartDate ?? "",
              resetStartDate: plan.resetStartDate ?? "",
              avgCommission: plan.assumptions.avgCommission ?? defaultAssumptions.avgCommission,
              workingDaysPerMonth: plan.assumptions.workingDaysPerMonth ?? defaultAssumptions.workingDaysPerMonth,
              weeksOff: plan.assumptions.weeksOff ?? defaultAssumptions.weeksOff,
              conversions: {
                callToEngagement:
                  (plan.assumptions.conversionRates.callToEngagement ?? defaultAssumptions.conversionRates.callToEngagement) * 100,
                engagementToAppointmentSet:
                  (plan.assumptions.conversionRates.engagementToAppointmentSet ??
                    defaultAssumptions.conversionRates.engagementToAppointmentSet) * 100,
                appointmentSetToHeld:
                  (plan.assumptions.conversionRates.appointmentSetToHeld ?? defaultAssumptions.conversionRates.appointmentSetToHeld) * 100,
                appointmentHeldToContract:
                  (plan.assumptions.conversionRates.appointmentHeldToContract ??
                    defaultAssumptions.conversionRates.appointmentHeldToContract) * 100,
                contractToClosing:
                  (plan.assumptions.conversionRates.contractToClosing ?? defaultAssumptions.conversionRates.contractToClosing) * 100,
              },
            });
          }
        }
      } catch (error) {
        console.error("Error loading business plan:", error);
      } finally {
        setIsLoading(false);
        handleCalculate();
        // Re-distribute goals after all state has been restored so the volume column populates
        setTimeout(distributeGoals, 100);
      }
    };

    loadPlan();
  }, [user, userLoading, year, form, handleCalculate, distributeGoals]);

  const onSubmit = async (data: PlanFormValues) => {
    if (!user) {
      toast({
        variant: "destructive",
        title: "Not Signed In",
        description: "You must be signed in to save a business plan.",
      });
      return;
    }

    setIsSaving(true);

    try {
      handleCalculate();

      const assumptions: PlanAssumptions = {
        avgCommission: data.avgCommission,
        workingDaysPerMonth: data.workingDaysPerMonth,
        weeksOff: data.weeksOff,
        conversionRates: {
          callToEngagement: data.conversions.callToEngagement / 100,
          engagementToAppointmentSet: data.conversions.engagementToAppointmentSet / 100,
          appointmentSetToHeld: data.conversions.appointmentSetToHeld / 100,
          appointmentHeldToContract: data.conversions.appointmentHeldToContract / 100,
          contractToClosing: data.conversions.contractToClosing / 100,
        },
      };

      const finalCalculatedPlan = calculatePlan(data.annualIncomeGoal, assumptions);

      const planToSave: BusinessPlan & { recruitingGoalIncome?: number } = {
        userId: effectiveUid ?? user.uid,
        year: parseInt(year, 10),
        annualIncomeGoal: data.annualIncomeGoal,
        planStartDate: data.planStartDate || undefined,
        resetStartDate: data.resetStartDate || undefined,
        isNewAgent,
        gracePeriodMonths: isNewAgent ? gracePeriodMonths : 0,
        // Financial & Timing block — persist so they reload correctly
        ...(goalAvgSalePrice > 0 ? { goalAvgSalePrice } : {}),
        ...(goalAvgCommPct > 0 ? { goalAvgCommPct } : {}),
        ...(goalAvgNetPct > 0 ? { goalAvgNetPct } : {}),
        ...(parseFloat(yearlyVolume) > 0 ? { yearlyVolume: parseFloat(yearlyVolume) } : {}),
        ...(parseFloat(yearlySales) > 0 ? { yearlySales: parseFloat(yearlySales) } : {}),
        ...(parseFloat(yearlyIncome) > 0 ? { yearlyIncome: parseFloat(yearlyIncome) } : {}),
        // Persist seasonality weights so they reload correctly
        seasonWeights: Object.keys(seasonWeights).length > 0 ? seasonWeights : undefined,
        assumptions,
        calculatedTargets: finalCalculatedPlan,
        updatedAt: new Date().toISOString(),
        ...(parseFloat(recruitingGoalIncome) > 0 ? { recruitingGoalIncome: parseFloat(recruitingGoalIncome) } : {}),
      };

      const token = await user.getIdToken();
      const json = await savePlan(year, planToSave, token, isImpersonating ? effectiveUid : null);

      if (!json?.ok) {
        throw new Error(json?.error ?? "Failed to save plan");
      }

      // Auto-save monthly goals whenever the plan is saved so the dashboard KPIs stay in sync.
      // Compute goals inline from current state values to avoid reading stale monthlyGoals
      // (distributeGoals uses a 50ms setTimeout so monthlyGoals state may not have updated yet).
      if (goalSegment) {
        const vol = parseFloat(yearlyVolume) || 0;
        const sales = parseInt(yearlySales, 10) || 0;
        const income = parseFloat(yearlyIncome) || 0;
        const goalPromises = [];
        for (let m = 1; m <= 12; m++) {
          const sw = seasonWeights[m];
          const volPct = parseFloat(sw?.volumePct) || 8.33;
          const salesPct = parseFloat(sw?.salesPct) || 8.33;
          const computedVolume = vol > 0 ? Math.round(vol * (volPct / 100)) : null;
          const computedSales = sales > 0 ? Math.round(sales * (salesPct / 100)) : null;
          const computedMargin = income > 0 ? Math.round(income * (salesPct / 100)) : null;
          // Fall back to existing monthlyGoals if computed values are all null
          const existing = monthlyGoals[m];
          const finalVolume = computedVolume ?? (existing?.volume ? parseFloat(existing.volume) : null);
          const finalSales = computedSales ?? (existing?.sales ? parseInt(existing.sales, 10) : null);
          const finalMargin = computedMargin ?? (existing?.margin ? parseFloat(existing.margin) : null);
          if (finalVolume == null && finalSales == null && finalMargin == null) continue;
          goalPromises.push(
            fetch('/api/broker/goals', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({
                year: parseInt(year, 10),
                month: m,
                segment: goalSegment,
                grossMarginGoal: finalMargin,
                volumeGoal: finalVolume,
                salesCountGoal: finalSales,
              }),
            })
          );
        }
        await Promise.all(goalPromises).catch(() => {}); // non-blocking
      }

      toast({ title: "Plan Saved!", description: `Your business plan for ${year} has been updated.` });
    } catch (err: any) {
      console.error("Save plan failed:", err);
      toast({
        variant: "destructive",
        title: "Save failed",
        description: err?.message ?? "Could not save your plan. Please try again.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) return <PlanSkeleton />;

  const activityMetrics = calculatedPlan
    ? [
        { label: "Calls", icon: Phone, data: calculatedPlan.calls },
        { label: "Engagements", icon: Users, data: calculatedPlan.engagements },
        { label: "Appointments Set", icon: Calendar, data: calculatedPlan.appointmentsSet },
        { label: "Appointments Held", icon: CalendarCheck, data: calculatedPlan.appointmentsHeld },
        { label: "Contracts Written", icon: FileText, data: calculatedPlan.contractsWritten },
        { label: "Closings", icon: Award, data: calculatedPlan.closings },
      ]
    : [];

  const fmtCurrency = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        {/* Page header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Business Plan Engine</h1>
            <p className="text-muted-foreground">Set your goal and build your path to success for {year}.</p>
          </div>
          <div className="flex items-center gap-2">
            {isImpersonating && impersonatedAgent && (
              <span className="text-sm text-amber-600 font-medium">Viewing: {impersonatedAgent.name}</span>
            )}
            <Button variant="outline" size="sm" className="text-orange-600 border-orange-200 hover:bg-orange-50" onClick={() => setShowResetDialog(true)}>
              <RefreshCw className="h-4 w-4 mr-2" />Reset Plan from Today
            </Button>
          </div>
        </div>

        {/* Reset Plan Dialog */}
        <Dialog open={showResetDialog} onOpenChange={setShowResetDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <RefreshCw className="h-5 w-5 text-orange-600" />
                Reset Business Plan
              </DialogTitle>
              <DialogDescription>
                This will reset your plan start date to <strong>today</strong>. Your existing goals and targets stay exactly the same — only the start date changes, so all your YTD progress calculations restart from today.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="rounded-lg bg-orange-50 border border-orange-200 p-3 text-sm text-orange-800">
                <p className="font-medium">What this does:</p>
                <ul className="mt-1 space-y-1 text-xs list-disc list-inside">
                  <li>Sets your plan start date to today</li>
                  <li>All your income, engagement, and appointment goals remain unchanged</li>
                  <li>YTD progress calculations restart from today forward</li>
                </ul>
              </div>
              <div className="space-y-1">
                <Label className="text-sm">Note (optional)</Label>
                <Textarea
                  placeholder="e.g. Met with director today — resetting to build fresh momentum."
                  value={resetNote}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setResetNote(e.target.value)}
                  rows={2}
                  className="text-sm"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowResetDialog(false)}>Cancel</Button>
              <Button onClick={handleSelfReset} disabled={isResetting} className="bg-orange-600 hover:bg-orange-700 text-white">
                {isResetting ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Resetting...</> : <><RefreshCw className="h-4 w-4 mr-2" />Reset from Today</>}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── SECTION 1: PRIOR YEAR ACTUALS REFERENCE ─────────────────── */}
        {histLoading ? (
          <Card className="mb-6 border-blue-200 bg-blue-50 dark:bg-blue-950/30">
            <CardContent className="pt-6">
              <Skeleton className="h-4 w-48 mb-2" />
              <Skeleton className="h-4 w-64" />
            </CardContent>
          </Card>
        ) : historicalStats ? (
          <Card className="mb-6 border-blue-300 bg-blue-50 dark:bg-blue-950/30">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2 text-blue-800 dark:text-blue-300">
                <BookOpen className="h-5 w-5" />
                {historicalStats.year} Actual Performance Reference
              </CardTitle>
              <CardDescription className="text-blue-700 dark:text-blue-400">
                Your actual results from {historicalStats.year} — for reference only. Set your {parseInt(year)} goals in the Advanced Assumptions below.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Row 1: Transaction averages — read-only reference */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="rounded-lg bg-white dark:bg-blue-900/30 border border-blue-200 p-3">
                  <p className="text-xs text-muted-foreground mb-1">Avg Sale Price</p>
                  <p className="text-xl font-bold text-blue-800 dark:text-blue-200">
                    {historicalStats.avgSalePrice !== null ? `$${historicalStats.avgSalePrice.toLocaleString()}` : '—'}
                  </p>
                  <p className="text-xs text-muted-foreground">per closing (historical)</p>
                </div>
                <div className="rounded-lg bg-white dark:bg-blue-900/30 border border-blue-200 p-3">
                  <p className="text-xs text-muted-foreground mb-1">Avg Commission %</p>
                  <p className="text-xl font-bold text-blue-800 dark:text-blue-200">
                    {historicalStats.avgCommissionPct !== null ? `${historicalStats.avgCommissionPct.toFixed(2)}%` : '—'}
                  </p>
                  <p className="text-xs text-muted-foreground">GCI / sale price (historical)</p>
                </div>
                <div className="rounded-lg bg-white dark:bg-blue-900/30 border border-blue-200 p-3">
                  <p className="text-xs text-muted-foreground mb-1">Avg Net Take-Home</p>
                  <p className="text-xl font-bold text-blue-800 dark:text-blue-200">
                    {historicalStats.avgNetCommission !== null ? `$${historicalStats.avgNetCommission.toLocaleString()}` : '—'}
                  </p>
                  <p className="text-xs text-muted-foreground">per closing (historical)</p>
                </div>
                <div className="rounded-lg bg-white dark:bg-blue-900/30 border border-blue-200 p-3">
                  <p className="text-xs text-muted-foreground mb-1">Avg Net %</p>
                  <p className="text-xl font-bold text-blue-800 dark:text-blue-200">
                    {historicalStats.avgNetPct !== null ? `${historicalStats.avgNetPct.toFixed(1)}%` : '—'}
                  </p>
                  <p className="text-xs text-muted-foreground">of GCI kept (historical)</p>
                </div>
              </div>
              {/* Row 2: Volume / closings summary */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div className="rounded-lg bg-white dark:bg-blue-900/30 border border-blue-200 p-3">
                  <p className="text-xs text-muted-foreground mb-1">Total Net Earned</p>
                  <p className="text-xl font-bold text-blue-800 dark:text-blue-200">
                    ${historicalStats.netEarned.toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground">{historicalStats.closedUnits} closings</p>
                </div>
                <div className="rounded-lg bg-white dark:bg-blue-900/30 border border-blue-200 p-3">
                  <p className="text-xs text-muted-foreground mb-1">Total Volume</p>
                  <p className="text-xl font-bold text-blue-800 dark:text-blue-200">
                    ${(historicalStats.totalVolume / 1_000_000).toFixed(1)}M
                  </p>
                  <p className="text-xs text-muted-foreground">closed volume</p>
                </div>
                <div className="rounded-lg bg-white dark:bg-blue-900/30 border border-blue-200 p-3">
                  <p className="text-xs text-muted-foreground mb-1">Appts Held</p>
                  <p className="text-xl font-bold text-blue-800 dark:text-blue-200">
                    {historicalStats.activityTotals.appointmentsHeld}
                  </p>
                  <p className="text-xs text-muted-foreground">for the year</p>
                </div>
              </div>
              {/* Row 3: Conversion rates */}
              <div>
                <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 mb-2 uppercase tracking-wide">Prior Year Conversion Rates</p>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                  {([
                    { label: 'Call → Engagement', value: historicalStats.conversionRates.callToEngagement },
                    { label: 'Engagement → Appt Set', value: historicalStats.conversionRates.engagementToAppointmentSet },
                    { label: 'Appt Set → Held', value: historicalStats.conversionRates.appointmentSetToHeld },
                    { label: 'Appt Held → Contract', value: historicalStats.conversionRates.appointmentHeldToContract },
                    { label: 'Contract → Closing', value: historicalStats.conversionRates.contractToClosing },
                  ] as { label: string; value: number | null }[]).map(({ label, value }) => (
                    <div key={label} className="rounded-lg bg-white dark:bg-blue-900/30 border border-blue-200 p-3 text-center">
                      <p className="text-xs text-muted-foreground mb-1">{label}</p>
                      <p className="text-lg font-bold text-blue-800 dark:text-blue-200">
                        {value !== null ? `${value.toFixed(1)}%` : '—'}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {/* ── SECTION 2: GROWTH TARGET ────────────────────────────────── */}
        {historicalStats?.hasData && (
          <Card className="border-2 border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300">
                <TrendingUp className="h-5 w-5" /> Growth Target
              </CardTitle>
              <CardDescription>
                Based on your {historicalStats.year} results — select a growth target to auto-populate your goals below.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Prior year quick-reference row */}
              <div className="grid grid-cols-3 gap-3 p-3 rounded-lg bg-white/60 dark:bg-black/20 border border-emerald-100 dark:border-emerald-900">
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">{historicalStats.year} Net Income</p>
                  <p className="text-base font-bold">${historicalStats.netEarned.toLocaleString()}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">{historicalStats.year} Volume</p>
                  <p className="text-base font-bold">${(historicalStats.totalVolume / 1_000_000).toFixed(2)}M</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">{historicalStats.year} Closings</p>
                  <p className="text-base font-bold">{historicalStats.closedUnits} deals</p>
                </div>
              </div>
              {/* Growth % selector */}
              <div>
                <p className="text-sm font-medium mb-2 text-emerald-800 dark:text-emerald-300">Select growth over {historicalStats.year}:</p>
                <div className="flex flex-wrap gap-2">
                  {[5, 10, 15, 20, 30].map(pct => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => {
                        setGrowthTarget(pct);
                        setCustomGrowthPct('');
                        const multiplier = 1 + pct / 100;
                        const newIncome = Math.round(historicalStats.netEarned * multiplier);
                        const newVolume = Math.round(historicalStats.totalVolume * multiplier);
                        const newSales = Math.round(historicalStats.closedUnits * multiplier);
                        form.setValue('annualIncomeGoal', newIncome);
                        handleCalculate();
                        setYearlyIncome(String(newIncome));
                        setYearlyVolume(String(newVolume));
                        setYearlySales(String(newSales));
                      }}
                      className={`px-4 py-2 rounded-full text-sm font-semibold border-2 transition-all ${
                        growthTarget === pct
                          ? 'bg-emerald-600 border-emerald-600 text-white shadow-md'
                          : 'bg-white dark:bg-black/20 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/40'
                      }`}
                    >
                      +{pct}%
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setGrowthTarget('other')}
                    className={`px-4 py-2 rounded-full text-sm font-semibold border-2 transition-all ${
                      growthTarget === 'other'
                        ? 'bg-emerald-600 border-emerald-600 text-white shadow-md'
                        : 'bg-white dark:bg-black/20 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/40'
                    }`}
                  >
                    Other
                  </button>
                </div>
                {growthTarget === 'other' && (
                  <div className="flex items-center gap-3 mt-3">
                    <div className="flex items-center gap-2">
                      <Input type="number" placeholder="e.g. 25" value={customGrowthPct} onChange={e => setCustomGrowthPct(e.target.value)} className="w-28" />
                      <span className="text-sm font-medium">%</span>
                    </div>
                    <Button type="button" size="sm" variant="outline" className="border-emerald-400 text-emerald-700 hover:bg-emerald-50"
                      onClick={() => {
                        const pct = parseFloat(customGrowthPct);
                        if (isNaN(pct) || pct <= 0) return;
                        const multiplier = 1 + pct / 100;
                        const newIncome = Math.round(historicalStats.netEarned * multiplier);
                        const newVolume = Math.round(historicalStats.totalVolume * multiplier);
                        const newSales = Math.round(historicalStats.closedUnits * multiplier);
                        form.setValue('annualIncomeGoal', newIncome);
                        handleCalculate();
                        setYearlyIncome(String(newIncome));
                        setYearlyVolume(String(newVolume));
                        setYearlySales(String(newSales));
                      }}
                    >Apply</Button>
                  </div>
                )}
              </div>
              {growthTarget !== null && (
                <div className="grid grid-cols-3 gap-3 p-3 rounded-lg bg-emerald-100/60 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
                  {(() => {
                    const pct = growthTarget === 'other' ? parseFloat(customGrowthPct) || 0 : growthTarget;
                    const multiplier = 1 + pct / 100;
                    return (
                      <>
                        <div className="text-center">
                          <p className="text-xs text-muted-foreground">Target Net Income</p>
                          <p className="text-base font-bold text-emerald-700 dark:text-emerald-300">${Math.round(historicalStats.netEarned * multiplier).toLocaleString()}</p>
                          <p className="text-xs text-emerald-600">+{pct}% over {historicalStats.year}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-muted-foreground">Target Volume</p>
                          <p className="text-base font-bold text-emerald-700 dark:text-emerald-300">${(historicalStats.totalVolume * multiplier / 1_000_000).toFixed(2)}M</p>
                          <p className="text-xs text-emerald-600">+{pct}% over {historicalStats.year}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-muted-foreground">Target Closings</p>
                          <p className="text-base font-bold text-emerald-700 dark:text-emerald-300">{Math.round(historicalStats.closedUnits * multiplier)} deals</p>
                          <p className="text-xs text-emerald-600">+{pct}% over {historicalStats.year}</p>
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── SECTION 3: YOUR GOAL ──────────────────────────────────────── */}
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Your Goal</CardTitle>
            <CardDescription>Set your annual income goal and plan dates.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <FormField
              control={form.control}
              name="annualIncomeGoal"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Annual Net Income Goal</FormLabel>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="100000"
                        className="pl-10"
                        {...field}
                        onChange={(e) => { field.onChange(e); handleCalculate(); }}
                      />
                    </FormControl>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="planStartDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Plan Start Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="resetStartDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reset Start Date (Optional)</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            {/* New Agent toggle + Grace Period */}
            <div className="flex items-start gap-4 p-4 rounded-lg border bg-muted/30">
              <div className="flex items-center gap-2 pt-0.5">
                <input
                  type="checkbox"
                  id="isNewAgent"
                  checked={isNewAgent}
                  onChange={e => setIsNewAgent(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 accent-primary"
                />
                <label htmlFor="isNewAgent" className="text-sm font-medium cursor-pointer">
                  New Agent (Grace Period)
                </label>
              </div>
              {isNewAgent && (
                <div className="flex items-center gap-2">
                  <label className="text-sm text-muted-foreground whitespace-nowrap">Grace period:</label>
                  <select
                    value={gracePeriodMonths}
                    onChange={e => setGracePeriodMonths(parseInt(e.target.value, 10))}
                    className="h-8 rounded border border-input bg-background px-2 text-sm"
                  >
                    {[1,2,3,4,5,6].map(n => (
                      <option key={n} value={n}>{n} month{n > 1 ? 's' : ''}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              Use Plan Start Date for a new agent or the beginning of this year&apos;s plan. Use Reset Start Date only if you want the dashboard pacing and grading to restart later in the same calendar year. Check &quot;New Agent&quot; to suppress closing goals during the grace period — activity goals (calls, engagements, appointments) start immediately.
            </p>
          </CardContent>
        </Card>

        {/* ── SECTION 4: ADVANCED ASSUMPTIONS ─────────────────────────── */}
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Advanced Assumptions</CardTitle>
            <CardDescription>Fine-tune conversion rates and working schedule. These defaults work well for most agents.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="pt-2">
              <h3 className="text-lg font-semibold mb-4">Conversion Rates</h3>
              <div className="space-y-6">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <TrendingUp /> Conversion Rates
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <FormField
                      control={form.control}
                      name="conversions.callToEngagement"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Call → Engagement</FormLabel>
                          <div className="relative">
                            <FormControl>
                              <Input
                                type="number"
                                {...field}
                                className="pr-8"
                                onChange={(e) => {
                                  field.onChange(e);
                                  handleCalculate();
                                }}
                              />
                            </FormControl>
                            <Percent className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="conversions.engagementToAppointmentSet"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Engagement → Appt Set</FormLabel>
                          <div className="relative">
                            <FormControl>
                              <Input
                                type="number"
                                {...field}
                                className="pr-8"
                                onChange={(e) => {
                                  field.onChange(e);
                                  handleCalculate();
                                }}
                              />
                            </FormControl>
                            <Percent className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="conversions.appointmentSetToHeld"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Appt Set → Appt Held</FormLabel>
                          <div className="relative">
                            <FormControl>
                              <Input
                                type="number"
                                {...field}
                                className="pr-8"
                                onChange={(e) => {
                                  field.onChange(e);
                                  handleCalculate();
                                }}
                              />
                            </FormControl>
                            <Percent className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="conversions.appointmentHeldToContract"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Appt Held → Contract</FormLabel>
                          <div className="relative">
                            <FormControl>
                              <Input
                                type="number"
                                {...field}
                                className="pr-8"
                                onChange={(e) => {
                                  field.onChange(e);
                                  handleCalculate();
                                }}
                              />
                            </FormControl>
                            <Percent className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="conversions.contractToClosing"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Contract → Closing</FormLabel>
                          <div className="relative">
                            <FormControl>
                              <Input
                                type="number"
                                {...field}
                                className="pr-8"
                                onChange={(e) => {
                                  field.onChange(e);
                                  handleCalculate();
                                }}
                              />
                            </FormControl>
                            <Percent className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <DollarSign /> Financial & Time
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* Goal-year financial assumptions — three inputs that drive the computed avg net $ */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      {/* Goal Avg Sale Price */}
                      <div className="space-y-1">
                        <label className="text-sm font-medium">Goal Avg Sale Price</label>
                        <div className="relative">
                          <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            type="number"
                            className="pl-9"
                            value={goalAvgSalePrice || ''}
                            placeholder={String(historicalStats?.avgSalePrice ?? 300000)}
                            onChange={(e) => {
                              const v = parseFloat(e.target.value) || 0;
                              setGoalAvgSalePrice(v);
                              // Recompute avgCommission in form
                              if (v > 0 && goalAvgCommPct > 0 && goalAvgNetPct > 0) {
                                const net = Math.round(v * (goalAvgCommPct / 100) * (goalAvgNetPct / 100));
                                form.setValue('avgCommission', net);
                                handleCalculate();
                              }
                              // Recompute yearlyVolume & yearlySales so seasonality volume column populates
                              const commPct = goalAvgCommPct > 0 ? goalAvgCommPct : avgCommPct;
                              const netPct = goalAvgNetPct > 0 ? goalAvgNetPct : avgNetPct;
                              const income = parseFloat(yearlyIncome) || 0;
                              if (income > 0 && commPct > 0 && netPct > 0) {
                                const calcVol = Math.round(income / ((commPct / 100) * (netPct / 100)));
                                setYearlyVolume(String(calcVol));
                                if (v > 0) setYearlySales(String(Math.round(calcVol / v)));
                              }
                              setTimeout(distributeGoals, 50);
                            }}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground">Expected avg sale price for {year}</p>
                      </div>
                      {/* Goal Avg Commission % */}
                      <div className="space-y-1">
                        <label className="text-sm font-medium">Goal Avg Commission %</label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                          <Input
                            type="number"
                            step="0.01"
                            className="pl-8"
                            value={goalAvgCommPct || ''}
                            placeholder={String(historicalStats?.avgCommissionPct?.toFixed(2) ?? '2.5')}
                            onChange={(e) => {
                              const v = parseFloat(e.target.value) || 0;
                              setGoalAvgCommPct(v);
                              if (goalAvgSalePrice > 0 && v > 0 && goalAvgNetPct > 0) {
                                const net = Math.round(goalAvgSalePrice * (v / 100) * (goalAvgNetPct / 100));
                                form.setValue('avgCommission', net);
                                handleCalculate();
                              }
                              // Recompute yearlyVolume so seasonality volume column populates
                              const asp = goalAvgSalePrice > 0 ? goalAvgSalePrice : avgSalePrice;
                              const netPct = goalAvgNetPct > 0 ? goalAvgNetPct : avgNetPct;
                              const income = parseFloat(yearlyIncome) || 0;
                              if (income > 0 && v > 0 && netPct > 0) {
                                const calcVol = Math.round(income / ((v / 100) * (netPct / 100)));
                                setYearlyVolume(String(calcVol));
                                if (asp > 0) setYearlySales(String(Math.round(calcVol / asp)));
                              }
                              setTimeout(distributeGoals, 50);
                            }}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground">GCI as % of sale price for {year}</p>
                      </div>
                      {/* Goal Avg Net % of GCI — with Use Live Commission button */}
                      <div className="space-y-1">
                        <label className="text-sm font-medium">Goal Avg Net % of GCI</label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                          <Input
                            type="number"
                            step="0.1"
                            className="pl-8"
                            value={goalAvgNetPct || ''}
                            placeholder={String(historicalStats?.avgNetPct?.toFixed(1) ?? '70')}
                            onChange={(e) => {
                              const v = parseFloat(e.target.value) || 0;
                              setGoalAvgNetPct(v);
                              if (goalAvgSalePrice > 0 && goalAvgCommPct > 0 && v > 0) {
                                const net = Math.round(goalAvgSalePrice * (goalAvgCommPct / 100) * (v / 100));
                                form.setValue('avgCommission', net);
                                handleCalculate();
                              }
                              // Recompute yearlyVolume so seasonality volume column populates
                              const asp = goalAvgSalePrice > 0 ? goalAvgSalePrice : avgSalePrice;
                              const commPct = goalAvgCommPct > 0 ? goalAvgCommPct : avgCommPct;
                              const income = parseFloat(yearlyIncome) || 0;
                              if (income > 0 && commPct > 0 && v > 0) {
                                const calcVol = Math.round(income / ((commPct / 100) * (v / 100)));
                                setYearlyVolume(String(calcVol));
                                if (asp > 0) setYearlySales(String(Math.round(calcVol / asp)));
                              }
                              setTimeout(distributeGoals, 50);
                            }}
                          />
                        </div>
                        <div className="flex items-center gap-1 mt-1">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="flex-1 text-xs"
                            onClick={fetchLiveCommission}
                            disabled={loadingLiveCommission}
                          >
                            <TrendingUp className="h-3 w-3 mr-1" />
                            {loadingLiveCommission ? 'Loading...' : 'Use Live Commission'}
                          </Button>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button type="button" className="text-muted-foreground hover:text-foreground transition-colors">
                                  <Info className="h-4 w-4" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-xs text-xs">
                                <p className="font-semibold mb-1">Use Live Commission</p>
                                <p>Pulls your current commission split directly from your agent profile. Finds your active tier based on YTD GCI and sets this % automatically.</p>
                                <p className="mt-1 text-muted-foreground">Example: If your plan is 75% agent split, this field becomes 75% and the Avg Net $ per Deal is computed automatically.</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                        <p className="text-xs text-muted-foreground">Your commission split % for {year}</p>
                      </div>
                    </div>
                    {/* Computed Avg Net $ per Deal — read-only derived value */}
                    {goalAvgSalePrice > 0 && goalAvgCommPct > 0 && goalAvgNetPct > 0 && (
                      <div className="rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 p-3 flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-green-800 dark:text-green-300">Avg Net $ per Deal</p>
                          <p className="text-xs text-muted-foreground">
                            ${goalAvgSalePrice.toLocaleString()} &times; {goalAvgCommPct.toFixed(2)}% &times; {goalAvgNetPct.toFixed(1)}%
                          </p>
                        </div>
                        <p className="text-2xl font-bold text-green-700 dark:text-green-300">
                          ${Math.round(goalAvgSalePrice * (goalAvgCommPct / 100) * (goalAvgNetPct / 100)).toLocaleString()}
                        </p>
                      </div>
                    )}
                    {/* Hidden avgCommission form field — kept for form submission, driven by the three inputs above */}
                    <FormField
                      control={form.control}
                      name="avgCommission"
                      render={({ field }) => (
                        <FormItem className="hidden">
                          <FormControl><Input type="number" {...field} /></FormControl>
                        </FormItem>
                      )}
                    />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField
                      control={form.control}
                      name="workingDaysPerMonth"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Working Days / Month</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              {...field}
                              onChange={(e) => {
                                field.onChange(e);
                                handleCalculate();
                              }}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="weeksOff"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Weeks Off (Vacation, etc)</FormLabel>
                          <div className="relative">
                            <Sailboat className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                            <FormControl>
                              <Input
                                type="number"
                                {...field}
                                className="pl-10"
                                onChange={(e) => {
                                  field.onChange(e);
                                  handleCalculate();
                                }}
                              />
                            </FormControl>
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    </div>{/* end grid cols-2 */}
                  </CardContent>
                </Card>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── SECTION 5: YOUR DAILY TARGETS ───────────────────────────────── */}
        {calculatedPlan && calculatedPlan.closings.yearly > 0 && (
          <div className="space-y-6 animate-in fade-in-50">
            <Card className="border-primary/30 bg-primary/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="text-primary" /> Your Annual Goals Summary
                </CardTitle>
                <CardDescription>
                  All goals derived from your income target and conversion assumptions. These are the numbers your KPI report card tracks throughout the year.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* Income row */}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Income</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div className="rounded-lg border bg-background p-3">
                      <p className="text-xs text-muted-foreground">Annual Net Income</p>
                      <p className="text-xl font-bold text-primary">{new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(form.getValues("annualIncomeGoal"))}</p>
                    </div>
                    <div className="rounded-lg border bg-background p-3">
                      <p className="text-xs text-muted-foreground">Monthly Net Income</p>
                      <p className="text-xl font-bold">{new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(calculatedPlan.monthlyNetIncome)}</p>
                    </div>
                  </div>
                </div>
                {/* Activity goals grid */}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Required Activity Goals</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                    {[
                      { label: 'Calls', icon: Phone, data: calculatedPlan.calls },
                      { label: 'Engagements', icon: Users, data: calculatedPlan.engagements },
                      { label: 'Appts Set', icon: Calendar, data: calculatedPlan.appointmentsSet },
                      { label: 'Appts Held', icon: CalendarCheck, data: calculatedPlan.appointmentsHeld },
                      { label: 'Contracts', icon: FileText, data: calculatedPlan.contractsWritten },
                      { label: 'Closings', icon: Award, data: calculatedPlan.closings },
                    ].map(({ label, icon: Icon, data }) => {
                      const rawDaily = data.daily as number;
                      const isHighFreq = rawDaily >= 1;
                      const everyXDays = rawDaily > 0 && !isHighFreq ? Math.round(1 / rawDaily) : null;
                      return (
                        <div key={label} className="rounded-lg border bg-background p-3 text-center">
                          <Icon className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                          <p className="text-xs text-muted-foreground mb-1">{label}</p>
                          <p className="text-2xl font-bold text-primary">{data.yearly.toLocaleString()}</p>
                          <p className="text-xs text-muted-foreground">per year</p>
                          <div className="mt-2 pt-2 border-t grid grid-cols-2 gap-1 text-xs">
                            <div>
                              <span className="text-muted-foreground">Mo</span>
                              <p className="font-semibold">{data.monthly.toLocaleString()}</p>
                            </div>
                            <div>
                              <span className="text-muted-foreground flex items-center justify-center gap-0.5">
                                {isHighFreq ? 'Day' : 'Pace'}
                                {!isHighFreq && (
                                  <span
                                    className="cursor-help text-blue-400 hover:text-blue-600"
                                    title={`~${everyXDays}d means you need to complete 1 ${label.toLowerCase()} approximately every ${everyXDays} working days to hit your annual goal of ${data.yearly}.`}
                                  >&#9432;</span>
                                )}
                              </span>
                              <p className="font-semibold">
                                {isHighFreq
                                  ? Math.ceil(rawDaily).toLocaleString()
                                  : everyXDays ? `~${everyXDays}d` : '—'}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="text-primary" /> Your Required Activities
                </CardTitle>
                <CardDescription>
                  Based on your assumptions and {form.getValues("workingDaysPerMonth")} working days per month, with {form.getValues("weeksOff")} weeks off.
                </CardDescription>
                <div className="flex items-start gap-2 mt-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-xs text-blue-800 dark:text-blue-300">
                  <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>
                    Weekly and daily goals are shown as whole numbers when the rate is 1 or more per period. If the rate is less than 1 (e.g. contracts or closings), that column is left blank — the monthly goal is the most meaningful target for low-frequency activities.
                    Your report card compares your actual YTD activity against a prorated target based on working days elapsed since your plan start date.
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[180px]">Activity</TableHead>
                      <TableHead className="text-right">Yearly</TableHead>
                      <TableHead className="text-right">Monthly</TableHead>
                      <TableHead className="text-right">Weekly</TableHead>
                      <TableHead className="text-right text-primary font-bold">Daily / Pace</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activityMetrics.map(({ label, icon: Icon, data }) => {
                      // High-frequency: daily rate >= 1 (calls, engagements, appts set/held)
                      // Low-frequency: daily rate < 1 (contracts written, closings)
                      // For low-frequency, show "every X days" instead of rounded-up daily/weekly
                      const rawDaily = data.daily as number;
                      const isHighFreq = rawDaily >= 1;
                      const everyXDays = rawDaily > 0 ? Math.round(1 / rawDaily) : null;
                      return (
                        <TableRow key={label}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <Icon className="h-5 w-5 text-muted-foreground" />
                              {label}
                            </div>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{data.yearly.toLocaleString()}</TableCell>
                          <TableCell className="text-right tabular-nums">{data.monthly.toLocaleString()}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {isHighFreq ? Math.ceil(data.weekly).toLocaleString() : "—"}
                          </TableCell>
                          <TableCell className="text-right text-primary font-bold tabular-nums">
                            {isHighFreq
                              ? Math.ceil(rawDaily).toLocaleString()
                              : everyXDays
                                ? <span className="text-sm font-semibold">every ~{everyXDays} days</span>
                                : "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        )}
        {/* ── SECTION 4: SET MONTHLY GOALS ──────────────────────────────── */}
        <Collapsible open={goalsOpen} onOpenChange={setGoalsOpen}>
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CollapsibleTrigger asChild>
                    <button type="button" className="flex items-center gap-2 text-left">
                      <CardTitle className="flex items-center gap-2">
                        <BarChart3 className="h-5 w-5 text-primary" />
                        Set Monthly Goals
                      </CardTitle>
                      {goalsOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    </button>
                  </CollapsibleTrigger>
                  <CardDescription className="mt-1">
                    Distribute your annual goals across each month. Net income goal auto-populates from your plan above.
                  </CardDescription>
                </div>
                <Button
                  type="button"
                  size="sm"
                  onClick={saveMonthlyGoals}
                  disabled={isSavingGoals || !goalSegment}
                >
                  <Save className="h-4 w-4 mr-1" />
                  {isSavingGoals ? 'Saving...' : 'Save Monthly Goals'}
                </Button>
              </div>
            </CardHeader>
            <CollapsibleContent>
              <CardContent className="space-y-6">
                {/* Yearly totals row — read-only, populated from business plan above */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 rounded-lg bg-muted/40 border">
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground mb-1">Annual Net Income Goal</p>
                    <p className="text-xl font-bold text-primary">
                      {yearlyIncome ? `$${Number(yearlyIncome).toLocaleString()}` : <span className="text-muted-foreground text-sm">Set above ↑</span>}
                    </p>
                    {historicalStats?.avgNetPct && <p className="text-xs text-muted-foreground mt-1">Prior yr net %: {historicalStats.avgNetPct.toFixed(1)}%</p>}
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground mb-1">Annual Volume Goal</p>
                    <p className="text-xl font-bold text-primary">
                      {yearlyVolume && Number(yearlyVolume) > 0
                        ? `$${(Number(yearlyVolume) / 1_000_000).toFixed(2)}M`
                        : <span className="text-muted-foreground text-sm">Calculated from plan</span>}
                    </p>
                    {historicalStats?.avgSalePrice && <p className="text-xs text-muted-foreground mt-1">Based on avg sale: ${historicalStats.avgSalePrice.toLocaleString()}</p>}
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground mb-1">Annual Sales Goal (units)</p>
                    <p className="text-xl font-bold text-primary">
                      {yearlySales && Number(yearlySales) > 0
                        ? `${Number(yearlySales)} closings`
                        : <span className="text-muted-foreground text-sm">Calculated from plan</span>}
                    </p>
                    {historicalStats && <p className="text-xs text-muted-foreground mt-1">Prior yr closings: {historicalStats.closedUnits}</p>}
                  </div>
                </div>

                {/* Seasonality buttons */}
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-muted-foreground">Distribute by seasonality:</span>

                    {/* Use Last Year's Seasonality */}
                    {historicalStats?.seasonality && historicalStats.seasonality.some(s => s.salesPct !== 8.33) && (
                      <div className="flex items-center gap-1">
                        <Button type="button" size="sm" variant="outline" onClick={() => applySeasonality('lastYear')}>
                          Use Last Year&apos;s Seasonality
                        </Button>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button type="button" className="text-muted-foreground hover:text-foreground transition-colors">
                                <Info className="h-4 w-4" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs text-xs">
                              <p className="font-semibold mb-1">Use Last Year&apos;s Seasonality</p>
                              <p>Distributes your annual goals across each month based on <strong>your own closing pattern from last year</strong>. If you closed more deals in spring and summer, those months will receive a larger share of your annual goal.</p>
                              <p className="mt-1 text-muted-foreground">This is personal to you — it is not a company-wide average.</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    )}

                    {/* Use All-Time Seasonality */}
                    {historicalStats?.allTimeHasData && (
                      <div className="flex items-center gap-1">
                        <Button type="button" size="sm" variant="outline" onClick={() => applySeasonality('allTime')}>
                          Use All-Time Seasonality
                        </Button>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button type="button" className="text-muted-foreground hover:text-foreground transition-colors">
                                <Info className="h-4 w-4" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs text-xs">
                              <p className="font-semibold mb-1">Use All-Time Seasonality</p>
                              <p>Distributes your annual goals based on <strong>your closing pattern across every year</strong> of transaction history in the system. This smooths out one-off years and reflects your long-term seasonal rhythm.</p>
                              <p className="mt-1 text-muted-foreground">Best choice if last year was unusually slow or fast in certain months.</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    )}

                    {/* Use Brokerage Seasonality — always shown when data is available, highlighted for agents with no personal history */}
                    {brokerageSeasonality && (
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant={!historicalStats ? 'default' : 'outline'}
                          className={!historicalStats ? 'bg-amber-600 hover:bg-amber-700 text-white border-amber-600' : ''}
                          onClick={() => applySeasonality('brokerage')}
                        >
                          {!historicalStats && <span className="mr-1">★</span>}
                          Use Brokerage Seasonality
                        </Button>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button type="button" className="text-muted-foreground hover:text-foreground transition-colors">
                                <Info className="h-4 w-4" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs text-xs">
                              <p className="font-semibold mb-1">Use Brokerage Seasonality</p>
                              <p>Distributes your annual goals based on <strong>Keaty Real Estate&apos;s overall closing pattern</strong> — calculated from all agent transactions across the brokerage for the prior year.</p>
                              <p className="mt-1">This is the best starting point if you are new or do not yet have enough personal transaction history to establish your own seasonal pattern.</p>
                              {brokerageSeasonalityYear && (
                                <p className="mt-1 text-muted-foreground">Based on {brokerageSeasonalityYear} brokerage data.</p>
                              )}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    )}

                    {/* Distribute Across All Months */}
                    <div className="flex items-center gap-1">
                      <Button type="button" size="sm" variant="secondary" onClick={distributeGoals}>
                        Distribute Across All Months
                      </Button>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button type="button" className="text-muted-foreground hover:text-foreground transition-colors">
                              <Info className="h-4 w-4" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs text-xs">
                            <p className="font-semibold mb-1">Distribute Across All Months</p>
                            <p>Splits your annual goal <strong>evenly across all 12 months</strong> — each month receives exactly 8.33% of the annual target. Use this if you want a flat, consistent monthly goal with no seasonal weighting.</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </div>
                </div>

                {/* Monthly goals table */}
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[90px]">Month</TableHead>
                        <TableHead className="w-[70px] text-center text-muted-foreground text-xs">Season %</TableHead>
                        <TableHead className="text-right">Net Income Goal</TableHead>
                        <TableHead className="text-right">Volume Goal</TableHead>
                        <TableHead className="text-right">Sales Goal (units)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {Array.from({ length: 12 }, (_, i) => i + 1).map(m => {
                        const g = monthlyGoals[m] ?? { margin: '', volume: '', sales: '' };
                        const sw = seasonWeights[m] ?? { salesPct: '8.33', volumePct: '8.33' };
                        const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
                        return (
                          <TableRow key={m}>
                            <TableCell className="font-medium">{MONTH_LABELS[m - 1]}</TableCell>
                            <TableCell className="text-center">
                              <span className="text-xs font-semibold text-primary tabular-nums">
                                {parseFloat(sw.salesPct).toFixed(1)}%
                              </span>
                            </TableCell>
                            <TableCell className="text-right">
                              <Input
                                type="number"
                                className="w-32 text-right ml-auto"
                                value={g.margin}
                                onChange={e => setMonthlyGoals(prev => ({ ...prev, [m]: { ...prev[m], margin: e.target.value } }))}
                                placeholder="—"
                              />
                            </TableCell>
                            <TableCell className="text-right">
                              <Input
                                type="number"
                                className="w-36 text-right ml-auto"
                                value={g.volume}
                                onChange={e => setMonthlyGoals(prev => ({ ...prev, [m]: { ...prev[m], volume: e.target.value } }))}
                                placeholder="—"
                              />
                            </TableCell>
                            <TableCell className="text-right">
                              <Input
                                type="number"
                                className="w-24 text-right ml-auto"
                                value={g.sales}
                                onChange={e => setMonthlyGoals(prev => ({ ...prev, [m]: { ...prev[m], sales: e.target.value } }))}
                                placeholder="—"
                              />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {/* Totals row */}
                      {/* Mismatch warning row */}
                      {(() => {
                        const totalMonthlyIncome = Object.values(monthlyGoals).reduce((s, g) => s + (parseFloat(g.margin) || 0), 0);
                        const annualGoal = parseFloat(yearlyIncome) || 0;
                        const diff = Math.round(totalMonthlyIncome - annualGoal);
                        if (annualGoal > 0 && Math.abs(diff) > 1) {
                          return (
                            <TableRow>
                              <TableCell colSpan={5} className="py-1">
                                <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 text-xs">
                                  <Badge variant="outline" className="border-amber-400 text-amber-700 dark:text-amber-400 text-xs">
                                    {diff > 0 ? `+$${Math.abs(diff).toLocaleString()} over goal` : `-$${Math.abs(diff).toLocaleString()} under goal`}
                                  </Badge>
                                  <span>Monthly totals don&apos;t match annual goal of {fmtCurrencyCompact(annualGoal)}. Click &quot;Distribute Across All Months&quot; to fix.</span>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        }
                        return null;
                      })()}
                      <TableRow className="font-bold bg-muted/30">
                        <TableCell>Total</TableCell>
                        <TableCell className="text-center text-xs tabular-nums">
                          {Object.values(seasonWeights).reduce((s, w) => s + (parseFloat(w.salesPct) || 0), 0).toFixed(1)}%
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {fmtCurrencyCompact(Object.values(monthlyGoals).reduce((s, g) => s + (parseFloat(g.margin) || 0), 0))}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {fmtCurrencyCompact(Object.values(monthlyGoals).reduce((s, g) => s + (parseFloat(g.volume) || 0), 0))}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {Object.values(monthlyGoals).reduce((s, g) => s + (parseInt(g.sales, 10) || 0), 0)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* ── SECTION 7: RECRUITING INCOME PILLAR ──────────────────── */}
        <Collapsible open={recruitingPillarOpen} onOpenChange={setRecruitingPillarOpen}>
          <Card className="border-violet-200 bg-violet-50/30">
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer select-none hover:bg-violet-50/60 rounded-t-lg transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <UserPlus className="h-5 w-5 text-violet-600" />
                    <div>
                      <CardTitle className="text-base">Recruiting Income Pillar <span className="text-xs font-normal text-muted-foreground ml-2">(Optional)</span></CardTitle>
                      <CardDescription>Plan how many agents you want to recruit to add an extra income stream alongside your sales goal.</CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {parseFloat(recruitingGoalIncome) > 0 && (
                      <Badge variant="outline" className="text-violet-700 border-violet-300 bg-violet-50">
                        Goal: {fmtCurrency(parseFloat(recruitingGoalIncome))}
                      </Badge>
                    )}
                    {recruitingPillarOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </div>
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="space-y-6 pt-0">
                {recruitingConfig && !recruitingConfig.enabled && (
                  <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
                    The recruiting incentive program is currently disabled. Contact your broker to enable it.
                  </div>
                )}

                {/* Goal Input */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1">
                      How much do you want to earn from recruiting this year?
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild><Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" /></TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            This is a separate income pillar — it does not reduce your sales targets. It is purely additive. Enter your recruiting income goal and the plan will tell you how many agents you need to recruit.
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </Label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="number"
                        min={0}
                        step={500}
                        className="pl-8"
                        placeholder="e.g. 5000"
                        value={recruitingGoalIncome}
                        onChange={e => setRecruitingGoalIncome(e.target.value)}
                      />
                    </div>
                    {recruitingActual && recruitingActual.totalAnnualIncome > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Current year actual: <span className="font-semibold text-green-700">{fmtCurrency(recruitingActual.totalAnnualIncome)}</span>
                      </p>
                    )}
                  </div>

                  {/* Plan vs Actual summary */}
                  {recruitingActual && (
                    <div className="rounded-lg border bg-white p-4 space-y-1">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Current Year Actual</p>
                      <div className="flex justify-between text-sm">
                        <span>Tier 1 qualified recruits</span>
                        <span className="font-semibold">{recruitingActual.tier1QualifiedCount}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Tier 2 qualified recruits</span>
                        <span className="font-semibold">{recruitingActual.tier2QualifiedCount}</span>
                      </div>
                      <Separator className="my-2" />
                      <div className="flex justify-between text-sm font-semibold">
                        <span>Total incentive income earned</span>
                        <span className="text-green-700">{fmtCurrency(recruitingActual.totalAnnualIncome)}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Reverse-calculated recruiting plan */}
                {(() => {
                  const goalAmt = parseFloat(recruitingGoalIncome);
                  const t1Pay = recruitingConfig?.tier1PayoutAmount ?? 500;
                  const t2Pay = recruitingConfig?.tier2PayoutAmount ?? 500;
                  const gciThreshold = recruitingConfig?.gciThreshold ?? 40000;
                  if (!goalAmt || goalAmt <= 0) return null;

                  // Work backward: each direct recruit = t1Pay + (TIER2_RATE × TIER2_AVG × t2Pay)
                  const incomePerDirectRecruit = t1Pay + (INDUSTRY_TIER2_RATE * INDUSTRY_TIER2_AVG * t2Pay);
                  const directRecruitsNeeded = Math.ceil(goalAmt / incomePerDirectRecruit);
                  const expectedTier2 = Math.round(directRecruitsNeeded * INDUSTRY_TIER2_RATE * INDUSTRY_TIER2_AVG);
                  const totalExpectedIncome = Math.round(
                    directRecruitsNeeded * t1Pay + expectedTier2 * t2Pay
                  );
                  const recruitsPerMonth = (directRecruitsNeeded / 12).toFixed(1);
                  const recruitsPerQuarter = Math.ceil(directRecruitsNeeded / 4);

                  return (
                    <div className="space-y-4">
                      <Separator />
                      <div className="flex items-center gap-2">
                        <Layers className="h-4 w-4 text-violet-600" />
                        <p className="text-sm font-semibold">Your Recruiting Plan to Reach {fmtCurrency(goalAmt)}</p>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="rounded-lg border bg-white p-4 text-center">
                          <p className="text-2xl font-bold text-violet-700">{directRecruitsNeeded}</p>
                          <p className="text-xs text-muted-foreground mt-1">Direct recruits needed</p>
                          <p className="text-xs text-muted-foreground">(Tier 1)</p>
                        </div>
                        <div className="rounded-lg border bg-white p-4 text-center">
                          <p className="text-2xl font-bold text-violet-500">{expectedTier2}</p>
                          <p className="text-xs text-muted-foreground mt-1">Projected Tier 2 recruits</p>
                          <p className="text-xs text-muted-foreground">(from your recruits recruiting)</p>
                        </div>
                        <div className="rounded-lg border bg-white p-4 text-center">
                          <p className="text-2xl font-bold">{recruitsPerMonth}</p>
                          <p className="text-xs text-muted-foreground mt-1">Recruits per month</p>
                          <p className="text-xs text-muted-foreground">({recruitsPerQuarter}/quarter)</p>
                        </div>
                        <div className="rounded-lg border bg-white p-4 text-center">
                          <p className="text-2xl font-bold text-green-700">{fmtCurrency(totalExpectedIncome)}</p>
                          <p className="text-xs text-muted-foreground mt-1">Projected total income</p>
                          <p className="text-xs text-muted-foreground">(Tier 1 + Tier 2)</p>
                        </div>
                      </div>

                      <div className="rounded-lg bg-violet-50 border border-violet-200 p-4 text-sm space-y-1">
                        <p className="font-semibold text-violet-800 mb-2">How this is calculated</p>
                        <p className="text-muted-foreground">Each direct recruit who closes <strong>{fmtCurrency(gciThreshold)}</strong> in GCI earns you <strong>{fmtCurrency(t1Pay)}</strong>. Based on industry standards, approximately <strong>25%</strong> of your direct recruits will also recruit 1–2 agents of their own (Tier 2), earning you an additional <strong>{fmtCurrency(t2Pay)}</strong> per qualified Tier 2 recruit. These payouts <strong>renew every year</strong> as long as each recruit stays active and re-qualifies.</p>
                        <p className="text-xs text-muted-foreground mt-2">Industry standard Tier 2 rate: 25% of direct recruits recruit others · Avg Tier 2 per recruiter: 1.5</p>
                      </div>
                    </div>
                  );
                })()}
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* ── SECTION 8: SAVE PLAN ─────────────────────────────────────── */}
        <div className="flex justify-end pt-2 pb-8">
          <Button type="submit" size="lg" disabled={isSaving}>
            {isSaving ? 'Saving...' : <><CheckCircle className="mr-2 h-4 w-4" /> Save Plan</>}
          </Button>
        </div>

      </form>
    </Form>
  );
}