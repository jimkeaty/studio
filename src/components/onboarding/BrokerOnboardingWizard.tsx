'use client';
// BrokerOnboardingWizard
// Used for: broker, solo_agent, team_leader roles
// Steps: Welcome → Branding → Company Profile → Production Goals →
//         Recruiting Goals → Activity Assumptions → Data Uploads → Done

import React, { useState, useRef } from 'react';
import { useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { WizardShell, WizardStep } from './WizardShell';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
  Building2, Palette, Target, TrendingUp, Users, Activity,
  Upload, CheckCircle2, Zap, Star, BarChart3, Phone, Calendar,
  UserPlus, DollarSign, Percent, Info,
} from 'lucide-react';
import type { WizardRole } from './OnboardingGate';

// ── Default conversion rates ──────────────────────────────────────────────────

const DEFAULT_AGENT_RATES = {
  callToEngagement: 15,
  engagementToApptSet: 3,
  apptSetToHeld: 65,
  apptHeldToContract: 50,
  contractToClosing: 85,
};

const DEFAULT_RECRUITING_RATES = {
  callToInterview: 20,
  interviewSetToHeld: 70,
  interviewToOffer: 50,
  offerToCommit: 60,
  commitToOnboard: 85,
  expectedAttrition: 15,
};

// ── Step definitions ──────────────────────────────────────────────────────────

function buildSteps(role: WizardRole): WizardStep[] {
  const isBroker = role === 'broker' || role === 'team_leader';
  const isSolo = role === 'solo_agent';
  return [
    { id: 'welcome', title: 'Welcome', subtitle: 'Get started', icon: <Star /> },
    { id: 'branding', title: 'Branding', subtitle: 'Company identity', icon: <Palette /> },
    { id: 'profile', title: 'Company Profile', subtitle: 'Avg sale & commission', icon: <Building2 /> },
    { id: 'production', title: 'Production Goals', subtitle: 'Volume, sales, margin', icon: <TrendingUp /> },
    ...(isBroker ? [
      { id: 'recruiting', title: 'Recruiting Goals', subtitle: 'Agents & net margin', icon: <Users /> },
    ] : []),
    { id: 'assumptions', title: 'Activity Assumptions', subtitle: 'Conversion rates', icon: <Activity /> },
    { id: 'uploads', title: 'Data Uploads', subtitle: 'Optional — skip anytime', optional: true, icon: <Upload /> },
    { id: 'done', title: 'All Done!', subtitle: 'Setup complete', icon: <CheckCircle2 /> },
  ];
}

// ── Helper: labeled input ─────────────────────────────────────────────────────

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
        {prefix && (
          <span className="absolute left-3 text-muted-foreground text-sm select-none">{prefix}</span>
        )}
        <Input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className={prefix ? 'pl-7' : suffix ? 'pr-10' : ''}
        />
        {suffix && (
          <span className="absolute right-3 text-muted-foreground text-sm select-none">{suffix}</span>
        )}
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

// ── Section header ────────────────────────────────────────────────────────────

function SectionHeader({ icon: Icon, title, description }: {
  icon: React.ElementType; title: string; description?: string;
}) {
  return (
    <div className="flex items-start gap-3 mb-5">
      <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary/10 text-primary shrink-0 mt-0.5">
        <Icon className="h-4.5 w-4.5" />
      </div>
      <div>
        <h3 className="font-semibold text-base">{title}</h3>
        {description && <p className="text-sm text-muted-foreground mt-0.5">{description}</p>}
      </div>
    </div>
  );
}

// ── Reference box ─────────────────────────────────────────────────────────────

function RefBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-muted/60 border">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold">{value}</span>
    </div>
  );
}

// ── Main wizard ───────────────────────────────────────────────────────────────

type Props = {
  wizardRole: WizardRole;
  onComplete: () => Promise<void>;
  onSkip: () => Promise<void>;
};

export function BrokerOnboardingWizard({ wizardRole, onComplete, onSkip }: Props) {
  const { user } = useUser();
  const { toast } = useToast();
  const [stepIndex, setStepIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const steps = buildSteps(wizardRole);
  const isBroker = wizardRole === 'broker' || wizardRole === 'team_leader';
  const currentYear = new Date().getFullYear();

  // ── Branding state ──────────────────────────────────────────────────────────
  const [companyName, setCompanyName] = useState('');
  const [tagline, setTagline] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#6366f1');
  const [logoUrl, setLogoUrl] = useState('');
  const [logoUploading, setLogoUploading] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // ── Company profile state ───────────────────────────────────────────────────
  const [avgSalePrice, setAvgSalePrice] = useState('');
  const [avgCommissionPct, setAvgCommissionPct] = useState('3');
  const [workingDaysPerMonth, setWorkingDaysPerMonth] = useState('21');
  const [weeksOff, setWeeksOff] = useState('4');

  // ── Production goals state ──────────────────────────────────────────────────
  const [yearlySalesCount, setYearlySalesCount] = useState('');
  const [yearlyVolume, setYearlyVolume] = useState('');
  const [yearlyMargin, setYearlyMargin] = useState('');
  const [autoCalcVolume, setAutoCalcVolume] = useState(true);
  const [autoCalcMargin, setAutoCalcMargin] = useState(true);

  // ── Recruiting goals state ──────────────────────────────────────────────────
  const [activeAgentsGoal, setActiveAgentsGoal] = useState('');
  const [newHiresGoal, setNewHiresGoal] = useState('');
  const [netMarginGoal, setNetMarginGoal] = useState('');
  const [retentionPct, setRetentionPct] = useState('29');
  const [avgFeePerDeal, setAvgFeePerDeal] = useState('');

  // ── Agent conversion rates ──────────────────────────────────────────────────
  const [agentRates, setAgentRates] = useState({
    callToEngagement: String(DEFAULT_AGENT_RATES.callToEngagement),
    engagementToApptSet: String(DEFAULT_AGENT_RATES.engagementToApptSet),
    apptSetToHeld: String(DEFAULT_AGENT_RATES.apptSetToHeld),
    apptHeldToContract: String(DEFAULT_AGENT_RATES.apptHeldToContract),
    contractToClosing: String(DEFAULT_AGENT_RATES.contractToClosing),
  });

  // ── Recruiting conversion rates ─────────────────────────────────────────────
  const [recruitRates, setRecruitRates] = useState({
    callToInterview: String(DEFAULT_RECRUITING_RATES.callToInterview),
    interviewSetToHeld: String(DEFAULT_RECRUITING_RATES.interviewSetToHeld),
    interviewToOffer: String(DEFAULT_RECRUITING_RATES.interviewToOffer),
    offerToCommit: String(DEFAULT_RECRUITING_RATES.offerToCommit),
    commitToOnboard: String(DEFAULT_RECRUITING_RATES.commitToOnboard),
    expectedAttrition: String(DEFAULT_RECRUITING_RATES.expectedAttrition),
  });

  // ── Auto-calculations ───────────────────────────────────────────────────────
  const calcVolume = () => {
    const sales = parseFloat(yearlySalesCount) || 0;
    const price = parseFloat(avgSalePrice.replace(/,/g, '')) || 0;
    return sales * price;
  };
  const calcMargin = () => {
    const vol = autoCalcVolume ? calcVolume() : (parseFloat(yearlyVolume.replace(/,/g, '')) || 0);
    const pct = parseFloat(avgCommissionPct) || 0;
    return vol * (pct / 100);
  };

  // ── Logo upload ─────────────────────────────────────────────────────────────
  const handleLogoUpload = async (file: File) => {
    if (!user) return;
    setLogoUploading(true);
    try {
      const token = await user.getIdToken();
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', 'logo');
      const res = await fetch('/api/admin/branding/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (data.url) setLogoUrl(data.url);
    } catch (err) {
      toast({ title: 'Upload failed', variant: 'destructive' });
    } finally {
      setLogoUploading(false);
    }
  };

  // ── Save all data ───────────────────────────────────────────────────────────
  const saveAll = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const token = await user.getIdToken();

      // 1. Save branding
      if (companyName.trim()) {
        await fetch('/api/admin/branding', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            companyName: companyName.trim() || 'My Brokerage',
            tagline: tagline.trim() || null,
            primaryColor: primaryColor || null,
            logoUrl: logoUrl || null,
          }),
        });
      }

      // 2. Save broker plan (production + recruiting + assumptions)
      const salesCount = parseInt(yearlySalesCount) || 0;
      const volume = autoCalcVolume ? calcVolume() : (parseFloat(yearlyVolume.replace(/,/g, '')) || 0);
      const margin = autoCalcMargin ? calcMargin() : (parseFloat(yearlyMargin.replace(/,/g, '')) || 0);

      const monthlyGoals: Record<number, any> = {};
      for (let m = 1; m <= 12; m++) {
        monthlyGoals[m] = {
          volumeGoal: volume ? Math.round(volume / 12) : null,
          salesCountGoal: salesCount ? Math.round(salesCount / 12) : null,
          grossMarginGoal: margin ? Math.round(margin / 12) : null,
        };
      }

      await fetch('/api/admin/broker-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          year: currentYear,
          avgSalePrice: parseFloat(avgSalePrice.replace(/,/g, '')) || null,
          avgCommissionPct: parseFloat(avgCommissionPct) || null,
          workingDaysPerMonth: parseInt(workingDaysPerMonth) || 21,
          weeksOff: parseInt(weeksOff) || 4,
          yearlyVolumeGoal: volume || null,
          yearlySalesCountGoal: salesCount || null,
          yearlyMarginGoal: margin || null,
          monthlyGoals,
          // Recruiting
          yearlyActiveAgentsGoal: parseInt(activeAgentsGoal) || null,
          yearlyNewHiresGoal: parseInt(newHiresGoal) || null,
          netMarginGoal: parseFloat(netMarginGoal.replace(/,/g, '')) || null,
          companyRetentionPct: parseFloat(retentionPct) || 29,
          avgCompanyFeePerDealOverride: parseFloat(avgFeePerDeal.replace(/,/g, '')) || null,
          // Agent KPI conversion rates
          agentConversionRates: {
            callToEngagement: parseFloat(agentRates.callToEngagement) / 100,
            engagementToAppointmentSet: parseFloat(agentRates.engagementToApptSet) / 100,
            appointmentSetToHeld: parseFloat(agentRates.apptSetToHeld) / 100,
            appointmentHeldToContract: parseFloat(agentRates.apptHeldToContract) / 100,
            contractToClosing: parseFloat(agentRates.contractToClosing) / 100,
          },
          // Recruiting funnel rates
          conversionRates: {
            callToInterview: parseFloat(recruitRates.callToInterview) / 100,
            interviewSetToHeld: parseFloat(recruitRates.interviewSetToHeld) / 100,
            interviewToOffer: parseFloat(recruitRates.interviewToOffer) / 100,
            offerToCommit: parseFloat(recruitRates.offerToCommit) / 100,
            commitToOnboard: parseFloat(recruitRates.commitToOnboard) / 100,
            expectedAttritionPct: parseFloat(recruitRates.expectedAttrition) / 100,
          },
        }),
      });

      toast({ title: 'Setup complete!', description: 'Your broker plan has been saved.' });
      await onComplete();
    } catch (err) {
      console.error('[BrokerWizard] save error', err);
      toast({ title: 'Save failed', description: 'Please try again.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  // ── Step content ────────────────────────────────────────────────────────────

  const renderStep = () => {
    const stepId = steps[stepIndex].id;

    // ── WELCOME ──────────────────────────────────────────────────────────────
    if (stepId === 'welcome') {
      const roleLabel = wizardRole === 'broker' ? 'Broker / Admin'
        : wizardRole === 'team_leader' ? 'Team Leader'
        : 'Solo Agent';
      return (
        <div className="space-y-6">
          <div className="text-center py-4">
            <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 text-primary mx-auto mb-4">
              <Zap className="h-8 w-8" />
            </div>
            <h3 className="text-2xl font-bold mb-2">Welcome to Smart Broker!</h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              Let&apos;s get your dashboard set up in about 5 minutes.
              You can skip any step and come back later.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { icon: Palette, label: 'Branding', desc: 'Company name, logo & colors' },
              { icon: TrendingUp, label: 'Production Goals', desc: 'Volume, sales & margin targets' },
              ...(isBroker ? [{ icon: Users, label: 'Recruiting Goals', desc: 'Agent count & net margin' }] : []),
              { icon: Activity, label: 'Conversion Rates', desc: 'Activity-to-close assumptions' },
              { icon: Upload, label: 'Data Uploads', desc: 'Transactions, KPI & MLS history' },
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
              Logged in as <strong>{roleLabel}</strong>. All settings can be changed anytime from the Broker Business Plan page.
            </p>
          </div>
        </div>
      );
    }

    // ── BRANDING ─────────────────────────────────────────────────────────────
    if (stepId === 'branding') {
      return (
        <div className="space-y-5">
          <SectionHeader icon={Palette} title="Company Branding"
            description="Set your company name, logo, and brand color. These appear throughout the dashboard." />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Company Name" value={companyName} onChange={setCompanyName}
              placeholder="e.g. Keaty Real Estate" />
            <Field label="Tagline (optional)" value={tagline} onChange={setTagline}
              placeholder="e.g. Your Home, Our Mission" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Brand Color</Label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={primaryColor}
                onChange={e => setPrimaryColor(e.target.value)}
                className="w-10 h-10 rounded-lg border cursor-pointer"
              />
              <Input
                value={primaryColor}
                onChange={e => setPrimaryColor(e.target.value)}
                placeholder="#6366f1"
                className="w-32 font-mono text-sm"
              />
              <div className="flex gap-2">
                {['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'].map(c => (
                  <button
                    key={c}
                    onClick={() => setPrimaryColor(c)}
                    className="w-6 h-6 rounded-full border-2 transition-all hover:scale-110"
                    style={{ backgroundColor: c, borderColor: primaryColor === c ? '#000' : 'transparent' }}
                  />
                ))}
              </div>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Company Logo (optional)</Label>
            <div className="flex items-center gap-3">
              {logoUrl ? (
                <img src={logoUrl} alt="Logo" className="h-12 w-12 object-contain rounded-lg border" />
              ) : (
                <div className="h-12 w-12 rounded-lg border bg-muted flex items-center justify-center">
                  <Building2 className="h-5 w-5 text-muted-foreground" />
                </div>
              )}
              <div>
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) handleLogoUpload(file);
                  }}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => logoInputRef.current?.click()}
                  disabled={logoUploading}
                >
                  {logoUploading ? 'Uploading...' : logoUrl ? 'Change Logo' : 'Upload Logo'}
                </Button>
                <p className="text-xs text-muted-foreground mt-1">PNG, JPG, SVG — max 2MB</p>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // ── COMPANY PROFILE ───────────────────────────────────────────────────────
    if (stepId === 'profile') {
      return (
        <div className="space-y-5">
          <SectionHeader icon={Building2} title="Company Profile"
            description="These numbers drive all the auto-calculations in your business plan." />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Average Sale Price" value={avgSalePrice} onChange={setAvgSalePrice}
              prefix="$" placeholder="450,000"
              hint="Your typical transaction price (used to auto-calculate volume)" />
            <Field label="Average Commission %" value={avgCommissionPct} onChange={setAvgCommissionPct}
              suffix="%" placeholder="3"
              hint="Total commission per side (used to estimate GCI from volume)" />
            <Field label="Working Days Per Month" value={workingDaysPerMonth} onChange={setWorkingDaysPerMonth}
              placeholder="21" hint="Used to calculate daily activity goals" />
            <Field label="Weeks Off Per Year" value={weeksOff} onChange={setWeeksOff}
              placeholder="4" hint="Vacation weeks excluded from weekly targets" />
          </div>
          <div className="p-3 rounded-lg bg-muted/50 border">
            <p className="text-xs text-muted-foreground">
              <strong>Note:</strong> These are company-wide defaults. Individual agents can override their own
              avg commission and working days in their personal business plan.
            </p>
          </div>
        </div>
      );
    }

    // ── PRODUCTION GOALS ──────────────────────────────────────────────────────
    if (stepId === 'production') {
      const calcVol = calcVolume();
      const calcMar = calcMargin();
      return (
        <div className="space-y-5">
          <SectionHeader icon={TrendingUp} title="Production Goals"
            description={`Set your ${currentYear} production targets. Volume and margin can auto-calculate from your sales count.`} />
          <Field label="Yearly Sales Count Goal" value={yearlySalesCount} onChange={v => {
            setYearlySalesCount(v);
          }} placeholder="200" hint="Total closed transactions for the year" />
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Yearly Volume Goal</Label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Auto-calculate</span>
                <Switch checked={autoCalcVolume} onCheckedChange={setAutoCalcVolume} />
              </div>
            </div>
            {autoCalcVolume ? (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/60 border">
                <span className="text-sm font-semibold">
                  ${calcVol > 0 ? calcVol.toLocaleString() : '—'}
                </span>
                <span className="text-xs text-muted-foreground">
                  = {yearlySalesCount || '0'} sales × ${avgSalePrice || '0'} avg price
                </span>
              </div>
            ) : (
              <div className="relative flex items-center">
                <span className="absolute left-3 text-muted-foreground text-sm">$</span>
                <Input value={yearlyVolume} onChange={e => setYearlyVolume(e.target.value)}
                  placeholder="90,000,000" className="pl-7" />
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Yearly Gross Margin Goal</Label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Auto-calculate</span>
                <Switch checked={autoCalcMargin} onCheckedChange={setAutoCalcMargin} />
              </div>
            </div>
            {autoCalcMargin ? (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/60 border">
                <span className="text-sm font-semibold">
                  ${calcMar > 0 ? Math.round(calcMar).toLocaleString() : '—'}
                </span>
                <span className="text-xs text-muted-foreground">
                  = volume × {avgCommissionPct || '0'}% commission
                </span>
              </div>
            ) : (
              <div className="relative flex items-center">
                <span className="absolute left-3 text-muted-foreground text-sm">$</span>
                <Input value={yearlyMargin} onChange={e => setYearlyMargin(e.target.value)}
                  placeholder="2,700,000" className="pl-7" />
              </div>
            )}
          </div>
        </div>
      );
    }

    // ── RECRUITING GOALS ──────────────────────────────────────────────────────
    if (stepId === 'recruiting') {
      return (
        <div className="space-y-5">
          <SectionHeader icon={Users} title="Recruiting Goals"
            description="Set your agent count targets and net margin goal for the year." />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Active Agents Goal (Year-End)" value={activeAgentsGoal}
              onChange={setActiveAgentsGoal} placeholder="45"
              hint="Target headcount by December 31" />
            <Field label="New Hires Goal" value={newHiresGoal}
              onChange={setNewHiresGoal} placeholder="12"
              hint="Total new agents to recruit this year" />
          </div>
          <Separator />
          <div className="space-y-4">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-primary" />
              Company Net Margin
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Net Margin Goal" value={netMarginGoal}
                onChange={setNetMarginGoal} prefix="$" placeholder="500,000"
                hint="Dollar amount the company keeps after paying agents" />
              <Field label="Company Retention %" value={retentionPct}
                onChange={setRetentionPct} suffix="%" placeholder="29"
                hint="% of GCI the company keeps (default 29%)" />
            </div>
            <Field label="Avg Company Fee Per Deal (override)" value={avgFeePerDeal}
              onChange={setAvgFeePerDeal} prefix="$" placeholder="Leave blank to use live DB average"
              hint="Optional — leave blank to use the average from your actual closed transactions" />
          </div>
        </div>
      );
    }

    // ── ACTIVITY ASSUMPTIONS ──────────────────────────────────────────────────
    if (stepId === 'assumptions') {
      return (
        <div className="space-y-6">
          <SectionHeader icon={Activity} title="Activity Assumptions"
            description="These conversion rates drive all activity goal calculations. Pre-filled with industry defaults — adjust to match your team's actual performance." />

          {/* Agent KPI rates */}
          <div>
            <h4 className="text-sm font-semibold mb-1 flex items-center gap-2">
              <Phone className="h-3.5 w-3.5 text-primary" />
              Agent KPI Conversion Rates
            </h4>
            <p className="text-xs text-muted-foreground mb-3">
              Used to calculate how many calls, engagements, and appointments each agent needs per day/week.
            </p>
            <div className="rounded-lg border divide-y overflow-hidden">
              <RateField label="Call → Engagement" value={agentRates.callToEngagement}
                onChange={v => setAgentRates(p => ({ ...p, callToEngagement: v }))}
                hint="% of calls that result in a meaningful engagement" />
              <RateField label="Engagement → Appointment Set" value={agentRates.engagementToApptSet}
                onChange={v => setAgentRates(p => ({ ...p, engagementToApptSet: v }))}
                hint="% of engagements that become a scheduled appointment" />
              <RateField label="Appointment Set → Held" value={agentRates.apptSetToHeld}
                onChange={v => setAgentRates(p => ({ ...p, apptSetToHeld: v }))}
                hint="% of scheduled appointments that are actually held" />
              <RateField label="Appointment Held → Contract" value={agentRates.apptHeldToContract}
                onChange={v => setAgentRates(p => ({ ...p, apptHeldToContract: v }))}
                hint="% of held appointments that result in a signed contract" />
              <RateField label="Contract → Closing" value={agentRates.contractToClosing}
                onChange={v => setAgentRates(p => ({ ...p, contractToClosing: v }))}
                hint="% of contracts that successfully close" />
            </div>
          </div>

          {/* Recruiting funnel rates — broker only */}
          {isBroker && (
            <div>
              <h4 className="text-sm font-semibold mb-1 flex items-center gap-2">
                <UserPlus className="h-3.5 w-3.5 text-primary" />
                Recruiting Funnel Rates
              </h4>
              <p className="text-xs text-muted-foreground mb-3">
                Used to calculate how many prospect calls it takes to hire one agent.
              </p>
              <div className="rounded-lg border divide-y overflow-hidden">
                <RateField label="Prospect Call → Interview Set" value={recruitRates.callToInterview}
                  onChange={v => setRecruitRates(p => ({ ...p, callToInterview: v }))} />
                <RateField label="Interview Set → Interview Held" value={recruitRates.interviewSetToHeld}
                  onChange={v => setRecruitRates(p => ({ ...p, interviewSetToHeld: v }))} />
                <RateField label="Interview Held → Offer Made" value={recruitRates.interviewToOffer}
                  onChange={v => setRecruitRates(p => ({ ...p, interviewToOffer: v }))} />
                <RateField label="Offer Made → Committed" value={recruitRates.offerToCommit}
                  onChange={v => setRecruitRates(p => ({ ...p, offerToCommit: v }))} />
                <RateField label="Committed → Onboarded" value={recruitRates.commitToOnboard}
                  onChange={v => setRecruitRates(p => ({ ...p, commitToOnboard: v }))} />
                <RateField label="Expected Annual Attrition" value={recruitRates.expectedAttrition}
                  onChange={v => setRecruitRates(p => ({ ...p, expectedAttrition: v }))}
                  hint="% of agents expected to leave per year" />
              </div>
            </div>
          )}
        </div>
      );
    }

    // ── DATA UPLOADS ──────────────────────────────────────────────────────────
    if (stepId === 'uploads') {
      return (
        <div className="space-y-5">
          <SectionHeader icon={Upload} title="Data Uploads"
            description="Upload historical data to populate your charts and dashboards. All uploads are optional — you can skip now and come back anytime from the Admin Tools page." />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              {
                icon: BarChart3,
                title: 'Transaction History',
                desc: 'Bulk import closed transactions (CSV). Populates all production charts with real data.',
                href: '/dashboard/admin/import',
                badge: 'Most Important',
                badgeColor: 'bg-primary/10 text-primary',
              },
              {
                icon: Activity,
                title: 'KPI Activity Tracking',
                desc: 'Import agent activity records — calls, engagements, appointments, contracts.',
                href: '/dashboard/admin/import-activities',
                badge: null,
                badgeColor: '',
              },
              {
                icon: Calendar,
                title: 'Appointments & Clients',
                desc: 'Import your contact book and appointment history.',
                href: '/dashboard/contacts',
                badge: null,
                badgeColor: '',
              },
              {
                icon: TrendingUp,
                title: 'MLS Historical Data',
                desc: 'Upload MLS export (volume + sales count). GCI & margin estimated from your assumptions.',
                href: '/dashboard/admin/import?type=mls',
                badge: 'Tier 1 + Tier 2',
                badgeColor: 'bg-amber-100 text-amber-800',
              },
            ].map(item => (
              <div key={item.title} className="rounded-lg border p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <item.icon className="h-4 w-4 text-primary shrink-0" />
                    <span className="text-sm font-semibold">{item.title}</span>
                  </div>
                  {item.badge && (
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${item.badgeColor}`}>
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
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
            <p className="text-xs text-amber-800">
              <strong>MLS Data Note:</strong> When you upload MLS data, sales volume and transaction count are shown
              as <strong>Tier 1 (confirmed)</strong> data. GCI, gross margin, and broker commission are
              shown as <strong>Tier 2 (estimated)</strong> — calculated from your plan assumptions — with
              a dashed border and &quot;est.&quot; badge so you always know what&apos;s real vs. estimated.
            </p>
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
              Your broker business plan has been saved. Here&apos;s where to go next:
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
            {[
              { label: 'Broker Command', desc: 'View production charts & KPI tracking', href: '/dashboard/broker' },
              { label: 'Recruiting & Dev', desc: 'Recruiting pipeline & agent development', href: '/dashboard/admin/recruiting' },
              { label: 'Broker Business Plan', desc: 'Edit all goals & assumptions anytime', href: '/dashboard/admin/broker-plan' },
              { label: 'Import Transactions', desc: 'Upload your historical transaction data', href: '/dashboard/admin/import' },
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

  // ── Navigation ───────────────────────────────────────────────────────────────

  const handleNext = () => {
    if (stepIndex < steps.length - 1) setStepIndex(i => i + 1);
  };
  const handleBack = () => {
    if (stepIndex > 0) setStepIndex(i => i - 1);
  };
  const handleSkipStep = () => {
    if (stepIndex < steps.length - 1) setStepIndex(i => i + 1);
  };
  const isLastStep = stepIndex === steps.length - 1;

  const roleLabel = wizardRole === 'broker' ? 'Broker Setup'
    : wizardRole === 'team_leader' ? 'Team Leader Setup'
    : 'Solo Agent Setup';

  return (
    <WizardShell
      steps={steps}
      currentStepIndex={stepIndex}
      onBack={handleBack}
      onNext={handleNext}
      onSkipStep={steps[stepIndex].optional ? handleSkipStep : undefined}
      onSkipAll={onSkip}
      onFinish={saveAll}
      saving={saving}
      wizardTitle={roleLabel}
      wizardSubtitle={`${currentYear} Business Plan Setup`}
      headerIcon={<Building2 className="h-5 w-5" />}
      nextLabel={isLastStep ? 'Finish Setup' : 'Next'}
    >
      {renderStep()}
    </WizardShell>
  );
}
