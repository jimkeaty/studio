'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertCircle,
  Trophy,
  Flag,
  Play,
  Volume2,
  VolumeX,
  RotateCcw,
  Eye,
  Users,
  Calendar,
  BarChart3,
  ArrowUp,
  ArrowDown,
  Minus,
  ChevronDown,
  ChevronUp,
  ExternalLink,
} from 'lucide-react';
import { useUser } from '@/firebase';
import { CompetitionAudioEngine, CompetitionCommentator } from '@/lib/competitions/audio-engine';
import { CommentaryEngine } from '@/lib/competitions/commentary-engine';
import type {
  Competition,
  CompetitionConfig,
  ParticipantStanding,
  StandingsResponse,
  DailyScore,
  ScoreGrouping,
} from '@/lib/competitions/types';
import Link from 'next/link';

const ADMIN_UID = '1kJsXTU1JjZXMidmoIPXgXxizll1';

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmtCurrency = (n: number) => (n >= 1000 ? `$${(n / 1000).toFixed(0)}k` : `$${n.toFixed(0)}`);
const fmtNum = (n: number) => n.toLocaleString();
const POSITION_LABELS = ['🥇', '🥈', '🥉'];

function fmtGolfScore(score: number): string {
  if (score === 0) return 'E';
  if (score > 0) return `+${score}`;
  return String(score);
}

function fmtDate(d: string): string {
  const date = new Date(d + 'T00:00:00');
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

type AnimPhase = 'idle' | 'countdown' | 'racing' | 'finished';

// ══════════════════════════════════════════════════════════════════════════════
//  COMMENTARY TICKER — Shared between themes
// ══════════════════════════════════════════════════════════════════════════════

function CommentaryTicker({ text }: { text: string }) {
  if (!text) return null;
  return (
    <div className="bg-black/80 text-white text-sm font-medium px-4 py-2 rounded-lg flex items-center gap-2">
      <span className="text-yellow-400 shrink-0">🎙️</span>
      <span className="truncate">{text}</span>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  SHARED CONTROL BAR
// ══════════════════════════════════════════════════════════════════════════════

function SharedControlBar({
  config,
  phase,
  participantCount,
  muted,
  onStart,
  onReset,
  onToggleMute,
  competitionId,
}: {
  config: CompetitionConfig;
  phase: AnimPhase;
  participantCount: number;
  muted: boolean;
  onStart: () => void;
  onReset: () => void;
  onToggleMute: () => void;
  competitionId: string;
}) {
  const phaseLabels: Record<AnimPhase, string> = {
    idle: 'Ready',
    countdown: 'Countdown',
    racing: 'In Progress',
    finished: 'Finished',
  };
  const phaseColors: Record<AnimPhase, string> = {
    idle: 'bg-blue-500',
    countdown: 'bg-yellow-500',
    racing: 'bg-green-500',
    finished: 'bg-purple-500',
  };

  const startLabel = config.theme === 'golf' ? 'Start Round' : 'Start Race';
  const resetLabel = config.theme === 'golf' ? 'Reset Round' : 'Reset Race';

  return (
    <Card className="bg-gradient-to-r from-gray-900 to-gray-800 text-white border-0">
      <CardContent className="p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {phase === 'idle' || phase === 'finished' ? (
            <Button
              onClick={onStart}
              size="lg"
              className="bg-green-600 hover:bg-green-700 text-white font-bold text-lg px-8 gap-2"
            >
              <Play className="h-5 w-5" />
              {startLabel}
            </Button>
          ) : (
            <Button
              onClick={onReset}
              variant="secondary"
              size="lg"
              className="gap-2"
              disabled={phase === 'countdown'}
            >
              <RotateCcw className="h-5 w-5" />
              {resetLabel}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/10"
            onClick={onToggleMute}
          >
            {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
          </Button>
        </div>

        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className={`w-2.5 h-2.5 rounded-full ${phaseColors[phase]} ${phase === 'racing' ? 'animate-pulse' : ''}`} />
            <span className="font-medium">{phaseLabels[phase]}</span>
          </div>
          <div className="flex items-center gap-1.5 text-gray-300">
            <Users className="h-4 w-4" />
            <span>{participantCount} participants</span>
          </div>
          <Link
            href={`/competitions/${competitionId}`}
            target="_blank"
            className="flex items-center gap-1.5 text-gray-300 hover:text-white transition-colors"
          >
            <ExternalLink className="h-4 w-4" />
            <span>TV Mode</span>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  NASCAR THEME — Animated Race Track
// ══════════════════════════════════════════════════════════════════════════════

function getTrackPoint(progress: number, cx: number, cy: number, rx: number, ry: number) {
  const angle = (progress / 100) * Math.PI * 2 - Math.PI / 2;
  return {
    x: cx + rx * Math.cos(angle),
    y: cy + ry * Math.sin(angle),
    angle: angle * (180 / Math.PI) + 90,
  };
}

function NascarTrack({
  standings,
  selectedId,
  onSelect,
  phase,
  carPositions,
  countdownNum,
  commentary,
  competitionName,
}: {
  standings: ParticipantStanding[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  phase: AnimPhase;
  carPositions: Map<string, number>;
  countdownNum: number | null;
  commentary: string;
  competitionName: string;
}) {
  const width = 900;
  const height = 520;
  const cx = width / 2;
  const cy = height / 2 + 10;
  const rx = 380;
  const ry = 190;
  const trackWidth = 60;
  const showCheckered = phase === 'finished';

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto" style={{ maxHeight: '520px' }}>
        {/* Grass */}
        <rect x="0" y="0" width={width} height={height} fill="#2d5a27" rx="20" />

        {/* Grandstands */}
        <rect x="20" y="10" width={width - 40} height={35} rx="5" fill="#8B4513" opacity="0.7" />
        {Array.from({ length: 30 }, (_, i) => (
          <circle
            key={`fan-${i}`}
            cx={40 + i * 28}
            cy={28}
            r={5}
            fill={['#e11d48', '#2563eb', '#16a34a', '#d97706', '#7c3aed', '#fff'][i % 6]}
            opacity={phase === 'racing' || phase === 'finished' ? 0.9 : 0.4}
          >
            {(phase === 'racing' || phase === 'finished') && (
              <animate
                attributeName="cy"
                values={`${28};${23};${28}`}
                dur={`${0.3 + (i % 5) * 0.1}s`}
                repeatCount="indefinite"
              />
            )}
          </circle>
        ))}

        {/* Track */}
        <ellipse cx={cx} cy={cy} rx={rx + trackWidth / 2} ry={ry + trackWidth / 2} fill="#555" stroke="#fff" strokeWidth="3" />
        <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="#444" />
        <ellipse cx={cx} cy={cy} rx={rx - trackWidth / 2} ry={ry - trackWidth / 2} fill="#2d5a27" stroke="#fff" strokeWidth="3" />
        <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="none" stroke="#ffeb3b" strokeWidth="2" strokeDasharray="12 8" opacity="0.6" />

        {/* Start/finish */}
        <line x1={cx} y1={cy - ry - trackWidth / 2 - 2} x2={cx} y2={cy - ry + trackWidth / 2 + 2} stroke="#fff" strokeWidth="4" />
        {Array.from({ length: 8 }, (_, i) => (
          <rect
            key={`check-${i}`}
            x={cx - 12 + (i % 2) * 6}
            y={cy - ry - trackWidth / 2 + Math.floor(i / 2) * 8}
            width="6"
            height="8"
            fill={i % 2 === Math.floor(i / 2) % 2 ? '#000' : '#fff'}
            opacity="0.8"
          />
        ))}

        {/* Infield */}
        <text x={cx} y={cy - 30} textAnchor="middle" fill="#fff" fontSize="28" fontWeight="bold" opacity="0.9">
          🏆
        </text>
        <text x={cx} y={cy + 5} textAnchor="middle" fill="#ffeb3b" fontSize="22" fontWeight="bold" fontFamily="Arial">
          {competitionName}
        </text>
        <text x={cx} y={cy + 28} textAnchor="middle" fill="#fff" fontSize="13" opacity="0.7">
          {standings.length} Racers
        </text>

        {/* Countdown overlay */}
        {phase === 'countdown' && countdownNum !== null && (
          <g>
            <circle cx={cx} cy={cy} r={60} fill="rgba(0,0,0,0.7)" />
            <text
              x={cx}
              y={cy + 20}
              textAnchor="middle"
              fill={countdownNum === 0 ? '#22c55e' : '#ffeb3b'}
              fontSize="60"
              fontWeight="bold"
              fontFamily="Arial"
            >
              {countdownNum === 0 ? 'GO!' : countdownNum}
            </text>
          </g>
        )}

        {/* Checkered flag wave */}
        {showCheckered && (
          <g>
            <text x={cx} y={cy - ry - trackWidth / 2 - 20} textAnchor="middle" fill="#fff" fontSize="36">
              🏁
              <animate attributeName="font-size" values="36;44;36" dur="0.5s" repeatCount="indefinite" />
            </text>
          </g>
        )}

        {/* Cars */}
        {standings
          .slice()
          .reverse()
          .map((racer) => {
            const isSelected = racer.agentId === selectedId;
            const pos = carPositions.get(racer.agentId) ?? 0;
            const pt = getTrackPoint(pos, cx, cy, rx, ry);
            const carW = 28;
            const carH = 16;

            return (
              <g
                key={racer.agentId}
                onClick={() => onSelect(racer.agentId)}
                style={{ cursor: 'pointer' }}
                opacity={selectedId && !isSelected ? 0.5 : 1}
              >
                {isSelected && (
                  <circle cx={pt.x} cy={pt.y} r={22} fill={racer.color} opacity={0.3}>
                    <animate attributeName="r" values="22;28;22" dur="1.5s" repeatCount="indefinite" />
                  </circle>
                )}

                {/* Exhaust particles during race */}
                {phase === 'racing' && (
                  <circle cx={pt.x - 8} cy={pt.y + 3} r={2} fill="#aaa" opacity="0.4">
                    <animate attributeName="r" values="2;5;0" dur="0.5s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.4;0.1;0" dur="0.5s" repeatCount="indefinite" />
                  </circle>
                )}

                <g transform={`translate(${pt.x}, ${pt.y}) rotate(${pt.angle})`}>
                  <rect
                    x={-carW / 2}
                    y={-carH / 2}
                    width={carW}
                    height={carH}
                    rx={4}
                    fill={racer.color}
                    stroke={isSelected ? '#fff' : '#000'}
                    strokeWidth={isSelected ? 2.5 : 1}
                  />
                  <rect x={-carW / 2 + 5} y={-carH / 2 + 2} width={8} height={carH - 4} rx={2} fill="#111" opacity="0.6" />
                  <text x={4} y={carH / 2 - 3} textAnchor="middle" fill="#fff" fontSize="8" fontWeight="bold" fontFamily="Arial">
                    {racer.avatarNumber}
                  </text>
                </g>

                {racer.position <= 5 && phase !== 'countdown' && (
                  <text
                    x={pt.x}
                    y={pt.y - 16}
                    textAnchor="middle"
                    fill="#fff"
                    fontSize="11"
                    fontWeight="bold"
                    stroke="#000"
                    strokeWidth="0.5"
                    paintOrder="stroke"
                  >
                    {racer.position <= 3 ? POSITION_LABELS[racer.position - 1] : `P${racer.position}`}
                  </text>
                )}
              </g>
            );
          })}
      </svg>

      {/* Commentary ticker */}
      {commentary && (
        <div className="absolute bottom-2 left-2 right-2">
          <CommentaryTicker text={commentary} />
        </div>
      )}
    </div>
  );
}

// ── NASCAR Leaderboard Table ──────────────────────────────────────────────
function NascarLeaderboard({
  standings,
  prizes,
  selectedId,
  onSelect,
  phase,
}: {
  standings: ParticipantStanding[];
  prizes: any[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  phase: AnimPhase;
}) {
  return (
    <div className="space-y-1.5 max-h-[600px] overflow-y-auto">
      {standings.map((r) => {
        const prize = prizes?.find((p: any) => p.place === r.position);
        const isSelected = r.agentId === selectedId;
        const posColor =
          r.position === 1
            ? 'bg-yellow-400 text-yellow-900'
            : r.position === 2
              ? 'bg-gray-300 text-gray-800'
              : r.position === 3
                ? 'bg-amber-600 text-white'
                : 'bg-gray-100 text-gray-600';

        return (
          <div
            key={r.agentId}
            onClick={() => onSelect(r.agentId)}
            className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-all hover:shadow-md ${
              isSelected ? 'ring-2 ring-blue-500 bg-blue-50/50 border-blue-300' : 'hover:bg-muted/50'
            } ${phase === 'finished' && r.position === 1 ? 'animate-pulse ring-2 ring-yellow-400' : ''}`}
          >
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${posColor}`}>
              {r.position}
            </div>
            <div className="w-3 h-8 rounded-sm shrink-0" style={{ backgroundColor: r.color }} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold truncate">{r.displayName}</span>
                {prize && phase === 'finished' && (
                  <Badge variant="outline" className="text-[9px] h-4 bg-yellow-50 text-yellow-700 border-yellow-300">
                    💰 {fmtCurrency(prize.amount)}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                <span>{r.teamName || 'Independent'}</span>
                <span>·</span>
                <span>#{r.avatarNumber}</span>
                {r.streak >= 2 && (
                  <>
                    <span>·</span>
                    <span className="text-orange-600 font-medium">🔥 {r.streak}mo</span>
                  </>
                )}
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="text-lg font-bold">{fmtNum(r.totalScore)}</p>
              <p className="text-[10px] text-muted-foreground">
                {r.distanceFromLeader > 0 ? `-${fmtNum(r.distanceFromLeader)}` : 'LEADER'}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── NASCAR Racer Detail Panel ──────────────────────────────────────────────
function NascarRacerDetail({ racer }: { racer: ParticipantStanding }) {
  return (
    <Card className="border-2" style={{ borderColor: racer.color }}>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-lg"
            style={{ backgroundColor: racer.color }}
          >
            {racer.avatarNumber}
          </div>
          <div className="flex-1">
            <CardTitle className="text-lg">{racer.displayName}</CardTitle>
            <CardDescription>
              {racer.teamName || 'Independent'} · Position {racer.position}
            </CardDescription>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold">{fmtNum(racer.totalScore)} pts</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            { label: 'Score', value: racer.scoreLabel, icon: '📊' },
            { label: 'Streak', value: `${racer.streak}mo`, icon: '🔥' },
            { label: 'Metric Total', value: fmtNum(racer.metricTotal), icon: '📈' },
          ].map((s) => (
            <div key={s.label} className="border rounded-lg p-2">
              <p className="text-xs text-muted-foreground">
                {s.icon} {s.label}
              </p>
              <p className="text-sm font-bold">{s.value}</p>
            </div>
          ))}
        </div>
        {racer.events.length > 0 && (
          <div>
            <p className="text-xs font-semibold mb-2">Race Events</p>
            <div className="flex flex-wrap gap-1">
              {racer.events.slice(0, 8).map((e, i) => {
                const eventColors: Record<string, string> = {
                  flat_tire: 'bg-red-100 text-red-800 border-red-300',
                  turbo_boost: 'bg-purple-100 text-purple-800 border-purple-300',
                  green_flag: 'bg-green-100 text-green-800 border-green-300',
                  checkered_flag: 'bg-yellow-100 text-yellow-800 border-yellow-300',
                  pit_stop: 'bg-gray-100 text-gray-600 border-gray-300',
                };
                return (
                  <span
                    key={i}
                    className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border ${
                      eventColors[e.type] || 'bg-gray-100 text-gray-600 border-gray-300'
                    }`}
                  >
                    {e.emoji} {e.label}
                    {e.score !== 0 && (
                      <span className={e.score > 0 ? 'text-green-700' : 'text-red-700'}>
                        {e.score > 0 ? '+' : ''}
                        {e.score}
                      </span>
                    )}
                  </span>
                );
              })}
            </div>
          </div>
        )}
        <div className="flex justify-end">
          <Link href={`/dashboard?viewAs=${racer.agentId}&viewAsName=${encodeURIComponent(racer.displayName)}`}>
            <Button variant="outline" size="sm" className="text-xs">
              <Eye className="h-3 w-3 mr-1" />
              View Dashboard
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  GOLF THEME — Clubhouse Leaderboard
// ══════════════════════════════════════════════════════════════════════════════

function MovementArrow({ movement }: { movement: number }) {
  if (movement > 0) {
    return (
      <span className="inline-flex items-center text-green-600 text-xs font-bold">
        <ArrowUp className="h-3 w-3" />
        {movement}
      </span>
    );
  }
  if (movement < 0) {
    return (
      <span className="inline-flex items-center text-red-600 text-xs font-bold">
        <ArrowDown className="h-3 w-3" />
        {Math.abs(movement)}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center text-gray-400 text-xs">
      <Minus className="h-3 w-3" />
    </span>
  );
}

function GolfTodayLabel({ score, label }: { score: number; label: string }) {
  const emojis: Record<string, string> = {
    eagle: '🦅',
    birdie: '🐦',
    par: '⛳',
    bogey: '😐',
    'double bogey': '😰',
  };
  const colors: Record<string, string> = {
    eagle: 'text-green-700 bg-green-50 border-green-200',
    birdie: 'text-green-600 bg-green-50/50 border-green-100',
    par: 'text-gray-600 bg-gray-50 border-gray-200',
    bogey: 'text-orange-600 bg-orange-50 border-orange-200',
    'double bogey': 'text-red-600 bg-red-50 border-red-200',
  };
  const key = label.toLowerCase();
  const emoji = emojis[key] || '';
  const color = colors[key] || 'text-gray-600 bg-gray-50 border-gray-200';

  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded border font-medium ${color}`}>
      {emoji} {label}
    </span>
  );
}

function GolfGroupBadge({ groupId, groupings }: { groupId?: string; groupings?: ScoreGrouping[] }) {
  if (!groupId || !groupings) return null;
  const group = groupings.find((g) => g.id === groupId);
  if (!group) return null;
  const styles: Record<string, string> = {
    under_par: 'bg-green-600 text-white',
    even: 'bg-gray-500 text-white',
    over_par: 'bg-red-600 text-white',
  };
  return (
    <Badge className={`text-[10px] ${styles[groupId] || 'bg-gray-500 text-white'}`}>
      {group.emoji || ''} {group.label}
    </Badge>
  );
}

// ── Golf Leaderboard (Clubhouse Style) ────────────────────────────────────
function GolfLeaderboard({
  standings,
  config,
  selectedId,
  onSelect,
  phase,
  revealedCount,
}: {
  standings: ParticipantStanding[];
  config: CompetitionConfig;
  selectedId: string | null;
  onSelect: (id: string) => void;
  phase: AnimPhase;
  revealedCount: number;
}) {
  const visibleStandings = phase === 'racing' ? standings.slice(0, revealedCount) : standings;

  return (
    <div className="rounded-xl overflow-hidden border border-green-800/30">
      {/* Clubhouse header */}
      <div className="bg-gradient-to-r from-green-900 via-green-800 to-green-900 px-4 py-3 border-b border-green-700/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">🏌️</span>
            <span className="text-white font-bold text-sm tracking-wider uppercase">Leaderboard</span>
          </div>
          <div className="flex items-center gap-3 text-green-200 text-xs">
            <span>
              Par: {config.targetValue} {config.metricLabel || config.metric}
            </span>
            <span>·</span>
            <span>{standings.length} Golfers</span>
          </div>
        </div>
      </div>

      {/* Column headers */}
      <div className="bg-green-900/90 px-4 py-2 grid grid-cols-[48px_32px_1fr_100px_80px_60px_60px_80px] gap-2 text-[10px] font-bold text-green-300/80 uppercase tracking-wider border-b border-green-700/30">
        <span>Pos</span>
        <span></span>
        <span>Player</span>
        <span className="text-center">Today</span>
        <span className="text-center">Total</span>
        <span className="text-center">Thru</span>
        <span className="text-center">Streak</span>
        <span className="text-center">Group</span>
      </div>

      {/* Rows */}
      <div className="bg-white dark:bg-gray-950">
        {visibleStandings.map((player, idx) => {
          const isSelected = player.agentId === selectedId;
          const isLeader = player.position === 1;
          const isRevealing = phase === 'racing' && idx === revealedCount - 1;
          const daysPlayed = player.dailyScores?.length ?? 0;

          return (
            <div
              key={player.agentId}
              onClick={() => onSelect(player.agentId)}
              className={`px-4 py-2.5 grid grid-cols-[48px_32px_1fr_100px_80px_60px_60px_80px] gap-2 items-center cursor-pointer transition-all border-b border-gray-100 dark:border-gray-800 ${
                isSelected
                  ? 'bg-green-50 dark:bg-green-900/20 ring-1 ring-green-400'
                  : 'hover:bg-gray-50 dark:hover:bg-gray-900/50'
              } ${isLeader ? 'bg-yellow-50/50 dark:bg-yellow-900/10' : ''} ${
                isRevealing ? 'animate-fade-in' : ''
              }`}
              style={isRevealing ? { animation: 'fadeInUp 0.5s ease-out' } : undefined}
            >
              {/* Position + movement */}
              <div className="flex items-center gap-1">
                <span
                  className={`text-sm font-bold ${
                    player.position <= 3 ? 'text-green-700 dark:text-green-400' : 'text-gray-600 dark:text-gray-400'
                  }`}
                >
                  {player.position <= 3 ? POSITION_LABELS[player.position - 1] : `T${player.position}`}
                </span>
                <MovementArrow movement={player.movement} />
              </div>

              {/* Color indicator */}
              <div className="w-6 h-6 rounded-full border-2 border-white dark:border-gray-800 shadow-sm" style={{ backgroundColor: player.color }} />

              {/* Player name */}
              <div className="min-w-0">
                <p className={`text-sm font-semibold truncate ${isLeader ? 'text-green-800 dark:text-green-300' : ''}`}>
                  {player.displayName}
                </p>
                <p className="text-[10px] text-muted-foreground truncate">{player.teamName || 'Independent'}</p>
              </div>

              {/* Today's score */}
              <div className="text-center">
                {player.dailyScores && player.dailyScores.length > 0 ? (
                  <GolfTodayLabel
                    score={player.todayScore}
                    label={player.dailyScores[player.dailyScores.length - 1]?.label || 'No activity'}
                  />
                ) : (
                  <span className="text-xs text-muted-foreground">--</span>
                )}
              </div>

              {/* Total score */}
              <div className="text-center">
                <span
                  className={`text-base font-bold ${
                    player.totalScore < 0
                      ? 'text-green-700 dark:text-green-400'
                      : player.totalScore === 0
                        ? 'text-gray-600 dark:text-gray-400'
                        : 'text-red-600 dark:text-red-400'
                  }`}
                >
                  {fmtGolfScore(player.totalScore)}
                </span>
              </div>

              {/* Thru (days played) */}
              <div className="text-center text-xs text-muted-foreground">{daysPlayed}</div>

              {/* Streak */}
              <div className="text-center">
                {player.streak >= 2 ? (
                  <span className="text-orange-600 text-xs font-bold">🔥 {player.streak}</span>
                ) : (
                  <span className="text-xs text-muted-foreground">--</span>
                )}
              </div>

              {/* Group badge */}
              <div className="text-center">
                <GolfGroupBadge groupId={player.groupId} groupings={config.groupings} />
              </div>
            </div>
          );
        })}

        {phase === 'racing' && revealedCount < standings.length && (
          <div className="px-4 py-4 text-center text-sm text-muted-foreground animate-pulse">
            Revealing scores... ({revealedCount}/{standings.length})
          </div>
        )}
      </div>
    </div>
  );
}

// ── Golf Score Groups Panel ───────────────────────────────────────────────
function GolfScoreGroups({
  standings,
  groupings,
}: {
  standings: ParticipantStanding[];
  groupings?: ScoreGrouping[];
}) {
  if (!groupings || groupings.length === 0) return null;

  const groups = groupings.map((g) => ({
    ...g,
    players: standings.filter((s) => s.groupId === g.id),
  }));

  const groupStyles: Record<string, { bg: string; border: string; text: string }> = {
    under_par: { bg: 'bg-green-50 dark:bg-green-900/20', border: 'border-green-300 dark:border-green-700', text: 'text-green-800 dark:text-green-300' },
    even: { bg: 'bg-gray-50 dark:bg-gray-800/50', border: 'border-gray-300 dark:border-gray-600', text: 'text-gray-800 dark:text-gray-300' },
    over_par: { bg: 'bg-red-50 dark:bg-red-900/20', border: 'border-red-300 dark:border-red-700', text: 'text-red-800 dark:text-red-300' },
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold flex items-center gap-2">
        <BarChart3 className="h-4 w-4" />
        Score Groups
      </h3>
      {groups.map((group) => {
        const style = groupStyles[group.id] || groupStyles.even;
        return (
          <Card key={group.id} className={`${style.bg} ${style.border}`}>
            <CardHeader className="pb-2 pt-3 px-3">
              <div className="flex items-center justify-between">
                <CardTitle className={`text-xs font-bold uppercase tracking-wider ${style.text}`}>
                  {group.emoji || ''} {group.label}
                </CardTitle>
                <Badge variant="outline" className="text-[10px]">
                  {group.players.length}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="px-3 pb-3 space-y-1">
              {group.players.length === 0 ? (
                <p className="text-xs text-muted-foreground">No players</p>
              ) : (
                group.players.map((p) => (
                  <div key={p.agentId} className="flex items-center justify-between text-xs">
                    <span className="truncate">{p.displayName}</span>
                    <span className={`font-bold ${style.text}`}>{fmtGolfScore(p.totalScore)}</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ── Golf Daily Challenge Card ─────────────────────────────────────────────
function GolfDailyChallenge({ config }: { config: CompetitionConfig }) {
  return (
    <Card className="bg-gradient-to-br from-green-700 to-green-800 text-white border-0">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-lg">⛳</span>
          <span className="text-xs font-bold uppercase tracking-wider text-green-200">Daily Challenge</span>
        </div>
        <p className="text-lg font-bold">
          Today&apos;s Par: {config.targetValue} {config.metricLabel || config.metric}
        </p>
        <p className="text-xs text-green-200 mt-1">
          Hit {config.targetValue} to make par. Beat it for a birdie or eagle!
        </p>
      </CardContent>
    </Card>
  );
}

// ── Golf Stats Section ────────────────────────────────────────────────────
function GolfStats({ standings }: { standings: ParticipantStanding[] }) {
  const withScores = standings.filter((s) => s.dailyScores && s.dailyScores.length > 0);
  if (withScores.length === 0) return null;

  // Most Eagles: most days with score <= -2
  const eagleCounts = withScores.map((s) => ({
    name: s.displayName,
    count: (s.dailyScores || []).filter((d) => d.score <= -2).length,
  }));
  const mostEagles = eagleCounts.sort((a, b) => b.count - a.count)[0];

  // Most Birdies: most days with score === -1
  const birdieCounts = withScores.map((s) => ({
    name: s.displayName,
    count: (s.dailyScores || []).filter((d) => d.score === -1).length,
  }));
  const mostBirdies = birdieCounts.sort((a, b) => b.count - a.count)[0];

  // Longest Streak
  const longestStreak = [...standings].sort((a, b) => b.streak - a.streak)[0];

  // Most Consistent (lowest variance)
  const variances = withScores.map((s) => {
    const scores = (s.dailyScores || []).map((d) => d.score);
    if (scores.length === 0) return { name: s.displayName, variance: Infinity };
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const variance = scores.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / scores.length;
    return { name: s.displayName, variance };
  });
  const mostConsistent = variances.sort((a, b) => a.variance - b.variance)[0];

  // Most Improved: largest drop in score from first half to second half
  const improvements = withScores.map((s) => {
    const scores = (s.dailyScores || []).map((d) => d.score);
    if (scores.length < 4) return { name: s.displayName, improvement: 0 };
    const mid = Math.floor(scores.length / 2);
    const firstHalfAvg = scores.slice(0, mid).reduce((a, b) => a + b, 0) / mid;
    const secondHalfAvg = scores.slice(mid).reduce((a, b) => a + b, 0) / (scores.length - mid);
    return { name: s.displayName, improvement: firstHalfAvg - secondHalfAvg };
  });
  const mostImproved = improvements.sort((a, b) => b.improvement - a.improvement)[0];

  const stats = [
    { label: 'Most Eagles', value: mostEagles?.name || '--', sub: `${mostEagles?.count || 0} eagles`, icon: '🦅' },
    { label: 'Most Birdies', value: mostBirdies?.name || '--', sub: `${mostBirdies?.count || 0} birdies`, icon: '🐦' },
    { label: 'Longest Streak', value: longestStreak?.displayName || '--', sub: `${longestStreak?.streak || 0} days`, icon: '🔥' },
    { label: 'Most Consistent', value: mostConsistent?.name || '--', sub: 'Lowest variance', icon: '🎯' },
    { label: 'Most Improved', value: mostImproved?.name || '--', sub: 'First half vs second half', icon: '📈' },
  ];

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold flex items-center gap-2">
        <Trophy className="h-4 w-4" />
        Tournament Stats
      </h3>
      <div className="grid grid-cols-1 gap-2">
        {stats.map((stat) => (
          <div key={stat.label} className="flex items-center gap-3 p-2.5 rounded-lg border bg-card">
            <span className="text-lg">{stat.icon}</span>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{stat.label}</p>
              <p className="text-sm font-semibold truncate">{stat.value}</p>
            </div>
            <span className="text-[10px] text-muted-foreground">{stat.sub}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Golf Scorecard (expandable per player) ────────────────────────────────
function GolfScorecard({ player }: { player: ParticipantStanding }) {
  const [expanded, setExpanded] = useState(false);
  const dailyScores = player.dailyScores || [];
  if (dailyScores.length === 0) return null;

  const bestDay = dailyScores.reduce((best, d) => (d.score < best.score ? d : best), dailyScores[0]);
  const worstDay = dailyScores.reduce((worst, d) => (d.score > worst.score ? d : worst), dailyScores[0]);

  const scoreCellColor = (score: number) => {
    if (score <= -2) return 'bg-green-600 text-white';
    if (score === -1) return 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300';
    if (score === 0) return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
    if (score === 1) return 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300';
    return 'bg-red-200 text-red-800 dark:bg-red-900/40 dark:text-red-300';
  };

  return (
    <Card className="border-2" style={{ borderColor: player.color }}>
      <CardHeader className="pb-2">
        <button onClick={() => setExpanded(!expanded)} className="flex items-center justify-between w-full text-left">
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm"
              style={{ backgroundColor: player.color }}
            >
              {player.position}
            </div>
            <div>
              <CardTitle className="text-base">{player.displayName}</CardTitle>
              <CardDescription className="text-xs">
                {player.teamName || 'Independent'} · {fmtGolfScore(player.totalScore)} · {dailyScores.length} days
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span
              className={`text-xl font-bold ${
                player.totalScore < 0 ? 'text-green-700' : player.totalScore === 0 ? 'text-gray-600' : 'text-red-600'
              }`}
            >
              {fmtGolfScore(player.totalScore)}
            </span>
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </button>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-3">
          {/* Scorecard grid */}
          <div className="overflow-x-auto">
            <div className="flex gap-1 min-w-min pb-2">
              {dailyScores.map((day, idx) => (
                <div key={day.date} className="flex flex-col items-center gap-1" style={{ minWidth: '44px' }}>
                  <span className="text-[9px] text-muted-foreground">{fmtDate(day.date)}</span>
                  <div
                    className={`w-9 h-9 rounded-md flex items-center justify-center text-xs font-bold ${scoreCellColor(day.score)}`}
                  >
                    {fmtGolfScore(day.score)}
                  </div>
                  <span className="text-[9px] text-muted-foreground">{day.metricValue}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Best/Worst */}
          <div className="flex gap-4 text-xs">
            <div className="flex items-center gap-1">
              <span className="text-green-600 font-bold">Best:</span>
              <span>
                {fmtDate(bestDay.date)} ({fmtGolfScore(bestDay.score)})
              </span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-red-600 font-bold">Worst:</span>
              <span>
                {fmtDate(worstDay.date)} ({fmtGolfScore(worstDay.score)})
              </span>
            </div>
          </div>

          {/* Bonuses / Penalties */}
          {(player.bonusesApplied.length > 0 || player.penaltiesApplied.length > 0) && (
            <div className="flex flex-wrap gap-1">
              {player.bonusesApplied.map((b, i) => (
                <Badge key={`b-${i}`} variant="outline" className="text-[9px] bg-green-50 text-green-700 border-green-300">
                  {b.label}: {fmtGolfScore(b.score)}
                </Badge>
              ))}
              {player.penaltiesApplied.map((p, i) => (
                <Badge key={`p-${i}`} variant="outline" className="text-[9px] bg-red-50 text-red-700 border-red-300">
                  {p.label}: {fmtGolfScore(p.score)}
                </Badge>
              ))}
            </div>
          )}

          <div className="flex justify-end">
            <Link href={`/dashboard?viewAs=${player.agentId}&viewAsName=${encodeURIComponent(player.displayName)}`}>
              <Button variant="outline" size="sm" className="text-xs">
                <Eye className="h-3 w-3 mr-1" />
                View Dashboard
              </Button>
            </Link>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  MAIN PAGE
// ══════════════════════════════════════════════════════════════════════════════

export default function CompetitionDetailPage() {
  const params = useParams();
  const competitionId = params.competitionId as string;
  const { user, loading: userLoading } = useUser();

  // ── Data state ──────────────────────────────────────────────────────────
  const [competition, setCompetition] = useState<Competition | null>(null);
  const [standings, setStandings] = useState<ParticipantStanding[]>([]);
  const [summary, setSummary] = useState<StandingsResponse['summary'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Interaction state ───────────────────────────────────────────────────
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [phase, setPhase] = useState<AnimPhase>('idle');
  const [muted, setMuted] = useState(false);
  const [commentary, setCommentary] = useState('');
  const [countdownNum, setCountdownNum] = useState<number | null>(null);
  const [carPositions, setCarPositions] = useState<Map<string, number>>(new Map());
  const [revealedCount, setRevealedCount] = useState(0);

  // ── Audio / Commentary refs ─────────────────────────────────────────────
  const audioRef = useRef<CompetitionAudioEngine | null>(null);
  const commentatorRef = useRef<CompetitionCommentator | null>(null);
  const commentaryEngineRef = useRef<CommentaryEngine | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const timerRefs = useRef<ReturnType<typeof setTimeout>[]>([]);

  // ── Initialize audio engines based on config ────────────────────────────
  useEffect(() => {
    return () => {
      audioRef.current?.destroy();
      commentatorRef.current?.cancel();
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      timerRefs.current.forEach(clearTimeout);
    };
  }, []);

  useEffect(() => {
    if (!competition) return;
    const config = competition.config;

    // Audio engine
    if (!audioRef.current) {
      audioRef.current = new CompetitionAudioEngine(config.audioPack);
    } else {
      audioRef.current.setPack(config.audioPack);
    }

    // Commentator (speech synthesis)
    if (!commentatorRef.current) {
      commentatorRef.current = new CompetitionCommentator();
    }

    // Commentary template engine
    if (!commentaryEngineRef.current) {
      commentaryEngineRef.current = new CommentaryEngine(config.commentaryPack);
    } else {
      commentaryEngineRef.current.setPack(config.commentaryPack);
    }
  }, [competition]);

  // ── Mute toggle ─────────────────────────────────────────────────────────
  const toggleMute = useCallback(() => {
    const next = !muted;
    setMuted(next);
    audioRef.current?.setMuted(next);
    if (commentatorRef.current) commentatorRef.current.enabled = !next;
    if (next) commentatorRef.current?.cancel();
  }, [muted]);

  // ── Fetch standings ─────────────────────────────────────────────────────
  const fetchStandings = useCallback(async () => {
    if (!user || !competitionId) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/competitions/${competitionId}/standings`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error || 'Failed to load standings');
      }
      const data: StandingsResponse = await res.json();
      setCompetition(data.competition);
      setStandings(data.standings);
      setSummary(data.summary);

      if (data.standings.length && !selectedId) {
        setSelectedId(data.standings[0].agentId);
      }

      // Set initial car positions for NASCAR theme
      if (data.competition.config.theme === 'nascar') {
        const posMap = new Map<string, number>();
        const maxScore = data.standings[0]?.totalScore || 1;
        for (const s of data.standings) {
          posMap.set(s.agentId, (s.totalScore / maxScore) * 95);
        }
        setCarPositions(posMap);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [user, competitionId, selectedId]);

  useEffect(() => {
    fetchStandings();
  }, [fetchStandings]);

  const config = competition?.config;
  const selectedPlayer = useMemo(() => standings.find((s) => s.agentId === selectedId) || null, [standings, selectedId]);

  // ══════════════════════════════════════════════════════════════════════════
  //  START ANIMATION — Routes to NASCAR or Golf
  // ══════════════════════════════════════════════════════════════════════════

  const startAnimation = useCallback(() => {
    if (!competition || standings.length === 0) return;
    const cfg = competition.config;
    const audio = audioRef.current;
    const commentator = commentatorRef.current;
    const commentary = commentaryEngineRef.current;

    audio?.init();

    // Clear previous timers
    timerRefs.current.forEach(clearTimeout);
    timerRefs.current = [];

    const addTimer = (fn: () => void, delay: number) => {
      timerRefs.current.push(setTimeout(fn, delay));
    };

    if (cfg.theme === 'nascar') {
      startNascarRace(cfg, audio, commentator, commentary, addTimer);
    } else if (cfg.theme === 'golf') {
      startGolfRound(cfg, audio, commentator, commentary, addTimer);
    }
  }, [competition, standings]);

  // ── NASCAR Race Animation ───────────────────────────────────────────────
  const startNascarRace = useCallback(
    (
      cfg: CompetitionConfig,
      audio: CompetitionAudioEngine | null,
      commentator: CompetitionCommentator | null,
      commentaryEngine: CommentaryEngine | null,
      addTimer: (fn: () => void, delay: number) => void,
    ) => {
      // Reset all cars to start line
      const posMap = new Map<string, number>();
      for (const s of standings) posMap.set(s.agentId, 0);
      setCarPositions(new Map(posMap));
      setPhase('countdown');
      setCommentary('');

      const leader = standings[0];
      const runner = standings[1];

      // Generate commentary lines
      const startLine = commentaryEngine?.generate('race_start', {
        competitionName: cfg.name,
        count: standings.length,
      }) || `Welcome to the ${cfg.name}! ${standings.length} racers on the grid!`;

      // Countdown
      const countdownSteps = [
        { delay: 500, num: 3, say: startLine },
        { delay: 2500, num: 2, say: `${standings.length} racers on the grid today!` },
        { delay: 4000, num: 1, say: 'Here we go!' },
        { delay: 5000, num: 0, say: '' },
      ];

      for (const step of countdownSteps) {
        addTimer(() => {
          setCountdownNum(step.num);
          if (step.num > 0) audio?.playCountdownBeep();
          if (step.num === 0) audio?.playGoBeep();
          if (step.say) {
            setCommentary(step.say);
            commentator?.say(step.say);
          }
        }, step.delay);
      }

      // Race starts at 5500ms
      addTimer(() => {
        setPhase('racing');
        setCountdownNum(null);
        audio?.startEngine();
        audio?.playCrowd(2);

        const raceText = `And they're off! ${standings.length} cars roaring around the track!`;
        setCommentary(raceText);
        commentator?.say(raceText);

        const raceDuration = 12000;
        const startTime = performance.now();

        // Target positions
        const maxScore = standings[0]?.totalScore || 1;
        const targets = new Map<string, number>();
        for (const s of standings) targets.set(s.agentId, (s.totalScore / maxScore) * 95);

        const ease = (t: number) => 1 - Math.pow(1 - t, 3);

        let announced25 = false;
        let announced50 = false;
        let announced75 = false;

        const animate = (now: number) => {
          const elapsed = now - startTime;
          const rawPct = Math.min(1, elapsed / raceDuration);
          const pct = ease(rawPct);

          audio?.setEngineSpeed(rawPct < 0.8 ? rawPct : 0.8 - (rawPct - 0.8) * 2);

          const newPos = new Map<string, number>();
          for (const s of standings) {
            const target = targets.get(s.agentId) || 0;
            const wobble = Math.sin(elapsed * 0.01 + s.position) * 0.3;
            newPos.set(s.agentId, target * pct + wobble);
          }
          setCarPositions(new Map(newPos));

          if (rawPct > 0.25 && !announced25) {
            announced25 = true;
            const text = commentaryEngine?.generate('leader_announce', {
              name: leader.displayName,
              score: fmtNum(leader.totalScore),
            }) || `${leader.displayName} is out front with ${fmtNum(leader.totalScore)} points!`;
            setCommentary(text);
            commentator?.say(text);
          }

          if (rawPct > 0.5 && !announced50) {
            announced50 = true;
            const gap = leader.totalScore - (runner?.totalScore || 0);
            const text = runner
              ? commentaryEngine?.generate('midrace', {
                  name: runner.displayName,
                  leader: leader.displayName,
                  runner: runner.displayName,
                  gap: fmtNum(gap),
                  count: Math.min(5, standings.length),
                }) || `We're at the halfway mark! ${runner.displayName} is chasing, just ${fmtNum(gap)} points behind!`
              : `Halfway there! ${leader.displayName} continues to lead!`;
            setCommentary(text);
            commentator?.say(text);
            audio?.playCrowd(2);
          }

          if (rawPct > 0.75 && !announced75) {
            announced75 = true;
            const text = 'Final stretch! The crowd is on their feet!';
            setCommentary(text);
            commentator?.say(text);
          }

          if (rawPct < 1) {
            animFrameRef.current = requestAnimationFrame(animate);
          } else {
            // Finished
            audio?.stopEngine();
            audio?.playVictory();
            setPhase('finished');

            const winText = commentaryEngine?.generate('finish', {
              name: leader.displayName,
              score: fmtNum(leader.totalScore),
              competitionName: cfg.name,
            }) || `Checkered flag! ${leader.displayName} wins the ${cfg.name}!`;
            setCommentary(winText);
            commentator?.say(winText);

            if (runner) {
              addTimer(() => {
                const text2nd = commentaryEngine?.generate('podium_2nd', {
                  name: runner.displayName,
                  score: fmtNum(runner.totalScore),
                }) || `In second place, ${runner.displayName} with ${fmtNum(runner.totalScore)} points!`;
                commentator?.say(text2nd);
              }, 4000);
            }
            const third = standings[2];
            if (third) {
              addTimer(() => {
                const text3rd = commentaryEngine?.generate('podium_3rd', {
                  name: third.displayName,
                  score: fmtNum(third.totalScore),
                }) || `And in third, ${third.displayName}!`;
                commentator?.say(text3rd);
              }, 7000);
            }
          }
        };

        animFrameRef.current = requestAnimationFrame(animate);
      }, 5500);
    },
    [standings],
  );

  // ── Golf Round Reveal Animation ─────────────────────────────────────────
  const startGolfRound = useCallback(
    (
      cfg: CompetitionConfig,
      audio: CompetitionAudioEngine | null,
      commentator: CompetitionCommentator | null,
      commentaryEngine: CommentaryEngine | null,
      addTimer: (fn: () => void, delay: number) => void,
    ) => {
      setPhase('countdown');
      setRevealedCount(0);
      setCommentary('');

      const roundNum = standings[0]?.dailyScores?.length || 1;

      // Countdown: show "Round N" title
      addTimer(() => {
        setCountdownNum(roundNum);
        const startLine = commentaryEngine?.generate('round_start', {
          competitionName: cfg.name,
          count: standings.length,
        }) || `Welcome to the ${cfg.name}! ${standings.length} golfers on the course today.`;
        setCommentary(startLine);
        commentator?.say(startLine);
        audio?.playCountdownBeep();
      }, 500);

      addTimer(() => {
        audio?.playGoBeep();
        setCountdownNum(null);
        setPhase('racing');

        // Reveal each player's score one at a time
        const revealDelay = 500; // 0.5s between each
        const sortedForReveal = [...standings];

        sortedForReveal.forEach((player, idx) => {
          addTimer(() => {
            setRevealedCount(idx + 1);

            // Play sound based on today's score
            const todayScore = player.todayScore;
            if (todayScore <= -2) {
              // Eagle
              audio?.playAchievement('large');
              const text = commentaryEngine?.generate('achievement_eagle', {
                name: player.displayName,
                metricValue: player.metricToday,
                metricLabel: cfg.metricLabel || cfg.metric,
              }) || `An eagle for ${player.displayName}! Outstanding!`;
              setCommentary(text);
              commentator?.say(text);
            } else if (todayScore === -1) {
              // Birdie
              audio?.playAchievement('small');
              audio?.playClap(0.8);
              const text = commentaryEngine?.generate('achievement_birdie', {
                name: player.displayName,
                metricValue: player.metricToday,
                metricLabel: cfg.metricLabel || cfg.metric,
              }) || `A birdie for ${player.displayName}!`;
              setCommentary(text);
              commentator?.say(text);
            } else if (todayScore === 0) {
              // Par — subtle chime
              audio?.playChime();
            } else if (todayScore >= 2) {
              // Double bogey
              audio?.playPenalty();
              const text = commentaryEngine?.generate('penalty_double_bogey', {
                name: player.displayName,
                metricValue: player.metricToday,
                metricLabel: cfg.metricLabel || cfg.metric,
              }) || `A tough day for ${player.displayName}.`;
              setCommentary(text);
            } else if (todayScore >= 1) {
              // Bogey
              audio?.playPenalty();
            }
          }, idx * revealDelay);
        });

        // After all revealed, announce leader
        const totalRevealTime = sortedForReveal.length * revealDelay;
        addTimer(() => {
          setPhase('finished');
          audio?.playVictory();

          const leader = standings[0];
          if (leader) {
            const text = commentaryEngine?.generate('leader_announce', {
              name: leader.displayName,
              score: fmtGolfScore(leader.totalScore),
            }) || `${leader.displayName} leads at ${fmtGolfScore(leader.totalScore)}.`;
            setCommentary(text);
            commentator?.say(text);
          }

          // Announce 2nd and 3rd
          const runner = standings[1];
          if (runner) {
            addTimer(() => {
              const text2 = commentaryEngine?.generate('podium_2nd', {
                name: runner.displayName,
                score: fmtGolfScore(runner.totalScore),
              }) || `Runner-up: ${runner.displayName} at ${fmtGolfScore(runner.totalScore)}.`;
              commentator?.say(text2);
            }, 3000);
          }
          const third = standings[2];
          if (third) {
            addTimer(() => {
              const text3 = commentaryEngine?.generate('podium_3rd', {
                name: third.displayName,
                score: fmtGolfScore(third.totalScore),
              }) || `And in third, ${third.displayName} at ${fmtGolfScore(third.totalScore)}.`;
              commentator?.say(text3);
            }, 5000);
          }
        }, totalRevealTime + 1000);
      }, 3000);
    },
    [standings],
  );

  // ── Reset animation ─────────────────────────────────────────────────────
  const resetAnimation = useCallback(() => {
    setPhase('idle');
    setCountdownNum(null);
    setCommentary('');
    setRevealedCount(0);
    commentatorRef.current?.cancel();
    audioRef.current?.stopEngine();
    audioRef.current?.stopAmbient();
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    timerRefs.current.forEach(clearTimeout);
    timerRefs.current = [];

    // Reset car positions for NASCAR
    if (competition?.config.theme === 'nascar' && standings.length > 0) {
      const maxScore = standings[0]?.totalScore || 1;
      const posMap = new Map<string, number>();
      for (const s of standings) posMap.set(s.agentId, (s.totalScore / maxScore) * 95);
      setCarPositions(posMap);
    }
  }, [competition, standings]);

  // ══════════════════════════════════════════════════════════════════════════
  //  RENDER
  // ══════════════════════════════════════════════════════════════════════════

  if (userLoading || loading) {
    return (
      <div className="space-y-8">
        <Skeleton className="h-12 w-1/2" />
        <Skeleton className="h-[500px] w-full rounded-xl" />
        <div className="grid grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Sign In Required</AlertTitle>
      </Alert>
    );
  }

  if (user.uid !== ADMIN_UID) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Access Denied</AlertTitle>
        <AlertDescription>You do not have admin access.</AlertDescription>
      </Alert>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!competition || !config) return null;

  // ══════════════════════════════════════════════════════════════════════════
  //  NASCAR THEME RENDER
  // ══════════════════════════════════════════════════════════════════════════

  if (config.theme === 'nascar') {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-yellow-400 to-amber-600 flex items-center justify-center text-2xl shadow-lg">
              🏆
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">{config.name}</h1>
              <p className="text-muted-foreground">{config.description || 'Race to the top!'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {statusBadge(config.status)}
            <Badge variant="outline" className="text-xs">
              <Calendar className="h-3 w-3 mr-1" />
              {config.startDate} — {config.endDate}
            </Badge>
          </div>
        </div>

        {/* Control bar */}
        <SharedControlBar
          config={config}
          phase={phase}
          participantCount={standings.length}
          muted={muted}
          onStart={startAnimation}
          onReset={resetAnimation}
          onToggleMute={toggleMute}
          competitionId={competitionId}
        />

        {/* Race track */}
        <Card className="overflow-hidden">
          <NascarTrack
            standings={standings}
            selectedId={selectedId}
            onSelect={setSelectedId}
            phase={phase}
            carPositions={carPositions}
            countdownNum={countdownNum}
            commentary={commentary}
            competitionName={config.name}
          />
        </Card>

        {/* Commentary ticker (when not in track) */}
        {commentary && phase !== 'racing' && phase !== 'countdown' && (
          <CommentaryTicker text={commentary} />
        )}

        {/* Leaderboard + Detail */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Flag className="h-5 w-5" />
                  Standings
                </CardTitle>
              </CardHeader>
              <CardContent>
                <NascarLeaderboard
                  standings={standings}
                  prizes={config.prizes}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  phase={phase}
                />
              </CardContent>
            </Card>
          </div>
          <div>
            {selectedPlayer && <NascarRacerDetail racer={selectedPlayer} />}
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  GOLF THEME RENDER
  // ══════════════════════════════════════════════════════════════════════════

  return (
    <div className="space-y-6">
      {/* Header — Tournament style */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-600 to-green-800 flex items-center justify-center text-2xl shadow-lg">
            ⛳
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{config.name}</h1>
            <p className="text-muted-foreground">
              {config.description || 'Daily competition with golf-style scoring'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {statusBadge(config.status)}
          <Badge variant="outline" className="text-xs">
            <Calendar className="h-3 w-3 mr-1" />
            {config.startDate} — {config.endDate}
          </Badge>
          <Badge variant="outline" className="text-xs">
            <BarChart3 className="h-3 w-3 mr-1" />
            {config.metricLabel || config.metric}
          </Badge>
        </div>
      </div>

      {/* Control bar */}
      <SharedControlBar
        config={config}
        phase={phase}
        participantCount={standings.length}
        muted={muted}
        onStart={startAnimation}
        onReset={resetAnimation}
        onToggleMute={toggleMute}
        competitionId={competitionId}
      />

      {/* Round countdown overlay */}
      {phase === 'countdown' && countdownNum !== null && (
        <Card className="bg-gradient-to-r from-green-900 to-green-800 text-white border-0">
          <CardContent className="py-12 text-center">
            <p className="text-green-300 text-sm uppercase tracking-widest mb-2">Now Revealing</p>
            <p className="text-5xl font-bold">Round {countdownNum}</p>
            <p className="text-green-200 text-sm mt-2">{config.name}</p>
          </CardContent>
        </Card>
      )}

      {/* Commentary ticker */}
      {commentary && <CommentaryTicker text={commentary} />}

      {/* Main content: Leaderboard + Sidebar */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        {/* Leaderboard — 3 cols */}
        <div className="xl:col-span-3 space-y-6">
          <GolfLeaderboard
            standings={standings}
            config={config}
            selectedId={selectedId}
            onSelect={setSelectedId}
            phase={phase}
            revealedCount={revealedCount}
          />

          {/* Scorecard section */}
          {standings.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Scorecards
              </h2>
              <div className="space-y-2">
                {standings.map((player) => (
                  <GolfScorecard key={player.agentId} player={player} />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right sidebar — 1 col */}
        <div className="space-y-4">
          <GolfDailyChallenge config={config} />
          <GolfScoreGroups standings={standings} groupings={config.groupings} />
          <GolfStats standings={standings} />
        </div>
      </div>

      {/* Animation keyframes */}
      <style jsx global>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fade-in {
          animation: fadeInUp 0.5s ease-out;
        }
      `}</style>
    </div>
  );
}

// ── Inline status badge helper (reused from parent page) ──────────────────
function statusBadge(status: string) {
  switch (status) {
    case 'active':
      return <Badge className="bg-green-100 text-green-800 border-green-300">Active</Badge>;
    case 'completed':
      return <Badge className="bg-blue-100 text-blue-800 border-blue-300">Completed</Badge>;
    case 'archived':
      return <Badge className="bg-gray-100 text-gray-600 border-gray-300">Archived</Badge>;
    default:
      return <Badge variant="outline">Draft</Badge>;
  }
}
