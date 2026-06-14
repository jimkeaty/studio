'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Trophy, ArrowLeft, RefreshCw, Calendar, Users, BarChart3,
  Clock, Crown, Medal, Award, Flame, Phone, MessageSquare,
  CalendarCheck, FileSignature, CheckCircle2, DollarSign, Home,
  AlertCircle, Gift, Plus,
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

const FORMAT_META: Record<string, { label: string; emoji: string; gradientFrom: string; gradientTo: string }> = {
  standard:      { label: 'Standard',        emoji: '🏆', gradientFrom: 'from-blue-500',   gradientTo: 'to-indigo-500' },
  golf:          { label: 'Golf Challenge',  emoji: '⛳', gradientFrom: 'from-green-500',  gradientTo: 'to-emerald-600' },
  nascar:        { label: 'NASCAR Race',     emoji: '🏎️', gradientFrom: 'from-red-500',    gradientTo: 'to-orange-500' },
  march_madness: { label: 'March Madness',   emoji: '🏀', gradientFrom: 'from-orange-500', gradientTo: 'to-amber-500' },
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
function fmtCurrency(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
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
function ordinal(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return 'th';
  switch (n % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
}

// ── Mini bar chart ────────────────────────────────────────────────────────────
function MiniBarChart({ data, color, maxVal }: {
  data: { date: string; value: number; cumulative: number }[];
  color: string;
  maxVal: number;
}) {
  const recent = data.slice(-14);
  const localMax = Math.max(...recent.map(d => d.value), 1);
  const displayMax = Math.max(localMax, maxVal > 0 ? maxVal * 0.3 : 1);
  return (
    <div className="flex items-end gap-0.5 h-8">
      {recent.map((d, i) => {
        const pct = displayMax > 0 ? (d.value / displayMax) * 100 : 0;
        const isToday = d.date === new Date().toISOString().slice(0, 10);
        return (
          <div
            key={i}
            title={`${d.date}: ${d.value}`}
            className={`flex-1 rounded-t-sm min-h-[2px] transition-all ${isToday ? 'opacity-100' : 'opacity-60'}`}
            style={{ height: `${Math.max(pct, 4)}%`, backgroundColor: color }}
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
  const [teamStandings, setTeamStandings] = useState<any[]>([]);
  const [isTeamComp, setIsTeamComp] = useState(false);
  const [teamScoringMethod, setTeamScoringMethod] = useState<string>('');
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);
  const [summary, setSummary] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [myProfileId, setMyProfileId] = useState<string>('');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Prize / pot state
  const [prizes, setPrizes] = useState<any[]>([]);
  const [totalPot, setTotalPot] = useState(0);
  const [showAddPrize, setShowAddPrize] = useState(false);
  const [prizeForm, setPrizeForm] = useState({ description: '', amount: '', place: 'any', donorName: '', donorType: 'agent' });
  const [addingPrize, setAddingPrize] = useState(false);
  const [prizeError, setPrizeError] = useState<string | null>(null);

  // Bracket state (March Madness)
  const [rounds, setRounds] = useState<any[]>([]);
  const [initializingBracket, setInitializingBracket] = useState(false);
  const [advancingMatchup, setAdvancingMatchup] = useState<string | null>(null);

  const fetchAll = useCallback(async (silent = false) => {
    if (!user) return;
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const token = await user.getIdToken();

      // Resolve my profile id
      let resolvedProfileId = myProfileId;
      if (!resolvedProfileId) {
        const meRes = await fetch('/api/agent-competitions', { headers: { Authorization: `Bearer ${token}` } });
        const meData = await meRes.json();
        if (meData.ok) { resolvedProfileId = meData.agentProfileId || ''; setMyProfileId(resolvedProfileId); }
      }

      const [standingsRes, prizesRes] = await Promise.all([
        fetch(`/api/agent-competitions/${competitionId}/standings`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`/api/agent-competitions/${competitionId}/prizes`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const [standingsData, prizesData] = await Promise.all([standingsRes.json(), prizesRes.json()]);

      if (standingsData.ok) {
        setComp(standingsData.competition);
        setStandings(standingsData.standings || []);
        setTeamStandings(standingsData.teamStandings || []);
        setIsTeamComp(standingsData.isTeamCompetition || false);
        setTeamScoringMethod(standingsData.teamScoringMethod || '');
        setSummary(standingsData.summary);
        setLastUpdated(new Date());
        setError(null);
        // Bracket data lives on the competition doc
        if (standingsData.competition?.format === 'march_madness') {
          setRounds(standingsData.competition.rounds || []);
        }
      } else {
        setError(standingsData.error || 'Failed to load standings');
      }
      if (prizesData.ok) { setPrizes(prizesData.prizes || []); setTotalPot(prizesData.totalPot || 0); }
    } catch (e: any) {
      if (!silent) setError(e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user, competitionId, myProfileId]);

  useEffect(() => { if (!userLoading && user) fetchAll(); }, [user, userLoading, fetchAll]);

  useEffect(() => {
    if (comp?.status === 'active') {
      intervalRef.current = setInterval(() => fetchAll(true), 60_000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [comp?.status, fetchAll]);

  const handleAddPrize = async () => {
    if (!user || !prizeForm.description.trim()) { setPrizeError('Prize description is required.'); return; }
    setAddingPrize(true); setPrizeError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/agent-competitions/${competitionId}/prizes`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: prizeForm.description.trim(),
          amount: Number(prizeForm.amount) || 0,
          place: (prizeForm.place && prizeForm.place !== 'any') ? Number(prizeForm.place) : null,
          donorName: prizeForm.donorName.trim() || undefined,
          donorType: prizeForm.donorType,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setShowAddPrize(false);
        setPrizeForm({ description: '', amount: '', place: '', donorName: '', donorType: 'agent' });
        await fetchAll(true);
      } else { setPrizeError(data.error || 'Failed to add prize'); }
    } catch (e: any) { setPrizeError(e.message); }
    finally { setAddingPrize(false); }
  };

  const handleInitBracket = async () => {
    if (!user) return;
    setInitializingBracket(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/agent-competitions/${competitionId}/bracket`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'initialize_bracket' }),
      });
      const data = await res.json();
      if (data.ok) { setRounds(data.rounds || []); await fetchAll(true); }
    } catch {}
    setInitializingBracket(false);
  };

  const handleAdvanceMatchup = async (roundIndex: number, matchupIndex: number, winnerId: string) => {
    if (!user) return;
    const key = `${roundIndex}_${matchupIndex}`;
    setAdvancingMatchup(key);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/agent-competitions/${competitionId}/bracket`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set_winner', roundIndex, matchupIndex, winnerId }),
      });
      const data = await res.json();
      if (data.ok) { setRounds(data.rounds || []); await fetchAll(true); }
    } catch {}
    setAdvancingMatchup(null);
  };

  if (userLoading || loading) {
    return (
      <div className="p-6 max-w-3xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
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

  const format = comp.format || 'standard';
  const fmeta = FORMAT_META[format] || FORMAT_META.standard;
  const meta = KPI_META[comp.metric] || { label: comp.metricLabel || comp.metric, icon: BarChart3, color: 'text-blue-500' };
  const MetricIcon = meta.icon;
  const today = new Date().toISOString().slice(0, 10);
  const isLive = comp.status === 'active' && comp.endDate >= today;
  const isEnded = comp.endDate < today;
  const { label: daysLeftLabel, urgent: daysLeftUrgent } = daysLeft(comp.endDate);
  const topTotal = isTeamComp && teamStandings.length > 0 ? (teamStandings[0]?.total || 0) : (standings[0]?.total || 0);
  const myTeamStanding = isTeamComp ? teamStandings.find(t => t.memberIds?.includes(myProfileId)) : null;
  const myStanding = standings.find(s => s.agentId === myProfileId);
  const isCreator = comp.createdBy === myProfileId;
  const participantNames: Record<string, string> = comp.participantNames || {};

  // Team scoring method label
  const teamScoringLabel = teamScoringMethod === 'scramble' ? '⛳ Scramble (best ball)'
    : teamScoringMethod === 'combined' ? '➕ Combined (sum of team)'
    : teamScoringMethod === 'average' ? '📊 Average of team'
    : '';

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-5">
      {/* Back */}
      <Button variant="ghost" size="sm" asChild className="gap-1 -ml-2">
        <Link href="/dashboard/competitions"><ArrowLeft className="h-4 w-4" /> All Competitions</Link>
      </Button>

      {/* ── Header card ─────────────────────────────────────────────────── */}
      <Card className={[
        'border-2',
        isLive ? 'border-emerald-300 bg-gradient-to-br from-emerald-50/50 to-transparent dark:from-emerald-950/20' : '',
        isEnded ? 'border-blue-200 bg-gradient-to-br from-blue-50/30 to-transparent dark:from-blue-950/10' : '',
      ].join(' ')}>
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${fmeta.gradientFrom} ${fmeta.gradientTo} flex items-center justify-center text-3xl flex-shrink-0 shadow-sm`}>
                {fmeta.emoji}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h1 className="text-xl font-black">{comp.name}</h1>
                  <Badge variant="outline" className="text-xs">{fmeta.label}</Badge>
                  {isLive && (
                    <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-xs gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" />
                      Live
                    </Badge>
                  )}
                  {isEnded && <Badge className="bg-blue-100 text-blue-800 border-blue-200 text-xs">Final Results</Badge>}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <MetricIcon className={`h-3.5 w-3.5 ${meta.color}`} />
                    <strong className="text-foreground">{meta.label}</strong>
                  </span>
                  <span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" />{standings.length} competitors</span>
                  <span className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" />{fmtDate(comp.startDate)} – {fmtDate(comp.endDate)}</span>
                  {!isEnded && (
                    <span className={`flex items-center gap-1.5 font-medium ${daysLeftUrgent ? 'text-red-500' : 'text-amber-600'}`}>
                      <Clock className="h-3.5 w-3.5" />{daysLeftLabel}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => fetchAll(true)}
              disabled={refreshing}
              className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground flex-shrink-0"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* My position callout */}
          {isTeamComp && myTeamStanding ? (
            <div className={`mt-4 rounded-xl px-4 py-3 flex items-center justify-between ${myTeamStanding.position === 1 ? 'bg-amber-100 dark:bg-amber-900/30' : 'bg-primary/5'}`}>
              <div className="flex items-center gap-2">
                {positionIcon(myTeamStanding.position)}
                <div>
                  <span className="font-semibold text-sm">
                    {myTeamStanding.position === 1 ? `🏆 ${myTeamStanding.teamName} is leading!` : `${myTeamStanding.teamName} is in ${myTeamStanding.position}${ordinal(myTeamStanding.position)} place`}
                  </span>
                  {myTeamStanding.mascot && <span className="ml-1.5 text-base">{myTeamStanding.mascot}</span>}
                  <div className="text-xs text-muted-foreground">{teamScoringLabel}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="font-black text-lg" style={{ color: myTeamStanding.teamColor || undefined }}>{fmtVal(myTeamStanding.total, meta.isCurrency)}</div>
                <div className="text-xs text-muted-foreground">Your contribution: {fmtVal(myStanding?.total || 0, meta.isCurrency)}</div>
              </div>
            </div>
          ) : myStanding ? (
            <div className={`mt-4 rounded-xl px-4 py-3 flex items-center justify-between ${myStanding.position === 1 ? 'bg-amber-100 dark:bg-amber-900/30' : 'bg-primary/5'}`}>
              <div className="flex items-center gap-2">
                {positionIcon(myStanding.position)}
                <span className="font-semibold text-sm">
                  {myStanding.position === 1 ? "🏆 You're in the lead!" : `You're in ${myStanding.position}${ordinal(myStanding.position)} place`}
                </span>
              </div>
              <div className="text-right">
                <div className="font-black text-lg">{fmtVal(myStanding.total, meta.isCurrency)}</div>
                <div className="text-xs text-muted-foreground">Today: {fmtVal(myStanding.todayValue || 0, meta.isCurrency)}</div>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* ── Prize / Pot Panel ─────────────────────────────────────────────── */}
      <Card className="border-amber-200 bg-gradient-to-r from-amber-50/50 to-transparent dark:from-amber-950/20">
        <CardHeader className="pb-2 pt-4 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Gift className="h-4 w-4 text-amber-500" />
              Prize Pot
              {totalPot > 0 && <span className="text-amber-600 font-bold">{fmtCurrency(totalPot)}</span>}
            </CardTitle>
            <Button
              size="sm" variant="outline"
              onClick={() => { setShowAddPrize(true); setPrizeError(null); }}
              className="gap-1.5 text-xs h-7 border-amber-300 text-amber-700 hover:bg-amber-50"
            >
              <Plus className="h-3 w-3" /> Add Prize
            </Button>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {prizes.length === 0 ? (
            <div className="text-center py-3 space-y-1">
              {comp.prizeDescription && <p className="text-sm font-medium text-amber-700">🏆 {comp.prizeDescription}</p>}
              {comp.buyInAmount > 0 && <p className="text-xs text-green-600">💰 ${comp.buyInAmount}/person buy-in</p>}
              <p className="text-xs text-muted-foreground">No prizes added yet. Anyone can add prizes — agents, brokers, team leaders, or vendors.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {comp.prizeDescription && <p className="text-sm font-medium text-amber-700">🏆 {comp.prizeDescription}</p>}
              {prizes.map((prize: any) => (
                <div key={prize.id} className="flex items-center justify-between gap-2 text-sm py-1.5 border-b border-border/50 last:border-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-base shrink-0">
                      {prize.place === 1 ? '🥇' : prize.place === 2 ? '🥈' : prize.place === 3 ? '🥉' : <Gift className="h-3.5 w-3.5 text-amber-500" />}
                    </span>
                    <div className="min-w-0">
                      <p className="font-medium truncate">{prize.description}</p>
                      <p className="text-xs text-muted-foreground">
                        Added by {prize.donorName}
                        {prize.donorType !== 'agent' && <span className="ml-1 capitalize text-amber-600">({prize.donorType})</span>}
                      </p>
                    </div>
                  </div>
                  {prize.amount > 0 && <span className="text-green-600 font-bold shrink-0">{fmtCurrency(prize.amount)}</span>}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── March Madness Bracket ─────────────────────────────────────────── */}
      {format === 'march_madness' && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                🏀 Bracket
                {comp.championId && (
                  <span className="text-amber-600 font-bold">
                    🏆 Champion: {participantNames[comp.championId] || comp.championId}
                  </span>
                )}
              </CardTitle>
              {isCreator && rounds.length === 0 && (
                <Button
                  size="sm" onClick={handleInitBracket} disabled={initializingBracket}
                  className="gap-1.5 text-xs bg-orange-500 hover:bg-orange-600 text-white"
                >
                  {initializingBracket ? 'Seeding...' : '🎲 Seed Bracket'}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {rounds.length === 0 ? (
              <div className="text-center py-6 space-y-2">
                <p className="text-2xl">🏀</p>
                <p className="font-semibold">Bracket not yet seeded</p>
                <p className="text-sm text-muted-foreground">
                  {isCreator
                    ? `${comp.participantIds?.length || 0} agents ready. Click "Seed Bracket" to randomly assign matchups.`
                    : 'The competition creator will seed the bracket soon.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <div className="flex gap-6 min-w-max pb-2">
                  {rounds.map((round: any, rIdx: number) => (
                    <div key={rIdx} className="flex flex-col gap-3 min-w-[180px]">
                      <p className="text-xs font-semibold text-center text-muted-foreground uppercase tracking-wide">{round.roundLabel}</p>
                      <div className="flex flex-col gap-4">
                        {round.matchups.map((matchup: any, mIdx: number) => {
                          const p1Name = matchup.player1Id === 'bye' ? 'BYE' : (participantNames[matchup.player1Id] || matchup.player1Id || 'TBD');
                          const p2Name = matchup.player2Id === 'bye' ? 'BYE' : (participantNames[matchup.player2Id] || matchup.player2Id || 'TBD');
                          const hasWinner = !!matchup.winnerId;
                          const advKey = `${rIdx}_${mIdx}`;
                          const canAdvance = isCreator && !hasWinner && matchup.player1Id && matchup.player1Id !== 'bye' && matchup.player2Id && matchup.player2Id !== 'bye';
                          return (
                            <div key={mIdx} className={`rounded-lg border p-2 space-y-1.5 ${hasWinner ? 'border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20' : 'border-border bg-card'}`}>
                              {[{ id: matchup.player1Id, name: p1Name }, { id: matchup.player2Id, name: p2Name }].map((player, pi) => (
                                <div key={pi}>
                                  {pi === 1 && <div className="text-center text-[10px] text-muted-foreground font-medium">VS</div>}
                                  <div className={[
                                    'flex items-center justify-between gap-2 px-2 py-1 rounded text-sm',
                                    matchup.winnerId === player.id ? 'bg-emerald-100 dark:bg-emerald-900/40 font-bold' : '',
                                    matchup.winnerId && matchup.winnerId !== player.id ? 'opacity-40 line-through' : '',
                                  ].join(' ')}>
                                    <span className="truncate max-w-[110px]">{player.name}</span>
                                    <div className="flex items-center gap-1 shrink-0">
                                      {canAdvance && (
                                        <button
                                          type="button"
                                          onClick={() => handleAdvanceMatchup(rIdx, mIdx, player.id)}
                                          disabled={advancingMatchup === advKey}
                                          className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500 text-white hover:bg-emerald-600"
                                        >Win</button>
                                      )}
                                      {matchup.winnerId === player.id && <span className="text-emerald-600 text-xs">✓</span>}
                                    </div>
                                  </div>
                                </div>
                              ))}
                              {matchup.isBye && <p className="text-[10px] text-center text-muted-foreground">Auto-advance (bye)</p>}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Team Leaderboard ──────────────────────────────────────────────── */}
      {isTeamComp && teamStandings.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-blue-500" />
              Team Leaderboard
              {teamScoringLabel && <span className="text-xs text-muted-foreground font-normal">{teamScoringLabel}</span>}
            </h2>
          </div>
          <div className="space-y-2">
            {teamStandings.map((team: any, idx: number) => {
              const isMyTeam = team.memberIds?.includes(myProfileId);
              const pct = topTotal > 0 ? (team.total / topTotal) * 100 : 0;
              const gapFromLeader = idx > 0 ? teamStandings[0].total - team.total : 0;
              const expanded = expandedTeam === team.teamId;
              return (
                <Card key={team.teamId} className={['border transition-all', positionBg(team.position), isMyTeam ? 'ring-2 ring-primary ring-offset-1' : ''].join(' ')}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-8 flex-shrink-0">{positionIcon(team.position)}</div>
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center text-xl flex-shrink-0 shadow-sm border-2"
                        style={{ backgroundColor: (team.teamColor || '#6366f1') + '20', borderColor: team.teamColor || '#6366f1' }}
                      >
                        {team.mascot || team.teamName?.charAt(0) || '🏆'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`font-bold text-sm truncate ${isMyTeam ? 'text-primary' : ''}`}>
                            {team.teamName}{isMyTeam && <span className="text-xs font-normal text-muted-foreground ml-1">(your team)</span>}
                          </span>
                          {team.position === 1 && <Flame className="h-3.5 w-3.5 text-orange-500 flex-shrink-0" />}
                          <span className="text-xs text-muted-foreground ml-auto">{team.memberIds?.length || 0} members</span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.max(pct, team.total > 0 ? 3 : 0)}%`, backgroundColor: team.teamColor || '#6366f1' }} />
                        </div>
                        <div className="flex items-center justify-between mt-0.5">
                          <button
                            type="button"
                            onClick={() => setExpandedTeam(expanded ? null : team.teamId)}
                            className="text-[10px] text-blue-500 hover:text-blue-700 font-medium"
                          >
                            {expanded ? '▲ Hide members' : '▼ Show members'}
                          </button>
                          {idx > 0 && gapFromLeader > 0 && (
                            <span className="text-[10px] text-muted-foreground">-{fmtVal(gapFromLeader, meta.isCurrency)} behind</span>
                          )}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0 ml-2">
                        <div className="font-black text-xl" style={{ color: team.teamColor || '#6366f1' }}>{fmtVal(team.total, meta.isCurrency)}</div>
                        {idx === 0 && teamStandings.length > 1 && <div className="text-xs text-amber-600 font-medium">Leading!</div>}
                      </div>
                    </div>

                    {/* Member drill-down */}
                    {expanded && team.memberSummaries && team.memberSummaries.length > 0 && (
                      <div className="mt-3 pt-3 border-t space-y-1.5">
                        <p className="text-xs font-semibold text-muted-foreground mb-1">Team Members</p>
                        {team.memberSummaries.map((member: any) => {
                          const isMe = member.agentId === myProfileId;
                          return (
                            <div key={member.agentId} className={`flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-sm ${isMe ? 'bg-primary/5 font-medium' : 'bg-muted/30'}`}>
                              <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{ backgroundColor: team.teamColor || '#6366f1' }}>
                                {member.displayName?.charAt(0).toUpperCase()}
                              </div>
                              <span className="flex-1 truncate">{member.displayName}{isMe && <span className="text-xs font-normal text-muted-foreground ml-1">(you)</span>}</span>
                              <span className="font-bold" style={{ color: team.teamColor || '#6366f1' }}>{fmtVal(member.total, meta.isCurrency)}</span>
                              {member.todayValue > 0 && (
                                <span className="text-[10px] text-green-600">+{fmtVal(member.todayValue, meta.isCurrency)} today</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Golf Scorecard ────────────────────────────────────────────────── */}
      {format === 'golf' && standings.length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              ⛳ Clubhouse Leaderboard
              <span className="text-xs text-muted-foreground font-normal">Lower score = closer to par = better</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            {standings.map((s: any, i: number) => {
              const isMe = s.agentId === myProfileId;
              const score = s.golfScore ?? s.total ?? 0;
              return (
                <div key={s.agentId} className={[
                  'flex items-center gap-3 p-3 rounded-lg border transition-all',
                  isMe ? 'border-primary bg-primary/5 ring-2 ring-primary ring-offset-1' : 'border-border hover:bg-muted/30',
                  positionBg(i + 1),
                ].join(' ')}>
                  <div className="flex items-center justify-center w-8 flex-shrink-0">{positionIcon(i + 1)}</div>
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-black flex-shrink-0 shadow-sm" style={{ backgroundColor: s.color }}>
                    {s.displayName.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`font-bold text-sm truncate ${isMe ? 'text-primary' : ''}`}>{s.displayName}</span>
                      {isMe && <span className="text-xs text-muted-foreground">(you)</span>}
                      {s.todayValue > 0 && <Badge className="text-[10px] px-1.5 py-0 bg-green-100 text-green-800 border-green-200">+{s.todayValue} today</Badge>}
                    </div>
                    {s.dailyBreakdown && s.dailyBreakdown.length > 1 && (
                      <MiniBarChart data={s.dailyBreakdown} color={s.color} maxVal={topTotal} />
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className={`text-xl font-black ${score < 0 ? 'text-green-600' : score > 0 ? 'text-red-500' : 'text-blue-500'}`}>
                      {score > 0 ? `+${score}` : score}
                    </div>
                    <div className="text-[10px] text-muted-foreground">{score < 0 ? 'Under Par' : score === 0 ? 'Even' : 'Over Par'}</div>
                  </div>
                </div>
              );
            })}
            {comp.thresholdRules && comp.thresholdRules.length > 0 && (
              <div className="mt-3 pt-3 border-t">
                <p className="text-xs font-semibold text-muted-foreground mb-2">Scoring Rules</p>
                <div className="flex flex-wrap gap-2">
                  {comp.thresholdRules.map((rule: any, i: number) => (
                    <div key={i} className="text-xs bg-muted rounded px-2 py-1">
                      {rule.emoji} {rule.label}: {rule.min}{rule.max !== null ? `–${rule.max}` : '+'} = {rule.score > 0 ? '+' : ''}{rule.score}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── NASCAR Points Race ────────────────────────────────────────────── */}
      {format === 'nascar' && standings.length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              🏎️ Points Race
              <span className="text-xs text-muted-foreground font-normal">Highest points wins</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            {standings.map((s: any, i: number) => {
              const isMe = s.agentId === myProfileId;
              const total = s.nascarPoints ?? s.total ?? 0;
              const leader = standings[0]?.nascarPoints ?? standings[0]?.total ?? 1;
              const pct = leader > 0 ? Math.round((total / leader) * 100) : 0;
              return (
                <div key={s.agentId} className={[
                  'p-3 rounded-lg border transition-all',
                  isMe ? 'border-primary bg-primary/5 ring-2 ring-primary ring-offset-1' : 'border-border hover:bg-muted/30',
                  positionBg(i + 1),
                ].join(' ')}>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-8 flex-shrink-0">{positionIcon(i + 1)}</div>
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-black flex-shrink-0 shadow-sm" style={{ backgroundColor: s.color }}>
                      {s.displayName.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div className="flex items-center gap-2 flex-wrap min-w-0">
                          <span className={`font-bold text-sm truncate ${isMe ? 'text-primary' : ''}`}>{s.displayName}</span>
                          {isMe && <span className="text-xs text-muted-foreground">(you)</span>}
                          {i === 0 && <Flame className="h-3.5 w-3.5 text-orange-500 flex-shrink-0" />}
                        </div>
                        <div className="text-right shrink-0">
                          <span className="font-black text-lg text-red-500">{total.toLocaleString()}</span>
                          <span className="text-xs text-muted-foreground ml-1">pts</span>
                        </div>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-red-500 to-orange-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="flex items-center justify-between mt-0.5">
                        <span className="text-[10px] text-muted-foreground">Today: +{s.todayValue ?? 0} pts</span>
                        {i > 0 && <span className="text-[10px] text-muted-foreground">{(leader - total).toLocaleString()} pts behind</span>}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            {comp.pointRules && (
              <div className="mt-3 pt-3 border-t">
                <p className="text-xs font-semibold text-muted-foreground mb-2">Point Values</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { key: 'closedDeal', label: '🏁 Closed Deal' },
                    { key: 'pendingDeal', label: '⏳ Pending' },
                    { key: 'engagementPoint', label: '💬 Engagement' },
                    { key: 'appointmentHeldPoint', label: '📅 Appt Held' },
                    { key: 'contractWrittenPoint', label: '📝 Contract' },
                  ].map(({ key, label }) => comp.pointRules[key] != null && (
                    <div key={key} className="text-xs bg-muted rounded px-2 py-1">{label}: {comp.pointRules[key]} pts</div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Standard Leaderboard (also used for March Madness standings) ─── */}
      {(format === 'standard' || format === 'march_madness') && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-base flex items-center gap-2">
              <Trophy className="h-4 w-4 text-amber-500" />
              {format === 'march_madness' ? 'Current Standings' : 'Leaderboard'}
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
              {standings.map((s: any, idx: number) => {
                const isMe = s.agentId === myProfileId;
                const pct = topTotal > 0 ? (s.total / topTotal) * 100 : 0;
                const gapFromLeader = idx > 0 ? standings[0].total - s.total : 0;
                return (
                  <Card key={s.agentId} className={['border transition-all', positionBg(s.position), isMe ? 'ring-2 ring-primary ring-offset-1' : ''].join(' ')}>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-8 flex-shrink-0">{positionIcon(s.position)}</div>
                        <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-black flex-shrink-0 shadow-sm" style={{ backgroundColor: s.color }}>
                          {s.displayName.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`font-bold text-sm truncate ${isMe ? 'text-primary' : ''}`}>
                              {s.displayName}{isMe && <span className="text-xs font-normal text-muted-foreground ml-1">(you)</span>}
                            </span>
                            {s.position === 1 && <Flame className="h-3.5 w-3.5 text-orange-500 flex-shrink-0" />}
                            {s.todayValue > 0 && (
                              <Badge className="text-[10px] px-1.5 py-0 bg-green-100 text-green-800 border-green-200">
                                +{fmtVal(s.todayValue, meta.isCurrency)} today
                              </Badge>
                            )}
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.max(pct, s.total > 0 ? 3 : 0)}%`, backgroundColor: s.color }} />
                          </div>
                          {s.dailyBreakdown && s.dailyBreakdown.length > 1 && (
                            <div className="mt-1.5"><MiniBarChart data={s.dailyBreakdown} color={s.color} maxVal={topTotal} /></div>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0 ml-2">
                          <div className="font-black text-xl" style={{ color: s.color }}>{fmtVal(s.total, meta.isCurrency)}</div>
                          {idx > 0 && gapFromLeader > 0 && <div className="text-xs text-muted-foreground">-{fmtVal(gapFromLeader, meta.isCurrency)} behind</div>}
                          {idx === 0 && standings.length > 1 && <div className="text-xs text-amber-600 font-medium">Leading!</div>}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Group stats ───────────────────────────────────────────────────── */}
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
                  {fmtVal(Math.round(standings.reduce((sum, s) => sum + s.total, 0) / standings.length), meta.isCurrency)}
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

      <p className="text-xs text-muted-foreground text-center pb-4">
        Standings refresh automatically every 60 seconds. Based on daily activity logs and transactions.
      </p>

      {/* ── Add Prize Dialog ─────────────────────────────────────────────── */}
      <Dialog open={showAddPrize} onOpenChange={setShowAddPrize}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gift className="h-4 w-4 text-amber-500" /> Add a Prize or Contribution
            </DialogTitle>
            <DialogDescription>
              Anyone can add prizes — agents, brokers, team leaders, or vendors.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Prize Description *</Label>
              <Input
                placeholder='e.g. "$50 cash", "Yeti Cooler", "Dinner voucher"'
                value={prizeForm.description}
                onChange={e => setPrizeForm(f => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Dollar Amount</Label>
                <div className="flex items-center gap-1">
                  <span className="text-sm text-muted-foreground">$</span>
                  <Input
                    type="number" min={0} placeholder="0"
                    value={prizeForm.amount}
                    onChange={e => setPrizeForm(f => ({ ...f, amount: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>For Place</Label>
                <Select value={prizeForm.place} onValueChange={v => setPrizeForm(f => ({ ...f, place: v }))}>
                  <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any / General Pot</SelectItem>
                    <SelectItem value="1">🥇 1st Place</SelectItem>
                    <SelectItem value="2">🥈 2nd Place</SelectItem>
                    <SelectItem value="3">🥉 3rd Place</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Your Name / Org</Label>
                <Input
                  placeholder="Leave blank to use your name"
                  value={prizeForm.donorName}
                  onChange={e => setPrizeForm(f => ({ ...f, donorName: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Contributor Type</Label>
                <Select value={prizeForm.donorType} onValueChange={v => setPrizeForm(f => ({ ...f, donorType: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="agent">Agent</SelectItem>
                    <SelectItem value="broker">Broker</SelectItem>
                    <SelectItem value="team_leader">Team Leader</SelectItem>
                    <SelectItem value="vendor">Vendor</SelectItem>
                    <SelectItem value="sponsor">Sponsor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {prizeError && (
              <Alert variant="destructive" className="py-2">
                <AlertCircle className="h-3.5 w-3.5" />
                <AlertDescription className="text-xs">{prizeError}</AlertDescription>
              </Alert>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowAddPrize(false)} disabled={addingPrize}>Cancel</Button>
            <Button
              onClick={handleAddPrize} disabled={addingPrize}
              className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white border-0"
            >
              {addingPrize ? 'Adding...' : '🎁 Add Prize'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
