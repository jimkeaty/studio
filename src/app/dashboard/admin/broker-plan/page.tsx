'use client';
// /dashboard/admin/broker-plan
// Unified Broker Business Plan page — wizard + single-page reference view.

import React, { useState } from 'react';
import { useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Building2, Zap, ChevronLeft, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { BrokerBusinessPlanWizard, BrokerPlanDraft } from '@/components/dashboard/broker/BrokerBusinessPlanWizard';
import { BrokerBusinessPlanPage } from '@/components/dashboard/broker/BrokerBusinessPlanPage';

// ── Year selector ─────────────────────────────────────────────────────────────

function YearSelector({ year, onChange }: { year: number; onChange: (y: number) => void }) {
  const currentYear = new Date().getFullYear();
  const years = [currentYear - 1, currentYear, currentYear + 1];
  return (
    <div className="flex items-center gap-1 rounded-lg border bg-muted/40 p-0.5">
      {years.map(y => (
        <button
          key={y}
          onClick={() => onChange(y)}
          className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
            y === year ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {y}
        </button>
      ))}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function BrokerPlanPage() {
  const { user } = useUser();
  const { toast } = useToast();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardKey, setWizardKey] = useState(0);

  // Save from wizard — POST to unified API
  const handleWizardSave = async (draft: BrokerPlanDraft) => {
    if (!user) return;
    const token = await user.getIdToken();

    // Build monthly goals from yearly totals (distribute evenly)
    const monthlyGoals: Record<number, { grossMarginGoal: number | null; volumeGoal: number | null; salesCountGoal: number | null }> = {};
    for (let m = 1; m <= 12; m++) {
      monthlyGoals[m] = {
        volumeGoal: draft.yearlyVolumeGoal ? Math.round(draft.yearlyVolumeGoal / 12) : null,
        salesCountGoal: draft.yearlySalesCountGoal ? Math.round(draft.yearlySalesCountGoal / 12) : null,
        grossMarginGoal: draft.yearlyMarginGoal ? Math.round(draft.yearlyMarginGoal / 12) : null,
      };
    }

    const res = await fetch('/api/admin/broker-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...draft, monthlyGoals }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error ?? 'Save failed');
    }
    toast({
      title: 'Broker Business Plan Saved!',
      description: `Your ${year} plan has been set up and saved.`,
    });
    setWizardOpen(false);
    // Bump key to force BrokerBusinessPlanPage to reload
    setWizardKey(k => k + 1);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* ── Top nav bar ──────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <Link href="/dashboard/admin" className="text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <div className="flex items-center gap-2 flex-1">
            <Building2 className="h-5 w-5 text-primary" />
            <h1 className="text-base font-semibold">Broker Business Plan</h1>
            <Badge variant="secondary" className="text-[10px]">{year}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <YearSelector year={year} onChange={setYear} />
            <Button size="sm" onClick={() => setWizardOpen(true)}>
              <Zap className="h-3.5 w-3.5 mr-1.5" />
              Setup Wizard
            </Button>
          </div>
        </div>

        {/* Quick links to dashboards */}
        <div className="max-w-5xl mx-auto px-4 sm:px-6 pb-2 flex items-center gap-4">
          <Link
            href="/dashboard/admin"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            <ExternalLink className="h-3 w-3" />
            Broker Command
          </Link>
          <Link
            href="/dashboard/admin/recruiting"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            <ExternalLink className="h-3 w-3" />
            Recruiting & Development
          </Link>
          <Link
            href="/dashboard/plan"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            <ExternalLink className="h-3 w-3" />
            Agent Business Plan
          </Link>
        </div>
      </div>

      {/* ── Main content ─────────────────────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        {/* First-time setup banner (shown when plan is empty) */}
        <div className="mb-6 rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 p-6 flex flex-col sm:flex-row items-center gap-4">
          <div className="flex-1">
            <h2 className="text-lg font-semibold mb-1">New to the Broker Business Plan?</h2>
            <p className="text-sm text-muted-foreground">
              Use the <strong>Setup Wizard</strong> to walk through all your goals and assumptions step-by-step —
              Company Profile → Production Goals → Recruiting Goals → Activity Assumptions → Review & Save.
              Takes about 5 minutes and sets up everything at once.
            </p>
          </div>
          <Button onClick={() => setWizardOpen(true)} size="lg" className="shrink-0">
            <Zap className="h-4 w-4 mr-2" />
            Start Setup Wizard
          </Button>
        </div>

        {/* Single-page plan view */}
        <BrokerBusinessPlanPage
          key={wizardKey}
          year={year}
          onOpenWizard={() => setWizardOpen(true)}
        />
      </div>

      {/* ── Wizard dialog ─────────────────────────────────────────────────────── */}
      <Dialog open={wizardOpen} onOpenChange={setWizardOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              Broker Business Plan Setup — {year}
            </DialogTitle>
            <DialogDescription>
              Walk through each section to set up all your goals and assumptions.
              You can always edit individual fields on the plan page after saving.
            </DialogDescription>
          </DialogHeader>
          <BrokerBusinessPlanWizard
            year={year}
            onSave={handleWizardSave}
            onClose={() => setWizardOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
