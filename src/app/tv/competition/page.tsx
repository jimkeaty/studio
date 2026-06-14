'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Trophy, Crown, Flame, Zap, Star, ChevronUp, ChevronDown, Minus,
  Flag, Target, Calendar, Users, RefreshCw, ChevronLeft, ChevronRight,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type ThresholdRule = { min: number; max: number | null; score: number; label: string; emoji?: string };
type ScoreGrouping = { id: string; label: string; condition: 'lt' | 'eq' | 'gt'; threshold: number; color: string; emoji?: string };
type Prize = { place: number; label: string; amount: number };

type CompetitionConfig = {
  name: string;
  description?: string;
  theme: 'nascar' | 'golf' | 'horse_race';
  startDate: string;
  endDate: string;
  year: number;
  status: 'draft' | 'active' | 'completed' | 'archived';
  metric: string;
  metricLabel?: string;
  targetValue: number;
  scoringStrategy: string;
  rankingDirection: 'asc' | 'desc';
  thresholdRules?: ThresholdRule[];
  groupings?: ScoreGrouping[];
  prizes?: Prize[];
  leaderboardVariant?: string;
  autoRefreshSeconds?: number;
  showTopN?: number;
  tvLayout?: string;
};

type Competition = { id: string; config: CompetitionConfig };

type ParticipantStanding = {
  agentId: string;
  displayName: string;
  teamName: string | null;
  position: number;
  totalScore: number;
  todayScore: number;
  scoreLabel: string;
  color: string;
  groupId?: string;
  metricTotal: number;
  metricToday: number;
  targetCompletion: number;
  streak: number;
  movement: number;
  distanceFromLeader: number;
  bonusesApplied: { label: string; score: number }[];
  penaltiesApplied: { label: string; score: number }[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const AVATAR_GRADIENTS = [
  'from-yellow-400 to-orange-500',
  'from-blue-400 to-violet-600',
  'from-emerald-400 to-cyan-500',
  'from-rose-400 to-pink-600',
  'from-amber-400 to-red-500',
  'from-indigo-400 to-purple-600',
  'from-teal-400 to-blue-500',
  'from-orange-400 to-red-600',
];

function fmt$(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function fmtDate(d: string) {
  try { return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
  catch { return d; }
}

function daysLeft(endDate: string) {
  const end = new Date(endDate + 'T23:59:59');
  const now = new Date();
  const diff = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, diff);
}

// ─── Theme config ─────────────────────────────────────────────────────────────

const THEME_CONFIG = {
  nascar: {
    name: 'NASCAR',
    emoji: '🏎️',
    bgClass: 'bg-gray-950',
    accentClass: 'text-red-400',
    accentBg: 'bg-red-500/20',
    accentBorder: 'border-red-500/30',
    barClass: 'from-red-500 to-orange-500',
    leaderClass: 'from-yellow-400 to-orange-500',
    headerBg: 'bg-gradient-to-r from-red-900/40 to-gray-900',
    scoreLabel: 'Points',
    rankLabel: 'Position',
    icon: '🏎️',
  },
  golf: {
    name: 'Golf',
    emoji: '⛳',
    bgClass: 'bg-gray-950',
    accentClass: 'text-emerald-400',
    accentBg: 'bg-emerald-500/20',
    accentBorder: 'border-emerald-500/30',
    barClass: 'from-emerald-500 to-teal-400',
    leaderClass: 'from-emerald-400 to-teal-500',
    headerBg: 'bg-gradient-to-r from-emerald-900/40 to-gray-900',
    scoreLabel: 'Score',
    rankLabel: 'Standing',
    icon: '⛳',
  },
  horse_race: {
    name: 'Horse Race',
    emoji: '🐎',
    bgClass: 'bg-gray-950',
    accentClass: 'text-purple-400',
    accentBg: 'bg-purple-500/20',
    accentBorder: 'border-purple-500/30',
    barClass: 'from-purple-500 to-pink-500',
    leaderClass: 'from-purple-400 to-pink-500',
    headerBg: 'bg-gradient-to-r from-purple-900/40 to-gray-900',
    scoreLabel: 'Score',
    rankLabel: 'Position',
    icon: '🐎',
  },
};

// ─── Movement indicator ───────────────────────────────────────────────────────

function MovementBadge({ movement }: { movement: number }) {
  if (movement > 0) return (
    <span className="flex items-center gap-0.5 text-emerald-400 text-xs font-bold">
      <ChevronUp className="h-3 w-3" />+{movement}
    </span>
  );
  if (movement < 0) return (
    <span className="flex items-center gap-0.5 text-red-400 text-xs font-bold">
      <ChevronDown className="h-3 w-3" />{movement}
    </span>
  );
  return <Minus className="h-3 w-3 text-gray-600" />;
}

// ─── Golf score label helper ──────────────────────────────────────────────────

function golfScoreDisplay(score: number, groupId?: string) {
  if (score < 0) return { label: `${score}`, color: 'text-red-400', bg: 'bg-red-500/10' };
  if (score === 0) return { label: 'E', color: 'text-emerald-400', bg: 'bg-emerald-500/10' };
  return { label: `+${score}`, color: 'text-gray-300', bg: 'bg-white/5' };
}

// ─── Scoreboard Row ───────────────────────────────────────────────────────────

function ScoreboardRow({
  standing, index, total, theme, isGolf, leaderScore, config,
}: {
  standing: ParticipantStanding;
  index: number;
  total: number;
  theme: typeof THEME_CONFIG['nascar'];
  isGolf: boolean;
  leaderScore: number;
  config: CompetitionConfig;
}) {
  const isTop = index === 0;
  const isSecond = index === 1;
  const isThird = index === 2;
  const progress = leaderScore !== 0
    ? Math.round((standing.metricTotal / (config.targetValue || leaderScore || 1)) * 100)
    : 0;

  const golfDisplay = isGolf ? golfScoreDisplay(standing.totalScore, standing.groupId) : null;

  return (
    <div className={`flex items-center gap-4 px-6 py-4 rounded-2xl border transition-all ${
      isTop
        ? 'border-yellow-400/40 bg-gradient-to-r from-yellow-500/8 to-transparent'
        : isSecond
        ? 'border-slate-400/20 bg-white/3'
        : isThird
        ? 'border-amber-700/20 bg-white/3'
        : 'border-white/6 bg-white/2'
    }`}>

      {/* Rank */}
      <div className="w-12 flex-shrink-0 text-center">
        {isTop ? (
          <Crown className="h-8 w-8 mx-auto text-yellow-400" />
        ) : isSecond ? (
          <div className="text-2xl font-black text-slate-300">2</div>
        ) : isThird ? (
          <div className="text-2xl font-black text-amber-600">3</div>
        ) : (
          <div className="text-xl font-bold text-gray-500">#{standing.position}</div>
        )}
      </div>

      {/* Avatar */}
      <div className={`w-12 h-12 rounded-full flex-shrink-0 flex items-center justify-center text-white font-bold text-xl bg-gradient-to-br ${AVATAR_GRADIENTS[index % AVATAR_GRADIENTS.length]}`}>
        {standing.displayName.charAt(0).toUpperCase()}
      </div>

      {/* Name + details */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`font-bold text-lg truncate ${isTop ? 'text-yellow-100' : 'text-white'}`}>
            {standing.displayName}
          </span>
          {standing.streak > 1 && (
            <span className="flex items-center gap-0.5 text-orange-400 text-xs font-bold bg-orange-500/10 px-1.5 py-0.5 rounded-full">
              <Flame className="h-3 w-3" />{standing.streak}
            </span>
          )}
          {standing.bonusesApplied.length > 0 && (
            <span className="text-yellow-400 text-xs bg-yellow-500/10 px-1.5 py-0.5 rounded-full">
              ⭐ {standing.bonusesApplied[0].label}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-1">
          <span className="text-gray-400 text-xs">
            {config.metricLabel || config.metric}: <span className="text-white font-semibold">{standing.metricTotal}</span>
          </span>
          {standing.metricToday > 0 && (
            <span className="text-gray-500 text-xs">
              Today: <span className="text-emerald-400 font-semibold">+{standing.metricToday}</span>
            </span>
          )}
          {!isGolf && config.targetValue > 0 && (
            <div className="flex items-center gap-1.5 flex-1">
              <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden max-w-[120px]">
                <div
                  className={`h-full rounded-full bg-gradient-to-r ${isTop ? theme.leaderClass : theme.barClass}`}
                  style={{ width: `${Math.min(progress, 100)}%` }}
                />
              </div>
              <span className="text-gray-500 text-xs">{Math.min(progress, 100)}%</span>
            </div>
          )}
        </div>
      </div>

      {/* Score */}
      <div className="flex-shrink-0 flex flex-col items-end gap-1">
        {isGolf && golfDisplay ? (
          <div className={`text-2xl font-black px-3 py-1 rounded-xl ${golfDisplay.color} ${golfDisplay.bg}`}>
            {golfDisplay.label}
          </div>
        ) : (
          <div className={`text-2xl font-black ${isTop ? 'text-yellow-400' : theme.accentClass}`}>
            {standing.totalScore.toLocaleString()}
          </div>
        )}
        <div className="flex items-center gap-1">
          <MovementBadge movement={standing.movement} />
          {isGolf && standing.distanceFromLeader > 0 && (
            <span className="text-gray-600 text-xs">+{standing.distanceFromLeader} back</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Golf Groupings Panel ─────────────────────────────────────────────────────

function GolfGroupingsPanel({ standings, groupings }: { standings: ParticipantStanding[]; groupings: ScoreGrouping[] }) {
  const groups = groupings.map(g => ({
    ...g,
    players: standings.filter(s => s.groupId === g.id),
  })).filter(g => g.players.length > 0);

  if (groups.length === 0) return null;

  return (
    <div className="flex gap-3 px-8 py-3 border-b border-white/10 bg-gray-900/50">
      {groups.map(g => (
        <div key={g.id} className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold" style={{ backgroundColor: `${g.color}20`, borderColor: `${g.color}40`, border: '1px solid' }}>
          <span>{g.emoji || ''}</span>
          <span style={{ color: g.color }}>{g.label}</span>
          <span className="text-white/60">({g.players.length})</span>
        </div>
      ))}
    </div>
  );
}

// ─── Prizes Panel ─────────────────────────────────────────────────────────────

function PrizesPanel({ prizes, standings }: { prizes: Prize[]; standings: ParticipantStanding[] }) {
  if (!prizes || prizes.length === 0) return null;

  return (
    <div className="flex items-center gap-4 px-8 py-3 border-b border-white/10 bg-gray-900/50 overflow-x-auto">
      <span className="text-gray-400 text-sm font-semibold flex-shrink-0">🏆 Prizes:</span>
      {prizes.slice(0, 5).map(p => {
        const winner = standings.find(s => s.position === p.place);
        return (
          <div key={p.place} className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 flex-shrink-0">
            <span className="text-yellow-400 font-bold text-sm">#{p.place}</span>
            <span className="text-white text-sm">{p.label}</span>
            <span className="text-emerald-400 font-bold text-sm">{fmt$(p.amount)}</span>
            {winner && <span className="text-gray-400 text-xs">→ {winner.displayName}</span>}
          </div>
        );
      })}
    </div>
  );
}

// ─── No Active Competition placeholder ───────────────────────────────────────

function NoCompetition() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 text-center px-8">
      <div className="w-24 h-24 rounded-full bg-gray-800 flex items-center justify-center text-5xl">🏆</div>
      <div>
        <h2 className="text-4xl font-black text-white mb-2">No Active Competition</h2>
        <p className="text-gray-400 text-xl">Start a competition from the Admin dashboard to display it here.</p>
      </div>
    </div>
  );
}

// ─── Main Competition TV Page ─────────────────────────────────────────────────

export default function CompetitionTvPage() {
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [standings, setStandings] = useState<ParticipantStanding[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingStandings, setLoadingStandings] = useState(false);
  const [now, setNow] = useState(new Date());
  const [showControls, setShowControls] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number | null>(null);
  const posRef = useRef(0);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clock
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Load active competitions (public endpoint — no auth needed)
  const loadCompetitions = useCallback(async () => {
    try {
      // Try public standings first — fall back to listing active competitions
      const res = await fetch('/api/competitions?status=active&year=' + new Date().getFullYear(), {
        headers: { Authorization: 'Bearer public' }, // will fail auth, handled below
      });
      // The competitions list requires auth, so we use a different approach:
      // fetch the tv-config to get a pinned competitionId, or just show the first active one
      const tvRes = await fetch('/api/community/tv-config');
      const tvJson = await tvRes.json();
      if (tvJson.ok && tvJson.config?.pinnedCompetitionId) {
        setSelectedId(tvJson.config.pinnedCompetitionId);
      }
    } catch {}
  }, []);

  // Load standings for the selected competition (public=true)
  const loadStandings = useCallback(async (compId: string) => {
    setLoadingStandings(true);
    try {
      const res = await fetch(`/api/competitions/${compId}/standings?public=true`);
      const json = await res.json();
      if (json.ok) {
        setCompetitions([{ id: compId, config: json.competition.config }]);
        setStandings(json.standings || []);
        setLastRefresh(new Date());
      }
    } catch {}
    finally { setLoadingStandings(false); }
  }, []);

  // On mount: get pinned competition from tv-config, then load standings
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      try {
        const tvRes = await fetch('/api/community/tv-config');
        const tvJson = await tvRes.json();
        const pinned = tvJson.ok ? tvJson.config?.pinnedCompetitionId : null;
        if (pinned) {
          setSelectedId(pinned);
          await loadStandings(pinned);
        }
      } catch {}
      finally { setLoading(false); }
    };
    init();
  }, [loadStandings]);

  // Auto-refresh standings
  const competition = competitions[0] ?? null;
  const refreshSec = competition?.config?.autoRefreshSeconds ?? 30;

  useEffect(() => {
    if (!selectedId) return;
    const t = setInterval(() => loadStandings(selectedId), refreshSec * 1000);
    return () => clearInterval(t);
  }, [selectedId, refreshSec, loadStandings]);

  // Auto-scroll
  useEffect(() => {
    const container = containerRef.current;
    const inner = innerRef.current;
    if (!container || !inner || standings.length === 0) return;

    posRef.current = 0;
    container.scrollTop = 0;

    const SPEED = 25;
    let lastTime: number | null = null;
    let pauseUntil = 0;

    const step = (ts: number) => {
      if (!container || !inner) return;
      if (lastTime === null) lastTime = ts;
      const dt = (ts - lastTime) / 1000;
      lastTime = ts;

      const contentH = inner.scrollHeight / 2;
      const containerH = container.clientHeight;

      if (contentH <= containerH) {
        posRef.current = 0;
        container.scrollTop = 0;
        animRef.current = requestAnimationFrame(step);
        return;
      }

      if (ts < pauseUntil) {
        animRef.current = requestAnimationFrame(step);
        return;
      }

      posRef.current += SPEED * dt;
      if (posRef.current >= contentH) {
        posRef.current = 0;
        pauseUntil = ts + 3000;
      }

      container.scrollTop = posRef.current;
      animRef.current = requestAnimationFrame(step);
    };

    animRef.current = requestAnimationFrame(step);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [standings]);

  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = setTimeout(() => setShowControls(false), 3000);
  };

  const config = competition?.config;
  const theme = THEME_CONFIG[config?.theme ?? 'nascar'];
  const isGolf = config?.theme === 'golf';
  const leaderScore = standings[0]?.totalScore ?? 0;
  const showTopN = config?.showTopN ?? 20;
  const visibleStandings = standings.slice(0, showTopN);
  const doubled = [...visibleStandings, ...visibleStandings];

  if (loading) {
    return (
      <div className="w-screen h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-white text-3xl animate-pulse">Loading competition…</div>
      </div>
    );
  }

  if (!competition || !config) {
    return (
      <div className="w-screen h-screen bg-gray-950 text-white flex flex-col" onMouseMove={handleMouseMove}>
        <NoCompetition />
        <div className="absolute bottom-4 right-4 text-gray-600 text-sm">
          {now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    );
  }

  const days = daysLeft(config.endDate);

  return (
    <div
      className={`relative ${theme.bgClass} text-white`}
      style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}
      onMouseMove={handleMouseMove}
    >
      {/* ── Header ── */}
      <div className={`flex-shrink-0 flex items-center gap-4 px-8 py-5 border-b border-white/10 ${theme.headerBg}`}>
        <div className={`w-14 h-14 rounded-2xl ${theme.accentBg} flex items-center justify-center text-3xl`}>
          {theme.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-extrabold text-white tracking-tight truncate">{config.name}</h1>
            <span className={`px-2 py-0.5 rounded-full text-xs font-bold uppercase ${
              config.status === 'active' ? 'bg-emerald-500/20 text-emerald-400' :
              config.status === 'completed' ? 'bg-gray-500/20 text-gray-400' :
              'bg-yellow-500/20 text-yellow-400'
            }`}>{config.status}</span>
          </div>
          <div className="flex items-center gap-4 mt-1 text-gray-400 text-sm">
            <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{fmtDate(config.startDate)} – {fmtDate(config.endDate)}</span>
            {days > 0 && config.status === 'active' && (
              <span className="flex items-center gap-1 text-amber-400 font-semibold"><Flag className="h-3.5 w-3.5" />{days} day{days !== 1 ? 's' : ''} left</span>
            )}
            <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{standings.length} participants</span>
            {config.metricLabel && <span className="flex items-center gap-1"><Target className="h-3.5 w-3.5" />Metric: {config.metricLabel}</span>}
          </div>
        </div>

        {/* Top 3 quick summary */}
        <div className="flex items-center gap-3 flex-shrink-0">
          {standings.slice(0, 3).map((s, i) => (
            <div key={s.agentId} className={`text-center px-3 py-2 rounded-xl border ${
              i === 0 ? 'border-yellow-400/30 bg-yellow-500/10' :
              i === 1 ? 'border-slate-400/20 bg-white/5' :
              'border-amber-700/20 bg-white/5'
            }`}>
              <div className="text-xs text-gray-400 mb-0.5">{['🥇','🥈','🥉'][i]}</div>
              <div className="text-white text-sm font-bold truncate max-w-[80px]">{s.displayName.split(' ')[0]}</div>
              <div className={`text-sm font-black ${i === 0 ? 'text-yellow-400' : theme.accentClass}`}>
                {isGolf ? (s.totalScore === 0 ? 'E' : s.totalScore > 0 ? `+${s.totalScore}` : `${s.totalScore}`) : s.totalScore.toLocaleString()}
              </div>
            </div>
          ))}
        </div>

        {/* Clock */}
        <div className="text-right flex-shrink-0">
          <div className="text-xl font-mono font-bold text-white">
            {now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
          </div>
          <div className="text-gray-500 text-xs">
            {now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
          </div>
        </div>
      </div>

      {/* ── Golf groupings ── */}
      {isGolf && config.groupings && config.groupings.length > 0 && (
        <GolfGroupingsPanel standings={standings} groupings={config.groupings} />
      )}

      {/* ── Prizes ── */}
      {config.prizes && config.prizes.length > 0 && (
        <PrizesPanel prizes={config.prizes} standings={standings} />
      )}

      {/* ── Column headers ── */}
      <div className="flex items-center gap-4 px-8 py-2 border-b border-white/5 bg-gray-900/50">
        <div className="w-12 text-center text-gray-500 text-xs font-semibold uppercase">Rank</div>
        <div className="w-12 flex-shrink-0" />
        <div className="flex-1 text-gray-500 text-xs font-semibold uppercase">Agent</div>
        <div className="w-32 text-right text-gray-500 text-xs font-semibold uppercase">{theme.scoreLabel}</div>
      </div>

      {/* ── Scrolling standings ── */}
      <div
        ref={containerRef}
        className="overflow-hidden"
        style={{ height: 'calc(100vh - var(--header-height, 200px))', scrollBehavior: 'auto' }}
      >
        {loadingStandings ? (
          <div className="flex items-center justify-center h-full text-gray-400 text-2xl animate-pulse">
            <RefreshCw className="h-8 w-8 mr-3 animate-spin" /> Refreshing standings…
          </div>
        ) : standings.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <Trophy className="h-20 w-20 text-gray-700" />
            <p className="text-gray-500 text-3xl font-semibold">No standings yet</p>
            <p className="text-gray-600 text-lg">Scores will appear as participants log activity</p>
          </div>
        ) : (
          <div ref={innerRef} className="px-8 py-4">
            <div className="space-y-2">
              {doubled.map((standing, i) => (
                <ScoreboardRow
                  key={`${standing.agentId}-${i}`}
                  standing={standing}
                  index={i % visibleStandings.length}
                  total={visibleStandings.length}
                  theme={theme}
                  isGolf={isGolf}
                  leaderScore={leaderScore}
                  config={config}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Last refresh indicator ── */}
      {lastRefresh && (
        <div className="absolute bottom-3 left-8 text-gray-700 text-xs flex items-center gap-1">
          <RefreshCw className="h-3 w-3" />
          Last updated {lastRefresh.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          {' · '}Auto-refreshes every {refreshSec}s
        </div>
      )}

      {/* ── Controls overlay ── */}
      <div className={`absolute inset-0 z-40 pointer-events-none transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0'}`}>
        <button
          onClick={() => selectedId && loadStandings(selectedId)}
          className="absolute top-4 right-4 px-4 py-2 rounded-full bg-black/50 hover:bg-black/70 text-white text-sm font-semibold transition-colors pointer-events-auto flex items-center gap-2"
        >
          <RefreshCw className="h-4 w-4" /> Refresh Now
        </button>
      </div>
    </div>
  );
}
