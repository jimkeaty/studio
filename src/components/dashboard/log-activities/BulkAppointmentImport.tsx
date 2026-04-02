'use client';

/**
 * BulkAppointmentImport
 *
 * Allows agents (and admins) to upload a CSV file or paste rows manually
 * to bulk-import past or future appointments.
 *
 * CSV columns (case-insensitive, flexible naming):
 *   date, contactName, category (buyer|seller|both), status (set|held),
 *   dateSet, scheduledDate, scheduledTime, heldDate, heldTime,
 *   priceRangeLow, priceRangeHigh, timing (0_60|60_120|120_plus|other),
 *   notes, phone, email, address
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
import { Upload, FileText, CheckCircle2, AlertTriangle, X, Download, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ParsedRow {
  rowNum: number;
  date: string;
  contactName: string;
  category: string;
  status: string;
  dateSet?: string;
  scheduledDate?: string;
  scheduledTime?: string;
  priceRangeLow?: string;
  priceRangeHigh?: string;
  timing?: string;
  notes?: string;
  valid: boolean;
  errors: string[];
  // raw data to send to API
  raw: Record<string, string>;
}

const TIMING_LABELS: Record<string, string> = {
  '0_60': '0–60 Days',
  '60_120': '60–120 Days',
  '120_plus': '120+ Days',
  'other': 'Other',
};

const REQUIRED_COLUMNS = ['date', 'contactname'];

const COLUMN_ALIASES: Record<string, string> = {
  // date
  'date': 'date', 'appt_date': 'date', 'appointment_date': 'date',
  // contactName
  'contactname': 'contactName', 'contact_name': 'contactName', 'name': 'contactName', 'client': 'contactName', 'client_name': 'contactName',
  // category
  'category': 'category', 'type': 'category', 'clienttype': 'category', 'client_type': 'category',
  // status
  'status': 'status',
  // dateSet
  'dateset': 'dateSet', 'date_set': 'dateSet', 'setdate': 'dateSet', 'set_date': 'dateSet',
  // scheduledDate / time
  'scheduleddate': 'scheduledDate', 'scheduled_date': 'scheduledDate', 'apptdate': 'scheduledDate',
  'scheduledtime': 'scheduledTime', 'scheduled_time': 'scheduledTime', 'appttime': 'scheduledTime', 'time': 'scheduledTime',
  // price
  'pricerangelow': 'priceRangeLow', 'price_range_low': 'priceRangeLow', 'pricelow': 'priceRangeLow', 'price_low': 'priceRangeLow', 'low': 'priceRangeLow',
  'pricerangehigh': 'priceRangeHigh', 'price_range_high': 'priceRangeHigh', 'pricehigh': 'priceRangeHigh', 'price_high': 'priceRangeHigh', 'high': 'priceRangeHigh',
  // timing
  'timing': 'timing', 'timeframe': 'timing',
  // misc
  'notes': 'notes', 'note': 'notes',
  'phone': 'contactPhone', 'contact_phone': 'contactPhone',
  'email': 'contactEmail', 'contact_email': 'contactEmail',
  'address': 'listingAddress', 'listing_address': 'listingAddress',
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

function normalizeRow(raw: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    const normalized = normalizeKey(k);
    const canonical = COLUMN_ALIASES[normalized] ?? k;
    out[canonical] = v;
  }
  return out;
}

function validateRow(row: Record<string, string>, rowNum: number): ParsedRow {
  const errors: string[] = [];

  const date = row.date?.trim() ?? '';
  if (!date) errors.push('Missing date');
  else if (!/^\d{4}-\d{2}-\d{2}$/.test(date) && !/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(date)) {
    errors.push('Date must be YYYY-MM-DD or MM/DD/YYYY');
  }

  const contactName = row.contactName?.trim() ?? '';
  if (!contactName) errors.push('Missing contact name');

  const category = (row.category?.trim().toLowerCase() ?? 'buyer');
  if (!['buyer', 'seller', 'both'].includes(category)) errors.push('Category must be buyer, seller, or both');

  const status = (row.status?.trim().toLowerCase() ?? 'set');
  if (!['set', 'held', 'scheduled', 'canceled', 'no_show'].includes(status)) errors.push('Status must be set or held');

  const timing = row.timing?.trim() ?? '';
  if (timing && !['0_60', '60_120', '120_plus', 'other'].includes(timing)) {
    errors.push('Timing must be 0_60, 60_120, 120_plus, or other');
  }

  return {
    rowNum,
    date,
    contactName,
    category,
    status,
    dateSet: row.dateSet?.trim() || undefined,
    scheduledDate: row.scheduledDate?.trim() || undefined,
    scheduledTime: row.scheduledTime?.trim() || undefined,
    priceRangeLow: row.priceRangeLow?.trim() || undefined,
    priceRangeHigh: row.priceRangeHigh?.trim() || undefined,
    timing: timing || undefined,
    notes: row.notes?.trim() || undefined,
    valid: errors.length === 0,
    errors,
    raw: row,
  };
}

const SAMPLE_CSV = `date,contactName,category,status,dateSet,scheduledDate,scheduledTime,priceRangeLow,priceRangeHigh,timing,notes
2026-01-15,John Smith,buyer,held,2026-01-10,2026-01-15,10:00,250000,350000,0_60,First-time buyer
2026-01-20,Jane Doe,seller,set,2026-01-18,2026-01-22,14:00,400000,500000,60_120,Listing consult
2026-02-01,Bob Johnson,both,set,2026-01-28,,,,, other,Referral from Mary`;

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

  const handleFileUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setCsvText(text);
      processCSV(text);
    };
    reader.readAsText(file);
  };

  const processCSV = (text: string) => {
    const rawRows = parseCSV(text);
    if (rawRows.length === 0) {
      toast({ variant: 'destructive', title: 'Parse Error', description: 'No data rows found. Check your CSV format.' });
      return;
    }
    const normalized = rawRows.map(r => normalizeRow(r));
    const validated = normalized.map((r, i) => validateRow(r, i + 1));
    setParsedRows(validated);
    setStep('preview');
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.csv')) handleFileUpload(file);
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

  const downloadSample = () => {
    const blob = new Blob([SAMPLE_CSV], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'appointments_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const validCount = parsedRows.filter(r => r.valid).length;
  const errorCount = parsedRows.filter(r => !r.valid).length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Bulk Appointment Import
            </CardTitle>
            <CardDescription className="mt-1">
              Upload a CSV file or paste data to import multiple appointments at once.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={downloadSample}>
            <Download className="h-4 w-4 mr-2" />
            Download Template
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">

        {/* STEP: IDLE — Upload zone */}
        {step === 'idle' && (
          <div className="space-y-4">
            {/* Drag & drop zone */}
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
              <p className="text-sm text-muted-foreground mt-1">Supports .csv files up to 200 rows</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); }}
              />
            </div>

            {/* Divider */}
            <div className="flex items-center gap-3">
              <div className="flex-1 border-t" />
              <span className="text-xs text-muted-foreground">or paste CSV text</span>
              <div className="flex-1 border-t" />
            </div>

            {/* Paste area */}
            <Textarea
              placeholder={`Paste CSV data here...\n\nExample:\ndate,contactName,category,status\n2026-01-15,John Smith,buyer,held`}
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
                Supported CSV columns
              </summary>
              <div className="mt-2 rounded-lg border p-3 bg-muted/30 space-y-1 text-xs font-mono text-muted-foreground">
                <p><span className="text-foreground font-semibold">Required:</span> date (YYYY-MM-DD or MM/DD/YYYY), contactName</p>
                <p><span className="text-foreground font-semibold">Optional:</span> category (buyer|seller|both), status (set|held),</p>
                <p className="pl-4">dateSet, scheduledDate, scheduledTime, heldDate, heldTime,</p>
                <p className="pl-4">priceRangeLow, priceRangeHigh,</p>
                <p className="pl-4">timing (0_60|60_120|120_plus|other),</p>
                <p className="pl-4">notes, phone, email, address</p>
              </div>
            </details>
          </div>
        )}

        {/* STEP: PREVIEW */}
        {step === 'preview' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
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
                <AlertDescription>
                  Rows with errors will be skipped. Fix the CSV and re-upload, or proceed to import only the valid rows.
                </AlertDescription>
              </Alert>
            )}

            <div className="border rounded-md overflow-auto max-h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Price Range</TableHead>
                    <TableHead>Timing</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedRows.map(row => (
                    <TableRow key={row.rowNum} className={!row.valid ? 'bg-destructive/5' : ''}>
                      <TableCell className="text-muted-foreground text-xs">{row.rowNum}</TableCell>
                      <TableCell className="text-sm">{row.date || '—'}</TableCell>
                      <TableCell className="font-medium text-sm">{row.contactName || '—'}</TableCell>
                      <TableCell>
                        <Badge variant={row.category === 'buyer' ? 'default' : row.category === 'seller' ? 'secondary' : 'outline'} className="text-xs">
                          {row.category || '—'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{row.status || '—'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {row.priceRangeLow || row.priceRangeHigh
                          ? `$${Number(row.priceRangeLow || 0).toLocaleString()} – $${Number(row.priceRangeHigh || 0).toLocaleString()}`
                          : '—'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {row.timing ? TIMING_LABELS[row.timing] ?? row.timing : '—'}
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
                Import {validCount} Appointment{validCount !== 1 ? 's' : ''}
              </Button>
              <Button variant="outline" onClick={handleReset}>Cancel</Button>
            </div>
          </div>
        )}

        {/* STEP: IMPORTING */}
        {step === 'importing' && (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="font-medium">Importing appointments...</p>
            <p className="text-sm text-muted-foreground">Please wait while we save your data.</p>
          </div>
        )}

        {/* STEP: DONE */}
        {step === 'done' && importResult && (
          <div className="space-y-4">
            <Alert className="border-green-500 bg-green-50 dark:bg-green-950/20">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertTitle className="text-green-700 dark:text-green-400">Import Complete</AlertTitle>
              <AlertDescription className="text-green-700 dark:text-green-400">
                Successfully imported <strong>{importResult.created}</strong> appointment{importResult.created !== 1 ? 's' : ''}.
                {importResult.errors.length > 0 && ` ${importResult.errors.length} row(s) were skipped due to errors.`}
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
