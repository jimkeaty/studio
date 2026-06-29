'use client';
export const dynamic = 'force-dynamic';

import { useState, useRef, useCallback } from 'react';
import { useUser } from '@/firebase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CheckCircle2, RefreshCw, Upload, Eye, FileSpreadsheet, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import * as XLSX from 'xlsx';

/* ─── Types ──────────────────────────────────────────────────────────── */
interface SpreadsheetRow {
  address: string;
  agent: string;
  closeDate: string;
  type: string;
  dealType: string;
  salePrice: number | null;
  listPrice: number | null;
}

interface MatchResult {
  row: SpreadsheetRow;
  match: {
    id: string;
    address: string;
    agentDisplayName: string;
    closeDate: string;
    salePrice: number | null;
    listPrice: number | null;
  } | null;
  score: number;
  status: 'exact' | 'fuzzy' | 'no_match';
  changes: Record<string, { old: any; new: any }>;
}

interface PreviewResponse {
  ok: boolean;
  mode: 'preview';
  totalRows: number;
  exactMatches: number;
  fuzzyMatches: number;
  noMatches: number;
  withChanges: number;
  results: MatchResult[];
  error?: string;
}

interface ApplyResponse {
  ok: boolean;
  mode: 'apply';
  updated: number;
  results: MatchResult[];
  error?: string;
}

/* ─── Pre-loaded spreadsheet data (75 rows, 2025 closed transactions) ── */
const PRELOADED_ROWS: SpreadsheetRow[] = [{"address":"619 Bonin #A","agent":"Jason Ray","closeDate":"2025-12-30","type":"Lease","dealType":"commercial","salePrice":800.0,"listPrice":800.0},{"address":"619 Bonin #A","agent":"Brad Gaubert","closeDate":"2025-12-30","type":"Lease","dealType":"commercial","salePrice":800.0,"listPrice":800.0},{"address":"310 Miarmar Blvd","agent":"Lori Mcgrew","closeDate":"2025-12-29","type":"Buyer","dealType":"residential","salePrice":250000.0,"listPrice":290000.0},{"address":"TBD Woodlawn Rd","agent":"Jim Keaty","closeDate":"2025-12-22","type":"Buyer","dealType":"land","salePrice":325000.0,"listPrice":580000.0},{"address":"511 Fox Run","agent":"Caleb bourque","closeDate":"2025-12-22","type":"Buyer","dealType":"rental","salePrice":850.0,"listPrice":850.0},{"address":"510 Schooner Bay","agent":"Raquel Quebodeaux","closeDate":"2025-12-19","type":"Buyer","dealType":"residential","salePrice":263500.0,"listPrice":273500.0},{"address":"105 Engelewood #103","agent":"Matthew Delcambre","closeDate":"2025-12-18","type":"Buyer","dealType":"residential","salePrice":398000.0,"listPrice":750000.0},{"address":"113 Louis Private","agent":"Raquel Quebodeaux","closeDate":"2025-12-16","type":"Listing","dealType":"residential","salePrice":255000.0,"listPrice":285000.0},{"address":"521 Catherine St.","agent":"Derrian Bordelon","closeDate":"2025-11-10","type":"Listing","dealType":"residential","salePrice":228000.0,"listPrice":228000.0},{"address":"117 Marigny Circle","agent":"Meadow Battles","closeDate":"2025-11-07","type":"Buyer","dealType":"lease","salePrice":525.0,"listPrice":null},{"address":"307 Briargate Walk","agent":"Adam Angers","closeDate":"2025-11-05","type":"Listing","dealType":"residential","salePrice":240000.0,"listPrice":240000.0},{"address":"6778 Birch Trace","agent":"Charles Ditch","closeDate":"2025-11-04","type":"Buyer","dealType":"residential","salePrice":175000.0,"listPrice":175000.0},{"address":"908 Landrenau st","agent":"Amanda Kidder","closeDate":"2025-10-31","type":"Buyer","dealType":"residential","salePrice":240000.0,"listPrice":275000.0},{"address":"2000 W. Congress","agent":"Jim Keaty","closeDate":"2025-10-27","type":"Listing","dealType":"commerical","salePrice":3000.0,"listPrice":3000.0},{"address":"217 Amsterdam Ave","agent":"Jason Ray","closeDate":"2025-10-27","type":"Listing","dealType":"residential","salePrice":46000.0,"listPrice":57000.0},{"address":"617 E Vermilion","agent":"Matthew Delcambre","closeDate":"2025-10-17","type":"Buyer","dealType":"multifamily","salePrice":130000.0,"listPrice":140000.0},{"address":"344 Crowne Parc Dr","agent":"Raquel Quebodeaux","closeDate":"2025-10-14","type":"Buyer","dealType":"residential","salePrice":237500.0,"listPrice":237500.0},{"address":"1411 West St Mary","agent":"Jason Ray","closeDate":"2025-10-03","type":"Buyer","dealType":"residential","salePrice":362000.0,"listPrice":385000.0},{"address":"208 Cheatnut Oak","agent":"Molli Aguillard","closeDate":"2025-10-02","type":"Buyer","dealType":"residential","salePrice":225000.0,"listPrice":235500.0},{"address":"319 W Woodman","agent":"Dyllan Hawkins","closeDate":"2025-10-01","type":"Listing","dealType":"commercial","salePrice":65000.0,"listPrice":150000.0},{"address":"206 Bellevue St","agent":"Heather Guidroz","closeDate":"2025-09-29","type":"Buyer","dealType":"residential","salePrice":218000.0,"listPrice":220500.0},{"address":"105 Broussard Hills","agent":"Raquel Quebodeaux","closeDate":"2025-09-24","type":"Buyer","dealType":"residential","salePrice":267500.0,"listPrice":267500.0},{"address":"109 Julienie Way","agent":"Becky Etzel","closeDate":"2025-09-22","type":"Buyer","dealType":"land","salePrice":48500.0,"listPrice":60000.0},{"address":"905 Jefferson St #D","agent":"Jessica Parker","closeDate":"2025-09-11","type":"Buyer","dealType":"commericial","salePrice":450.0,"listPrice":null},{"address":"4322 Poydras Highway","agent":"Raquel Quebodeaux","closeDate":"2025-09-11","type":"Listing","dealType":"residential","salePrice":230000.0,"listPrice":249000.0},{"address":"701 W 8th St","agent":"Scott Domingue","closeDate":"2025-09-02","type":"Listing","dealType":"residential","salePrice":112000.0,"listPrice":130000.0},{"address":"410 Bank Ave & 1011 Providence St","agent":"Scott Domingue","closeDate":"2025-08-20","type":"Referral","dealType":"rental","salePrice":null,"listPrice":null},{"address":"14 Miramar Blvd","agent":"Lori McGrew","closeDate":"2025-08-20","type":"Listing","dealType":"residential","salePrice":217000.0,"listPrice":225000.0},{"address":"2196 Atchafalaya River Hwy","agent":"Chasidy Burnett","closeDate":"2025-08-18","type":"Buyer","dealType":"residential","salePrice":45000.0,"listPrice":65000.0},{"address":"200 Scarlett Drive","agent":"Raquel Quebodeaux","closeDate":"2025-08-18","type":"Buyer","dealType":"residential","salePrice":179000.0,"listPrice":179000.0},{"address":"124 Fox Trot Ln","agent":"Jessica Parker","closeDate":"2025-08-11","type":"Buyer","dealType":"residential","salePrice":219000.0,"listPrice":219000.0},{"address":"1012 Pinhook Rd","agent":"Jim Keaty","closeDate":"2025-08-04","type":"Listing","dealType":"commerical","salePrice":2500.0,"listPrice":2500.0},{"address":"1012 Pinhook Rd","agent":"Tyler Manuel","closeDate":"2025-08-04","type":"Listing","dealType":"commerical","salePrice":2500.0,"listPrice":2500.0},{"address":"1012 Pinhook Rd","agent":"Jason Ray","closeDate":"2025-08-04","type":"Listing","dealType":"commerical","salePrice":2500.0,"listPrice":2500.0},{"address":"3024 Moss St","agent":"Raquel Quebodeaux","closeDate":"2025-07-31","type":"Listing","dealType":"residential","salePrice":340000.0,"listPrice":340000.0},{"address":"2013 Woodvale Dr","agent":"Raquel Quebodeaux","closeDate":"2025-07-28","type":"Buyer","dealType":"residential","salePrice":215000.0,"listPrice":215000.0},{"address":"1012 Pinhook Rd","agent":"Jim Keaty","closeDate":"2025-07-01","type":"Listing","dealType":"commerical","salePrice":2500.0,"listPrice":2500.0},{"address":"1012 Pinhook Rd","agent":"Tyler Manuel","closeDate":"2025-07-01","type":"Listing","dealType":"commerical","salePrice":2500.0,"listPrice":2500.0},{"address":"1012 Pinhook Rd","agent":"Jason Ray","closeDate":"2025-07-01","type":"Listing","dealType":"commerical","salePrice":2500.0,"listPrice":2500.0},{"address":"1012 Pinhook Rd","agent":"Jim Keaty","closeDate":"2025-06-01","type":"Listing","dealType":"commerical","salePrice":2500.0,"listPrice":2500.0},{"address":"1012 Pinhook Rd","agent":"Tyler Manuel","closeDate":"2025-06-01","type":"Listing","dealType":"commerical","salePrice":2500.0,"listPrice":2500.0},{"address":"1012 Pinhook Rd","agent":"Jason Ray","closeDate":"2025-06-01","type":"Listing","dealType":"commerical","salePrice":2500.0,"listPrice":2500.0},{"address":"1012 Pinhook Rd","agent":"Jim Keaty","closeDate":"2025-05-01","type":"Listing","dealType":"commerical","salePrice":2500.0,"listPrice":2500.0},{"address":"1012 Pinhook Rd","agent":"Tyler Manuel","closeDate":"2025-05-01","type":"Listing","dealType":"commerical","salePrice":2500.0,"listPrice":2500.0},{"address":"1012 Pinhook Rd","agent":"Jason Ray","closeDate":"2025-05-01","type":"Listing","dealType":"commerical","salePrice":2500.0,"listPrice":2500.0},{"address":"101 Senator Picard","agent":"Noah Norris","closeDate":"2025-05-22","type":"Buyer","dealType":"residential","salePrice":239000.0,"listPrice":247500.0},{"address":"12205 Veterans Memorial Dr","agent":"Tyler Manuel","closeDate":"2025-05-07","type":"Buyer","dealType":"residential","salePrice":256000.0,"listPrice":262000.0},{"address":"101 7 Oaks St.","agent":"Michelle Foreman","closeDate":"2025-05-05","type":"Buyer","dealType":"residenital","salePrice":350000.0,"listPrice":395000.0},{"address":"117 Cottage Cove Dr","agent":"Scott Domingue","closeDate":"2025-05-01","type":"Buyer","dealType":"residential","salePrice":217500.0,"listPrice":217500.0},{"address":"832 Saint Thomas","agent":"Tyler Albrecht","closeDate":"2025-04-30","type":"Buyer","dealType":"residenital","salePrice":240000.0,"listPrice":250000.0},{"address":"1301 Saint John St #203","agent":"Michele Ezell","closeDate":"2025-04-30","type":"Listing","dealType":"residential","salePrice":121500.0,"listPrice":126000.0},{"address":"832 Saint Thomas","agent":"Tyler Albrecht","closeDate":"2025-04-30","type":"Listing","dealType":"residential","salePrice":240000.0,"listPrice":250000.0},{"address":"1113 11th Street","agent":"Heather Guidroz","closeDate":"2025-04-17","type":"Buyer","dealType":"residential","salePrice":169550.0,"listPrice":175000.0},{"address":"307 Bull Run Circle","agent":"Scott Domingue","closeDate":"2025-04-14","type":"Listing","dealType":"residential","salePrice":235000.0,"listPrice":235000.0},{"address":"204 Cezanne Dr","agent":"Scott Domingue","closeDate":"2025-04-04","type":"Listing","dealType":"residential","salePrice":225000.0,"listPrice":230000.0},{"address":"TBD (207) Turf Rd","agent":"Noah Norris","closeDate":"2025-04-02","type":"Dual Agent","dealType":"land","salePrice":33500.0,"listPrice":60000.0},{"address":"406 Garfield - Settlement 3","agent":"Michele Ezell","closeDate":"2025-03-27","type":"Lease","dealType":"commerical","salePrice":null,"listPrice":null},{"address":"406 Garfield - Settlement 2","agent":"Michele Ezell","closeDate":"2025-03-27","type":"Lease","dealType":"commerical","salePrice":null,"listPrice":null},{"address":"401 Harbor Bend, B","agent":"Michele Ezell","closeDate":"2025-03-21","type":"Buyer","dealType":"residential","salePrice":260000.0,"listPrice":260000.0},{"address":"709 Deer Frok Xing","agent":"Rachel North","closeDate":"2025-03-12","type":"Buyer","dealType":"residential","salePrice":430000.0,"listPrice":430000.0},{"address":"3200/4 E Milton","agent":"Michele E","closeDate":"2025-02-27","type":"Buyer","dealType":"commerical","salePrice":1224700.0,"listPrice":null},{"address":"308 W South First Street","agent":"Scott Domingue","closeDate":"2025-02-25","type":"Buyer","dealType":"residential","salePrice":125000.0,"listPrice":125000.0},{"address":"202 General Gardener","agent":"Jim Keaty","closeDate":"2025-02-21","type":"Lease","dealType":"commerical","salePrice":3200.0,"listPrice":3200.0},{"address":"TBD Clayton Castille Road","agent":"Matthew Delcambre","closeDate":"2025-02-21","type":"Buyer","dealType":"residential","salePrice":49950.0,"listPrice":49950.0},{"address":"202 General Gardener","agent":"Tyler Manuel","closeDate":"2025-02-21","type":"Lease","dealType":"commerical","salePrice":3200.0,"listPrice":3200.0},{"address":"406 Garfield - Settlement 1","agent":"Michele Ezelle","closeDate":"2025-02-05","type":"Lease","dealType":"commerical","salePrice":null,"listPrice":null},{"address":"TBD W Dermelie Calias Rd","agent":"Adam Sonnier","closeDate":"2025-01-31","type":"Listing","dealType":"land","salePrice":55000.0,"listPrice":55000.0},{"address":"2965 Cottingham","agent":"Savannah Hunt","closeDate":"2025-01-27","type":"Lease","dealType":"residential","salePrice":198000.0,"listPrice":null},{"address":"16172 Fleur De Lis","agent":"Tyler Manuel","closeDate":"2025-01-23","type":"Buyer","dealType":"residential","salePrice":360000.0,"listPrice":360000.0},{"address":"218 Rue Beauregard, Ste F","agent":"Ashley Lombas","closeDate":"2025-01-14","type":"Lease","dealType":"residential","salePrice":82176.0,"listPrice":null},{"address":"125 Nyoka Circle","agent":"Scott Domingue","closeDate":"2025-01-09","type":"Buyer","dealType":"residential","salePrice":140000.0,"listPrice":151500.0},{"address":"205 Milton Estates Ln","agent":"Shelly Hebert","closeDate":"2025-01-09","type":"Buyer","dealType":"residential","salePrice":211000.0,"listPrice":215000.0},{"address":"100 Aimee (Multi Fam)","agent":"Ashley Simon","closeDate":"2025-01-02","type":"Buyer","dealType":"MultiFam","salePrice":180000.0,"listPrice":300000.0}];

/* ─── Parse Excel/CSV date serial to YYYY-MM-DD ─────────────────────── */
function parseExcelDate(val: any): string {
  if (!val) return '';
  // Already a string date
  if (typeof val === 'string') {
    // Try to detect MM/DD/YYYY or similar
    const d = new Date(val);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    return val.slice(0, 10);
  }
  // Excel serial number
  if (typeof val === 'number') {
    const date = XLSX.SSF.parse_date_code(val);
    if (date) {
      const m = String(date.m).padStart(2, '0');
      const d = String(date.d).padStart(2, '0');
      return `${date.y}-${m}-${d}`;
    }
    return new Date(val).toISOString().slice(0, 10);
  }
  return '';
}

/* ─── Parse uploaded workbook into SpreadsheetRow[] ─────────────────── */
function parseWorkbook(wb: XLSX.WorkBook): { rows: SpreadsheetRow[]; error?: string } {
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return { rows: [], error: 'No sheets found in workbook' };

  const raw: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  if (raw.length < 2) return { rows: [], error: 'Spreadsheet appears empty' };

  // Normalize header names
  const headers: string[] = (raw[0] as any[]).map(h => String(h || '').toLowerCase().trim());

  const colIdx = (names: string[]) => {
    for (const n of names) {
      const i = headers.findIndex(h => h.includes(n));
      if (i >= 0) return i;
    }
    return -1;
  };

  const addrCol = colIdx(['address', 'addr', 'property']);
  const agentCol = colIdx(['agent', 'name']);
  const dateCol = colIdx(['close date', 'closed date', 'closing date', 'date']);
  const typeCol = colIdx(['type', 'closing type', 'transaction type']);
  const dealTypeCol = colIdx(['deal type', 'dealtype', 'property type']);
  const salePriceCol = colIdx(['sale price', 'saleprice', 'sold price', 'sold for']);
  const listPriceCol = colIdx(['list price', 'listprice', 'listing price', 'asking price']);

  if (addrCol < 0) return { rows: [], error: 'Could not find an "Address" column. Expected headers: Address, Agent, Close Date, Type, Deal Type, Sale Price, List Price' };

  const rows: SpreadsheetRow[] = [];
  for (let i = 1; i < raw.length; i++) {
    const row = raw[i];
    if (!row || !row[addrCol]) continue; // skip empty rows

    const rawSale = salePriceCol >= 0 ? row[salePriceCol] : null;
    const rawList = listPriceCol >= 0 ? row[listPriceCol] : null;

    rows.push({
      address: String(row[addrCol] || '').trim(),
      agent: agentCol >= 0 ? String(row[agentCol] || '').trim() : '',
      closeDate: dateCol >= 0 ? parseExcelDate(row[dateCol]) : '',
      type: typeCol >= 0 ? String(row[typeCol] || '').trim() : '',
      dealType: dealTypeCol >= 0 ? String(row[dealTypeCol] || '').trim() : '',
      salePrice: rawSale != null && rawSale !== '' ? parseFloat(String(rawSale).replace(/[^0-9.]/g, '')) || null : null,
      listPrice: rawList != null && rawList !== '' ? parseFloat(String(rawList).replace(/[^0-9.]/g, '')) || null : null,
    });
  }

  if (rows.length === 0) return { rows: [], error: 'No data rows found after the header row' };
  return { rows };
}

/* ─── Helpers ─────────────────────────────────────────────────────────── */
const fmt = (n: number | null | undefined) =>
  n == null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n);

const statusBadge = (status: MatchResult['status'], score: number) => {
  if (status === 'exact') return <Badge className="bg-green-600 text-white">Exact ({Math.round(score * 100)}%)</Badge>;
  if (status === 'fuzzy') return <Badge className="bg-yellow-500 text-white">Fuzzy ({Math.round(score * 100)}%)</Badge>;
  return <Badge className="bg-red-500 text-white">No Match</Badge>;
};

/* ─── Component ──────────────────────────────────────────────────────── */
export default function BulkUpdateTransactionsPage() {
  const { user, loading: userLoading } = useUser();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Data source
  const [uploadedRows, setUploadedRows] = useState<SpreadsheetRow[] | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [usePreloaded, setUsePreloaded] = useState(true);

  // Preview / apply state
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [applyResult, setApplyResult] = useState<ApplyResponse | null>(null);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNoMatch, setShowNoMatch] = useState(false);
  const [showNoChanges, setShowNoChanges] = useState(false);
  const [yearFilter, setYearFilter] = useState('2025');

  /* ── Auth guards ─────────────────────────────────────────────────── */
  if (userLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-10 w-1/3" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (!user) {
    return (
      <Alert>
        <AlertTitle>Authentication Required</AlertTitle>
        <AlertDescription>Please sign in to access this page.</AlertDescription>
      </Alert>
    );
  }

  /* ── File upload handler ─────────────────────────────────────────── */
  const handleFile = useCallback((file: File) => {
    setParseError(null);
    setPreview(null);
    setApplyResult(null);
    setError(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array', cellDates: false });
        const { rows, error: parseErr } = parseWorkbook(wb);
        if (parseErr) {
          setParseError(parseErr);
          return;
        }
        setUploadedRows(rows);
        setUploadedFileName(file.name);
        setUsePreloaded(false);
      } catch (err: any) {
        setParseError(`Failed to parse file: ${err.message}`);
      }
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const activeRows = usePreloaded ? PRELOADED_ROWS : (uploadedRows ?? PRELOADED_ROWS);

  /* ── API calls ───────────────────────────────────────────────────── */
  const runPreview = async () => {
    setLoadingPreview(true);
    setError(null);
    setPreview(null);
    setApplyResult(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/bulk-update-transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ rows: activeRows, mode: 'preview', year: parseInt(yearFilter) }),
      });
      const data: PreviewResponse = await res.json();
      if (!data.ok) throw new Error(data.error || 'Preview failed');
      setPreview(data);
    } catch (e: any) {
      setError(e.message || 'Unknown error');
    } finally {
      setLoadingPreview(false);
    }
  };

  const runApply = async () => {
    if (!preview) return;
    setApplying(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/bulk-update-transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ rows: activeRows, mode: 'apply', year: parseInt(yearFilter) }),
      });
      const data: ApplyResponse = await res.json();
      if (!data.ok) throw new Error(data.error || 'Apply failed');
      setApplyResult(data);
    } catch (e: any) {
      setError(e.message || 'Unknown error');
    } finally {
      setApplying(false);
    }
  };

  /* ── Filtered results ────────────────────────────────────────────── */
  const results = preview?.results ?? [];
  const displayResults = results.filter(r => {
    if (!showNoMatch && r.status === 'no_match') return false;
    if (!showNoChanges && Object.keys(r.changes).length === 0 && r.status !== 'no_match') return false;
    return true;
  });

  /* ── Render ──────────────────────────────────────────────────────── */
  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Bulk Update Transactions</h1>
        <p className="text-muted-foreground mt-1">
          Upload a spreadsheet to fuzzy-match against SmartBroker transactions and update sale/list prices.
        </p>
      </div>

      {/* Source data card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Source Data
          </CardTitle>
          <CardDescription>
            Upload a new spreadsheet (.xlsx, .xls, .csv) or use the pre-loaded 2025 data (75 rows).
            Expected columns: <strong>Address, Agent, Close Date, Type, Deal Type, Sale Price, List Price</strong>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Drop zone */}
          <div
            className={cn(
              'border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors',
              'hover:border-primary hover:bg-primary/5',
              'border-muted-foreground/30'
            )}
            onClick={() => fileInputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={e => e.preventDefault()}
          >
            <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm font-medium">Click to upload or drag & drop</p>
            <p className="text-xs text-muted-foreground mt-1">.xlsx, .xls, or .csv</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={handleFileInput}
            />
          </div>

          {/* Parse error */}
          {parseError && (
            <Alert variant="destructive">
              <AlertTitle>Parse Error</AlertTitle>
              <AlertDescription>{parseError}</AlertDescription>
            </Alert>
          )}

          {/* Uploaded file info */}
          {uploadedRows && !usePreloaded && (
            <div className="flex items-center gap-3 rounded-md border bg-green-50 dark:bg-green-950/20 px-3 py-2">
              <FileSpreadsheet className="h-4 w-4 text-green-600 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{uploadedFileName}</p>
                <p className="text-xs text-muted-foreground">{uploadedRows.length} rows parsed</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setUploadedRows(null); setUploadedFileName(null); setUsePreloaded(true); setPreview(null); }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}

          {/* Pre-loaded data indicator */}
          {usePreloaded && (
            <div className="flex items-center gap-3 rounded-md border px-3 py-2 bg-muted/40">
              <FileSpreadsheet className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium">Pre-loaded: 2025 Closed Transactions</p>
                <p className="text-xs text-muted-foreground">{PRELOADED_ROWS.length} rows — upload a new file to replace</p>
              </div>
            </div>
          )}

          {/* Year + Run button */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">Year:</label>
              <select
                value={yearFilter}
                onChange={e => { setYearFilter(e.target.value); setPreview(null); }}
                className="border rounded px-2 py-1 text-sm bg-background"
              >
                {['2025', '2024', '2023', '2022'].map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <Button onClick={runPreview} disabled={loadingPreview} className="gap-2">
              {loadingPreview ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
              {loadingPreview ? 'Running Preview…' : `Run Preview (${activeRows.length} rows)`}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Error */}
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Apply success */}
      {applyResult && (
        <Alert className="border-green-500 bg-green-50 text-green-900 dark:bg-green-950/20 dark:text-green-300">
          <CheckCircle2 className="h-4 w-4" />
          <AlertTitle>Updates Applied</AlertTitle>
          <AlertDescription>
            Successfully updated <strong>{applyResult.updated}</strong> transactions in Firestore.
          </AlertDescription>
        </Alert>
      )}

      {/* Preview results */}
      {preview && !applyResult && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Preview Results</CardTitle>
              <CardDescription>Review matches before applying. Only rows with changes will be updated.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-4 text-sm mb-4">
                <div className="rounded-md border border-green-500 px-3 py-2">
                  <div className="font-semibold text-lg text-green-700">{preview.exactMatches}</div>
                  <div className="text-muted-foreground">Exact Matches</div>
                </div>
                <div className="rounded-md border border-yellow-500 px-3 py-2">
                  <div className="font-semibold text-lg text-yellow-700">{preview.fuzzyMatches}</div>
                  <div className="text-muted-foreground">Fuzzy Matches</div>
                </div>
                <div className="rounded-md border border-red-500 px-3 py-2">
                  <div className="font-semibold text-lg text-red-700">{preview.noMatches}</div>
                  <div className="text-muted-foreground">No Match</div>
                </div>
                <div className="rounded-md border border-blue-500 px-3 py-2">
                  <div className="font-semibold text-lg text-blue-700">{preview.withChanges}</div>
                  <div className="text-muted-foreground">Rows with Changes</div>
                </div>
              </div>

              <div className="flex gap-4 mb-4 text-sm">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={showNoMatch} onChange={e => setShowNoMatch(e.target.checked)} className="rounded" />
                  Show No-Match rows
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={showNoChanges} onChange={e => setShowNoChanges(e.target.checked)} className="rounded" />
                  Show rows with no changes
                </label>
              </div>

              <p className="text-sm text-muted-foreground mb-4">
                Showing {displayResults.length} of {results.length} rows
              </p>

              {preview.withChanges > 0 ? (
                <Button
                  onClick={runApply}
                  disabled={applying}
                  className="gap-2 bg-green-600 hover:bg-green-700 text-white mb-4"
                >
                  {applying ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  {applying ? 'Applying Updates…' : `Apply ${preview.withChanges} Update${preview.withChanges !== 1 ? 's' : ''} to Firestore`}
                </Button>
              ) : (
                <Alert className="mb-4">
                  <AlertTitle>No Changes Needed</AlertTitle>
                  <AlertDescription>All matched transactions already have the correct sale/list prices.</AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8">#</TableHead>
                      <TableHead>Spreadsheet Address</TableHead>
                      <TableHead>Agent</TableHead>
                      <TableHead>Close Date</TableHead>
                      <TableHead>Match</TableHead>
                      <TableHead>Matched Address</TableHead>
                      <TableHead>Sale Price (Old → New)</TableHead>
                      <TableHead>List Price (Old → New)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {displayResults.map((r, i) => {
                      const hasChanges = Object.keys(r.changes).length > 0;
                      return (
                        <TableRow
                          key={i}
                          className={cn(
                            r.status === 'no_match' && 'bg-red-50 dark:bg-red-950/20',
                            r.status === 'fuzzy' && 'bg-yellow-50 dark:bg-yellow-950/20',
                            r.status === 'exact' && hasChanges && 'bg-green-50 dark:bg-green-950/20',
                          )}
                        >
                          <TableCell className="text-muted-foreground text-xs">{results.indexOf(r) + 1}</TableCell>
                          <TableCell className="font-medium text-sm">{r.row.address}</TableCell>
                          <TableCell className="text-sm">{r.row.agent}</TableCell>
                          <TableCell className="text-sm">{r.row.closeDate}</TableCell>
                          <TableCell>{statusBadge(r.status, r.score)}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {r.match ? r.match.address : <span className="text-red-500 italic">—</span>}
                          </TableCell>
                          <TableCell className="text-sm">
                            {r.changes.salePrice ? (
                              <span>
                                <span className="line-through text-muted-foreground">{fmt(r.changes.salePrice.old)}</span>
                                {' → '}
                                <span className="font-semibold text-green-700">{fmt(r.changes.salePrice.new)}</span>
                              </span>
                            ) : r.match ? (
                              <span className="text-muted-foreground">{fmt(r.match.salePrice)}</span>
                            ) : '—'}
                          </TableCell>
                          <TableCell className="text-sm">
                            {r.changes.listPrice ? (
                              <span>
                                <span className="line-through text-muted-foreground">{fmt(r.changes.listPrice.old)}</span>
                                {' → '}
                                <span className="font-semibold text-green-700">{fmt(r.changes.listPrice.new)}</span>
                              </span>
                            ) : r.match ? (
                              <span className="text-muted-foreground">{fmt(r.match.listPrice)}</span>
                            ) : '—'}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
