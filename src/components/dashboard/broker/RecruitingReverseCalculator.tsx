'use client';
// RecruitingReverseCalculator.tsx
// Reverse-calculation engine: Net Margin Goal → Company Commission → Deals → Agents → Recruiting Activities
// All assumptions are editable with a "Use Live Data" toggle for live-data fields.

import React, { useState, useCallback, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  ChevronDown, ChevronRight, ChevronUp, Info, Save, RotateCcw,
  DollarSign, Users, Phone, CalendarCheck, FileText, Handshake, UserCheck,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

interface ConversionRates {
  callToInterview: number;
  interviewSetToHeld: number;
  interviewToOffer: number;
  offerToCommit: number;
  commitToOnboard: number;
  expectedAttritionPct: number;
}

interface RecruitingReverseCalculatorProps {
  // Live data from API
  liveAvgCompanyFeePerDeal: number | null;
  liveAvgDealsPerAgentPerMonth: number;
  currentActiveAgents: number;
  conversionRates: ConversionRates;
  companyRetentionPct: number;           // default 0.29
  avgCompanyFeePerDealOverride: number | null;
  netMarginGoal: number | null;
  year: number;
  // Callbacks
  onSavePlan?: (updates: {
    netMarginGoal: number;
    companyRetentionPct: number;
    avgCompanyFeePerDealOverride: number | null;
    conversionRates: ConversionRates;
  }) => Promise<void>;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt$(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function fmtN(n: number, decimals = 0): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtPct(n: number): string {
  return (n * 100).toFixed(1) + '%';
}

// ── Cascade step display ─────────────────────────────────────────────────────

interface CascadeStepProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  sublabel?: string;
  highlight?: boolean;
  arrow?: boolean;
}

function CascadeStep({ icon, label, value, sublabel, highlight, arrow }: CascadeStepProps) {
  return (
    <div className="flex flex-col items-center">
      <div className={`rounded-xl border px-5 py-4 text-center w-full ${highlight ? 'bg-primary/5 border-primary/30' : 'bg-card'}`}>
        <div className="flex justify-center mb-1 text-muted-foreground">{icon}</div>
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">{label}</p>
        <p className={`text-2xl font-bold tabular-nums ${highlight ? 'text-primary' : ''}`}>{value}</p>
        {sublabel && <p className="text-[11px] text-muted-foreground mt-0.5">{sublabel}</p>}
      </div>
      {arrow && (
        <div className="my-1 text-muted-foreground">
          <ChevronDown className="h-5 w-5" />
        </div>
      )}
    </div>
  );
}

// ── Assumption row ───────────────────────────────────────────────────────────

interface AssumptionRowProps {
  label: string;
  liveValue?: string | null;
  value: string;
  useLive: boolean;
  canUseLive: boolean;
  onChange: (v: string) => void;
  onToggleLive: (v: boolean) => void;
  hint?: string;
  prefix?: string;
  suffix?: string;
}

function AssumptionRow({
  label, liveValue, value, useLive, canUseLive, onChange, onToggleLive, hint, prefix, suffix,
}: AssumptionRowProps) {
  return (
    <div className="flex items-center gap-3 py-2 border-b last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {canUseLive && (
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[10px] text-muted-foreground">Live</span>
          <Switch
            checked={useLive}
            onCheckedChange={onToggleLive}
            className="scale-75"
          />
        </div>
      )}
      <div className="flex items-center gap-1 shrink-0">
        {prefix && <span className="text-sm text-muted-foreground">{prefix}</span>}
        {useLive && canUseLive ? (
          <div className="flex items-center gap-1">
            <span className="text-sm font-semibold text-primary w-20 text-right">{liveValue ?? '—'}</span>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">live</Badge>
          </div>
        ) : (
          <Input
            type="number"
            value={value}
            onChange={e => onChange(e.target.value)}
            className="w-24 h-7 text-sm text-right"
          />
        )}
        {suffix && <span className="text-sm text-muted-foreground">{suffix}</span>}
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export function RecruitingReverseCalculator({
  liveAvgCompanyFeePerDeal,
  liveAvgDealsPerAgentPerMonth,
  currentActiveAgents,
  conversionRates: initialConversionRates,
  companyRetentionPct: initialRetentionPct,
  avgCompanyFeePerDealOverride,
  netMarginGoal: initialNetMarginGoal,
  year,
  onSavePlan,
}: RecruitingReverseCalculatorProps) {
  // ── State: top-level goal ──────────────────────────────────────────────────
  const [netMarginGoal, setNetMarginGoal] = useState<string>(
    String(initialNetMarginGoal ?? 1700000)
  );

  // ── State: company assumptions ─────────────────────────────────────────────
  const [retentionPct, setRetentionPct] = useState<string>(
    String(Math.round((initialRetentionPct ?? 0.29) * 100))
  );
  const [useLiveFee, setUseLiveFee] = useState<boolean>(avgCompanyFeePerDealOverride == null);
  const [feeOverride, setFeeOverride] = useState<string>(
    String(avgCompanyFeePerDealOverride ?? liveAvgCompanyFeePerDeal ?? 3000)
  );
  const [useLiveDeals, setUseLiveDeals] = useState<boolean>(true);
  const [dealsOverride, setDealsOverride] = useState<string>(
    String(liveAvgDealsPerAgentPerMonth ?? 0.78)
  );

  // ── State: funnel conversion rates ─────────────────────────────────────────
  const [rates, setRates] = useState<ConversionRates>(initialConversionRates);
  const [assumptionsOpen, setAssumptionsOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // ── Derived calculations ───────────────────────────────────────────────────
  const netMarginNum = parseFloat(netMarginGoal) || 0;
  const retentionNum = (parseFloat(retentionPct) || 29) / 100;
  const feeNum = useLiveFee
    ? (liveAvgCompanyFeePerDeal ?? (parseFloat(feeOverride) || 3000))
    : (parseFloat(feeOverride) || 3000);
  const dealsPerAgentMonthNum = useLiveDeals
    ? (liveAvgDealsPerAgentPerMonth ?? (parseFloat(dealsOverride) || 0.78))
    : (parseFloat(dealsOverride) || 0.78);

  // Step 1: Total company commission needed
  // Net margin = company commission × retention %
  // So: company commission needed = net margin ÷ retention %
  const totalCompanyCommissionNeeded = retentionNum > 0 ? netMarginNum / retentionNum : 0;

  // Step 2: Total deals needed
  const dealsNeeded = feeNum > 0 ? Math.ceil(totalCompanyCommissionNeeded / feeNum) : 0;

  // Step 3: Agents needed (deals needed ÷ deals/agent/month ÷ 12 months)
  const agentsNeeded = dealsPerAgentMonthNum > 0
    ? Math.ceil(dealsNeeded / (dealsPerAgentMonthNum * 12))
    : 0;

  // Step 4: Net new agents needed (agents needed − current agents)
  const netNewAgentsNeeded = Math.max(0, agentsNeeded - currentActiveAgents);

  // Step 5: Account for attrition — to NET gain netNewAgentsNeeded,
  // must hire: netNewAgentsNeeded + (agentsNeeded × attritionPct)
  const attritionNum = rates.expectedAttritionPct ?? 0.15;
  const hiresNeeded = Math.ceil(netNewAgentsNeeded + agentsNeeded * attritionNum);

  // Step 6: Reverse-funnel from hires needed
  const onboarded = hiresNeeded;
  const committed = Math.ceil(onboarded / (rates.commitToOnboard || 0.85));
  const offers = Math.ceil(committed / (rates.offerToCommit || 0.60));
  const interviewsHeld = Math.ceil(offers / (rates.interviewToOffer || 0.50));
  const interviewsSet = Math.ceil(interviewsHeld / (rates.interviewSetToHeld || 0.70));
  const calls = Math.ceil(interviewsSet / (rates.callToInterview || 0.20));

  // Monthly breakdowns
  const callsPerMonth = Math.ceil(calls / 12);
  const interviewsSetPerMonth = Math.ceil(interviewsSet / 12);
  const interviewsHeldPerMonth = Math.ceil(interviewsHeld / 12);
  const offersPerMonth = Math.ceil(offers / 12);
  const committedPerMonth = Math.ceil(committed / 12);
  const hiresPerMonth = Math.ceil(hiresNeeded / 12);

  // ── Save handler ───────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!onSavePlan) return;
    setSaving(true);
    try {
      await onSavePlan({
        netMarginGoal: netMarginNum,
        companyRetentionPct: retentionNum,
        avgCompanyFeePerDealOverride: useLiveFee ? null : parseFloat(feeOverride) || null,
        conversionRates: rates,
      });
    } finally {
      setSaving(false);
    }
  }, [onSavePlan, netMarginNum, retentionNum, useLiveFee, feeOverride, rates]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>Recruiting Reverse Calculator</CardTitle>
            <CardDescription>
              Enter your net margin goal and the calculator works backwards through every step
              to show exactly how many calls, interviews, and hires you need.
            </CardDescription>
          </div>
          {onSavePlan && (
            <Button size="sm" variant="outline" onClick={handleSave} disabled={saving} className="shrink-0">
              <Save className="h-3.5 w-3.5 mr-1.5" />
              {saving ? 'Saving…' : 'Save Assumptions'}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">

        {/* ── Net Margin Goal Input ─────────────────────────────────────── */}
        <div className="rounded-xl border bg-primary/5 border-primary/20 p-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1">
              <Label className="text-sm font-semibold">Net Margin Goal (Annual)</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                The dollar amount the company retains after paying agents.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold text-muted-foreground">$</span>
              <Input
                type="number"
                value={netMarginGoal}
                onChange={e => setNetMarginGoal(e.target.value)}
                className="w-40 text-lg font-bold text-right"
                placeholder="1700000"
              />
            </div>
          </div>
        </div>

        {/* ── Cascade: step-by-step calculation ────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <CascadeStep
            icon={<DollarSign className="h-5 w-5" />}
            label="Company Commission Needed"
            value={fmt$(totalCompanyCommissionNeeded)}
            sublabel={`Net Margin ÷ ${fmtPct(retentionNum)} retention`}
            highlight
            arrow
          />
          <CascadeStep
            icon={<FileText className="h-5 w-5" />}
            label="Total Deals Needed"
            value={fmtN(dealsNeeded)}
            sublabel={`÷ ${fmt$(feeNum)} avg company fee`}
            arrow
          />
          <CascadeStep
            icon={<Users className="h-5 w-5" />}
            label="Agents Needed"
            value={fmtN(agentsNeeded)}
            sublabel={`÷ ${fmtN(dealsPerAgentMonthNum, 2)} deals/agent/mo × 12`}
            arrow
          />
          <CascadeStep
            icon={<UserCheck className="h-5 w-5" />}
            label="New Hires Needed"
            value={fmtN(hiresNeeded)}
            sublabel={`${fmtN(netNewAgentsNeeded)} net new + ${fmtPct(attritionNum)} attrition`}
          />
        </div>

        {/* ── Funnel activity targets ───────────────────────────────────── */}
        <div>
          <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">
            Required Recruiting Activity (Annual / Monthly)
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: 'Prospect Calls', icon: <Phone className="h-4 w-4" />, yearly: calls, monthly: callsPerMonth, color: 'border-l-blue-500' },
              { label: 'Interviews Set', icon: <CalendarCheck className="h-4 w-4" />, yearly: interviewsSet, monthly: interviewsSetPerMonth, color: 'border-l-indigo-500' },
              { label: 'Interviews Held', icon: <Users className="h-4 w-4" />, yearly: interviewsHeld, monthly: interviewsHeldPerMonth, color: 'border-l-violet-500' },
              { label: 'Offers Made', icon: <FileText className="h-4 w-4" />, yearly: offers, monthly: offersPerMonth, color: 'border-l-amber-500' },
              { label: 'Committed', icon: <Handshake className="h-4 w-4" />, yearly: committed, monthly: committedPerMonth, color: 'border-l-orange-500' },
              { label: 'Onboarded', icon: <UserCheck className="h-4 w-4" />, yearly: onboarded, monthly: hiresPerMonth, color: 'border-l-green-500' },
            ].map(item => (
              <div key={item.label} className={`rounded-lg border border-l-4 ${item.color} bg-card p-3 text-center`}>
                <div className="flex justify-center mb-1 text-muted-foreground">{item.icon}</div>
                <p className="text-[10px] text-muted-foreground mb-1">{item.label}</p>
                <p className="text-2xl font-bold tabular-nums">{item.yearly.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">{item.monthly.toLocaleString()}/mo</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Assumptions (collapsible) ─────────────────────────────────── */}
        <Collapsible open={assumptionsOpen} onOpenChange={setAssumptionsOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="flex w-full justify-between px-0 hover:bg-transparent">
              <span className="text-sm font-semibold">Edit Assumptions &amp; Conversion Rates</span>
              {assumptionsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="rounded-xl border bg-muted/30 p-4 mt-2 space-y-4">

              {/* Company assumptions */}
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  Company Assumptions
                </h4>
                <div className="bg-card rounded-lg border divide-y">
                  <AssumptionRow
                    label="Company Retention %"
                    hint="% of GCI the company keeps after paying agents (e.g. 29%)"
                    value={retentionPct}
                    useLive={false}
                    canUseLive={false}
                    onChange={setRetentionPct}
                    onToggleLive={() => {}}
                    suffix="%"
                  />
                  <AssumptionRow
                    label="Avg Company Fee Per Deal"
                    hint="Average company commission earned per closed transaction"
                    liveValue={liveAvgCompanyFeePerDeal != null ? fmt$(liveAvgCompanyFeePerDeal) : null}
                    value={feeOverride}
                    useLive={useLiveFee}
                    canUseLive={liveAvgCompanyFeePerDeal != null}
                    onChange={setFeeOverride}
                    onToggleLive={setUseLiveFee}
                    prefix="$"
                  />
                  <AssumptionRow
                    label="Avg Deals / Agent / Month"
                    hint="Average closed deals per active agent per month"
                    liveValue={liveAvgDealsPerAgentPerMonth != null ? fmtN(liveAvgDealsPerAgentPerMonth, 2) : null}
                    value={dealsOverride}
                    useLive={useLiveDeals}
                    canUseLive={true}
                    onChange={setDealsOverride}
                    onToggleLive={setUseLiveDeals}
                  />
                  <AssumptionRow
                    label="Expected Attrition %"
                    hint="% of agents expected to leave per year"
                    value={String(Math.round((rates.expectedAttritionPct ?? 0.15) * 100))}
                    useLive={false}
                    canUseLive={false}
                    onChange={v => setRates(r => ({ ...r, expectedAttritionPct: (parseFloat(v) || 15) / 100 }))}
                    onToggleLive={() => {}}
                    suffix="%"
                  />
                </div>
              </div>

              {/* Funnel conversion rates */}
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  Funnel Conversion Rates
                </h4>
                <div className="bg-card rounded-lg border divide-y">
                  <AssumptionRow
                    label="Call → Interview Set"
                    hint="% of prospect calls that result in an interview being set"
                    value={String(Math.round((rates.callToInterview ?? 0.20) * 100))}
                    useLive={false}
                    canUseLive={false}
                    onChange={v => setRates(r => ({ ...r, callToInterview: (parseFloat(v) || 20) / 100 }))}
                    onToggleLive={() => {}}
                    suffix="%"
                  />
                  <AssumptionRow
                    label="Interview Set → Held"
                    hint="% of set interviews that are actually held"
                    value={String(Math.round((rates.interviewSetToHeld ?? 0.70) * 100))}
                    useLive={false}
                    canUseLive={false}
                    onChange={v => setRates(r => ({ ...r, interviewSetToHeld: (parseFloat(v) || 70) / 100 }))}
                    onToggleLive={() => {}}
                    suffix="%"
                  />
                  <AssumptionRow
                    label="Interview → Offer"
                    hint="% of held interviews that result in an offer"
                    value={String(Math.round((rates.interviewToOffer ?? 0.50) * 100))}
                    useLive={false}
                    canUseLive={false}
                    onChange={v => setRates(r => ({ ...r, interviewToOffer: (parseFloat(v) || 50) / 100 }))}
                    onToggleLive={() => {}}
                    suffix="%"
                  />
                  <AssumptionRow
                    label="Offer → Committed"
                    hint="% of offers that result in a commitment"
                    value={String(Math.round((rates.offerToCommit ?? 0.60) * 100))}
                    useLive={false}
                    canUseLive={false}
                    onChange={v => setRates(r => ({ ...r, offerToCommit: (parseFloat(v) || 60) / 100 }))}
                    onToggleLive={() => {}}
                    suffix="%"
                  />
                  <AssumptionRow
                    label="Committed → Onboarded"
                    hint="% of committed agents who actually onboard"
                    value={String(Math.round((rates.commitToOnboard ?? 0.85) * 100))}
                    useLive={false}
                    canUseLive={false}
                    onChange={v => setRates(r => ({ ...r, commitToOnboard: (parseFloat(v) || 85) / 100 }))}
                    onToggleLive={() => {}}
                    suffix="%"
                  />
                </div>
              </div>

              {/* Info note */}
              <div className="flex items-start gap-2 text-xs text-muted-foreground">
                <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>
                  Toggle <strong>Live</strong> to use real data from your transaction history.
                  Disable to manually override with your own assumptions.
                  Click <strong>Save Assumptions</strong> to persist these values to the recruiting plan.
                </span>
              </div>

            </div>
          </CollapsibleContent>
        </Collapsible>

      </CardContent>
    </Card>
  );
}
