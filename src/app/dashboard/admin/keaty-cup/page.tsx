'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { AlertCircle, Trophy, ChevronDown, ChevronUp, Save, Flag, Zap, Settings, Eye, Play, Volume2, VolumeX, RotateCcw } from 'lucide-react';
import { useUser } from '@/firebase';
import Link from 'next/link';

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmtCurrency = (n: number) => n >= 1000 ? `$${(n / 1000).toFixed(0)}k` : `$${n.toFixed(0)}`;
const fmtNum = (n: number) => n.toLocaleString();
const POSITION_LABELS = ['🥇', '🥈', '🥉'];

// ══════════════════════════════════════════════════════════════════════════════
//  SOUND ENGINE — Web Audio API for engine revs, crowd, and effects
// ══════════════════════════════════════════════════════════════════════════════

class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private engineOsc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private crowdNode: AudioBufferSourceNode | null = null;
  muted = false;

  init() {
    if (this.ctx) return;
    this.ctx = new AudioContext();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.3;
    this.masterGain.connect(this.ctx.destination);
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.masterGain) this.masterGain.gain.value = m ? 0 : 0.3;
  }

  // Engine rev sound (low frequency oscillator)
  startEngine() {
    if (!this.ctx || !this.masterGain) return;
    this.stopEngine();
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0.15;
    this.engineGain.connect(this.masterGain);

    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 80;
    this.engineOsc.connect(this.engineGain);
    this.engineOsc.start();
  }

  // Ramp engine pitch up during race
  setEngineSpeed(pct: number) {
    if (this.engineOsc) {
      this.engineOsc.frequency.value = 80 + pct * 200;
    }
    if (this.engineGain) {
      this.engineGain.gain.value = 0.05 + pct * 0.15;
    }
  }

  stopEngine() {
    try { this.engineOsc?.stop(); } catch {}
    this.engineOsc = null;
    this.engineGain = null;
  }

  // Crowd noise (white noise burst)
  playCrowd(duration = 3) {
    if (!this.ctx || !this.masterGain) return;
    const bufferSize = this.ctx.sampleRate * duration;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.3;
    }
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.12, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.25, this.ctx.currentTime + 1);
    gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + duration);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1000;
    filter.Q.value = 0.5;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    source.start();
  }

  // Beep sounds (countdown: 3, 2, 1, GO!)
  playBeep(frequency = 800, duration = 0.15) {
    if (!this.ctx || !this.masterGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.frequency.value = frequency;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.4, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }

  // Victory fanfare
  playVictory() {
    if (!this.ctx || !this.masterGain) return;
    const notes = [523, 659, 784, 1047]; // C5, E5, G5, C6
    notes.forEach((freq, i) => {
      setTimeout(() => this.playBeep(freq, 0.3), i * 200);
    });
    setTimeout(() => this.playCrowd(4), 600);
  }

  // Tire screech
  playScreech() {
    if (!this.ctx || !this.masterGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(2000, this.ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(500, this.ctx.currentTime + 0.3);
    gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.3);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.4);
  }

  destroy() {
    this.stopEngine();
    try { this.ctx?.close(); } catch {}
    this.ctx = null;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  COMMENTATOR — Browser SpeechSynthesis for live commentary
// ══════════════════════════════════════════════════════════════════════════════

class Commentator {
  private queue: string[] = [];
  private speaking = false;
  enabled = true;

  say(text: string) {
    if (!this.enabled || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    this.queue.push(text);
    this.processQueue();
  }

  private processQueue() {
    if (this.speaking || this.queue.length === 0) return;
    this.speaking = true;
    const text = this.queue.shift()!;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.1;
    utterance.pitch = 0.9;
    utterance.volume = 1;
    // Try to pick a male English voice
    const voices = speechSynthesis.getVoices();
    const preferred = voices.find(v => v.lang.startsWith('en') && v.name.toLowerCase().includes('male'))
      || voices.find(v => v.lang.startsWith('en-US'))
      || voices.find(v => v.lang.startsWith('en'));
    if (preferred) utterance.voice = preferred;
    utterance.onend = () => { this.speaking = false; this.processQueue(); };
    utterance.onerror = () => { this.speaking = false; this.processQueue(); };
    speechSynthesis.speak(utterance);
  }

  cancel() {
    this.queue = [];
    this.speaking = false;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      speechSynthesis.cancel();
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  ANIMATED RACE TRACK
// ══════════════════════════════════════════════════════════════════════════════

function getTrackPoint(progress: number, cx: number, cy: number, rx: number, ry: number) {
  const angle = ((progress / 100) * Math.PI * 2) - Math.PI / 2;
  return { x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle), angle: angle * (180 / Math.PI) + 90 };
}

type RacePhase = 'idle' | 'countdown' | 'racing' | 'finished';

function AnimatedRaceTrack({ standings, selectedId, onSelect, racePhase, carPositions, countdownNum, commentary }: {
  standings: any[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  racePhase: RacePhase;
  carPositions: Map<string, number>;
  countdownNum: number | null;
  commentary: string;
}) {
  const width = 900;
  const height = 520;
  const cx = width / 2;
  const cy = height / 2 + 10;
  const rx = 380;
  const ry = 190;
  const trackWidth = 60;

  // Checkered flag animation
  const showCheckered = racePhase === 'finished';

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto" style={{ maxHeight: '520px' }}>
        {/* Grass */}
        <rect x="0" y="0" width={width} height={height} fill="#2d5a27" rx="20" />

        {/* Grandstands */}
        <rect x="20" y="10" width={width - 40} height={35} rx="5" fill="#8B4513" opacity="0.7" />
        {Array.from({ length: 30 }, (_, i) => (
          <circle key={`fan-${i}`} cx={40 + i * 28} cy={28} r={5} fill={['#e11d48','#2563eb','#16a34a','#d97706','#7c3aed','#fff'][i % 6]} opacity={racePhase === 'racing' || racePhase === 'finished' ? 0.9 : 0.4}>
            {(racePhase === 'racing' || racePhase === 'finished') && (
              <animate attributeName="cy" values={`${28};${23};${28}`} dur={`${0.3 + (i % 5) * 0.1}s`} repeatCount="indefinite" />
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
        {/* Checkered pattern at start line */}
        {Array.from({ length: 8 }, (_, i) => (
          <rect key={`check-${i}`} x={cx - 12 + (i % 2) * 6} y={cy - ry - trackWidth / 2 + Math.floor(i / 2) * 8} width="6" height="8"
            fill={i % 2 === Math.floor(i / 2) % 2 ? '#000' : '#fff'} opacity="0.8" />
        ))}

        {/* Infield */}
        <text x={cx} y={cy - 30} textAnchor="middle" fill="#fff" fontSize="28" fontWeight="bold" opacity="0.9">🏆</text>
        <text x={cx} y={cy + 5} textAnchor="middle" fill="#ffeb3b" fontSize="22" fontWeight="bold" fontFamily="Arial">KEATY CUP</text>
        <text x={cx} y={cy + 28} textAnchor="middle" fill="#fff" fontSize="13" opacity="0.7">{standings.length} Racers</text>

        {/* Countdown overlay */}
        {racePhase === 'countdown' && countdownNum !== null && (
          <g>
            <circle cx={cx} cy={cy} r={60} fill="rgba(0,0,0,0.7)" />
            <text x={cx} y={cy + 20} textAnchor="middle" fill={countdownNum === 0 ? '#22c55e' : '#ffeb3b'} fontSize="60" fontWeight="bold" fontFamily="Arial">
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
        {standings.slice().reverse().map((racer: any) => {
          const isSelected = racer.agentId === selectedId;
          const pos = carPositions.get(racer.agentId) ?? 0;
          const pt = getTrackPoint(pos, cx, cy, rx, ry);
          const carW = 28;
          const carH = 16;

          return (
            <g key={racer.agentId} onClick={() => onSelect(racer.agentId)} style={{ cursor: 'pointer' }}
              opacity={selectedId && !isSelected ? 0.5 : 1}>
              {isSelected && (
                <circle cx={pt.x} cy={pt.y} r={22} fill={racer.carColor} opacity={0.3}>
                  <animate attributeName="r" values="22;28;22" dur="1.5s" repeatCount="indefinite" />
                </circle>
              )}

              {/* Exhaust particles during race */}
              {racePhase === 'racing' && (
                <>
                  <circle cx={pt.x - 8} cy={pt.y + 3} r={2} fill="#aaa" opacity="0.4">
                    <animate attributeName="r" values="2;5;0" dur="0.5s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.4;0.1;0" dur="0.5s" repeatCount="indefinite" />
                  </circle>
                </>
              )}

              <g transform={`translate(${pt.x}, ${pt.y}) rotate(${pt.angle})`}>
                <rect x={-carW / 2} y={-carH / 2} width={carW} height={carH} rx={4} fill={racer.carColor}
                  stroke={isSelected ? '#fff' : '#000'} strokeWidth={isSelected ? 2.5 : 1} />
                <rect x={-carW / 2 + 5} y={-carH / 2 + 2} width={8} height={carH - 4} rx={2} fill="#111" opacity="0.6" />
                <text x={4} y={carH / 2 - 3} textAnchor="middle" fill="#fff" fontSize="8" fontWeight="bold" fontFamily="Arial">{racer.carNumber}</text>
              </g>

              {racer.position <= 5 && racePhase !== 'countdown' && (
                <text x={pt.x} y={pt.y - 16} textAnchor="middle" fill="#fff" fontSize="11" fontWeight="bold"
                  stroke="#000" strokeWidth="0.5" paintOrder="stroke">
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
          <div className="bg-black/80 text-white text-sm font-medium px-4 py-2 rounded-lg flex items-center gap-2 animate-pulse">
            <span className="text-yellow-400">🎙️</span>
            <span>{commentary}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Event Badge ─────────────────────────────────────────────────────────────
function EventBadge({ event }: { event: any }) {
  const colors: Record<string, string> = {
    flat_tire: 'bg-red-100 text-red-800 border-red-300',
    turbo_boost: 'bg-purple-100 text-purple-800 border-purple-300',
    green_flag: 'bg-green-100 text-green-800 border-green-300',
    checkered_flag: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    pit_stop: 'bg-gray-100 text-gray-600 border-gray-300',
    caution: 'bg-orange-100 text-orange-800 border-orange-300',
  };
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border ${colors[event.type] || colors.caution}`}>
      {event.emoji} {event.label}
      {event.points !== 0 && <span className={event.points > 0 ? 'text-green-700' : 'text-red-700'}>{event.points > 0 ? '+' : ''}{event.points}</span>}
    </span>
  );
}

// ── Leaderboard ─────────────────────────────────────────────────────────────
function LeaderboardTable({ standings, prizes, selectedId, onSelect, racePhase }: {
  standings: any[]; prizes: any[]; selectedId: string | null; onSelect: (id: string) => void; racePhase: RacePhase;
}) {
  return (
    <div className="space-y-1.5 max-h-[600px] overflow-y-auto">
      {standings.map((r: any) => {
        const prize = prizes?.find((p: any) => p.place === r.position);
        const isSelected = r.agentId === selectedId;
        const posColor = r.position === 1 ? 'bg-yellow-400 text-yellow-900'
          : r.position === 2 ? 'bg-gray-300 text-gray-800'
          : r.position === 3 ? 'bg-amber-600 text-white'
          : 'bg-gray-100 text-gray-600';

        return (
          <div key={r.agentId} onClick={() => onSelect(r.agentId)}
            className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-all hover:shadow-md ${isSelected ? 'ring-2 ring-blue-500 bg-blue-50/50 border-blue-300' : 'hover:bg-muted/50'} ${racePhase === 'finished' && r.position === 1 ? 'animate-pulse ring-2 ring-yellow-400' : ''}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${posColor}`}>{r.position}</div>
            <div className="w-3 h-8 rounded-sm shrink-0" style={{ backgroundColor: r.carColor }} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold truncate">{r.displayName}</span>
                {prize && racePhase === 'finished' && <Badge variant="outline" className="text-[9px] h-4 bg-yellow-50 text-yellow-700 border-yellow-300">💰 {fmtCurrency(prize.amount)}</Badge>}
              </div>
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                <span>{r.teamName || 'Independent'}</span>
                <span>·</span>
                <span>#{r.carNumber}</span>
                {r.streak >= 2 && <><span>·</span><span className="text-orange-600 font-medium">🔥 {r.streak}mo</span></>}
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="text-lg font-bold">{fmtNum(r.points)}</p>
              <p className="text-[10px] text-muted-foreground">{r.pointsBehindLeader > 0 ? `-${fmtNum(r.pointsBehindLeader)}` : 'LEADER'}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Racer Detail ────────────────────────────────────────────────────────────
function RacerDetail({ racer }: { racer: any }) {
  return (
    <Card className="border-2" style={{ borderColor: racer.carColor }}>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-lg" style={{ backgroundColor: racer.carColor }}>{racer.carNumber}</div>
          <div className="flex-1">
            <CardTitle className="text-lg">{racer.displayName}</CardTitle>
            <CardDescription>{racer.teamName || 'Independent'} · Position {racer.position}</CardDescription>
          </div>
          <div className="text-right"><p className="text-2xl font-bold">{fmtNum(racer.points)} pts</p></div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 text-center">
          {[
            { label: 'Closed', value: racer.closedDeals, icon: '✅' },
            { label: 'Pending', value: racer.pendingDeals, icon: '⏳' },
            { label: 'Cancelled', value: racer.cancelledDeals, icon: '💥' },
            { label: 'Volume', value: fmtCurrency(racer.closedVolume), icon: '💰' },
            { label: 'Engagements', value: fmtNum(racer.engagements), icon: '📞' },
            { label: 'Appts Held', value: fmtNum(racer.appointmentsHeld), icon: '🤝' },
          ].map(s => (
            <div key={s.label} className="border rounded-lg p-2">
              <p className="text-xs text-muted-foreground">{s.icon} {s.label}</p>
              <p className="text-sm font-bold">{s.value}</p>
            </div>
          ))}
        </div>
        {racer.events.length > 0 && (
          <div>
            <p className="text-xs font-semibold mb-2">Race Events</p>
            <div className="flex flex-wrap gap-1.5">
              {racer.events.map((e: any, i: number) => (
                <div key={i} className="group relative">
                  <EventBadge event={e} />
                  <div className="absolute bottom-full left-0 mb-1 hidden group-hover:block z-50 bg-popover text-popover-foreground border rounded-md shadow-md p-2 text-xs w-48">
                    <p className="font-medium">{e.emoji} {e.label}</p>
                    <p className="text-muted-foreground">{e.detail}</p>
                    <p className="text-[10px] mt-1">{e.date}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="flex justify-end">
          <Link href={`/dashboard?viewAs=${racer.agentId}&viewAsName=${encodeURIComponent(racer.displayName)}`}>
            <Button variant="outline" size="sm" className="text-xs"><Eye className="h-3 w-3 mr-1" />View Dashboard</Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Rules Editor ────────────────────────────────────────────────────────────
function RulesEditor({ rules, year, onSaved }: { rules: any; year: number; onSaved: () => void }) {
  const { user } = useUser();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [r, setR] = useState({ ...rules });

  const save = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const token = await user.getIdToken();
      await fetch('/api/broker/keaty-cup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ year, rules: r }),
      });
      onSaved();
    } catch (err) { console.error('Save failed:', err); }
    finally { setSaving(false); }
  };

  const field = (key: string, label: string) => (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input type="number" value={r[key] ?? ''} onChange={e => setR((p: any) => ({ ...p, [key]: Number(e.target.value) || 0 }))} className="h-8" />
    </div>
  );

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CardHeader className="pb-3">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="flex w-full justify-between p-0 h-auto hover:bg-transparent">
              <div className="flex items-center gap-2"><Settings className="h-5 w-5" /><CardTitle className="text-lg">Race Rules & Prizes</CardTitle></div>
              {open ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
            </Button>
          </CollapsibleTrigger>
          <CardDescription>Configure the point system, bonuses, penalties, and prize money.</CardDescription>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="space-y-6">
            <div className="space-y-1">
              <Label className="text-sm">Season Name</Label>
              <Input value={r.seasonName || ''} onChange={e => setR((p: any) => ({ ...p, seasonName: e.target.value }))} placeholder="Keaty Cup 2026" />
            </div>
            <div>
              <h4 className="font-semibold text-sm mb-3">Points System</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {field('closedDeal', '✅ Closed Deal')}
                {field('pendingDeal', '⏳ Pending Deal')}
                {field('engagementPoint', '📞 Per Engagement')}
                {field('appointmentHeldPoint', '🤝 Per Appt Held')}
                {field('contractWrittenPoint', '📝 Per Contract Written')}
                {field('cancelledDeal', '💥 Cancelled (Flat Tire)')}
                {field('bigClosingBonus', '🚀 Big Closing Bonus')}
                {field('bigClosingThreshold', '🏠 Big Closing $ Threshold')}
              </div>
            </div>
            <div>
              <h4 className="font-semibold text-sm mb-3">Bonus Points</h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {field('firstDealOfMonthBonus', '🟢 First Deal of Month')}
                {field('monthlyGoalHitBonus', '🏁 Monthly Goal Hit')}
              </div>
            </div>
            <div>
              <h4 className="font-semibold text-sm mb-3">Prize Money</h4>
              <div className="space-y-2">
                {(r.prizes || []).map((p: any, i: number) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-sm font-medium w-20">{['🥇 1st', '🥈 2nd', '🥉 3rd'][i] || `${i + 1}th`}</span>
                    <Input type="number" value={p.amount ?? ''} onChange={e => {
                      const prizes = [...(r.prizes || [])];
                      prizes[i] = { ...prizes[i], amount: Number(e.target.value) || 0 };
                      setR((prev: any) => ({ ...prev, prizes }));
                    }} className="h-8 w-32" placeholder="Amount $" />
                    <span className="text-xs text-muted-foreground">{p.label}</span>
                  </div>
                ))}
                <Button variant="outline" size="sm" className="text-xs" onClick={() => {
                  const prizes = [...(r.prizes || [])];
                  prizes.push({ place: prizes.length + 1, label: `${prizes.length + 1}th Place`, amount: 0 });
                  setR((prev: any) => ({ ...prev, prizes }));
                }}>+ Add Prize</Button>
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={save} disabled={saving}><Save className="mr-2 h-4 w-4" />{saving ? 'Saving...' : 'Save Rules'}</Button>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

// ── Points Legend ────────────────────────────────────────────────────────────
function PointsLegend({ rules }: { rules: any }) {
  const items = [
    { emoji: '✅', label: 'Closed Deal', pts: `+${rules.closedDeal}` },
    { emoji: '⏳', label: 'Pending Deal', pts: `+${rules.pendingDeal}` },
    { emoji: '📞', label: 'Engagement', pts: `+${rules.engagementPoint}` },
    { emoji: '🤝', label: 'Appt Held', pts: `+${rules.appointmentHeldPoint}` },
    { emoji: '📝', label: 'Contract Written', pts: `+${rules.contractWrittenPoint}` },
    { emoji: '🟢', label: '1st Deal of Month', pts: `+${rules.firstDealOfMonthBonus}` },
    { emoji: '🚀', label: `Closing ≥ ${fmtCurrency(rules.bigClosingThreshold)}`, pts: `+${rules.bigClosingBonus}` },
    { emoji: '💥', label: 'Deal Fell Through', pts: `${rules.cancelledDeal}` },
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {items.map(i => (
        <div key={i.label} className="flex items-center gap-1 text-xs bg-muted/50 rounded-md px-2 py-1">
          <span>{i.emoji}</span>
          <span className="text-muted-foreground">{i.label}</span>
          <span className={`font-bold ${i.pts.startsWith('-') ? 'text-red-600' : 'text-green-600'}`}>{i.pts}</span>
        </div>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  MAIN PAGE
// ══════════════════════════════════════════════════════════════════════════════

export default function KeatyCupPage() {
  const { user, loading: userLoading } = useUser();
  const [year, setYear] = useState(new Date().getFullYear());
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRacer, setSelectedRacer] = useState<string | null>(null);

  // Race animation state
  const [racePhase, setRacePhase] = useState<RacePhase>('idle');
  const [carPositions, setCarPositions] = useState<Map<string, number>>(new Map());
  const [countdownNum, setCountdownNum] = useState<number | null>(null);
  const [commentary, setCommentary] = useState('');
  const [muted, setMuted] = useState(false);

  const soundRef = useRef<SoundEngine | null>(null);
  const commentatorRef = useRef<Commentator | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Init sound + commentator
  useEffect(() => {
    soundRef.current = new SoundEngine();
    commentatorRef.current = new Commentator();
    return () => {
      soundRef.current?.destroy();
      commentatorRef.current?.cancel();
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    soundRef.current?.setMuted(next);
    if (commentatorRef.current) commentatorRef.current.enabled = !next;
    if (next) commentatorRef.current?.cancel();
  };

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/broker/keaty-cup?year=${year}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      const d = await res.json();
      setData(d);
      if (d.standings?.length && !selectedRacer) setSelectedRacer(d.standings[0].agentId);
      // Set initial positions to final (static view)
      const posMap = new Map<string, number>();
      for (const s of d.standings) posMap.set(s.agentId, s.lapProgress);
      setCarPositions(posMap);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [user, year]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const selected = useMemo(() =>
    data?.standings?.find((s: any) => s.agentId === selectedRacer) || null
  , [data, selectedRacer]);

  // ── START RACE ──────────────────────────────────────────────────────────
  const startRace = useCallback(() => {
    if (!data?.standings?.length) return;
    const standings = data.standings;
    const sound = soundRef.current;
    const commentator = commentatorRef.current;

    sound?.init();

    // Reset all cars to start line
    const posMap = new Map<string, number>();
    for (const s of standings) posMap.set(s.agentId, 0);
    setCarPositions(new Map(posMap));
    setRacePhase('countdown');
    setCommentary('');

    const leader = standings[0];
    const runner = standings[1];

    // Countdown: 3... 2... 1... GO!
    const countdownSteps = [
      { delay: 500, num: 3, say: "Ladies and gentlemen, welcome to the Keaty Cup! Drivers, start your engines!" },
      { delay: 2500, num: 2, say: `${standings.length} racers on the grid today!` },
      { delay: 4000, num: 1, say: "Here we go!" },
      { delay: 5000, num: 0, say: "" },
    ];

    for (const step of countdownSteps) {
      setTimeout(() => {
        setCountdownNum(step.num);
        if (step.num > 0) sound?.playBeep(600, 0.2);
        if (step.num === 0) sound?.playBeep(1200, 0.4);
        if (step.say) {
          setCommentary(step.say);
          commentator?.say(step.say);
        }
      }, step.delay);
    }

    // Race starts at 5500ms
    setTimeout(() => {
      setRacePhase('racing');
      setCountdownNum(null);
      sound?.startEngine();
      sound?.playCrowd(2);

      const raceText = `And they're off! ${standings.length} cars roaring around the Keaty Cup track!`;
      setCommentary(raceText);
      commentator?.say(raceText);

      const raceDuration = 12000; // 12 seconds
      const startTime = performance.now();

      // Target positions for each car
      const targets = new Map<string, number>();
      for (const s of standings) targets.set(s.agentId, s.lapProgress);

      // Ease function: cubic ease-out with some randomness for excitement
      const ease = (t: number) => 1 - Math.pow(1 - t, 3);

      // Commentary milestones
      let announced25 = false, announced50 = false, announced75 = false;

      const animate = (now: number) => {
        const elapsed = now - startTime;
        const rawPct = Math.min(1, elapsed / raceDuration);
        const pct = ease(rawPct);

        // Update engine pitch
        sound?.setEngineSpeed(rawPct < 0.8 ? rawPct : 0.8 - (rawPct - 0.8) * 2);

        // Move cars with slight per-car variation
        const newPos = new Map<string, number>();
        for (const s of standings) {
          const target = targets.get(s.agentId) || 0;
          // Add slight wobble for realism
          const wobble = racePhase === 'racing' ? Math.sin(elapsed * 0.01 + s.position) * 0.3 : 0;
          newPos.set(s.agentId, target * pct + wobble);
        }
        setCarPositions(new Map(newPos));

        // Mid-race commentary
        if (rawPct > 0.25 && !announced25) {
          announced25 = true;
          const text = `${leader.displayName} is out front with ${fmtNum(leader.points)} points!`;
          setCommentary(text);
          commentator?.say(text);
        }
        if (rawPct > 0.5 && !announced50) {
          announced50 = true;
          const gap = leader.points - (runner?.points || 0);
          const text = runner
            ? `We're at the halfway mark! ${runner.displayName} is chasing, just ${fmtNum(gap)} points behind!`
            : `Halfway there! ${leader.displayName} continues to lead!`;
          setCommentary(text);
          commentator?.say(text);
          sound?.playCrowd(2);
        }
        if (rawPct > 0.75 && !announced75) {
          announced75 = true;
          // Call out an interesting event
          const flatTire = standings.find((s: any) => s.events.some((e: any) => e.type === 'flat_tire'));
          if (flatTire) {
            const text = `Oh no! ${flatTire.displayName} hit a flat tire earlier this season — that cost them ${Math.abs(data.rules.cancelledDeal)} points!`;
            setCommentary(text);
            commentator?.say(text);
            sound?.playScreech();
          } else {
            const turbo = standings.find((s: any) => s.events.some((e: any) => e.type === 'turbo_boost'));
            const text = turbo
              ? `${turbo.displayName} had a turbo boost from a big closing! What a race!`
              : `Final stretch! The crowd is on their feet!`;
            setCommentary(text);
            commentator?.say(text);
          }
        }

        if (rawPct < 1) {
          animFrameRef.current = requestAnimationFrame(animate);
        } else {
          // Race finished!
          sound?.stopEngine();
          sound?.playVictory();
          setRacePhase('finished');

          const prize = data.rules.prizes?.[0];
          const winText = prize
            ? `Checkered flag! ${leader.displayName} wins the Keaty Cup and takes home ${fmtCurrency(prize.amount)}! What a season!`
            : `Checkered flag! ${leader.displayName} wins the Keaty Cup! Incredible performance!`;
          setCommentary(winText);
          commentator?.say(winText);

          // Announce 2nd and 3rd after a delay
          setTimeout(() => {
            if (runner) {
              const text2 = `In second place, ${runner.displayName} with ${fmtNum(runner.points)} points!`;
              commentator?.say(text2);
            }
            const third = standings[2];
            if (third) {
              setTimeout(() => {
                commentator?.say(`And rounding out the podium, ${third.displayName} in third!`);
              }, 3000);
            }
          }, 4000);
        }
      };

      animFrameRef.current = requestAnimationFrame(animate);
    }, 5500);
  }, [data]);

  const resetRace = () => {
    setRacePhase('idle');
    setCountdownNum(null);
    setCommentary('');
    commentatorRef.current?.cancel();
    soundRef.current?.stopEngine();
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    // Reset to final positions
    if (data?.standings) {
      const posMap = new Map<string, number>();
      for (const s of data.standings) posMap.set(s.agentId, s.lapProgress);
      setCarPositions(posMap);
    }
  };

  if (userLoading || loading) {
    return <div className="space-y-8"><Skeleton className="h-12 w-1/2" /><Skeleton className="h-[400px] w-full rounded-xl" /><div className="grid grid-cols-3 gap-4">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-32" />)}</div></div>;
  }
  if (!user) return <Alert><AlertTitle>Sign In Required</AlertTitle></Alert>;
  if (error) return <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertTitle>Error</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>;
  if (!data) return null;

  const { standings, rules, seasonName } = data;
  const top3 = standings.slice(0, 3);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-yellow-400 to-amber-600 flex items-center justify-center text-2xl shadow-lg">🏆</div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{seasonName}</h1>
            <p className="text-muted-foreground">Race to the top — every deal, every engagement, every appointment counts!</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(year)} onValueChange={v => { setYear(Number(v)); resetRace(); }}>
            <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[...Array(3)].map((_, i) => { const y = new Date().getFullYear() - i; return <SelectItem key={y} value={String(y)}>{y}</SelectItem>; })}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Race Controls */}
      <Card className="bg-gradient-to-r from-gray-900 to-gray-800 text-white border-0">
        <CardContent className="p-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {racePhase === 'idle' || racePhase === 'finished' ? (
              <Button onClick={startRace} size="lg" className="bg-green-600 hover:bg-green-700 text-white font-bold text-lg px-8 gap-2 animate-pulse">
                <Play className="h-6 w-6" />
                {racePhase === 'finished' ? 'Race Again!' : 'Start Race!'}
              </Button>
            ) : (
              <Button onClick={resetRace} size="lg" variant="outline" className="border-white text-white hover:bg-white/20 gap-2">
                <RotateCcw className="h-5 w-5" /> Reset
              </Button>
            )}
            <Button onClick={toggleMute} size="sm" variant="ghost" className="text-white hover:bg-white/20">
              {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
            </Button>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${racePhase === 'idle' ? 'bg-gray-500' : racePhase === 'countdown' ? 'bg-yellow-400 animate-pulse' : racePhase === 'racing' ? 'bg-green-400 animate-pulse' : 'bg-white'}`} />
              <span className="uppercase font-bold tracking-wider">
                {racePhase === 'idle' ? 'Ready' : racePhase === 'countdown' ? 'Countdown' : racePhase === 'racing' ? 'Racing!' : '🏁 Finished'}
              </span>
            </div>
            <span className="text-white/60">{standings.length} racers</span>
          </div>
        </CardContent>
      </Card>

      {/* Track + Leaderboard */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3">
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              <AnimatedRaceTrack
                standings={standings}
                selectedId={selectedRacer}
                onSelect={setSelectedRacer}
                racePhase={racePhase}
                carPositions={carPositions}
                countdownNum={countdownNum}
                commentary={commentary}
              />
            </CardContent>
          </Card>
          {selected && <div className="mt-4"><RacerDetail racer={selected} /></div>}
        </div>
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2"><Trophy className="h-5 w-5 text-yellow-600" /> Standings</CardTitle>
            </CardHeader>
            <CardContent className="p-3">
              <LeaderboardTable standings={standings} prizes={rules.prizes || []} selectedId={selectedRacer} onSelect={setSelectedRacer} racePhase={racePhase} />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Podium (after race finishes) */}
      {racePhase === 'finished' && top3.length >= 3 && (
        <Card className="overflow-hidden bg-gradient-to-b from-gray-900 to-gray-800 text-white border-0">
          <CardContent className="py-8">
            <h2 className="text-center text-2xl font-bold mb-6">🏆 Final Podium</h2>
            <div className="flex items-end justify-center gap-6">
              <div className="text-center animate-[fadeIn_1s_ease-in_0.5s_both]">
                <div className="w-16 h-16 mx-auto rounded-full border-4 flex items-center justify-center text-white font-bold text-xl shadow-lg" style={{ backgroundColor: top3[1].carColor, borderColor: '#C0C0C0' }}>{top3[1].carNumber}</div>
                <p className="text-sm font-semibold mt-2">{top3[1].displayName}</p>
                <p className="text-lg font-bold">{fmtNum(top3[1].points)} pts</p>
                {rules.prizes?.[1] && <Badge className="bg-gray-400 text-gray-900 mt-1">💰 {fmtCurrency(rules.prizes[1].amount)}</Badge>}
                <div className="w-28 h-24 bg-gradient-to-t from-gray-500 to-gray-400 rounded-t-lg mt-2 flex items-center justify-center"><span className="text-4xl">🥈</span></div>
              </div>
              <div className="text-center animate-[fadeIn_1s_ease-in_both]">
                <div className="w-20 h-20 mx-auto rounded-full border-4 flex items-center justify-center text-white font-bold text-2xl shadow-xl" style={{ backgroundColor: top3[0].carColor, borderColor: '#FFD700' }}>{top3[0].carNumber}</div>
                <p className="text-base font-bold mt-2">{top3[0].displayName}</p>
                <p className="text-2xl font-bold text-yellow-400">{fmtNum(top3[0].points)} pts</p>
                {rules.prizes?.[0] && <Badge className="bg-yellow-400 text-yellow-900 mt-1 text-sm">💰 {fmtCurrency(rules.prizes[0].amount)}</Badge>}
                <div className="w-32 h-32 bg-gradient-to-t from-yellow-500 to-yellow-300 rounded-t-lg mt-2 flex items-center justify-center"><span className="text-6xl">🥇</span></div>
              </div>
              <div className="text-center animate-[fadeIn_1s_ease-in_1s_both]">
                <div className="w-16 h-16 mx-auto rounded-full border-4 flex items-center justify-center text-white font-bold text-xl shadow-lg" style={{ backgroundColor: top3[2].carColor, borderColor: '#CD7F32' }}>{top3[2].carNumber}</div>
                <p className="text-sm font-semibold mt-2">{top3[2].displayName}</p>
                <p className="text-lg font-bold">{fmtNum(top3[2].points)} pts</p>
                {rules.prizes?.[2] && <Badge className="bg-amber-600 text-white mt-1">💰 {fmtCurrency(rules.prizes[2].amount)}</Badge>}
                <div className="w-28 h-20 bg-gradient-to-t from-amber-700 to-amber-500 rounded-t-lg mt-2 flex items-center justify-center"><span className="text-4xl">🥉</span></div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Points Legend */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><Flag className="h-4 w-4" /> How Points Work</CardTitle>
        </CardHeader>
        <CardContent><PointsLegend rules={rules} /></CardContent>
      </Card>

      {/* Race Events Feed */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2"><Zap className="h-5 w-5 text-orange-500" /> Season Race Events</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {standings
              .flatMap((r: any) => r.events.map((e: any) => ({ ...e, agentName: r.displayName, carColor: r.carColor, carNumber: r.carNumber })))
              .sort((a: any, b: any) => b.date.localeCompare(a.date))
              .slice(0, 30)
              .map((e: any, i: number) => (
                <div key={i} className="flex items-center gap-3 text-sm border-b last:border-0 pb-2">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0" style={{ backgroundColor: e.carColor }}>{e.carNumber}</div>
                  <span className="text-lg">{e.emoji}</span>
                  <div className="flex-1 min-w-0"><span className="font-medium">{e.agentName}</span><span className="text-muted-foreground"> — {e.detail}</span></div>
                  <span className={`text-xs font-bold ${e.points > 0 ? 'text-green-600' : e.points < 0 ? 'text-red-600' : 'text-muted-foreground'}`}>{e.points > 0 ? `+${e.points}` : e.points === 0 ? '' : e.points}</span>
                  <span className="text-xs text-muted-foreground shrink-0">{e.date}</span>
                </div>
              ))}
            {standings.flatMap((r: any) => r.events).length === 0 && (
              <p className="text-center text-muted-foreground py-4">No race events yet — start closing deals! 🏁</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Rules Editor */}
      <RulesEditor rules={rules} year={year} onSaved={fetchData} />
    </div>
  );
}
