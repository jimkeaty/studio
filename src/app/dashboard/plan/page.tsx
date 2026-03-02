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
} from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";

const planFormSchema = z.object({
  annualIncomeGoal: z.coerce.number().min(0, "Goal must be positive."),
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

async function fetchPlan(year: string, token: string): Promise<PlanGetResponse> {
  const res = await fetch(`/api/plan?year=${encodeURIComponent(year)}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  return res.json();
}

async function savePlan(year: string, plan: any, token: string): Promise<PlanPostResponse> {
  const res = await fetch(`/api/plan`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ year, plan }),
  });
  return res.json();
}

export default function BusinessPlanPage() {
  const { user, loading: userLoading } = useUser();
  const { toast } = useToast();

  const [year, setYear] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [calculatedPlan, setCalculatedPlan] = useState<BusinessPlan["calculatedTargets"] | null>(null);

  const form = useForm<PlanFormValues>({
    resolver: zodResolver(planFormSchema),
    defaultValues: {
      annualIncomeGoal: 100000,
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
        const json = await fetchPlan(year, token);

        // If no plan exists, server returns ok:true with plan:{} — keep defaults
        if (json?.ok && json.plan && typeof json.plan === "object" && Object.keys(json.plan).length > 0) {
          const plan = json.plan as BusinessPlan;

          // Only reset if we have plan assumptions; otherwise defaults stay
          if (plan?.assumptions?.conversionRates) {
            form.reset({
              annualIncomeGoal: plan.annualIncomeGoal ?? 100000,
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
        userId: user.uid,
        year: parseInt(year, 10),
        annualIncomeGoal: data.annualIncomeGoal,
        assumptions,
        calculatedTargets: finalCalculatedPlan,
        updatedAt: new Date().toISOString(),
      };

      const token = await user.getIdToken();
      const json = await savePlan(year, planToSave, token);

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

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Business Plan Engine</h1>
          <p className="text-muted-foreground">Set your goal and assumptions to calculate your path to success for {year}.</p>
        </div>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Your Goal & Assumptions</CardTitle>
            <CardDescription>Enter your income goal and fine-tune the assumptions used for calculations.</CardDescription>
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

            <Separator />

            <div className="pt-2">
              <h3 className="text-lg font-semibold mb-4">Advanced Assumptions</h3>
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

        <Button type="submit" className="w-full" disabled={isSaving}>
          {isSaving ? "Saving..." : (
            <>
              <CheckCircle className="mr-2 h-4 w-4" /> Save Plan
            </>
          )}
        </Button>

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