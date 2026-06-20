'use client';
// BrokerBusinessPlanWizard.tsx
// 5-step guided setup wizard for the Broker Business Plan.
// Steps: Company Profile → Production Goals → Recruiting Goals → Activity Assumptions → Review & Save

import React, { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  ChevronRight, ChevronLeft, Check, Building2, TrendingUp, Users,
  Activity, ClipboardCheck, DollarSign, Phone, CalendarCheck,
  FileText, Handshake, UserCheck, Info, Zap,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BrokerPlanDraft {
  year: number;
  // Production
  yearlyVolumeGoal: number | null;
  yearlySalesCountGoal: number | null;
  yearlyMarginGoal: number | null;
  goalAvgSalePrice: number | null;
  goalAvgCommissionPct: number | null;
  goalAvgMarginPct: number | null;
  // Recruiting
  yearlyNewHiresGoal: number | null;
  yearlyActiveAgentsGoal: number | null;
  netGainGoal: number | null;
  netMarginGoal: number | null;
  companyRetentionPct: number;
  avgCompanyFeePerDealOverride: number | null;
  // Agent KPI activity goals
  callsGoal: number | null;
  engagementsGoal: number | null;
  appointmentsSetGoal: number | null;
  appointmentsHeldGoal: number | null;
  contractsWrittenGoal: number | null;
  closingsGoal: number | null;
  // Agent KPI conversion rates
  agentConversionRates: {
    callToEngagement: number;
    engagementToAppointmentSet: number;
    appointmentSetToHeld: number;
    appointmentHeldToContract: number;
    contractToClosing: number;
  };
  // Recruiting funnel conversion rates
  conversionRates: {
    callToInterview: number;
    interviewSetToHeld: number;
    interviewToOffer: number;
    offerToCommit: number;
    commitToOnboard: number;
    expectedAttritionPct: number;
  };
}

interface LiveReference {
  year: number;
  avgSalePrice: number | null;
  avgCommissionPct: number | null;
  avgGrossMarginPct: number | null;
  avgCompanyFeePerDeal: number | null;
  totalDeals: number;
  totalVolume: number;
  totalGCI: number;
  totalCompanyRetained: number;
}

interface BrokerBusinessPlanWizardProps {
  year: number;
  initialDraft?: Partial<BrokerPlanDraft>;
  liveReference?: LiveReference | null;
  onSave: (draft: BrokerPlanDraft) => Promise<void>;
  onClose: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt$(n: number | null | undefined): string {
  if (n == null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}
function fmtN(n: number | null | undefined, d = 0): string {
  if (n == null) return '—';
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}
function num(s: string): number | null {
  const n = parseFloat(s.replace(/,/g, ''));
  return isNaN(n) ? null : n;
}
function str(n: number | null | undefined): string {
  return n != null ? String(n) : '';
}

// ── Step progress indicator ───────────────────────────────────────────────────

const STEPS = [
  { id: 1, label: 'Company Profile', icon: Building2 },
  { id: 2, label: 'Production Goals', icon: TrendingUp },
  { id: 3, label: 'Recruiting Goals', icon: Users },
  { id: 4, label: 'Activity Assumptions', icon: Activity },
  { id: 5, label: 'Review & Save', icon: ClipboardCheck },
];

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center justify-between mb-8 overflow-x-auto pb-2">
      {STEPS.map((step, i) => {
        const Icon = step.icon;
        const done = current > step.id;
        const active = current === step.id;
        return (
          <React.Fragment key={step.id}>
            <div className="flex flex-col items-center gap-1 min-w-[64px]">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors ${
                done ? 'bg-primary border-primary text-primary-foreground' :
                active ? 'bg-primary/10 border-primary text-primary' :
                'bg-muted border-muted-foreground/30 text-muted-foreground'
              }`}>
                {done ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
              </div>
              <span className={`text-[10px] text-center leading-tight ${active ? 'font-semibold text-primary' : 'text-muted-foreground'}`}>
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`flex-1 h-0.5 mx-1 mt-[-16px] ${done ? 'bg-primary' : 'bg-muted-foreground/20'}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ── Reference box ─────────────────────────────────────────────────────────────

function RefBox({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-muted/40 border rounded-lg px-3 py-2 text-center">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-base font-bold">{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

// ── Field row ─────────────────────────────────────────────────────────────────

function FieldRow({
  label, hint, value, onChange, prefix, suffix, placeholder, type = 'number',
}: {
  label: string; hint?: string; value: string; onChange: (v: string) => void;
  prefix?: string; suffix?: string; placeholder?: string; type?: string;
}) {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {prefix && <span className="text-sm text-muted-foreground">{prefix}</span>}
        <Input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-32 h-8 text-sm text-right"
        />
        {suffix && <span className="text-sm text-muted-foreground">{suffix}</span>}
      </div>
    </div>
  );
}

// ── Rate row ──────────────────────────────────────────────────────────────────

function RateRow({ label, hint, value, onChange }: {
  label: string; hint?: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-3 py-2 border-b last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Input
          type="number"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-20 h-7 text-sm text-right"
          min={0} max={100}
        />
        <span className="text-sm text-muted-foreground">%</span>
      </div>
    </div>
  );
}

// ── Review row ────────────────────────────────────────────────────────────────

function ReviewRow({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="text-right">
        <span className="text-sm font-semibold">{value}</span>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

// ── Main Wizard ───────────────────────────────────────────────────────────────

export function BrokerBusinessPlanWizard({
  year,
  initialDraft,
  liveReference,
  onSave,
  onClose,
}: BrokerBusinessPlanWizardProps) {
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  // ── Step 1: Company Profile ────────────────────────────────────────────────
  const [avgSalePrice, setAvgSalePrice] = useState(str(initialDraft?.goalAvgSalePrice ?? liveReference?.avgSalePrice));
  const [avgCommPct, setAvgCommPct] = useState(str(initialDraft?.goalAvgCommissionPct ?? liveReference?.avgCommissionPct));
  const [avgMarginPct, setAvgMarginPct] = useState(str(initialDraft?.goalAvgMarginPct ?? liveReference?.avgGrossMarginPct));
  const [retentionPct, setRetentionPct] = useState(str(Math.round((initialDraft?.companyRetentionPct ?? 0.29) * 100)));

  // ── Step 2: Production Goals ───────────────────────────────────────────────
  const [yearlyVolume, setYearlyVolume] = useState(str(initialDraft?.yearlyVolumeGoal));
  const [yearlySales, setYearlySales] = useState(str(initialDraft?.yearlySalesCountGoal));
  const [yearlyMargin, setYearlyMargin] = useState(str(initialDraft?.yearlyMarginGoal));

  // Auto-calc helpers
  const effectiveAvgSalePrice = num(avgSalePrice) ?? liveReference?.avgSalePrice ?? 0;
  const effectiveAvgCommPct = num(avgCommPct) ?? liveReference?.avgCommissionPct ?? 0;
  const effectiveAvgMarginPct = num(avgMarginPct) ?? liveReference?.avgGrossMarginPct ?? 0;

  const handleVolumeChange = (v: string) => {
    setYearlyVolume(v);
    const vol = num(v) ?? 0;
    if (vol > 0) {
      if (effectiveAvgSalePrice > 0) setYearlySales(String(Math.round(vol / effectiveAvgSalePrice)));
      if (effectiveAvgCommPct > 0 && effectiveAvgMarginPct > 0) {
        const gci = vol * (effectiveAvgCommPct / 100);
        setYearlyMargin(String(Math.round(gci * (effectiveAvgMarginPct / 100))));
      }
    }
  };
  const handleSalesChange = (v: string) => {
    setYearlySales(v);
    const sales = num(v) ?? 0;
    if (sales > 0 && effectiveAvgSalePrice > 0) {
      const vol = Math.round(sales * effectiveAvgSalePrice);
      setYearlyVolume(String(vol));
      if (effectiveAvgCommPct > 0 && effectiveAvgMarginPct > 0) {
        const gci = vol * (effectiveAvgCommPct / 100);
        setYearlyMargin(String(Math.round(gci * (effectiveAvgMarginPct / 100))));
      }
    }
  };
  const handleMarginChange = (v: string) => {
    setYearlyMargin(v);
    const margin = num(v) ?? 0;
    if (margin > 0 && effectiveAvgMarginPct > 0 && effectiveAvgCommPct > 0) {
      const vol = Math.round(margin / ((effectiveAvgCommPct / 100) * (effectiveAvgMarginPct / 100)));
      setYearlyVolume(String(vol));
      if (effectiveAvgSalePrice > 0) setYearlySales(String(Math.round(vol / effectiveAvgSalePrice)));
    }
  };

  // ── Step 3: Recruiting Goals ───────────────────────────────────────────────
  const [activeAgentsGoal, setActiveAgentsGoal] = useState(str(initialDraft?.yearlyActiveAgentsGoal));
  const [newHiresGoal, setNewHiresGoal] = useState(str(initialDraft?.yearlyNewHiresGoal));
  const [netGainGoal, setNetGainGoal] = useState(str(initialDraft?.netGainGoal));
  const [netMarginGoal, setNetMarginGoal] = useState(str(initialDraft?.netMarginGoal));
  const [avgFeeOverride, setAvgFeeOverride] = useState(str(initialDraft?.avgCompanyFeePerDealOverride ?? liveReference?.avgCompanyFeePerDeal));

  // ── Step 4: Activity Assumptions ──────────────────────────────────────────
  // Agent KPI goals
  const [callsGoal, setCallsGoal] = useState(str(initialDraft?.callsGoal));
  const [engagementsGoal, setEngagementsGoal] = useState(str(initialDraft?.engagementsGoal));
  const [apptSetGoal, setApptSetGoal] = useState(str(initialDraft?.appointmentsSetGoal));
  const [apptHeldGoal, setApptHeldGoal] = useState(str(initialDraft?.appointmentsHeldGoal));
  const [contractsGoal, setContractsGoal] = useState(str(initialDraft?.contractsWrittenGoal));
  const [closingsGoal, setClosingsGoal] = useState(str(initialDraft?.closingsGoal));

  // Agent KPI conversion rates
  const initAcr = initialDraft?.agentConversionRates;
  const [acrCallToEngage, setAcrCallToEngage] = useState(str(Math.round((initAcr?.callToEngagement ?? 0.10) * 100)));
  const [acrEngageToApptSet, setAcrEngageToApptSet] = useState(str(Math.round((initAcr?.engagementToAppointmentSet ?? 0.50) * 100)));
  const [acrApptSetToHeld, setAcrApptSetToHeld] = useState(str(Math.round((initAcr?.appointmentSetToHeld ?? 0.80) * 100)));
  const [acrApptHeldToContract, setAcrApptHeldToContract] = useState(str(Math.round((initAcr?.appointmentHeldToContract ?? 0.50) * 100)));
  const [acrContractToClose, setAcrContractToClose] = useState(str(Math.round((initAcr?.contractToClosing ?? 0.90) * 100)));

  // Recruiting funnel conversion rates
  const initRcr = initialDraft?.conversionRates;
  const [rcrCallToInterview, setRcrCallToInterview] = useState(str(Math.round((initRcr?.callToInterview ?? 0.20) * 100)));
  const [rcrInterviewSetToHeld, setRcrInterviewSetToHeld] = useState(str(Math.round((initRcr?.interviewSetToHeld ?? 0.70) * 100)));
  const [rcrInterviewToOffer, setRcrInterviewToOffer] = useState(str(Math.round((initRcr?.interviewToOffer ?? 0.50) * 100)));
  const [rcrOfferToCommit, setRcrOfferToCommit] = useState(str(Math.round((initRcr?.offerToCommit ?? 0.60) * 100)));
  const [rcrCommitToOnboard, setRcrCommitToOnboard] = useState(str(Math.round((initRcr?.commitToOnboard ?? 0.85) * 100)));
  const [rcrAttrition, setRcrAttrition] = useState(str(Math.round((initRcr?.expectedAttritionPct ?? 0.15) * 100)));

  // ── Build draft ────────────────────────────────────────────────────────────
  const buildDraft = useCallback((): BrokerPlanDraft => ({
    year,
    yearlyVolumeGoal: num(yearlyVolume),
    yearlySalesCountGoal: num(yearlySales),
    yearlyMarginGoal: num(yearlyMargin),
    goalAvgSalePrice: num(avgSalePrice),
    goalAvgCommissionPct: num(avgCommPct),
    goalAvgMarginPct: num(avgMarginPct),
    yearlyNewHiresGoal: num(newHiresGoal),
    yearlyActiveAgentsGoal: num(activeAgentsGoal),
    netGainGoal: num(netGainGoal),
    netMarginGoal: num(netMarginGoal),
    companyRetentionPct: (num(retentionPct) ?? 29) / 100,
    avgCompanyFeePerDealOverride: num(avgFeeOverride),
    callsGoal: num(callsGoal),
    engagementsGoal: num(engagementsGoal),
    appointmentsSetGoal: num(apptSetGoal),
    appointmentsHeldGoal: num(apptHeldGoal),
    contractsWrittenGoal: num(contractsGoal),
    closingsGoal: num(closingsGoal),
    agentConversionRates: {
      callToEngagement: (num(acrCallToEngage) ?? 10) / 100,
      engagementToAppointmentSet: (num(acrEngageToApptSet) ?? 50) / 100,
      appointmentSetToHeld: (num(acrApptSetToHeld) ?? 80) / 100,
      appointmentHeldToContract: (num(acrApptHeldToContract) ?? 50) / 100,
      contractToClosing: (num(acrContractToClose) ?? 90) / 100,
    },
    conversionRates: {
      callToInterview: (num(rcrCallToInterview) ?? 20) / 100,
      interviewSetToHeld: (num(rcrInterviewSetToHeld) ?? 70) / 100,
      interviewToOffer: (num(rcrInterviewToOffer) ?? 50) / 100,
      offerToCommit: (num(rcrOfferToCommit) ?? 60) / 100,
      commitToOnboard: (num(rcrCommitToOnboard) ?? 85) / 100,
      expectedAttritionPct: (num(rcrAttrition) ?? 15) / 100,
    },
  }), [year, yearlyVolume, yearlySales, yearlyMargin, avgSalePrice, avgCommPct, avgMarginPct,
    newHiresGoal, activeAgentsGoal, netGainGoal, netMarginGoal, retentionPct, avgFeeOverride,
    callsGoal, engagementsGoal, apptSetGoal, apptHeldGoal, contractsGoal, closingsGoal,
    acrCallToEngage, acrEngageToApptSet, acrApptSetToHeld, acrApptHeldToContract, acrContractToClose,
    rcrCallToInterview, rcrInterviewSetToHeld, rcrInterviewToOffer, rcrOfferToCommit, rcrCommitToOnboard, rcrAttrition]);

  const handleSave = async () => {
    setSaving(true);
    try { await onSave(buildDraft()); }
    finally { setSaving(false); }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-3xl mx-auto">
      <StepIndicator current={step} />

      {/* ── Step 1: Company Profile ─────────────────────────────────────────── */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              <CardTitle>Step 1 — Company Profile & Averages</CardTitle>
            </div>
            <CardDescription>
              These averages drive all the auto-calculations throughout the plan.
              They are pre-filled from last year&apos;s transaction data — adjust if your goals differ.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Live reference box */}
            {liveReference && (
              <div className="rounded-lg bg-blue-50 border border-blue-200 p-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <Info className="h-3.5 w-3.5 text-blue-600" />
                  <span className="text-xs font-semibold text-blue-700">{liveReference.year} Actuals (from your transactions)</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <RefBox label="Avg Sale Price" value={fmt$(liveReference.avgSalePrice)} />
                  <RefBox label="Avg Commission %" value={liveReference.avgCommissionPct != null ? `${liveReference.avgCommissionPct}%` : '—'} />
                  <RefBox label="Avg Gross Margin %" value={liveReference.avgGrossMarginPct != null ? `${liveReference.avgGrossMarginPct}%` : '—'} sub="of GCI company keeps" />
                  <RefBox label="Avg Company Fee/Deal" value={fmt$(liveReference.avgCompanyFeePerDeal)} sub={`${liveReference.totalDeals} deals`} />
                </div>
              </div>
            )}

            <div className="bg-card rounded-lg border divide-y">
              <FieldRow
                label="Goal Avg Sale Price"
                hint="Average sale price you expect per transaction this year"
                value={avgSalePrice}
                onChange={setAvgSalePrice}
                prefix="$"
                placeholder={str(liveReference?.avgSalePrice ?? 400000)}
              />
              <FieldRow
                label="Goal Avg Commission %"
                hint="Average GCI as a % of sale price (e.g. 2.5%)"
                value={avgCommPct}
                onChange={setAvgCommPct}
                suffix="%"
                placeholder={str(liveReference?.avgCommissionPct ?? 2.5)}
              />
              <FieldRow
                label="Goal Avg Gross Margin %"
                hint="% of GCI the company retains after paying agents"
                value={avgMarginPct}
                onChange={setAvgMarginPct}
                suffix="%"
                placeholder={str(liveReference?.avgGrossMarginPct ?? 29)}
              />
              <FieldRow
                label="Company Retention %"
                hint="Same as Gross Margin % — used in the reverse calculator"
                value={retentionPct}
                onChange={setRetentionPct}
                suffix="%"
                placeholder="29"
              />
            </div>

            <div className="flex items-start gap-2 text-xs text-muted-foreground">
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>
                <strong>Avg Gross Margin %</strong> and <strong>Company Retention %</strong> represent the same concept —
                the share of GCI your company keeps. Setting both to the same value is recommended.
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Step 2: Production Goals ────────────────────────────────────────── */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              <CardTitle>Step 2 — Production Goals</CardTitle>
            </div>
            <CardDescription>
              Enter any one field — the others auto-calculate using your averages from Step 1.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Quick increase buttons */}
            {liveReference && liveReference.totalVolume > 0 && (
              <div className="rounded-lg bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Zap className="h-4 w-4 text-blue-600" />
                  <span className="text-sm font-semibold text-blue-800">
                    Increase over {liveReference.year} ({fmt$(liveReference.totalVolume)} volume)
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {[5, 10, 15, 20, 25, 30].map(pct => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => handleVolumeChange(String(Math.round(liveReference.totalVolume * (1 + pct / 100))))}
                      className="px-3 py-1.5 rounded-full text-sm font-medium border bg-white text-blue-700 border-blue-300 hover:bg-blue-100 transition-colors"
                    >
                      +{pct}%
                    </button>
                  ))}
                </div>
                {yearlyVolume && (
                  <p className="text-xs text-blue-600 mt-2">
                    {fmt$(liveReference.totalVolume)} → {fmt$(num(yearlyVolume))}
                    {liveReference.totalVolume > 0 && num(yearlyVolume) ? ` (${(((num(yearlyVolume)! / liveReference.totalVolume) - 1) * 100).toFixed(1)}% increase)` : ''}
                  </p>
                )}
              </div>
            )}

            <div className="bg-card rounded-lg border divide-y">
              <FieldRow
                label="Yearly Dollar Volume Goal"
                hint="Total sales volume for the year — auto-calculates sales count and gross margin"
                value={yearlyVolume}
                onChange={handleVolumeChange}
                prefix="$"
                placeholder="50000000"
              />
              <FieldRow
                label="Yearly Sales Count Goal"
                hint="Number of closed transactions — auto-calculates volume and gross margin"
                value={yearlySales}
                onChange={handleSalesChange}
                placeholder="120"
              />
              <FieldRow
                label="Yearly Gross Margin Goal"
                hint="Company revenue after paying agents — auto-calculates volume and sales count"
                value={yearlyMargin}
                onChange={handleMarginChange}
                prefix="$"
                placeholder="1500000"
              />
            </div>

            {/* Auto-calc preview */}
            {(num(yearlyVolume) || num(yearlySales) || num(yearlyMargin)) && (
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border bg-primary/5 p-3 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase">Volume</p>
                  <p className="text-lg font-bold">{fmt$(num(yearlyVolume))}</p>
                </div>
                <div className="rounded-lg border bg-primary/5 p-3 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase">Sales</p>
                  <p className="text-lg font-bold">{fmtN(num(yearlySales))}</p>
                </div>
                <div className="rounded-lg border bg-primary/5 p-3 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase">Gross Margin</p>
                  <p className="text-lg font-bold">{fmt$(num(yearlyMargin))}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Step 3: Recruiting Goals ────────────────────────────────────────── */}
      {step === 3 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              <CardTitle>Step 3 — Recruiting Goals</CardTitle>
            </div>
            <CardDescription>
              Set your agent count and net margin goals. The Reverse Calculator will use these
              to show exactly how many calls, interviews, and hires you need.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-card rounded-lg border divide-y">
              <FieldRow
                label="Year-End Active Agents Goal"
                hint="Target active agent count by December 31"
                value={activeAgentsGoal}
                onChange={setActiveAgentsGoal}
                placeholder="50"
              />
              <FieldRow
                label="Yearly New Hires Goal"
                hint="How many new agents to onboard this year"
                value={newHiresGoal}
                onChange={setNewHiresGoal}
                placeholder="24"
              />
              <FieldRow
                label="Net Agent Gain Goal"
                hint="New hires minus expected departures"
                value={netGainGoal}
                onChange={setNetGainGoal}
                placeholder="10"
              />
            </div>

            <div className="rounded-lg border-2 border-primary/20 bg-primary/5 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">Net Margin Goal (Reverse Calculator)</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Enter your net margin goal and the system will reverse-calculate all the way down
                to daily prospect calls needed. This can be the same as your Gross Margin Goal from Step 2,
                or a separate net-of-expenses target.
              </p>
              <div className="bg-card rounded-lg border divide-y">
                <FieldRow
                  label="Net Margin Goal"
                  hint="Annual company net margin target (after agent splits)"
                  value={netMarginGoal}
                  onChange={setNetMarginGoal}
                  prefix="$"
                  placeholder={str(num(yearlyMargin) ?? 1500000)}
                />
                <FieldRow
                  label="Avg Company Fee Per Deal"
                  hint="Override the live average — or leave blank to use live data"
                  value={avgFeeOverride}
                  onChange={setAvgFeeOverride}
                  prefix="$"
                  placeholder={str(liveReference?.avgCompanyFeePerDeal ?? 3000)}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Step 4: Activity Assumptions ───────────────────────────────────── */}
      {step === 4 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              <CardTitle>Step 4 — Activity Assumptions</CardTitle>
            </div>
            <CardDescription>
              Set annual activity goals for your agents and the conversion rates for both
              agent sales activities and your recruiting funnel.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">

            {/* Agent KPI activity goals */}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Agent KPI Activity Goals (Annual)
              </h4>
              <div className="bg-card rounded-lg border divide-y">
                {[
                  { label: 'Prospect Calls', icon: Phone, value: callsGoal, onChange: setCallsGoal },
                  { label: 'Engagements', icon: Users, value: engagementsGoal, onChange: setEngagementsGoal },
                  { label: 'Appointments Set', icon: CalendarCheck, value: apptSetGoal, onChange: setApptSetGoal },
                  { label: 'Appointments Held', icon: CalendarCheck, value: apptHeldGoal, onChange: setApptHeldGoal },
                  { label: 'Contracts Written', icon: FileText, value: contractsGoal, onChange: setContractsGoal },
                  { label: 'Closings', icon: CheckIcon, value: closingsGoal, onChange: setClosingsGoal },
                ].map(({ label, icon: Icon, value, onChange }) => (
                  <div key={label} className="flex items-center gap-3 py-2 px-1">
                    <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="flex-1 text-sm">{label}</span>
                    <Input
                      type="number"
                      value={value}
                      onChange={e => onChange(e.target.value)}
                      className="w-24 h-7 text-sm text-right"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Agent KPI conversion rates */}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Agent Sales Conversion Rates
              </h4>
              <div className="bg-card rounded-lg border divide-y">
                <RateRow label="Call → Engagement" value={acrCallToEngage} onChange={setAcrCallToEngage} />
                <RateRow label="Engagement → Appointment Set" value={acrEngageToApptSet} onChange={setAcrEngageToApptSet} />
                <RateRow label="Appointment Set → Held" value={acrApptSetToHeld} onChange={setAcrApptSetToHeld} />
                <RateRow label="Appointment Held → Contract" value={acrApptHeldToContract} onChange={setAcrApptHeldToContract} />
                <RateRow label="Contract → Closing" value={acrContractToClose} onChange={setAcrContractToClose} />
              </div>
            </div>

            {/* Recruiting funnel conversion rates */}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Recruiting Funnel Conversion Rates
              </h4>
              <div className="bg-card rounded-lg border divide-y">
                <RateRow label="Prospect Call → Interview Set" value={rcrCallToInterview} onChange={setRcrCallToInterview} />
                <RateRow label="Interview Set → Held" value={rcrInterviewSetToHeld} onChange={setRcrInterviewSetToHeld} />
                <RateRow label="Interview Held → Offer" value={rcrInterviewToOffer} onChange={setRcrInterviewToOffer} />
                <RateRow label="Offer → Committed" value={rcrOfferToCommit} onChange={setRcrOfferToCommit} />
                <RateRow label="Committed → Onboarded" value={rcrCommitToOnboard} onChange={setRcrCommitToOnboard} />
                <RateRow label="Expected Annual Attrition" hint="% of agents expected to leave per year" value={rcrAttrition} onChange={setRcrAttrition} />
              </div>
            </div>

          </CardContent>
        </Card>
      )}

      {/* ── Step 5: Review & Save ───────────────────────────────────────────── */}
      {step === 5 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-primary" />
              <CardTitle>Step 5 — Review & Save</CardTitle>
            </div>
            <CardDescription>
              Review your {year} Broker Business Plan before saving. Everything can be edited
              on the plan page after saving.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Production */}
              <div className="rounded-lg border p-4">
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  <h4 className="text-sm font-semibold">Production Goals</h4>
                </div>
                <ReviewRow label="Dollar Volume" value={fmt$(num(yearlyVolume))} />
                <ReviewRow label="Sales Count" value={fmtN(num(yearlySales))} />
                <ReviewRow label="Gross Margin" value={fmt$(num(yearlyMargin))} />
                <ReviewRow label="Avg Sale Price" value={fmt$(num(avgSalePrice))} />
                <ReviewRow label="Avg Commission %" value={avgCommPct ? `${avgCommPct}%` : '—'} />
                <ReviewRow label="Avg Gross Margin %" value={avgMarginPct ? `${avgMarginPct}%` : '—'} />
              </div>

              {/* Recruiting */}
              <div className="rounded-lg border p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Users className="h-4 w-4 text-primary" />
                  <h4 className="text-sm font-semibold">Recruiting Goals</h4>
                </div>
                <ReviewRow label="Year-End Active Agents" value={fmtN(num(activeAgentsGoal))} />
                <ReviewRow label="New Hires" value={fmtN(num(newHiresGoal))} />
                <ReviewRow label="Net Agent Gain" value={fmtN(num(netGainGoal))} />
                <ReviewRow label="Net Margin Goal" value={fmt$(num(netMarginGoal))} />
                <ReviewRow label="Company Retention %" value={retentionPct ? `${retentionPct}%` : '—'} />
                <ReviewRow label="Avg Company Fee/Deal" value={fmt$(num(avgFeeOverride))} />
              </div>

              {/* Agent KPI */}
              <div className="rounded-lg border p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Activity className="h-4 w-4 text-primary" />
                  <h4 className="text-sm font-semibold">Agent KPI Goals</h4>
                </div>
                <ReviewRow label="Calls" value={fmtN(num(callsGoal))} />
                <ReviewRow label="Engagements" value={fmtN(num(engagementsGoal))} />
                <ReviewRow label="Appointments Set" value={fmtN(num(apptSetGoal))} />
                <ReviewRow label="Appointments Held" value={fmtN(num(apptHeldGoal))} />
                <ReviewRow label="Contracts Written" value={fmtN(num(contractsGoal))} />
                <ReviewRow label="Closings" value={fmtN(num(closingsGoal))} />
              </div>

              {/* Conversion rates */}
              <div className="rounded-lg border p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Handshake className="h-4 w-4 text-primary" />
                  <h4 className="text-sm font-semibold">Conversion Rates</h4>
                </div>
                <ReviewRow label="Call → Engagement" value={acrCallToEngage ? `${acrCallToEngage}%` : '—'} />
                <ReviewRow label="Engage → Appt Set" value={acrEngageToApptSet ? `${acrEngageToApptSet}%` : '—'} />
                <ReviewRow label="Appt Set → Held" value={acrApptSetToHeld ? `${acrApptSetToHeld}%` : '—'} />
                <ReviewRow label="Appt Held → Contract" value={acrApptHeldToContract ? `${acrApptHeldToContract}%` : '—'} />
                <ReviewRow label="Contract → Closing" value={acrContractToClose ? `${acrContractToClose}%` : '—'} />
                <ReviewRow label="Recruiting: Call → Interview" value={rcrCallToInterview ? `${rcrCallToInterview}%` : '—'} />
                <ReviewRow label="Recruiting: Attrition" value={rcrAttrition ? `${rcrAttrition}%` : '—'} />
              </div>
            </div>

            <div className="flex items-start gap-2 text-xs text-muted-foreground">
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>
                Saving will update <strong>Broker Command Goals</strong> (monthly production targets),
                <strong> KPI Goals</strong> (activity targets and conversion rates), and
                <strong> Recruiting Plan</strong> (agent count, funnel assumptions, and net margin goal) all at once.
              </span>
            </div>

          </CardContent>
        </Card>
      )}

      {/* ── Navigation ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mt-6">
        <Button
          variant="ghost"
          onClick={step === 1 ? onClose : () => setStep(s => s - 1)}
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          {step === 1 ? 'Cancel' : 'Back'}
        </Button>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Step {step} of {STEPS.length}</span>
          {step < STEPS.length ? (
            <Button onClick={() => setStep(s => s + 1)}>
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={handleSave} disabled={saving} className="min-w-[120px]">
              {saving ? (
                <span className="flex items-center gap-2">
                  <span className="h-3.5 w-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Saving…
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Check className="h-4 w-4" />
                  Save Plan
                </span>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Tiny icon alias ───────────────────────────────────────────────────────────
function CheckIcon({ className }: { className?: string }) {
  return <Check className={className} />;
}
