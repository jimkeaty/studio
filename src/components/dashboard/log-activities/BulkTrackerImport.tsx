'use client';

/**
 * BulkTrackerImport
 *
 * Lets agents upload a CSV (or paste rows) of historical daily tracking data.
 * Each row maps to one day's activity and is written into the `daily_activity`
 * Firestore collection — the same source used by the calendar heat-map and the
 * KPI dashboard.
 *
 * Supported CSV columns (flexible naming):
 *   date (required), calls, engagements, appointmentsSet, appointmentsHeld,
 *   contracts, startTime, endTime, notes
 *
 * Column name aliases are handled server-side, but the template uses the
 * canonical names for clarity.
 */

import { useState, useRef } from 'react';
import { useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Upload, FileText, CheckCircle2, AlertTriangle, X, Download, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ParsedRow {
  rowNum: number;
  date: string;
  calls: number;
  engagements: number;
  appointmentsSet: number;
  appointmentsHeld: number;
  contracts: number;
  startTime: string;
  endTime: string;
  notes: string;
  valid: boolean;
  errors: string[];
  raw: Record<string, string>;
}

const SAMPLE_CSV = `date,calls,engagements,appointmentsSet,appointmentsHeld,contracts,startTime,endTime,notes
2026-01-06,45,12,2,1,0,08:00,17:00,Good prospecting day
2026-01-07,38,8,1,2,1,08:30,16:30,Held 2 appointments - one contract
2026-01-08,52,15,3,0,0,08:00,18:00,High call volume
2026-01-09,0,0,0,0,0,,,Day off
2026-01-12,41,10,2,1,0,09:00,17:00,`;

const COLUMN_ALIASES: Record<string, string> = {
  'date': 'date', 'activity_date': 'date', 'activitydate': 'date', 'day': 'date',
  'calls': 'calls', 'callscount': 'calls', 'calls_count': 'calls', 'dials': 'calls', 'phone_calls': 'calls',
  'engagements': 'engagements', 'engagementscount': 'engagements', 'spoketo': 'engagements', 'spoke_to': 'engagements', 'contacts': 'engagements', 'conversations': 'engagements',
  'appointmentsset': 'appointmentsSet', 'appointments_set': 'appointmentsSet', 'appts_set': 'appointmentsSet', 'apptset': 'appointmentsSet', 'set': 'appointmentsSet',
  'appointmentsheld': 'appointmentsHeld', 'appointments_held': 'appointmentsHeld', 'appts_held': 'appointmentsHeld', 'apptheld': 'appointmentsHeld', 'held': 'appointmentsHeld',
  'contracts': 'contracts', 'contractswritten': 'contracts', 'contracts_written': 'contracts', 'signed': 'contracts',
  'starttime': 'startTime', 'start_time': 'startTime', 'start': 'startTime',
  'endtime': 'endTime', 'end_time': 'endTime', 'end': 'endTime',
  'notes': 'notes', 'note': 'notes', 'comments': 'notes',
};

function normalizeKey(k: string): string {
  return k.toLowerCase().replace(/[\s_-]/g, '');
}

function normalizeRow(raw: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    const nk = normalizeKey(k);
    out[COLUMN_ALIASES[nk] ?? k] = v;
  }
  return out;
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map(line => {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') { inQuotes = !inQuotes; }
      else if (ch === ',' && !inQuotes) { values.push(current.trim()); current = ''; }
      else { current += ch; }
    }
    values.push(current.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i] ?? ''; });
    return row;
  }).filter(row => Object.values(row).some(v => v.trim()));
}

function parseDate(v: string): string | null {
  if (!v) return null;
  const s = v.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) return `${mdy[3]}-${mdy[1].padStart(2, '0')}-${mdy[2].padStart(2, '0')}`;
  const mdyShort = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (mdyShort) {
    const y = parseInt(mdyShort[3]) >= 50 ? `19${mdyShort[3]}` : `20${mdyShort[3]}`;
    return `${y}-${mdyShort[1].padStart(2, '0')}-${mdyShort[2].padStart(2, '0')}`;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function toNum(v: string | undefined): number {
  if (!v) return 0;
  const n = Number(v.replace(/[^0-9.-]/g, '').trim());
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
}

function validateRow(raw: Record<string, string>, rowNum: number): ParsedRow {
  const norm = normalizeRow(raw);
  const errors: string[] = [];
  const date = parseDate(norm.date ?? '');
  if (!date) errors.push('Invalid or missing date');
  return {
    rowNum,
    date: date ?? norm.date ?? '',
    calls: toNum(norm.calls),
    engagements: toNum(norm.engagements),
    appointmentsSet: toNum(norm.appointmentsSet),
    appointmentsHeld: toNum(norm.appointmentsHeld),
    contracts: toNum(norm.contracts),
    startTime: (norm.startTime ?? '').trim(),
    endTime: (norm.endTime ?? '').trim(),
    notes: (norm.notes ?? '').trim(),
    valid: errors.length === 0,
    errors,
    raw: norm,
  };
}

interface BulkTrackerImportProps {
  onImportComplete?: (count: number) => void;
  viewAs?: string;
}

export function BulkTrackerImport({ onImportComplete, viewAs }: BulkTrackerImportProps) {
  const { user } = useUser();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<'idle' | 'preview' | 'importing' | 'done'>('idle');
  const [csvText, setCsvText] = useState('');
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [overwrite, setOverwrite] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number; errors: { row: number; error: string }[] } | null>(null);

  const processCSV = (text: string) => {
    const rawRows = parseCSV(text);
    if (rawRows.length === 0) {
      toast({ variant: 'destructive', title: 'Parse Error', description: 'No data rows found. Check your CSV format.' });
      return;
    }
    const validated = rawRows.map((r, i) => validateRow(r, i + 1));
    setParsedRows(validated);
    setStep('preview');
  };

  const handleFileUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setCsvText(text);
      processCSV(text);
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file?.name.endsWith('.csv')) handleFileUpload(file);
    else toast({ variant: 'destructive', title: 'Invalid File', description: 'Please upload a .csv file.' });
  };

  const handleImport = async () => {
    if (!user) return;
    const validRows = parsedRows.filter(r => r.valid);
    if (validRows.length === 0) {
      toast({ variant: 'destructive', title: 'No Valid Rows', description: 'Fix errors before importing.' });
      return;
    }
    setStep('importing');
    try {
      const token = await user.getIdToken();
      const payload = {
        rows: validRows.map(r => r.raw),
        overwrite,
        ...(viewAs ? { viewAs } : {}),
      };
      const res = await fetch('/api/daily-activity/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import failed');
      setImportResult({ imported: data.imported, skipped: data.skipped, errors: data.errors ?? [] });
      setStep('done');
      onImportComplete?.(data.imported);
      toast({ title: 'Import Complete', description: `${data.imported} day(s) imported. ${data.skipped} skipped (no new data).` });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Import Failed', description: err.message });
      setStep('preview');
    }
  };

  const handleReset = () => {
    setStep('idle');
    setCsvText('');
    setParsedRows([]);
    setImportResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const downloadSample = () => {
    const blob = new Blob([SAMPLE_CSV], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tracking_sheet_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const validCount = parsedRows.filter(r => r.valid).length;
  const errorCount = parsedRows.filter(r => !r.valid).length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Bulk Tracking Sheet Import
            </CardTitle>
            <CardDescription className="mt-1">
              Upload historical daily activity data from your tracking spreadsheet. Data will appear on the calendar and in your KPI dashboard.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={downloadSample}>
            <Download className="h-4 w-4 mr-2" />
            Download Template
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">

        {/* STEP: IDLE */}
        {step === 'idle' && (
          <div className="space-y-4">
            {/* Drag & drop */}
            <div
              className={cn(
                'border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer',
                isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/30 hover:border-primary/50'
              )}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <FileText className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
              <p className="font-medium">Drop your CSV file here, or click to browse</p>
              <p className="text-sm text-muted-foreground mt-1">Supports .csv files up to 500 rows</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); }}
              />
            </div>

            <div className="flex items-center gap-3">
              <div className="flex-1 border-t" />
              <span className="text-xs text-muted-foreground">or paste CSV text</span>
              <div className="flex-1 border-t" />
            </div>

            <Textarea
              placeholder={`Paste CSV data here...\n\nExample:\ndate,calls,engagements,appointmentsSet,appointmentsHeld,contracts\n2026-01-06,45,12,2,1,0`}
              className="font-mono text-xs min-h-[120px]"
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
            />
            <Button
              onClick={() => csvText.trim() && processCSV(csvText)}
              disabled={!csvText.trim()}
              className="w-full"
            >
              <FileText className="h-4 w-4 mr-2" />
              Preview Import
            </Button>

            {/* Column reference */}
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground font-medium">
                Supported CSV columns &amp; aliases
              </summary>
              <div className="mt-2 rounded-lg border p-3 bg-muted/30 space-y-1 text-xs font-mono text-muted-foreground">
                <p><span className="text-foreground font-semibold">Required:</span> date (YYYY-MM-DD or MM/DD/YYYY)</p>
                <p><span className="text-foreground font-semibold">Optional:</span></p>
                <p className="pl-4">calls (or: dials, phone_calls, callsCount)</p>
                <p className="pl-4">engagements (or: spokeTo, contacts, conversations)</p>
                <p className="pl-4">appointmentsSet (or: appts_set, set)</p>
                <p className="pl-4">appointmentsHeld (or: appts_held, held)</p>
                <p className="pl-4">contracts (or: contractsWritten, signed)</p>
                <p className="pl-4">startTime, endTime (HH:mm format)</p>
                <p className="pl-4">notes</p>
              </div>
            </details>
          </div>
        )}

        {/* STEP: PREVIEW */}
        {step === 'preview' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <Badge variant="default" className="bg-green-600">{validCount} valid</Badge>
                {errorCount > 0 && <Badge variant="destructive">{errorCount} with errors</Badge>}
                <span className="text-sm text-muted-foreground">{parsedRows.length} total rows</span>
              </div>
              <Button variant="ghost" size="sm" onClick={handleReset}>
                <X className="h-4 w-4 mr-1" />Start Over
              </Button>
            </div>

            {errorCount > 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Some rows have errors</AlertTitle>
                <AlertDescription>Rows with errors will be skipped. Fix the CSV and re-upload, or proceed to import only valid rows.</AlertDescription>
              </Alert>
            )}

            {/* Overwrite toggle */}
            <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
              <Switch id="overwrite-toggle" checked={overwrite} onCheckedChange={setOverwrite} />
              <div>
                <Label htmlFor="overwrite-toggle" className="font-medium cursor-pointer">
                  {overwrite ? 'Overwrite existing days' : 'Merge (keep higher values)'}
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {overwrite
                    ? 'Imported values will replace any existing data for matching dates.'
                    : 'For days already logged, only imported values higher than existing values will be applied.'}
                </p>
              </div>
            </div>

            <div className="border rounded-md overflow-auto max-h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-center">Calls</TableHead>
                    <TableHead className="text-center">Engagements</TableHead>
                    <TableHead className="text-center">Appts Set</TableHead>
                    <TableHead className="text-center">Appts Held</TableHead>
                    <TableHead className="text-center">Contracts</TableHead>
                    <TableHead>Hours</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedRows.map(row => (
                    <TableRow key={row.rowNum} className={!row.valid ? 'bg-destructive/5' : ''}>
                      <TableCell className="text-muted-foreground text-xs">{row.rowNum}</TableCell>
                      <TableCell className="font-mono text-sm">{row.date || '—'}</TableCell>
                      <TableCell className="text-center text-sm">{row.calls || '—'}</TableCell>
                      <TableCell className="text-center text-sm">{row.engagements || '—'}</TableCell>
                      <TableCell className="text-center text-sm">{row.appointmentsSet || '—'}</TableCell>
                      <TableCell className="text-center text-sm">{row.appointmentsHeld || '—'}</TableCell>
                      <TableCell className="text-center text-sm">{row.contracts || '—'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {row.startTime && row.endTime ? `${row.startTime}–${row.endTime}` : row.startTime || '—'}
                      </TableCell>
                      <TableCell>
                        {row.valid ? (
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                        ) : (
                          <div className="flex flex-col gap-0.5">
                            {row.errors.map((e, i) => (
                              <span key={i} className="text-[10px] text-destructive">{e}</span>
                            ))}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex gap-2">
              <Button onClick={handleImport} disabled={validCount === 0} className="flex-1">
                <Upload className="h-4 w-4 mr-2" />
                Import {validCount} Day{validCount !== 1 ? 's' : ''}
              </Button>
              <Button variant="outline" onClick={handleReset}>Cancel</Button>
            </div>
          </div>
        )}

        {/* STEP: IMPORTING */}
        {step === 'importing' && (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="font-medium">Importing tracking data...</p>
            <p className="text-sm text-muted-foreground">Writing to calendar and KPI dashboard. Please wait.</p>
          </div>
        )}

        {/* STEP: DONE */}
        {step === 'done' && importResult && (
          <div className="space-y-4">
            <Alert className="border-green-500 bg-green-50 dark:bg-green-950/20">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertTitle className="text-green-700 dark:text-green-400">Import Complete</AlertTitle>
              <AlertDescription className="text-green-700 dark:text-green-400">
                <strong>{importResult.imported}</strong> day{importResult.imported !== 1 ? 's' : ''} imported successfully.
                {importResult.skipped > 0 && ` ${importResult.skipped} day(s) skipped (existing data was already higher).`}
                {importResult.errors.length > 0 && ` ${importResult.errors.length} row(s) had errors.`}
              </AlertDescription>
            </Alert>

            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle>Data is now live</AlertTitle>
              <AlertDescription>
                The imported days will appear on your <strong>calendar heat-map</strong> and are included in your <strong>KPI dashboard</strong> totals. Refresh the dashboard to see updated numbers.
              </AlertDescription>
            </Alert>

            {importResult.errors.length > 0 && (
              <div className="border rounded-md p-3 space-y-1">
                <p className="text-sm font-medium text-destructive">Skipped rows:</p>
                {importResult.errors.map((e, i) => (
                  <p key={i} className="text-xs text-muted-foreground">Row {e.row}: {e.error}</p>
                ))}
              </div>
            )}

            <Button onClick={handleReset} variant="outline" className="w-full">
              Import More Data
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
