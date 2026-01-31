'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { BusinessPlan } from '@/lib/types';
import { ArrowRight, Calendar, Phone, Users, FileText, CheckCircle, DollarSign, Target } from 'lucide-react';

const conversionRates = {
  appointmentToContract: 0.2, // 20% of appointments held become contracts
  contractToClosing: 0.8, // 80% of contracts close
  engagementToAppointment: 0.1, // 10% of engagements become appointments
  callToEngagement: 0.25, // 25% of calls result in an engagement
};
const avgCommission = 3000;
const workingDaysPerMonth = 21;


function calculatePlan(incomeGoal: number): BusinessPlan['calculatedTargets'] {
  if (incomeGoal <= 0) {
    return { monthlyNetIncome: 0, dailyCalls: 0, dailyEngagements: 0, dailyAppointmentsSet: 0, dailyAppointmentsHeld: 0, dailyContractsWritten: 0, closings: 0 };
  }

  const annualClosings = Math.ceil(incomeGoal / avgCommission);
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

export default function BusinessPlanPage() {
  const [incomeGoal, setIncomeGoal] = useState(100000);
  const [plan, setPlan] = useState<BusinessPlan['calculatedTargets']>(calculatePlan(100000));
  
  const handleCalculate = () => {
    // In a real app, this would be a server action that creates/updates the 'plan' document in Firestore.
    // A Cloud Function would then perform the calculation.
    console.log('// TODO: Call server action to save plan for year 2024 with goal:', incomeGoal);
    setPlan(calculatePlan(incomeGoal));
  };
  
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Business Plan Engine</h1>
        <p className="text-muted-foreground">Set your goal to calculate your path to success.</p>
      </div>

      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>Set Your Annual Income Goal</CardTitle>
          <CardDescription>
            Enter your desired net income for the year (after broker split only).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row items-end gap-4">
            <div className="w-full sm:w-auto flex-grow space-y-2">
              <Label htmlFor="income-goal">Annual Net Income Goal</Label>
              <div className="relative">
                 <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                 <Input 
                   id="income-goal" 
                   type="number" 
                   className="pl-10"
                   placeholder="100000"
                   value={incomeGoal}
                   onChange={(e) => setIncomeGoal(Number(e.target.value))}
                  />
              </div>
            </div>
            <Button onClick={handleCalculate} className="w-full sm:w-auto">
              <ArrowRight className="mr-2 h-4 w-4" /> Calculate Your Plan
            </Button>
          </div>
        </CardContent>
      </Card>

      {plan.closings > 0 && (
         <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Target className="text-primary"/> Your Annual & Monthly Targets</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="flex items-center gap-4 rounded-lg border p-4">
                        <DollarSign className="h-8 w-8 text-muted-foreground" />
                        <div>
                            <p className="text-sm font-medium">Annual Net Income</p>
                            <p className="text-2xl font-bold">{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(incomeGoal)}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-4 rounded-lg border p-4">
                        <DollarSign className="h-8 w-8 text-muted-foreground" />
                        <div>
                            <p className="text-sm font-medium">Monthly Net Income</p>
                            <p className="text-2xl font-bold">{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(plan.monthlyNetIncome)}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-4 rounded-lg border p-4">
                        <CheckCircle className="h-8 w-8 text-muted-foreground" />
                        <div>
                            <p className="text-sm font-medium">Required Closings</p>
                            <p className="text-2xl font-bold">{plan.closings} <span className="text-sm font-normal">/ year</span></p>
                        </div>
                    </div>
                </CardContent>
            </Card>
            
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Calendar className="text-primary"/> Your Required Daily Activities</CardTitle>
                    <CardDescription>Based on industry-standard conversion rates and {workingDaysPerMonth} working days per month.</CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                     <div className="flex items-center gap-4 rounded-lg border p-4">
                        <Phone className="h-6 w-6 text-muted-foreground" />
                        <div>
                            <p className="text-sm font-medium">Calls</p>
                            <p className="text-2xl font-bold">{plan.dailyCalls}</p>
                        </div>
                    </div>
                     <div className="flex items-center gap-4 rounded-lg border p-4">
                        <Users className="h-6 w-6 text-muted-foreground" />
                        <div>
                            <p className="text-sm font-medium">Engagements</p>
                            <p className="text-2xl font-bold">{plan.dailyEngagements}</p>
                        </div>
                    </div>
                     <div className="flex items-center gap-4 rounded-lg border p-4">
                        <Calendar className="h-6 w-6 text-muted-foreground" />
                        <div>
                            <p className="text-sm font-medium">Appts Set</p>
                            <p className="text-2xl font-bold">{plan.dailyAppointmentsSet}</p>
                        </div>
                    </div>
                     <div className="flex items-center gap-4 rounded-lg border p-4">
                        <CheckCircle className="h-6 w-6 text-muted-foreground" />
                        <div>
                            <p className="text-sm font-medium">Appts Held</p>
                            <p className="text-2xl font-bold">{plan.dailyAppointmentsHeld}</p>
                        </div>
                    </div>
                     <div className="flex items-center gap-4 rounded-lg border p-4">
                        <FileText className="h-6 w-6 text-muted-foreground" />
                        <div>
                            <p className="text-sm font-medium">Contracts</p>
                            <p className="text-2xl font-bold">{plan.dailyContractsWritten}</p>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
      )}
    </div>
  );
}
