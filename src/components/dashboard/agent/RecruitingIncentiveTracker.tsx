// src/components/dashboard/agent/RecruitingIncentiveTracker.tsx
"use client";

import { useState, useEffect, useMemo } from "react";
import { useUser } from "@/firebase";
import { useEffectiveUser } from "@/hooks/useEffectiveUser";
import type { DownlineMember } from "@/lib/types/incentives";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  AlertCircle,
  Users,
  Award,
  DollarSign,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  Target,
} from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// ── Types ────────────────────────────────────────────────────────────────────

type RecruitingConfig = {
  programName: string;
  enabled: boolean;
  gciThreshold: number;
  tier1PayoutAmount: number;
  tier2PayoutAmount: number;
  tierDepth: number;
  windowType: "anniversary" | "calendar";
  recurring: boolean;
};

/**
 * Matches AnniversaryYearProgress as serialised to JSON by the API route.
 * Dates become ISO strings over the wire.
 */
type AnniversaryYearProgress = {
  yearNumber: number;
  windowStart: string | Date;   // ISO string over the wire; Date in TypeScript types
  windowEnd: string | Date;     // ISO string over the wire; Date in TypeScript types
  closedGci: number;
  pendingGci: number;
  qualified: boolean;
  expired: boolean;
  isCurrent: boolean;
  payoutEarned: number;  // NOT payoutAmount
};

type EnhancedDownlineMember = DownlineMember & {
  referrerDisplayName?: string;
  qualificationProgress?: {
    status: "qualified" | "in_progress" | "expired" | "missing_data";
    closedCompanyGciGrossInWindow: number;
    pendingCompanyGciGrossInWindow: number;
    windowEndsAt?: string | null;
    annualPayout: number;
    anniversaryYears?: AnniversaryYearProgress[];   // NOT annualWindows
    totalLifetimePayouts?: number;                  // NOT lifetimeEarned
  } | null;
};

type ApiSummary = {
  tier1Count: number;
  tier2Count: number;
  qualifiedCount: number;
  totalRecruits: number;
  tier1QualifiedCount: number;
  tier2QualifiedCount: number;
  totalAnnualIncome: number;
  tier1AnnualIncome: number;
  tier2AnnualIncome: number;
  totalLifetimeIncome: number;
  // potentialIfAllQualify is NOT returned by the API – computed locally in useMemo
};

type RecruitingApiResponse =
  | {
      ok: true;
      uid: string;
      config?: RecruitingConfig;
      summary?: ApiSummary;
      downline: EnhancedDownlineMember[];
    }
  | { ok: false; error: string };

// ── Sub-components ────────────────────────────────────────────────────────────

const SummaryCard = ({
  icon: Icon,
  title,
  value,
  description,
  highlight,
}: {
  icon: React.ElementType;
  title: string;
  value: string | number;
  description: string;
  highlight?: boolean;
}) => (
  <Card className={highlight ? "border-green-300 bg-green-50/40" : ""}>
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle className="text-sm font-medium">{title}</CardTitle>
      <Icon className={cn("h-4 w-4", highlight ? "text-green-600" : "text-muted-foreground")} />
    </CardHeader>
    <CardContent>
      <div className={cn("text-2xl font-bold", highlight ? "text-green-700" : "")}>{value}</div>
      <p className="text-xs text-muted-foreground">{description}</p>
    </CardContent>
  </Card>
);

const StatusBadge = ({
  status,
}: {
  status: "qualified" | "in_progress" | "expired" | "missing_data";
}) => {
  const variants = {
    qualified: "bg-green-500/20 text-green-700 border-green-500/30",
    in_progress: "bg-blue-500/20 text-blue-700 border-blue-500/30",
    expired: "bg-red-500/20 text-red-700 border-red-500/30",
    missing_data: "bg-gray-500/20 text-gray-700 border-gray-500/30",
  };
  const text = {
    qualified: "Qualified ✓",
    in_progress: "In Progress",
    expired: "Expired",
    missing_data: "No Data",
  };
  return (
    <Badge variant="outline" className={cn("font-normal", variants[status])}>
      {text[status]}
    </Badge>
  );
};

const GciProgressBar = ({
  closed,
  pending,
  threshold,
}: {
  closed: number;
  pending: number;
  threshold: number;
}) => {
  const closedPct = Math.min((closed / threshold) * 100, 100);
  const pendingPct = Math.min((pending / threshold) * 100, 100 - closedPct);
  const fmt = (n: number) => `$${n.toLocaleString()}`;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="relative w-full h-2 bg-muted rounded-full overflow-hidden cursor-help">
            <div className="absolute top-0 left-0 h-full bg-blue-500 rounded-full" style={{ width: `${closedPct}%` }} />
            <div className="absolute top-0 h-full bg-yellow-400" style={{ left: `${closedPct}%`, width: `${pendingPct}%` }} />
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>Closed GCI: {fmt(closed)}</p>
          <p>Pending GCI: {fmt(pending)}</p>
          <p>Remaining: {fmt(Math.max(0, threshold - closed))}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

const AnnualHistoryRow = ({
  window: w,
  threshold,
}: {
  window: AnniversaryYearProgress;
  threshold: number;
}) => {
  const fmt = (n: number) => `$${n.toLocaleString()}`;
  // windowStart / windowEnd are ISO strings from the API
  const startYear = new Date(w.windowStart as string).getFullYear();
  const endYear   = new Date(w.windowEnd as string).getFullYear();
  const label = startYear === endYear ? `${startYear}` : `${startYear}–${endYear}`;

  return (
    <div className="flex items-center gap-3 text-xs py-1">
      <span className="w-16 text-muted-foreground shrink-0">{label}</span>
      <div className="flex-1">
        <GciProgressBar closed={w.closedGci} pending={w.pendingGci} threshold={threshold} />
      </div>
      <span className="w-20 text-right text-muted-foreground shrink-0">
        {fmt(w.closedGci)} / {fmt(threshold)}
      </span>
      <span className="w-16 text-right shrink-0">
        {w.qualified ? (
          <span className="text-green-700 font-semibold">{fmt(w.payoutEarned)}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </span>
    </div>
  );
};

// ── Main Component ────────────────────────────────────────────────────────────

export function RecruitingIncentiveTracker() {
  const { user } = useUser();
  const { effectiveUid, isImpersonating } = useEffectiveUser();

  const [downline, setDownline] = useState<EnhancedDownlineMember[]>([]);
  const [apiSummary, setApiSummary] = useState<ApiSummary | null>(null);
  const [config, setConfig] = useState<RecruitingConfig | null>(null);
  const [recruitingGoalIncome, setRecruitingGoalIncome] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  useEffect(() => {
    const load = async () => {
      if (!user) { setLoading(false); return; }
      setLoading(true);
      setError(null);

      try {
        const token = await user.getIdToken();

        // Fetch recruiting data and plan goal in parallel
        const [recruitRes, planRes] = await Promise.all([
          fetch(`/api/recruiting${isImpersonating && effectiveUid ? `?viewAs=${effectiveUid}` : ''}`, {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
          }),
          fetch(`/api/plan?year=${new Date().getFullYear()}${isImpersonating && effectiveUid ? `&viewAs=${effectiveUid}` : ''}`, {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
          }),
        ]);

        const json = (await recruitRes.json()) as RecruitingApiResponse;
        if (!recruitRes.ok || !json || (json as any).ok !== true) {
          throw new Error((json as any)?.error || `Failed to load recruiting data (HTTP ${recruitRes.status})`);
        }

        const typedJson = json as Extract<RecruitingApiResponse, { ok: true }>;
        setDownline(typedJson.downline || []);
        if (typedJson.summary) setApiSummary(typedJson.summary);
        if (typedJson.config) setConfig(typedJson.config);

        // Load recruiting goal from saved business plan
        const planJson = await planRes.json().catch(() => null);
        if (planJson?.ok && planJson?.plan?.recruitingGoalIncome > 0) {
          setRecruitingGoalIncome(planJson.plan.recruitingGoalIncome);
        }
      } catch (e: any) {
        console.error("Recruiting Tracker UI Error:", e?.message || e);
        setError("An unexpected error occurred while loading recruiting data.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [user, isImpersonating, effectiveUid]);

  const summary = useMemo(() => {
    const t1Pay = config?.tier1PayoutAmount ?? 500;
    const t2Pay = config?.tier2PayoutAmount ?? 500;

    if (apiSummary) {
      // API summary doesn't include potentialIfAllQualify — compute it from downline
      const potentialIfAllQualify = downline.reduce((acc, member) => {
        return acc + (member.tier === 1 ? t1Pay : t2Pay);
      }, 0);
      return { ...apiSummary, potentialIfAllQualify };
    }

    // Fallback: compute everything from downline
    return downline.reduce(
      (acc, member) => {
        if (member.tier === 1) acc.tier1Count++;
        if (member.tier === 2) acc.tier2Count++;
        const qp = member.qualificationProgress;
        if (qp?.status === "qualified") {
          acc.qualifiedCount++;
          if (member.tier === 1) acc.tier1QualifiedCount++;
          if (member.tier === 2) acc.tier2QualifiedCount++;
          const payout = qp.annualPayout ?? 0;
          acc.totalAnnualIncome += payout;
          if (member.tier === 1) acc.tier1AnnualIncome += payout;
          if (member.tier === 2) acc.tier2AnnualIncome += payout;
        }
        acc.totalRecruits++;
        acc.potentialIfAllQualify += member.tier === 1 ? t1Pay : t2Pay;
        return acc;
      },
      {
        tier1Count: 0, tier2Count: 0, qualifiedCount: 0, totalRecruits: 0,
        tier1QualifiedCount: 0, tier2QualifiedCount: 0,
        totalAnnualIncome: 0, tier1AnnualIncome: 0, tier2AnnualIncome: 0,
        totalLifetimeIncome: 0,
        potentialIfAllQualify: 0,
      }
    );
  }, [downline, apiSummary, config]);

  const gciThreshold = config?.gciThreshold ?? 40000;
  const t1Pay = config?.tier1PayoutAmount ?? 500;
  const t2Pay = config?.tier2PayoutAmount ?? 500;
  const fmt = (n: number) => `$${(n ?? 0).toLocaleString()}`;

  const toggleRow = (id: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  if (loading) {
    return (
      <Card>
        <CardHeader><Skeleton className="h-6 w-1/3" /></CardHeader>
        <CardContent><Skeleton className="h-48 w-full" /></CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader><CardTitle>Recruiting Tracker</CardTitle></CardHeader>
        <CardContent className="text-center text-red-500">
          <AlertCircle className="mx-auto h-8 w-8 mb-2" />
          <p>{error}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle>{config?.programName ?? "Recruiting Incentive Tracker"}</CardTitle>
            <CardDescription>
              Track the GCI progress of agents you&apos;ve referred and your annual incentive income.
              {config && (
                <span className="ml-1 text-xs">
                  Earn {fmt(t1Pay)}/yr per Tier 1 · {fmt(t2Pay)}/yr per Tier 2 when they close {fmt(gciThreshold)} GCI.
                </span>
              )}
            </CardDescription>
          </div>
          {config && !config.enabled && (
            <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50 shrink-0">
              Program Paused
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <SummaryCard
            icon={Users}
            title="Total Recruits"
            value={summary.totalRecruits}
            description={`${summary.tier1Count} direct (T1) · ${summary.tier2Count} T2`}
          />
          <SummaryCard
            icon={Award}
            title="Qualified This Year"
            value={summary.qualifiedCount}
            description={`${summary.tier1QualifiedCount} T1 · ${summary.tier2QualifiedCount} T2`}
          />
          <SummaryCard
            icon={DollarSign}
            title="Annual Incentive Earned"
            value={fmt(summary.totalAnnualIncome)}
            description={`T1: ${fmt(summary.tier1AnnualIncome)} · T2: ${fmt(summary.tier2AnnualIncome)}`}
            highlight={summary.totalAnnualIncome > 0}
          />
          <SummaryCard
            icon={TrendingUp}
            title="Potential if All Qualify"
            value={fmt(summary.potentialIfAllQualify)}
            description="Max payout if all recruits qualify"
          />
        </div>

        {/* Plan vs Actual */}
        {recruitingGoalIncome != null && recruitingGoalIncome > 0 && (
          <div className="rounded-lg border bg-violet-50/40 border-violet-200 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Target className="h-4 w-4 text-violet-600" />
              <p className="text-sm font-semibold text-violet-800">Business Plan Goal vs Actual</p>
            </div>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Goal</p>
                <p className="text-lg font-bold text-violet-700">{fmt(recruitingGoalIncome)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Earned</p>
                <p className={cn("text-lg font-bold", summary.totalAnnualIncome >= recruitingGoalIncome ? "text-green-700" : "text-orange-600")}>
                  {fmt(summary.totalAnnualIncome)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Remaining</p>
                <p className={cn("text-lg font-bold", summary.totalAnnualIncome >= recruitingGoalIncome ? "text-green-700" : "text-muted-foreground")}>
                  {summary.totalAnnualIncome >= recruitingGoalIncome
                    ? "Goal Met! 🎉"
                    : fmt(recruitingGoalIncome - summary.totalAnnualIncome)}
                </p>
              </div>
            </div>
            <div className="mt-3">
              <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-violet-500 rounded-full transition-all"
                  style={{ width: `${Math.min((summary.totalAnnualIncome / recruitingGoalIncome) * 100, 100)}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1 text-right">
                {Math.round((summary.totalAnnualIncome / recruitingGoalIncome) * 100)}% of goal
              </p>
            </div>
          </div>
        )}

        {/* Recruit Table */}
        {downline.length === 0 ? (
          <div className="text-center text-muted-foreground py-12">
            <Users className="mx-auto h-8 w-8 mb-3 opacity-30" />
            <p className="font-medium">You have not referred any agents yet.</p>
            <p className="text-sm mt-1">Start recruiting to build your passive income stream.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Tier 1 section */}
            {downline.filter(m => m.tier === 1).length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="outline" className="text-blue-700 border-blue-300 bg-blue-50">Tier 1 — Direct Recruits</Badge>
                  <span className="text-xs text-muted-foreground">You earn {fmt(t1Pay)}/yr per qualified agent</span>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-6"></TableHead>
                      <TableHead>Agent</TableHead>
                      <TableHead>Window Progress to {fmt(gciThreshold)} GCI</TableHead>
                      <TableHead>Time Left</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">This Year</TableHead>
                      <TableHead className="text-right">Lifetime</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {downline.filter(m => m.tier === 1).map((member) => {
                      const qp = member.qualificationProgress as EnhancedDownlineMember["qualificationProgress"];
                      const status: "qualified" | "in_progress" | "expired" | "missing_data" = qp?.status ?? "missing_data";
                      const closed = Number(qp?.closedCompanyGciGrossInWindow || 0);
                      const pending = Number(qp?.pendingCompanyGciGrossInWindow || 0);
                      const annualPayout = Number(qp?.annualPayout || 0);
                      // Use totalLifetimePayouts (correct API field name)
                      const lifetimeEarned = Number(qp?.totalLifetimePayouts || 0);
                      // Use anniversaryYears (correct API field name)
                      const annualWindows = qp?.anniversaryYears ?? [];
                      const hasHistory = annualWindows.length > 1;
                      const isExpanded = expandedRows.has(member.agentId);

                      let timeLeft = "—";
                      if (qp?.windowEndsAt && status === "in_progress") {
                        const d = new Date(qp.windowEndsAt);
                        if (!isNaN(d.getTime())) timeLeft = formatDistanceToNowStrict(d);
                      }

                      return (
                        <>
                          <TableRow key={member.agentId} className={hasHistory ? "cursor-pointer hover:bg-muted/40" : ""} onClick={() => hasHistory && toggleRow(member.agentId)}>
                            <TableCell className="pr-0">
                              {hasHistory && (isExpanded ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />)}
                            </TableCell>
                            <TableCell className="font-medium">{member.displayName || member.agentId}</TableCell>
                            <TableCell>
                              <div className="space-y-1">
                                <GciProgressBar closed={closed} pending={pending} threshold={gciThreshold} />
                                <div className="text-xs text-muted-foreground">
                                  {fmt(closed)} closed · {fmt(pending)} pending
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="text-sm">{timeLeft}</TableCell>
                            <TableCell><StatusBadge status={status} /></TableCell>
                            <TableCell className="text-right font-semibold">{annualPayout > 0 ? <span className="text-green-700">{fmt(annualPayout)}</span> : "—"}</TableCell>
                            <TableCell className="text-right text-sm text-muted-foreground">{lifetimeEarned > 0 ? fmt(lifetimeEarned) : "—"}</TableCell>
                          </TableRow>
                          {isExpanded && hasHistory && (
                            <TableRow key={`${member.agentId}-history`}>
                              <TableCell colSpan={7} className="bg-muted/20 px-6 py-3">
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Annual Window History</p>
                                <div className="space-y-1">
                                  {annualWindows.map((w, i) => (
                                    <AnnualHistoryRow key={i} window={w} threshold={gciThreshold} />
                                  ))}
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Tier 2 section */}
            {downline.filter(m => m.tier === 2).length > 0 && (
              <div className="mt-4">
                <Separator className="mb-4" />
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="outline" className="text-violet-700 border-violet-300 bg-violet-50">Tier 2 — Your Recruits&apos; Recruits</Badge>
                  <span className="text-xs text-muted-foreground">You earn {fmt(t2Pay)}/yr per qualified agent</span>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-6"></TableHead>
                      <TableHead>Agent</TableHead>
                      <TableHead>Recruited By</TableHead>
                      <TableHead>Window Progress to {fmt(gciThreshold)} GCI</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">This Year</TableHead>
                      <TableHead className="text-right">Lifetime</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {downline.filter(m => m.tier === 2).map((member) => {
                      const qp = member.qualificationProgress as EnhancedDownlineMember["qualificationProgress"];
                      const status: "qualified" | "in_progress" | "expired" | "missing_data" = qp?.status ?? "missing_data";
                      const closed = Number(qp?.closedCompanyGciGrossInWindow || 0);
                      const pending = Number(qp?.pendingCompanyGciGrossInWindow || 0);
                      const annualPayout = Number(qp?.annualPayout || 0);
                      // Use totalLifetimePayouts (correct API field name)
                      const lifetimeEarned = Number(qp?.totalLifetimePayouts || 0);
                      // Use anniversaryYears (correct API field name)
                      const annualWindows = qp?.anniversaryYears ?? [];
                      const hasHistory = annualWindows.length > 1;
                      const isExpanded = expandedRows.has(member.agentId);

                      return (
                        <>
                          <TableRow key={member.agentId} className={hasHistory ? "cursor-pointer hover:bg-muted/40" : ""} onClick={() => hasHistory && toggleRow(member.agentId)}>
                            <TableCell className="pr-0">
                              {hasHistory && (isExpanded ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />)}
                            </TableCell>
                            <TableCell className="font-medium">{member.displayName || member.agentId}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{member.referrerDisplayName || "—"}</TableCell>
                            <TableCell>
                              <div className="space-y-1">
                                <GciProgressBar closed={closed} pending={pending} threshold={gciThreshold} />
                                <div className="text-xs text-muted-foreground">
                                  {fmt(closed)} closed · {fmt(pending)} pending
                                </div>
                              </div>
                            </TableCell>
                            <TableCell><StatusBadge status={status} /></TableCell>
                            <TableCell className="text-right font-semibold">{annualPayout > 0 ? <span className="text-green-700">{fmt(annualPayout)}</span> : "—"}</TableCell>
                            <TableCell className="text-right text-sm text-muted-foreground">{lifetimeEarned > 0 ? fmt(lifetimeEarned) : "—"}</TableCell>
                          </TableRow>
                          {isExpanded && hasHistory && (
                            <TableRow key={`${member.agentId}-history`}>
                              <TableCell colSpan={7} className="bg-muted/20 px-6 py-3">
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Annual Window History</p>
                                <div className="space-y-1">
                                  {annualWindows.map((w, i) => (
                                    <AnnualHistoryRow key={i} window={w} threshold={gciThreshold} />
                                  ))}
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
