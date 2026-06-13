'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Trophy, ArrowLeft, RefreshCw, Calendar, Users, BarChart3,
  TrendingUp, Clock, Crown, Medal, Award, Flame, Zap,
  Phone, MessageSquare, CalendarCheck, FileSignature, CheckCircle2,
  DollarSign, Home, AlertCircle,
} from 'lucide-react';
import { useUser } from '@/firebase';

// ── KPI metadata ─────────────────────────────────────────────────────────────
const KPI_META: Record<string, { label: string; icon: any; color: string; isCurrency?: boolean }> = {
  calls:             { label: 'Calls',             icon: Phone,         color: 'text-blue-500' },
  engagements:       { label: 'Engagements',        icon: MessageSquare, color: 'text-purple-500' },
  appointments_set:  { label: 'Appts Set',          icon: CalendarCheck, color: 'text-indigo-500' },
  appointments_held: { label: 'Appts Held',         icon: CalendarCheck, color: 'text-violet-500' },
  contracts_written: { label: 'Contracts Written',  icon: FileSignature, color: 'text-orange-500' },
  closed_deals:      { label: 'Closings',           icon: CheckCircle2,  color: 'text-emerald-500' },
  closed_volume:     { label: 'Closed Volume',      icon: DollarSign,    color: 'text-green-600', isCurrency: true },
  total_units:       { label: 'Total Units',        icon: Home,          color: 'text-teal-500' },
};

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmtDate(d: string) {
  if (!d) return '';
  return new Date(d + 'T00:00:00Z').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  });
}
function fmtVal(v: number, isCurrency = false) {
  if (isCurrency) {
    if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
    if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
    return `$${v.toLocaleString()}`;
  }
  return v.toLocaleString();
}
function daysLeft(endDate: string): { label: string; urgent: boolean } {
  const today = new Date().toISOString().slice(0, 10);
  if (endDate < today) return { label: 'Ended', urgent: false };
  if (endDate === today) return { label: 'Last day!', urgent: true };
  const diff = Math.round(
    (new Date(endDate + 'T00:00:00Z').getTime() - new Date(today + 'T00:00:00Z').getTime()) / 86400000
  );
  return { label: `${diff} day${diff !== 1 ? 's' : ''} left`, urgent: diff <= 2 };
}
function positionIcon(pos: number) {
  if (pos === 1) return <Crown className="h-5 w-5 text-amber-400" />;
  if (pos === 2) return <Medal className="h-5 w-5 text-gray-400" />;
  if (pos === 3) return <Award className="h-5 w-5 text-amber-700" />;
  return <span className="text-sm font-bold text-muted-foreground w-5 text-center">{pos}</span>;
}
function positionBg(pos: number) {
  if (pos === 1) return 'bg-gradient-to-r from-amber-50 to-yellow-50 border-amber-200 dark:from-amber-950/30 dark:to-yellow-950/20 dark:border-amber-800';
  if (pos === 2) return 'bg-gradient-to-r from-gray-50 to-slate-50 border-gray-200 dark:from-gray-900/30 dark:border-gray-700';
  if (pos === 3) return 'bg-gradient-to-r from-orange-50 to-amber-50 border-orange-200 dark:from-orange-950/20 dark:border-orange-800';
  return '';
}

// ── Mini bar chart ────────────────────────────────────────────────────────────
function MiniBarChart({
  data,
  color,
  maxVal,
}: {
  data: { date: string; value: number; cumulative: number }[];
  color: string;
  maxVal: number;
}) {
  // Show last 14 days max
  const recent = data.slice(-14);
  const localMax = Math.max(...recent.map(d => d.value), 1);
  const displayMax = Math.max(localMax, maxVal > 0 ? maxVal * 0.3 : 1);

  return (
    <div className="flex items-end gap-0.5 h-8">
      {recent.map((d, i) => {
        const pct = displayMax > 0 ? (d.value / displayMax) * 100 : 0;
        const today = new Date().toISOString().slice(0, 10);
        const isToday = d.date === today;
        return (
          <div
            key={i}
            title={`${d.date}: ${d.value}`}
            className={[
              'flex-1 rounded-t-sm min-h-[2px] transition-all',
              isToday ? 'opacity-100' : 'opacity-60',
            ].join(' ')}
            style={{
              height: `${Math.max(pct, 4)}%`,
              backgroundColor: color,
            }}
          />
        );
      })}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function CompetitionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const competitionId = params.competitionId as string;
  const { user, loading: userLoading } = useUser();

  const [comp, setComp] = useState<any | null>(null);
  const [standings, setStandings] = useState<any[]>([]);
  const [summary, setSummary] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [myProfileId, setMyProfileId] = useState<string>('');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStandings = useCallback(async (silent = false) => {
    if (!user) return;
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const token = await user.getIdToken();

      // Resolve my profile id
      if (!myProfileId) {
        const meRes = await fetch('/api/agent-competitions', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const meData = await meRes.json();
        if (meData.ok) setMyProfileId(meData.agentProfileId || '');
      }

      const res = await fetch(`/api/agent-competitions/${competitionId}/standings`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.ok) {
        setComp(data.competition);
        setStandings(data.standings || []);
        setSummary(data.summary);
        setLastUpdated(new Date());
        setError(null);
      } else {
        setError(data.error || 'Failed to load standings');
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user, competitionId, myProfileId]);

  useEffect(() => {
    if (!userLoading && user) {
      fetchStandings();
    }
  }, [user, userLoading, fetchStandings]);

  // Auto-refresh every 60 seconds for active competitions
  useEffect(() => {
    if (comp?.status === 'active') {
      intervalRef.current = setInterval(() => fetchStandings(true), 60_000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [comp?.status, fetchStandings]);

  if (userLoading || loading) {
    return (
      <div className="p-6 max-w-3xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (error || !comp) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <Button variant="ghost" size="sm" onClick={() => router.back()} className="mb-4 gap-1">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error || 'Competition not found'}</AlertDescription>
        </Alert>
      </div>
    );
  }

  const meta = KPI_META[comp.metric] || { label: comp.metricLabel || comp.metric, icon: BarChart3, color: 'text-blue-500' };
  const MetricIcon = meta.icon;
  const today = new Date().toISOString().slice(0, 10);
  const isLive = comp.status === 'active' && comp.endDate >= today;
  const isEnded = comp.endDate < today;
  const { label: daysLeftLabel, urgent: daysLeftUrgent } = daysLeft(comp.endDate);
  const topTotal = standings[0]?.total || 0;
  const myStanding = standings.find(s => s.agentId === myProfileId);

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-5">
      {/* Back button */}
      <Button variant="ghost" size="sm" asChild className="gap-1 -ml-2">
        <Link href="/dashboard/competitions">
          <ArrowLeft className="h-4 w-4" /> All Competitions
        </Link>
      </Button>

      {/* Header card */}
      <Card className={[
        'border-2',
        isLive ? 'border-emerald-300 bg-gradient-to-br from-emerald-50/50 to-transparent dark:from-emerald-950/20' : '',
        isEnded ? 'border-blue-200 bg-gradient-to-br from-blue-50/30 to-transparent dark:from-blue-950/10' : '',
      ].join(' ')}>
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className={[
                'w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-sm',
                isLive ? 'bg-emerald-100 dark:bg-emerald-900/40' : 'bg-muted',
              ].join(' ')}>
                <MetricIcon className={`h-7 w-7 ${meta.color}`} />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h1 className="text-xl font-black">{comp.name}</h1>
                  {isLive && (
                    <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-xs gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" />
                      Live
                    </Badge>
                  )}
                  {isEnded && (
                    <Badge className="bg-blue-100 text-blue-800 border-blue-200 text-xs">Final Results</Badge>
                  )}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <MetricIcon className={`h-3.5 w-3.5 ${meta.color}`} />
                    <strong className="text-foreground">{meta.label}</strong>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5" />
                    {standings.length} competitors
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5" />
                    {fmtDate(comp.startDate)} – {fmtDate(comp.endDate)}
                  </span>
                  {!isEnded && (
                    <span className={`flex items-center gap-1.5 font-medium ${daysLeftUrgent ? 'text-red-500' : 'text-amber-600'}`}>
                      <Clock className="h-3.5 w-3.5" />
                      {daysLeftLabel}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => fetchStandings(true)}
              disabled={refreshing}
              className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground flex-shrink-0"
              title="Refresh standings"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* My position callout */}
          {myStanding && (
            <div className={[
              'mt-4 rounded-xl px-4 py-3 flex items-center justify-between',
              myStanding.position === 1 ? 'bg-amber-100 dark:bg-amber-900/30' : 'bg-primary/5',
            ].join(' ')}>
              <div className="flex items-center gap-2">
                {positionIcon(myStanding.position)}
                <span className="font-semibold text-sm">
                  {myStanding.position === 1 ? '🏆 You\'re in the lead!' : `You're in ${myStanding.position}${ordinal(myStanding.position)} place`}
                </span>
              </div>
              <div className="text-right">
                <div className="font-black text-lg">{fmtVal(myStanding.total, meta.isCurrency)}</div>
                <div className="text-xs text-muted-foreground">Today: {fmtVal(myStanding.todayValue, meta.isCurrency)}</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Leaderboard */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-base flex items-center gap-2">
            <Trophy className="h-4 w-4 text-amber-500" />
            Leaderboard
          </h2>
          {lastUpdated && (
            <span className="text-xs text-muted-foreground">
              Updated {lastUpdated.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            </span>
          )}
        </div>

        {standings.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              <BarChart3 className="h-8 w-8 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No activity recorded yet for this competition period.</p>
              <p className="text-xs mt-1">Log your daily activity to see standings here.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {standings.map((s, idx) => {
              const isMe = s.agentId === myProfileId;
              const pct = topTotal > 0 ? (s.total / topTotal) * 100 : 0;
              const gapFromLeader = idx > 0 ? standings[0].total - s.total : 0;

              return (
                <Card
                  key={s.agentId}
                  className={[
                    'border transition-all',
                    positionBg(s.position),
                    isMe ? 'ring-2 ring-primary ring-offset-1' : '',
                  ].join(' ')}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      {/* Position */}
                      <div className="flex items-center justify-center w-8 flex-shrink-0">
                        {positionIcon(s.position)}
                      </div>

                      {/* Avatar */}
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-black flex-shrink-0 shadow-sm"
                        style={{ backgroundColor: s.color }}
                      >
                        {s.displayName.charAt(0).toUpperCase()}
                      </div>

                      {/* Name + bar */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`font-bold text-sm truncate ${isMe ? 'text-primary' : ''}`}>
                            {s.displayName}
                            {isMe && <span className="text-xs font-normal text-muted-foreground ml-1">(you)</span>}
                          </span>
                          {s.position === 1 && <Flame className="h-3.5 w-3.5 text-orange-500 flex-shrink-0" />}
                          {s.todayValue > 0 && (
                            <Badge className="text-[10px] px-1.5 py-0 bg-green-100 text-green-800 border-green-200">
                              +{fmtVal(s.todayValue, meta.isCurrency)} today
                            </Badge>
                          )}
                        </div>
                        {/* Progress bar */}
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${Math.max(pct, s.total > 0 ? 3 : 0)}%`, backgroundColor: s.color }}
                          />
                        </div>
                        {/* Mini bar chart */}
                        {s.dailyBreakdown && s.dailyBreakdown.length > 1 && (
                          <div className="mt-1.5">
                            <MiniBarChart
                              data={s.dailyBreakdown}
                              color={s.color}
                              maxVal={topTotal}
                            />
                          </div>
                        )}
                      </div>

                      {/* Score */}
                      <div className="text-right flex-shrink-0 ml-2">
                        <div className="font-black text-xl" style={{ color: s.color }}>
                          {fmtVal(s.total, meta.isCurrency)}
                        </div>
                        {idx > 0 && gapFromLeader > 0 && (
                          <div className="text-xs text-muted-foreground">
                            -{fmtVal(gapFromLeader, meta.isCurrency)} behind
                          </div>
                        )}
                        {idx === 0 && standings.length > 1 && (
                          <div className="text-xs text-amber-600 font-medium">Leading!</div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Stats summary */}
      {standings.length > 0 && (
        <Card className="bg-muted/30">
          <CardContent className="p-4">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-black text-amber-500">{fmtVal(topTotal, meta.isCurrency)}</div>
                <div className="text-xs text-muted-foreground">Leader total</div>
              </div>
              <div>
                <div className="text-2xl font-black">
                  {fmtVal(
                    Math.round(standings.reduce((sum, s) => sum + s.total, 0) / standings.length),
                    meta.isCurrency
                  )}
                </div>
                <div className="text-xs text-muted-foreground">Group average</div>
              </div>
              <div>
                <div className="text-2xl font-black text-emerald-500">
                  {fmtVal(standings.reduce((sum, s) => sum + s.total, 0), meta.isCurrency)}
                </div>
                <div className="text-xs text-muted-foreground">Combined total</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Footer note */}
      <p className="text-xs text-muted-foreground text-center pb-4">
        Standings refresh automatically every 60 seconds. Based on daily activity logs and transactions.
      </p>
    </div>
  );
}

function ordinal(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return 'th';
  switch (n % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
}
