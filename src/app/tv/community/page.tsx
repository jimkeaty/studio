'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Clock, Users, Home, MapPin, Phone, Bed, Bath, Square,
  DollarSign, Droplets, Zap, Building2, Calendar, ChevronLeft, ChevronRight,
  BarChart2, Trophy, Crown, Rocket,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type ComingSoonListing = {
  id: string; area: string; address?: string; price?: number | null;
  beds?: number | null; baths?: number | null; sqft?: number | null;
  acreage?: number | null; pool?: boolean; generator?: boolean;
  stories?: string | null; otherAmenities?: string; notes?: string;
  expectedDate?: string | null; agentName: string; agentPhone: string;
};

type BuyerNeed = {
  id: string; area: string; minPrice?: number | null; maxPrice?: number | null;
  beds?: number | null; baths?: number | null; minAcreage?: number | null;
  maxAcreage?: number | null; pool?: boolean; generator?: boolean;
  stories?: string | null; otherAmenities?: string; notes?: string;
  agentName: string; agentPhone: string;
};

type OpenHouseListing = {
  id: string; address: string; price?: number | null;
  beds?: number | null; baths?: number | null; sqft?: number | null;
  notes?: string; agentName: string; agentPhone: string;
  openHouseDate?: string | null; openHouseTime?: string; openHouseEndTime?: string;
  compensation?: number | null; compensationNote?: string;
  claimedByName?: string | null; claimedByPhone?: string | null; claimedAt?: string | null;
};

type AgentHelpItem = {
  id: string;
  helpType: string;
  description: string;
  propertyAddress?: string;
  needDate?: string | null;
  needTime?: string | null;
  compensation?: number | null;
  compensationNote?: string;
  agentName: string;
  agentPhone: string;
  claimedByName?: string | null;
};

type ActivityItem = {
  agentDisplayName: string;
  date: string;
  price: number;
  addressShort: string;
};

type YtdTotals = {
  totalVolume: number;
  totalSales: number;
  totalAgentCommissions: number;
};

type LeaderRow = {
  agentId: string;
  displayName: string;
  avatarUrl: string | null;
  closed: number;
  pending: number;
  closedVolume: number;
  totalGCI: number;
  agentNetCommission: number;
};

// All 7 possible sections
const ALL_SECTION_DEFS: Record<string, { label: string; color: string; dot: string; bgColor: string }> = {
  'activity':     { label: 'Activity Board',  color: 'bg-emerald-500',  dot: 'bg-emerald-400',  bgColor: 'from-emerald-900/30' },
  'leaderboard':  { label: 'Leaderboard',     color: 'bg-yellow-500',   dot: 'bg-yellow-400',   bgColor: 'from-yellow-900/30' },
  'coming-soon':  { label: 'Coming Soon',     color: 'bg-purple-500',   dot: 'bg-purple-400',   bgColor: 'from-purple-900/30' },
  'buyer-needs':  { label: 'Buyer Needs',     color: 'bg-blue-500',     dot: 'bg-blue-400',     bgColor: 'from-blue-900/30' },
  'open-houses':  { label: 'Open House Opportunities', color: 'bg-orange-500', dot: 'bg-orange-400', bgColor: 'from-orange-900/30' },
  'agent-help':   { label: 'Agent Help Needed', color: 'bg-teal-500',   dot: 'bg-teal-400',     bgColor: 'from-teal-900/30' },
  'competition':  { label: 'Competition',     color: 'bg-red-500',      dot: 'bg-red-400',      bgColor: 'from-red-900/30' },
};

const DEFAULT_COMMUNITY_SECTIONS = ['activity', 'leaderboard', 'coming-soon', 'buyer-needs', 'open-houses', 'agent-help'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt$(n?: number | null) {
  if (!n) return null;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function fmtCompact(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtDate(d?: string | null) {
  if (!d) return null;
  try { return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); }
  catch { return d; }
}

function fmtShortDate(d: string) {
  if (!d) return '';
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const AVATAR_GRADIENTS = [
  'from-blue-500 to-violet-600', 'from-violet-500 to-pink-600',
  'from-amber-500 to-red-500', 'from-emerald-500 to-blue-500',
  'from-cyan-500 to-indigo-600', 'from-rose-500 to-orange-500',
];

// ─── Auto-scroll hook ─────────────────────────────────────────────────────────

function useAutoScroll(items: any[], active: boolean) {
  const containerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number | null>(null);
  const posRef = useRef(0);

  useEffect(() => {
    const container = containerRef.current;
    const inner = innerRef.current;
    if (!container || !inner || items.length === 0 || !active) return;

    posRef.current = 0;
    container.scrollTop = 0;

    const SPEED = 28;
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
        pauseUntil = ts + 2000;
      }

      container.scrollTop = posRef.current;
      animRef.current = requestAnimationFrame(step);
    };

    animRef.current = requestAnimationFrame(step);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [items, active]);

  return { containerRef, innerRef };
}

// ─── Activity Column Card (standalone so refs are stable) ────────────────────

function ActivityColCard({
  title, items, accentColor, icon: Icon, active, showAddress = true,
}: {
  title: string; items: ActivityItem[]; accentColor: string;
  icon: React.ElementType; active: boolean; showAddress?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number | null>(null);
  const posRef = useRef(0);

  useEffect(() => {
    const container = containerRef.current;
    const inner = innerRef.current;
    if (!container || !inner || items.length === 0 || !active) return;

    posRef.current = 0;
    container.scrollTop = 0;

    const SPEED = 28;
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
        pauseUntil = ts + 2000;
      }

      container.scrollTop = posRef.current;
      animRef.current = requestAnimationFrame(step);
    };

    animRef.current = requestAnimationFrame(step);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [items, active]);

  const doubled = [...items, ...items];

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-gray-900 border border-white/10 rounded-2xl overflow-hidden">
      <div className={`flex items-center gap-2 px-4 py-3 border-b border-white/10`}>
        <Icon className={`h-5 w-5 ${accentColor}`} />
        <span className="font-bold text-base text-white">{title}</span>
        <span className="ml-auto text-sm text-gray-500">{items.length}</span>
      </div>
      <div ref={containerRef} className="flex-1 overflow-hidden" style={{ scrollBehavior: 'auto' }}>
        {items.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-600 text-lg">No activity yet</div>
        ) : (
          <div ref={innerRef}>
            {doubled.map((item, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-white/5">
                <div className="flex-1 min-w-0">
                  {showAddress && <div className="text-white font-semibold text-sm truncate">{item.addressShort}</div>}
                  <div className="text-gray-400 text-xs">{item.agentDisplayName} · {fmtShortDate(item.date)}</div>
                </div>
                <div className={`text-sm font-bold flex-shrink-0 ${accentColor}`}>{fmtCompact(item.price)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Activity Board Section ───────────────────────────────────────────────────

function ActivityBoardSection({ active }: { active: boolean }) {
  const [newListings, setNewListings] = useState<ActivityItem[]>([]);
  const [underContract, setUnderContract] = useState<ActivityItem[]>([]);
  const [recentSold, setRecentSold] = useState<ActivityItem[]>([]);
  const [ytd, setYtd] = useState<YtdTotals | null>(null);
  const [loading, setLoading] = useState(true);
  const [boardTitle, setBoardTitle] = useState('Activity Board');
  const [showAddress, setShowAddress] = useState(true);

  useEffect(() => {
    const year = new Date().getFullYear();
    // Fetch board config and activity data in parallel
    Promise.all([
      fetch('/api/board-config?board=activityBoard').then(r => r.json()).catch(() => ({})),
      fetch(`/api/rollups/new-activity?year=${year}`).then(r => r.json()).catch(() => ({}))
    ]).then(([cfg, d]) => {
      if (cfg?.ok && cfg.config) {
        setBoardTitle(cfg.config.title || 'Activity Board');
        setShowAddress(cfg.config.showAddress !== false);
      }
      if (d?.ok) {
        setNewListings(d.newActiveListings || []);
        setUnderContract(d.underContracts || []);
        setRecentSold(d.recentSold || []);
        setYtd(d.ytdTotals || null);
      }
    }).finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center gap-3 px-8 py-5 bg-gray-900 border-b border-white/10">
        <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 flex items-center justify-center">
          <BarChart2 className="h-6 w-6 text-emerald-400" />
        </div>
        <div>
          <h2 className="text-3xl font-extrabold text-white tracking-tight">{boardTitle}</h2>
          <p className="text-gray-400 text-sm">New listings, under contract & recent closings</p>
        </div>
        {loading ? (
          <div className="ml-auto text-gray-500 text-sm animate-pulse">Loading…</div>
        ) : ytd ? (
          <div className="ml-auto flex items-center gap-6">
            <div className="text-center">
              <div className="text-2xl font-black text-white">{ytd.totalSales}</div>
              <div className="text-xs text-gray-400">YTD Closed</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-black text-emerald-400">{fmtCompact(ytd.totalVolume)}</div>
              <div className="text-xs text-gray-400">YTD Volume</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-black text-blue-400">{ytd.totalSales}</div>
              <div className="text-xs text-gray-400">YTD Closings</div>
            </div>
          </div>
        ) : null}
      </div>

      {/* Three columns — each is a stable component with its own scroll loop */}
      <div className="flex-1 flex gap-4 px-8 py-5 min-h-0">
        <ActivityColCard title="New Listings" items={newListings} accentColor="text-blue-400" icon={Home} active={active} showAddress={showAddress} />
        <ActivityColCard title="Under Contract" items={underContract} accentColor="text-amber-400" icon={Calendar} active={active} showAddress={showAddress} />
        <ActivityColCard title="Recent Sold" items={recentSold} accentColor="text-emerald-400" icon={DollarSign} active={active} showAddress={showAddress} />
      </div>
    </div>
  );
}

// ─── Leaderboard Section ──────────────────────────────────────────────────────

type LBConfig = {
  title: string;
  subtitle: string;
  year: number;
  periodType: string;
  primaryMetricKey: string;
  showTopN: number;
  showSales: boolean;
  showVolume: boolean;
  showGCI: boolean;
  showAgentNet: boolean;
  showPending: boolean;
};

const LB_DEFAULTS: LBConfig = {
  title: 'Production Leaderboard',
  subtitle: '',
  year: new Date().getFullYear(),
  periodType: 'yearly',
  primaryMetricKey: 'closed',
  showTopN: 10,
  showSales: true,
  showVolume: true,
  showGCI: true,
  showAgentNet: true,
  showPending: true,
};

function getMetricValue(agent: LeaderRow, key: string): number {
  switch (key) {
    case 'volume': return agent.closedVolume;
    case 'gci': return agent.totalGCI;
    case 'agentNet': return agent.agentNetCommission;
    case 'pending': return agent.pending;
    default: return agent.closed;
  }
}

function getMetricLabel(key: string): string {
  switch (key) {
    case 'volume': return 'volume';
    case 'gci': return 'GCI';
    case 'agentNet': return 'net comm.';
    case 'pending': return 'pending';
    default: return 'closed';
  }
}

function formatMetricValue(val: number, key: string): string {
  if (key === 'volume' || key === 'gci' || key === 'agentNet') return fmtCompact(val);
  return String(val);
}

function LeaderboardSection({ active }: { active: boolean }) {
  const [rows, setRows] = useState<LeaderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [cfg, setCfg] = useState<LBConfig>(LB_DEFAULTS);
  const { containerRef, innerRef } = useAutoScroll(rows, active);

  useEffect(() => {
    // First fetch the admin config, then use it to fetch the right leaderboard data
    fetch('/api/board-config?board=leaderboard')
      .then(r => r.json())
      .then(json => {
        const c: LBConfig = {
          title: json?.config?.title || LB_DEFAULTS.title,
          subtitle: json?.config?.subtitle || LB_DEFAULTS.subtitle,
          year: json?.config?.year || LB_DEFAULTS.year,
          periodType: json?.config?.periodType || LB_DEFAULTS.periodType,
          primaryMetricKey: json?.config?.primaryMetricKey || LB_DEFAULTS.primaryMetricKey,
          showTopN: json?.config?.showTopN || LB_DEFAULTS.showTopN,
          showSales: json?.config?.showSales !== false,
          showVolume: json?.config?.showVolume !== false,
          showGCI: json?.config?.showGCI !== false,
          showAgentNet: json?.config?.showAgentNet !== false,
          showPending: json?.config?.showPending !== false,
        };
        setCfg(c);
        return fetch(`/api/rollups/leaderboard?year=${c.year}&period=${c.periodType}`)
          .then(r => r.json())
          .then(d => {
            if (d.ok) {
              const sorted = (d.rows || []).sort((a: LeaderRow, b: LeaderRow) => {
                const aVal = getMetricValue(a, c.primaryMetricKey);
                const bVal = getMetricValue(b, c.primaryMetricKey);
                return bVal - aVal;
              });
              setRows(sorted.slice(0, c.showTopN));
            }
          });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalVolume = rows.reduce((s, r) => s + r.closedVolume, 0);
  const totalClosed = rows.reduce((s, r) => s + r.closed, 0);
  const totalPaidOut = rows.reduce((s, r) => s + r.agentNetCommission, 0);
  const totalGCI = rows.reduce((s, r) => s + r.totalGCI, 0);
  const totalPending = rows.reduce((s, r) => s + r.pending, 0);

  const periodLabel = cfg.periodType === 'yearly'
    ? `${cfg.year} Year-to-Date Rankings`
    : cfg.periodType === 'quarterly'
    ? `${cfg.year} Quarterly Rankings`
    : `${cfg.year} Monthly Rankings`;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center gap-3 px-8 py-5 bg-gray-900 border-b border-white/10">
        <div className="w-12 h-12 rounded-2xl bg-yellow-500/20 flex items-center justify-center">
          <Trophy className="h-6 w-6 text-yellow-400" />
        </div>
        <div>
          <h2 className="text-3xl font-extrabold text-white tracking-tight">{cfg.title}</h2>
          <p className="text-gray-400 text-sm">{cfg.subtitle || periodLabel}</p>
        </div>
        <div className="ml-auto flex items-center gap-6">
          {cfg.showSales && (
            <div className="text-center">
              <div className="text-2xl font-black text-white">{totalClosed}</div>
              <div className="text-xs text-gray-400">Team Closings</div>
            </div>
          )}
          {cfg.showVolume && (
            <div className="text-center">
              <div className="text-2xl font-black text-emerald-400">{fmtCompact(totalVolume)}</div>
              <div className="text-xs text-gray-400">Team Volume</div>
            </div>
          )}
          {cfg.showGCI && totalGCI > 0 && (
            <div className="text-center">
              <div className="text-2xl font-black text-blue-400">{fmtCompact(totalGCI)}</div>
              <div className="text-xs text-gray-400">Team GCI</div>
            </div>
          )}
          {cfg.showAgentNet && totalPaidOut > 0 && (
            <div className="text-center">
              <div className="text-2xl font-black text-yellow-400">{fmtCompact(totalPaidOut)}</div>
              <div className="text-xs text-gray-400">{cfg.year} Paid Out to Agents</div>
            </div>
          )}
          {cfg.showPending && totalPending > 0 && (
            <div className="text-center">
              <div className="text-2xl font-black text-amber-400">{totalPending}</div>
              <div className="text-xs text-gray-400">Team Pending</div>
            </div>
          )}
        </div>
      </div>

      {/* Scrolling rows */}
      <div ref={containerRef} className="flex-1 overflow-hidden px-8 py-4" style={{ scrollBehavior: 'auto' }}>
        {loading ? (
          <div className="flex items-center justify-center h-full text-gray-400 text-2xl animate-pulse">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-600 text-2xl">No data yet</div>
        ) : (
          <div ref={innerRef}>
            <div className="space-y-3">
              {[...rows, ...rows].map((agent, i) => {
                const realIndex = i % rows.length;
                const primaryVal = getMetricValue(agent, cfg.primaryMetricKey);
                const leaderVal = getMetricValue(rows[0], cfg.primaryMetricKey) || 1;
                const progress = Math.round((primaryVal / leaderVal) * 100);
                const isTop = realIndex === 0;
                const isSecond = realIndex === 1;
                const isThird = realIndex === 2;

                return (
                  <div
                    key={`${agent.agentId}-${i}`}
                    className={`flex items-center gap-4 p-4 rounded-2xl border ${
                      isTop ? 'border-yellow-400/50 bg-yellow-500/5' :
                      isSecond ? 'border-slate-400/30 bg-white/3' :
                      isThird ? 'border-amber-700/30 bg-white/3' :
                      'border-white/8 bg-white/3'
                    }`}
                  >
                    {/* Rank */}
                    <div className={`w-10 text-center font-black text-xl flex-shrink-0 ${
                      isTop ? 'text-yellow-400' : isSecond ? 'text-slate-300' : isThird ? 'text-amber-600' : 'text-gray-500'
                    }`}>
                      {isTop ? <Crown className="h-7 w-7 mx-auto text-yellow-400" /> :
                       isSecond ? <Rocket className="h-6 w-6 mx-auto text-slate-300" /> :
                       <span>#{realIndex + 1}</span>}
                    </div>

                    {/* Avatar */}
                    <div className={`w-12 h-12 rounded-full flex-shrink-0 flex items-center justify-center text-white font-bold text-lg bg-gradient-to-br ${AVATAR_GRADIENTS[realIndex % AVATAR_GRADIENTS.length]}`}>
                      {agent.displayName.charAt(0).toUpperCase()}
                    </div>

                    {/* Name + secondary stats + progress bar */}
                    <div className="flex-1 min-w-0">
                      <div className="text-white font-bold text-lg truncate">{agent.displayName}</div>
                      <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-white/50 mt-0.5">
                        {cfg.showVolume && agent.closedVolume > 0 && cfg.primaryMetricKey !== 'volume' && (
                          <span>Vol: <span className="text-white/80 font-semibold">{fmtCompact(agent.closedVolume)}</span></span>
                        )}
                        {cfg.showGCI && agent.totalGCI > 0 && cfg.primaryMetricKey !== 'gci' && (
                          <span>GCI: <span className="text-blue-300 font-semibold">{fmtCompact(agent.totalGCI)}</span></span>
                        )}
                        {cfg.showPending && agent.pending > 0 && cfg.primaryMetricKey !== 'pending' && (
                          <span>Pending: <span className="text-amber-400 font-semibold">{agent.pending}</span></span>
                        )}
                        {cfg.showAgentNet && agent.agentNetCommission > 0 && cfg.primaryMetricKey !== 'agentNet' && (
                          <span>Net: <span className="text-yellow-300 font-semibold">{fmtCompact(agent.agentNetCommission)}</span></span>
                        )}
                      </div>
                      <div className="mt-1.5 h-1.5 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full bg-gradient-to-r ${isTop ? 'from-yellow-400 to-orange-400' : 'from-blue-500 to-emerald-400'}`}
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>

                    {/* Primary metric value */}
                    <div className="flex-shrink-0 text-right">
                      <div className="text-2xl font-black text-white tabular-nums">{formatMetricValue(primaryVal, cfg.primaryMetricKey)}</div>
                      <div className="text-xs text-white/50">{getMetricLabel(cfg.primaryMetricKey)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Coming Soon Section ──────────────────────────────────────────────────────

function ComingSoonSection({ items, loading, active }: { items: ComingSoonListing[]; loading: boolean; active: boolean }) {
  const { containerRef, innerRef } = useAutoScroll(items, active);
  const cards = [...items, ...items];

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 flex items-center gap-3 px-8 py-5 bg-gray-900 border-b border-white/10">
        <div className="w-12 h-12 rounded-2xl bg-purple-500/20 flex items-center justify-center">
          <Clock className="h-6 w-6 text-purple-400" />
        </div>
        <div>
          <h2 className="text-3xl font-extrabold text-white tracking-tight">Coming Soon</h2>
          <p className="text-gray-400 text-sm">Properties hitting the market soon — contact agent for details</p>
        </div>
        <div className="ml-auto bg-purple-500/20 text-purple-300 text-sm font-bold px-3 py-1 rounded-full">
          {items.length} listing{items.length !== 1 ? 's' : ''}
        </div>
      </div>
      <div ref={containerRef} className="flex-1 overflow-hidden px-8 py-6" style={{ scrollBehavior: 'auto' }}>
        {loading ? (
          <div className="flex items-center justify-center h-full"><div className="text-gray-400 text-2xl animate-pulse">Loading…</div></div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <Clock className="h-20 w-20 text-gray-700" />
            <p className="text-gray-500 text-3xl font-semibold">No Coming Soon Listings</p>
            <p className="text-gray-600 text-lg">Post a coming soon listing from the dashboard</p>
          </div>
        ) : (
          <div ref={innerRef}>
            <div className="grid grid-cols-2 gap-5">
              {cards.map((item, i) => (
                <div key={`${item.id}-${i}`} className="bg-gray-900 border border-white/10 rounded-2xl p-5 flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 text-purple-400 font-bold text-xl">
                        <MapPin className="h-5 w-5" />{item.address || item.area}
                      </div>
                      {item.address && item.address !== item.area && <div className="text-gray-400 text-sm mt-0.5">{item.area}</div>}
                      {item.price && <div className="text-white text-3xl font-bold mt-1">{fmt$(item.price)}</div>}
                    </div>
                    <div className="flex-shrink-0 bg-purple-500/10 border border-purple-500/20 rounded-xl px-4 py-2 text-center">
                      <div className="text-purple-400 text-xs font-semibold uppercase">Coming Soon</div>
                      {item.expectedDate ? <div className="text-white font-bold text-sm">{fmtDate(item.expectedDate)}</div> : <div className="text-gray-400 text-sm">TBD</div>}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-gray-300 text-sm">
                    {item.beds && <span className="flex items-center gap-1"><Bed className="h-4 w-4 text-gray-500" />{item.beds} bd</span>}
                    {item.baths && <span className="flex items-center gap-1"><Bath className="h-4 w-4 text-gray-500" />{item.baths} ba</span>}
                    {item.sqft && <span className="flex items-center gap-1"><Square className="h-4 w-4 text-gray-500" />{item.sqft.toLocaleString()} sqft</span>}
                    {item.acreage && <span className="text-gray-400">🌿 {item.acreage} ac</span>}
                    {item.stories && <span className="flex items-center gap-1"><Building2 className="h-4 w-4 text-gray-500" />{item.stories} story</span>}
                    {item.pool && <span className="flex items-center gap-1 bg-cyan-500/10 text-cyan-400 px-2 py-0.5 rounded-full text-xs font-semibold"><Droplets className="h-3 w-3" />Pool</span>}
                    {item.generator && <span className="flex items-center gap-1 bg-yellow-500/10 text-yellow-400 px-2 py-0.5 rounded-full text-xs font-semibold"><Zap className="h-3 w-3" />Generator</span>}
                  </div>
                  {item.otherAmenities && <p className="text-gray-400 text-sm">Amenities: {item.otherAmenities}</p>}
                  {item.notes && <p className="text-gray-200 text-sm leading-relaxed line-clamp-2 border-l-2 border-purple-500/50 pl-3 bg-purple-500/5 rounded-r py-1">{item.notes}</p>}
                  <div className="flex items-center gap-2 pt-2 border-t border-white/5">
                    <div className="w-9 h-9 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-400 font-bold text-base">{item.agentName.charAt(0)}</div>
                    <div>
                      <div className="text-white text-sm font-semibold">{item.agentName}</div>
                      <div className="text-gray-400 text-xs flex items-center gap-1"><Phone className="h-3 w-3" />{item.agentPhone}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Buyer Needs Section ──────────────────────────────────────────────────────

function BuyerNeedsSection({ items, loading, active }: { items: BuyerNeed[]; loading: boolean; active: boolean }) {
  const { containerRef, innerRef } = useAutoScroll(items, active);
  const cards = [...items, ...items];

  const fmtRange = (min?: number | null, max?: number | null) => {
    if (min && max) return `${fmt$(min)} – ${fmt$(max)}`;
    if (min) return `${fmt$(min)}+`;
    if (max) return `Up to ${fmt$(max)}`;
    return null;
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 flex items-center gap-3 px-8 py-5 bg-gray-900 border-b border-white/10">
        <div className="w-12 h-12 rounded-2xl bg-blue-500/20 flex items-center justify-center">
          <Users className="h-6 w-6 text-blue-400" />
        </div>
        <div>
          <h2 className="text-3xl font-extrabold text-white tracking-tight">Buyer Needs</h2>
          <p className="text-gray-400 text-sm">Active buyers looking for their perfect home</p>
        </div>
        <div className="ml-auto bg-blue-500/20 text-blue-300 text-sm font-bold px-3 py-1 rounded-full">
          {items.length} buyer{items.length !== 1 ? 's' : ''}
        </div>
      </div>
      <div ref={containerRef} className="flex-1 overflow-hidden px-8 py-6" style={{ scrollBehavior: 'auto' }}>
        {loading ? (
          <div className="flex items-center justify-center h-full"><div className="text-gray-400 text-2xl animate-pulse">Loading…</div></div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <Users className="h-20 w-20 text-gray-700" />
            <p className="text-gray-500 text-3xl font-semibold">No Active Buyer Needs</p>
            <p className="text-gray-600 text-lg">Post a buyer need from the dashboard</p>
          </div>
        ) : (
          <div ref={innerRef}>
            <div className="grid grid-cols-2 gap-5">
              {cards.map((item, i) => (
                <div key={`${item.id}-${i}`} className="bg-gray-900 border border-white/10 rounded-2xl p-5 flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 text-blue-400 font-bold text-xl">
                        <MapPin className="h-5 w-5" />{item.area}
                      </div>
                      {fmtRange(item.minPrice, item.maxPrice) && (
                        <div className="text-white text-3xl font-bold mt-1">{fmtRange(item.minPrice, item.maxPrice)}</div>
                      )}
                    </div>
                    <div className="flex-shrink-0 bg-blue-500/10 border border-blue-500/20 rounded-xl px-4 py-2 text-center">
                      <div className="text-blue-400 text-xs font-semibold uppercase">Buyer Need</div>
                      <div className="text-white font-bold text-sm mt-0.5">Active</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-gray-300 text-sm">
                    {item.beds && <span className="flex items-center gap-1"><Bed className="h-4 w-4 text-gray-500" />{item.beds}+ bd</span>}
                    {item.baths && <span className="flex items-center gap-1"><Bath className="h-4 w-4 text-gray-500" />{item.baths}+ ba</span>}
                    {(item.minAcreage || item.maxAcreage) && <span className="text-gray-400">🌿 {item.minAcreage || 0}–{item.maxAcreage || '+'} ac</span>}
                    {item.stories && <span className="flex items-center gap-1"><Building2 className="h-4 w-4 text-gray-500" />{item.stories} story</span>}
                    {item.pool && <span className="flex items-center gap-1 bg-cyan-500/10 text-cyan-400 px-2 py-0.5 rounded-full text-xs font-semibold"><Droplets className="h-3 w-3" />Pool</span>}
                    {item.generator && <span className="flex items-center gap-1 bg-yellow-500/10 text-yellow-400 px-2 py-0.5 rounded-full text-xs font-semibold"><Zap className="h-3 w-3" />Generator</span>}
                  </div>
                  {item.otherAmenities && <p className="text-gray-400 text-sm">Needs: {item.otherAmenities}</p>}
                  {item.notes && <p className="text-gray-200 text-sm leading-relaxed line-clamp-2 border-l-2 border-blue-500/50 pl-3 bg-blue-500/5 rounded-r py-1">{item.notes}</p>}
                  <div className="flex items-center gap-2 pt-2 border-t border-white/5">
                    <div className="w-9 h-9 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 font-bold text-base">{item.agentName.charAt(0)}</div>
                    <div>
                      <div className="text-white text-sm font-semibold">{item.agentName}</div>
                      <div className="text-gray-400 text-xs flex items-center gap-1"><Phone className="h-3 w-3" />{item.agentPhone}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Open Houses Section ──────────────────────────────────────────────────────

function OpenHousesSection({ items, loading, active }: { items: OpenHouseListing[]; loading: boolean; active: boolean }) {
  const { containerRef, innerRef } = useAutoScroll(items, active);
  const cards = [...items, ...items];

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 flex items-center gap-3 px-8 py-5 bg-gray-900 border-b border-white/10">
        <div className="w-12 h-12 rounded-2xl bg-orange-500/20 flex items-center justify-center">
          <Home className="h-6 w-6 text-orange-400" />
        </div>
        <div>
          <h2 className="text-3xl font-extrabold text-white tracking-tight">Open House Opportunities</h2>
          <p className="text-gray-400 text-sm">Open house opportunities available for agents to claim</p>
        </div>
        <div className="ml-auto bg-orange-500/20 text-orange-300 text-sm font-bold px-3 py-1 rounded-full">
          {items.length} opportunit{items.length !== 1 ? 'ies' : 'y'}
        </div>
      </div>
      <div ref={containerRef} className="flex-1 overflow-hidden px-8 py-6" style={{ scrollBehavior: 'auto' }}>
        {loading ? (
          <div className="flex items-center justify-center h-full"><div className="text-gray-400 text-2xl animate-pulse">Loading…</div></div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <Home className="h-20 w-20 text-gray-700" />
            <p className="text-gray-500 text-3xl font-semibold">No Open House Opportunities Posted</p>
            <p className="text-gray-600 text-lg">Post an open house opportunity from the dashboard</p>
          </div>
        ) : (
          <div ref={innerRef}>
            <div className="grid grid-cols-2 gap-5">
              {cards.map((item, i) => (
                <div key={`${item.id}-${i}`} className="bg-gray-900 border border-white/10 rounded-2xl p-5 flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 text-orange-400 font-bold text-xl">
                        <MapPin className="h-5 w-5" />{item.address}
                      </div>
                      {item.price && <div className="text-white text-3xl font-bold mt-1">{fmt$(item.price)}</div>}
                    </div>
                    <div className="flex-shrink-0 bg-orange-500/10 border border-orange-500/20 rounded-xl px-4 py-2 text-center min-w-[130px]">
                      {item.claimedByName ? (
                        <div className="text-green-400 text-xs font-semibold uppercase">✓ Claimed</div>
                      ) : (
                        <div className="text-orange-400 text-xs font-semibold uppercase">Available</div>
                      )}
                      {item.openHouseDate && <div className="text-white font-bold text-sm">{fmtDate(item.openHouseDate)}</div>}
                      {item.openHouseTime && <div className="text-gray-300 text-xs">{item.openHouseTime}{item.openHouseEndTime ? ` – ${item.openHouseEndTime}` : ''}</div>}
                      {item.compensation && item.compensation > 0 && (
                        <div className="text-yellow-300 text-xs font-bold mt-1">💵 ${item.compensation}</div>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-gray-300 text-sm">
                    {item.beds && <span className="flex items-center gap-1"><Bed className="h-4 w-4 text-gray-500" />{item.beds} bd</span>}
                    {item.baths && <span className="flex items-center gap-1"><Bath className="h-4 w-4 text-gray-500" />{item.baths} ba</span>}
                    {item.sqft && <span className="flex items-center gap-1"><Square className="h-4 w-4 text-gray-500" />{item.sqft.toLocaleString()} sqft</span>}
                  </div>
                  {item.notes && <p className="text-gray-200 text-sm leading-relaxed line-clamp-2 border-l-2 border-orange-500/50 pl-3 bg-orange-500/5 rounded-r py-1">{item.notes}</p>}
                  <div className="flex items-center gap-2 pt-2 border-t border-white/5">
                    <div className="w-9 h-9 rounded-full bg-orange-500/20 flex items-center justify-center text-orange-400 font-bold text-base">{item.agentName.charAt(0)}</div>
                    <div className="flex-1">
                      <div className="text-white text-sm font-semibold">{item.agentName}</div>
                      <div className="text-gray-400 text-xs flex items-center gap-1"><Phone className="h-3 w-3" />{item.agentPhone}</div>
                    </div>
                    {item.claimedByName && (
                      <div className="text-right">
                        <div className="text-green-400 text-xs font-semibold">✓ {item.claimedByName}</div>
                        {item.claimedByPhone && <div className="text-gray-500 text-xs">{item.claimedByPhone}</div>}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Competition Section (embeds the public competition scoreboard) ──────────

type CompStanding = {
  agentId: string; displayName: string; position: number;
  totalScore: number; todayScore: number; scoreLabel: string;
  color: string; metricTotal: number; metricToday: number;
  distanceFromLeader: number; movement: number; streak: number;
  bonusesApplied: { label: string; score: number }[];
  groupId?: string;
};

type CompConfig = {
  name: string; theme: 'nascar' | 'golf' | 'horse_race';
  status: string; startDate: string; endDate: string;
  metric: string; metricLabel?: string; scoringStrategy: string;
  rankingDirection: 'asc' | 'desc';
  prizes?: { place: number; label: string; amount: number }[];
  autoRefreshSeconds?: number; showTopN?: number;
};

const COMP_THEME = {
  nascar:     { icon: '🏎️', accent: 'text-red-400',     accentBg: 'bg-red-500/20',     header: 'from-red-900/40 to-gray-900' },
  golf:       { icon: '⛳',  accent: 'text-emerald-400', accentBg: 'bg-emerald-500/20', header: 'from-emerald-900/40 to-gray-900' },
  horse_race: { icon: '🐎',  accent: 'text-purple-400',  accentBg: 'bg-purple-500/20',  header: 'from-purple-900/40 to-gray-900' },
};

const COMP_GRAD = ['from-yellow-400 to-orange-500','from-blue-400 to-violet-600','from-emerald-400 to-cyan-500','from-rose-400 to-pink-600','from-amber-400 to-red-500','from-indigo-400 to-purple-600'];

function CompetitionSection({ competitionId, active }: { competitionId: string | null; active: boolean }) {
  const [standings, setStandings] = useState<CompStanding[]>([]);
  const [config, setConfig] = useState<CompConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const cContainerRef = useRef<HTMLDivElement>(null);
  const cInnerRef = useRef<HTMLDivElement>(null);
  const cAnimRef = useRef<number | null>(null);
  const cPosRef = useRef(0);

  const loadComp = useCallback(async () => {
    if (!competitionId) { setLoading(false); return; }
    try {
      const res = await fetch(`/api/competitions/${competitionId}/standings?public=true`);
      const json = await res.json();
      if (json.ok) { setConfig(json.competition.config); setStandings(json.standings || []); }
    } catch {}
    finally { setLoading(false); }
  }, [competitionId]);

  useEffect(() => { loadComp(); }, [loadComp]);

  useEffect(() => {
    if (!competitionId) return;
    const t = setInterval(loadComp, (config?.autoRefreshSeconds ?? 30) * 1000);
    return () => clearInterval(t);
  }, [competitionId, config?.autoRefreshSeconds, loadComp]);

  useEffect(() => {
    const container = cContainerRef.current;
    const inner = cInnerRef.current;
    if (!container || !inner || standings.length === 0 || !active) return;
    cPosRef.current = 0;
    container.scrollTop = 0;
    const SPEED = 25;
    let lastTime: number | null = null;
    let pauseUntil = 0;
    const step = (ts: number) => {
      if (!container || !inner) return;
      if (lastTime === null) lastTime = ts;
      const dt = (ts - lastTime) / 1000; lastTime = ts;
      const contentH = inner.scrollHeight / 2;
      const containerH = container.clientHeight;
      if (contentH <= containerH) { cPosRef.current = 0; container.scrollTop = 0; cAnimRef.current = requestAnimationFrame(step); return; }
      if (ts < pauseUntil) { cAnimRef.current = requestAnimationFrame(step); return; }
      cPosRef.current += SPEED * dt;
      if (cPosRef.current >= contentH) { cPosRef.current = 0; pauseUntil = ts + 3000; }
      container.scrollTop = cPosRef.current;
      cAnimRef.current = requestAnimationFrame(step);
    };
    cAnimRef.current = requestAnimationFrame(step);
    return () => { if (cAnimRef.current) cancelAnimationFrame(cAnimRef.current); };
  }, [standings, active]);

  if (!competitionId || (!loading && !config)) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6 bg-gray-950">
        <div className="text-6xl">🏆</div>
        <h2 className="text-4xl font-black text-white">No Competition Pinned</h2>
        <p className="text-gray-400 text-xl">Go to TV Settings to pin an active competition.</p>
      </div>
    );
  }

  const theme = COMP_THEME[config?.theme ?? 'nascar'];
  const isGolf = config?.theme === 'golf';
  const showTopN = config?.showTopN ?? 20;
  const visible = standings.slice(0, showTopN);
  const doubled = [...visible, ...visible];
  const fmtScore = (s: number) => isGolf ? (s === 0 ? 'E' : s > 0 ? `+${s}` : `${s}`) : s.toLocaleString();

  return (
    <div className="flex flex-col h-full bg-gray-950">
      <div className={`flex-shrink-0 flex items-center gap-4 px-8 py-5 border-b border-white/10 bg-gradient-to-r ${theme.header}`}>
        <div className={`w-14 h-14 rounded-2xl ${theme.accentBg} flex items-center justify-center text-3xl`}>{theme.icon}</div>
        <div className="flex-1 min-w-0">
          <h2 className="text-3xl font-extrabold text-white tracking-tight truncate">{config?.name ?? 'Competition'}</h2>
          <p className="text-gray-400 text-sm">{config?.metricLabel || config?.metric} · {standings.length} participants</p>
        </div>
        <div className="flex items-center gap-3">
          {standings.slice(0, 3).map((s, i) => (
            <div key={s.agentId} className={`text-center px-3 py-2 rounded-xl border ${
              i === 0 ? 'border-yellow-400/30 bg-yellow-500/10' : i === 1 ? 'border-slate-400/20 bg-white/5' : 'border-amber-700/20 bg-white/5'
            }`}>
              <div className="text-xs text-gray-400 mb-0.5">{['🥇','🥈','🥉'][i]}</div>
              <div className="text-white text-sm font-bold truncate max-w-[80px]">{s.displayName.split(' ')[0]}</div>
              <div className={`text-sm font-black ${i === 0 ? 'text-yellow-400' : theme.accent}`}>{fmtScore(s.totalScore)}</div>
            </div>
          ))}
        </div>
      </div>
      <div ref={cContainerRef} className="flex-1 overflow-hidden" style={{ scrollBehavior: 'auto' }}>
        {loading ? (
          <div className="flex items-center justify-center h-full text-gray-400 text-2xl animate-pulse">Loading standings…</div>
        ) : standings.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <Trophy className="h-20 w-20 text-gray-700" />
            <p className="text-gray-500 text-3xl font-semibold">No standings yet</p>
          </div>
        ) : (
          <div ref={cInnerRef} className="px-8 py-4 space-y-2">
            {doubled.map((s, i) => {
              const idx = i % visible.length;
              const isTop = idx === 0;
              return (
                <div key={`${s.agentId}-${i}`} className={`flex items-center gap-4 px-6 py-4 rounded-2xl border ${
                  isTop ? 'border-yellow-400/40 bg-yellow-500/8' : 'border-white/6 bg-white/2'
                }`}>
                  <div className="w-10 flex-shrink-0 text-center">
                    {isTop ? <Crown className="h-7 w-7 mx-auto text-yellow-400" /> : <span className="text-xl font-bold text-gray-500">#{s.position}</span>}
                  </div>
                  <div className={`w-11 h-11 rounded-full flex-shrink-0 flex items-center justify-center text-white font-bold text-xl bg-gradient-to-br ${COMP_GRAD[idx % COMP_GRAD.length]}`}>
                    {s.displayName.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-white font-bold text-lg truncate">{s.displayName}</div>
                    <div className="text-gray-400 text-xs">{config?.metricLabel || config?.metric}: {s.metricTotal}</div>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <div className={`text-2xl font-black ${isTop ? 'text-yellow-400' : theme.accent}`}>{fmtScore(s.totalScore)}</div>
                    {s.movement !== 0 && (
                      <div className={`text-xs font-bold ${s.movement > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {s.movement > 0 ? '↑' : '↓'}{Math.abs(s.movement)}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Agent Help Section ─────────────────────────────────────────────────────

const HELP_TYPE_LABELS: Record<string, string> = {
  showing: 'Showing',
  inspection: 'Inspection',
  closing: 'Closing',
  open_house: 'Open House',
  other: 'Other',
};

function AgentHelpSection({ items, loading, active }: { items: AgentHelpItem[]; loading: boolean; active: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number | null>(null);
  const posRef = useRef(0);

  useEffect(() => {
    const container = containerRef.current;
    const inner = innerRef.current;
    if (!container || !inner || items.length === 0 || !active) return;
    posRef.current = 0;
    container.scrollTop = 0;
    const SPEED = 20;
    let lastTime: number | null = null;
    let pauseUntil = 0;
    const step = (ts: number) => {
      if (!container || !inner) return;
      if (lastTime === null) lastTime = ts;
      const dt = ts - lastTime; lastTime = ts;
      if (ts < pauseUntil) { animRef.current = requestAnimationFrame(step); return; }
      const maxScroll = inner.scrollHeight - container.clientHeight;
      if (maxScroll <= 0) return;
      posRef.current += (SPEED * dt) / 1000;
      if (posRef.current >= maxScroll) { posRef.current = maxScroll; pauseUntil = ts + 2000; }
      container.scrollTop = posRef.current;
      animRef.current = requestAnimationFrame(step);
    };
    animRef.current = requestAnimationFrame(step);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [items, active]);

  function fmtDate(d?: string | null) {
    if (!d) return null;
    try { return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); } catch { return d; }
  }

  return (
    <div className="w-full h-full flex flex-col bg-gradient-to-b from-teal-900/30 to-gray-950">
      {/* Header */}
      <div className="flex-shrink-0 px-8 py-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-500/20 flex items-center justify-center">
            <Users className="h-5 w-5 text-teal-400" />
          </div>
          <div>
            <h2 className="text-white text-xl font-bold tracking-tight">Agent Help Needed</h2>
            <p className="text-gray-400 text-sm">Agents seeking help with showings, inspections &amp; more</p>
          </div>
          <div className="ml-auto text-teal-400 text-sm font-semibold">{items.length} request{items.length !== 1 ? 's' : ''}</div>
        </div>
      </div>

      {/* Content */}
      <div ref={containerRef} className="flex-1 overflow-hidden px-8 py-4">
        {loading ? (
          <div className="flex items-center justify-center h-full"><div className="text-gray-400 text-lg">Loading...</div></div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <Users className="h-12 w-12 text-gray-600" />
            <p className="text-gray-400 text-lg">No help requests right now</p>
          </div>
        ) : (
          <div ref={innerRef} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pb-4">
            {items.map((item) => (
              <div key={item.id} className="bg-gray-800/60 border border-white/10 rounded-2xl p-4 flex flex-col gap-3">
                {/* Type badge + date */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <span className="inline-block bg-teal-500/20 text-teal-300 text-xs font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">
                      {HELP_TYPE_LABELS[item.helpType] ?? item.helpType}
                    </span>
                    {item.propertyAddress && (
                      <p className="text-white text-sm font-semibold mt-1 leading-tight">{item.propertyAddress}</p>
                    )}
                  </div>
                  {item.needDate && (
                    <div className="flex-shrink-0 bg-teal-500/10 border border-teal-500/20 rounded-xl px-3 py-1.5 text-center">
                      <div className="text-teal-400 text-xs font-semibold uppercase">Needed</div>
                      <div className="text-white font-bold text-sm">{fmtDate(item.needDate)}</div>
                      {item.needTime && <div className="text-gray-300 text-xs">{item.needTime}</div>}
                    </div>
                  )}
                </div>

                {/* Description */}
                {item.description && (
                  <p className="text-gray-200 text-sm leading-relaxed line-clamp-3 border-l-2 border-teal-500/50 pl-3 bg-teal-500/5 rounded-r py-1">{item.description}</p>
                )}

                {/* Compensation */}
                {item.compensation && item.compensation > 0 && (
                  <div className="flex items-center gap-1.5 text-yellow-300 text-sm font-semibold">
                    <DollarSign className="h-4 w-4" />
                    ${item.compensation.toLocaleString()} compensation
                    {item.compensationNote && <span className="text-gray-400 font-normal text-xs">· {item.compensationNote}</span>}
                  </div>
                )}

                {/* Claimed / Agent */}
                <div className="flex items-center gap-2 pt-2 border-t border-white/5 mt-auto">
                  <div className="w-9 h-9 rounded-full bg-teal-500/20 flex items-center justify-center text-teal-400 font-bold text-base">{item.agentName.charAt(0)}</div>
                  <div className="flex-1">
                    <div className="text-white text-sm font-semibold">{item.agentName}</div>
                    <div className="text-gray-400 text-xs flex items-center gap-1"><Phone className="h-3 w-3" />{item.agentPhone}</div>
                  </div>
                  {item.claimedByName && (
                    <div className="text-right">
                      <div className="text-green-400 text-xs font-semibold">✓ {item.claimedByName}</div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Community Board ─────────────────────────────────────────────────────

export default function CommunityBoardPage() {
  const [comingSoon, setComingSoon] = useState<ComingSoonListing[]>([]);
  const [buyerNeeds, setBuyerNeeds] = useState<BuyerNeed[]>([]);
  const [openHouses, setOpenHouses] = useState<OpenHouseListing[]>([]);
  const [agentHelp, setAgentHelp] = useState<AgentHelpItem[]>([]);
  const [loadingCS, setLoadingCS] = useState(true);
  const [loadingBN, setLoadingBN] = useState(true);
  const [loadingOH, setLoadingOH] = useState(true);
  const [loadingAH, setLoadingAH] = useState(true);

  // Active sections list (from admin config)
  const [sections, setSections] = useState<string[]>(DEFAULT_COMMUNITY_SECTIONS);
  const [currentSection, setCurrentSection] = useState(0);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [intervalSec, setIntervalSec] = useState(30);
  const [now, setNow] = useState(new Date());
  const [showControls, setShowControls] = useState(false);
  const [pinnedCompetitionId, setPinnedCompetitionId] = useState<string | null>(null);

  const progressRef = useRef(0);
  const startTimeRef = useRef(Date.now());
  const animRef = useRef<number | null>(null);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load TV config — interval + community section list + pinned competition
  useEffect(() => {
    fetch('/api/community/tv-config')
      .then((r) => r.json())
      .then((json) => {
        if (!json.ok) return;
        const cfg = json.config || {};
        if (cfg.communityBoardIntervalSeconds) setIntervalSec(cfg.communityBoardIntervalSeconds);
        else if (cfg.rotationIntervalSeconds) setIntervalSec(cfg.rotationIntervalSeconds);
        // communitySections is the ordered list of section IDs to show
        if (Array.isArray(cfg.communitySections) && cfg.communitySections.length > 0) {
          setSections(cfg.communitySections);
        }
        if (cfg.pinnedCompetitionId) setPinnedCompetitionId(cfg.pinnedCompetitionId);
      })
      .catch(() => {});
  }, []);

  // Load community data
  useEffect(() => {
    const loadAll = () => {
      fetch('/api/community/coming-soon').then(r => r.json()).then(d => { if (d.ok) setComingSoon(d.items || []); }).catch(() => {}).finally(() => setLoadingCS(false));
      fetch('/api/community/buyer-needs').then(r => r.json()).then(d => { if (d.ok) setBuyerNeeds(d.items || []); }).catch(() => {}).finally(() => setLoadingBN(false));
      fetch('/api/community/open-houses').then(r => r.json()).then(d => { if (d.ok) setOpenHouses(d.items || []); }).catch(() => {}).finally(() => setLoadingOH(false));
      fetch('/api/community/agent-help').then(r => r.json()).then(d => { if (d.ok) setAgentHelp(d.items || []); }).catch(() => {}).finally(() => setLoadingAH(false));
    };
    loadAll();
    const interval = setInterval(loadAll, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Clock
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Progress bar + auto-advance
  const intervalMs = intervalSec * 1000;

  const goNext = useCallback(() => {
    setCurrentSection(i => (i + 1) % sections.length);
    startTimeRef.current = Date.now();
    progressRef.current = 0;
    setProgress(0);
  }, [sections.length]);

  const goPrev = useCallback(() => {
    setCurrentSection(i => (i - 1 + sections.length) % sections.length);
    startTimeRef.current = Date.now();
    progressRef.current = 0;
    setProgress(0);
  }, [sections.length]);

  useEffect(() => {
    if (paused) return;
    startTimeRef.current = Date.now();
    const tick = () => {
      const elapsed = Date.now() - startTimeRef.current;
      const pct = Math.min((elapsed / intervalMs) * 100, 100);
      setProgress(pct);
      if (elapsed >= intervalMs) goNext();
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [paused, intervalMs, goNext, currentSection]);

  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = setTimeout(() => setShowControls(false), 3000);
  };

  const activeSectionId = sections[currentSection] ?? 'activity';
  const activeDef = ALL_SECTION_DEFS[activeSectionId] ?? ALL_SECTION_DEFS['activity'];

  return (
    <div
      className="relative bg-gray-950 text-white"
      style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}
      onMouseMove={handleMouseMove}
    >
      {/* Progress bar */}
      <div className="absolute top-0 left-0 right-0 h-1.5 bg-white/10 z-50">
        <div
          className={`h-full transition-none ${activeDef.color}`}
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Section content */}
      <div className="w-full h-full">
        {activeSectionId === 'activity'    && <ActivityBoardSection active={activeSectionId === 'activity'} />}
        {activeSectionId === 'leaderboard' && <LeaderboardSection active={activeSectionId === 'leaderboard'} />}
        {activeSectionId === 'coming-soon' && <ComingSoonSection items={comingSoon} loading={loadingCS} active={activeSectionId === 'coming-soon'} />}
        {activeSectionId === 'buyer-needs' && <BuyerNeedsSection items={buyerNeeds} loading={loadingBN} active={activeSectionId === 'buyer-needs'} />}
        {activeSectionId === 'open-houses' && <OpenHousesSection items={openHouses} loading={loadingOH} active={activeSectionId === 'open-houses'} />}
        {activeSectionId === 'agent-help'  && <AgentHelpSection items={agentHelp} loading={loadingAH} active={activeSectionId === 'agent-help'} />}
        {activeSectionId === 'competition' && <CompetitionSection competitionId={pinnedCompetitionId} active={activeSectionId === 'competition'} />}
      </div>

      {/* Bottom: section dots + clock */}
      <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-8 py-3 bg-gray-900/80 backdrop-blur-sm border-t border-white/10 z-40">
        <div className="flex items-center gap-2 flex-wrap">
          {sections.map((sId, i) => {
            const def = ALL_SECTION_DEFS[sId];
            if (!def) return null;
            return (
              <button
                key={sId}
                onClick={() => { setCurrentSection(i); startTimeRef.current = Date.now(); setProgress(0); }}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold transition-all ${
                  i === currentSection
                    ? `${def.color} text-white shadow-lg`
                    : 'bg-white/10 text-white/50 hover:bg-white/20 hover:text-white'
                }`}
              >
                <div className={`w-2 h-2 rounded-full ${i === currentSection ? 'bg-white' : def.dot}`} />
                {def.label}
              </button>
            );
          })}
        </div>

        {/* Clock */}
        <div className="text-right">
          <div className="text-xl font-mono font-bold text-white">
            {now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
          </div>
          <div className="text-gray-400 text-xs">
            {now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </div>
        </div>
      </div>

      {/* Controls overlay */}
      <div className={`absolute inset-0 z-40 pointer-events-none transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0'}`}>
        <button
          onClick={goPrev}
          className="absolute left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors pointer-events-auto"
        >
          <ChevronLeft className="h-7 w-7" />
        </button>
        <button
          onClick={goNext}
          className="absolute right-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors pointer-events-auto"
        >
          <ChevronRight className="h-7 w-7" />
        </button>
        <button
          onClick={() => setPaused(p => !p)}
          className="absolute top-4 right-4 px-4 py-2 rounded-full bg-black/50 hover:bg-black/70 text-white text-sm font-semibold transition-colors pointer-events-auto flex items-center gap-2"
        >
          {paused ? '▶ Resume' : '⏸ Pause'}
        </button>
      </div>
    </div>
  );
}
