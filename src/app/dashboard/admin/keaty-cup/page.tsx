'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { AlertCircle, Trophy, ChevronDown, ChevronUp, Save, Flag, Zap, Settings, Eye } from 'lucide-react';
import { useUser } from '@/firebase';
import Link from 'next/link';

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmtCurrency = (n: number) => n >= 1000 ? `$${(n / 1000).toFixed(0)}k` : `$${n.toFixed(0)}`;
const fmtNum = (n: number) => n.toLocaleString();

// ── Car Colors for SVG ──────────────────────────────────────────────────────
const POSITION_LABELS = ['🥇', '🥈', '🥉'];

// ── Oval Track SVG ──────────────────────────────────────────────────────────
// The track is an ellipse with cars placed along the perimeter

function getTrackPoint(progress: number, cx: number, cy: number, rx: number, ry: number): { x: number; y: number; angle: number } {
  // progress 0-100 maps to angle 0-2π (starting from top, going clockwise)
  const angle = ((progress / 100) * Math.PI * 2) - Math.PI / 2;
  return {
    x: cx + rx * Math.cos(angle),
    y: cy + ry * Math.sin(angle),
    angle: angle * (180 / Math.PI) + 90,
  };
}

function RaceTrack({ standings, selectedId, onSelect }: {
  standings: any[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const width = 900;
  const height = 500;
  const cx = width / 2;
  const cy = height / 2;
  const rx = 380;
  const ry = 190;

  // Track stripes
  const trackWidth = 60;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto" style={{ maxHeight: '500px' }}>
      {/* Grass / background */}
      <rect x="0" y="0" width={width} height={height} fill="#2d5a27" rx="20" />

      {/* Track outer edge */}
      <ellipse cx={cx} cy={cy} rx={rx + trackWidth / 2} ry={ry + trackWidth / 2} fill="#555" stroke="#fff" strokeWidth="3" />

      {/* Track surface */}
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="#444" />

      {/* Track inner edge */}
      <ellipse cx={cx} cy={cy} rx={rx - trackWidth / 2} ry={ry - trackWidth / 2} fill="#2d5a27" stroke="#fff" strokeWidth="3" />

      {/* Dashed center line */}
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="none" stroke="#ffeb3b" strokeWidth="2" strokeDasharray="12 8" opacity="0.6" />

      {/* Start/finish line */}
      <line x1={cx} y1={cy - ry - trackWidth / 2 - 2} x2={cx} y2={cy - ry + trackWidth / 2 + 2} stroke="#fff" strokeWidth="4" />
      <text x={cx + 8} y={cy - ry - trackWidth / 2 - 8} fill="#fff" fontSize="11" fontWeight="bold">🏁 START/FINISH</text>

      {/* Infield text */}
      <text x={cx} y={cy - 30} textAnchor="middle" fill="#fff" fontSize="28" fontWeight="bold" opacity="0.9">🏆</text>
      <text x={cx} y={cy + 5} textAnchor="middle" fill="#ffeb3b" fontSize="20" fontWeight="bold" fontFamily="Arial">KEATY CUP</text>
      <text x={cx} y={cy + 28} textAnchor="middle" fill="#fff" fontSize="13" opacity="0.7">{standings.length} Racers</text>

      {/* Cars on track */}
      {standings.slice().reverse().map((racer: any) => {
        const isSelected = racer.agentId === selectedId;
        const pt = getTrackPoint(racer.lapProgress, cx, cy, rx, ry);
        const carW = 28;
        const carH = 16;

        return (
          <g key={racer.agentId}
            onClick={() => onSelect(racer.agentId)}
            style={{ cursor: 'pointer' }}
            opacity={selectedId && !isSelected ? 0.5 : 1}
          >
            {/* Car glow for selected */}
            {isSelected && (
              <circle cx={pt.x} cy={pt.y} r={22} fill={racer.carColor} opacity={0.3}>
                <animate attributeName="r" values="22;28;22" dur="1.5s" repeatCount="indefinite" />
              </circle>
            )}

            {/* Car body */}
            <g transform={`translate(${pt.x}, ${pt.y}) rotate(${pt.angle})`}>
              <rect x={-carW / 2} y={-carH / 2} width={carW} height={carH} rx={4} fill={racer.carColor} stroke={isSelected ? '#fff' : '#000'} strokeWidth={isSelected ? 2.5 : 1} />
              {/* Windshield */}
              <rect x={-carW / 2 + 5} y={-carH / 2 + 2} width={8} height={carH - 4} rx={2} fill="#111" opacity="0.6" />
              {/* Car number */}
              <text x={4} y={carH / 2 - 3} textAnchor="middle" fill="#fff" fontSize="8" fontWeight="bold" fontFamily="Arial">{racer.carNumber}</text>
            </g>

            {/* Position label (for top 5) */}
            {racer.position <= 5 && (
              <text x={pt.x} y={pt.y - 16} textAnchor="middle" fill="#fff" fontSize="11" fontWeight="bold"
                stroke="#000" strokeWidth="0.5" paintOrder="stroke">
                {racer.position <= 3 ? POSITION_LABELS[racer.position - 1] : `P${racer.position}`}
              </text>
            )}
          </g>
        );
      })}
    </svg>
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
      {event.points !== 0 && (
        <span className={event.points > 0 ? 'text-green-700' : 'text-red-700'}>
          {event.points > 0 ? '+' : ''}{event.points}
        </span>
      )}
    </span>
  );
}

// ── Leaderboard Table ───────────────────────────────────────────────────────
function LeaderboardTable({ standings, prizes, selectedId, onSelect }: {
  standings: any[]; prizes: any[]; selectedId: string | null; onSelect: (id: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      {standings.map((r: any) => {
        const prize = prizes?.find((p: any) => p.place === r.position);
        const isSelected = r.agentId === selectedId;
        const posColor = r.position === 1 ? 'bg-yellow-400 text-yellow-900'
          : r.position === 2 ? 'bg-gray-300 text-gray-800'
          : r.position === 3 ? 'bg-amber-600 text-white'
          : 'bg-gray-100 text-gray-600';

        return (
          <div key={r.agentId}
            onClick={() => onSelect(r.agentId)}
            className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-all hover:shadow-md ${isSelected ? 'ring-2 ring-blue-500 bg-blue-50/50 border-blue-300' : 'hover:bg-muted/50'}`}
          >
            {/* Position */}
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${posColor}`}>
              {r.position}
            </div>

            {/* Car color indicator */}
            <div className="w-3 h-8 rounded-sm shrink-0" style={{ backgroundColor: r.carColor }} />

            {/* Name & Team */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold truncate">{r.displayName}</span>
                {prize && <Badge variant="outline" className="text-[9px] h-4 bg-yellow-50 text-yellow-700 border-yellow-300">
                  💰 {fmtCurrency(prize.amount)}
                </Badge>}
              </div>
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                <span>{r.teamName || 'Independent'}</span>
                <span>·</span>
                <span>#{r.carNumber}</span>
                {r.streak >= 2 && (
                  <>
                    <span>·</span>
                    <span className="text-orange-600 font-medium">🔥 {r.streak}mo streak</span>
                  </>
                )}
              </div>
            </div>

            {/* Points */}
            <div className="text-right shrink-0">
              <p className="text-lg font-bold">{fmtNum(r.points)}</p>
              <p className="text-[10px] text-muted-foreground">
                {r.pointsBehindLeader > 0 ? `-${fmtNum(r.pointsBehindLeader)}` : 'LEADER'}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Racer Detail Panel ──────────────────────────────────────────────────────
function RacerDetail({ racer }: { racer: any }) {
  return (
    <Card className="border-2" style={{ borderColor: racer.carColor }}>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-lg" style={{ backgroundColor: racer.carColor }}>
            {racer.carNumber}
          </div>
          <div className="flex-1">
            <CardTitle className="text-lg">{racer.displayName}</CardTitle>
            <CardDescription>{racer.teamName || 'Independent'} · Position {racer.position}</CardDescription>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold">{fmtNum(racer.points)} pts</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stats Grid */}
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

        {/* Race Events */}
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

        {/* Quick link */}
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
              <div className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                <CardTitle className="text-lg">Race Rules & Prizes</CardTitle>
              </div>
              {open ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
            </Button>
          </CollapsibleTrigger>
          <CardDescription>Configure the point system, bonuses, penalties, and prize money.</CardDescription>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="space-y-6">
            {/* Season Name */}
            <div className="space-y-1">
              <Label className="text-sm">Season Name</Label>
              <Input value={r.seasonName || ''} onChange={e => setR((p: any) => ({ ...p, seasonName: e.target.value }))} placeholder="e.g. Keaty Cup 2026" />
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
                }}>
                  + Add Prize
                </Button>
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={save} disabled={saving}>
                <Save className="mr-2 h-4 w-4" />{saving ? 'Saving...' : 'Save Rules'}
              </Button>
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

// ── Main Page ────────────────────────────────────────────────────────────────
export default function KeatyCupPage() {
  const { user, loading: userLoading } = useUser();
  const [year, setYear] = useState(new Date().getFullYear());
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRacer, setSelectedRacer] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/broker/keaty-cup?year=${year}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      const d = await res.json();
      setData(d);
      if (d.standings?.length && !selectedRacer) setSelectedRacer(d.standings[0].agentId);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [user, year]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const selected = useMemo(() =>
    data?.standings?.find((s: any) => s.agentId === selectedRacer) || null
  , [data, selectedRacer]);

  if (userLoading || loading) {
    return (
      <div className="space-y-8">
        <Skeleton className="h-12 w-1/2" />
        <Skeleton className="h-[400px] w-full rounded-xl" />
        <div className="grid grid-cols-3 gap-4">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-32" />)}</div>
      </div>
    );
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
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-yellow-400 to-amber-600 flex items-center justify-center text-2xl shadow-lg">
            🏆
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{seasonName}</h1>
            <p className="text-muted-foreground">Race to the top — every deal, every engagement, every appointment counts!</p>
          </div>
        </div>
        <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
          <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[...Array(3)].map((_, i) => { const y = new Date().getFullYear() - i; return <SelectItem key={y} value={String(y)}>{y}</SelectItem>; })}
          </SelectContent>
        </Select>
      </div>

      {/* Podium */}
      {top3.length >= 3 && (
        <div className="flex items-end justify-center gap-4 py-4">
          {/* 2nd place */}
          <div className="text-center">
            <div className="w-14 h-14 mx-auto rounded-full border-4 flex items-center justify-center text-white font-bold text-xl shadow-lg" style={{ backgroundColor: top3[1].carColor, borderColor: '#C0C0C0' }}>
              {top3[1].carNumber}
            </div>
            <p className="text-sm font-semibold mt-1">{top3[1].displayName}</p>
            <p className="text-lg font-bold">{fmtNum(top3[1].points)} pts</p>
            <div className="w-24 h-20 bg-gradient-to-t from-gray-300 to-gray-200 rounded-t-lg mt-1 flex items-center justify-center">
              <span className="text-3xl">🥈</span>
            </div>
          </div>

          {/* 1st place */}
          <div className="text-center">
            <div className="w-18 h-18 mx-auto rounded-full border-4 flex items-center justify-center text-white font-bold text-2xl shadow-xl" style={{ backgroundColor: top3[0].carColor, borderColor: '#FFD700', width: 72, height: 72 }}>
              {top3[0].carNumber}
            </div>
            <p className="text-base font-bold mt-1">{top3[0].displayName}</p>
            <p className="text-xl font-bold text-yellow-600">{fmtNum(top3[0].points)} pts</p>
            {rules.prizes?.[0] && <Badge className="bg-yellow-400 text-yellow-900 mt-1">💰 {fmtCurrency(rules.prizes[0].amount)}</Badge>}
            <div className="w-28 h-28 bg-gradient-to-t from-yellow-400 to-yellow-200 rounded-t-lg mt-1 flex items-center justify-center">
              <span className="text-5xl">🥇</span>
            </div>
          </div>

          {/* 3rd place */}
          <div className="text-center">
            <div className="w-14 h-14 mx-auto rounded-full border-4 flex items-center justify-center text-white font-bold text-xl shadow-lg" style={{ backgroundColor: top3[2].carColor, borderColor: '#CD7F32' }}>
              {top3[2].carNumber}
            </div>
            <p className="text-sm font-semibold mt-1">{top3[2].displayName}</p>
            <p className="text-lg font-bold">{fmtNum(top3[2].points)} pts</p>
            <div className="w-24 h-16 bg-gradient-to-t from-amber-600 to-amber-400 rounded-t-lg mt-1 flex items-center justify-center">
              <span className="text-3xl">🥉</span>
            </div>
          </div>
        </div>
      )}

      {/* Points Legend */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><Flag className="h-4 w-4" /> How Points Work</CardTitle>
        </CardHeader>
        <CardContent>
          <PointsLegend rules={rules} />
        </CardContent>
      </Card>

      {/* Track + Leaderboard */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Track (3 cols) */}
        <div className="lg:col-span-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                🏎️ Race Track
                <Badge variant="outline" className="text-[10px]">{standings.length} cars</Badge>
              </CardTitle>
              <CardDescription className="text-xs">Click a car or leaderboard entry to see details</CardDescription>
            </CardHeader>
            <CardContent className="p-2">
              <RaceTrack standings={standings} selectedId={selectedRacer} onSelect={setSelectedRacer} />
            </CardContent>
          </Card>

          {/* Selected Racer Detail */}
          {selected && <div className="mt-4"><RacerDetail racer={selected} /></div>}
        </div>

        {/* Leaderboard (2 cols) */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Trophy className="h-5 w-5 text-yellow-600" /> Standings
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3">
              <LeaderboardTable standings={standings} prizes={rules.prizes || []} selectedId={selectedRacer} onSelect={setSelectedRacer} />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Race Events Feed */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2"><Zap className="h-5 w-5 text-orange-500" /> Recent Race Events</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {standings
              .flatMap((r: any) => r.events.map((e: any) => ({ ...e, agentName: r.displayName, carColor: r.carColor, carNumber: r.carNumber })))
              .sort((a: any, b: any) => b.date.localeCompare(a.date))
              .slice(0, 30)
              .map((e: any, i: number) => (
                <div key={i} className="flex items-center gap-3 text-sm border-b last:border-0 pb-2">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0" style={{ backgroundColor: e.carColor }}>
                    {e.carNumber}
                  </div>
                  <span className="text-lg">{e.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <span className="font-medium">{e.agentName}</span>
                    <span className="text-muted-foreground"> — {e.detail}</span>
                  </div>
                  <span className={`text-xs font-bold ${e.points > 0 ? 'text-green-600' : e.points < 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
                    {e.points > 0 ? `+${e.points}` : e.points === 0 ? '' : e.points}
                  </span>
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
