'use client';
export const dynamic = 'force-dynamic';
// src/app/dashboard/admin/import-activities/page.tsx
// Bulk Activity Tracking Import — mirrors the transaction import flow

import { useRef, useState } from 'react';
import { useUser } from '@/firebase';
import { useIsAdminLike } from '@/hooks/useIsAdminLike';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Upload,
  FileSpreadsheet,
  ArrowLeft,
  Info,
  SkipForward,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import * as XLSX from 'xlsx';
import type { ActivityImportRow } from '@/lib/types/activityTracking';

// ─────────────────────────────────────────────────────────────────────────────

/** Canonical column headers matching the expected spreadsheet format */
const ACTIVITY_CSV_HEADERS = [
  'Row ID',
  'Date',
  'Agent',
  'Hours',
  'Notes',
  'Calls',
  'Spoke To',
  'Listing Appts Set',
  'Listing Appts Held',
  'Listing Contracts Signed',
  'Buyer Appts Set',
  'Buyer Appts Held',
  'Buyer Contracts Signed',
] as const;

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Maps normalized CSV header → ActivityImportRow key.
 * Includes common aliases from various spreadsheet formats.
 */
const HEADER_TO_KEY: Record<string, keyof ActivityImportRow> = {
  // Row / source ID
  'row id': 'sourceRowId',
  'row #': 'sourceRowId',
  '#': 'sourceRowId',
  'id': 'sourceRowId',
  'source row id': 'sourceRowId',
  'source_row_id': 'sourceRowId',

  // Date
  'date': 'activityDate',
  'activity date': 'activityDate',
  'activity_date': 'activityDate',
  'day': 'activityDate',
  'week of': 'activityDate',

  // Agent name
  'agent': 'agentName',
  'agent name': 'agentName',
  'agent_name': 'agentName',
  'name': 'agentName',
  'rep': 'agentName',

  // Hours
  'hours': 'hours',
  'hrs': 'hours',
  'hours worked': 'hours',

  // Notes
  'notes': 'notes',
  'note': 'notes',
  'comments': 'notes',
  'comment': 'notes',

  // Calls
  'calls': 'calls',
  'call': 'calls',
  'total calls': 'calls',
  'calls made': 'calls',
  'dials': 'calls',

  // Spoke to
  'spoke to': 'spokeTo',
  'spoke_to': 'spokeTo',
  'contacts': 'spokeTo',
  'conversations': 'spokeTo',
  'live answers': 'spokeTo',
  'talked to': 'spokeTo',

  // Listing appts
  'listing appts set': 'listingApptsSet',
  'listing_appts_set': 'listingApptsSet',
  'listing appt set': 'listingApptsSet',
  'listing appts': 'listingApptsSet',
  'listing appointments set': 'listingApptsSet',
  's. appts set': 'listingApptsSet',
  's appts set': 'listingApptsSet',

  'listing appts held': 'listingApptsHeld',
  'listing_appts_held': 'listingApptsHeld',
  'listing appt held': 'listingApptsHeld',
  'listing appointments held': 'listingApptsHeld',
  's. appts held': 'listingApptsHeld',
  's appts held': 'listingApptsHeld',

  'listing contracts signed': 'listingContractsSigned',
  'listing_contracts_signed': 'listingContractsSigned',
  'listing contract signed': 'listingContractsSigned',
  'listings signed': 'listingContractsSigned',
  'listing taken': 'listingContractsSigned',
  'listings taken': 'listingContractsSigned',
  's. contracts signed': 'listingContractsSigned',

  // Buyer appts
  'buyer appts set': 'buyerApptsSet',
  'buyer_appts_set': 'buyerApptsSet',
  'buyer appt set': 'buyerApptsSet',
  'buyer appointments set': 'buyerApptsSet',
  'b. appts set': 'buyerApptsSet',
  'b appts set': 'buyerApptsSet',

  'buyer appts held': 'buyerApptsHeld',
  'buyer_appts_held': 'buyerApptsHeld',
  'buyer appt held': 'buyerApptsHeld',
  'buyer appointments held': 'buyerApptsHeld',
  'b. appts held': 'buyerApptsHeld',
  'b appts held': 'buyerApptsHeld',

  'buyer contracts signed': 'buyerContractsSigned',
  'buyer_contracts_signed': 'buyerContractsSigned',
  'buyer contract signed': 'buyerContractsSigned',
  'buyers signed': 'buyerContractsSigned',
  'b. contracts signed': 'buyerContractsSigned',
  'b contracts signed': 'buyerContractsSigned',
  'offers accepted': 'buyerContractsSigned',
};

const REQUIRED_API_KEYS: (keyof ActivityImportRow)[] = ['agentName', 'activityDate'];

const COLUMN_GUIDES: { header: string; hint: string; required?: boolean }[] = [
  { header: 'Row ID', hint: 'Unique identifier from the source spreadsheet — used to prevent duplicate imports' },
  { header: 'Date', hint: 'Activity date: YYYY-MM-DD, MM/DD/YYYY, or Excel serial date', required: true },
  { header: 'Agent', hint: 'Agent full name — fuzzy matched to existing profiles', required: true },
  { header: 'Hours', hint: 'Hours worked that day (e.g. 8.5)' },
  { header: 'Notes', hint: 'Any free-text notes or comments for the day' },
  { header: 'Calls', hint: 'Total calls / dials made' },
  { header: 'Spoke To', hint: 'Number of live conversations' },
  { header: 'Listing Appts Set', hint: 'Listing (seller) appointments scheduled' },
  { header: 'Listing Appts Held', hint: 'Listing appointments that were held / completed' },
  { header: 'Listing Contracts Signed', hint: 'Listing contracts / agreements signed' },
  { header: 'Buyer Appts Set', hint: 'Buyer appointments scheduled' },
  { header: 'Buyer Appts Held', hint: 'Buyer appointments that were held / completed' },
  { header: 'Buyer Contracts Signed', hint: 'Buyer representation agreements or purchase contracts signed' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Parsing helpers
// ─────────────────────────────────────────────────────────────────────────────
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

type ParsedRow = Record<string, any> & { __rowNum: number; __errors: string[] };

function validateRow(row: ParsedRow, colMap: Record<string, string>): void {
  for (const apiKey of REQUIRED_API_KEYS) {
    const csvHeader = Object.entries(colMap).find(([, v]) => v === apiKey)?.[0];
    if (csvHeader && !String(row[csvHeader] ?? '').trim()) {
      row.__errors.push(`"${csvHeader}" is required`);
    }
  }
}

function parseCSV(text: string): { headers: string[]; rows: ParsedRow[] } {
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
  if (lines.length === 0) return { headers: [], rows: [] };
  const rawHeaders = parseCsvLine(lines[0]).map(h => h.trim());
  const headers = rawHeaders.map(normalizeHeader);
  const rows: ParsedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const row: ParsedRow = { __rowNum: i + 1, __errors: [] };
    headers.forEach((h, idx) => { row[h] = values[idx] ?? ''; });
    rows.push(row);
  }
  return { headers, rows };
}

function parseXLSX(data: ArrayBuffer): { headers: string[]; rows: ParsedRow[] } {
  const wb = XLSX.read(data, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const jsonData: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, dateNF: 'yyyy-mm-dd' });
  if (jsonData.length === 0) return { headers: [], rows: [] };

  const rawHeaders = (jsonData[0] || []).map((h: any) => String(h ?? '').trim());
  const headers = rawHeaders.map(normalizeHeader);
  const rows: ParsedRow[] = [];
  for (let i = 1; i < jsonData.length; i++) {
    const values = jsonData[i] || [];
    if (values.every((v: any) => !v && v !== 0)) continue;
    const row: ParsedRow = { __rowNum: i + 1, __errors: [] };
    headers.forEach((h, idx) => { row[h] = String(values[idx] ?? '').trim(); });
    rows.push(row);
  }
  return { headers, rows };
}

function mapRowToPayload(row: ParsedRow, colMap: Record<string, string>): ActivityImportRow {
  const payload: Record<string, string> = {};
  for (const [csvHeader, apiKey] of Object.entries(colMap)) {
    if (apiKey) payload[apiKey] = String(row[csvHeader] ?? '').trim();
  }
  return payload as unknown as ActivityImportRow;
}

function downloadTemplate() {
  const exampleRow = ['1', '2024-01-15', 'Jane Smith', '8', 'Good prospecting day', '40', '12', '2', '1', '1', '3', '2', '1'];
  const ws = XLSX.utils.aoa_to_sheet([ACTIVITY_CSV_HEADERS as unknown as string[], exampleRow]);
  ws['!cols'] = ACTIVITY_CSV_HEADERS.map(h => ({ wch: Math.max(h.length + 2, 14) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Activity Template');
  XLSX.writeFile(wb, 'activity-tracking-import-template.xlsx');
}

// ─────────────────────────────────────────────────────────────────────────────
type Step = 'upload' | 'mapping' | 'preview' | 'result';

type ImportResult = {
  ok: boolean;
  imported: number;
  duplicates: number;
  failed: number;
  errors: { row: number; error: string }[];
  autoCreatedAgents?: { name: string; agentId: string }[];
  fuzzyMatchedAgents?: { row: number; csvName: string; matchedName: string; similarity: number }[];
};

const ALL_API_KEYS: Array<{ key: string; label: string }> = [
  { key: 'sourceRowId', label: 'Row ID' },
  { key: 'activityDate', label: 'Activity Date' },
  { key: 'agentName', label: 'Agent Name' },
  { key: 'hours', label: 'Hours' },
  { key: 'notes', label: 'Notes' },
  { key: 'calls', label: 'Calls' },
  { key: 'spokeTo', label: 'Spoke To' },
  { key: 'listingApptsSet', label: 'Listing Appts Set' },
  { key: 'listingApptsHeld', label: 'Listing Appts Held' },
  { key: 'listingContractsSigned', label: 'Listing Contracts Signed' },
  { key: 'buyerApptsSet', label: 'Buyer Appts Set' },
  { key: 'buyerApptsHeld', label: 'Buyer Appts Held' },
  { key: 'buyerContractsSigned', label: 'Buyer Contracts Signed' },
];

// ─────────────────────────────────────────────────────────────────────────────
export default function BulkActivityImportPage() {
  const { user, loading: userLoading } = useUser();
  const { isAdmin, loading: adminLoading } = useIsAdminLike();

  const [step, setStep] = useState<Step>('upload');
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [fileName, setFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(false);
  const [columnMap, setColumnMap] = useState<Record<string, string>>({});
  const [lastBatchId, setLastBatchId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Auth guards ──────────────────────────────────────────────────────────
  if (userLoading || adminLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-1/3" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (!user) {
    return (
      <Alert><AlertTitle>Authentication Required</AlertTitle>
        <AlertDescription>Please sign in to access this page.</AlertDescription>
      </Alert>
    );
  }
  if (!isAdmin) {
    return (
      <Alert variant="destructive"><AlertTitle>Access Denied</AlertTitle>
        <AlertDescription>This page is restricted to administrators.</AlertDescription>
      </Alert>
    );
  }

  // ── File handling ────────────────────────────────────────────────────────
  const handleFile = (file: File) => {
    const isCSV = file.name.endsWith('.csv') || file.type === 'text/csv';
    const isXLSX = file.name.endsWith('.xlsx') || file.name.endsWith('.xls') ||
      file.type.includes('spreadsheetml') || file.type === 'application/vnd.ms-excel';

    if (!isCSV && !isXLSX) {
      setPageError('Please upload a .csv or .xlsx file.');
      return;
    }
    setPageError(null);
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (e) => {
      const { headers, rows } = isXLSX
        ? parseXLSX(e.target?.result as ArrayBuffer)
        : parseCSV(e.target?.result as string);

      if (rows.length === 0) { setPageError('The file appears to have no data rows.'); return; }

      // Auto-detect column mapping
      const autoMap: Record<string, string> = {};
      for (const h of headers) {
        const apiKey = HEADER_TO_KEY[h];
        if (apiKey && !Object.values(autoMap).includes(apiKey)) {
          autoMap[h] = apiKey;
        }
      }

      setCsvHeaders(headers);
      setParsedRows(rows);
      setColumnMap(autoMap);
      setStep('mapping');
    };

    if (isXLSX) reader.readAsArrayBuffer(file);
    else reader.readAsText(file);
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) handleFile(e.target.files[0]);
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  };

  // ── Validate rows once mapping is confirmed ──────────────────────────────
  const applyValidation = (rows: ParsedRow[], map: Record<string, string>): ParsedRow[] => {
    return rows.map(row => {
      const validated = { ...row, __errors: [] as string[] };
      validateRow(validated, map);
      return validated;
    });
  };

  const confirmMapping = () => {
    const validated = applyValidation(parsedRows, columnMap);
    setParsedRows(validated);
    setStep('preview');
  };

  // ── Import ───────────────────────────────────────────────────────────────
  const handleImport = async () => {
    if (!user) return;
    setImporting(true);
    setImportProgress(5);
    setPageError(null);

    const batchId = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setLastBatchId(batchId);

    try {
      const token = await user.getIdToken();
      const validRows = parsedRows
        .filter(r => r.__errors.length === 0)
        .map(r => mapRowToPayload(r, columnMap));

      if (validRows.length === 0) {
        setPageError('No valid rows to import. Fix validation errors first.');
        setImporting(false);
        return;
      }

      const CHUNK_SIZE = 500;
      const chunks: typeof validRows[] = [];
      for (let i = 0; i < validRows.length; i += CHUNK_SIZE) {
        chunks.push(validRows.slice(i, i + CHUNK_SIZE));
      }

      const accumulated: ImportResult = { ok: true, imported: 0, duplicates: 0, failed: 0, errors: [] };

      for (let i = 0; i < chunks.length; i++) {
        const res = await fetch('/api/admin/import-activities', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ rows: chunks[i], batchId }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || `Chunk ${i + 1} failed`);

        accumulated.imported += data.imported ?? 0;
        accumulated.duplicates += data.duplicates ?? 0;
        accumulated.failed += data.failed ?? 0;
        accumulated.errors.push(...(data.errors ?? []));
        if (data.fuzzyMatchedAgents) {
          accumulated.fuzzyMatchedAgents = [...(accumulated.fuzzyMatchedAgents ?? []), ...data.fuzzyMatchedAgents];
        }
        if (data.autoCreatedAgents) {
          accumulated.autoCreatedAgents = [...(accumulated.autoCreatedAgents ?? []), ...data.autoCreatedAgents];
        }

        setImportProgress(Math.round(((i + 1) / chunks.length) * 100));
      }

      setImportResult(accumulated);
      setStep('result');
    } catch (err: any) {
      setPageError(err.message || 'Import failed.');
    } finally {
      setImporting(false);
    }
  };

  // ── Undo last batch ──────────────────────────────────────────────────────
  const handleUndoBatch = async () => {
    if (!lastBatchId || !user) return;
    if (!confirm(`Delete all records from batch ${lastBatchId}? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/import-activities?batchId=${encodeURIComponent(lastBatchId)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Delete failed');
      alert(`Deleted ${data.deleted} activity records from this batch.`);
      setLastBatchId(null);
    } catch (err: any) {
      setPageError(err.message || 'Undo failed');
    } finally {
      setDeleting(false);
    }
  };

  // ── Reset ────────────────────────────────────────────────────────────────
  const reset = () => {
    setParsedRows([]);
    setCsvHeaders([]);
    setFileName('');
    setImportResult(null);
    setPageError(null);
    setImportProgress(0);
    setColumnMap({});
    setStep('upload');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const invalidRows = parsedRows.filter(r => r.__errors.length > 0);
  const validRows = parsedRows.filter(r => r.__errors.length === 0);
  const requiredMapped = REQUIRED_API_KEYS.every(key =>
    Object.values(columnMap).includes(key as string)
  );

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <Link href="/dashboard/admin/import" className="hover:underline flex items-center gap-1">
              <ArrowLeft className="h-3 w-3" /> Transaction Import
            </Link>
            <span>/</span>
            <span>Bulk Activity Import</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Bulk Activity Import</h1>
          <p className="text-muted-foreground mt-1">
            Upload an Excel or CSV spreadsheet of agent daily activity data. Records are deduplicated and stored
            in each agent&apos;s activity history for trend analysis.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={downloadTemplate}>
            <Download className="mr-2 h-4 w-4" /> Download Template
          </Button>
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 text-sm flex-wrap">
        {(['upload', 'mapping', 'preview', 'result'] as Step[]).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            {i > 0 && <div className="h-px w-6 bg-border" />}
            <span className={cn(
              'px-3 py-1 rounded-full font-medium',
              step === s ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
            )}>
              {i + 1}. {{ upload: 'Upload', mapping: 'Map Columns', preview: 'Preview', result: 'Result' }[s]}
            </span>
          </div>
        ))}
      </div>

      {/* Global error */}
      {pageError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{pageError}</AlertDescription>
        </Alert>
      )}

      {/* ── STEP 1: UPLOAD ──────────────────────────────────────────────── */}
      {step === 'upload' && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Upload Excel or CSV File</CardTitle>
              <CardDescription>
                Download the template above and fill it in with your agent activity data, then upload it here.
                Duplicate rows (matched by Row ID or by agent + date + metrics) are automatically skipped.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div
                onDrop={onDrop}
                onDragOver={e => e.preventDefault()}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-border rounded-xl p-12 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
              >
                <FileSpreadsheet className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-lg font-medium mb-1">Drop your Excel (.xlsx) or CSV file here</p>
                <p className="text-sm text-muted-foreground mb-4">or click to browse</p>
                <Button variant="outline" size="sm" type="button">
                  <Upload className="mr-2 h-4 w-4" /> Choose File
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  className="hidden"
                  onChange={onFileChange}
                />
              </div>
            </CardContent>
          </Card>

          {/* Column guide */}
          <Card>
            <CardHeader className="cursor-pointer select-none" onClick={() => setShowGuide(v => !v)}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Info className="h-4 w-4 text-primary" />
                  <CardTitle className="text-base">Column Reference Guide</CardTitle>
                </div>
                <span className="text-xs text-muted-foreground">{showGuide ? 'Hide' : 'Show'}</span>
              </div>
              <CardDescription>All 13 columns and what they mean</CardDescription>
            </CardHeader>
            {showGuide && (
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8">#</TableHead>
                        <TableHead>Column Header</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-center w-24">Required</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {COLUMN_GUIDES.map((col, i) => (
                        <TableRow key={col.header}>
                          <TableCell className="text-muted-foreground text-xs">{i + 1}</TableCell>
                          <TableCell className="font-mono text-xs font-medium">{col.header}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{col.hint}</TableCell>
                          <TableCell className="text-center">
                            {col.required
                              ? <Badge variant="destructive" className="text-xs">Required</Badge>
                              : <span className="text-xs text-muted-foreground">Optional</span>}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            )}
          </Card>
        </div>
      )}

      {/* ── STEP 2: MAP COLUMNS ─────────────────────────────────────────── */}
      {step === 'mapping' && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Map Your CSV Columns</CardTitle>
              <CardDescription>
                We auto-detected most columns from &quot;{fileName}&quot;. Review the mapping below and correct any
                that look wrong. The &quot;Sample Data&quot; column shows the first row.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-auto mb-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8">#</TableHead>
                      <TableHead>Your Column</TableHead>
                      <TableHead>Sample Data (Row 1)</TableHead>
                      <TableHead>Maps To</TableHead>
                      <TableHead className="text-center w-24">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {csvHeaders.map((h, i) => {
                      const mapped = columnMap[h] || '';
                      const isRequired = REQUIRED_API_KEYS.includes(mapped as any);
                      const sampleVal = parsedRows[0]?.[h] ?? '';
                      return (
                        <TableRow key={h} className={!mapped ? 'bg-yellow-50 dark:bg-yellow-950/10' : ''}>
                          <TableCell className="text-muted-foreground text-xs">{i + 1}</TableCell>
                          <TableCell className="font-mono text-xs font-medium">{h}</TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[180px] truncate">{sampleVal}</TableCell>
                          <TableCell>
                            <Select
                              value={mapped || '__skip__'}
                              onValueChange={val => {
                                const next = { ...columnMap };
                                if (val === '__skip__') {
                                  delete next[h];
                                } else {
                                  // Prevent mapping the same key twice
                                  for (const [k, v] of Object.entries(next)) {
                                    if (v === val && k !== h) delete next[k];
                                  }
                                  next[h] = val;
                                }
                                setColumnMap(next);
                              }}
                            >
                              <SelectTrigger className="h-8 text-xs w-56">
                                <SelectValue placeholder="— skip column —" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__skip__">— skip column —</SelectItem>
                                {ALL_API_KEYS.map(opt => (
                                  <SelectItem key={opt.key} value={opt.key}>{opt.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="text-center">
                            {isRequired
                              ? <Badge variant="destructive" className="text-xs">Required</Badge>
                              : mapped
                                ? <Badge variant="secondary" className="text-xs">Mapped</Badge>
                                : <Badge variant="outline" className="text-xs text-muted-foreground">Skipped</Badge>}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {!requiredMapped && (
                <Alert variant="destructive" className="mb-4">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    Required columns not mapped:{' '}
                    {REQUIRED_API_KEYS
                      .filter(k => !Object.values(columnMap).includes(k as string))
                      .map(k => ALL_API_KEYS.find(a => a.key === k)?.label ?? k)
                      .join(', ')}
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex gap-3">
                <Button variant="outline" onClick={reset}>
                  <ArrowLeft className="mr-2 h-4 w-4" /> Back
                </Button>
                <Button onClick={confirmMapping} disabled={!requiredMapped}>
                  Confirm Mapping — Preview {parsedRows.length} Rows
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── STEP 3: PREVIEW ─────────────────────────────────────────────── */}
      {step === 'preview' && (
        <div className="space-y-6">
          {/* Summary counts */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Total Rows', value: parsedRows.length, color: '' },
              { label: 'Ready to Import', value: validRows.length, color: 'text-green-600' },
              { label: 'Validation Errors', value: invalidRows.length, color: invalidRows.length > 0 ? 'text-red-600' : '' },
              { label: 'Columns Mapped', value: Object.keys(columnMap).length, color: '' },
            ].map(c => (
              <Card key={c.label}>
                <CardContent className="pt-4">
                  <div className={cn('text-2xl font-bold', c.color)}>{c.value}</div>
                  <div className="text-xs text-muted-foreground">{c.label}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Error rows */}
          {invalidRows.length > 0 && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>{invalidRows.length} row{invalidRows.length !== 1 ? 's' : ''} with errors — will be skipped</AlertTitle>
              <AlertDescription>
                <ul className="mt-2 space-y-1 text-xs">
                  {invalidRows.slice(0, 10).map(r => (
                    <li key={r.__rowNum}>Row {r.__rowNum}: {r.__errors.join(', ')}</li>
                  ))}
                  {invalidRows.length > 10 && <li>…and {invalidRows.length - 10} more</li>}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {/* Preview table */}
          <Card>
            <CardHeader>
              <CardTitle>Preview (first 50 rows)</CardTitle>
              <CardDescription>Verify your data looks correct before importing.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">Row</TableHead>
                      {ALL_API_KEYS
                        .filter(k => Object.values(columnMap).includes(k.key))
                        .map(k => <TableHead key={k.key} className="text-xs">{k.label}</TableHead>)}
                      <TableHead className="w-20 text-center">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsedRows.slice(0, 50).map(row => {
                      const payload = mapRowToPayload(row, columnMap);
                      const hasError = row.__errors.length > 0;
                      return (
                        <TableRow key={row.__rowNum} className={hasError ? 'bg-red-50 dark:bg-red-950/10' : ''}>
                          <TableCell className="text-xs text-muted-foreground">{row.__rowNum}</TableCell>
                          {ALL_API_KEYS
                            .filter(k => Object.values(columnMap).includes(k.key))
                            .map(k => (
                              <TableCell key={k.key} className="text-xs max-w-[120px] truncate">
                                {(payload as any)[k.key] || <span className="text-muted-foreground/50">—</span>}
                              </TableCell>
                            ))}
                          <TableCell className="text-center">
                            {hasError
                              ? <Badge variant="destructive" className="text-xs">Error</Badge>
                              : <Badge variant="secondary" className="text-xs text-green-600">Ready</Badge>}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {importing && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Importing…</span>
                <span>{importProgress}%</span>
              </div>
              <Progress value={importProgress} />
            </div>
          )}

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep('mapping')} disabled={importing}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>
            <Button onClick={handleImport} disabled={importing || validRows.length === 0}>
              <Upload className="mr-2 h-4 w-4" />
              {importing ? 'Importing…' : `Import ${validRows.length} Row${validRows.length !== 1 ? 's' : ''}`}
            </Button>
          </div>
        </div>
      )}

      {/* ── STEP 4: RESULT ──────────────────────────────────────────────── */}
      {step === 'result' && importResult && (
        <div className="space-y-6">
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Rows Imported', value: importResult.imported, color: 'text-green-600' },
              { label: 'Duplicates Skipped', value: importResult.duplicates, color: 'text-yellow-600' },
              { label: 'Rows Errored', value: importResult.failed, color: importResult.failed > 0 ? 'text-red-600' : '' },
              { label: 'Total Processed', value: importResult.imported + importResult.duplicates + importResult.failed, color: '' },
            ].map(c => (
              <Card key={c.label}>
                <CardContent className="pt-4">
                  <div className={cn('text-3xl font-bold', c.color)}>{c.value}</div>
                  <div className="text-sm text-muted-foreground">{c.label}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Fuzzy matches */}
          {(importResult.fuzzyMatchedAgents?.length ?? 0) > 0 && (
            <Card className="border-green-500/30">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  {importResult.fuzzyMatchedAgents!.length} Misspelled Name{importResult.fuzzyMatchedAgents!.length !== 1 ? 's' : ''} Auto-Corrected
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1">
                  {importResult.fuzzyMatchedAgents!.slice(0, 20).map((m, i) => (
                    <div key={i} className="text-sm flex items-center gap-2">
                      <span className="font-mono text-red-500">{m.csvName}</span>
                      <span className="text-muted-foreground">→</span>
                      <span className="font-mono text-green-600">{m.matchedName}</span>
                      <Badge variant="secondary" className="text-xs">{m.similarity}% match</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Auto-created agents */}
          {(importResult.autoCreatedAgents?.length ?? 0) > 0 && (
            <Card className="border-blue-500/30">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Info className="h-4 w-4 text-blue-500" />
                  {importResult.autoCreatedAgents!.length} New Agent Profile{importResult.autoCreatedAgents!.length !== 1 ? 's' : ''} Created
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {importResult.autoCreatedAgents!.map(a => (
                    <Badge key={a.agentId} variant="outline">{a.name}</Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Errors */}
          {importResult.errors.length > 0 && (
            <Card className="border-red-500/30">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                  {importResult.errors.length} Row{importResult.errors.length !== 1 ? 's' : ''} Failed
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1">
                  {importResult.errors.slice(0, 20).map((e, i) => (
                    <div key={i} className="text-sm text-red-600">Row {e.row}: {e.error}</div>
                  ))}
                  {importResult.errors.length > 20 && (
                    <div className="text-sm text-muted-foreground">…and {importResult.errors.length - 20} more</div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Duplicate info */}
          {importResult.duplicates > 0 && (
            <Alert>
              <SkipForward className="h-4 w-4" />
              <AlertTitle>{importResult.duplicates} duplicate row{importResult.duplicates !== 1 ? 's' : ''} skipped</AlertTitle>
              <AlertDescription>
                These rows matched existing records by Row ID or by agent + date + metrics. No duplicates were written.
              </AlertDescription>
            </Alert>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-3">
            <Button onClick={reset}>
              <Upload className="mr-2 h-4 w-4" /> Import Another File
            </Button>
            {lastBatchId && importResult.imported > 0 && (
              <Button variant="outline" onClick={handleUndoBatch} disabled={deleting}>
                <Trash2 className="mr-2 h-4 w-4" />
                {deleting ? 'Deleting…' : 'Undo This Import'}
              </Button>
            )}
            <Button variant="outline" asChild>
              <Link href="/dashboard/admin/agents">View Agents</Link>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
