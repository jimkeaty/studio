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
} from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";

type HistoricalStats = {
  year: number;
  hasData: boolean;
  closedUnits: number;
  netEarned: number;
  totalVolume: number;
  avgNetCommission: number | null;
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
                  Use These Numbers
                </Button>
              </div>
              <CardDescription className="text-blue-700 dark:text-blue-400">
                Your actual results from {historicalStats.year} — use these to set realistic assumptions, or adjust as needed.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
                <div className="rounded-lg bg-white dark:bg-blue-900/30 border border-blue-200 p-3">
                  <p className="text-xs text-muted-foreground mb-1">Avg Net Commission</p>
                  <p className="text-xl font-bold text-blue-800 dark:text-blue-200">
                    {historicalStats.avgNetCommission !== null
                      ? `$${historicalStats.avgNetCommission.toLocaleString()}`
                      : '—'}
                  </p>
                  <p className="text-xs text-muted-foreground">per closing</p>
                </div>
                <div className="rounded-lg bg-white dark:bg-blue-900/30 border border-blue-200 p-3">
                  <p className="text-xs text-muted-foreground mb-1">Total Net Earned</p>
                  <p className="text-xl font-bold text-blue-800 dark:text-blue-200">
                    ${historicalStats.netEarned.toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground">{historicalStats.closedUnits} closings</p>
                </div>
                <div className="rounded-lg bg-white dark:bg-blue-900/30 border border-blue-200 p-3">
                  <p className="text-xs text-muted-foreground mb-1">Appts Held</p>
                  <p className="text-xl font-bold text-blue-800 dark:text-blue-200">
                    {historicalStats.activityTotals.appointmentsHeld}
                  </p>
                  <p className="text-xs text-muted-foreground">for the year</p>
                </div>
              </div>
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
      </form>
    </Form>
  );
}