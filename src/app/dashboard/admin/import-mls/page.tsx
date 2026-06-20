'use client';
// /dashboard/admin/import-mls
// MLS Historical Data Upload page
// Accepts CSV with year, month (optional), salesCount, salesVolume
// Displays Tier 1 (confirmed) vs Tier 2 (estimated) results after upload

import React, { useState, useRef, useCallback } from 'react';
import { useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Upload, FileText, CheckCircle2, AlertCircle, Info,
  TrendingUp, BarChart3, DollarSign, Download,
} from 'lucide-react';
import { cn } from '@/lib/utils';

function fmt(n: number, prefix = '') {
  if (!n) return '—';
  if (n >= 1_000_000) return `${prefix}${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${prefix}${(n / 1_000).toFixed(0)}K`;
  return `${prefix}${n.toLocaleString()}`;
}

const SAMPLE_CSV = `year,month,salesCount,salesVolume
2022,,180,72000000
2023,,210,88000000
2024,,195,82000000
2025,1,18,7200000
2025,2,14,5600000
2025,3,22,9100000`;

export default function ImportMLSPage() {
  const { user } = useUser();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(async (file: File) => {
    if (!user) return;
    setError(null);
    setResults(null);
    setUploading(true);
    try {
      const token = await user.getIdToken();
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/admin/import-mls', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? 'Upload failed');
        toast({ title: 'Upload failed', description: data.error, variant: 'destructive' });
      } else {
        setResults(data);
        toast({
          title: `${data.yearsImported} year${data.yearsImported !== 1 ? 's' : ''} imported`,
          description: 'MLS historical data saved successfully.',
        });
      }
    } catch (err: any) {
      setError(err.message ?? 'Upload failed');
      toast({ title: 'Upload failed', variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  }, [user, toast]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const downloadSample = () => {
    const blob = new Blob([SAMPLE_CSV], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mls_historical_sample.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 py-2">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">MLS Historical Data Import</h1>
        <p className="text-muted-foreground mt-1">
          Upload your MLS export to populate historical production charts.
          Volume and sales count are stored as confirmed data; GCI and margin are estimated from your plan assumptions.
        </p>
      </div>

      {/* Tier explanation */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex items-start gap-3 p-4 rounded-xl border bg-card">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 text-primary shrink-0">
            <BarChart3 className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold flex items-center gap-1.5">
              Tier 1 — Confirmed
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">From MLS</Badge>
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Sales volume and transaction count — shown as solid bars in all charts.
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3 p-4 rounded-xl border border-dashed bg-card">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-amber-100 text-amber-700 shrink-0">
            <DollarSign className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold flex items-center gap-1.5">
              Tier 2 — Estimated
              <Badge className="text-[10px] px-1.5 py-0 bg-amber-100 text-amber-800 border-amber-300">est.</Badge>
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              GCI, gross margin, broker commission — calculated from your plan assumptions. Shown with dashed border.
            </p>
          </div>
        </div>
      </div>

      {/* CSV format info */}
      <div className="rounded-xl border bg-muted/30 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            Required CSV Format
          </h3>
          <Button variant="outline" size="sm" onClick={downloadSample} className="gap-1.5">
            <Download className="h-3.5 w-3.5" />
            Download Sample
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="text-xs w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left py-1 pr-4 font-semibold">Column</th>
                <th className="text-left py-1 pr-4 font-semibold">Required</th>
                <th className="text-left py-1 font-semibold">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {[
                { col: 'year', req: 'Yes', note: 'Four-digit year (e.g. 2022)' },
                { col: 'month', req: 'No', note: '1–12. Omit for annual totals.' },
                { col: 'salesCount', req: 'Yes', note: 'Number of closed transactions' },
                { col: 'salesVolume', req: 'Yes', note: 'Total dollar volume (e.g. 72000000)' },
              ].map(r => (
                <tr key={r.col}>
                  <td className="py-1.5 pr-4 font-mono text-primary">{r.col}</td>
                  <td className="py-1.5 pr-4">{r.req}</td>
                  <td className="py-1.5 text-muted-foreground">{r.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">
          Column names are flexible — the system recognizes many MLS export formats automatically.
          Accepted aliases include: <code>count</code>, <code>transactions</code>, <code>volume</code>, <code>total_volume</code>, etc.
        </p>
      </div>

      {/* Drop zone */}
      <div
        className={cn(
          'rounded-xl border-2 border-dashed p-8 text-center transition-all cursor-pointer',
          dragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/30',
          uploading && 'opacity-60 pointer-events-none'
        )}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={e => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
        <div className="flex flex-col items-center gap-3">
          {uploading ? (
            <>
              <div className="h-8 w-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              <p className="text-sm font-medium">Uploading and processing...</p>
            </>
          ) : (
            <>
              <Upload className={cn('h-8 w-8', dragging ? 'text-primary' : 'text-muted-foreground')} />
              <div>
                <p className="text-sm font-semibold">Drop your CSV file here</p>
                <p className="text-xs text-muted-foreground mt-0.5">or click to browse</p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-3 p-4 rounded-xl border border-destructive/30 bg-destructive/5">
          <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-destructive">Upload failed</p>
            <p className="text-xs text-muted-foreground mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* Results */}
      {results && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 border border-green-200">
            <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
            <p className="text-sm text-green-800 font-medium">
              Successfully imported {results.yearsImported} year{results.yearsImported !== 1 ? 's' : ''} of MLS data
            </p>
          </div>

          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 flex items-start gap-2">
            <Info className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800">
              Tier 2 estimates used: <strong>{results.assumptionsUsed?.avgCommissionPct?.toFixed(1)}% avg commission</strong> and{' '}
              <strong>{results.assumptionsUsed?.retentionPct?.toFixed(1)}% company retention</strong>.
              Update these in your <a href="/dashboard/admin/broker-plan" className="underline font-semibold">Broker Business Plan</a> to recalculate.
            </p>
          </div>

          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-2.5 font-semibold">Year</th>
                  <th className="text-right px-4 py-2.5 font-semibold">Sales</th>
                  <th className="text-right px-4 py-2.5 font-semibold">Volume</th>
                  <th className="text-right px-4 py-2.5 font-semibold">
                    <span className="flex items-center justify-end gap-1">
                      Est. GCI
                      <Badge className="text-[9px] px-1 py-0 bg-amber-100 text-amber-800">est.</Badge>
                    </span>
                  </th>
                  <th className="text-right px-4 py-2.5 font-semibold">
                    <span className="flex items-center justify-end gap-1">
                      Est. Margin
                      <Badge className="text-[9px] px-1 py-0 bg-amber-100 text-amber-800">est.</Badge>
                    </span>
                  </th>
                  <th className="text-right px-4 py-2.5 font-semibold">Months</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {results.results?.map((r: any) => (
                  <tr key={r.year} className="hover:bg-muted/30">
                    <td className="px-4 py-2.5 font-semibold">{r.year}</td>
                    <td className="px-4 py-2.5 text-right">{r.salesCount.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right">{fmt(r.salesVolume, '$')}</td>
                    <td className="px-4 py-2.5 text-right text-amber-700">{fmt(r.estimatedGCI, '$')}</td>
                    <td className="px-4 py-2.5 text-right text-amber-700">{fmt(r.estimatedGrossMargin, '$')}</td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground">
                      {r.monthsImported > 0 ? r.monthsImported : 'Annual only'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-3">
            <a href="/dashboard/broker" className="text-sm font-semibold text-primary hover:underline">
              View in Broker Command →
            </a>
            <span className="text-muted-foreground">·</span>
            <button
              onClick={() => { setResults(null); setError(null); }}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Upload another file
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
