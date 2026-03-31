'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Crown, Rocket, Zap, AlertCircle, BarChart, CalendarDays, DollarSign, TrendingUp, Users, Clock } from 'lucide-react';
import React, { useState, useEffect, useMemo } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

type LeaderRow = {
  agentId: string;
  displayName: string;
  avatarUrl: string | null;
  closed: number;
  pending: number;
  listings: number;
  closedVolume: number;
  totalGCI: number;
  agentNetCommission: number;
  companyDollar: number;
  isCorrected: boolean;
  correctionReason: string;
};

type TeamTotals = {
  totalVolume: number;
  totalSales: number;
  totalGCI: number;
  totalAgentNet: number;
  totalCompanyDollar: number;
  totalPending: number;
  totalListings: number;
};

type RecentDeal = {
  address: string;
  agentName: string;
  dealValue: number;
  gci: number;
  date: string;
  status: string;
};

const fmtCurrency = (n: number) =>
  n >= 1_000_000
    ? `$${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000
    ? `$${(n / 1_000).toFixed(0)}K`
    : `$${n.toFixed(0)}`;

const fmtNum = (n: number) => n.toLocaleString();

const RaceIcon = ({ rank }: { rank: number }) => {
  if (rank === 0) return <Crown className="h-8 w-8 text-yellow-400" />;
  if (rank < 3) return <Rocket className="h-7 w-7 text-gray-400" />;
  return <Zap className="h-6 w-6 text-blue-500" />;
};

const LeaderboardSkeleton = () => (
  <div className="space-y-4">
    {[...Array(5)].map((_, i) => (
      <Card key={i} className="bg-gray-800/50 border-2 border-gray-700">
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <Skeleton className="h-8 w-12" />
            <Skeleton className="h-16 w-16 rounded-full" />
            <div className="flex-grow space-y-2">
              <Skeleton className="h-6 w-1/3" />
              <Skeleton className="h-6 w-full" />
            </div>
            <div className="flex-shrink-0 w-48 text-right">
              <Skeleton className="h-10 w-24 ml-auto" />
              <Skeleton className="h-4 w-32 ml-auto mt-2" />
            </div>
          </div>
        </CardContent>
      </Card>
    ))}
  </div>
);

export default function LeaderboardPage() {
  const [rows, setRows] = useState<LeaderRow[]>([]);
  const [teamTotals, setTeamTotals] = useState<TeamTotals | null>(null);
  const [recentPendings, setRecentPendings] = useState<RecentDeal[]>([]);
  const [recentSold, setRecentSold] = useState<RecentDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [period, setPeriod] = useState<string>('yearly');
  const [year, setYear] = useState(0);
  const [quarter, setQuarter] = useState(() => Math.ceil((new Date().getMonth() + 1) / 3));
  const [month, setMonth] = useState(() => new Date().getMonth() + 1);

  useEffect(() => {
    setYear(new Date().getFullYear());
  }, []);

  useEffect(() => {
    if (year === 0) return;
    setLoading(true);

    let url = `/api/rollups/leaderboard?year=${year}&period=${period}`;
    if (period === 'quarterly') url += `&quarter=${quarter}`;
    if (period === 'monthly') url += `&month=${month}`;

    fetch(url, { cache: 'no-store' })
      .then((r) => r.json())
      .then((json) => {
        setRows(json.rows ?? []);
        setTeamTotals(json.teamTotals ?? null);
        setRecentPendings(json.recentPendings ?? []);
        setRecentSold(json.recentSold ?? []);
        setError(null);
      })
      .catch((err) => {
        console.error('Failed to fetch leaderboard data:', err);
        setError('Could not load leaderboard data. Please try again later.');
      })
      .finally(() => setLoading(false));
  }, [period, year, quarter, month]);

  const leaderScore = rows.length > 0 ? rows[0].closed : 0;

  const periodLabel = period === 'yearly'
    ? `${year}`
    : period === 'quarterly'
    ? `Q${quarter} ${year}`
    : `${new Date(year, month - 1).toLocaleString('en-US', { month: 'long' })} ${year}`;

  return (
    <div className="dark min-h-screen bg-gray-900 text-white p-4 sm:p-8 font-sans">
      <header className="text-center mb-8">
        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-primary to-orange-400">
          Production Leaderboard
        </h1>
        <p className="text-lg sm:text-2xl text-gray-400 mt-2">Brokerage-wide Performance</p>
      </header>

      {/* ── YTD Team Totals ─────────────────────────────────────────── */}
      {teamTotals && !loading && (
        <div className="max-w-7xl mx-auto grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
          <TotalCard icon={DollarSign} label="Team Volume" value={fmtCurrency(teamTotals.totalVolume)} />
          <TotalCard icon={BarChart} label="Total Sales" value={fmtNum(teamTotals.totalSales)} />
          <TotalCard icon={TrendingUp} label="Total GCI" value={fmtCurrency(teamTotals.totalGCI)} />
          <TotalCard icon={Users} label="Agent Commissions" value={fmtCurrency(teamTotals.totalAgentNet)} />
          <TotalCard icon={Clock} label="Pending" value={fmtNum(teamTotals.totalPending)} />
          <TotalCard icon={CalendarDays} label="Active Listings" value={fmtNum(teamTotals.totalListings)} />
        </div>
      )}

      {/* ── Filters ─────────────────────────────────────────────────── */}
      <Card className="max-w-5xl mx-auto bg-gray-800/30 border-gray-700 mb-8">
        <CardContent className="p-4 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Tabs value={period} onValueChange={(v) => setPeriod(v)}>
            <TabsList>
              <TabsTrigger value="yearly">Year</TabsTrigger>
              <TabsTrigger value="quarterly">Quarter</TabsTrigger>
              <TabsTrigger value="monthly">Month</TabsTrigger>
            </TabsList>
          </Tabs>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-full sm:w-[120px] bg-gray-800 border-gray-600">
              <SelectValue placeholder="Select year" />
            </SelectTrigger>
            <SelectContent>
              {[...Array(5)].map((_, i) => {
                const y = new Date().getFullYear() + 1 - i;
                return <SelectItem key={y} value={String(y)}>{y}</SelectItem>;
              })}
            </SelectContent>
          </Select>
          {period === 'quarterly' && (
            <Select value={String(quarter)} onValueChange={(v) => setQuarter(Number(v))}>
              <SelectTrigger className="w-full sm:w-[100px] bg-gray-800 border-gray-600">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Q1</SelectItem>
                <SelectItem value="2">Q2</SelectItem>
                <SelectItem value="3">Q3</SelectItem>
                <SelectItem value="4">Q4</SelectItem>
              </SelectContent>
            </Select>
          )}
          {period === 'monthly' && (
            <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
              <SelectTrigger className="w-full sm:w-[140px] bg-gray-800 border-gray-600">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 12 }, (_, i) => (
                  <SelectItem key={i + 1} value={String(i + 1)}>
                    {new Date(2025, i).toLocaleString('en-US', { month: 'long' })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </CardContent>
      </Card>

      {/* ── Leaderboard Rows ────────────────────────────────────────── */}
      <main className="max-w-7xl mx-auto">
        {loading ? (
          <LeaderboardSkeleton />
        ) : error ? (
          <Alert variant="destructive" className="bg-red-900/50 border-red-700 text-red-300">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : rows.length === 0 ? (
          <div className="text-center py-16">
            <BarChart className="mx-auto h-12 w-12 text-gray-500 mb-4" />
            <h3 className="text-lg font-medium text-gray-400">No Data Available</h3>
            <p className="text-sm text-gray-500">Leaderboard data for {periodLabel} is not yet available.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {rows.map((agent, index) => {
              const progress = leaderScore > 0 ? (agent.closed / leaderScore) * 100 : 0;
              return (
                <Card
                  key={agent.agentId ?? `${index}`}
                  className={cn(
                    'bg-gray-800/50 border-2 transition-all duration-300 ease-out',
                    index === 0 && 'border-yellow-400 shadow-2xl shadow-yellow-500/20',
                    index === 1 && 'border-gray-500',
                    index === 2 && 'border-orange-700',
                    index > 2 && 'border-gray-700'
                  )}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      <div className="flex-shrink-0 text-3xl font-bold text-gray-500 w-12 text-center">
                        {index + 1}
                      </div>
                      <Avatar className="h-16 w-16 border-2 border-gray-600">
                        <AvatarImage src={agent.avatarUrl ?? undefined} alt={agent.displayName} />
                        <AvatarFallback>{(agent.displayName ?? '—').charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-grow min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="text-xl sm:text-2xl font-bold truncate">{agent.displayName ?? 'Unknown Agent'}</div>
                          {agent.isCorrected && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger>
                                  <Badge variant="outline" className="border-yellow-400 text-yellow-400">Corrected</Badge>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs bg-gray-800 text-white border-gray-600">
                                  <p className="font-semibold">Reason for Correction:</p>
                                  <p>{agent.correctionReason}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>
                        <div className="mt-2 h-6 w-full bg-gray-700/50 rounded-full overflow-hidden border border-gray-600">
                          <div
                            className={cn(
                              'h-full rounded-full bg-gradient-to-r from-blue-500 to-primary transition-all duration-500 ease-out flex items-center justify-end pr-2',
                              index === 0 && 'from-yellow-500 to-orange-400'
                            )}
                            style={{ width: `${progress}%` }}
                          >
                            <RaceIcon rank={index} />
                          </div>
                        </div>
                        {/* Stats row */}
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400">
                          <span>Volume: <span className="text-gray-200 font-medium">{fmtCurrency(agent.closedVolume)}</span></span>
                          <span>GCI: <span className="text-gray-200 font-medium">{fmtCurrency(agent.totalGCI)}</span></span>
                          {agent.listings > 0 && (
                            <span>Listings: <span className="text-gray-200 font-medium">{agent.listings}</span></span>
                          )}
                        </div>
                      </div>
                      <div className="flex-shrink-0 text-right w-32 sm:w-48">
                        <div className="text-3xl sm:text-4xl font-black tabular-nums">{agent.closed}</div>
                        <div className="text-sm text-gray-400 font-medium">Closed</div>
                        <div className="text-lg text-gray-500 font-semibold mt-1">
                          {agent.pending} Pending
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* ── Recent Activity ─────────────────────────────────────── */}
        {!loading && period === 'yearly' && (recentPendings.length > 0 || recentSold.length > 0) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-10">
            {recentPendings.length > 0 && (
              <Card className="bg-gray-800/30 border-gray-700">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Clock className="h-5 w-5 text-amber-400" />
                    Recent Pendings
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {recentPendings.map((d, i) => (
                    <div key={i} className="flex items-center justify-between text-sm py-1.5 border-b border-gray-700/50 last:border-0">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{d.address || 'No address'}</div>
                        <div className="text-xs text-gray-400">{d.agentName} · {d.date}</div>
                      </div>
                      <div className="text-right flex-shrink-0 ml-3">
                        <div className="font-semibold">{fmtCurrency(d.dealValue)}</div>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
            {recentSold.length > 0 && (
              <Card className="bg-gray-800/30 border-gray-700">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-green-400" />
                    Recent Sold
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {recentSold.map((d, i) => (
                    <div key={i} className="flex items-center justify-between text-sm py-1.5 border-b border-gray-700/50 last:border-0">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{d.address || 'No address'}</div>
                        <div className="text-xs text-gray-400">{d.agentName} · {d.date}</div>
                      </div>
                      <div className="text-right flex-shrink-0 ml-3">
                        <div className="font-semibold">{fmtCurrency(d.dealValue)}</div>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </main>

      <footer className="text-center mt-12 text-gray-600">
        <p>Displaying {period} results for {periodLabel}</p>
      </footer>
    </div>
  );
}

function TotalCard({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <Card className="bg-gray-800/40 border-gray-700">
      <CardContent className="p-3 sm:p-4 text-center">
        <Icon className="h-5 w-5 mx-auto mb-1 text-gray-400" />
        <div className="text-lg sm:text-xl font-bold">{value}</div>
        <div className="text-xs text-gray-400">{label}</div>
      </CardContent>
    </Card>
  );
}
