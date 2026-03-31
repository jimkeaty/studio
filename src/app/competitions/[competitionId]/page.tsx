'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { CompetitionAudioEngine, CompetitionCommentator } from '@/lib/competitions/audio-engine';
import { CommentaryEngine } from '@/lib/competitions/commentary-engine';
import type {
  StandingsResponse,
  ParticipantStanding,
  CompetitionConfig,
  Competition,
  ScoreGrouping,
} from '@/lib/competitions/types';

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatScore(score: number, config: CompetitionConfig): string {
  if (config.scoringStrategy === 'threshold_map') {
    if (score === 0) return 'E';
    if (score > 0) return `+${score}`;
    return String(score);
  }
  return `${score.toLocaleString()} pts`;
}

function formatTodayLabel(standing: ParticipantStanding, config: CompetitionConfig): string {
  if (config.theme === 'golf') {
    const ds = standing.dailyScores;
    if (!ds || ds.length === 0) return '';
    const last = ds[ds.length - 1];
    return last.label || '';
  }
  if (standing.todayScore === 0) return '';
  return `+${standing.todayScore} today`;
}

function movementArrow(movement: number): { icon: string; color: string; label: string } {
  if (movement > 0) return { icon: '\u2191', color: 'text-emerald-400', label: `${movement}` };
  if (movement < 0) return { icon: '\u2193', color: 'text-red-400', label: `${Math.abs(movement)}` };
  return { icon: '\u2500', color: 'text-gray-500', label: '' };
}

function ordinalSuffix(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return 'th';
  switch (n % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
}

function daysBetween(start: string, end: string): number {
  const s = new Date(start + 'T00:00:00Z');
  const e = new Date(end + 'T00:00:00Z');
  return Math.max(1, Math.round((e.getTime() - s.getTime()) / 86400000) + 1);
}

function currentDayNumber(startDate: string): number {
  const start = new Date(startDate + 'T00:00:00Z');
  const now = new Date();
  const today = new Date(now.toISOString().slice(0, 10) + 'T00:00:00Z');
  return Math.max(1, Math.round((today.getTime() - start.getTime()) / 86400000) + 1);
}

function getThemeIcon(theme: string): string {
  if (theme === 'golf') return '\u26F3';
  if (theme === 'nascar') return '\uD83C\uDFC1';
  if (theme === 'horse_race') return '\uD83C\uDFC7';
  return '\uD83C\uDFC6';
}

// ── NASCAR Race Track SVG ────────────────────────────────────────────────────

function NascarTrack({ standings, showTopN }: { standings: ParticipantStanding[]; showTopN: number }) {
  const visibleStandings = standings.slice(0, Math.min(showTopN, 20));
  const maxScore = visibleStandings[0]?.totalScore || 1;

  return (
    <div className="relative w-full h-full flex items-center justify-center p-4">
      <svg viewBox="0 0 500 320" className="w-full h-full max-h-[500px]" preserveAspectRatio="xMidYMid meet">
        {/* Track outline */}
        <ellipse cx="250" cy="160" rx="220" ry="130" fill="none" stroke="#374151" strokeWidth="40" />
        <ellipse cx="250" cy="160" rx="220" ry="130" fill="none" stroke="#1f2937" strokeWidth="36" />
        {/* Track lane lines */}
        <ellipse cx="250" cy="160" rx="220" ry="130" fill="none" stroke="#374151" strokeWidth="1" strokeDasharray="8 8" />
        <ellipse cx="250" cy="160" rx="200" ry="110" fill="none" stroke="#374151" strokeWidth="1" strokeDasharray="8 8" />
        {/* Start/finish line */}
        <line x1="250" y1="30" x2="250" y2="48" stroke="#ffffff" strokeWidth="3" />
        <text x="250" y="22" textAnchor="middle" fill="#9ca3af" fontSize="8" fontFamily="monospace">FINISH</text>

        {/* Infield text */}
        <text x="250" y="150" textAnchor="middle" fill="#6b7280" fontSize="12" fontWeight="bold" fontFamily="sans-serif">
          {visibleStandings.length} RACERS
        </text>
        <text x="250" y="170" textAnchor="middle" fill="#4b5563" fontSize="9" fontFamily="sans-serif">
          SEASON IN PROGRESS
        </text>

        {/* Car positions */}
        {visibleStandings.map((s, i) => {
          const progress = maxScore > 0 ? s.totalScore / maxScore : 0;
          // Place cars around the track based on their score ratio
          const angle = -Math.PI / 2 + progress * 2 * Math.PI;
          const laneOffset = (i % 3) * 12 - 12;
          const rx = 210 + laneOffset;
          const ry = 120 + laneOffset;
          const cx = 250 + rx * Math.cos(angle);
          const cy = 160 + ry * Math.sin(angle);

          const colors = ['#facc15', '#94a3b8', '#f97316', '#3b82f6', '#22c55e', '#a855f7', '#ec4899', '#06b6d4', '#f43e5e', '#84cc16'];
          const carColor = i < colors.length ? colors[i] : s.color || '#6b7280';

          return (
            <g key={s.agentId}>
              {/* Car body */}
              <rect
                x={cx - 8}
                y={cy - 5}
                width="16"
                height="10"
                rx="3"
                fill={carColor}
                stroke={i === 0 ? '#facc15' : '#000'}
                strokeWidth={i === 0 ? 1.5 : 0.5}
                className="transition-all duration-1000"
              />
              {/* Position number on car */}
              <text x={cx} y={cy + 3} textAnchor="middle" fill="#000" fontSize="7" fontWeight="bold">
                {s.position}
              </text>
              {/* Name label */}
              {i < 5 && (
                <text
                  x={cx}
                  y={cy - 10}
                  textAnchor="middle"
                  fill="#d1d5db"
                  fontSize="7"
                  fontWeight="500"
                >
                  {s.displayName.split(' ')[0]}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ── Horse Race Track SVG ─────────────────────────────────────────────────────

function HorseRaceTrack({ standings, showTopN }: { standings: ParticipantStanding[]; showTopN: number }) {
  const visible = standings.slice(0, Math.min(showTopN, 16));
  const maxScore = visible[0]?.totalScore || 1;
  const laneH = 28;
  const topPad = 40;
  const svgH = topPad + visible.length * laneH + 20;
  const trackLeft = 20;
  const trackRight = 480;
  const trackW = trackRight - trackLeft;

  const horseColors = ['#facc15', '#94a3b8', '#f97316', '#3b82f6', '#22c55e', '#a855f7', '#ec4899', '#06b6d4', '#f43e5e', '#84cc16', '#f59e0b', '#8b5cf6', '#14b8a6', '#e11d48', '#0ea5e9', '#d946ef'];

  return (
    <div className="relative w-full h-full flex items-center justify-center p-4">
      <svg viewBox={`0 0 500 ${svgH}`} className="w-full h-full" preserveAspectRatio="xMidYMid meet">
        {/* Dirt track background */}
        <rect x={trackLeft} y={topPad - 5} width={trackW} height={visible.length * laneH + 10} rx="6" fill="#292524" stroke="#44403c" strokeWidth="1" />

        {/* Finish line */}
        <line x1={trackRight - 10} y1={topPad - 5} x2={trackRight - 10} y2={topPad + visible.length * laneH + 5} stroke="#fff" strokeWidth="2" strokeDasharray="4 4" />
        <text x={trackRight - 10} y={topPad - 12} textAnchor="middle" fill="#a8a29e" fontSize="8" fontFamily="monospace">FINISH</text>

        {/* Start line */}
        <line x1={trackLeft + 10} y1={topPad - 5} x2={trackLeft + 10} y2={topPad + visible.length * laneH + 5} stroke="#78716c" strokeWidth="1" strokeDasharray="4 4" />

        {/* Lane lines and horses */}
        {visible.map((s, i) => {
          const y = topPad + i * laneH;
          const progress = maxScore > 0 ? Math.min(s.totalScore / maxScore, 1) : 0;
          const horseX = trackLeft + 20 + progress * (trackW - 50);
          const color = i < horseColors.length ? horseColors[i] : s.color || '#78716c';

          return (
            <g key={s.agentId}>
              {/* Lane divider */}
              {i > 0 && <line x1={trackLeft} y1={y} x2={trackRight} y2={y} stroke="#44403c" strokeWidth="0.5" />}

              {/* Position number */}
              <text x={trackLeft + 5} y={y + laneH / 2 + 4} fill="#a8a29e" fontSize="8" fontWeight="bold">{s.position}</text>

              {/* Horse body */}
              <rect x={horseX - 10} y={y + 5} width="20" height={laneH - 10} rx="4" fill={color} stroke={i === 0 ? '#facc15' : '#000'} strokeWidth={i === 0 ? 1.5 : 0.5} className="transition-all duration-1000" />
              {/* Horse emoji */}
              <text x={horseX} y={y + laneH / 2 + 4} textAnchor="middle" fontSize="10">\uD83C\uDFC7</text>

              {/* Name */}
              <text x={horseX + 16} y={y + laneH / 2 + 3} fill="#d6d3d1" fontSize="7" fontWeight="500">
                {s.displayName.split(' ')[0]}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ── Loading Skeleton ─────────────────────────────────────────────────────────

function TVSkeleton() {
  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* Header skeleton */}
      <div className="px-8 py-6 border-b border-gray-800">
        <div className="h-10 w-96 bg-gray-800 rounded animate-pulse" />
        <div className="h-5 w-64 bg-gray-800/50 rounded mt-2 animate-pulse" />
      </div>
      {/* Body skeleton */}
      <div className="flex-1 flex p-6 gap-6">
        <div className="flex-[2] space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-16 bg-gray-800/40 rounded-lg animate-pulse" style={{ animationDelay: `${i * 80}ms` }} />
          ))}
        </div>
        <div className="flex-1 space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-40 bg-gray-800/30 rounded-lg animate-pulse" style={{ animationDelay: `${i * 120}ms` }} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Error Screen ─────────────────────────────────────────────────────────────

function TVError({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
      <div className="text-center max-w-md">
        <div className="text-6xl mb-6 opacity-50">{'\uD83C\uDFC6'}</div>
        <h1 className="text-3xl font-bold text-gray-300 mb-4">Competition Unavailable</h1>
        <p className="text-gray-500 text-lg">{message}</p>
        <p className="text-gray-700 text-sm mt-8">Powered by Smart Broker USA</p>
      </div>
    </div>
  );
}

// ── Main TV Page Component ───────────────────────────────────────────────────

export default function CompetitionTVPage() {
  const params = useParams();
  const competitionId = params.competitionId as string;

  // ── State ────────────────────────────────────────────────────────────────
  const [data, setData] = useState<StandingsResponse | null>(null);
  const [prevStandings, setPrevStandings] = useState<ParticipantStanding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showControls, setShowControls] = useState(false);
  const [muted, setMuted] = useState(true);
  const [revealMode, setRevealMode] = useState(false);
  const [revealedCount, setRevealedCount] = useState(0);
  const [changedAgents, setChangedAgents] = useState<Set<string>>(new Set());
  const [tickerOffset, setTickerOffset] = useState(0);
  const [commentary, setCommentary] = useState('');

  // ── Refs ──────────────────────────────────────────────────────────────────
  const audioRef = useRef<CompetitionAudioEngine | null>(null);
  const commentatorRef = useRef<CompetitionCommentator | null>(null);
  const commentaryEngineRef = useRef<CommentaryEngine | null>(null);
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);
  const tickerTimerRef = useRef<number | null>(null);

  // ── Derived ──────────────────────────────────────────────────────────────
  const config = data?.competition?.config;
  const standings = data?.standings ?? [];
  const summary = data?.summary;
  const theme = config?.theme ?? 'golf';
  const isGolf = theme === 'golf';
  const isNascar = theme === 'nascar';
  const isHorseRace = theme === 'horse_race';
  const isRaceTheme = isNascar || isHorseRace;

  // ── Data Fetching ────────────────────────────────────────────────────────

  const fetchStandings = useCallback(async () => {
    try {
      const res = await fetch(`/api/competitions/${competitionId}/standings?public=true`, {
        cache: 'no-store',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const json: StandingsResponse = await res.json();
      if (!json.ok) throw new Error('Failed to load standings');

      setData((prev) => {
        // Track which agents' scores changed
        if (prev?.standings) {
          const prevMap = new Map(prev.standings.map((s) => [s.agentId, s.totalScore]));
          const changed = new Set<string>();
          for (const s of json.standings) {
            const prevScore = prevMap.get(s.agentId);
            if (prevScore !== undefined && prevScore !== s.totalScore) {
              changed.add(s.agentId);
            }
          }
          if (changed.size > 0) {
            setChangedAgents(changed);
            setTimeout(() => setChangedAgents(new Set()), 3000);
          }
          setPrevStandings(prev.standings);
        }
        return json;
      });
      setError(null);
    } catch (err: any) {
      console.error('[CompetitionTV] Fetch error:', err);
      if (!data) setError(err.message || 'Failed to load competition');
    } finally {
      setLoading(false);
    }
  }, [competitionId, data]);

  // Initial fetch
  useEffect(() => {
    fetchStandings();
  }, [competitionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh timer
  useEffect(() => {
    if (!config) return;
    const interval = (config.autoRefreshSeconds || 60) * 1000;
    refreshTimerRef.current = setInterval(fetchStandings, interval);
    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    };
  }, [config, fetchStandings]);

  // Clock ticker
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // ── Audio & Commentary Setup ─────────────────────────────────────────────

  useEffect(() => {
    if (!config) return;
    const audio = new CompetitionAudioEngine(config.audioPack);
    audio.setMuted(muted);
    audioRef.current = audio;

    const commentator = new CompetitionCommentator();
    commentator.enabled = config.commentaryEnabled && !muted;
    commentatorRef.current = commentator;

    const ce = new CommentaryEngine(config.commentaryPack);
    commentaryEngineRef.current = ce;

    return () => {
      audio.destroy();
      commentator.cancel();
    };
  }, [config?.audioPack, config?.commentaryPack, config?.commentaryEnabled]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync mute state
  useEffect(() => {
    if (audioRef.current) audioRef.current.setMuted(muted);
    if (commentatorRef.current) commentatorRef.current.enabled = !muted;
  }, [muted]);

  // Generate commentary on data change
  useEffect(() => {
    if (!commentaryEngineRef.current || !config || standings.length === 0) return;
    const ce = commentaryEngineRef.current;
    const leader = standings[0];
    const trigger = isGolf ? 'leader_announce' : 'leader_announce';
    const line = ce.generate(trigger, {
      name: leader.displayName,
      score: formatScore(leader.totalScore, config),
      competitionName: config.name,
      count: standings.length,
    });
    if (line) {
      setCommentary(line);
      if (commentatorRef.current && !muted) {
        commentatorRef.current.say(line);
      }
    }
  }, [standings.length, standings[0]?.totalScore]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Ticker scroll animation ──────────────────────────────────────────────

  const tickerContent = useMemo(() => {
    if (!standings.length || !config) return [];
    const items: string[] = [];

    // Biggest movers
    const movers = [...standings]
      .filter((s) => s.movement !== 0)
      .sort((a, b) => b.movement - a.movement)
      .slice(0, 5);

    for (const m of movers) {
      const arrow = m.movement > 0 ? '\u2191' : '\u2193';
      items.push(`${arrow} ${m.displayName} (${m.movement > 0 ? '+' : ''}${m.movement})`);
    }

    // Recent events from top players
    for (const s of standings.slice(0, 5)) {
      for (const ev of s.events.slice(0, 2)) {
        items.push(`${ev.emoji} ${s.displayName}: ${ev.label} ${ev.detail ? '- ' + ev.detail : ''}`);
      }
    }

    return items;
  }, [standings, config]);

  useEffect(() => {
    if (tickerContent.length === 0) return;
    const animate = () => {
      setTickerOffset((prev) => prev - 1);
    };
    const id = window.setInterval(animate, 30);
    tickerTimerRef.current = id;
    return () => {
      if (tickerTimerRef.current) window.clearInterval(tickerTimerRef.current);
    };
  }, [tickerContent]);

  // ── Reveal Mode (Golf) ───────────────────────────────────────────────────

  const startReveal = useCallback(() => {
    if (!standings.length) return;
    setRevealMode(true);
    setRevealedCount(0);
    const total = standings.length;
    let count = 0;
    const interval = setInterval(() => {
      count++;
      setRevealedCount(count);
      if (audioRef.current) {
        audioRef.current.init();
        if (count === total) {
          audioRef.current.playVictory();
        } else {
          audioRef.current.playCountdownBeep();
        }
      }
      if (count >= total) {
        clearInterval(interval);
        setTimeout(() => setRevealMode(false), 5000);
      }
    }, 1500);
  }, [standings]);

  // ── Controls overlay toggle ──────────────────────────────────────────────

  const handleScreenClick = useCallback(() => {
    setShowControls((prev) => !prev);
  }, []);

  // ── Computed values ──────────────────────────────────────────────────────

  const topPerformer = standings[0];
  const mostImproved = useMemo(() => {
    if (standings.length === 0) return null;
    return [...standings].sort((a, b) => b.movement - a.movement)[0];
  }, [standings]);
  const hottestStreak = useMemo(() => {
    if (standings.length === 0) return null;
    return [...standings].sort((a, b) => b.streak - a.streak)[0];
  }, [standings]);
  const avgScore = summary?.avgScore ?? 0;

  const totalDays = config ? daysBetween(config.startDate, config.endDate) : 0;
  const currentDay = config ? currentDayNumber(config.startDate) : 0;

  // Group standings by groupId (golf)
  const groupedStandings = useMemo(() => {
    if (!isGolf || !config?.groupings) return null;
    const groups: Record<string, ParticipantStanding[]> = {};
    for (const g of config.groupings) {
      groups[g.id] = [];
    }
    for (const s of standings) {
      const gid = s.groupId || 'unknown';
      if (!groups[gid]) groups[gid] = [];
      groups[gid].push(s);
    }
    return groups;
  }, [standings, config?.groupings, isGolf]);

  // ── Render ───────────────────────────────────────────────────────────────

  if (loading) return <TVSkeleton />;
  if (error && !data) return <TVError message={error} />;
  if (!data || !config) return <TVError message="Competition not found" />;
  if (standings.length === 0) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-6">{getThemeIcon(theme)}</div>
          <h1 className="text-3xl font-bold text-gray-300 mb-2">{config.name}</h1>
          <p className="text-gray-500 text-xl">No standings available yet</p>
          <p className="text-gray-700 text-sm mt-8">Powered by Smart Broker USA</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-gray-950 text-white flex flex-col overflow-hidden select-none"
      onClick={handleScreenClick}
    >
      {/* ══════════════════════════════════════════════════════════════════════
          HEADER BAR
          ══════════════════════════════════════════════════════════════════════ */}
      <header className="flex-shrink-0 px-6 py-4 border-b border-gray-800/80 bg-gradient-to-r from-gray-950 via-gray-900 to-gray-950">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="text-4xl">{getThemeIcon(theme)}</span>
            <div>
              <h1 className="text-3xl lg:text-4xl font-black tracking-tight bg-gradient-to-r from-white via-gray-100 to-gray-300 bg-clip-text text-transparent">
                {config.name}
              </h1>
              <p className="text-gray-400 text-sm lg:text-base mt-0.5">
                {isGolf && <>Par: {config.targetValue} {config.metricLabel || config.metric} | </>}
                {isNascar && <>{standings.length} Racers | </>}
                {isHorseRace && <>{standings.length} Horses | </>}
                Day {Math.min(currentDay, totalDays)} of {totalDays}
                {config.targetType === 'season' && isRaceTheme && <> | Target: {config.targetValue} {config.metricLabel || config.metric}</>}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-5">
            {/* Status badge */}
            <span
              className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                config.status === 'active'
                  ? 'bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/40'
                  : config.status === 'completed'
                  ? 'bg-gray-600/20 text-gray-400 ring-1 ring-gray-600/40'
                  : 'bg-yellow-500/20 text-yellow-400 ring-1 ring-yellow-500/40'
              }`}
            >
              {config.status === 'active' ? '\u25CF Live' : config.status === 'completed' ? 'Final' : config.status}
            </span>

            {/* Clock */}
            <div className="text-right">
              <div className="text-2xl font-mono font-bold text-gray-200 tabular-nums">
                {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
              <div className="text-xs text-gray-500">
                {currentTime.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* ══════════════════════════════════════════════════════════════════════
          MAIN CONTENT AREA
          ══════════════════════════════════════════════════════════════════════ */}
      <div className="flex-1 flex min-h-0">
        {/* ── LEFT PANEL: Leaderboard ────────────────────────────────────── */}
        <div className={`${isGolf ? 'w-[65%]' : isRaceTheme ? 'w-[55%]' : 'w-full'} flex flex-col border-r border-gray-800/50`}>
          {/* Column headers */}
          <div className="flex-shrink-0 flex items-center px-6 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-800/40 bg-gray-900/30">
            <div className="w-12 text-center">Pos</div>
            <div className="w-12 text-center">Move</div>
            <div className="flex-1 pl-3">Player</div>
            {isGolf && <div className="w-20 text-center">Today</div>}
            <div className="w-24 text-right pr-4">Score</div>
          </div>

          {/* Scrollable leaderboard rows */}
          <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
            {standings.map((s, idx) => {
              const isRevealed = !revealMode || idx < revealedCount;
              const isChanged = changedAgents.has(s.agentId);
              const mv = movementArrow(s.movement);
              const isTop3 = idx < 3;
              const isLeader = idx === 0;
              const todayLabel = formatTodayLabel(s, config);

              if (!isRevealed) {
                return (
                  <div
                    key={s.agentId}
                    className="flex items-center px-6 py-3 border-b border-gray-800/30"
                  >
                    <div className="w-12 text-center text-xl font-bold text-gray-600">{s.position}</div>
                    <div className="flex-1 pl-6">
                      <div className="h-5 w-32 bg-gray-800/50 rounded animate-pulse" />
                    </div>
                    <div className="w-24 text-right pr-4">
                      <div className="h-7 w-16 bg-gray-800/50 rounded animate-pulse ml-auto" />
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={s.agentId}
                  className={`
                    flex items-center px-6 py-3 border-b border-gray-800/30
                    transition-all duration-700 ease-out
                    ${isLeader ? 'bg-gradient-to-r from-yellow-500/10 via-yellow-500/5 to-transparent' : ''}
                    ${isChanged ? 'bg-blue-500/10' : ''}
                    ${isTop3 && !isLeader ? 'bg-gray-800/20' : ''}
                    hover:bg-gray-800/30
                  `}
                >
                  {/* Position */}
                  <div className="w-12 text-center">
                    <span
                      className={`
                        text-xl font-black tabular-nums
                        ${isLeader ? 'text-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.4)]' : ''}
                        ${idx === 1 ? 'text-gray-300' : ''}
                        ${idx === 2 ? 'text-orange-400' : ''}
                        ${!isTop3 ? 'text-gray-500' : ''}
                      `}
                    >
                      {s.position}
                    </span>
                  </div>

                  {/* Movement arrow */}
                  <div className="w-12 text-center">
                    <span className={`text-sm font-bold ${mv.color}`}>
                      {mv.icon}{mv.label && <span className="text-xs ml-0.5">{mv.label}</span>}
                    </span>
                  </div>

                  {/* Player name */}
                  <div className="flex-1 pl-3 flex items-center gap-2.5 min-w-0">
                    {/* Avatar circle */}
                    <div
                      className={`
                        w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0
                        ${isLeader ? 'bg-yellow-500/20 text-yellow-400 ring-2 ring-yellow-500/40' : 'bg-gray-700/50 text-gray-300'}
                      `}
                    >
                      {s.displayName.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className={`font-bold truncate ${isTop3 ? 'text-lg' : 'text-base'} ${isLeader ? 'text-yellow-50' : 'text-gray-100'}`}>
                        {s.displayName}
                        {s.streak >= 3 && (
                          <span className="ml-1.5 text-orange-400" title={`${s.streak} day streak`}>
                            {'\uD83D\uDD25'}
                          </span>
                        )}
                      </div>
                      {s.teamName && (
                        <div className="text-xs text-gray-500 truncate">{s.teamName}</div>
                      )}
                    </div>
                  </div>

                  {/* Today's label (golf) */}
                  {isGolf && (
                    <div className="w-20 text-center">
                      {todayLabel && (
                        <span
                          className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                            s.todayScore < 0
                              ? 'bg-emerald-500/15 text-emerald-400'
                              : s.todayScore > 0
                              ? 'bg-red-500/15 text-red-400'
                              : 'bg-gray-700/30 text-gray-400'
                          }`}
                        >
                          {todayLabel}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Total score */}
                  <div className="w-24 text-right pr-4">
                    <span
                      className={`
                        font-black tabular-nums transition-all duration-500
                        ${isTop3 ? 'text-2xl' : 'text-xl'}
                        ${isLeader ? 'text-yellow-400' : ''}
                        ${!isLeader && isGolf && s.totalScore < 0 ? 'text-emerald-400' : ''}
                        ${!isLeader && isGolf && s.totalScore > 0 ? 'text-red-400' : ''}
                        ${!isLeader && isGolf && s.totalScore === 0 ? 'text-gray-300' : ''}
                        ${!isLeader && isRaceTheme ? 'text-gray-100' : ''}
                        ${isChanged ? 'scale-110' : ''}
                      `}
                    >
                      {formatScore(s.totalScore, config)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── RIGHT PANEL ────────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col bg-gray-900/20 min-h-0">
          {/* Golf: Group panel */}
          {isGolf && config.groupings && groupedStandings && (
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {config.groupings.map((group: ScoreGrouping) => {
                const members = groupedStandings[group.id] || [];
                const groupColor = group.id === 'under_par' ? 'emerald' : group.id === 'even' ? 'gray' : 'red';
                const borderColor = group.id === 'under_par' ? 'border-emerald-500/30' : group.id === 'even' ? 'border-gray-600/30' : 'border-red-500/30';
                const headerBg = group.id === 'under_par' ? 'bg-emerald-500/10' : group.id === 'even' ? 'bg-gray-600/10' : 'bg-red-500/10';
                const headerText = group.id === 'under_par' ? 'text-emerald-400' : group.id === 'even' ? 'text-gray-400' : 'text-red-400';
                const dotColor = group.id === 'under_par' ? 'bg-emerald-500' : group.id === 'even' ? 'bg-gray-500' : 'bg-red-500';

                return (
                  <div key={group.id} className={`rounded-xl border ${borderColor} overflow-hidden`}>
                    {/* Group header */}
                    <div className={`${headerBg} px-4 py-2.5 flex items-center justify-between`}>
                      <div className="flex items-center gap-2">
                        <div className={`w-2.5 h-2.5 rounded-full ${dotColor}`} />
                        <span className={`font-bold text-sm uppercase tracking-wider ${headerText}`}>
                          {group.label}
                        </span>
                      </div>
                      <span className={`text-xs font-semibold ${headerText} opacity-70`}>
                        {members.length} player{members.length !== 1 ? 's' : ''}
                      </span>
                    </div>

                    {/* Group members */}
                    <div className="divide-y divide-gray-800/30">
                      {members.length === 0 ? (
                        <div className="px-4 py-3 text-gray-600 text-sm italic">No players</div>
                      ) : (
                        members.map((m) => (
                          <div
                            key={m.agentId}
                            className="flex items-center justify-between px-4 py-2.5 hover:bg-white/[0.02] transition-colors"
                          >
                            <div className="flex items-center gap-2.5">
                              <span className="text-gray-500 text-sm font-mono w-6">{m.position}.</span>
                              <span className="text-gray-200 font-medium text-sm">{m.displayName}</span>
                              {m.streak >= 3 && <span className="text-xs">{'\uD83D\uDD25'}</span>}
                            </div>
                            <span
                              className={`font-bold text-sm tabular-nums ${
                                m.totalScore < 0
                                  ? 'text-emerald-400'
                                  : m.totalScore > 0
                                  ? 'text-red-400'
                                  : 'text-gray-400'
                              }`}
                            >
                              {formatScore(m.totalScore, config)}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Horse Race: Track + standings */}
          {isHorseRace && (
            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex-1 min-h-0">
                <HorseRaceTrack standings={standings} showTopN={config.showTopN || 16} />
              </div>
              <div className="flex-shrink-0 border-t border-gray-800/40 p-4 max-h-[300px] overflow-y-auto">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3 px-1">Standings</h3>
                <div className="space-y-1.5">
                  {standings.slice(0, config.showTopN || 16).map((s, idx) => (
                    <div key={s.agentId} className="flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-white/[0.02] transition-colors">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-bold w-6 tabular-nums ${idx === 0 ? 'text-yellow-400' : 'text-gray-500'}`}>{s.position}.</span>
                        <span className={`text-sm font-medium ${idx === 0 ? 'text-yellow-50' : 'text-gray-300'}`}>{s.displayName}</span>
                        {s.streak >= 3 && <span className="text-xs">\uD83D\uDD25</span>}
                      </div>
                      <span className={`text-sm font-bold tabular-nums ${idx === 0 ? 'text-yellow-400' : 'text-gray-200'}`}>{formatScore(s.totalScore, config)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* NASCAR: Race track + standings */}
          {isNascar && (
            <div className="flex-1 flex flex-col min-h-0">
              {/* Track visualization */}
              <div className="flex-1 min-h-0">
                <NascarTrack standings={standings} showTopN={config.showTopN || 20} />
              </div>

              {/* Quick standings list */}
              <div className="flex-shrink-0 border-t border-gray-800/40 p-4 max-h-[300px] overflow-y-auto">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3 px-1">Standings</h3>
                <div className="space-y-1.5">
                  {standings.slice(0, config.showTopN || 20).map((s, idx) => (
                    <div
                      key={s.agentId}
                      className="flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-white/[0.02] transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-bold w-6 tabular-nums ${idx === 0 ? 'text-yellow-400' : 'text-gray-500'}`}>
                          {s.position}.
                        </span>
                        <span className={`text-sm font-medium ${idx === 0 ? 'text-yellow-50' : 'text-gray-300'}`}>
                          {s.displayName}
                        </span>
                        {s.streak >= 3 && <span className="text-xs">{'\uD83D\uDD25'}</span>}
                      </div>
                      <span className={`text-sm font-bold tabular-nums ${idx === 0 ? 'text-yellow-400' : 'text-gray-200'}`}>
                        {formatScore(s.totalScore, config)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          STATS STRIP
          ══════════════════════════════════════════════════════════════════════ */}
      <div className="flex-shrink-0 border-t border-gray-800/60 bg-gray-900/40 px-6 py-2.5 flex items-center justify-around text-sm">
        {topPerformer && (
          <div className="flex items-center gap-2">
            <span className="text-gray-500 font-medium">Top Performer:</span>
            <span className="text-yellow-400 font-bold">{topPerformer.displayName}</span>
            <span className="text-gray-400">({formatScore(topPerformer.totalScore, config)})</span>
          </div>
        )}
        {mostImproved && mostImproved.movement > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-gray-500 font-medium">Most Improved:</span>
            <span className="text-emerald-400 font-bold">{mostImproved.displayName}</span>
            <span className="text-gray-400">({'\u2191'}{mostImproved.movement})</span>
          </div>
        )}
        {hottestStreak && hottestStreak.streak >= 2 && (
          <div className="flex items-center gap-2">
            <span className="text-gray-500 font-medium">Hottest Streak:</span>
            <span className="text-orange-400 font-bold">{hottestStreak.displayName}</span>
            <span className="text-gray-400">({hottestStreak.streak} days {'\uD83D\uDD25'})</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <span className="text-gray-500 font-medium">Avg Score:</span>
          <span className="text-gray-300 font-bold">
            {isGolf
              ? avgScore === 0
                ? 'E'
                : avgScore > 0
                ? `+${avgScore.toFixed(1)}`
                : avgScore.toFixed(1)
              : `${avgScore.toLocaleString()} pts`}
          </span>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          BOTTOM TICKER
          ══════════════════════════════════════════════════════════════════════ */}
      <div className="flex-shrink-0 border-t border-gray-800/60 bg-gray-900/60 overflow-hidden h-12 flex items-center relative">
        {/* Commentary line */}
        {commentary && (
          <div className="absolute left-0 top-0 h-full flex items-center pl-6 z-10 bg-gradient-to-r from-gray-900/90 via-gray-900/90 to-transparent pr-8">
            <span className="text-gray-400 mr-2">{'\uD83C\uDF99\uFE0F'}</span>
            <span className="text-gray-300 text-sm italic truncate max-w-[400px]">
              &ldquo;{commentary}&rdquo;
            </span>
          </div>
        )}

        {/* Scrolling ticker */}
        <div className="absolute inset-0 flex items-center overflow-hidden">
          <div
            className="flex items-center gap-10 whitespace-nowrap will-change-transform"
            style={{ transform: `translateX(${tickerOffset % (tickerContent.length * 400 + 1200)}px)` }}
          >
            {/* Spacer for commentary area */}
            <div className="w-[500px] flex-shrink-0" />
            {/* Double the content for seamless loop */}
            {[...tickerContent, ...tickerContent].map((item, i) => (
              <span key={i} className="text-gray-400 text-sm font-medium">
                {item}
              </span>
            ))}
          </div>
        </div>

        {/* Branding */}
        <div className="absolute right-4 top-0 h-full flex items-center z-10 bg-gradient-to-l from-gray-900/90 to-transparent pl-8">
          <span className="text-gray-700 text-xs font-medium tracking-wide">
            Powered by <span className="text-gray-600">Smart Broker USA</span>
          </span>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          CONTROLS OVERLAY (Huddle Mode)
          ══════════════════════════════════════════════════════════════════════ */}
      {showControls && (
        <div
          className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-8 shadow-2xl max-w-md w-full mx-4">
            <h2 className="text-xl font-bold text-gray-100 mb-6 text-center">Huddle Controls</h2>
            <div className="grid grid-cols-2 gap-3">
              {/* Start Round Reveal (Golf only) */}
              {isGolf && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowControls(false);
                    startReveal();
                  }}
                  className="col-span-2 px-4 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  <span>{'\u26F3'}</span> Start Round Reveal
                </button>
              )}

              {/* Mute toggle */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setMuted((m) => !m);
                }}
                className={`px-4 py-3 font-bold rounded-xl transition-colors flex items-center justify-center gap-2 ${
                  muted
                    ? 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                    : 'bg-blue-600 hover:bg-blue-500 text-white'
                }`}
              >
                {muted ? '\uD83D\uDD07' : '\uD83D\uDD0A'} {muted ? 'Unmute' : 'Mute'}
              </button>

              {/* Refresh Now */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  fetchStandings();
                  setShowControls(false);
                }}
                className="px-4 py-3 bg-gray-700 hover:bg-gray-600 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                {'\uD83D\uDD04'} Refresh
              </button>

              {/* Close controls */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowControls(false);
                }}
                className="col-span-2 px-4 py-3 bg-gray-800 hover:bg-gray-700 text-gray-400 font-medium rounded-xl transition-colors"
              >
                Close
              </button>
            </div>

            <p className="text-xs text-gray-600 text-center mt-4">
              Click anywhere on the screen to toggle controls
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
