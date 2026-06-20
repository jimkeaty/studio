'use client';
// BrokerBusinessPlanPage.tsx
// Single-page reference view for the Broker Business Plan.
// All sections visible at once, inline editable, with live data reference boxes.
// Sections: Company Averages | Production Goals | Recruiting Goals | Activity Goals | Conversion Rates

import React, { useState, useEffect, useCallback } from 'react';
import { useUser } from '@/firebase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import {
  Save, RefreshCw, Building2, TrendingUp, Users, Activity, Handshake,
  DollarSign, Phone, CalendarCheck, FileText, Check, Info, Zap,
  UserCheck, ChevronDown, ChevronUp, ExternalLink,
} from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import Link from 'next/link';

// ── Types ─────────────────────────────────────────────────────────────────────

interface MonthlyGoal {
  grossMarginGoal: number | null;
  volumeGoal: number | null;
  salesCountGoal: number | null;
}

interface BrokerPlan {
  year: number;
  yearlyVolumeGoal: number | null;
  yearlyMarginGoal: number | null;
  yearlySalesCountGoal: number | null;
  monthlyGoals: Record<number, MonthlyGoal>;
  callsGoal: number | null;
  engagementsGoal: number | null;
  appointmentsSetGoal: number | null;
  appointmentsHeldGoal: number | null;
  contractsWrittenGoal: number | null;
  closingsGoal: number | null;
  yearlyNewHiresGoal: number | null;
  yearlyActiveAgentsGoal: number | null;
  netGainGoal: number | null;
  netMarginGoal: number | null;
  companyRetentionPct: number;
  avgCompanyFeePerDealOverride: number | null;
  conversionRates: {
    callToInterview: number;
    interviewSetToHeld: number;
    interviewToOffer: number;
    offerToCommit: number;
    commitToOnboard: number;
    expectedAttritionPct: number;
  };
  agentConversionRates: {
    callToEngagement: number;
    engagementToAppointmentSet: number;
    appointmentSetToHeld: number;
    appointmentHeldToContract: number;
    contractToClosing: number;
  };
  goalAvgSalePrice: number | null;
  goalAvgCommissionPct: number | null;
  goalAvgMarginPct: number | null;
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

interface BrokerBusinessPlanPageProps {
  year: number;
  onOpenWizard?: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function fmt$(n: number | null | undefined): string {
  if (n == null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}
function fmtN(n: number | null | undefined, d = 0): string {
  if (n == null) return '—';
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}
function fmtPct(n: number | null | undefined): string {
  if (n == null) return '—';
  return `${(n * 100).toFixed(1)}%`;
}
function num(s: string): number | null {
  const n = parseFloat(s.replace(/,/g, ''));
  return isNaN(n) ? null : n;
}
function str(n: number | null | undefined): string {
  return n != null ? String(n) : '';
}

// ── Section header ────────────────────────────────────────────────────────────

function SectionHeader({ icon: Icon, title, description, badge }: {
  icon: React.ElementType; title: string; description?: string; badge?: string;
}) {
  return (
    <div className="flex items-start gap-3 mb-4">
      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold">{title}</h3>
          {badge && <Badge variant="secondary" className="text-[10px]">{badge}</Badge>}
        </div>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
    </div>
  );
}

// ── Inline editable field ─────────────────────────────────────────────────────

function InlineField({
  label, value, onChange, prefix, suffix, hint, liveValue, liveLabel,
}: {
  label: string; value: string; onChange: (v: string) => void;
  prefix?: string; suffix?: string; hint?: string;
  liveValue?: string | null; liveLabel?: string;
}) {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        {liveValue && (
          <p className="text-xs text-blue-600 mt-0.5">
            {liveLabel ?? 'Last year'}: <strong>{liveValue}</strong>
          </p>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {prefix && <span className="text-sm text-muted-foreground">{prefix}</span>}
        <Input
          type="number"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-32 h-8 text-sm text-right"
        />
        {suffix && <span className="text-sm text-muted-foreground">{suffix}</span>}
      </div>
    </div>
  );
}

// ── Rate field ────────────────────────────────────────────────────────────────

function RateField({ label, value, onChange, hint }: {
  label: string; value: string; onChange: (v: string) => void; hint?: string;
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

// ── Main component ────────────────────────────────────────────────────────────

export function BrokerBusinessPlanPage({ year, onOpenWizard }: BrokerBusinessPlanPageProps) {
  const { user } = useUser();
  const { toast } = useToast();
  const [plan, setPlan] = useState<BrokerPlan | null>(null);
  const [liveRef, setLiveRef] = useState<LiveReference | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [monthlyOpen, setMonthlyOpen] = useState(false);

  // ── Local editable state ───────────────────────────────────────────────────
  // Company averages
  const [avgSalePrice, setAvgSalePrice] = useState('');
  const [avgCommPct, setAvgCommPct] = useState('');
  const [avgMarginPct, setAvgMarginPct] = useState('');
  const [retentionPct, setRetentionPct] = useState('');
  // Production
  const [yearlyVolume, setYearlyVolume] = useState('');
  const [yearlySales, setYearlySales] = useState('');
  const [yearlyMargin, setYearlyMargin] = useState('');
  // Recruiting
  const [activeAgentsGoal, setActiveAgentsGoal] = useState('');
  const [newHiresGoal, setNewHiresGoal] = useState('');
  const [netGainGoal, setNetGainGoal] = useState('');
  const [netMarginGoal, setNetMarginGoal] = useState('');
  const [avgFeeOverride, setAvgFeeOverride] = useState('');
  // Agent KPI goals
  const [callsGoal, setCallsGoal] = useState('');
  const [engagementsGoal, setEngagementsGoal] = useState('');
  const [apptSetGoal, setApptSetGoal] = useState('');
  const [apptHeldGoal, setApptHeldGoal] = useState('');
  const [contractsGoal, setContractsGoal] = useState('');
  const [closingsGoal, setClosingsGoal] = useState('');
  // Agent conversion rates
  const [acrCallToEngage, setAcrCallToEngage] = useState('');
  const [acrEngageToApptSet, setAcrEngageToApptSet] = useState('');
  const [acrApptSetToHeld, setAcrApptSetToHeld] = useState('');
  const [acrApptHeldToContract, setAcrApptHeldToContract] = useState('');
  const [acrContractToClose, setAcrContractToClose] = useState('');
  // Recruiting conversion rates
  const [rcrCallToInterview, setRcrCallToInterview] = useState('');
  const [rcrInterviewSetToHeld, setRcrInterviewSetToHeld] = useState('');
  const [rcrInterviewToOffer, setRcrInterviewToOffer] = useState('');
  const [rcrOfferToCommit, setRcrOfferToCommit] = useState('');
  const [rcrCommitToOnboard, setRcrCommitToOnboard] = useState('');
  const [rcrAttrition, setRcrAttrition] = useState('');
  // Monthly goals
  const [monthlyGoals, setMonthlyGoals] = useState<Record<number, { margin: string; volume: string; sales: string }>>({});

  // ── Load plan ──────────────────────────────────────────────────────────────
  const loadPlan = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/broker-plan?year=${year}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const { plan: p, liveReference } = await res.json();
      setPlan(p);
      setLiveRef(liveReference);

      // Populate editable state
      setAvgSalePrice(str(p.goalAvgSalePrice ?? liveReference?.avgSalePrice));
      setAvgCommPct(str(p.goalAvgCommissionPct ?? liveReference?.avgCommissionPct));
      setAvgMarginPct(str(p.goalAvgMarginPct ?? liveReference?.avgGrossMarginPct));
      setRetentionPct(str(Math.round((p.companyRetentionPct ?? 0.29) * 100)));
      setYearlyVolume(str(p.yearlyVolumeGoal));
      setYearlySales(str(p.yearlySalesCountGoal));
      setYearlyMargin(str(p.yearlyMarginGoal));
      setActiveAgentsGoal(str(p.yearlyActiveAgentsGoal));
      setNewHiresGoal(str(p.yearlyNewHiresGoal));
      setNetGainGoal(str(p.netGainGoal));
      setNetMarginGoal(str(p.netMarginGoal));
      setAvgFeeOverride(str(p.avgCompanyFeePerDealOverride ?? liveReference?.avgCompanyFeePerDeal));
      setCallsGoal(str(p.callsGoal));
      setEngagementsGoal(str(p.engagementsGoal));
      setApptSetGoal(str(p.appointmentsSetGoal));
      setApptHeldGoal(str(p.appointmentsHeldGoal));
      setContractsGoal(str(p.contractsWrittenGoal));
      setClosingsGoal(str(p.closingsGoal));
      // Agent conversion rates
      const acr = p.agentConversionRates;
      setAcrCallToEngage(str(Math.round((acr?.callToEngagement ?? 0.10) * 100)));
      setAcrEngageToApptSet(str(Math.round((acr?.engagementToAppointmentSet ?? 0.50) * 100)));
      setAcrApptSetToHeld(str(Math.round((acr?.appointmentSetToHeld ?? 0.80) * 100)));
      setAcrApptHeldToContract(str(Math.round((acr?.appointmentHeldToContract ?? 0.50) * 100)));
      setAcrContractToClose(str(Math.round((acr?.contractToClosing ?? 0.90) * 100)));
      // Recruiting conversion rates
      const rcr = p.conversionRates;
      setRcrCallToInterview(str(Math.round((rcr?.callToInterview ?? 0.20) * 100)));
      setRcrInterviewSetToHeld(str(Math.round((rcr?.interviewSetToHeld ?? 0.70) * 100)));
      setRcrInterviewToOffer(str(Math.round((rcr?.interviewToOffer ?? 0.50) * 100)));
      setRcrOfferToCommit(str(Math.round((rcr?.offerToCommit ?? 0.60) * 100)));
      setRcrCommitToOnboard(str(Math.round((rcr?.commitToOnboard ?? 0.85) * 100)));
      setRcrAttrition(str(Math.round((rcr?.expectedAttritionPct ?? 0.15) * 100)));
      // Monthly goals
      const mg: typeof monthlyGoals = {};
      for (let m = 1; m <= 12; m++) {
        const g = p.monthlyGoals?.[m];
        mg[m] = {
          margin: str(g?.grossMarginGoal),
          volume: str(g?.volumeGoal),
          sales: str(g?.salesCountGoal),
        };
      }
      setMonthlyGoals(mg);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [user, year]);

  useEffect(() => { loadPlan(); }, [loadPlan]);

  // ── Auto-distribute production goals across months ─────────────────────────
  const distributeMonthly = () => {
    const vol = num(yearlyVolume) ?? 0;
    const sales = num(yearlySales) ?? 0;
    const margin = num(yearlyMargin) ?? 0;
    const newMg: typeof monthlyGoals = {};
    for (let m = 1; m <= 12; m++) {
      newMg[m] = {
        volume: vol > 0 ? String(Math.round(vol / 12)) : '',
        sales: sales > 0 ? String(Math.round(sales / 12)) : '',
        margin: margin > 0 ? String(Math.round(margin / 12)) : '',
      };
    }
    setMonthlyGoals(newMg);
  };

  // ── Save ───────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const token = await user.getIdToken();
      // Build monthly goals payload
      const mgPayload: Record<number, MonthlyGoal> = {};
      for (let m = 1; m <= 12; m++) {
        mgPayload[m] = {
          grossMarginGoal: num(monthlyGoals[m]?.margin),
          volumeGoal: num(monthlyGoals[m]?.volume),
          salesCountGoal: num(monthlyGoals[m]?.sales),
        };
      }
      const body = {
        year,
        monthlyGoals: mgPayload,
        goalAvgSalePrice: num(avgSalePrice),
        goalAvgCommissionPct: num(avgCommPct),
        goalAvgMarginPct: num(avgMarginPct),
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
        yearlyNewHiresGoal: num(newHiresGoal),
        yearlyActiveAgentsGoal: num(activeAgentsGoal),
        netGainGoal: num(netGainGoal),
        netMarginGoal: num(netMarginGoal),
        companyRetentionPct: (num(retentionPct) ?? 29) / 100,
        avgCompanyFeePerDealOverride: num(avgFeeOverride),
        conversionRates: {
          callToInterview: (num(rcrCallToInterview) ?? 20) / 100,
          interviewSetToHeld: (num(rcrInterviewSetToHeld) ?? 70) / 100,
          interviewToOffer: (num(rcrInterviewToOffer) ?? 50) / 100,
          offerToCommit: (num(rcrOfferToCommit) ?? 60) / 100,
          commitToOnboard: (num(rcrCommitToOnboard) ?? 85) / 100,
          expectedAttritionPct: (num(rcrAttrition) ?? 15) / 100,
        },
      };
      const res = await fetch('/api/admin/broker-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast({ title: 'Plan Saved', description: `${year} Broker Business Plan has been updated.` });
      await loadPlan();
    } catch (e: any) {
      toast({ title: 'Save Failed', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}><CardContent className="p-6"><Skeleton className="h-32 w-full" /></CardContent></Card>
        ))}
      </div>
    );
  }
  if (error) {
    return <Alert><AlertDescription>Error loading plan: {error}</AlertDescription></Alert>;
  }

  const effectiveAvgSalePrice = num(avgSalePrice) ?? liveRef?.avgSalePrice ?? 0;
  const effectiveAvgCommPct = num(avgCommPct) ?? liveRef?.avgCommissionPct ?? 0;
  const effectiveAvgMarginPct = num(avgMarginPct) ?? liveRef?.avgGrossMarginPct ?? 0;

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

  return (
    <div className="space-y-6">

      {/* ── Header bar ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">{year} Broker Business Plan</h2>
          <p className="text-sm text-muted-foreground">
            All goals and assumptions in one place — edit any field and save.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {onOpenWizard && (
            <Button variant="outline" size="sm" onClick={onOpenWizard}>
              <Zap className="h-3.5 w-3.5 mr-1.5" />
              Setup Wizard
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={loadPlan} disabled={loading}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Refresh
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            <Save className="h-3.5 w-3.5 mr-1.5" />
            {saving ? 'Saving…' : 'Save All'}
          </Button>
        </div>
      </div>

      {/* ── Live reference bar ──────────────────────────────────────────────── */}
      {liveRef && (
        <div className="rounded-xl border bg-blue-50/50 border-blue-200 p-4">
          <div className="flex items-center gap-1.5 mb-3">
            <Info className="h-3.5 w-3.5 text-blue-600" />
            <span className="text-xs font-semibold text-blue-700">
              {liveRef.year} Actuals — from your live transaction data ({liveRef.totalDeals} closed deals)
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
            {[
              { label: 'Avg Sale Price', value: fmt$(liveRef.avgSalePrice) },
              { label: 'Avg Commission %', value: liveRef.avgCommissionPct != null ? `${liveRef.avgCommissionPct}%` : '—' },
              { label: 'Avg Gross Margin %', value: liveRef.avgGrossMarginPct != null ? `${liveRef.avgGrossMarginPct}%` : '—' },
              { label: 'Avg Company Fee/Deal', value: fmt$(liveRef.avgCompanyFeePerDeal) },
              { label: 'Total Volume', value: fmt$(liveRef.totalVolume) },
              { label: 'Total Company Revenue', value: fmt$(liveRef.totalCompanyRetained) },
            ].map(({ label, value }) => (
              <div key={label} className="bg-white rounded-lg border border-blue-100 px-3 py-2 text-center">
                <p className="text-[10px] text-muted-foreground">{label}</p>
                <p className="text-sm font-bold">{value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Section 1: Company Averages ─────────────────────────────────────── */}
      <Card>
        <CardContent className="pt-6">
          <SectionHeader
            icon={Building2}
            title="Company Averages"
            description="These drive all auto-calculations. Pre-filled from last year's data."
          />
          <div className="bg-muted/30 rounded-lg border divide-y">
            <InlineField
              label="Goal Avg Sale Price"
              hint="Expected average sale price per transaction this year"
              value={avgSalePrice}
              onChange={setAvgSalePrice}
              prefix="$"
              liveValue={fmt$(liveRef?.avgSalePrice)}
            />
            <InlineField
              label="Goal Avg Commission %"
              hint="Average GCI as a % of sale price"
              value={avgCommPct}
              onChange={setAvgCommPct}
              suffix="%"
              liveValue={liveRef?.avgCommissionPct != null ? `${liveRef.avgCommissionPct}%` : null}
            />
            <InlineField
              label="Goal Avg Gross Margin %"
              hint="% of GCI the company retains after paying agents"
              value={avgMarginPct}
              onChange={setAvgMarginPct}
              suffix="%"
              liveValue={liveRef?.avgGrossMarginPct != null ? `${liveRef.avgGrossMarginPct}%` : null}
            />
            <InlineField
              label="Company Retention % (for Reverse Calc)"
              hint="Same as Gross Margin % — used in the recruiting reverse calculator"
              value={retentionPct}
              onChange={setRetentionPct}
              suffix="%"
            />
          </div>
        </CardContent>
      </Card>

      {/* ── Section 2: Production Goals ─────────────────────────────────────── */}
      <Card>
        <CardContent className="pt-6">
          <SectionHeader
            icon={TrendingUp}
            title="Production Goals"
            description="Enter any field — the others auto-calculate using your averages above."
          />

          {/* Quick increase buttons */}
          {liveRef && liveRef.totalVolume > 0 && (
            <div className="rounded-lg bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 p-3 mb-4">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="h-3.5 w-3.5 text-blue-600" />
                <span className="text-xs font-semibold text-blue-800">
                  Quick set: increase over {liveRef.year} ({fmt$(liveRef.totalVolume)})
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[5, 10, 15, 20, 25, 30].map(pct => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => handleVolumeChange(String(Math.round(liveRef.totalVolume * (1 + pct / 100))))}
                    className="px-2.5 py-1 rounded-full text-xs font-medium border bg-white text-blue-700 border-blue-300 hover:bg-blue-100 transition-colors"
                  >
                    +{pct}%
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="bg-muted/30 rounded-lg border divide-y">
            <InlineField
              label="Yearly Dollar Volume Goal"
              hint="Auto-calculates sales count and gross margin"
              value={yearlyVolume}
              onChange={handleVolumeChange}
              prefix="$"
              liveValue={fmt$(liveRef?.totalVolume)}
            />
            <InlineField
              label="Yearly Sales Count Goal"
              hint="Auto-calculates volume and gross margin"
              value={yearlySales}
              onChange={handleSalesChange}
              liveValue={liveRef ? fmtN(liveRef.totalDeals) : null}
            />
            <InlineField
              label="Yearly Gross Margin Goal"
              hint="Auto-calculates volume and sales count"
              value={yearlyMargin}
              onChange={handleMarginChange}
              prefix="$"
              liveValue={fmt$(liveRef?.totalCompanyRetained)}
            />
          </div>

          {/* Monthly goals (collapsible) */}
          <Collapsible open={monthlyOpen} onOpenChange={setMonthlyOpen} className="mt-4">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="flex w-full justify-between px-0 hover:bg-transparent text-sm">
                <span className="font-medium">Monthly Production Goals</span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 text-xs"
                    onClick={e => { e.stopPropagation(); distributeMonthly(); }}
                  >
                    Distribute Evenly
                  </Button>
                  {monthlyOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </div>
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 pr-3 font-medium text-muted-foreground w-12">Month</th>
                      <th className="text-right py-2 px-2 font-medium text-muted-foreground">Volume</th>
                      <th className="text-right py-2 px-2 font-medium text-muted-foreground">Sales</th>
                      <th className="text-right py-2 pl-2 font-medium text-muted-foreground">Gross Margin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {MONTHS.map((label, i) => {
                      const m = i + 1;
                      const g = monthlyGoals[m] ?? { margin: '', volume: '', sales: '' };
                      return (
                        <tr key={m} className="border-b last:border-0">
                          <td className="py-1.5 pr-3 font-medium text-muted-foreground">{label}</td>
                          <td className="py-1.5 px-2">
                            <Input
                              type="number"
                              value={g.volume}
                              onChange={e => setMonthlyGoals(p => ({ ...p, [m]: { ...p[m], volume: e.target.value } }))}
                              className="h-7 text-xs text-right w-28"
                            />
                          </td>
                          <td className="py-1.5 px-2">
                            <Input
                              type="number"
                              value={g.sales}
                              onChange={e => setMonthlyGoals(p => ({ ...p, [m]: { ...p[m], sales: e.target.value } }))}
                              className="h-7 text-xs text-right w-16"
                            />
                          </td>
                          <td className="py-1.5 pl-2">
                            <Input
                              type="number"
                              value={g.margin}
                              onChange={e => setMonthlyGoals(p => ({ ...p, [m]: { ...p[m], margin: e.target.value } }))}
                              className="h-7 text-xs text-right w-28"
                            />
                          </td>
                        </tr>
                      );
                    })}
                    {/* Totals row */}
                    <tr className="border-t bg-muted/30 font-semibold">
                      <td className="py-2 pr-3 text-xs">Total</td>
                      <td className="py-2 px-2 text-right text-xs">
                        {fmt$(Object.values(monthlyGoals).reduce((s, g) => s + (num(g.volume) ?? 0), 0) || null)}
                      </td>
                      <td className="py-2 px-2 text-right text-xs">
                        {fmtN(Object.values(monthlyGoals).reduce((s, g) => s + (num(g.sales) ?? 0), 0) || null)}
                      </td>
                      <td className="py-2 pl-2 text-right text-xs">
                        {fmt$(Object.values(monthlyGoals).reduce((s, g) => s + (num(g.margin) ?? 0), 0) || null)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </CardContent>
      </Card>

      {/* ── Section 3: Recruiting Goals ─────────────────────────────────────── */}
      <Card>
        <CardContent className="pt-6">
          <SectionHeader
            icon={Users}
            title="Recruiting Goals"
            description="Agent count targets and the net margin goal that drives the Reverse Calculator."
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-muted/30 rounded-lg border divide-y">
              <InlineField label="Year-End Active Agents Goal" hint="Target active agent count by Dec 31" value={activeAgentsGoal} onChange={setActiveAgentsGoal} />
              <InlineField label="Yearly New Hires Goal" hint="New agents to onboard this year" value={newHiresGoal} onChange={setNewHiresGoal} />
              <InlineField label="Net Agent Gain Goal" hint="Hires minus expected departures" value={netGainGoal} onChange={setNetGainGoal} />
            </div>
            <div className="bg-primary/5 border-2 border-primary/20 rounded-lg divide-y">
              <InlineField
                label="Net Margin Goal (Reverse Calc)"
                hint="Annual net margin — drives recruiting activity targets"
                value={netMarginGoal}
                onChange={setNetMarginGoal}
                prefix="$"
                liveValue={fmt$(liveRef?.totalCompanyRetained)}
              />
              <InlineField
                label="Avg Company Fee Per Deal"
                hint="Override live average — blank = use live data"
                value={avgFeeOverride}
                onChange={setAvgFeeOverride}
                prefix="$"
                liveValue={fmt$(liveRef?.avgCompanyFeePerDeal)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Section 4: Agent KPI Activity Goals ─────────────────────────────── */}
      <Card>
        <CardContent className="pt-6">
          <SectionHeader
            icon={Activity}
            title="Agent KPI Activity Goals"
            description="Annual activity targets for all agents combined."
          />
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { label: 'Prospect Calls', icon: Phone, value: callsGoal, onChange: setCallsGoal },
              { label: 'Engagements', icon: Users, value: engagementsGoal, onChange: setEngagementsGoal },
              { label: 'Appointments Set', icon: CalendarCheck, value: apptSetGoal, onChange: setApptSetGoal },
              { label: 'Appointments Held', icon: CalendarCheck, value: apptHeldGoal, onChange: setApptHeldGoal },
              { label: 'Contracts Written', icon: FileText, value: contractsGoal, onChange: setContractsGoal },
              { label: 'Closings', icon: Check, value: closingsGoal, onChange: setClosingsGoal },
            ].map(({ label, icon: Icon, value, onChange }) => (
              <div key={label} className="rounded-lg border bg-muted/30 p-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                  <Label className="text-xs font-medium">{label}</Label>
                </div>
                <Input
                  type="number"
                  value={value}
                  onChange={e => onChange(e.target.value)}
                  className="h-8 text-sm text-right"
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Section 5: Conversion Rates ─────────────────────────────────────── */}
      <Card>
        <CardContent className="pt-6">
          <SectionHeader
            icon={Handshake}
            title="Conversion Rate Assumptions"
            description="Used to reverse-calculate activity goals from your production and recruiting targets."
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Agent Sales Funnel
              </h4>
              <div className="bg-muted/30 rounded-lg border divide-y">
                <RateField label="Call → Engagement" value={acrCallToEngage} onChange={setAcrCallToEngage} />
                <RateField label="Engagement → Appointment Set" value={acrEngageToApptSet} onChange={setAcrEngageToApptSet} />
                <RateField label="Appointment Set → Held" value={acrApptSetToHeld} onChange={setAcrApptSetToHeld} />
                <RateField label="Appointment Held → Contract" value={acrApptHeldToContract} onChange={setAcrApptHeldToContract} />
                <RateField label="Contract → Closing" value={acrContractToClose} onChange={setAcrContractToClose} />
              </div>
            </div>
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Recruiting Funnel
              </h4>
              <div className="bg-muted/30 rounded-lg border divide-y">
                <RateField label="Prospect Call → Interview Set" value={rcrCallToInterview} onChange={setRcrCallToInterview} />
                <RateField label="Interview Set → Held" value={rcrInterviewSetToHeld} onChange={setRcrInterviewSetToHeld} />
                <RateField label="Interview Held → Offer" value={rcrInterviewToOffer} onChange={setRcrInterviewToOffer} />
                <RateField label="Offer → Committed" value={rcrOfferToCommit} onChange={setRcrOfferToCommit} />
                <RateField label="Committed → Onboarded" value={rcrCommitToOnboard} onChange={setRcrCommitToOnboard} />
                <RateField label="Expected Annual Attrition" hint="% of agents expected to leave" value={rcrAttrition} onChange={setRcrAttrition} />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Save button (bottom) ─────────────────────────────────────────────── */}
      <div className="flex justify-end gap-2 pb-4">
        <Button variant="outline" onClick={loadPlan} disabled={loading}>
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
          Reset Changes
        </Button>
        <Button onClick={handleSave} disabled={saving} size="lg">
          <Save className="h-4 w-4 mr-2" />
          {saving ? 'Saving…' : 'Save Broker Business Plan'}
        </Button>
      </div>

    </div>
  );
}
