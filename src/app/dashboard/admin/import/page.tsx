'use client';

import { useCallback, useRef, useState } from 'react';
import { useUser } from '@/firebase';
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
  AlertTriangle,
  CheckCircle2,
  Download,
  Upload,
  FileSpreadsheet,
  ArrowLeft,
  XCircle,
  Info,
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
const ADMIN_UID = '1kJsXTU1JjZXMidmoIPXgXxizll1';

/** Exact CSV column headers in order */
const CSV_HEADERS = [
  'Agent Name',
  'Type of Closing',
  'Status',
  'Deal Type',
  'Address',
  'Client Name',
  'Source',
  'Listing Date',
  'Under Contract Date',
  'Proj Close Date',
  'Exp Date',
  'Closed Date',
  'List Price / Buyer Rep Price',
  'Sale Price',
  'Commission %',
  'GCI',
  'Transaction Fee',
  'Broker %',
  'Broker GCI',
  'Agent % / % to Member',
  'Agent $ (Primary GCI)',
  'Mortgage Company',
  'Title Company',
] as const;

/** Maps CSV header → API row key */
const HEADER_TO_KEY: Record<string, string> = {
  'Agent Name': 'agentName',
  'Type of Closing': 'closingType',
  'Status': 'status',
  'Deal Type': 'dealType',
  'Address': 'address',
  'Client Name': 'clientName',
  'Source': 'dealSource',
  'Listing Date': 'listingDate',
  'Under Contract Date': 'underContractDate',
  'Proj Close Date': 'projCloseDate',
  'Exp Date': 'expDate',
  'Closed Date': 'closedDate',
  'List Price / Buyer Rep Price': 'listPrice',
  'Sale Price': 'salePrice',
  'Commission %': 'commissionPct',
  'GCI': 'gci',
  'Transaction Fee': 'transactionFee',
  'Broker %': 'brokerPct',
  'Broker GCI': 'brokerGci',
  'Agent % / % to Member': 'agentPct',
  'Agent $ (Primary GCI)': 'agentDollar',
  'Mortgage Company': 'mortgageCompany',
  'Title Company': 'titleCompany',
};

const REQUIRED_COLUMNS = ['Agent Name', 'Address', 'Status'];

type ParsedRow = Record<string, string> & { __rowNum: number; __errors: string[] };

type ImportResult = {
  ok: boolean;
  imported: number;
  failed: number;
  errors: { row: number; error: string }[];
};

// ─────────────────────────────────────────────────────────────────────────────
// CSV Helpers
// ─────────────────────────────────────────────────────────────────────────────
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
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

function parseCSV(text: string): { headers: string[]; rows: ParsedRow[] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length === 0) return { headers: [], rows: [] };

  const headers = parseCsvLine(lines[0]).map((h) => h.trim());
  const rows: ParsedRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const row: ParsedRow = { __rowNum: i + 1, __errors: [] };

    headers.forEach((h, idx) => {
      row[h] = values[idx] ?? '';
    });

    // Validate required columns
    for (const req of REQUIRED_COLUMNS) {
      if (!row[req]?.trim()) {
        row.__errors.push(`"${req}" is required`);
      }
    }

    rows.push(row);
  }

  return { headers, rows };
}

/** Map parsed CSV row (header-keyed) → API row (key-keyed) */
function mapRowToApiPayload(row: ParsedRow): Record<string, string> {
  const payload: Record<string, string> = {};
  for (const [header, key] of Object.entries(HEADER_TO_KEY)) {
    payload[key] = row[header] ?? '';
  }
  return payload;
}

/** Generate a CSV template download */
function downloadTemplate() {
  const exampleRow = [
    'Jane Smith',
    'buyer',
    'closed',
    'residential sale',
    '123 Main St, Lafayette LA 70508',
    'John Doe',
    'Boomtown',
    '2024-01-15',
    '2024-02-01',
    '2024-03-01',
    '',
    '2024-03-15',
    '325000',
    '315000',
    '3',
    '9450',
    '395',
    '30',
    '2835',
    '70',
    '6615',
    'First Federal Bank',
    'Acadian Title',
  ];

  const csvContent =
    CSV_HEADERS.join(',') + '\n' + exampleRow.map((v) => `"${v}"`).join(',') + '\n';

  const blob = new Blob([csvContent], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'smart-broker-import-template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────────────────────────────────────
// Column Guides
// ─────────────────────────────────────────────────────────────────────────────
const COLUMN_GUIDES: { header: string; hint: string; required?: boolean }[] = [
  { header: 'Agent Name', hint: 'Must match agent profile name exactly (e.g. "Jane Smith")', required: true },
  { header: 'Type of Closing', hint: 'buyer · listing · referral' },
  { header: 'Status', hint: 'closed · pending · under contract · canceled · expired', required: true },
  { header: 'Deal Type', hint: 'residential sale · residential lease · land · commercial sale · commercial lease' },
  { header: 'Address', hint: 'Full property address', required: true },
  { header: 'Client Name', hint: 'Buyer or seller name (optional)' },
  { header: 'Source', hint: 'Boomtown · referral · sphere · sign call · Company Gen · Social · Open House · FSBO · Expired' },
  { header: 'Listing Date', hint: 'YYYY-MM-DD or MM/DD/YYYY' },
  { header: 'Under Contract Date', hint: 'YYYY-MM-DD or MM/DD/YYYY' },
  { header: 'Proj Close Date', hint: 'Projected closing date' },
  { header: 'Exp Date', hint: 'Listing expiration date' },
  { header: 'Closed Date', hint: 'Actual closing date — used for year attribution' },
  { header: 'List Price / Buyer Rep Price', hint: 'Original list price or buyer representation price ($)' },
  { header: 'Sale Price', hint: 'Actual sale/close price ($)' },
  { header: 'Commission %', hint: 'e.g. 3 for 3%' },
  { header: 'GCI', hint: 'Gross Commission Income ($)' },
  { header: 'Transaction Fee', hint: 'Flat transaction fee charged ($)' },
  { header: 'Broker %', hint: 'Broker's split percentage (e.g. 30 for 30%)' },
  { header: 'Broker GCI', hint: 'Dollar amount retained by broker ($)' },
  { header: 'Agent % / % to Member', hint: 'Agent split percentage (e.g. 70 for 70%)' },
  { header: 'Agent $ (Primary GCI)', hint: '⭐ Agent net commission — overrides recalculation for historical records ($)' },
  { header: 'Mortgage Company', hint: 'Lender name (optional)' },
  { header: 'Title Company', hint: 'Title/escrow company (optional)' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────
type Step = 'upload' | 'preview' | 'result';

export default function BulkImportPage() {
  const { user, loading: userLoading } = useUser();

  const [step, setStep] = useState<Step>('upload');
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [fileName, setFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Auth guards ──────────────────────────────────────────────────────────
  if (userLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-1/3" />
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

  if (user.uid !== ADMIN_UID) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Access Denied</AlertTitle>
        <AlertDescription>This page is restricted to administrators.</AlertDescription>
      </Alert>
    );
  }

  // ── File handler ─────────────────────────────────────────────────────────
  const handleFile = (file: File) => {
    if (!file.name.endsWith('.csv') && file.type !== 'text/csv') {
      setPageError('Please upload a .csv file.');
      return;
    }
    setPageError(null);
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const { headers, rows } = parseCSV(text);

      // Check for missing required columns
      const missingCols = REQUIRED_COLUMNS.filter((c) => !headers.includes(c));
      if (missingCols.length > 0) {
        setPageError(
          `Missing required columns: ${missingCols.join(', ')}. Make sure you are using the correct template.`
        );
        return;
      }

      if (rows.length === 0) {
        setPageError('The CSV file appears to have no data rows.');
        return;
      }

      setCsvHeaders(headers);
      setParsedRows(rows);
      setStep('preview');
    };
    reader.readAsText(file);
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, []);

  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => e.preventDefault();

  // ── Import handler ───────────────────────────────────────────────────────
  const handleImport = async () => {
    if (!user) return;
    setImporting(true);
    setImportProgress(10);

    try {
      const token = await user.getIdToken();
      setImportProgress(20);

      const validRows = parsedRows
        .filter((r) => r.__errors.length === 0)
        .map(mapRowToApiPayload);

      if (validRows.length === 0) {
        setPageError('No valid rows to import. Fix validation errors first.');
        setImporting(false);
        return;
      }

      setImportProgress(40);

      const res = await fetch('/api/admin/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ rows: validRows }),
      });

      setImportProgress(80);
      const data = await res.json();
      setImportProgress(100);

      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Import failed');
      }

      setImportResult(data);
      setStep('result');
    } catch (err: any) {
      setPageError(err.message || 'Import failed. Please try again.');
    } finally {
      setImporting(false);
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
    setStep('upload');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const invalidRows = parsedRows.filter((r) => r.__errors.length > 0);
  const validRows = parsedRows.filter((r) => r.__errors.length === 0);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <Link href="/dashboard/admin/transactions" className="hover:underline flex items-center gap-1">
              <ArrowLeft className="h-3 w-3" /> Transaction Ledger
            </Link>
            <span>/</span>
            <span>Bulk Import</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Historical CSV Import</h1>
          <p className="text-muted-foreground mt-1">
            Upload past transactions from a spreadsheet. Transactions are tagged{' '}
            <Badge variant="secondary" className="text-xs">import</Badge> and will not trigger recalculations.
          </p>
        </div>
        <Button variant="outline" onClick={downloadTemplate}>
          <Download className="mr-2 h-4 w-4" /> Download Template
        </Button>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 text-sm">
        {(['upload', 'preview', 'result'] as Step[]).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            {i > 0 && <div className="h-px w-6 bg-border" />}
            <span
              className={cn(
                'px-3 py-1 rounded-full font-medium',
                step === s
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground'
              )}
            >
              {i + 1}. {s.charAt(0).toUpperCase() + s.slice(1)}
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

      {/* ── STEP 1: UPLOAD ────────────────────────────────────────────────── */}
      {step === 'upload' && (
        <div className="space-y-6">
          {/* Drop zone */}
          <Card>
            <CardHeader>
              <CardTitle>Upload CSV File</CardTitle>
              <CardDescription>
                Download the template above, fill it in with your historical transactions, then upload it here.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div
                onDrop={onDrop}
                onDragOver={onDragOver}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-border rounded-xl p-12 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
              >
                <FileSpreadsheet className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-lg font-medium mb-1">Drop your CSV file here</p>
                <p className="text-sm text-muted-foreground mb-4">or click to browse</p>
                <Button variant="outline" size="sm" type="button">
                  <Upload className="mr-2 h-4 w-4" /> Choose File
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={onFileChange}
                />
              </div>
            </CardContent>
          </Card>

          {/* Column guide toggle */}
          <Card>
            <CardHeader
              className="cursor-pointer select-none"
              onClick={() => setShowGuide((v) => !v)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Info className="h-4 w-4 text-primary" />
                  <CardTitle className="text-base">Column Reference Guide</CardTitle>
                </div>
                <span className="text-xs text-muted-foreground">{showGuide ? 'Hide' : 'Show'}</span>
              </div>
              <CardDescription>All 23 columns and what they mean</CardDescription>
            </CardHeader>
            {showGuide && (
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8">#</TableHead>
                        <TableHead>Column Header</TableHead>
                        <TableHead>Description / Accepted Values</TableHead>
                        <TableHead className="text-center w-20">Required</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {COLUMN_GUIDES.map((col, i) => (
                        <TableRow key={col.header}>
                          <TableCell className="text-muted-foreground text-xs">{i + 1}</TableCell>
                          <TableCell className="font-mono text-xs font-medium">{col.header}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{col.hint}</TableCell>
                          <TableCell className="text-center">
                            {col.required ? (
                              <Badge variant="destructive" className="text-xs">Required</Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">Optional</span>
                            )}
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

      {/* ── STEP 2: PREVIEW ───────────────────────────────────────────────── */}
      {step === 'preview' && (
        <div className="space-y-6">
          {/* Summary bar */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="border-blue-500/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Total Rows</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{parsedRows.length}</p>
                <p className="text-xs text-muted-foreground mt-1">{fileName}</p>
              </CardContent>
            </Card>
            <Card className="border-green-500/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Ready to Import</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-green-600">{validRows.length}</p>
                <p className="text-xs text-muted-foreground mt-1">will be imported</p>
              </CardContent>
            </Card>
            <Card className={cn('border-red-500/30', invalidRows.length === 0 && 'border-border')}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Validation Errors</CardTitle>
              </CardHeader>
              <CardContent>
                <p className={cn('text-3xl font-bold', invalidRows.length > 0 ? 'text-red-600' : 'text-muted-foreground')}>
                  {invalidRows.length}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {invalidRows.length > 0 ? 'will be skipped' : 'all rows valid ✓'}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Validation warnings */}
          {invalidRows.length > 0 && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>{invalidRows.length} row{invalidRows.length !== 1 ? 's' : ''} have errors and will be skipped</AlertTitle>
              <AlertDescription>
                <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
                  {invalidRows.slice(0, 10).map((r) => (
                    <li key={r.__rowNum}>
                      Row {r.__rowNum} ({r['Agent Name'] || 'no agent'} — {r['Address'] || 'no address'}): {r.__errors.join('; ')}
                    </li>
                  ))}
                  {invalidRows.length > 10 && (
                    <li>…and {invalidRows.length - 10} more</li>
                  )}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {/* Data preview table */}
          <Card>
            <CardHeader>
              <CardTitle>Preview — First 50 Rows</CardTitle>
              <CardDescription>
                Scroll right to see all columns. Rows with errors (red) will be skipped.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-auto max-h-[500px] text-xs">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="sticky left-0 bg-background z-10 w-8">#</TableHead>
                      <TableHead className="sticky left-8 bg-background z-10">Status</TableHead>
                      {CSV_HEADERS.map((h) => (
                        <TableHead key={h} className="whitespace-nowrap">{h}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsedRows.slice(0, 50).map((row) => (
                      <TableRow
                        key={row.__rowNum}
                        className={row.__errors.length > 0 ? 'bg-red-50 dark:bg-red-950/20' : ''}
                      >
                        <TableCell className="sticky left-0 bg-background z-10 font-mono text-muted-foreground">
                          {row.__rowNum}
                        </TableCell>
                        <TableCell className="sticky left-8 bg-background z-10">
                          {row.__errors.length === 0 ? (
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          ) : (
                            <div className="flex items-center gap-1">
                              <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                              <span className="text-red-600 text-xs">{row.__errors[0]}</span>
                            </div>
                          )}
                        </TableCell>
                        {CSV_HEADERS.map((h) => (
                          <TableCell key={h} className="whitespace-nowrap max-w-[180px] truncate">
                            {row[h] ?? ''}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {parsedRows.length > 50 && (
                  <p className="text-center text-xs text-muted-foreground py-3">
                    Showing 50 of {parsedRows.length} rows — all rows will be imported.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Progress bar (shows during import) */}
          {importing && (
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm font-medium mb-2">Importing {validRows.length} transactions…</p>
                <Progress value={importProgress} className="h-2" />
                <p className="text-xs text-muted-foreground mt-1">{importProgress}% complete</p>
              </CardContent>
            </Card>
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={handleImport} disabled={importing || validRows.length === 0}>
              {importing ? (
                <>Importing…</>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Import {validRows.length} Transaction{validRows.length !== 1 ? 's' : ''}
                </>
              )}
            </Button>
            <Button variant="outline" onClick={reset} disabled={importing}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Start Over
            </Button>
            {invalidRows.length > 0 && validRows.length > 0 && (
              <p className="text-sm text-muted-foreground">
                {invalidRows.length} invalid row{invalidRows.length !== 1 ? 's' : ''} will be skipped.
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── STEP 3: RESULT ────────────────────────────────────────────────── */}
      {step === 'result' && importResult && (
        <div className="space-y-6">
          {/* Result hero */}
          <Card className={cn(
            'border-2',
            importResult.failed === 0 ? 'border-green-500/40' : 'border-yellow-500/40'
          )}>
            <CardContent className="pt-8 pb-8 text-center">
              {importResult.failed === 0 ? (
                <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto mb-4" />
              ) : (
                <AlertTriangle className="h-16 w-16 text-yellow-500 mx-auto mb-4" />
              )}
              <h2 className="text-2xl font-bold mb-2">
                {importResult.imported} Transaction{importResult.imported !== 1 ? 's' : ''} Imported
              </h2>
              {importResult.failed > 0 && (
                <p className="text-muted-foreground">
                  {importResult.failed} row{importResult.failed !== 1 ? 's' : ''} failed and were skipped.
                </p>
              )}
              {importResult.failed === 0 && (
                <p className="text-muted-foreground">All rows imported successfully.</p>
              )}
            </CardContent>
          </Card>

          {/* Failed rows (server-side failures) */}
          {importResult.errors && importResult.errors.length > 0 && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Server-side import errors</AlertTitle>
              <AlertDescription>
                <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
                  {importResult.errors.slice(0, 20).map((e, i) => (
                    <li key={i}>Row {e.row}: {e.error}</li>
                  ))}
                  {importResult.errors.length > 20 && (
                    <li>…and {importResult.errors.length - 20} more</li>
                  )}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-3">
            <Link href="/dashboard/admin/transactions">
              <Button>
                <CheckCircle2 className="mr-2 h-4 w-4" /> View Transaction Ledger
              </Button>
            </Link>
            <Button variant="outline" onClick={reset}>
              <Upload className="mr-2 h-4 w-4" /> Import Another File
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
