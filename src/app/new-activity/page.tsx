'use client';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, Building, DollarSign, BarChart, Users, TrendingUp } from 'lucide-react';
import React, { useState, useEffect, useRef } from 'react';

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

const fmtCurrencyCompact = (n: number) => {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
};

const fmtCurrencyFull = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

const formatDate = (dateStr: string) => {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

function ScrollingColumn({
  title,
  items,
  loading,
  accentColor,
  icon: Icon,
}: {
  title: string;
  items: ActivityItem[];
  loading: boolean;
  accentColor: string;
  icon: React.ElementType;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number | null>(null);
  const posRef = useRef(0);

  useEffect(() => {
    const container = containerRef.current;
    const inner = innerRef.current;
    if (!container || !inner) return;

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
        pauseUntil = ts + 3000;
      }

      container.scrollTop = posRef.current;
      animRef.current = requestAnimationFrame(step);
    };

    animRef.current = requestAnimationFrame(step);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [items]);

  const renderRow = (item: ActivityItem, idx: number) => (
    <div
      key={idx}
      className="flex items-center justify-between py-3 px-4 border-b border-white/10 last:border-b-0"
    >
      <div className="flex-1 min-w-0 pr-4">
        <p className="text-white font-bold text-lg leading-tight truncate">{item.agentDisplayName}</p>
        <p className="text-gray-400 text-sm mt-0.5 truncate">{item.addressShort || '—'}</p>
        <p className="text-gray-500 text-xs mt-0.5">{formatDate(item.date)}</p>
      </div>
      <div className="flex-shrink-0 text-right">
        <p className={`text-xl font-black tabular-nums ${accentColor}`}>{fmtCurrencyFull(item.price)}</p>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-gray-800/40 rounded-2xl border border-white/10 overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-white/10 flex-shrink-0">
        <Icon className={`h-6 w-6 ${accentColor} flex-shrink-0`} />
        <h2 className="text-xl font-bold text-white tracking-wide uppercase">{title}</h2>
        <span className="ml-auto bg-white/10 text-white/70 text-sm font-semibold px-2.5 py-0.5 rounded-full">
          {loading ? '…' : items.length}
        </span>
      </div>
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden"
        style={{ scrollBehavior: 'auto' }}
      >
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-pulse text-gray-500 text-lg">Loading…</div>
          </div>
        ) : items.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-600 text-lg">No recent activity</p>
          </div>
        ) : (
          <div ref={innerRef}>
            {items.map((item, idx) => renderRow(item, idx))}
            {items.map((item, idx) => renderRow(item, idx + items.length))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 bg-white/5 rounded-xl px-4 py-3 flex-1">
      <Icon className="h-7 w-7 text-primary flex-shrink-0" />
      <div className="min-w-0">
        <p className="text-gray-400 text-xs font-medium truncate">{label}</p>
        <p className="text-white text-xl font-black tabular-nums">{value}</p>
      </div>
    </div>
  );
}

function LiveClock({ lastUpdated }: { lastUpdated: Date | null }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="flex-shrink-0 text-right">
      <p className="text-white text-2xl font-black tabular-nums">
        {now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </p>
      <p className="text-gray-500 text-xs">
        {now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
      </p>
      {lastUpdated && (
        <p className="text-gray-600 text-xs">
          Updated {lastUpdated.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
        </p>
      )}
    </div>
  );
}

export default function NewActivityPage() {
  const [newActiveListings, setNewActiveListings] = useState<ActivityItem[]>([]);
  const [underContracts, setUnderContracts] = useState<ActivityItem[]>([]);
  const [recentSold, setRecentSold] = useState<ActivityItem[]>([]);
  const [ytdTotals, setYtdTotals] = useState<YtdTotals | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadData = () => {
    const selectedYear = new Date().getFullYear();
    fetch(`/api/rollups/new-activity?year=${selectedYear}`)
      .then((r) => r.json())
      .then((json) => {
        if (!json?.ok) throw new Error(json?.error || 'Failed to load new activity');
        setNewActiveListings(Array.isArray(json.newActiveListings) ? json.newActiveListings : []);
        setUnderContracts(Array.isArray(json.underContracts) ? json.underContracts : []);
        setRecentSold(Array.isArray(json.recentSold) ? json.recentSold : []);
        setYtdTotals(json.ytdTotals ?? null);
        setLastUpdated(new Date());
        setError(null);
      })
      .catch((err) => {
        console.error('Failed to fetch new activity data:', err);
        setError('Could not load activity data.');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, []);
  useEffect(() => {
    const interval = setInterval(loadData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const currentYear = new Date().getFullYear();

  return (
    <div
      className="dark bg-gray-900 text-white font-sans"
      style={{ height: '100vh', width: '100vw', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
    >
      {/* Header */}
      <header className="flex-shrink-0 flex items-center justify-between px-8 py-4 border-b border-white/10">
        <div className="flex items-center gap-4">
          <Building className="h-10 w-10 text-primary" />
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-primary to-orange-400 leading-none">
              Activity Board
            </h1>
            <p className="text-gray-400 text-sm mt-0.5">New listings · Under contract · Recent sold — last 60 days</p>
          </div>
        </div>
        {ytdTotals && !loading && (
          <div className="flex items-center gap-3">
            <StatCard icon={DollarSign} label={`${currentYear} YTD Volume`} value={fmtCurrencyCompact(ytdTotals.totalVolume)} />
            <StatCard icon={BarChart} label={`${currentYear} YTD Sales`} value={ytdTotals.totalSales.toLocaleString()} />
            <StatCard icon={TrendingUp} label={`${currentYear} YTD Commissions`} value={fmtCurrencyCompact(ytdTotals.totalAgentCommissions)} />
          </div>
        )}
        <LiveClock lastUpdated={lastUpdated} />
      </header>

      {/* Columns */}
      <main className="flex-1 min-h-0 flex gap-4 px-6 py-4">
        {error ? (
          <Alert variant="destructive" className="w-full bg-red-900/50 border-red-700 text-red-300">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : (
          <>
            <ScrollingColumn title="New Listings" items={newActiveListings} loading={loading} accentColor="text-emerald-400" icon={BarChart} />
            <ScrollingColumn title="Under Contract" items={underContracts} loading={loading} accentColor="text-yellow-400" icon={Users} />
            <ScrollingColumn title="Recent Sold" items={recentSold} loading={loading} accentColor="text-orange-400" icon={DollarSign} />
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="flex-shrink-0 border-t border-white/10 px-8 py-2 flex items-center justify-between text-xs text-gray-600">
        <span>Data refreshes automatically every 5 minutes</span>
        <span>Keaty Real Estate</span>
      </footer>
    </div>
  );
}
