"use client";
// AgentOnboardingWizard
// Used for: agent role (inside a brokerage — no branding step)
// Steps: Welcome → Dashboard Tour → Business Plan (redirect to full plan) → Data Uploads → Done

import React, { useState, useEffect } from 'react';
import { useUser } from '@/firebase';
import { useRouter } from 'next/navigation';
import { WizardShell, WizardStep } from './WizardShell';
import {
  Zap, LayoutDashboard, Target, Activity, Upload, CheckCircle2,
  BarChart3, Calendar, BookOpen, ClipboardList, ExternalLink,
  ArrowRight, CheckCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

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
  { id: 'plan', title: 'Business Plan', subtitle: 'Set up your full plan' },
  { id: 'uploads', title: 'Data Uploads', subtitle: 'Optional', optional: true },
  { id: 'done', title: 'All Done!', subtitle: 'Setup complete' },
];

// ── Main wizard ───────────────────────────────────────────────────────────────

type Props = {
  onComplete: () => Promise<void>;
  onSkip: () => Promise<void>;
};

export function AgentOnboardingWizard({ onComplete, onSkip }: Props) {
  const { user } = useUser();
  const router = useRouter();
  const [stepIndex, setStepIndex] = useState(0);
  const [tourSlide, setTourSlide] = useState(0);
  const [saving, setSaving] = useState(false);
  const [planVisited, setPlanVisited] = useState(false);

  // ── Save / finish ────────────────────────────────────────────────────────────
  const saveAll = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await onComplete();
    } catch (err) {
      console.error('[AgentWizard] save error', err);
    } finally {
      setSaving(false);
    }
  };

  // ── Step content ────────────────────────────────────────────────────────────
  const renderStep = () => {
    const stepId = STEPS[stepIndex].id;

    // ── WELCOME ───────────────────────────────────────────────────────────────
    if (stepId === 'welcome') {
      return (
        <div className="space-y-6">
          <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 text-primary mx-auto">
            <Zap className="h-8 w-8" />
          </div>
          <div className="text-center">
            <h3 className="text-2xl font-bold mb-2">Welcome to Smart Broker!</h3>
            <p className="text-muted-foreground max-w-sm mx-auto">
              Let&apos;s get you set up in just a few minutes. We&apos;ll show you around the platform,
              set up your full business plan, and get your data imported.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { icon: LayoutDashboard, label: 'Dashboard Tour', desc: 'See your command center' },
              { icon: Target, label: 'Business Plan', desc: 'Set up your full plan' },
              { icon: Upload, label: 'Data Uploads', desc: 'Import your history' },
            ].map(item => (
              <div key={item.label} className="flex flex-col items-center gap-2 p-4 rounded-lg border bg-muted/30 text-center">
                <item.icon className="h-5 w-5 text-primary" />
                <span className="text-sm font-semibold">{item.label}</span>
                <span className="text-xs text-muted-foreground">{item.desc}</span>
              </div>
            ))}
          </div>
        </div>
      );
    }

    // ── TOUR ─────────────────────────────────────────────────────────────────
    if (stepId === 'tour') {
      const slide = TOUR_SLIDES[tourSlide];
      const Icon = slide.icon;
      return (
        <div className="space-y-5">
          <div className="flex items-start gap-3 mb-2">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary/10 text-primary shrink-0 mt-0.5">
              <LayoutDashboard className="h-4.5 w-4.5" />
            </div>
            <div>
              <h3 className="font-semibold text-base">Dashboard Tour</h3>
              <p className="text-sm text-muted-foreground mt-0.5">
                A quick overview of your key tools. ({tourSlide + 1}/{TOUR_SLIDES.length})
              </p>
            </div>
          </div>
          <div className="rounded-xl border bg-muted/30 p-6 space-y-4">
            <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 text-primary mx-auto">
              <Icon className="h-6 w-6" />
            </div>
            <div className="text-center space-y-2">
              <h4 className="font-semibold text-base">{slide.title}</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">{slide.description}</p>
            </div>
            <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/5 border border-primary/10">
              <Zap className="h-4 w-4 text-primary shrink-0" />
              <p className="text-sm font-medium text-primary">{slide.highlight}</p>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <Button
              variant="ghost" size="sm"
              onClick={() => setTourSlide(i => Math.max(0, i - 1))}
              disabled={tourSlide === 0}
            >
              ← Previous
            </Button>
            <div className="flex gap-1.5">
              {TOUR_SLIDES.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setTourSlide(i)}
                  className={`w-2 h-2 rounded-full transition-colors ${i === tourSlide ? 'bg-primary' : 'bg-muted-foreground/30'}`}
                />
              ))}
            </div>
            <Button
              variant="ghost" size="sm"
              onClick={() => setTourSlide(i => Math.min(TOUR_SLIDES.length - 1, i + 1))}
              disabled={tourSlide === TOUR_SLIDES.length - 1}
            >
              Next →
            </Button>
          </div>
          <p className="text-xs text-center text-muted-foreground">
            Click through all slides or press <strong>Next</strong> to continue to your business plan setup.
          </p>
        </div>
      );
    }

    // ── BUSINESS PLAN (redirect to full plan page) ────────────────────────────
    if (stepId === 'plan') {
      return (
        <div className="space-y-5">
          <div className="flex items-start gap-3 mb-2">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary/10 text-primary shrink-0 mt-0.5">
              <Target className="h-4.5 w-4.5" />
            </div>
            <div>
              <h3 className="font-semibold text-base">Set Up Your Business Plan</h3>
              <p className="text-sm text-muted-foreground mt-0.5">
                Your business plan is the foundation of everything — income goals, closing targets,
                daily activity requirements, and your plan start date.
              </p>
            </div>
          </div>

          <div className="rounded-xl border bg-muted/30 p-5 space-y-4">
            <p className="text-sm text-muted-foreground leading-relaxed">
              We&apos;ll open your full Business Plan page where you can set:
            </p>
            <div className="space-y-2">
              {[
                'Annual income goal & average commission',
                'Plan start date (when your year begins)',
                'Conversion rate assumptions (calls → closings)',
                'Working days per month & weeks off',
                'Monthly seasonality weights',
              ].map(item => (
                <div key={item} className="flex items-center gap-2.5 text-sm">
                  <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>

          {planVisited ? (
            <div className="flex items-center gap-3 p-4 rounded-xl bg-green-50 border border-green-200">
              <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-green-800">Business Plan page opened!</p>
                <p className="text-xs text-green-700 mt-0.5">
                  Complete your plan setup there, then come back here and click <strong>Next</strong> to continue.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 p-4 rounded-xl bg-blue-50 border border-blue-200">
              <Target className="h-5 w-5 text-blue-600 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-blue-800">Ready to set up your plan?</p>
                <p className="text-xs text-blue-700 mt-0.5">
                  Click the button below to open the full Business Plan setup. Come back here when done.
                </p>
              </div>
            </div>
          )}

          <Button
            className="w-full gap-2"
            variant={planVisited ? 'outline' : 'default'}
            onClick={() => {
              setPlanVisited(true);
              window.open('/dashboard/plan', '_blank');
            }}
          >
            <ExternalLink className="h-4 w-4" />
            {planVisited ? 'Re-open Business Plan' : 'Open Full Business Plan Setup'}
            <ArrowRight className="h-4 w-4 ml-auto" />
          </Button>

          {!planVisited && (
            <p className="text-xs text-center text-muted-foreground">
              You can also skip this now and set up your plan later from the sidebar.
            </p>
          )}
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
              Your setup is complete. Here&apos;s where to go next:
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
      onNext={handleNext}
      onFinish={() => { saveAll(); }}
      onBack={handleBack}
      onSkipStep={STEPS[stepIndex].optional ? () => setStepIndex(i => i + 1) : undefined}
      onSkipAll={() => { onSkip(); }}
      saving={saving}
      wizardTitle="Agent Setup"
      wizardSubtitle="Welcome to Smart Broker"
    >
      {renderStep()}
    </WizardShell>
  );
}
