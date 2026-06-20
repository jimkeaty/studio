'use client';
// AgentOnboardingWizard
// Used for: agent role (inside a brokerage — no branding step)
// Steps: Welcome → Dashboard Tour → Business Plan Goals → Conversion Rates → Data Uploads → Done

import React, { useState, useEffect } from 'react';
import { useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { WizardShell, WizardStep } from './WizardShell';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Zap, LayoutDashboard, Target, Activity, Upload, CheckCircle2,
  BarChart3, Phone, Calendar, TrendingUp, DollarSign, Info,
  ChevronRight, ChevronLeft, BookOpen, ClipboardList,
} from 'lucide-react';

// ── Tour slides ───────────────────────────────────────────────────────────────

const TOUR_SLIDES = [
  {
    icon: LayoutDashboard,
    title: 'Your Agent Command Center',
    description:
      'This is your personal dashboard. It shows your YTD production, goal progress, activity grades, and pipeline — all in one place.',
    highlight: 'Start here every morning to see where you stand.',
  },
  {
    icon: Target,
    title: 'Your Business Plan',
    description:
      'Your business plan lives under Agent Command → Business Plan. It shows your income goal, how many closings you need, and exactly how many calls, appointments, and contracts to hit each day.',
    highlight: 'The plan auto-calculates daily targets from your annual income goal.',
  },
  {
    icon: ClipboardList,
    title: 'Daily KPI Tracker',
    description:
      'Log your daily activity — calls made, engagements, appointments set and held, contracts written, and closings. The tracker compares your pace to your goals in real time.',
    highlight: 'Log activity daily for the most accurate grade.',
  },
  {
    icon: BarChart3,
    title: 'Production Charts',
    description:
      'Your production charts show closed volume, GCI, and sales count by month. You can compare to last year and see your projected year-end total based on current pace.',
    highlight: 'Charts update automatically when you log transactions.',
  },
  {
    icon: BookOpen,
    title: 'Contacts & Pipeline',
    description:
      'Your contacts and pipeline let you track leads, active clients, and upcoming appointments. Import your existing contacts from a CSV to get started quickly.',
    highlight: 'Keep your pipeline updated for accurate projections.',
  },
];

// ── Steps ─────────────────────────────────────────────────────────────────────

const STEPS: WizardStep[] = [
  { id: 'welcome', title: 'Welcome', subtitle: 'Get started' },
  { id: 'tour', title: 'Dashboard Tour', subtitle: 'See what you have' },
  { id: 'goals', title: 'Business Plan Goals', subtitle: 'Income & closing targets' },
  { id: 'rates', title: 'Conversion Rates', subtitle: 'Activity assumptions' },
  { id: 'uploads', title: 'Data Uploads', subtitle: 'Optional', optional: true },
  { id: 'done', title: 'All Done!', subtitle: 'Setup complete' },
];

// ── Helper components ─────────────────────────────────────────────────────────

function Field({
  label, value, onChange, type = 'text', prefix, suffix, hint, placeholder,
}: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; prefix?: string; suffix?: string; hint?: string; placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">{label}</Label>
      <div className="relative flex items-center">
        {prefix && <span className="absolute left-3 text-muted-foreground text-sm select-none">{prefix}</span>}
        <Input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className={prefix ? 'pl-7' : suffix ? 'pr-10' : ''}
        />
        {suffix && <span className="absolute right-3 text-muted-foreground text-sm select-none">{suffix}</span>}
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function RateField({
  label, value, onChange, hint,
}: {
  label: string; value: string; onChange: (v: string) => void; hint?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 border-b last:border-0">
      <div className="flex-1">
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <div className="relative flex items-center w-24 shrink-0">
        <Input
          type="number"
          min="0"
          max="100"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="pr-7 text-right"
        />
        <span className="absolute right-2.5 text-muted-foreground text-sm">%</span>
      </div>
    </div>
  );
}

// ── Main wizard ───────────────────────────────────────────────────────────────

type Props = {
  onComplete: () => Promise<void>;
  onSkip: () => Promise<void>;
};

export function AgentOnboardingWizard({ onComplete, onSkip }: Props) {
  const { user } = useUser();
  const { toast } = useToast();
  const [stepIndex, setStepIndex] = useState(0);
  const [tourSlide, setTourSlide] = useState(0);
  const [saving, setSaving] = useState(false);
  const currentYear = new Date().getFullYear();

  // ── Business plan goals ─────────────────────────────────────────────────────
  const [incomeGoal, setIncomeGoal] = useState('');
  const [avgCommission, setAvgCommission] = useState('');
  const [workingDaysPerMonth, setWorkingDaysPerMonth] = useState('21');
  const [weeksOff, setWeeksOff] = useState('4');

  // ── Conversion rates (pre-filled with broker defaults) ──────────────────────
  const [rates, setRates] = useState({
    callToEngagement: '15',
    engagementToApptSet: '3',
    apptSetToHeld: '65',
    apptHeldToContract: '50',
    contractToClosing: '85',
  });

  // Fetch broker defaults on mount
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch(`/api/admin/broker-plan?year=${currentYear}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.ok && data.plan?.agentConversionRates) {
          const cr = data.plan.agentConversionRates;
          setRates({
            callToEngagement: cr.callToEngagement != null ? String(Math.round(cr.callToEngagement * 100)) : '15',
            engagementToApptSet: cr.engagementToAppointmentSet != null ? String(Math.round(cr.engagementToAppointmentSet * 100)) : '3',
            apptSetToHeld: cr.appointmentSetToHeld != null ? String(Math.round(cr.appointmentSetToHeld * 100)) : '65',
            apptHeldToContract: cr.appointmentHeldToContract != null ? String(Math.round(cr.appointmentHeldToContract * 100)) : '50',
            contractToClosing: cr.contractToClosing != null ? String(Math.round(cr.contractToClosing * 100)) : '85',
          });
        }
        // Also pre-fill avg commission from broker plan
        if (data.ok && data.plan?.avgCommissionPct) {
          setAvgCommission(String(data.plan.avgCommissionPct));
        }
      } catch {
        // Use defaults
      }
    };
    load();
  }, [user, currentYear]);

  // ── Save ────────────────────────────────────────────────────────────────────
  const saveAll = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const token = await user.getIdToken();

      // Save agent business plan via the existing plan API
      const income = parseFloat(incomeGoal.replace(/,/g, '')) || 0;
      const commission = parseFloat(avgCommission.replace(/,/g, '')) || 0;

      if (income > 0 && commission > 0) {
        await fetch('/api/agent/plan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            year: currentYear,
            annualIncomeGoal: income,
            assumptions: {
              avgCommission: commission,
              workingDaysPerMonth: parseInt(workingDaysPerMonth) || 21,
              weeksOff: parseInt(weeksOff) || 4,
              conversionRates: {
                callToEngagement: parseFloat(rates.callToEngagement) / 100,
                engagementToAppointmentSet: parseFloat(rates.engagementToApptSet) / 100,
                appointmentSetToHeld: parseFloat(rates.apptSetToHeld) / 100,
                appointmentHeldToContract: parseFloat(rates.apptHeldToContract) / 100,
                contractToClosing: parseFloat(rates.contractToClosing) / 100,
              },
            },
          }),
        });
      }

      toast({ title: 'Setup complete!', description: 'Your business plan has been saved.' });
      await onComplete();
    } catch (err) {
      console.error('[AgentWizard] save error', err);
      toast({ title: 'Save failed', description: 'Please try again.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  // ── Step content ────────────────────────────────────────────────────────────
  const renderStep = () => {
    const stepId = STEPS[stepIndex].id;

    // ── WELCOME ──────────────────────────────────────────────────────────────
    if (stepId === 'welcome') {
      return (
        <div className="space-y-6">
          <div className="text-center py-4">
            <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 text-primary mx-auto mb-4">
              <Zap className="h-8 w-8" />
            </div>
            <h3 className="text-2xl font-bold mb-2">Welcome to Your Dashboard!</h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              Let&apos;s get you set up in about 3 minutes. We&apos;ll show you around the dashboard,
              set your income goal, and configure your activity assumptions.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { icon: LayoutDashboard, label: 'Dashboard Tour', desc: 'See what each section does' },
              { icon: Target, label: 'Business Plan Goals', desc: 'Set your income & closing targets' },
              { icon: Activity, label: 'Conversion Rates', desc: 'Pre-filled from your broker — adjust if needed' },
              { icon: Upload, label: 'Data Uploads', desc: 'Optional — import past transactions & activity' },
            ].map(item => (
              <div key={item.label} className="flex items-start gap-3 p-3 rounded-lg border bg-muted/30">
                <item.icon className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-800">
            <Info className="h-4 w-4 shrink-0" />
            <p className="text-xs">
              Your conversion rates are pre-filled with your broker&apos;s defaults.
              You can adjust them to match your personal track record.
            </p>
          </div>
        </div>
      );
    }

    // ── DASHBOARD TOUR ────────────────────────────────────────────────────────
    if (stepId === 'tour') {
      const slide = TOUR_SLIDES[tourSlide];
      const SlideIcon = slide.icon;
      return (
        <div className="space-y-5">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-base">Dashboard Tour</h3>
            <span className="text-xs text-muted-foreground">
              {tourSlide + 1} / {TOUR_SLIDES.length}
            </span>
          </div>
          {/* Slide */}
          <div className="rounded-xl border bg-gradient-to-br from-primary/5 to-background p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 text-primary shrink-0">
                <SlideIcon className="h-5 w-5" />
              </div>
              <h4 className="font-bold text-base">{slide.title}</h4>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">{slide.description}</p>
            <div className="flex items-start gap-2 p-3 rounded-lg bg-primary/5 border border-primary/10">
              <span className="text-primary text-sm">💡</span>
              <p className="text-xs font-medium text-primary">{slide.highlight}</p>
            </div>
          </div>
          {/* Slide nav dots */}
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() => setTourSlide(i => Math.max(0, i - 1))}
              disabled={tourSlide === 0}
              className="p-1 rounded-full hover:bg-muted disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            {TOUR_SLIDES.map((_, i) => (
              <button
                key={i}
                onClick={() => setTourSlide(i)}
                className={`w-2 h-2 rounded-full transition-all ${i === tourSlide ? 'bg-primary w-4' : 'bg-muted-foreground/30'}`}
              />
            ))}
            <button
              onClick={() => setTourSlide(i => Math.min(TOUR_SLIDES.length - 1, i + 1))}
              disabled={tourSlide === TOUR_SLIDES.length - 1}
              className="p-1 rounded-full hover:bg-muted disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <p className="text-xs text-center text-muted-foreground">
            Click through all slides or press Next to continue to your business plan setup.
          </p>
        </div>
      );
    }

    // ── BUSINESS PLAN GOALS ───────────────────────────────────────────────────
    if (stepId === 'goals') {
      const income = parseFloat(incomeGoal.replace(/,/g, '')) || 0;
      const commission = parseFloat(avgCommission.replace(/,/g, '')) || 0;
      const estimatedClosings = commission > 0 ? Math.ceil(income / commission) : 0;
      return (
        <div className="space-y-5">
          <div className="flex items-start gap-3 mb-2">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary/10 text-primary shrink-0 mt-0.5">
              <Target className="h-4.5 w-4.5" />
            </div>
            <div>
              <h3 className="font-semibold text-base">Business Plan Goals</h3>
              <p className="text-sm text-muted-foreground mt-0.5">
                Set your {currentYear} income goal. The plan will calculate exactly how many closings,
                appointments, and calls you need each day.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Annual Income Goal" value={incomeGoal} onChange={setIncomeGoal}
              prefix="$" placeholder="150,000"
              hint="Your target GCI (gross commission income) for the year" />
            <Field label="Avg Net Commission Per Transaction" value={avgCommission} onChange={setAvgCommission}
              prefix="$" placeholder="8,500"
              hint="Your average take-home commission per closed deal" />
          </div>
          {estimatedClosings > 0 && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/5 border border-primary/10">
              <TrendingUp className="h-4 w-4 text-primary shrink-0" />
              <p className="text-sm">
                To earn <strong>${income.toLocaleString()}</strong>, you need approximately{' '}
                <strong>{estimatedClosings} closings</strong> this year
                ({Math.ceil(estimatedClosings / 12)} per month).
              </p>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Working Days Per Month" value={workingDaysPerMonth}
              onChange={setWorkingDaysPerMonth} placeholder="21"
              hint="Used to calculate your daily activity targets" />
            <Field label="Weeks Off Per Year" value={weeksOff} onChange={setWeeksOff}
              placeholder="4" hint="Vacation weeks excluded from weekly targets" />
          </div>
        </div>
      );
    }

    // ── CONVERSION RATES ──────────────────────────────────────────────────────
    if (stepId === 'rates') {
      return (
        <div className="space-y-5">
          <div className="flex items-start gap-3 mb-2">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary/10 text-primary shrink-0 mt-0.5">
              <Activity className="h-4.5 w-4.5" />
            </div>
            <div>
              <h3 className="font-semibold text-base">Conversion Rate Assumptions</h3>
              <p className="text-sm text-muted-foreground mt-0.5">
                Pre-filled from your broker&apos;s defaults. Adjust these to match your personal track record
                for more accurate daily targets.
              </p>
            </div>
          </div>
          <div className="rounded-lg border divide-y overflow-hidden">
            <RateField label="Call → Engagement" value={rates.callToEngagement}
              onChange={v => setRates(p => ({ ...p, callToEngagement: v }))}
              hint="% of calls that result in a meaningful conversation" />
            <RateField label="Engagement → Appointment Set" value={rates.engagementToApptSet}
              onChange={v => setRates(p => ({ ...p, engagementToApptSet: v }))}
              hint="% of engagements that become a scheduled appointment" />
            <RateField label="Appointment Set → Held" value={rates.apptSetToHeld}
              onChange={v => setRates(p => ({ ...p, apptSetToHeld: v }))}
              hint="% of scheduled appointments that are actually held" />
            <RateField label="Appointment Held → Contract" value={rates.apptHeldToContract}
              onChange={v => setRates(p => ({ ...p, apptHeldToContract: v }))}
              hint="% of held appointments that result in a signed contract" />
            <RateField label="Contract → Closing" value={rates.contractToClosing}
              onChange={v => setRates(p => ({ ...p, contractToClosing: v }))}
              hint="% of contracts that successfully close" />
          </div>
          <div className="p-3 rounded-lg bg-muted/50 border">
            <p className="text-xs text-muted-foreground">
              <strong>Tip:</strong> If you&apos;re new to tracking, leave these at the defaults.
              After 3–6 months of logging activity, you&apos;ll have real data to update these with.
            </p>
          </div>
        </div>
      );
    }

    // ── DATA UPLOADS ──────────────────────────────────────────────────────────
    if (stepId === 'uploads') {
      return (
        <div className="space-y-5">
          <div className="flex items-start gap-3 mb-2">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary/10 text-primary shrink-0 mt-0.5">
              <Upload className="h-4.5 w-4.5" />
            </div>
            <div>
              <h3 className="font-semibold text-base">Data Uploads</h3>
              <p className="text-sm text-muted-foreground mt-0.5">
                Import your existing data to populate your charts. All optional — skip now and come back anytime.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              {
                icon: BarChart3,
                title: 'Transaction History',
                desc: 'Import your closed transactions (CSV) to populate production charts with real data.',
                href: '/dashboard/admin/import',
                badge: 'Most Important',
              },
              {
                icon: Activity,
                title: 'KPI Activity Log',
                desc: 'Import past activity records — calls, engagements, appointments, contracts.',
                href: '/dashboard/admin/import-activities',
                badge: null,
              },
              {
                icon: Calendar,
                title: 'Contacts & Appointments',
                desc: 'Import your contact book and appointment history.',
                href: '/dashboard/contacts',
                badge: null,
              },
            ].map(item => (
              <div key={item.title} className="rounded-lg border p-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <item.icon className="h-4 w-4 text-primary shrink-0" />
                    <span className="text-sm font-semibold">{item.title}</span>
                  </div>
                  {item.badge && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                      {item.badge}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
                <a
                  href={item.href}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open Upload Page →
                </a>
              </div>
            ))}
          </div>
        </div>
      );
    }

    // ── DONE ─────────────────────────────────────────────────────────────────
    if (stepId === 'done') {
      return (
        <div className="space-y-6 text-center py-4">
          <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-green-100 text-green-600 mx-auto">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <div>
            <h3 className="text-2xl font-bold mb-2">You&apos;re all set!</h3>
            <p className="text-muted-foreground max-w-sm mx-auto">
              Your business plan is saved. Here&apos;s where to go next:
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
            {[
              { label: 'Agent Command', desc: 'Your production dashboard & goal tracking', href: '/dashboard' },
              { label: 'Business Plan', desc: 'View your full plan & daily targets', href: '/dashboard/plan' },
              { label: 'Daily KPI Tracker', desc: 'Log today\'s calls, appointments & activity', href: '/dashboard/tracker' },
              { label: 'Import Transactions', desc: 'Upload your historical closed deals', href: '/dashboard/admin/import' },
            ].map(link => (
              <a key={link.label} href={link.href}
                className="flex flex-col gap-0.5 p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                <span className="text-sm font-semibold text-primary">{link.label} →</span>
                <span className="text-xs text-muted-foreground">{link.desc}</span>
              </a>
            ))}
          </div>
        </div>
      );
    }

    return null;
  };

  const handleNext = () => {
    if (stepIndex < STEPS.length - 1) setStepIndex(i => i + 1);
  };
  const handleBack = () => {
    if (stepIndex > 0) setStepIndex(i => i - 1);
  };

  return (
    <WizardShell
      steps={STEPS}
      currentStepIndex={stepIndex}
      onBack={handleBack}
      onNext={handleNext}
      onSkipStep={STEPS[stepIndex].optional ? () => setStepIndex(i => i + 1) : undefined}
      onSkipAll={onSkip}
      onFinish={saveAll}
      saving={saving}
      wizardTitle="Agent Setup"
      wizardSubtitle={`${currentYear} Business Plan`}
      headerIcon={<Target className="h-5 w-5" />}
    >
      {renderStep()}
    </WizardShell>
  );
}
