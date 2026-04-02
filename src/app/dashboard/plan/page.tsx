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
} from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

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

    return {
      yearly: Math.ceil(yearlyValue),
      monthly: Math.ceil(monthly),
      weekly: weekly < 1 ? 0 : parseFloat(weekly.toFixed(2)),
      daily: daily < 1 ? 0 : parseFloat(daily.toFixed(2)),
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
  const [calculatedPlan, setCalculatedPlan] = useState<BusinessPlan["calculatedTargets"] | null>(null);
  const [historicalStats, setHistoricalStats] = useState<HistoricalStats | null>(null);
  const [histLoading, setHistLoading] = useState(false);

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
  const [customGrowthPct, setCustomGrowthPct] = useState('');
  const [yearlyVolume, setYearlyVolume] = useState('');
  const [yearlySales, setYearlySales] = useState('');
  const [yearlyIncome, setYearlyIncome] = useState('');

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

  // ── Monthly Goals helpers ────────────────────────────────────────────────
  const fmtCurrencyCompact = (v: number) => {
    if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
    return `$${v.toLocaleString()}`;
  };

  const avgSalePrice = historicalStats?.avgSalePrice ?? 0;
  const avgCommPct = historicalStats?.avgCommissionPct ?? 0;
  const avgNetPct = historicalStats?.avgNetPct ?? 0;

  const handleVolumeChange = (val: string) => {
    setYearlyVolume(val);
    const vol = parseFloat(val) || 0;
    if (vol > 0 && avgSalePrice > 0) setYearlySales(String(Math.round(vol / avgSalePrice)));
    if (vol > 0 && avgCommPct > 0 && avgNetPct > 0) {
      const totalGCI = vol * (avgCommPct / 100);
      setYearlyIncome(String(Math.round(totalGCI * (avgNetPct / 100))));
    }
  };

  const handleSalesChange = (val: string) => {
    setYearlySales(val);
    const sales = parseInt(val, 10) || 0;
    if (sales > 0 && avgSalePrice > 0) {
      const calcVol = Math.round(sales * avgSalePrice);
      setYearlyVolume(String(calcVol));
      if (avgCommPct > 0 && avgNetPct > 0) {
        setYearlyIncome(String(Math.round(calcVol * (avgCommPct / 100) * (avgNetPct / 100))));
      }
    }
  };

  const handleGoalIncomeChange = (val: string) => {
    setYearlyIncome(val);
    const income = parseFloat(val) || 0;
    if (income > 0 && avgNetPct > 0 && avgCommPct > 0) {
      const calcVol = Math.round(income / ((avgCommPct / 100) * (avgNetPct / 100)));
      setYearlyVolume(String(calcVol));
      if (avgSalePrice > 0) setYearlySales(String(Math.round(calcVol / avgSalePrice)));
    }
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

  const applySeasonality = (source: 'lastYear' | 'allTime' | 'even') => {
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

  const useHistoricalNumbers = useCallback(() => {
    if (!historicalStats) return;
    const r = historicalStats.conversionRates;
    if (historicalStats.avgNetCommission !== null) form.setValue('avgCommission', historicalStats.avgNetCommission);
    if (r.callToEngagement !== null) form.setValue('conversions.callToEngagement', r.callToEngagement);
    if (r.engagementToAppointmentSet !== null) form.setValue('conversions.engagementToAppointmentSet', r.engagementToAppointmentSet);
    if (r.appointmentSetToHeld !== null) form.setValue('conversions.appointmentSetToHeld', r.appointmentSetToHeld);
    if (r.appointmentHeldToContract !== null) form.setValue('conversions.appointmentHeldToContract', r.appointmentHeldToContract);
    if (r.contractToClosing !== null) form.setValue('conversions.contractToClosing', r.contractToClosing);
    setTimeout(handleCalculate, 0);
  }, [historicalStats, form, handleCalculate]);

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
          const plan = json.plan as BusinessPlan;

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
      }
    };

    loadPlan();
  }, [user, userLoading, year, form, handleCalculate]);

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

      const planToSave: BusinessPlan = {
        userId: effectiveUid ?? user.uid,
        year: parseInt(year, 10),
        annualIncomeGoal: data.annualIncomeGoal,
        planStartDate: data.planStartDate || undefined,
        resetStartDate: data.resetStartDate || undefined,
        assumptions,
        calculatedTargets: finalCalculatedPlan,
        updatedAt: new Date().toISOString(),
      };

      const token = await user.getIdToken();
      const json = await savePlan(year, planToSave, token, isImpersonating ? effectiveUid : null);

      if (!json?.ok) {
        throw new Error(json?.error ?? "Failed to save plan");
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
          {isImpersonating && impersonatedAgent && (
            <span className="text-sm text-amber-600 font-medium">Viewing: {impersonatedAgent.name}</span>
          )}
        </div>

        {/* ── SECTION 1: YOUR GOAL ──────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
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
                <p className="text-sm text-muted-foreground">
                  Use Plan Start Date for a new agent or the beginning of this year's plan. Use Reset Start Date only if you want the dashboard pacing and grading to restart later in the same calendar year.
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Live Preview side panel */}
          <div>
            <Card className="sticky top-4 bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Zap className="h-4 w-4 text-primary" /> Live Preview
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {calculatedPlan && calculatedPlan.closings.yearly > 0 ? (
                  <>
                    <div className="rounded-lg bg-primary/10 p-3 text-center mb-3">
                      <p className="text-xs text-muted-foreground">Monthly Target</p>
                      <p className="text-2xl font-black text-primary">{fmtCurrency(calculatedPlan.monthlyNetIncome)}</p>
                    </div>
                    <div className="space-y-2">
                      {[
                        { label: 'Closings / yr', value: calculatedPlan.closings.yearly },
                        { label: 'Closings / mo', value: calculatedPlan.closings.monthly },
                        { label: 'Daily Calls', value: calculatedPlan.calls.daily },
                        { label: 'Daily Engagements', value: calculatedPlan.engagements.daily },
                        { label: 'Appts Set / wk', value: calculatedPlan.appointmentsSet.weekly },
                      ].map(({ label, value }) => (
                        <div key={label} className="flex justify-between items-center">
                          <span className="text-muted-foreground">{label}</span>
                          <span className="font-bold text-primary">{value === 0 ? '—' : value.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground pt-2">Updates live as you type.</p>
                  </>
                ) : (
                  <p className="text-muted-foreground text-xs">Type your annual income goal to see a live preview.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* ── SECTION 2: ASSUMPTIONS ────────────────────────────────────── */}
        <div className="space-y-6">

        {/* ── LAST YEAR'S REFERENCE BOX ──────────────────────────────────── */}
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
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2 text-blue-800 dark:text-blue-300">
                  <BookOpen className="h-5 w-5" />
                  {historicalStats.year} Actual Performance Reference
                </CardTitle>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="border-blue-400 text-blue-700 hover:bg-blue-100 dark:text-blue-300"
                  onClick={useHistoricalNumbers}
                >
                  <ArrowDownToLine className="h-4 w-4 mr-1" />
                  Use These Numbers in Assumptions
                </Button>
              </div>
              <CardDescription className="text-blue-700 dark:text-blue-400">
                Your actual results from {historicalStats.year} — use these to set realistic assumptions, or adjust as needed.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Row 1: Transaction averages */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="rounded-lg bg-white dark:bg-blue-900/30 border border-blue-200 p-3">
                  <p className="text-xs text-muted-foreground mb-1">Avg Sale Price</p>
                  <p className="text-xl font-bold text-blue-800 dark:text-blue-200">
                    {historicalStats.avgSalePrice !== null
                      ? `$${historicalStats.avgSalePrice.toLocaleString()}`
                      : '—'}
                  </p>
                  <p className="text-xs text-muted-foreground">per closing</p>
                </div>
                <div className="rounded-lg bg-white dark:bg-blue-900/30 border border-blue-200 p-3">
                  <p className="text-xs text-muted-foreground mb-1">Avg Commission %</p>
                  <p className="text-xl font-bold text-blue-800 dark:text-blue-200">
                    {historicalStats.avgCommissionPct !== null
                      ? `${historicalStats.avgCommissionPct.toFixed(2)}%`
                      : '—'}
                  </p>
                  <p className="text-xs text-muted-foreground">GCI / sale price</p>
                </div>
                <div className="rounded-lg bg-white dark:bg-blue-900/30 border border-blue-200 p-3">
                  <p className="text-xs text-muted-foreground mb-1">Avg Net Take-Home</p>
                  <p className="text-xl font-bold text-blue-800 dark:text-blue-200">
                    {historicalStats.avgNetCommission !== null
                      ? `$${historicalStats.avgNetCommission.toLocaleString()}`
                      : '—'}
                  </p>
                  <p className="text-xs text-muted-foreground">per closing</p>
                </div>
                <div className="rounded-lg bg-white dark:bg-blue-900/30 border border-blue-200 p-3">
                  <p className="text-xs text-muted-foreground mb-1">Avg Net %</p>
                  <p className="text-xl font-bold text-blue-800 dark:text-blue-200">
                    {historicalStats.avgNetPct !== null
                      ? `${historicalStats.avgNetPct.toFixed(1)}%`
                      : '—'}
                  </p>
                  <p className="text-xs text-muted-foreground">of GCI kept</p>
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
                  <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <FormField
                      control={form.control}
                      name="avgCommission"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Average Net Commission</FormLabel>
                          <div className="relative">
                            <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
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
                  </CardContent>
                </Card>
              </div>
            </div>
          </CardContent>
        </Card>
        </div>

        {/* ── GROWTH TARGET BOX ───────────────────────────────────────── */}
        {historicalStats?.hasData && (
          <Card className="border-2 border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300">
                <TrendingUp className="h-5 w-5" /> Growth Target
              </CardTitle>
              <CardDescription>
                Based on your {historicalStats.year} results — select a growth target to auto-populate your goals.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Prior year reference row */}
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

              {/* Growth % selector buttons */}
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
                    onClick={() => { setGrowthTarget('other'); }}
                    className={`px-4 py-2 rounded-full text-sm font-semibold border-2 transition-all ${
                      growthTarget === 'other'
                        ? 'bg-emerald-600 border-emerald-600 text-white shadow-md'
                        : 'bg-white dark:bg-black/20 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/40'
                    }`}
                  >
                    Other
                  </button>
                </div>

                {/* Custom % input for 'Other' */}
                {growthTarget === 'other' && (
                  <div className="flex items-center gap-3 mt-3">
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        placeholder="e.g. 25"
                        value={customGrowthPct}
                        onChange={e => setCustomGrowthPct(e.target.value)}
                        className="w-28"
                      />
                      <span className="text-sm font-medium">%</span>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="border-emerald-400 text-emerald-700 hover:bg-emerald-50"
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
                    >
                      Apply
                    </Button>
                  </div>
                )}
              </div>

              {/* Projected results preview */}
              {growthTarget !== null && (
                <div className="grid grid-cols-3 gap-3 p-3 rounded-lg bg-emerald-100/60 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
                  {(() => {
                    const pct = growthTarget === 'other' ? parseFloat(customGrowthPct) || 0 : growthTarget;
                    const multiplier = 1 + pct / 100;
                    return (
                      <>
                        <div className="text-center">
                          <p className="text-xs text-muted-foreground">Target Net Income</p>
                          <p className="text-base font-bold text-emerald-700 dark:text-emerald-300">
                            ${Math.round(historicalStats.netEarned * multiplier).toLocaleString()}
                          </p>
                          <p className="text-xs text-emerald-600">+{pct}% over {historicalStats.year}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-muted-foreground">Target Volume</p>
                          <p className="text-base font-bold text-emerald-700 dark:text-emerald-300">
                            ${(historicalStats.totalVolume * multiplier / 1_000_000).toFixed(2)}M
                          </p>
                          <p className="text-xs text-emerald-600">+{pct}% over {historicalStats.year}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-muted-foreground">Target Closings</p>
                          <p className="text-base font-bold text-emerald-700 dark:text-emerald-300">
                            {Math.round(historicalStats.closedUnits * multiplier)} deals
                          </p>
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

        {/* ── Save button ─────────────────────────────────────────────────── */}
        <div className="flex justify-end pt-2">
          <Button type="submit" disabled={isSaving}>
            {isSaving ? 'Saving...' : <><CheckCircle className="mr-2 h-4 w-4" /> Save Plan</>}
          </Button>
        </div>

        {/* ── SECTION 3: YOUR DAILY TARGETS ───────────────────────────────── */}
        {calculatedPlan && calculatedPlan.closings.yearly > 0 && (
          <div className="space-y-6 animate-in fade-in-50">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="text-primary" /> Your Annual & Monthly Targets
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <PlanResultCard
                  icon={DollarSign}
                  label="Annual Net Income"
                  value={new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(
                    form.getValues("annualIncomeGoal")
                  )}
                />
                <PlanResultCard
                  icon={DollarSign}
                  label="Monthly Net Income"
                  value={new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(
                    calculatedPlan.monthlyNetIncome
                  )}
                />
                <PlanResultCard icon={Award} label="Required Closings" value={calculatedPlan.closings.yearly} unit="/ year" />
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
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[180px]">Activity</TableHead>
                      <TableHead className="text-right">Yearly</TableHead>
                      <TableHead className="text-right">Monthly</TableHead>
                      <TableHead className="text-right">Weekly</TableHead>
                      <TableHead className="text-right text-primary font-bold">Daily</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activityMetrics.map(({ label, icon: Icon, data }) => (
                      <TableRow key={label}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <Icon className="h-5 w-5 text-muted-foreground" />
                            {label}
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{data.yearly.toLocaleString()}</TableCell>
                        <TableCell className="text-right tabular-nums">{data.monthly.toLocaleString()}</TableCell>
                        <TableCell className="text-right tabular-nums">{data.weekly === 0 ? "—" : data.weekly.toLocaleString()}</TableCell>
                        <TableCell className="text-right text-primary font-bold tabular-nums">{data.daily === 0 ? "—" : data.daily.toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
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
                {/* Yearly totals row */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 rounded-lg bg-muted/40 border">
                  <div>
                    <Label className="text-xs text-muted-foreground">Annual Net Income Goal</Label>
                    <div className="relative mt-1">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="number"
                        className="pl-9"
                        placeholder={String(form.getValues('annualIncomeGoal') || '')}
                        value={yearlyIncome}
                        onChange={e => handleGoalIncomeChange(e.target.value)}
                      />
                    </div>
                    {historicalStats?.avgNetPct && <p className="text-xs text-muted-foreground mt-1">Prior yr net %: {historicalStats.avgNetPct.toFixed(1)}%</p>}
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Annual Volume Goal</Label>
                    <div className="relative mt-1">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="number"
                        className="pl-9"
                        placeholder="0"
                        value={yearlyVolume}
                        onChange={e => handleVolumeChange(e.target.value)}
                      />
                    </div>
                    {historicalStats?.avgSalePrice && <p className="text-xs text-muted-foreground mt-1">Prior yr avg sale: ${historicalStats.avgSalePrice.toLocaleString()}</p>}
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Annual Sales Goal (units)</Label>
                    <Input
                      type="number"
                      className="mt-1"
                      placeholder="0"
                      value={yearlySales}
                      onChange={e => handleSalesChange(e.target.value)}
                    />
                    {historicalStats && <p className="text-xs text-muted-foreground mt-1">Prior yr closings: {historicalStats.closedUnits}</p>}
                  </div>
                </div>

                {/* Seasonality buttons */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-muted-foreground">Distribute by seasonality:</span>
                  {historicalStats?.seasonality && historicalStats.seasonality.some(s => s.salesPct !== 8.33) && (
                    <Button type="button" size="sm" variant="outline" onClick={() => applySeasonality('lastYear')}>
                      Use Last Year&apos;s Seasonality
                    </Button>
                  )}
                  {historicalStats?.allTimeHasData && (
                    <Button type="button" size="sm" variant="outline" onClick={() => applySeasonality('allTime')}>
                      Use All-Time Seasonality
                    </Button>
                  )}
                  <Button type="button" size="sm" variant="secondary" onClick={distributeGoals}>
                    Distribute Across All Months
                  </Button>
                </div>

                {/* Monthly goals table */}
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[90px]">Month</TableHead>
                        <TableHead className="text-right">Net Income Goal</TableHead>
                        <TableHead className="text-right">Volume Goal</TableHead>
                        <TableHead className="text-right">Sales Goal (units)</TableHead>
                        <TableHead className="text-right text-muted-foreground text-xs">Sales %</TableHead>
                        <TableHead className="text-right text-muted-foreground text-xs">Vol %</TableHead>
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
                            <TableCell className="text-right">
                              <Input
                                type="number"
                                className="w-20 text-right ml-auto text-xs"
                                value={sw.salesPct}
                                onChange={e => setSeasonWeights(prev => ({ ...prev, [m]: { ...prev[m], salesPct: e.target.value } }))}
                                step="0.01"
                              />
                            </TableCell>
                            <TableCell className="text-right">
                              <Input
                                type="number"
                                className="w-20 text-right ml-auto text-xs"
                                value={sw.volumePct}
                                onChange={e => setSeasonWeights(prev => ({ ...prev, [m]: { ...prev[m], volumePct: e.target.value } }))}
                                step="0.01"
                              />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {/* Totals row */}
                      <TableRow className="font-bold bg-muted/30">
                        <TableCell>Total</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {fmtCurrencyCompact(Object.values(monthlyGoals).reduce((s, g) => s + (parseFloat(g.margin) || 0), 0))}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {fmtCurrencyCompact(Object.values(monthlyGoals).reduce((s, g) => s + (parseFloat(g.volume) || 0), 0))}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {Object.values(monthlyGoals).reduce((s, g) => s + (parseInt(g.sales, 10) || 0), 0)}
                        </TableCell>
                        <TableCell className="text-right text-xs tabular-nums">
                          {Object.values(seasonWeights).reduce((s, w) => s + (parseFloat(w.salesPct) || 0), 0).toFixed(1)}%
                        </TableCell>
                        <TableCell className="text-right text-xs tabular-nums">
                          {Object.values(seasonWeights).reduce((s, w) => s + (parseFloat(w.volumePct) || 0), 0).toFixed(1)}%
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

      </form>
    </Form>
  );
}