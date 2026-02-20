'use client';

import { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { doc, setDoc, getDoc } from 'firebase/firestore';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useUser, useFirestore } from '@/firebase';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { defaultAssumptions } from '@/lib/plan-assumptions';
import type { BusinessPlan, PlanAssumptions } from '@/lib/types';
import { ArrowRight, Calendar, Phone, Users, FileText, CheckCircle, DollarSign, Target, Percent, TrendingUp, VenetianMask } from 'lucide-react';

const planFormSchema = z.object({
  annualIncomeGoal: z.coerce.number().min(0, "Goal must be positive."),
  avgCommission: z.coerce.number().min(0, "Commission must be positive."),
  workingDaysPerMonth: z.coerce.number().int().min(1, "Must be at least 1.").max(31, "Cannot exceed 31."),
  conversions: z.object({
      callToEngagement: z.coerce.number().min(0).max(100),
      engagementToAppointment: z.coerce.number().min(0).max(100),
      appointmentToContract: z.coerce.number().min(0).max(100),
      contractToClosing: z.coerce.number().min(0).max(100),
  })
});
type PlanFormValues = z.infer<typeof planFormSchema>;

const calculatePlan = (incomeGoal: number, assumptions: PlanAssumptions): BusinessPlan['calculatedTargets'] => {
  if (incomeGoal <= 0 || assumptions.avgCommission <= 0) {
    return { monthlyNetIncome: 0, dailyCalls: 0, dailyEngagements: 0, dailyAppointmentsSet: 0, dailyAppointmentsHeld: 0, dailyContractsWritten: 0, closings: 0 };
  }

  const { conversionRates, avgCommission, workingDaysPerMonth } = assumptions;

  const annualClosings = Math.ceil(incomeGoal / avgCommission);
  // Note: Appt Held -> Contract in mock data, but we use appt -> contract here. Let's assume they are the same logic for now.
  // appointmentSetToHeld is usually 90-95%, let's assume apptHeld is what leads to contract.
  const monthlyContracts = Math.ceil(annualClosings / 12 / conversionRates.contractToClosing);
  const monthlyAppointments = Math.ceil(monthlyContracts / conversionRates.appointmentToContract);
  const monthlyEngagements = Math.ceil(monthlyAppointments / conversionRates.engagementToAppointment);
  const monthlyCalls = Math.ceil(monthlyEngagements / conversionRates.callToEngagement);

  return {
    monthlyNetIncome: incomeGoal / 12,
    closings: annualClosings,
    dailyContractsWritten: Math.ceil(monthlyContracts / workingDaysPerMonth),
    dailyAppointmentsHeld: Math.ceil(monthlyAppointments / workingDaysPerMonth),
    dailyAppointmentsSet: Math.ceil(monthlyAppointments / workingDaysPerMonth),
    dailyEngagements: Math.ceil(monthlyEngagements / workingDaysPerMonth),
    dailyCalls: Math.ceil(monthlyCalls / workingDaysPerMonth),
  };
}

const PlanSkeleton = () => (
    <div className="space-y-8">
        <div>
            <Skeleton className="h-9 w-1/2" />
            <Skeleton className="h-5 w-1/3 mt-2" />
        </div>
        <Card><CardContent className="p-6"><Skeleton className="h-24 w-full" /></CardContent></Card>
        <Card><CardContent className="p-6"><Skeleton className="h-40 w-full" /></CardContent></Card>
    </div>
);

const PlanResultCard = ({ icon: Icon, label, value, unit }: { icon: React.ElementType, label: string, value: string | number, unit?: string }) => (
    <div className="flex items-center gap-4 rounded-lg border p-4">
        <Icon className="h-8 w-8 text-muted-foreground" />
        <div>
            <p className="text-sm font-medium">{label}</p>
            <p className="text-2xl font-bold">{value} {unit && <span className="text-sm font-normal">{unit}</span>}</p>
        </div>
    </div>
);

export default function BusinessPlanPage() {
  const { user, loading: userLoading } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
  
  const [year] = useState(String(new Date().getFullYear()));
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [calculatedPlan, setCalculatedPlan] = useState<BusinessPlan['calculatedTargets'] | null>(null);

  const form = useForm<PlanFormValues>({
    resolver: zodResolver(planFormSchema),
    defaultValues: {
      annualIncomeGoal: 100000,
      avgCommission: defaultAssumptions.avgCommission,
      workingDaysPerMonth: defaultAssumptions.workingDaysPerMonth,
      conversions: {
        callToEngagement: defaultAssumptions.conversionRates.callToEngagement * 100,
        engagementToAppointment: defaultAssumptions.conversionRates.engagementToAppointment * 100,
        appointmentToContract: defaultAssumptions.conversionRates.appointmentToContract * 100,
        contractToClosing: defaultAssumptions.conversionRates.contractToClosing * 100,
      }
    }
  });

  useEffect(() => {
    if (!user || !db) {
        if (!userLoading) setIsLoading(false);
        return;
    };

    const planDocRef = doc(db, 'users', user.uid, 'plans', year);
    getDoc(planDocRef).then(docSnap => {
        if (docSnap.exists()) {
            const plan = docSnap.data() as BusinessPlan;
            form.reset({
                annualIncomeGoal: plan.annualIncomeGoal,
                avgCommission: plan.assumptions.avgCommission,
                workingDaysPerMonth: plan.assumptions.workingDaysPerMonth,
                conversions: {
                    callToEngagement: plan.assumptions.conversionRates.callToEngagement * 100,
                    engagementToAppointment: plan.assumptions.conversionRates.engagementToAppointment * 100,
                    appointmentToContract: plan.assumptions.conversionRates.appointmentToContract * 100,
                    contractToClosing: plan.assumptions.conversionRates.contractToClosing * 100,
                }
            });
            setCalculatedPlan(plan.calculatedTargets);
        }
    }).finally(() => {
        setIsLoading(false);
    });
  }, [user, db, year, form, userLoading]);

  const onSubmit = (data: PlanFormValues) => {
    if (!user || !db) {
      toast({ variant: 'destructive', title: 'Not Signed In', description: 'You must be signed in to save a business plan.' });
      return;
    }
    setIsSaving(true);
    
    const assumptions: PlanAssumptions = {
        avgCommission: data.avgCommission,
        workingDaysPerMonth: data.workingDaysPerMonth,
        conversionRates: {
            callToEngagement: data.conversions.callToEngagement / 100,
            engagementToAppointment: data.conversions.engagementToAppointment / 100,
            appointmentToContract: data.conversions.appointmentToContract / 100,
            contractToClosing: data.conversions.contractToClosing / 100,
        }
    };
    
    const newCalculatedTargets = calculatePlan(data.annualIncomeGoal, assumptions);
    setCalculatedPlan(newCalculatedTargets);

    const planToSave: BusinessPlan = {
        userId: user.uid,
        year: parseInt(year, 10),
        annualIncomeGoal: data.annualIncomeGoal,
        assumptions: assumptions,
        calculatedTargets: newCalculatedTargets,
        updatedAt: new Date().toISOString(),
    };

    const planDocRef = doc(db, 'users', user.uid, 'plans', year);
    setDoc(planDocRef, planToSave, { merge: true })
        .then(() => {
            toast({ title: 'Plan Saved!', description: `Your business plan for ${year} has been updated.` });
        })
        .catch(() => {
            const permissionError = new FirestorePermissionError({ path: planDocRef.path, operation: 'update', requestResourceData: planToSave });
            errorEmitter.emit('permission-error', permissionError);
        })
        .finally(() => setIsSaving(false));
  };
  
  if (isLoading) return <PlanSkeleton />;

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
                        <FormControl><Input type="number" placeholder="100000" className="pl-10" {...field} /></FormControl>
                    </div>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="item-1">
                <AccordionTrigger>Advanced Assumptions</AccordionTrigger>
                <AccordionContent className="space-y-6 pt-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg flex items-center gap-2"><TrendingUp /> Conversion Rates</CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <FormField control={form.control} name="conversions.callToEngagement" render={({ field }) => (
                        <FormItem><FormLabel>Call → Engagement</FormLabel><div className="relative"><FormControl><Input type="number" {...field} className="pr-8"/></FormControl><Percent className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"/></div><FormMessage /></FormItem>
                      )}/>
                      <FormField control={form.control} name="conversions.engagementToAppointment" render={({ field }) => (
                        <FormItem><FormLabel>Engagement → Appt Set</FormLabel><div className="relative"><FormControl><Input type="number" {...field} className="pr-8"/></FormControl><Percent className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"/></div><FormMessage /></FormItem>
                      )}/>
                      <FormField control={form.control} name="conversions.appointmentToContract" render={({ field }) => (
                        <FormItem><FormLabel>Appt Held → Contract</FormLabel><div className="relative"><FormControl><Input type="number" {...field} className="pr-8"/></FormControl><Percent className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"/></div><FormMessage /></FormItem>
                      )}/>
                      <FormField control={form.control} name="conversions.contractToClosing" render={({ field }) => (
                        <FormItem><FormLabel>Contract → Closing</FormLabel><div className="relative"><FormControl><Input type="number" {...field} className="pr-8"/></FormControl><Percent className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"/></div><FormMessage /></FormItem>
                      )}/>
                    </CardContent>
                  </Card>
                   <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-lg flex items-center gap-2"><DollarSign /> Financial & Time</CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <FormField control={form.control} name="avgCommission" render={({ field }) => (
                            <FormItem><FormLabel>Average Net Commission</FormLabel><div className="relative"><DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" /><FormControl><Input type="number" {...field} className="pl-10"/></FormControl></div><FormMessage /></FormItem>
                        )}/>
                        <FormField control={form.control} name="workingDaysPerMonth" render={({ field }) => (
                            <FormItem><FormLabel>Working Days / Month</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                        )}/>
                    </CardContent>
                  </Card>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>

        <Button type="submit" className="w-full" disabled={isSaving}>
            {isSaving ? "Saving..." : <><ArrowRight className="mr-2 h-4 w-4" /> Calculate & Save Plan</>}
        </Button>
      
        {calculatedPlan && calculatedPlan.closings > 0 && (
          <div className="space-y-6 animate-in fade-in-50">
              <Card>
                  <CardHeader>
                      <CardTitle className="flex items-center gap-2"><Target className="text-primary"/> Your Annual & Monthly Targets</CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <PlanResultCard icon={DollarSign} label="Annual Net Income" value={new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(form.getValues('annualIncomeGoal'))} />
                      <PlanResultCard icon={DollarSign} label="Monthly Net Income" value={new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(calculatedPlan.monthlyNetIncome)} />
                      <PlanResultCard icon={CheckCircle} label="Required Closings" value={calculatedPlan.closings} unit="/ year" />
                  </CardContent>
              </Card>
              
              <Card>
                  <CardHeader>
                      <CardTitle className="flex items-center gap-2"><Calendar className="text-primary"/> Your Required Daily Activities</CardTitle>
                      <CardDescription>Based on your assumptions and {form.getValues('workingDaysPerMonth')} working days per month.</CardDescription>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                        <PlanResultCard icon={Phone} label="Calls" value={calculatedPlan.dailyCalls} />
                        <PlanResultCard icon={Users} label="Engagements" value={calculatedPlan.dailyEngagements} />
                        <PlanResultCard icon={Calendar} label="Appts Set" value={calculatedPlan.dailyAppointmentsSet} />
                        <PlanResultCard icon={CheckCircle} label="Appts Held" value={calculatedPlan.dailyAppointmentsHeld} />
                        <PlanResultCard icon={FileText} label="Contracts" value={calculatedPlan.dailyContractsWritten} />
                  </CardContent>
              </Card>
          </div>
        )}
      </form>
    </Form>
  );
}
