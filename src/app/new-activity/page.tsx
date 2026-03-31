'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Building, FileSignature, Home, AlertCircle, DollarSign, BarChart, Users } from 'lucide-react';
import React, { useState, useEffect } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
  }).format(amount);

const fmtCurrencyCompact = (n: number) =>
  n >= 1_000_000
    ? `$${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000
    ? `$${(n / 1_000).toFixed(0)}K`
    : `$${n.toFixed(0)}`;

const formatDate = (dateStr?: string) => {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
};

type YtdTotals = {
  totalVolume: number;
  totalSales: number;
  totalAgentCommissions: number;
};

type ActivityItem = {
  id: string;
  date: string;
  agentDisplayName: string;
  addressShort: string;
  price: number;
};

function TotalCard({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <Card className="bg-gray-800/40 border-gray-700">
      <CardContent className="p-4 sm:p-6 text-center">
        <Icon className="h-6 w-6 mx-auto mb-2 text-primary" />
        <div className="text-2xl sm:text-3xl font-bold">{value}</div>
        <div className="text-sm text-gray-400 mt-1">{label}</div>
      </CardContent>
    </Card>
  );
}

const ActivityColumn = ({
  title,
  items,
  icon: Icon,
  loading,
}: {
  title: string;
  items: ActivityItem[];
  icon: React.ElementType;
  loading: boolean;
}) => (
  <Card className="flex-1 bg-gray-800/50 border-gray-700">
    <CardHeader>
      <CardTitle className="flex items-center gap-3 text-2xl font-semibold text-gray-300">
        <Icon className="h-6 w-6 text-primary" />
        {title}
      </CardTitle>
    </CardHeader>
    <CardContent>
      {loading ? (
        <div className="space-y-4">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="grid grid-cols-3 gap-4 items-center border-b border-gray-700/50 pb-3 last:border-b-0"
            >
              <div className="col-span-1 space-y-2">
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-4 w-16" />
              </div>
              <div className="col-span-2 text-right space-y-2">
                <Skeleton className="h-6 w-32 ml-auto" />
                <Skeleton className="h-4 w-40 ml-auto" />
              </div>
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-10 text-gray-500">No new activity to report.</div>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <div
              key={item.id}
              className="grid grid-cols-3 gap-4 items-center border-b border-gray-700/50 pb-3 last:border-b-0"
            >
              <div className="col-span-1">
                <p className="font-semibold text-white">{item.agentDisplayName}</p>
                <p className="text-sm text-gray-400">{formatDate(item.date)}</p>
              </div>
              <div className="col-span-2 text-right">
                <p className="text-xl font-bold text-orange-400">{formatCurrency(item.price)}</p>
                <p className="text-sm text-gray-500 truncate">{item.addressShort}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </CardContent>
  </Card>
);

export default function NewActivityPage() {
  const [newListings, setNewListings] = useState<ActivityItem[]>([]);
  const [newContracts, setNewContracts] = useState<ActivityItem[]>([]);
  const [ytdTotals, setYtdTotals] = useState<YtdTotals | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    const selectedYear = new Date().getFullYear();

    fetch(`/api/rollups/new-activity?year=${selectedYear}`)
      .then((r) => r.json())
      .then((json) => {
        if (!json?.ok) {
          throw new Error(json?.error || 'Failed to load new activity');
        }
        setNewListings(Array.isArray(json.newListings) ? json.newListings : []);
        setNewContracts(Array.isArray(json.newContracts) ? json.newContracts : []);
        setYtdTotals(json.ytdTotals ?? null);
        setError(null);
      })
      .catch((err) => {
        console.error('Failed to fetch new activity data:', err);
        setError('Could not load new activity. Please try again later.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const currentYear = new Date().getFullYear();

  return (
    <div className="dark min-h-screen bg-gray-900 text-white p-4 sm:p-8 font-sans">
      <header className="text-center mb-8 flex items-center justify-center gap-4">
        <Building className="h-10 w-10 sm:h-12 sm:w-12 text-primary hidden sm:block" />
        <div>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-primary to-orange-400">
            Activity Board
          </h1>
          <p className="text-lg sm:text-xl text-gray-400 mt-1">
            New listings and contracts — last 60 days
          </p>
        </div>
      </header>

      {/* ── YTD Team Totals ─────────────────────────────────────────── */}
      {ytdTotals && !loading && (
        <div className="max-w-5xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <TotalCard
            icon={DollarSign}
            label={`Total Team Volume ${currentYear} YTD`}
            value={fmtCurrencyCompact(ytdTotals.totalVolume)}
          />
          <TotalCard
            icon={BarChart}
            label={`Total Sales ${currentYear} YTD`}
            value={ytdTotals.totalSales.toLocaleString()}
          />
          <TotalCard
            icon={Users}
            label={`Total Commissions Paid to Agents ${currentYear} YTD`}
            value={fmtCurrencyCompact(ytdTotals.totalAgentCommissions)}
          />
        </div>
      )}

      <main className="max-w-screen-2xl mx-auto flex flex-col lg:flex-row gap-8">
        {error ? (
          <Alert
            variant="destructive"
            className="w-full bg-red-900/50 border-red-700 text-red-300"
          >
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : (
          <>
            <ActivityColumn
              title="Recent Sold"
              items={newListings}
              icon={Home}
              loading={loading}
            />
            <ActivityColumn
              title="New Contracts"
              items={newContracts}
              icon={FileSignature}
              loading={loading}
            />
          </>
        )}
      </main>

      <footer className="text-center mt-12 text-gray-600">
        {loading ? <p>Loading...</p> : <p>Data updates automatically from the transaction ledger</p>}
      </footer>
    </div>
  );
}
