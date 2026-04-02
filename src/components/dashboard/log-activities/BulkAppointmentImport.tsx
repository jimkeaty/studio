'use client';

/**
 * BulkAppointmentImport
 *
 * Lets agents upload a CSV of appointment records using the canonical
 * template format (matching the provided template.xlsx).
 *
 * Template columns:
 *   Row ID | Appointment Type | Client Name | Date Set | Appointment Date |
 *   Appointment Time | Status | Client Timing | Price Range | Notes | Year
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
import { Upload, FileText, CheckCircle2, AlertTriangle, X, Download, Loader2, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Template-matched ParsedRow ──────────────────────────────────────────────
interface ParsedRow {
  rowNum: number;
  rowId: string;
  appointmentType: string;
  clientName: string;
  dateSet: string;
  appointmentDate: string;
  appointmentTime: string;
  status: string;
  clientTiming: string;
  priceRange: string;
  notes: string;
  year: string;
  valid: boolean;
  errors: string[];
  raw: Record<string, string>;
}

// ─── Column aliases (mirrors server normalizeRow) ─────────────────────────────
const COLUMN_ALIASES: Record<string, string> = {
  'rowid': 'Row ID', 'row_id': 'Row ID', 'id': 'Row ID', 'sourceid': 'Row ID',
  'appointmenttype': 'Appointment Type', 'appointment_type': 'Appointment Type',
  'type': 'Appointment Type', 'category': 'Appointment Type', 'clienttype': 'Appointment Type',
  'clientname': 'Client Name', 'client_name': 'Client Name', 'contactname': 'Client Name',
  'contact_name': 'Client Name', 'name': 'Client Name', 'client': 'Client Name',
  'dateset': 'Date Set', 'date_set': 'Date Set', 'setdate': 'Date Set',
  'appointmentdate': 'Appointment Date', 'appointment_date': 'Appointment Date',
  'date': 'Appointment Date', 'scheduleddate': 'Appointment Date', 'apptdate': 'Appointment Date',
  'appointmenttime': 'Appointment Time', 'appointment_time': 'Appointment Time',
  'time': 'Appointment Time', 'scheduledtime': 'Appointment Time',
  'status': 'Status', 'appt_status': 'Status', 'appointmentstatus': 'Status',
  'clienttiming': 'Client Timing', 'client_timing': 'Client Timing',
  'timing': 'Client Timing', 'timeframe': 'Client Timing',
  'pricerange': 'Price Range', 'price_range': 'Price Range', 'price': 'Price Range',
  'notes': 'Notes', 'note': 'Notes', 'comments': 'Notes',
  'year': 'Year',
};

function normalizeKey(k: string): string {
  return k.toLowerCase().replace(/[\s_-]/g, '');
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map(line => {
    // Simple CSV parse — handles quoted fields
    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
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

function normalizeHeaders(raw: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    const nk = normalizeKey(k);
    out[COLUMN_ALIASES[nk] ?? k] = v;
  }
  return out;
}

function isValidDate(v: string): boolean {
  if (!v) return false;
  const s = v.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return true;
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) return true;
  if (/^\d{1,2}\/\d{1,2}\/\d{2}$/.test(s)) return true;
  return !isNaN(new Date(s).getTime());
}

function validateRow(raw: Record<string, string>, rowNum: number): ParsedRow {
  const norm = normalizeHeaders(raw);
  const errors: string[] = [];
  const appointmentDate = (norm['Appointment Date'] ?? '').trim();
  const clientName = (norm['Client Name'] ?? '').trim();
  if (!appointmentDate || !isValidDate(appointmentDate)) errors.push('Invalid or missing Appointment Date');
  if (!clientName) errors.push('Missing Client Name');
  return {
    rowNum,
    rowId: (norm['Row ID'] ?? '').trim(),
    appointmentType: (norm['Appointment Type'] ?? '').trim(),
    clientName,
    dateSet: (norm['Date Set'] ?? '').trim(),
    appointmentDate,
    appointmentTime: (norm['Appointment Time'] ?? '').trim(),
    status: (norm['Status'] ?? '').trim(),
    clientTiming: (norm['Client Timing'] ?? '').trim(),
    priceRange: (norm['Price Range'] ?? '').trim(),
    notes: (norm['Notes'] ?? '').trim(),
    year: (norm['Year'] ?? '').trim(),
    valid: errors.length === 0,
    errors,
    raw: norm,
  };
}

function statusColor(s: string): string {
  const l = s.toLowerCase();
  if (l.includes('converted')) return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
  if (l.includes('held')) return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
  if (l.includes('no-show') || l.includes('noshow')) return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300';
  if (l.includes('cancel')) return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
  return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
}

function typeColor(s: string): string {
  const l = s.toLowerCase();
  if (l.includes('listing') || l.includes('seller')) return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300';
  return 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300';
}

interface BulkAppointmentImportProps {
  onImportComplete?: (count: number) => void;
  viewAs?: string;
}

export function BulkAppointmentImport({ onImportComplete, viewAs }: BulkAppointmentImportProps) {
  const { user } = useUser();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<'idle' | 'preview' | 'importing' | 'done'>('idle');
  const [csvText, setCsvText] = useState('');
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [importResult, setImportResult] = useState<{ created: number; errors: { row: number; error: string }[] } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

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
    if (!file.name.endsWith('.csv')) {
      toast({ variant: 'destructive', title: 'CSV Required', description: 'Please save the .xlsx template as CSV first, then upload the .csv file.' });
      return;
    }
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
    if (file) handleFileUpload(file);
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
        appointments: validRows.map(r => r.raw),
        ...(viewAs ? { viewAs } : {}),
      };
      const res = await fetch('/api/appointments/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import failed');
      setImportResult({ created: data.created, errors: data.errors ?? [] });
      setStep('done');
      onImportComplete?.(data.created);
      toast({ title: 'Import Complete', description: `${data.created} appointment(s) imported successfully.` });
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

  const validCount = parsedRows.filter(r => r.valid).length;
  const errorCount = parsedRows.filter(r => !r.valid).length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Bulk Appointment Import
            </CardTitle>
            <CardDescription className="mt-1">
              Upload past or current appointments from a CSV file. Download the template below for the correct column format.
            </CardDescription>
          </div>
          <a href="/appointment_import_template.xlsx" download>
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Download Template (.xlsx)
            </Button>
          </a>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">

        {/* ── STEP: IDLE ─────────────────────────────────────────────────────────────── */}
        {step === 'idle' && (
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
              <p className="text-sm font-semibold">Template Columns</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1 text-xs text-muted-foreground">
                <span><span className="font-semibold text-foreground">Row ID</span> — optional (for dedup)</span>
                <span><span className="font-semibold text-foreground">Appointment Type</span> — Buyer Appointment / Listing Appointment</span>
                <span><span className="font-semibold text-foreground">Client Name</span> — <span className="text-destructive">required</span></span>
                <span><span className="font-semibold text-foreground">Date Set</span> — date appointment was booked (MM/DD/YYYY)</span>
                <span><span className="font-semibold text-foreground">Appointment Date</span> — <span className="text-destructive">required</span> (MM/DD/YYYY)</span>
                <span><span className="font-semibold text-foreground">Appointment Time</span> — e.g. 2:30 PM</span>
                <span><span className="font-semibold text-foreground">Status</span> — Held - Converted · Held - No Contract · No-Show · Canceled</span>
                <span><span className="font-semibold text-foreground">Client Timing</span> — 0-60 Days · 60-90 Days · 120+ Days · Other / Flexible</span>
                <span><span className="font-semibold text-foreground">Price Range</span> — e.g. $225,000 - $275,000</span>
                <span><span className="font-semibold text-foreground">Notes</span> — optional</span>
                <span><span className="font-semibold text-foreground">Year</span> — optional</span>
              </div>
            </div>

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
              <p className="text-sm text-muted-foreground mt-1">
                Open the .xlsx template in Excel, save as CSV, then upload here. Up to 500 rows per import.
              </p>
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
              placeholder={`Paste CSV data here...\n\nExample:\nRow ID,Appointment Type,Client Name,Date Set,Appointment Date,Appointment Time,Status,Client Timing,Price Range,Notes,Year\n1,Buyer Appointment,John Smith,12/10/2025,12/16/2025,2:30 PM,Held - Converted,0-60 Days,"$225,000 - $275,000",Great meeting,2025`}
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
          </div>
        )}

        {/* ── STEP: PREVIEW ──────────────────────────────────────────────────────────── */}
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

            <div className="border rounded-md overflow-auto max-h-[420px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Appt Date</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Timing</TableHead>
                    <TableHead>Price Range</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedRows.map(row => (
                    <TableRow key={row.rowNum} className={!row.valid ? 'bg-destructive/5' : ''}>
                      <TableCell className="text-muted-foreground text-xs">{row.rowNum}</TableCell>
                      <TableCell className="font-medium text-sm max-w-[120px] truncate">{row.clientName || '—'}</TableCell>
                      <TableCell>
                        {row.appointmentType ? (
                          <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded', typeColor(row.appointmentType))}>
                            {row.appointmentType.replace(' Appointment', '')}
                          </span>
                        ) : '—'}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{row.appointmentDate || '—'}</TableCell>
                      <TableCell className="text-xs">{row.appointmentTime || '—'}</TableCell>
                      <TableCell>
                        {row.status ? (
                          <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap', statusColor(row.status))}>
                            {row.status}
                          </span>
                        ) : '—'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{row.clientTiming || '—'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{row.priceRange || '—'}</TableCell>
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
                Import {validCount} Appointment{validCount !== 1 ? 's' : ''}
              </Button>
              <Button variant="outline" onClick={handleReset}>Cancel</Button>
            </div>
          </div>
        )}

        {/* ── STEP: IMPORTING ────────────────────────────────────────────────────────── */}
        {step === 'importing' && (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="font-medium">Importing appointments...</p>
            <p className="text-sm text-muted-foreground">Writing to Firestore. Please wait.</p>
          </div>
        )}

        {/* ── STEP: DONE ──────────────────────────────────────────────────────────────── */}
        {step === 'done' && importResult && (
          <div className="space-y-4">
            <Alert className="border-green-500 bg-green-50 dark:bg-green-950/20">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertTitle className="text-green-700 dark:text-green-400">Import Complete</AlertTitle>
              <AlertDescription className="text-green-700 dark:text-green-400">
                <strong>{importResult.created}</strong> appointment{importResult.created !== 1 ? 's' : ''} imported successfully.
                {importResult.errors.length > 0 && ` ${importResult.errors.length} row(s) had errors and were skipped.`}
              </AlertDescription>
            </Alert>

            <Alert>
              <Calendar className="h-4 w-4" />
              <AlertTitle>Data is now live</AlertTitle>
              <AlertDescription>
                Imported appointments appear as <strong>dots on the calendar</strong> and in the <strong>Appointments tab</strong>. Refresh the page to see them.
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
              Import More Appointments
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
