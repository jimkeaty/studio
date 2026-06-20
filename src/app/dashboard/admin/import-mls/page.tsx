'use client';
// /dashboard/admin/import-mls
// MLS Historical Data Upload — two modes:
//   1. Listing Detail Import  — full MLS export with individual transactions (textexport format)
//   2. Volume Summary Import  — year/month totals only (salesCount + salesVolume)

import React, { useState, useRef, useCallback } from 'react';
import { useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Upload, FileText, CheckCircle2, AlertCircle, Info,
  TrendingUp, BarChart3, DollarSign, Download, ArrowLeft,
  AlertTriangle, Users, Home, ShoppingCart,
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

function fmt(n: number, prefix = '') {
  if (!n) return '—';
  if (n >= 1_000_000) return `${prefix}${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${prefix}${(n / 1_000).toFixed(0)}K`;
  return `${prefix}${n.toLocaleString()}`;
}

const VOLUME_SAMPLE_CSV = `year,month,salesCount,salesVolume
2022,,180,72000000
2023,,210,88000000
2024,,195,82000000
2025,1,18,7200000
2025,2,14,5600000
2025,3,22,9100000`;

// ── Contamination detector ─────────────────────────────────────────────────────
const BUYER_AGENT_PATTERNS = [
  'buyer agent', 'buyers agent', "buyer's agent", 'selling agent',
  'selling office agent', 'buyer broker', 'co-op agent', 'coop agent',
  'buyer rep', 'buyer representative',
];
const LISTING_AGENT_PATTERNS = [
  'listing agent', 'list agent', 'seller agent', "seller's agent",
  'sellers agent', 'listing broker',
];

function detectContaminatedColumns(csvText: string, sideType: 'listing' | 'buyer'): string[] {
  const firstLine = csvText.split(/\r?\n/)[0] ?? '';
  const headers = firstLine.split(',').map(h => h.trim().toLowerCase());
  const forbidden = sideType === 'listing' ? BUYER_AGENT_PATTERNS : LISTING_AGENT_PATTERNS;
  return headers.filter(h => forbidden.some(f => h.includes(f)));
}

// ── Listing Detail Upload Tab ──────────────────────────────────────────────────
function ListingDetailTab() {
  const { user } = useUser();
  const { toast } = useToast();
  const listingInputRef = useRef<HTMLInputElement>(null);
  const buyerInputRef = useRef<HTMLInputElement>(null);

  const [listingFile, setListingFile] = useState<File | null>(null);
  const [buyerFile, setBuyerFile] = useState<File | null>(null);
  const [listingDragging, setListingDragging] = useState(false);
  const [buyerDragging, setBuyerDragging] = useState(false);
  const [uploading, setUploading] = useState<'listing' | 'buyer' | null>(null);
  const [listingResult, setListingResult] = useState<any>(null);
  const [buyerResult, setBuyerResult] = useState<any>(null);
  const [listingError, setListingError] = useState<string | null>(null);
  const [buyerError, setBuyerError] = useState<string | null>(null);
  const [listingContamination, setListingContamination] = useState<string[]>([]);
  const [buyerContamination, setBuyerContamination] = useState<string[]>([]);

  const validateFile = async (file: File, sideType: 'listing' | 'buyer'): Promise<boolean> => {
    const text = await file.text();
    const contaminated = detectContaminatedColumns(text, sideType);
    if (sideType === 'listing') setListingContamination(contaminated);
    else setBuyerContamination(contaminated);
    return contaminated.length === 0;
  };

  const handleListingFile = useCallback(async (file: File) => {
    setListingError(null);
    setListingResult(null);
    const clean = await validateFile(file, 'listing');
    if (!clean) {
      setListingError(null); // shown via contamination warning
      return;
    }
    setListingFile(file);
  }, []);

  const handleBuyerFile = useCallback(async (file: File) => {
    setBuyerError(null);
    setBuyerResult(null);
    const clean = await validateFile(file, 'buyer');
    if (!clean) {
      setBuyerError(null);
      return;
    }
    setBuyerFile(file);
  }, []);

  const uploadFile = async (file: File, sideType: 'listing' | 'buyer') => {
    if (!user || !file) return;
    setUploading(sideType);
    if (sideType === 'listing') { setListingError(null); setListingResult(null); }
    else { setBuyerError(null); setBuyerResult(null); }

    try {
      const token = await user.getIdToken();
      const formData = new FormData();
      formData.append('file', file);
      formData.append('sideType', sideType);

      const res = await fetch('/api/admin/import-mls-listings', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();

      if (!data.ok) {
        const errMsg = data.error ?? 'Upload failed';
        if (sideType === 'listing') setListingError(errMsg);
        else setBuyerError(errMsg);
        toast({ title: 'Upload failed', description: errMsg, variant: 'destructive' });
      } else {
        if (sideType === 'listing') setListingResult(data);
        else setBuyerResult(data);
        toast({
          title: `${sideType === 'listing' ? 'Listing' : 'Buyer'} import complete`,
          description: `${data.imported} transactions imported`,
        });
      }
    } catch (err: any) {
      const errMsg = err.message ?? 'Upload failed';
      if (sideType === 'listing') setListingError(errMsg);
      else setBuyerError(errMsg);
    } finally {
      setUploading(null);
    }
  };

  const renderDropZone = (
    sideType: 'listing' | 'buyer',
    file: File | null,
    setFile: (f: File | null) => void,
    dragging: boolean,
    setDragging: (v: boolean) => void,
    inputRef: React.RefObject<HTMLInputElement | null>,
    contamination: string[],
    error: string | null,
    result: any,
    handleFile: (f: File) => void,
  ) => {
    const isListing = sideType === 'listing';
    const Icon = isListing ? Home : ShoppingCart;
    const label = isListing ? 'Listing Side' : 'Buyer Side';
    const agentCol = isListing ? '"Listing Agent"' : '"Buyer Agent"';
    const forbiddenCols = isListing
      ? '"Buyer Agent", "Selling Agent", "Co-Op Agent"'
      : '"Listing Agent", "List Agent", "Seller Agent"';

    return (
      <Card className={cn(
        'flex-1 min-w-[280px]',
        contamination.length > 0 ? 'border-red-400' : file ? 'border-green-400' : ''
      )}>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Icon className="h-4 w-4" />
            {label} File
          </CardTitle>
          <CardDescription className="text-xs">
            Upload your MLS export for {label.toLowerCase()} transactions only.
            The primary agent column should be {agentCol}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Contamination warning */}
          {contamination.length > 0 && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Wrong-side agent columns detected</AlertTitle>
              <AlertDescription className="text-xs">
                Your file contains columns that belong to the other side of the transaction:
                <strong> {contamination.join(', ')}</strong>.
                <br /><br />
                Please remove these columns from your export before uploading.
                For a {label.toLowerCase()} file, only include {agentCol} — not {forbiddenCols}.
                <br /><br />
                This prevents accidentally importing the wrong agent's name.
              </AlertDescription>
            </Alert>
          )}

          {/* Drop zone */}
          {contamination.length === 0 && !result && (
            <div
              className={cn(
                'border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors',
                dragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50',
                file ? 'border-green-400 bg-green-50/30 dark:bg-green-950/10' : ''
              )}
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => {
                e.preventDefault();
                setDragging(false);
                const f = e.dataTransfer.files[0];
                if (f) handleFile(f);
              }}
              onClick={() => inputRef.current?.click()}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
              {file ? (
                <div className="space-y-1">
                  <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto" />
                  <p className="text-sm font-medium">{file.name}</p>
                  <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</p>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-xs"
                    onClick={e => { e.stopPropagation(); setFile(null); if (sideType === 'listing') setListingContamination([]); else setBuyerContamination([]); }}
                  >
                    Remove
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <Upload className="h-8 w-8 text-muted-foreground mx-auto" />
                  <p className="text-sm text-muted-foreground">
                    Drop your {label.toLowerCase()} CSV/Excel here, or click to browse
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Error */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">{error}</AlertDescription>
            </Alert>
          )}

          {/* Result */}
          {result && (
            <div className="space-y-3">
              <div className={cn(
                'rounded-lg p-4 text-center',
                result.failed === 0 ? 'bg-green-50 dark:bg-green-950/20' : 'bg-yellow-50 dark:bg-yellow-950/20'
              )}>
                <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto mb-2" />
                <p className="font-bold text-lg">{result.imported} imported</p>
                <div className="flex justify-center gap-4 text-xs text-muted-foreground mt-1">
                  {result.skippedDuplicates > 0 && <span>{result.skippedDuplicates} duplicates skipped</span>}
                  {result.failed > 0 && <span className="text-red-600">{result.failed} failed</span>}
                </div>
              </div>

              {result.autoCreatedAgents?.length > 0 && (
                <Alert>
                  <Users className="h-4 w-4" />
                  <AlertTitle className="text-sm">Historical agent profiles created</AlertTitle>
                  <AlertDescription className="text-xs">
                    {result.autoCreatedAgents.length} agent name{result.autoCreatedAgents.length !== 1 ? 's' : ''} from
                    your MLS file did not match existing profiles and were created as historical records
                    (inactive, no onboarding required):
                    <br />
                    <span className="font-medium">{result.autoCreatedAgents.map((a: any) => a.name).join(', ')}</span>
                  </AlertDescription>
                </Alert>
              )}

              {result.formerAgents?.length > 0 && (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertTitle className="text-sm">Former agent transactions imported</AlertTitle>
                  <AlertDescription className="text-xs">
                    Transactions for {result.formerAgents.length} former/inactive agent{result.formerAgents.length !== 1 ? 's' : ''} were
                    imported as historical records:
                    <span className="font-medium"> {result.formerAgents.map((a: any) => a.name).join(', ')}</span>
                  </AlertDescription>
                </Alert>
              )}

              <Button
                size="sm"
                variant="outline"
                className="w-full"
                onClick={() => { setFile(null); if (sideType === 'listing') { setListingResult(null); setListingContamination([]); } else { setBuyerResult(null); setBuyerContamination([]); } }}
              >
                Upload another file
              </Button>
            </div>
          )}

          {/* Upload button */}
          {file && !result && contamination.length === 0 && (
            <Button
              className="w-full"
              onClick={() => uploadFile(file, sideType)}
              disabled={uploading !== null}
            >
              {uploading === sideType ? (
                <>Importing…</>
              ) : (
                <><Upload className="mr-2 h-4 w-4" /> Import {label} File</>
              )}
            </Button>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      {/* Instructions */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Upload listing and buyer files separately</AlertTitle>
        <AlertDescription className="text-sm space-y-2">
          <p>
            To prevent importing the wrong agent name, upload your MLS exports as two separate files —
            one for listing sides and one for buyer sides.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
            <div className="bg-muted/50 rounded p-3 text-xs space-y-1">
              <p className="font-semibold flex items-center gap-1"><Home className="h-3 w-3" /> Listing Side File</p>
              <p>✓ Keep: <strong>Listing Agent</strong>, Co-Listing Agent</p>
              <p className="text-red-600">✗ Remove: Buyer Agent, Selling Agent, Co-Op Agent</p>
              <p className="text-muted-foreground">Status: C=Sold · L=Canceled · E=Expired</p>
            </div>
            <div className="bg-muted/50 rounded p-3 text-xs space-y-1">
              <p className="font-semibold flex items-center gap-1"><ShoppingCart className="h-3 w-3" /> Buyer Side File</p>
              <p>✓ Keep: <strong>Buyer Agent</strong>, Co-Buyer Agent</p>
              <p className="text-red-600">✗ Remove: Listing Agent, Seller Agent</p>
              <p className="text-muted-foreground">Status: C=Closed · L=Canceled · E=Expired</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            <strong>Deduplication:</strong> The MLS List Number is used as the unique key.
            The same address with a different List Number is treated as a separate transaction (valid re-list).
            Canceled (L) and expired (E) listings are imported for historical accuracy.
          </p>
        </AlertDescription>
      </Alert>

      {/* Two drop zones side by side */}
      <div className="flex flex-wrap gap-4">
        {renderDropZone(
          'listing', listingFile, setListingFile, listingDragging, setListingDragging,
          listingInputRef, listingContamination, listingError, listingResult, handleListingFile,
        )}
        {renderDropZone(
          'buyer', buyerFile, setBuyerFile, buyerDragging, setBuyerDragging,
          buyerInputRef, buyerContamination, buyerError, buyerResult, handleBuyerFile,
        )}
      </div>

      {/* Status code reference */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">MLS Status Code Reference</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div className="flex items-center gap-2">
              <Badge className="bg-green-100 text-green-800 border-green-300">C</Badge>
              <span>Sold / Closed</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge className="bg-red-100 text-red-800 border-red-300">L</Badge>
              <span>Canceled</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge className="bg-gray-100 text-gray-800 border-gray-300">E</Badge>
              <span>Expired</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            All three statuses are imported. Canceled and expired listings appear in historical charts
            but are not counted in closed-transaction metrics.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Volume Summary Upload Tab ──────────────────────────────────────────────────
function VolumeSummaryTab() {
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
        toast({ title: 'MLS data imported', description: `${data.yearsImported} year${data.yearsImported !== 1 ? 's' : ''} imported` });
      }
    } catch (err: any) {
      setError(err.message ?? 'Upload failed');
    } finally {
      setUploading(false);
    }
  }, [user, toast]);

  const downloadSample = () => {
    const blob = new Blob([VOLUME_SAMPLE_CSV], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mls-volume-summary-sample.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Volume Summary Format</AlertTitle>
        <AlertDescription className="text-sm">
          Use this format when you only have aggregate data (total sales count and volume per year or month),
          not individual transaction records. GCI and gross margin will be estimated from your plan assumptions
          and shown with an <Badge variant="outline" className="text-xs">est.</Badge> badge in all charts.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Upload Volume Summary CSV</span>
            <Button variant="outline" size="sm" onClick={downloadSample}>
              <Download className="mr-2 h-4 w-4" /> Sample CSV
            </Button>
          </CardTitle>
          <CardDescription>
            Required columns: <code>year</code>, <code>salesCount</code>, <code>salesVolume</code>.
            Optional: <code>month</code> (1–12 for monthly breakdown).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            className={cn(
              'border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors',
              dragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
            )}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
            onClick={() => fileInputRef.current?.click()}
          >
            <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            <Upload className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Drop CSV here or click to browse</p>
            {uploading && <p className="text-sm text-primary mt-2">Uploading…</p>}
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {results && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle2 className="h-5 w-5" />
                <span className="font-medium">{results.yearsImported} year{results.yearsImported !== 1 ? 's' : ''} imported</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="pb-2 pr-4">Year</th>
                      <th className="pb-2 pr-4">Sales</th>
                      <th className="pb-2 pr-4">Volume</th>
                      <th className="pb-2 pr-4">Est. GCI <Badge variant="outline" className="text-xs ml-1">est.</Badge></th>
                      <th className="pb-2">Est. Margin <Badge variant="outline" className="text-xs ml-1">est.</Badge></th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.results?.map((r: any) => (
                      <tr key={r.year} className="border-b last:border-0">
                        <td className="py-1.5 pr-4 font-medium">{r.year}</td>
                        <td className="py-1.5 pr-4">{r.salesCount.toLocaleString()}</td>
                        <td className="py-1.5 pr-4">{fmt(r.salesVolume, '$')}</td>
                        <td className="py-1.5 pr-4 text-muted-foreground">{fmt(r.estimatedGCI, '$')}</td>
                        <td className="py-1.5 text-muted-foreground">{fmt(r.estimatedGrossMargin, '$')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground">
                Assumptions used: {results.assumptionsUsed?.avgCommissionPct}% commission ·{' '}
                {results.assumptionsUsed?.retentionPct}% retention.
                Update these in your <Link href="/dashboard/admin/broker-plan" className="underline">Broker Business Plan</Link>.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
type TabType = 'listing-detail' | 'volume-summary';

export default function ImportMLSPage() {
  const [activeTab, setActiveTab] = useState<TabType>('listing-detail');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <Link href="/dashboard/admin/transactions" className="hover:underline flex items-center gap-1">
            <ArrowLeft className="h-3 w-3" /> Transaction Ledger
          </Link>
          <span>/</span>
          <span>MLS Data Import</span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight">MLS Historical Data Import</h1>
        <p className="text-muted-foreground mt-1">
          Import historical MLS data going back to 2004. Choose between full transaction detail
          (with individual agent names and addresses) or volume summary (totals only).
        </p>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit">
        <button
          className={cn(
            'px-4 py-2 rounded-md text-sm font-medium transition-colors',
            activeTab === 'listing-detail'
              ? 'bg-background shadow-sm text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          )}
          onClick={() => setActiveTab('listing-detail')}
        >
          <Home className="inline h-4 w-4 mr-1.5 -mt-0.5" />
          Listing &amp; Buyer Detail
        </button>
        <button
          className={cn(
            'px-4 py-2 rounded-md text-sm font-medium transition-colors',
            activeTab === 'volume-summary'
              ? 'bg-background shadow-sm text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          )}
          onClick={() => setActiveTab('volume-summary')}
        >
          <BarChart3 className="inline h-4 w-4 mr-1.5 -mt-0.5" />
          Volume Summary Only
        </button>
      </div>

      {activeTab === 'listing-detail' ? <ListingDetailTab /> : <VolumeSummaryTab />}
    </div>
  );
}
