"use client";
// BrokerBusinessPlanInner.tsx
// Full broker & recruiting business plan — single-page layout mirroring the agent plan.
// Sections:
//   1. Plan Setup (year, mode, dates, net income goal)
//   2. Advanced Assumptions (live-data reference + editable overrides)
//   3. Annual Goals Summary (auto-calculated cascade)
//   4. Recruiting Funnel — What It Takes
//   5. Required Activities (daily/weekly/monthly/yearly)
//   6. Monthly Goal Distribution (seasonality for production, linear for agents)

import { useState, useEffect, useCallback, useRef } from "react";
import { useUser } from "@/firebase";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Target, DollarSign, Users, TrendingUp, Phone, Calendar,
  ChevronDown, ChevronUp, Save, RefreshCw, Info, BarChart3,
  Zap, UserPlus, Award, ArrowRight, CheckCircle, Percent,
  FileText,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────
type PlanMode = 'calendar' | 'rolling_back' | 'rolling_forward' | 'custom';

interface LiveData {
  avgSalePrice: number | null;
  avgCommissionPct: number | null;
  avgCompanyFeePerDeal: number | null;
  avgDealsPerAgentPerMonth: number | null;
  closedTransactions: number;
  totalVolume: number;
  totalGCI: number;
}

interface BrokerPlan {
  planMode: PlanMode;
  planStartDate: string;
  resetStartDate: string;
  customRangeStart: string;
  customRangeEnd: string;
  netMarginGoal: number;
  companyRetentionPct: number;
  avgSalePrice: number;
  avgCommissionPct: number;
  attritionPct: number;
  avgDealsPerAgentPerMonth: number;
  conversionRates: {
    callToInterview: number;
    interviewSetToHeld: number;
    interviewHeldToOffer: number;
    offerToCommitted: number;
    committedToOnboarded: number;
  };
  agentConversionRates: {
    callToEngagement: number;
    engagementToAppointmentSet: number;
    appointmentSetToHeld: number;
    appointmentHeldToContract: number;
    contractToClosing: number;
  };
  yearlyActiveAgentsGoal: number;
  yearlyNewHiresGoal: number;
  netGainGoal: number;
  annualVolumeGoal: number;
  annualSalesCountGoal: number;
  annualGrossMarginGoal: number;
  callsGoal: number;
  engagementsGoal: number;
  appointmentsSetGoal: number;
  appointmentsHeldGoal: number;
  contractsWrittenGoal: number;
  closingsGoal: number;
  seasonWeights: Record<string, { salesPct: string; volumePct: string }>;
}

interface MonthlyGoal {
  grossMarginGoal: number | null;
  volumeGoal: number | null;
  salesCountGoal: number | null;
  activeAgentsGoal: number | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────
const fmt = (n: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n);
const fmtCurrency = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
const fmtCurrencyCompact = (n: number) => {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return fmtCurrency(n);
};

const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const WORKING_DAYS_PER_YEAR = 260;
const WORKING_DAYS_PER_MONTH = 21.67;
const WORKING_DAYS_PER_WEEK = 5;

function calcCascade(plan: BrokerPlan) {
  const {
    netMarginGoal, companyRetentionPct, avgSalePrice, avgCommissionPct,
    attritionPct, avgDealsPerAgentPerMonth, conversionRates, yearlyActiveAgentsGoal,
  } = plan;

  const retPct = companyRetentionPct / 100;
  const commPct = avgCommissionPct / 100;
  const attrPct = attritionPct / 100;

  // Step 1: Company commission needed to hit net margin
  const totalCompanyCommissionNeeded = retPct > 0 ? netMarginGoal / retPct : 0;

  // Step 2: Avg GCI per deal
  const avgGCIPerDeal = avgSalePrice * commPct;

  // Step 3: Avg company fee per deal
  const avgCompanyFeePerDeal = avgGCIPerDeal * retPct;

  // Step 4: Deals needed
  const dealsNeeded = avgCompanyFeePerDeal > 0 ? totalCompanyCommissionNeeded / avgCompanyFeePerDeal : 0;

  // Step 5: Agents needed (based on deals per agent per month)
  const agentsNeededForDeals = avgDealsPerAgentPerMonth > 0
    ? dealsNeeded / (avgDealsPerAgentPerMonth * 12) : 0;

  // Step 6: New hires needed (accounting for attrition)
  const currentAgents = yearlyActiveAgentsGoal || agentsNeededForDeals;
  const agentsLostToAttrition = currentAgents * attrPct;
  const agentsNeeded = Math.max(agentsNeededForDeals, currentAgents);
  const netNewAgentsNeeded = Math.max(0, agentsNeeded - currentAgents + agentsLostToAttrition);
  const newHiresNeeded = Math.ceil(netNewAgentsNeeded);

  // Step 7: Funnel activities (annual)
  const cr = conversionRates;
  const onboardedNeeded = newHiresNeeded;
  const committedNeeded = cr.committedToOnboarded > 0 ? onboardedNeeded / (cr.committedToOnboarded / 100) : 0;
  const offersNeeded = cr.offerToCommitted > 0 ? committedNeeded / (cr.offerToCommitted / 100) : 0;
  const interviewsHeldNeeded = cr.interviewHeldToOffer > 0 ? offersNeeded / (cr.interviewHeldToOffer / 100) : 0;
  const interviewsSetNeeded = cr.interviewSetToHeld > 0 ? interviewsHeldNeeded / (cr.interviewSetToHeld / 100) : 0;
  const callsNeeded = cr.callToInterview > 0 ? interviewsSetNeeded / (cr.callToInterview / 100) : 0;

  const toTargets = (yearly: number) => ({
    yearly: Math.ceil(yearly),
    monthly: Math.ceil(yearly / 12),
    weekly: Math.ceil(yearly / 52),
    daily: Math.ceil(yearly / WORKING_DAYS_PER_YEAR * 10) / 10,
  });

  return {
    totalCompanyCommissionNeeded,
    avgGCIPerDeal,
    avgCompanyFeePerDeal,
    dealsNeeded: Math.ceil(dealsNeeded),
    agentsNeeded: Math.ceil(agentsNeeded),
    newHiresNeeded,
    activities: {
      calls: toTargets(callsNeeded),
      interviewsSet: toTargets(interviewsSetNeeded),
      interviewsHeld: toTargets(interviewsHeldNeeded),
      offers: toTargets(offersNeeded),
      committed: toTargets(committedNeeded),
      onboarded: toTargets(onboardedNeeded),
    },
  };
}

// ── LiveRefBadge ───────────────────────────────────────────────────────────
function LiveRefBadge({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5 ml-2">
      <Zap className="w-3 h-3" />
      Live: {value}
    </span>
  );
}

// ── AssumptionRow ──────────────────────────────────────────────────────────
function AssumptionRow({
  label, value, onChange, liveValue, liveLabel, suffix, prefix, step, min, max,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  liveValue?: string | null;
  liveLabel?: string;
  suffix?: string;
  prefix?: string;
  step?: string;
  min?: string;
  max?: string;
}) {
  const [useLive, setUseLive] = useState(false);
  const hasLive = liveValue != null && liveValue !== '';

  useEffect(() => {
    if (useLive && hasLive) onChange(liveValue!);
  }, [useLive, liveValue]);

  return (
    <div className="flex items-center gap-3 py-2 border-b border-border/40 last:border-0">
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium">{label}</span>
        {hasLive && (
          <LiveRefBadge label={liveLabel || 'Live'} value={liveValue!} />
        )}
      </div>
      <div className="flex items-center gap-2">
        {hasLive && (
          <button
            type="button"
            onClick={() => setUseLive(!useLive)}
            className={`text-xs px-2 py-0.5 rounded border transition-colors ${
              useLive
                ? 'bg-emerald-100 border-emerald-300 text-emerald-700'
                : 'bg-muted border-border text-muted-foreground hover:bg-muted/80'
            }`}
          >
            {useLive ? 'Using Live' : 'Use Live'}
          </button>
        )}
        <div className="flex items-center gap-1">
          {prefix && <span className="text-sm text-muted-foreground">{prefix}</span>}
          <Input
            type="number"
            value={value}
            onChange={e => { setUseLive(false); onChange(e.target.value); }}
            step={step || '1'}
            min={min || '0'}
            max={max}
            className="w-28 h-8 text-sm"
          />
          {suffix && <span className="text-sm text-muted-foreground">{suffix}</span>}
        </div>
      </div>
    </div>
  );
}

// ── CascadeStep ────────────────────────────────────────────────────────────
function CascadeStep({
  icon: Icon, label, value, sublabel, color = 'blue', isLast = false,
}: {
  icon: any; label: string; value: string; sublabel?: string; color?: string; isLast?: boolean;
}) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    green: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    purple: 'bg-purple-50 border-purple-200 text-purple-700',
    amber: 'bg-amber-50 border-amber-200 text-amber-700',
    rose: 'bg-rose-50 border-rose-200 text-rose-700',
  };
  return (
    <div className="flex flex-col items-center">
      <div className={`rounded-lg border p-3 w-full text-center ${colors[color] || colors.blue}`}>
        <Icon className="w-4 h-4 mx-auto mb-1 opacity-70" />
        <div className="text-xs text-muted-foreground mb-0.5">{label}</div>
        <div className="text-xl font-bold">{value}</div>
        {sublabel && <div className="text-xs opacity-70 mt-0.5">{sublabel}</div>}
      </div>
      {!isLast && (
        <ArrowRight className="w-4 h-4 text-muted-foreground my-1 rotate-90" />
      )}
    </div>
  );
}

// ── ActivityCard ───────────────────────────────────────────────────────────
function ActivityCard({
  label, targets, icon: Icon, color = 'blue',
}: {
  label: string;
  targets: { yearly: number; monthly: number; weekly: number; daily: number };
  icon: any;
  color?: string;
}) {
  const colors: Record<string, string> = {
    blue: 'border-blue-200 bg-blue-50/50',
    green: 'border-emerald-200 bg-emerald-50/50',
    purple: 'border-purple-200 bg-purple-50/50',
    amber: 'border-amber-200 bg-amber-50/50',
    rose: 'border-rose-200 bg-rose-50/50',
    indigo: 'border-indigo-200 bg-indigo-50/50',
  };
  return (
    <div className={`rounded-lg border p-3 ${colors[color] || colors.blue}`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-semibold">{label}</span>
      </div>
      <div className="grid grid-cols-4 gap-1 text-center">
        {[
          { label: 'Year', value: fmt(targets.yearly) },
          { label: 'Month', value: fmt(targets.monthly) },
          { label: 'Week', value: fmt(targets.weekly) },
          { label: 'Day', value: String(targets.daily) },
        ].map(({ label: l, value: v }) => (
          <div key={l}>
            <div className="text-xs text-muted-foreground">{l}</div>
            <div className="text-base font-bold">{v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────
export function BrokerBusinessPlanInner() {
  const { user } = useUser();
  const { toast } = useToast();

  const [year, setYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [resetNote, setResetNote] = useState('');
  const [assumptionsOpen, setAssumptionsOpen] = useState(true);
  const [agentKpiOpen, setAgentKpiOpen] = useState(false);

  const [liveData, setLiveData] = useState<LiveData | null>(null);
  const [currentActiveAgents, setCurrentActiveAgents] = useState(0);

  // ── Plan state ─────────────────────────────────────────────────────────
  const [planMode, setPlanMode] = useState<PlanMode>('calendar');
  const [planStartDate, setPlanStartDate] = useState('');
  const [resetStartDate, setResetStartDate] = useState('');
  const [customRangeStart, setCustomRangeStart] = useState('');
  const [customRangeEnd, setCustomRangeEnd] = useState('');

  // Financial assumptions
  const [netMarginGoal, setNetMarginGoal] = useState('1700000');
  const [companyRetentionPct, setCompanyRetentionPct] = useState('29');
  const [avgSalePrice, setAvgSalePrice] = useState('229449');
  const [avgCommissionPct, setAvgCommissionPct] = useState('2.97');
  const [attritionPct, setAttritionPct] = useState('15');
  const [avgDealsPerAgentPerMonth, setAvgDealsPerAgentPerMonth] = useState('0.78');

  // Recruiting funnel conversion rates
  const [callToInterview, setCallToInterview] = useState('20');
  const [interviewSetToHeld, setInterviewSetToHeld] = useState('70');
  const [interviewHeldToOffer, setInterviewHeldToOffer] = useState('60');
  const [offerToCommitted, setOfferToCommitted] = useState('80');
  const [committedToOnboarded, setCommittedToOnboarded] = useState('90');

  // Agent KPI conversion rates
  const [callToEngagement, setCallToEngagement] = useState('20');
  const [engagementToApptSet, setEngagementToApptSet] = useState('40');
  const [apptSetToHeld, setApptSetToHeld] = useState('75');
  const [apptHeldToContract, setApptHeldToContract] = useState('35');
  const [contractToClosing, setContractToClosing] = useState('85');

  // Headcount goals
  const [yearlyActiveAgentsGoal, setYearlyActiveAgentsGoal] = useState('85');
  const [yearlyNewHiresGoal, setYearlyNewHiresGoal] = useState('20');
  const [netGainGoal, setNetGainGoal] = useState('5');

  // Production goals
  const [annualVolumeGoal, setAnnualVolumeGoal] = useState('');
  const [annualSalesCountGoal, setAnnualSalesCountGoal] = useState('');
  const [annualGrossMarginGoal, setAnnualGrossMarginGoal] = useState('');

  // Monthly goals
  const [monthlyGoals, setMonthlyGoals] = useState<Record<number, MonthlyGoal>>({});
  const [seasonWeights, setSeasonWeights] = useState<Record<number, { salesPct: string; volumePct: string }>>(() => {
    const sw: Record<number, { salesPct: string; volumePct: string }> = {};
    for (let m = 1; m <= 12; m++) sw[m] = { salesPct: '8.33', volumePct: '8.33' };
    return sw;
  });
  const [seasonSource, setSeasonSource] = useState<'equal' | 'historical' | 'custom'>('equal');

  // ── Fetch plan ─────────────────────────────────────────────────────────
  const fetchPlan = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/broker-business-plan?year=${year}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);

      const p = data.plan as BrokerPlan;
      setLiveData(data.liveData);
      setCurrentActiveAgents(data.currentActiveAgents || 0);

      // Populate form from saved plan
      setPlanMode(p.planMode || 'calendar');
      setPlanStartDate(p.planStartDate || '');
      setResetStartDate(p.resetStartDate || '');
      setCustomRangeStart(p.customRangeStart || '');
      setCustomRangeEnd(p.customRangeEnd || '');
      setNetMarginGoal(String(p.netMarginGoal || 1700000));
      setCompanyRetentionPct(String(p.companyRetentionPct || 29));
      setAvgSalePrice(String(p.avgSalePrice || 229449));
      setAvgCommissionPct(String(p.avgCommissionPct || 2.97));
      setAttritionPct(String(p.attritionPct || 15));
      setAvgDealsPerAgentPerMonth(String(p.avgDealsPerAgentPerMonth || 0.78));
      setCallToInterview(String(p.conversionRates?.callToInterview || 20));
      setInterviewSetToHeld(String(p.conversionRates?.interviewSetToHeld || 70));
      setInterviewHeldToOffer(String(p.conversionRates?.interviewHeldToOffer || 60));
      setOfferToCommitted(String(p.conversionRates?.offerToCommitted || 80));
      setCommittedToOnboarded(String(p.conversionRates?.committedToOnboarded || 90));
      setCallToEngagement(String(p.agentConversionRates?.callToEngagement || 20));
      setEngagementToApptSet(String(p.agentConversionRates?.engagementToAppointmentSet || 40));
      setApptSetToHeld(String(p.agentConversionRates?.appointmentSetToHeld || 75));
      setApptHeldToContract(String(p.agentConversionRates?.appointmentHeldToContract || 35));
      setContractToClosing(String(p.agentConversionRates?.contractToClosing || 85));
      setYearlyActiveAgentsGoal(String(p.yearlyActiveAgentsGoal || 85));
      setYearlyNewHiresGoal(String(p.yearlyNewHiresGoal || 20));
      setNetGainGoal(String(p.netGainGoal || 5));
      setAnnualVolumeGoal(p.annualVolumeGoal ? String(p.annualVolumeGoal) : '');
      setAnnualSalesCountGoal(p.annualSalesCountGoal ? String(p.annualSalesCountGoal) : '');
      setAnnualGrossMarginGoal(p.annualGrossMarginGoal ? String(p.annualGrossMarginGoal) : '');

      if (data.monthlyGoals) setMonthlyGoals(data.monthlyGoals);
      if (p.seasonWeights) {
        const sw: Record<number, { salesPct: string; volumePct: string }> = {};
        for (let m = 1; m <= 12; m++) {
          sw[m] = p.seasonWeights[String(m)] || { salesPct: '8.33', volumePct: '8.33' };
        }
        setSeasonWeights(sw);
      }
    } catch (err: any) {
      toast({ title: 'Error loading plan', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [user, year]);

  useEffect(() => { fetchPlan(); }, [fetchPlan]);

  // ── Build current plan object for calculations ─────────────────────────
  const currentPlan: BrokerPlan = {
    planMode, planStartDate, resetStartDate, customRangeStart, customRangeEnd,
    netMarginGoal: parseFloat(netMarginGoal) || 0,
    companyRetentionPct: parseFloat(companyRetentionPct) || 29,
    avgSalePrice: parseFloat(avgSalePrice) || 229449,
    avgCommissionPct: parseFloat(avgCommissionPct) || 2.97,
    attritionPct: parseFloat(attritionPct) || 15,
    avgDealsPerAgentPerMonth: parseFloat(avgDealsPerAgentPerMonth) || 0.78,
    conversionRates: {
      callToInterview: parseFloat(callToInterview) || 20,
      interviewSetToHeld: parseFloat(interviewSetToHeld) || 70,
      interviewHeldToOffer: parseFloat(interviewHeldToOffer) || 60,
      offerToCommitted: parseFloat(offerToCommitted) || 80,
      committedToOnboarded: parseFloat(committedToOnboarded) || 90,
    },
    agentConversionRates: {
      callToEngagement: parseFloat(callToEngagement) || 20,
      engagementToAppointmentSet: parseFloat(engagementToApptSet) || 40,
      appointmentSetToHeld: parseFloat(apptSetToHeld) || 75,
      appointmentHeldToContract: parseFloat(apptHeldToContract) || 35,
      contractToClosing: parseFloat(contractToClosing) || 85,
    },
    yearlyActiveAgentsGoal: parseInt(yearlyActiveAgentsGoal) || 85,
    yearlyNewHiresGoal: parseInt(yearlyNewHiresGoal) || 20,
    netGainGoal: parseInt(netGainGoal) || 5,
    annualVolumeGoal: parseFloat(annualVolumeGoal) || 0,
    annualSalesCountGoal: parseInt(annualSalesCountGoal) || 0,
    annualGrossMarginGoal: parseFloat(annualGrossMarginGoal) || 0,
    callsGoal: 0, engagementsGoal: 0, appointmentsSetGoal: 0,
    appointmentsHeldGoal: 0, contractsWrittenGoal: 0, closingsGoal: 0,
    seasonWeights: {},
  };

  const cascade = calcCascade(currentPlan);

  // ── Auto-calculate production goals from cascade ───────────────────────
  useEffect(() => {
    if (!annualSalesCountGoal) {
      const autoSales = cascade.dealsNeeded;
      if (autoSales > 0) {
        const autoVolume = autoSales * currentPlan.avgSalePrice;
        const autoMargin = autoVolume * (currentPlan.avgCommissionPct / 100) * (currentPlan.companyRetentionPct / 100);
        if (!annualVolumeGoal) setAnnualVolumeGoal(String(Math.round(autoVolume)));
        if (!annualGrossMarginGoal) setAnnualGrossMarginGoal(String(Math.round(autoMargin)));
      }
    }
  }, [cascade.dealsNeeded, currentPlan.avgSalePrice]);

  // ── Distribute monthly goals ───────────────────────────────────────────
  const distributeMonthly = useCallback(() => {
    const annualMargin = parseFloat(annualGrossMarginGoal) || cascade.totalCompanyCommissionNeeded;
    const annualVolume = parseFloat(annualVolumeGoal) || (cascade.dealsNeeded * currentPlan.avgSalePrice);
    const annualSales = parseInt(annualSalesCountGoal) || cascade.dealsNeeded;
    const agentGoal = parseInt(yearlyActiveAgentsGoal) || 85;
    const agentStart = currentActiveAgents;
    const agentMonthlyIncrease = (agentGoal - agentStart) / 12;

    const newGoals: Record<number, MonthlyGoal> = {};
    for (let m = 1; m <= 12; m++) {
      const sw = seasonWeights[m] || { salesPct: '8.33', volumePct: '8.33' };
      const salesPct = parseFloat(sw.salesPct) / 100;
      const volumePct = parseFloat(sw.volumePct) / 100;
      newGoals[m] = {
        grossMarginGoal: Math.round(annualMargin * salesPct),
        volumeGoal: Math.round(annualVolume * volumePct),
        salesCountGoal: Math.round(annualSales * salesPct),
        activeAgentsGoal: Math.round(agentStart + agentMonthlyIncrease * m),
      };
    }
    setMonthlyGoals(newGoals);
  }, [annualGrossMarginGoal, annualVolumeGoal, annualSalesCountGoal, yearlyActiveAgentsGoal,
      currentActiveAgents, seasonWeights, cascade]);

  // ── Save plan ──────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const token = await user.getIdToken();
      const sw: Record<string, any> = {};
      for (let m = 1; m <= 12; m++) sw[String(m)] = seasonWeights[m];

      const res = await fetch('/api/admin/broker-business-plan', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year,
          planMode, planStartDate, resetStartDate, customRangeStart, customRangeEnd,
          netMarginGoal: parseFloat(netMarginGoal) || 0,
          companyRetentionPct: parseFloat(companyRetentionPct) || 29,
          avgSalePrice: parseFloat(avgSalePrice) || 0,
          avgCommissionPct: parseFloat(avgCommissionPct) || 0,
          attritionPct: parseFloat(attritionPct) || 0,
          avgDealsPerAgentPerMonth: parseFloat(avgDealsPerAgentPerMonth) || 0,
          conversionRates: currentPlan.conversionRates,
          agentConversionRates: currentPlan.agentConversionRates,
          yearlyActiveAgentsGoal: parseInt(yearlyActiveAgentsGoal) || 0,
          yearlyNewHiresGoal: parseInt(yearlyNewHiresGoal) || 0,
          netGainGoal: parseInt(netGainGoal) || 0,
          annualVolumeGoal: parseFloat(annualVolumeGoal) || 0,
          annualSalesCountGoal: parseInt(annualSalesCountGoal) || 0,
          annualGrossMarginGoal: parseFloat(annualGrossMarginGoal) || 0,
          monthlyGoals,
          seasonWeights: sw,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      toast({ title: 'Business plan saved', description: 'All goals and assumptions updated.' });
    } catch (err: any) {
      toast({ title: 'Save failed', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  // ── Reset plan ─────────────────────────────────────────────────────────
  const handleReset = async () => {
    if (!user) return;
    setResetting(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/broker-business-plan/reset', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, note: resetNote }),
      });
      const data = await res.json();
      if (!data.ok && !data.resetStartDate) throw new Error(data.error);
      setResetStartDate(data.resetStartDate);
      setShowResetDialog(false);
      setResetNote('');
      toast({ title: 'Plan reset', description: `Plan clock restarted from today (${data.resetStartDate}). Goals unchanged.` });
    } catch (err: any) {
      toast({ title: 'Reset failed', description: err.message, variant: 'destructive' });
    } finally {
      setResetting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground animate-pulse">Loading business plan…</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-primary" />
            Broker &amp; Recruiting Business Plan
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Set your annual net income goal, assumptions, and recruiting targets. All downstream goals and activities are calculated automatically.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            {[2024, 2025, 2026, 2027].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <Button variant="outline" size="sm" onClick={() => setShowResetDialog(true)}>
            <RefreshCw className="w-4 h-4 mr-1" /> Reset Plan
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            <Save className="w-4 h-4 mr-1" /> {saving ? 'Saving…' : 'Save Plan'}
          </Button>
        </div>
      </div>

      {/* ── Section 1: Plan Setup ────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="w-4 h-4 text-primary" /> Plan Setup
          </CardTitle>
          <CardDescription>Set your plan year, date mode, and annual net income goal.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Net Margin Goal — the primary input */}
          <div className="flex items-center gap-4 p-4 bg-primary/5 rounded-lg border border-primary/20">
            <DollarSign className="w-8 h-8 text-primary flex-shrink-0" />
            <div className="flex-1">
              <Label className="text-base font-semibold">Annual Net Income / Margin Goal</Label>
              <p className="text-xs text-muted-foreground">This is the company&apos;s net profit goal after all expenses. All recruiting and production targets cascade from this number.</p>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-sm text-muted-foreground">$</span>
              <Input
                type="number"
                value={netMarginGoal}
                onChange={e => setNetMarginGoal(e.target.value)}
                className="w-36 text-lg font-bold"
              />
            </div>
          </div>

          {/* Plan Mode */}
          <div>
            <Label className="text-sm font-medium mb-2 block">Plan Date Mode</Label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {([
                { id: 'calendar', label: 'Calendar Year', desc: `Jan 1 – Dec 31, ${year}` },
                { id: 'rolling_back', label: 'Rolling 12 Back', desc: 'Last 12 months' },
                { id: 'rolling_forward', label: 'Rolling 12 Forward', desc: 'Next 12 months' },
                { id: 'custom', label: 'Custom Range', desc: 'Pick start & end' },
              ] as { id: PlanMode; label: string; desc: string }[]).map(m => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setPlanMode(m.id)}
                  className={`rounded-lg border p-3 text-left transition-colors ${
                    planMode === m.id
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-border hover:bg-muted/50'
                  }`}
                >
                  <div className="text-sm font-medium">{m.label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{m.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Date fields */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label className="text-xs text-muted-foreground">Plan Start Date</Label>
              <Input type="date" value={planStartDate} onChange={e => setPlanStartDate(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Reset Start Date <span className="text-muted-foreground/60">(optional — restarts pacing)</span></Label>
              <Input type="date" value={resetStartDate} onChange={e => setResetStartDate(e.target.value)} className="mt-1" />
            </div>
            {planMode === 'custom' && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs text-muted-foreground">Custom Start</Label>
                  <Input type="date" value={customRangeStart} onChange={e => setCustomRangeStart(e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Custom End</Label>
                  <Input type="date" value={customRangeEnd} onChange={e => setCustomRangeEnd(e.target.value)} className="mt-1" />
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Section 2: Advanced Assumptions ─────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Percent className="w-4 h-4 text-primary" /> Advanced Assumptions
              </CardTitle>
              <CardDescription>
                Live data from your transactions pre-fills these values. Edit and save to lock in your plan assumptions.
              </CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setAssumptionsOpen(!assumptionsOpen)}>
              {assumptionsOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
          </div>
        </CardHeader>
        {assumptionsOpen && (
          <CardContent className="space-y-6">
            {/* Financial assumptions */}
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Financial Assumptions</h3>
              <div className="space-y-0 divide-y divide-border/40">
                <AssumptionRow
                  label="Company Retention / Split %" value={companyRetentionPct} onChange={setCompanyRetentionPct}
                  suffix="%" step="0.5" min="0" max="100"
                />
                <AssumptionRow
                  label="Avg Sale Price" value={avgSalePrice} onChange={setAvgSalePrice}
                  prefix="$" step="1000"
                  liveValue={liveData?.avgSalePrice ? fmtCurrency(liveData.avgSalePrice) : null}
                />
                <AssumptionRow
                  label="Avg Commission %" value={avgCommissionPct} onChange={setAvgCommissionPct}
                  suffix="%" step="0.01" min="0" max="10"
                  liveValue={liveData?.avgCommissionPct ? `${liveData.avgCommissionPct.toFixed(2)}%` : null}
                />
                <div className="py-2 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Avg GCI Per Deal <span className="text-xs">(derived)</span></span>
                  <span className="font-semibold text-emerald-700">
                    {fmtCurrency(currentPlan.avgSalePrice * (currentPlan.avgCommissionPct / 100))}
                  </span>
                </div>
                <div className="py-2 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Avg Company Fee Per Deal <span className="text-xs">(derived)</span></span>
                  <span className="font-semibold text-emerald-700">
                    {fmtCurrency(cascade.avgCompanyFeePerDeal)}
                  </span>
                </div>
                <AssumptionRow
                  label="Avg Deals Per Agent Per Month" value={avgDealsPerAgentPerMonth} onChange={setAvgDealsPerAgentPerMonth}
                  step="0.01" min="0"
                  liveValue={liveData?.avgDealsPerAgentPerMonth ? liveData.avgDealsPerAgentPerMonth.toFixed(2) : null}
                />
                <AssumptionRow
                  label="Annual Agent Attrition %" value={attritionPct} onChange={setAttritionPct}
                  suffix="%" step="1" min="0" max="100"
                />
              </div>
            </div>

            <Separator />

            {/* Recruiting funnel conversion rates */}
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Recruiting Funnel Conversion Rates</h3>
              <div className="space-y-0 divide-y divide-border/40">
                <AssumptionRow label="Prospect Call → Interview Set" value={callToInterview} onChange={setCallToInterview} suffix="%" step="1" min="0" max="100" />
                <AssumptionRow label="Interview Set → Interview Held" value={interviewSetToHeld} onChange={setInterviewSetToHeld} suffix="%" step="1" min="0" max="100" />
                <AssumptionRow label="Interview Held → Offer Made" value={interviewHeldToOffer} onChange={setInterviewHeldToOffer} suffix="%" step="1" min="0" max="100" />
                <AssumptionRow label="Offer Made → Committed" value={offerToCommitted} onChange={setOfferToCommitted} suffix="%" step="1" min="0" max="100" />
                <AssumptionRow label="Committed → Onboarded" value={committedToOnboarded} onChange={setCommittedToOnboarded} suffix="%" step="1" min="0" max="100" />
              </div>
            </div>

            <Separator />

            {/* Agent KPI conversion rates — collapsible */}
            <Collapsible open={agentKpiOpen} onOpenChange={setAgentKpiOpen}>
              <CollapsibleTrigger asChild>
                <button type="button" className="flex items-center justify-between w-full text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Agent KPI Conversion Rates
                  {agentKpiOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-3 space-y-0 divide-y divide-border/40">
                <AssumptionRow label="Called → Engagement" value={callToEngagement} onChange={setCallToEngagement} suffix="%" step="1" min="0" max="100" />
                <AssumptionRow label="Engagement → Appt Set" value={engagementToApptSet} onChange={setEngagementToApptSet} suffix="%" step="1" min="0" max="100" />
                <AssumptionRow label="Appt Set → Appt Held" value={apptSetToHeld} onChange={setApptSetToHeld} suffix="%" step="1" min="0" max="100" />
                <AssumptionRow label="Appt Held → Contract" value={apptHeldToContract} onChange={setApptHeldToContract} suffix="%" step="1" min="0" max="100" />
                <AssumptionRow label="Contract → Closing" value={contractToClosing} onChange={setContractToClosing} suffix="%" step="1" min="0" max="100" />
              </CollapsibleContent>
            </Collapsible>
          </CardContent>
        )}
      </Card>

      {/* ── Section 3: Annual Goals Summary ─────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Award className="w-4 h-4 text-primary" /> Annual Goals Summary
          </CardTitle>
          <CardDescription>Auto-calculated from your assumptions. Override any field manually.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {[
              { label: 'Net Margin Goal', value: fmtCurrencyCompact(currentPlan.netMarginGoal), color: 'bg-primary/5 border-primary/20 text-primary' },
              { label: 'Company Commission Needed', value: fmtCurrencyCompact(cascade.totalCompanyCommissionNeeded), color: 'bg-blue-50 border-blue-200 text-blue-700' },
              { label: 'Total Deals Needed', value: fmt(cascade.dealsNeeded), color: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
              { label: 'Agents Needed', value: fmt(cascade.agentsNeeded), color: 'bg-purple-50 border-purple-200 text-purple-700' },
            ].map(({ label, value, color }) => (
              <div key={label} className={`rounded-lg border p-3 text-center ${color}`}>
                <div className="text-xs text-muted-foreground mb-1">{label}</div>
                <div className="text-2xl font-bold">{value}</div>
              </div>
            ))}
          </div>

          <Separator className="my-4" />

          {/* Headcount goals */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <Label className="text-xs text-muted-foreground">Active Agents Goal (Year-End)</Label>
              <Input type="number" value={yearlyActiveAgentsGoal} onChange={e => setYearlyActiveAgentsGoal(e.target.value)} className="mt-1" />
              <p className="text-xs text-muted-foreground mt-1">Currently: {currentActiveAgents} active</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">New Hires Goal</Label>
              <div className="flex items-center gap-2 mt-1">
                <Input type="number" value={yearlyNewHiresGoal} onChange={e => setYearlyNewHiresGoal(e.target.value)} />
                <Badge variant="outline" className="text-xs whitespace-nowrap">
                  Calc: {cascade.newHiresNeeded}
                </Badge>
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Net Agent Gain Goal</Label>
              <Input type="number" value={netGainGoal} onChange={e => setNetGainGoal(e.target.value)} className="mt-1" />
            </div>
          </div>

          {/* Production goals */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label className="text-xs text-muted-foreground">Annual Volume Goal</Label>
              <div className="flex items-center gap-2 mt-1">
                <Input type="number" value={annualVolumeGoal} onChange={e => setAnnualVolumeGoal(e.target.value)} placeholder={fmt(cascade.dealsNeeded * currentPlan.avgSalePrice)} />
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Annual Sales Count Goal</Label>
              <div className="flex items-center gap-2 mt-1">
                <Input type="number" value={annualSalesCountGoal} onChange={e => setAnnualSalesCountGoal(e.target.value)} placeholder={String(cascade.dealsNeeded)} />
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Annual Gross Margin Goal</Label>
              <div className="flex items-center gap-2 mt-1">
                <Input type="number" value={annualGrossMarginGoal} onChange={e => setAnnualGrossMarginGoal(e.target.value)} placeholder={fmt(cascade.totalCompanyCommissionNeeded)} />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Section 4: Recruiting Funnel ─────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-primary" /> Recruiting Funnel — What It Takes
          </CardTitle>
          <CardDescription>
            The full cascade from net income goal down to daily prospecting calls.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Top cascade: financial → deals → agents */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-6">
            <CascadeStep icon={DollarSign} label="Net Margin Goal" value={fmtCurrencyCompact(currentPlan.netMarginGoal)} color="blue" />
            <CascadeStep icon={TrendingUp} label="Company Commission Needed" value={fmtCurrencyCompact(cascade.totalCompanyCommissionNeeded)} sublabel={`÷ ${currentPlan.companyRetentionPct}% retention`} color="blue" />
            <CascadeStep icon={BarChart3} label="Total Deals Needed" value={fmt(cascade.dealsNeeded)} sublabel={`@ ${fmtCurrencyCompact(cascade.avgCompanyFeePerDeal)}/deal`} color="green" />
            <CascadeStep icon={Users} label="Agents Needed" value={fmt(cascade.agentsNeeded)} sublabel={`${currentPlan.avgDealsPerAgentPerMonth} deals/agent/mo`} color="purple" isLast />
          </div>

          <div className="flex items-center gap-2 mb-4">
            <ArrowRight className="w-4 h-4 text-muted-foreground rotate-90" />
            <span className="text-sm text-muted-foreground">
              With {currentPlan.attritionPct}% attrition → <strong>{cascade.newHiresNeeded} new hires needed</strong>
            </span>
          </div>

          {/* Funnel activities */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
            {[
              { label: 'Prospect Calls', targets: cascade.activities.calls, icon: Phone, color: 'rose' },
              { label: 'Interviews Set', targets: cascade.activities.interviewsSet, icon: Calendar, color: 'amber' },
              { label: 'Interviews Held', targets: cascade.activities.interviewsHeld, icon: Users, color: 'amber' },
              { label: 'Offers Made', targets: cascade.activities.offers, icon: FileText, color: 'blue' },
              { label: 'Committed', targets: cascade.activities.committed, icon: CheckCircle, color: 'green' },
              { label: 'Onboarded', targets: cascade.activities.onboarded, icon: UserPlus, color: 'green' },
            ].map(({ label, targets, icon, color }) => (
              <ActivityCard key={label} label={label} targets={targets} icon={icon} color={color} />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Section 5: Required Activities ──────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" /> Required Daily Activities
          </CardTitle>
          <CardDescription>What the broker or Director of Agent Development needs to do every day to hit the plan.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Activity</TableHead>
                  <TableHead className="text-right">Daily</TableHead>
                  <TableHead className="text-right">Weekly</TableHead>
                  <TableHead className="text-right">Monthly</TableHead>
                  <TableHead className="text-right">Annual</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[
                  { label: 'Prospect Calls', targets: cascade.activities.calls },
                  { label: 'Interviews Set', targets: cascade.activities.interviewsSet },
                  { label: 'Interviews Held', targets: cascade.activities.interviewsHeld },
                  { label: 'Offers Made', targets: cascade.activities.offers },
                  { label: 'Committed', targets: cascade.activities.committed },
                  { label: 'Onboarded / New Hires', targets: cascade.activities.onboarded },
                ].map(({ label, targets }) => (
                  <TableRow key={label}>
                    <TableCell className="font-medium">{label}</TableCell>
                    <TableCell className="text-right">{targets.daily}</TableCell>
                    <TableCell className="text-right">{fmt(targets.weekly)}</TableCell>
                    <TableCell className="text-right">{fmt(targets.monthly)}</TableCell>
                    <TableCell className="text-right font-semibold">{fmt(targets.yearly)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ── Section 6: Monthly Goal Distribution ────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Calendar className="w-4 h-4 text-primary" /> Monthly Goal Distribution
              </CardTitle>
              <CardDescription>
                Production goals use brokerage seasonality. Active agent goals increase linearly (no seasonality).
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                Distribute by:
              </div>
              {([
                { id: 'equal', label: 'Equal' },
                { id: 'historical', label: 'Historical' },
                { id: 'custom', label: 'Custom' },
              ] as { id: typeof seasonSource; label: string }[]).map(s => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSeasonSource(s.id)}
                  className={`text-xs px-2 py-1 rounded border transition-colors ${
                    seasonSource === s.id
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-border hover:bg-muted/50'
                  }`}
                >
                  {s.label}
                </button>
              ))}
              <Button size="sm" variant="outline" onClick={distributeMonthly}>
                <TrendingUp className="w-3 h-3 mr-1" /> Distribute
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead className="text-right">Sales %</TableHead>
                  <TableHead className="text-right">Vol %</TableHead>
                  <TableHead className="text-right">Sales Count</TableHead>
                  <TableHead className="text-right">Volume</TableHead>
                  <TableHead className="text-right">Gross Margin</TableHead>
                  <TableHead className="text-right">Active Agents</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {MONTH_LABELS.map((label, idx) => {
                  const m = idx + 1;
                  const sw = seasonWeights[m] || { salesPct: '8.33', volumePct: '8.33' };
                  const g = monthlyGoals[m] || { grossMarginGoal: null, volumeGoal: null, salesCountGoal: null, activeAgentsGoal: null };
                  return (
                    <TableRow key={m}>
                      <TableCell className="font-medium">{label}</TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          value={sw.salesPct}
                          onChange={e => setSeasonWeights(prev => ({ ...prev, [m]: { ...prev[m], salesPct: e.target.value } }))}
                          className="w-16 h-7 text-xs text-right"
                          step="0.01"
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          value={sw.volumePct}
                          onChange={e => setSeasonWeights(prev => ({ ...prev, [m]: { ...prev[m], volumePct: e.target.value } }))}
                          className="w-16 h-7 text-xs text-right"
                          step="0.01"
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          value={g.salesCountGoal ?? ''}
                          onChange={e => setMonthlyGoals(prev => ({ ...prev, [m]: { ...prev[m], salesCountGoal: parseInt(e.target.value) || null } }))}
                          className="w-20 h-7 text-xs text-right"
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          value={g.volumeGoal ?? ''}
                          onChange={e => setMonthlyGoals(prev => ({ ...prev, [m]: { ...prev[m], volumeGoal: parseFloat(e.target.value) || null } }))}
                          className="w-28 h-7 text-xs text-right"
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          value={g.grossMarginGoal ?? ''}
                          onChange={e => setMonthlyGoals(prev => ({ ...prev, [m]: { ...prev[m], grossMarginGoal: parseFloat(e.target.value) || null } }))}
                          className="w-28 h-7 text-xs text-right"
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          value={g.activeAgentsGoal ?? ''}
                          onChange={e => setMonthlyGoals(prev => ({ ...prev, [m]: { ...prev[m], activeAgentsGoal: parseInt(e.target.value) || null } }))}
                          className="w-20 h-7 text-xs text-right"
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
                {/* Totals row */}
                <TableRow className="font-semibold bg-muted/30">
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right">
                    {Object.values(seasonWeights).reduce((s, w) => s + (parseFloat(w.salesPct) || 0), 0).toFixed(1)}%
                  </TableCell>
                  <TableCell className="text-right">
                    {Object.values(seasonWeights).reduce((s, w) => s + (parseFloat(w.volumePct) || 0), 0).toFixed(1)}%
                  </TableCell>
                  <TableCell className="text-right">
                    {fmt(Object.values(monthlyGoals).reduce((s, g) => s + (g.salesCountGoal || 0), 0))}
                  </TableCell>
                  <TableCell className="text-right">
                    {fmtCurrencyCompact(Object.values(monthlyGoals).reduce((s, g) => s + (g.volumeGoal || 0), 0))}
                  </TableCell>
                  <TableCell className="text-right">
                    {fmtCurrencyCompact(Object.values(monthlyGoals).reduce((s, g) => s + (g.grossMarginGoal || 0), 0))}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">—</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ── Save button (bottom) ─────────────────────────────────────────── */}
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={() => setShowResetDialog(true)}>
          <RefreshCw className="w-4 h-4 mr-1" /> Reset Plan Clock
        </Button>
        <Button onClick={handleSave} disabled={saving} size="lg">
          <Save className="w-4 h-4 mr-1" /> {saving ? 'Saving…' : 'Save Business Plan'}
        </Button>
      </div>

      {/* ── Reset Dialog ─────────────────────────────────────────────────── */}
      <Dialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Plan Clock</DialogTitle>
            <DialogDescription>
              This resets the pacing start date to today. All goals and assumptions remain unchanged — only the clock restarts. Use this if you&apos;re starting a new plan mid-year.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label>Optional note (why are you resetting?)</Label>
            <textarea
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[80px]"
              placeholder="e.g. Starting fresh after Q2 review…"
              value={resetNote}
              onChange={e => setResetNote(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResetDialog(false)}>Cancel</Button>
            <Button onClick={handleReset} disabled={resetting}>
              <RefreshCw className="w-4 h-4 mr-1" />
              {resetting ? 'Resetting…' : 'Reset Plan Clock'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

