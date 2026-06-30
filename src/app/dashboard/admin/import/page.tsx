'use client';
export const dynamic = 'force-dynamic';

import { useRef, useState, useEffect, useCallback } from 'react';
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
  AlertTriangle,
  CheckCircle2,
  Download,
  Upload,
  FileSpreadsheet,
  ArrowLeft,
  XCircle,
  Info,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import * as XLSX from 'xlsx';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
/** Exact column headers in order (matches Excel template) */
const CSV_HEADERS = [
  'Type',
  'Status',
  'Deal Type',
  'Agent',
  'Team',
  'Address',
  'Client',
  'Source',
  'Listing Date/Buyer Rep Date',
  'Under Contr Date',
  'Proj Close',
  'Exp Date',
  'Close Date',
  'List Price- Buyer Rep Price',
  'Sale Price',
  'Commission %',
  'GCI',
  'Transaction Fee',
  'Broker %',
  'Broker GCI',
  'Referral',
  '% to Member',
  'Primary GCI',
  'Team Member 1',
  '% to Member1',
  'Member GCI 1',
  'Team Member2',
  '% to Member 2',
  'Member GCI 2',
  'Team Member3',
  '% to Member 3',
  'Member GCI 3',
  'Co-Agent 1',
  'Co-Agent 1 Split%',
  'Co-Agent 1 GCI',
  'Co-Agent 2',
  'Co-Agent 2 Split%',
  'Co-Agent 2 GCI',
  'Co-Agent 3',
  'Co-Agent 3 Split%',
  'Co-Agent 3 GCI',
  'Expense Credits',
  'Mortgage Company',
  'Title Company',
  'Notes',
] as const;

/** Normalize a header: lowercase, collapse whitespace, trim */
function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Maps normalized CSV header → API row key.
 * Includes common aliases so user CSVs work without exact header names.
 */
const HEADER_TO_KEY_NORMALIZED: Record<string, string> = {
  // Agent name
  'agent': 'agentName',
  'agent name': 'agentName',

  // Type (buyer/listing/referral — closingType in the app)
  'type': 'closingType',
  'type of closing': 'closingType',
  'type of closings': 'closingType',
  'closing type': 'closingType',

  // Status
  'status': 'status',

  // Deal Type (residential/commercial — transactionType in the app)
  'deal type': 'dealType',
  'property type': 'dealType',

  // Address
  'address': 'address',

  // Client
  'client': 'clientName',
  'client name': 'clientName',

  // Source
  'source': 'dealSource',
  'deal source': 'dealSource',

  // Dates
  'listing date': 'listingDate',
  'listing date/buyer rep date': 'listingDate',
  'listing date / buyer rep date': 'listingDate',
  'buyer rep date': 'listingDate',
  'under contr date': 'underContractDate',
  'under contract date': 'underContractDate',
  'contract date': 'underContractDate',
  'proj close': 'projCloseDate',
  'proj close date': 'projCloseDate',
  'projected close date': 'projCloseDate',
  'projected close': 'projCloseDate',
  'exp date': 'expDate',
  'expiration date': 'expDate',
  'close date': 'closedDate',
  'closed date': 'closedDate',
  'closing date': 'closedDate',

  // Financials
  'list price- buyer rep price': 'listPrice',
  'list price-buyer rep price': 'listPrice',
  'list price / buyer rep price': 'listPrice',
  'list price/buyer rep price': 'listPrice',
  'list price': 'listPrice',
  'buyer rep price': 'listPrice',
  'listing price': 'listPrice',
  'sale price': 'salePrice',
  'sales price': 'salePrice',
  'commission %': 'commissionPct',
  'commission percent': 'commissionPct',
  'gci': 'gci',
  'gross commission': 'gci',
  'transaction fee': 'transactionFee',
  'broker %': 'brokerPct',
  'broker percent': 'brokerPct',
  'broker gci': 'brokerGci',

  // Referral
  'referral': 'referral',
  'referral %': 'referral',
  'referral fee': 'referral',

  // Agent split
  '% to member': 'agentPct',
  'agent % / % to member': 'agentPct',
  'agent %': 'agentPct',
  'agent percent': 'agentPct',
  'primary gci': 'agentDollar',
  'agent $ (primary gci)': 'agentDollar',
  'agent $': 'agentDollar',
  'agent dollar': 'agentDollar',

  // Team members
  // NOTE: In the office master format, 'Team Member 1' contains free-text notes/co-agent names.
  // Per spec, map it directly to notes rather than trying to resolve it as an agent.
  'team member 1': 'notes',
  'team member1': 'notes',
  '% to member1': 'teamMember1Pct',
  '% to member 1': 'teamMember1Pct',
  'member gci 1': 'teamMember1Gci',
  'member gci1': 'teamMember1Gci',
  'team member2': 'teamMember2',
  'team member 2': 'teamMember2',
  '% to member 2': 'teamMember2Pct',
  '% to member2': 'teamMember2Pct',
  'member gci 2': 'teamMember2Gci',
  'member gci2': 'teamMember2Gci',
  'team member3': 'teamMember3',
  'team member 3': 'teamMember3',
  '% to member 3': 'teamMember3Pct',
  '% to member3': 'teamMember3Pct',
  'member gci 3': 'teamMember3Gci',
  'member gci3': 'teamMember3Gci',

  // Co-agents
  'co-agent 1': 'coAgent1',
  'co agent 1': 'coAgent1',
  'additional payee': 'coAgent1',
  'co-agent 1 split%': 'coAgent1Pct',
  'co-agent 1 split %': 'coAgent1Pct',
  '% to payee': 'coAgent1Pct',
  'co-agent 1 gci': 'coAgent1Gci',
  'payee gci': 'coAgent1Gci',
  'co-agent 2': 'coAgent2',
  'co agent 2': 'coAgent2',
  'co-agent 2 split%': 'coAgent2Pct',
  'co-agent 2 split %': 'coAgent2Pct',
  'co-agent 2 gci': 'coAgent2Gci',
  'co-agent 3': 'coAgent3',
  'co agent 3': 'coAgent3',
  'co-agent 3 split%': 'coAgent3Pct',
  'co-agent 3 split %': 'coAgent3Pct',
  'co-agent 3 gci': 'coAgent3Gci',

  // Expense credits
  'expense credits': 'expenseCredits',
  'expense credit': 'expenseCredits',
  'expenses': 'expenseCredits',

  // Parties
  'mortgage company': 'mortgageCompany',
  'title company': 'titleCompany',

  // Team
  'team': 'team',
  'team name': 'team',
  'agent team': 'team',

  // Notes
  'notes': 'notes',
  'note': 'notes',
  'comments': 'notes',
  'comment': 'notes',
  'additional comments': 'notes',
  'additional notes': 'notes',
  'internal notes': 'notes',
  'memo': 'notes',
};

// Required columns — we check for these OR their aliases
const REQUIRED_COLUMNS_NORMALIZED = ['agent', 'address', 'status'];
// Also accept "agent name" as alias for "agent"
const REQUIRED_ALIASES: Record<string, string[]> = {
  'agent': ['agent', 'agent name'],
  'address': ['address'],
  'status': ['status'],
};

type ParsedRow = Record<string, any> & { __rowNum: number; __errors: string[] };

type ImportResult = {
  ok: boolean;
  imported: number;
  updated: number;
  failed: number;
  errors: { row: number; error: string }[];
  autoCreatedAgents?: { name: string; agentId: string }[];
  fuzzyMatchedAgents?: { row: number; csvName: string; matchedName: string; similarity: number }[];
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

  // Normalize headers: trim, collapse whitespace, lowercase for matching
  const rawHeaders = parseCsvLine(lines[0]).map((h) => h.trim());
  const headers = rawHeaders.map(normalizeHeader);
  const rows: ParsedRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const row: ParsedRow = { __rowNum: i + 1, __errors: [] };

    headers.forEach((h, idx) => {
      row[h] = values[idx] ?? '';
    });

    // Validate required columns (check all aliases)
    for (const req of REQUIRED_COLUMNS_NORMALIZED) {
      const aliases = REQUIRED_ALIASES[req] || [req];
      const hasValue = aliases.some(alias => row[alias]?.trim());
      if (!hasValue) {
        row.__errors.push(`"${req}" is required`);
      }
    }

    rows.push(row);
  }

  return { headers, rows };
}

/** Map parsed CSV row using user-confirmed column mapping */
function mapRowToApiPayload(row: ParsedRow, colMap: Record<string, string>): Record<string, string> {
  const payload: Record<string, string> = {};
  for (const [csvHeader, apiKey] of Object.entries(colMap)) {
    if (apiKey) {
      payload[apiKey] = row[csvHeader] ?? '';
    }
  }
  return payload;
}

/** Generate an XLSX template download */
function downloadTemplate() {
  const exampleRow = [
    'Buyer',
    'Closed',
    'Residential',
    'Jane Smith',
    'CGL',
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
    '',
    '70',
    '6615',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    'First Federal Bank',
    'Acadian Title',
  ];

  const ws = XLSX.utils.aoa_to_sheet([CSV_HEADERS as unknown as string[], exampleRow]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Template');

  // Auto-size columns
  ws['!cols'] = CSV_HEADERS.map(h => ({ wch: Math.max(h.length + 2, 14) }));

  XLSX.writeFile(wb, 'smart-broker-import-template.xlsx');
}

// ─────────────────────────────────────────────────────────────────────────────
// Column Guides
// ─────────────────────────────────────────────────────────────────────────────
const COLUMN_GUIDES: { header: string; hint: string; required?: boolean }[] = [
  { header: 'Type', hint: 'Buyer · Listing · Lease · Referral (which side of the deal)' },
  { header: 'Status', hint: 'Active · Pending · Closed · Canceled · Expired', required: true },
  { header: 'Deal Type', hint: 'Residential · Land · Commercial (property type)' },
  { header: 'Agent', hint: 'Agent name — fuzzy matched to existing profiles (e.g. "Jane Smith")', required: true },
  { header: 'Team', hint: 'Team name: CGL · SGL · Charles Ditch Team · Independent' },
  { header: 'Address', hint: 'Full property address', required: true },
  { header: 'Client', hint: 'Buyer or seller name (optional)' },
  { header: 'Source', hint: 'Boomtown · referral · sphere · sign call · Company Gen · Social · Open House · FSBO · Expired' },
  { header: 'Listing Date/Buyer Rep Date', hint: 'YYYY-MM-DD or MM/DD/YYYY or Excel serial date' },
  { header: 'Under Contr Date', hint: 'Under contract date' },
  { header: 'Proj Close', hint: 'Projected closing date' },
  { header: 'Exp Date', hint: 'Listing expiration date' },
  { header: 'Close Date', hint: 'Actual closing date — used for year attribution' },
  { header: 'List Price- Buyer Rep Price', hint: 'Original list price or buyer representation price ($)' },
  { header: 'Sale Price', hint: 'Actual sale/close price ($)' },
  { header: 'Commission %', hint: 'e.g. 3 for 3%' },
  { header: 'GCI', hint: 'Gross Commission Income ($)' },
  { header: 'Transaction Fee', hint: 'Flat transaction fee charged ($)' },
  { header: 'Broker %', hint: "Broker's split percentage (e.g. 30 for 30%)" },
  { header: 'Broker GCI', hint: 'Dollar amount retained by broker ($)' },
  { header: 'Referral', hint: 'Referral fee or referral percentage (optional)' },
  { header: '% to Member', hint: 'Agent split percentage (e.g. 70 for 70%)' },
  { header: 'Primary GCI', hint: '⭐ Agent net commission ($)' },
  { header: 'Team Member 1', hint: 'Team member name for split (optional)' },
  { header: '% to Member1', hint: 'Team member 1 split percentage' },
  { header: 'Member GCI 1', hint: 'Team member 1 dollar amount' },
  { header: 'Team Member2', hint: 'Second team member (optional)' },
  { header: '% to Member 2', hint: 'Team member 2 split percentage' },
  { header: 'Member GCI 2', hint: 'Team member 2 dollar amount' },
  { header: 'Team Member3', hint: 'Third team member (optional)' },
  { header: '% to Member 3', hint: 'Team member 3 split percentage' },
  { header: 'Member GCI 3', hint: 'Team member 3 dollar amount' },
  { header: 'Co-Agent 1', hint: 'Co-listing agent 1 name (informational)' },
  { header: 'Co-Agent 1 Split%', hint: "Co-Agent 1 broker split % (informational)" },
  { header: 'Co-Agent 1 GCI', hint: "Co-Agent 1 gross commission portion before company split ($, informational)" },
  { header: 'Co-Agent 2', hint: 'Co-listing agent 2 name (informational)' },
  { header: 'Co-Agent 2 Split%', hint: "Co-Agent 2 broker split % (informational)" },
  { header: 'Co-Agent 2 GCI', hint: "Co-Agent 2 gross commission portion before company split ($, informational)" },
  { header: 'Co-Agent 3', hint: 'Co-listing agent 3 name (informational)' },
  { header: 'Co-Agent 3 Split%', hint: "Co-Agent 3 broker split % (informational)" },
  { header: 'Co-Agent 3 GCI', hint: "Co-Agent 3 gross commission portion before company split ($, informational)" },
  { header: 'Expense Credits', hint: 'Credits paid to save a deal (informational, not deducted from calculations)' },
  { header: 'Mortgage Company', hint: 'Lender name (optional)' },
  { header: 'Title Company', hint: 'Title/escrow company (optional)' },
  { header: 'Notes', hint: 'Internal notes or comments about this transaction (optional)' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────
type Step = 'upload' | 'mapping' | 'preview' | 'agent-review' | 'result';

// Agent resolution types (mirrors /api/admin/import/resolve-agents)
type AgentResolutionStatus = 'auto_resolved' | 'fuzzy_match' | 'former_agent' | 'no_match';
interface AgentResolution {
  csvName: string;
  status: AgentResolutionStatus;
  matchedAgentId?: string;
  matchedDisplayName?: string;
  matchedAgentStatus?: string;
  similarity?: number;
  candidates?: { agentId: string; displayName: string; agentStatus: string; similarity: number }[];
  rowNumbers: number[];
}
interface AgentDecision {
  action: 'use_existing' | 'create_new' | 'historical' | 'skip';
  agentId?: string;
  displayName?: string;
}

export default function BulkImportPage() {
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
  const [deleteScope, setDeleteScope] = useState<string>('imported');
  const [deleteYear, setDeleteYear] = useState<string>(String(new Date().getFullYear()));
  const [deleteMonth, setDeleteMonth] = useState<string>('');
  const [deleting, setDeleting] = useState(false);
  const [showDeletePanel, setShowDeletePanel] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteAutoCreatedAgents, setDeleteAutoCreatedAgents] = useState(true);
  // Import batch picker state
  const [importBatches, setImportBatches] = useState<{importBatchId:string;importedAt:string;count:number;years:number[];sampleAgents:string[];sampleAddresses:string[]}[]>([]);
  const [batchesLoading, setBatchesLoading] = useState(false);
  const [selectedBatchId, setSelectedBatchId] = useState<string>('');

  // Agent review state
  const [agentResolutions, setAgentResolutions] = useState<AgentResolution[]>([]);
  const [agentDecisions, setAgentDecisions] = useState<Record<string, AgentDecision>>({});
  const [activeAgentsList, setActiveAgentsList] = useState<{ agentId: string; displayName: string }[]>([]);
  const [agentSearchTerms, setAgentSearchTerms] = useState<Record<string, string>>({});
  const [resolving, setResolving] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const errorBannerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to error banner whenever a new error appears
  useEffect(() => {
    if (pageError && errorBannerRef.current) {
      errorBannerRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [pageError]);

  // ── Load import batches for the batch-picker in the Danger Zone ────────
  // MUST be defined before any early returns (Rules of Hooks)
  const loadBatches = useCallback(async () => {
    if (!user) return;
    setBatchesLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/import-batches', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok && data.ok) setImportBatches(data.batches ?? []);
    } catch { /* non-fatal */ } finally {
      setBatchesLoading(false);
    }
  }, [user]);

  useEffect(() => { if (showDeletePanel) loadBatches(); }, [showDeletePanel, loadBatches]);

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
      <Alert>
        <AlertTitle>Authentication Required</AlertTitle>
        <AlertDescription>Please sign in to access this page.</AlertDescription>
      </Alert>
    );
  }
  if (!isAdmin) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Access Denied</AlertTitle>
        <AlertDescription>This page is restricted to administrators.</AlertDescription>
      </Alert>
    );
  }

  // ── Parse XLSX to same format as CSV ──────────────────────────────────
  function parseXLSX(data: ArrayBuffer): { headers: string[]; rows: ParsedRow[] } {
    const wb = XLSX.read(data, { type: 'array' });
    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    const jsonData: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, dateNF: 'yyyy-mm-dd' });

    if (jsonData.length === 0) return { headers: [], rows: [] };

    const rawHeaders = (jsonData[0] || []).map((h: any) => String(h ?? '').trim());
    const headers = rawHeaders.map(normalizeHeader);
    const rows: ParsedRow[] = [];

    for (let i = 1; i < jsonData.length; i++) {
      const values = jsonData[i] || [];
      // Skip completely empty rows
      if (values.every((v: any) => !v && v !== 0)) continue;

      const row: ParsedRow = { __rowNum: i + 1, __errors: [] };
      headers.forEach((h, idx) => {
        row[h] = String(values[idx] ?? '').trim();
      });

      // Validate required columns
      for (const req of REQUIRED_COLUMNS_NORMALIZED) {
        const aliases = REQUIRED_ALIASES[req] || [req];
        const hasValue = aliases.some(alias => row[alias]?.trim());
        if (!hasValue) {
          row.__errors.push(`"${req}" is required`);
        }
      }
      rows.push(row);
    }

    return { headers, rows };
  }

  // ── File handler ─────────────────────────────────────────────────────────
  const handleFile = (file: File) => {
    const isCSV = file.name.endsWith('.csv') || file.type === 'text/csv';
    const isXLSX = file.name.endsWith('.xlsx') || file.name.endsWith('.xls') ||
      file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      file.type === 'application/vnd.ms-excel';

    if (!isCSV && !isXLSX) {
      setPageError('Please upload a .csv or .xlsx file.');
      return;
    }
    setPageError(null);
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (e) => {
      let headers: string[];
      let rows: ParsedRow[];

      if (isXLSX) {
        const result = parseXLSX(e.target?.result as ArrayBuffer);
        headers = result.headers;
        rows = result.rows;
      } else {
        const text = e.target?.result as string;
        const result = parseCSV(text);
        headers = result.headers;
        rows = result.rows;
      }

      // Check for missing required columns (check aliases)
      const missingCols = REQUIRED_COLUMNS_NORMALIZED.filter((req) => {
        const aliases = REQUIRED_ALIASES[req] || [req];
        return !aliases.some(alias => headers.includes(alias));
      });
      if (missingCols.length > 0) {
        setPageError(
          `Missing required columns: ${missingCols.join(', ')}. Make sure you are using the correct template.`
        );
        return;
      }

      if (rows.length === 0) {
        setPageError('The file appears to have no data rows.');
        return;
      }

      setCsvHeaders(headers);
      setParsedRows(rows);

      // Auto-detect column mapping from headers
      const autoMap: Record<string, string> = {};
      for (const h of headers) {
        const apiKey = HEADER_TO_KEY_NORMALIZED[h];
        if (apiKey && !Object.values(autoMap).includes(apiKey)) {
          autoMap[h] = apiKey;
        }
      }
      setColumnMap(autoMap);
      setStep('mapping');
    };
    if (isXLSX) {
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsText(file);
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => e.preventDefault();

  // ── Import handler ───────────────────────────────────────────────────────
  const doImport = async (decisions?: Record<string, AgentDecision>) => {
    if (!user) return;
    setImporting(true);
    setImportProgress(5);

    try {
      const token = await user.getIdToken();

      const validRows = parsedRows
        .filter((r) => r.__errors.length === 0)
        .map((r) => mapRowToApiPayload(r, columnMap));

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

      const accumulated = {
        imported: 0,
        updated: 0,
        failed: 0,
        fuzzyMatchedAgents: [] as any[],
        autoCreatedAgents: [] as any[],
        errors: [] as any[],
      };

      for (let i = 0; i < chunks.length; i++) {
        const res = await fetch('/api/admin/import', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            rows: chunks[i],
            agentResolutions: Object.entries(decisions ?? agentDecisions).map(([csvName, d]) => ({
              csvName,
              action: d.action,
              agentId: d.agentId,
              displayName: d.displayName,
            })),
          }),
        });

        const data = await res.json();

        if (!res.ok || !data.ok) {
          throw new Error(data.error || `Chunk ${i + 1} failed`);
        }

        accumulated.imported += data.imported ?? 0;
        accumulated.updated += data.updated ?? 0;
        accumulated.failed += data.failed ?? 0;
        accumulated.fuzzyMatchedAgents.push(...(data.fuzzyMatchedAgents ?? []));
        accumulated.autoCreatedAgents.push(...(data.autoCreatedAgents ?? []));
        accumulated.errors.push(...(data.errors ?? []));

        setImportProgress(Math.round(((i + 1) / chunks.length) * 100));
      }

      setImportResult({ ok: true, ...accumulated });
      setStep('result');
    } catch (err: any) {
      setPageError(err.message || 'Import failed. Please try again.');
    } finally {
      setImporting(false);
    }
  };

  // ── Preflight: resolve agent names before import ─────────────────────────
  const runAgentResolution = async () => {
    if (!user) return;
    setResolving(true);
    setPageError(null);
    try {
      const token = await user.getIdToken();
      const validMapped = parsedRows
        .filter(r => r.__errors.length === 0)
        .map(r => mapRowToApiPayload(r, columnMap));

      // Collect unique agent names and which rows they appear on
      const nameRowMap = new Map<string, number[]>();
      validMapped.forEach((row, idx) => {
        const name = String(row.agentName ?? '').trim();
        if (name) {
          const rows = nameRowMap.get(name) ?? [];
          rows.push(idx + 2); // 1-based row number
          nameRowMap.set(name, rows);
        }
      });

      const agentNames = Array.from(nameRowMap.entries()).map(([name, rows]) => ({ name, rows }));

      const res = await fetch('/api/admin/import/resolve-agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ agentNames }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Agent resolution failed');

      setAgentResolutions(data.resolutions ?? []);
      setActiveAgentsList(data.activeAgents ?? []);

      // Pre-populate decisions: auto-resolved agents need no action
      const initialDecisions: Record<string, AgentDecision> = {};
      for (const r of (data.resolutions ?? []) as AgentResolution[]) {
        if (r.status === 'auto_resolved') {
          initialDecisions[r.csvName] = { action: 'use_existing', agentId: r.matchedAgentId };
        } else if (r.status === 'fuzzy_match' && r.similarity && r.similarity >= 95) {
          // Very high confidence fuzzy match — pre-accept but user can override
          initialDecisions[r.csvName] = { action: 'use_existing', agentId: r.matchedAgentId };
        }
      }
      setAgentDecisions(initialDecisions);

      // If nothing needs review, skip the review step
      const needsReview = (data.resolutions ?? []).filter(
        (r: AgentResolution) => r.status !== 'auto_resolved' && !(r.status === 'fuzzy_match' && r.similarity && r.similarity >= 95)
      );
      if (needsReview.length === 0) {
        // All agents auto-resolved — go straight to import
        await doImport(initialDecisions);
      } else {
        setStep('agent-review');
      }
    } catch (err: any) {
      setPageError(err.message || 'Failed to resolve agents');
    } finally {
      setResolving(false);
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
    setAgentResolutions([]);
    setAgentDecisions({});
    setActiveAgentsList([]);
    setAgentSearchTerms({});
    setStep('upload');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ── Repair previously imported data (one-time fix) ──────────────────────
  const repairImportedData = async () => {
    if (!user) return;
    setPageError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/fix-imports', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Repair failed');
      }
      alert(`Done! Repaired ${data.patched} of ${data.total} imported transactions.`);
    } catch (err: any) {
      setPageError(err.message || 'Repair failed');
    }
  };

  // ── Bulk delete transactions ────────────────────────────────────────────
  const deleteScopeLabel = (() => {
    if (deleteScope === 'batch_id') {
      const batch = importBatches.find(b => b.importBatchId === selectedBatchId);
      if (!batch) return 'Selected import batch';
      const dt = batch.importedAt ? new Date(batch.importedAt).toLocaleString('en-US', { month:'short', day:'numeric', year:'numeric', hour:'numeric', minute:'2-digit', hour12:true }) : '';
      return `Import batch from ${dt} (${batch.count} transactions)`;
    }
    if (deleteScope === 'imported') return 'All imported transactions' + (deleteMonth ? ` for month ${deleteMonth}` : '');
    if (deleteScope === 'year') return `All transactions for ${deleteYear}` + (deleteMonth ? ` month ${deleteMonth}` : '');
    if (deleteScope === 'source_and_year') return `Imported transactions for ${deleteYear}` + (deleteMonth ? ` month ${deleteMonth}` : '');
    if (deleteScope === 'all') return 'ALL transactions (entire database)';
    return '';
  })();

  const handleBulkDelete = async () => {
    if (!user) return;
    if (deleteConfirmText !== 'DELETE') return;
    setDeleting(true);
    setPageError(null);
    try {
      const token = await user.getIdToken();
      const payload: Record<string, any> = { scope: deleteScope, deleteAutoCreatedAgents };
      if (deleteScope === 'batch_id') {
        payload.batchId = selectedBatchId;
      } else if (deleteScope === 'year' || deleteScope === 'source_and_year') {
        payload.year = Number(deleteYear);
      }
      if (deleteScope !== 'batch_id' && deleteMonth) {
        payload.month = Number(deleteMonth);
      }
      const res = await fetch('/api/admin/bulk-delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Delete failed');
      const parts = [`Deleted ${data.deleted} transaction${data.deleted !== 1 ? 's' : ''}`];
      if (data.agentsDeleted > 0) {
        parts.push(`${data.agentsDeleted} auto-created agent profile${data.agentsDeleted !== 1 ? 's' : ''} removed`);
      }
      alert(parts.join('. ') + '.');
      setShowDeletePanel(false);
      setDeleteConfirmText('');
    } catch (err: any) {
      setPageError(err.message || 'Delete failed');
    } finally {
      setDeleting(false);
    }
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
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={downloadTemplate}>
            <Download className="mr-2 h-4 w-4" /> Download Template
          </Button>
          <Button variant="outline" onClick={repairImportedData}>
            <CheckCircle2 className="mr-2 h-4 w-4" /> Repair Imported Data
          </Button>
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 text-sm flex-wrap">
        {(['upload', 'mapping', 'preview', 'agent-review', 'result'] as Step[]).map((s, i) => (
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
              {i + 1}. {{ upload: 'Upload', mapping: 'Map Columns', preview: 'Preview', 'agent-review': 'Agent Review', result: 'Result' }[s]}
            </span>
          </div>
        ))}
      </div>

      {/* Global error — auto-scrolls into view on new errors */}
      {pageError && (
        <div ref={errorBannerRef}>
          <Alert variant="destructive" className="border-2 border-red-600 relative">
            <AlertTriangle className="h-5 w-5" />
            <AlertTitle className="text-base font-bold">Import Error — Action Required</AlertTitle>
            <AlertDescription className="mt-1 text-sm whitespace-pre-wrap">{pageError}</AlertDescription>
            <button
              onClick={() => setPageError(null)}
              className="absolute top-2 right-3 text-red-600 hover:text-red-900 text-xs underline"
            >
              Dismiss
            </button>
          </Alert>
        </div>
      )}

      {/* ── STEP 1: UPLOAD ────────────────────────────────────────────────── */}
      {step === 'upload' && (
        <div className="space-y-6">
          {/* Drop zone */}
          <Card>
            <CardHeader>
              <CardTitle>Upload Excel or CSV File</CardTitle>
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
                <p className="text-lg font-medium mb-1">Drop your Excel (.xlsx) or CSV file here</p>
                <p className="text-sm text-muted-foreground mb-4">or click to browse</p>
                <Button variant="outline" size="sm" type="button">
                  <Upload className="mr-2 h-4 w-4" /> Choose File
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
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

      {/* ── STEP 2: MAP COLUMNS ──────────────────────────────────────────── */}
      {step === 'mapping' && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Map Your CSV Columns</CardTitle>
              <CardDescription>
                We auto-detected most columns. Review the mapping below and fix any that look wrong.
                The &quot;Sample Data&quot; column shows the first row so you can verify.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8">#</TableHead>
                      <TableHead>Your CSV Column</TableHead>
                      <TableHead>Sample Data (Row 1)</TableHead>
                      <TableHead>Maps To</TableHead>
                      <TableHead className="text-center w-20">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {csvHeaders.map((h, i) => {
                      const mapped = columnMap[h] || '';
                      const sampleVal = parsedRows[0]?.[h] ?? '';
                      const isRequired = ['agentName', 'address', 'status'].includes(mapped);
                      return (
                        <TableRow key={h} className={!mapped ? 'bg-yellow-50 dark:bg-yellow-950/10' : ''}>
                          <TableCell className="text-muted-foreground text-xs">{i + 1}</TableCell>
                          <TableCell className="font-mono text-xs font-medium">{h}</TableCell>
                          <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                            {sampleVal || <span className="italic text-red-400">empty</span>}
                          </TableCell>
                          <TableCell>
                            <select
                              className="w-full border rounded-md px-2 py-1 text-sm bg-background"
                              value={mapped}
                              onChange={(e) => {
                                setColumnMap((prev) => {
                                  const next = { ...prev };
                                  // Remove old mapping if this apiKey was already assigned
                                  if (e.target.value) {
                                    for (const [k, v] of Object.entries(next)) {
                                      if (v === e.target.value) delete next[k];
                                    }
                                  }
                                  if (e.target.value) {
                                    next[h] = e.target.value;
                                  } else {
                                    delete next[h];
                                  }
                                  return next;
                                });
                              }}
                            >
                              <option value="">— skip this column —</option>
                              <option value="agentName">Agent Name *</option>
                              <option value="team">Team</option>
                              <option value="closingType">Deal Type (Buyer/Listing/Lease/Referral)</option>
                              <option value="status">Status *</option>
                              <option value="dealType">Type of Closing (Residential/Land/Commercial)</option>
                              <option value="address">Address *</option>
                              <option value="clientName">Client Name</option>
                              <option value="dealSource">Source</option>
                              <option value="listingDate">Listing Date</option>
                              <option value="underContractDate">Under Contract Date</option>
                              <option value="projCloseDate">Proj Close Date</option>
                              <option value="expDate">Exp Date</option>
                              <option value="closedDate">Closed Date</option>
                              <option value="listPrice">List Price</option>
                              <option value="salePrice">Sale Price</option>
                              <option value="commissionPct">Commission %</option>
                              <option value="gci">GCI</option>
                              <option value="transactionFee">Transaction Fee</option>
                              <option value="brokerPct">Broker %</option>
                              <option value="brokerGci">Broker GCI</option>
                              <option value="agentPct">Agent %</option>
                              <option value="agentDollar">Agent $ (Primary GCI)</option>
                              <option value="referral">Referral</option>
                              <option value="teamMember1">Team Member 1</option>
                              <option value="teamMember1Pct">Team Member 1 Split%</option>
                              <option value="teamMember1Gci">Team Member 1 GCI</option>
                              <option value="teamMember2">Team Member 2</option>
                              <option value="teamMember2Pct">Team Member 2 Split%</option>
                              <option value="teamMember2Gci">Team Member 2 GCI</option>
                              <option value="teamMember3">Team Member 3</option>
                              <option value="teamMember3Pct">Team Member 3 Split%</option>
                              <option value="teamMember3Gci">Team Member 3 GCI</option>
                              <option value="coAgent1">Co-Agent 1</option>
                              <option value="coAgent1Pct">Co-Agent 1 Split%</option>
                              <option value="coAgent1Gci">Co-Agent 1 GCI</option>
                              <option value="coAgent2">Co-Agent 2</option>
                              <option value="coAgent2Pct">Co-Agent 2 Split%</option>
                              <option value="coAgent2Gci">Co-Agent 2 GCI</option>
                              <option value="coAgent3">Co-Agent 3</option>
                              <option value="coAgent3Pct">Co-Agent 3 Split%</option>
                              <option value="coAgent3Gci">Co-Agent 3 GCI</option>
                              <option value="expenseCredits">Expense Credits</option>
                              <option value="mortgageCompany">Mortgage Company</option>
                              <option value="titleCompany">Title Company</option>
                              <option value="notes">Notes / Comments</option>
                            </select>
                          </TableCell>
                          <TableCell className="text-center">
                            {mapped ? (
                              <CheckCircle2 className="h-4 w-4 text-green-500 inline" />
                            ) : (
                              <span className="text-xs text-muted-foreground">skip</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Missing required fields warning */}
              {(() => {
                const mappedValues = new Set(Object.values(columnMap));
                const missing = [
                  { key: 'agentName', label: 'Agent Name' },
                  { key: 'address', label: 'Address' },
                  { key: 'status', label: 'Status' },
                ].filter((f) => !mappedValues.has(f.key));
                if (missing.length === 0) return null;
                return (
                  <Alert variant="destructive" className="mt-4">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Missing Required Columns</AlertTitle>
                    <AlertDescription>
                      {missing.map((m) => m.label).join(', ')} — assign these using the dropdowns above.
                    </AlertDescription>
                  </Alert>
                );
              })()}
            </CardContent>
          </Card>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={() => {
                // Re-validate rows using the column mapping
                const mappedValues = new Set(Object.values(columnMap));
                if (!mappedValues.has('agentName') || !mappedValues.has('address') || !mappedValues.has('status')) {
                  setPageError('Please map the required columns: Agent Name, Address, and Status.');
                  return;
                }
                setPageError(null);

                // Re-run validation on rows using the mapping
                const updatedRows = parsedRows.map((row) => {
                  const errors: string[] = [];
                  // Find which CSV column maps to each required field
                  for (const [csvCol, apiKey] of Object.entries(columnMap)) {
                    if (['agentName', 'address', 'status'].includes(apiKey)) {
                      if (!row[csvCol]?.trim()) {
                        errors.push(`"${apiKey}" is required`);
                      }
                    }
                  }
                  return { ...row, __errors: errors };
                });
                setParsedRows(updatedRows);
                setStep('preview');
              }}
              disabled={!Object.values(columnMap).includes('agentName') || !Object.values(columnMap).includes('status') || !Object.values(columnMap).includes('address')}
            >
              Continue to Preview
            </Button>
            <Button variant="outline" onClick={reset}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Start Over
            </Button>
          </div>
        </div>
      )}

      {/* ── DANGER ZONE: Bulk Delete ──────────────────────────────────────── */}
      {step === 'upload' && (
        <Card className="border-red-500/20">
          <CardHeader className="cursor-pointer" onClick={() => setShowDeletePanel((v) => !v)}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Trash2 className="h-5 w-5 text-red-500" />
                <CardTitle className="text-base">Danger Zone: Bulk Delete Transactions</CardTitle>
              </div>
              <span className="text-sm text-muted-foreground">{showDeletePanel ? 'Hide' : 'Show'}</span>
            </div>
            <CardDescription>Remove transactions in bulk by source, year, or month.</CardDescription>
          </CardHeader>
          {showDeletePanel && (
            <CardContent className="space-y-4">
              {/* Scope */}
              <div>
                <label className="block text-sm font-medium mb-1">What to delete</label>
                <select
                  className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                  value={deleteScope}
                  onChange={(e) => setDeleteScope(e.target.value)}
                >
                  <option value="batch_id">Delete a specific import batch (by date)</option>
                  <option value="imported">All imported transactions (bulk imports only)</option>
                  <option value="source_and_year">Imported transactions for a specific year</option>
                  <option value="year">All transactions for a specific year</option>
                  <option value="all">ALL transactions (entire database)</option>
                </select>
              </div>

              {/* Batch picker — shown when scope is batch_id */}
              {deleteScope === 'batch_id' && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-sm font-medium">Select Import Batch</label>
                    <button type="button" onClick={loadBatches} className="text-xs text-blue-600 hover:underline">
                      {batchesLoading ? 'Loading…' : 'Refresh'}
                    </button>
                  </div>
                  {batchesLoading ? (
                    <div className="text-sm text-muted-foreground py-2">Loading import batches…</div>
                  ) : importBatches.length === 0 ? (
                    <div className="text-sm text-muted-foreground py-2 border rounded-md px-3">
                      No import batches found. Batches are tracked for imports done after this update.
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-64 overflow-y-auto border rounded-md p-2">
                      {importBatches.map((batch) => {
                        const dt = batch.importedAt
                          ? new Date(batch.importedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
                          : 'Unknown date';
                        const isSelected = selectedBatchId === batch.importBatchId;
                        return (
                          <div
                            key={batch.importBatchId}
                            onClick={() => setSelectedBatchId(batch.importBatchId)}
                            className={`cursor-pointer rounded-md border p-3 text-sm transition-colors ${
                              isSelected ? 'border-red-400 bg-red-50' : 'border-border hover:bg-muted/50'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-medium">{dt}</span>
                              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                                {batch.count} transaction{batch.count !== 1 ? 's' : ''}
                              </span>
                            </div>
                            {batch.years.length > 0 && (
                              <div className="text-xs text-muted-foreground mt-1">
                                Year{batch.years.length > 1 ? 's' : ''}: {batch.years.join(', ')}
                              </div>
                            )}
                            {batch.sampleAgents.length > 0 && (
                              <div className="text-xs text-muted-foreground mt-0.5">
                                Agents: {batch.sampleAgents.join(', ')}{batch.count > batch.sampleAgents.length ? ' …' : ''}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
              {/* Year picker — shown when scope needs a year */}
              {(deleteScope === 'year' || deleteScope === 'source_and_year') && (
                <div>
                  <label className="block text-sm font-medium mb-1">Year</label>
                  <select
                    className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                    value={deleteYear}
                    onChange={(e) => setDeleteYear(e.target.value)}
                  >
                    {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i).map((y) => (
                      <option key={y} value={String(y)}>{y}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Month picker — optional, shown for all scopes except 'all' */}
              {deleteScope !== 'all' && (
                <div>
                  <label className="block text-sm font-medium mb-1">Month (optional)</label>
                  <select
                    className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                    value={deleteMonth}
                    onChange={(e) => setDeleteMonth(e.target.value)}
                  >
                    <option value="">All months</option>
                    {['January','February','March','April','May','June','July','August','September','October','November','December'].map((m, i) => (
                      <option key={i + 1} value={String(i + 1)}>{m}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Also delete auto-created agents */}
              <div className="flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 p-3">
                <input
                  type="checkbox"
                  id="deleteAgents"
                  checked={deleteAutoCreatedAgents}
                  onChange={(e) => setDeleteAutoCreatedAgents(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-gray-300"
                />
                <label htmlFor="deleteAgents" className="text-sm">
                  <span className="font-medium text-amber-800">Also delete auto-created agent profiles</span>
                  <p className="text-xs text-amber-700 mt-0.5">
                    Removes agent profiles that were auto-created during bulk import, but only if they have no remaining transactions.
                    This prevents duplicates when you re-upload.
                  </p>
                </label>
              </div>

              {/* Summary + confirm */}
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>This action cannot be undone</AlertTitle>
                <AlertDescription>
                  <p className="mb-2">You are about to delete: <strong>{deleteScopeLabel}</strong></p>
                  <p className="text-sm mb-3">Type <strong>DELETE</strong> to confirm:</p>
                  <input
                    type="text"
                    className="w-full border rounded-md px-3 py-2 text-sm bg-background mb-3"
                    placeholder="Type DELETE to confirm"
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                  />
                  <Button
                    variant="destructive"
                    disabled={deleteConfirmText !== 'DELETE' || deleting}
                    onClick={handleBulkDelete}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {deleting ? 'Deleting...' : 'Permanently Delete'}
                  </Button>
                </AlertDescription>
              </Alert>
            </CardContent>
          )}
        </Card>
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
                      Row {r.__rowNum} ({r['agent name'] || 'no agent'} — {r['address'] || 'no address'}): {r.__errors.join('; ')}
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
                      {csvHeaders.map((h) => (
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
                        {csvHeaders.map((h) => (
                          <TableCell key={h} className="whitespace-nowrap max-w-[180px] p-0">
                            <input
                              type="text"
                              className="w-full px-2 py-1 text-xs bg-transparent border-0 outline-none focus:bg-blue-50 dark:focus:bg-blue-950/20 focus:ring-1 focus:ring-blue-300"
                              value={row[h] ?? ''}
                              onChange={(e) => {
                                setParsedRows((prev) =>
                                  prev.map((r) =>
                                    r.__rowNum === row.__rowNum ? { ...r, [h]: e.target.value } : r
                                  )
                                );
                              }}
                            />
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
                <p className="text-sm font-medium mb-2">Importing {validRows.length} transaction{validRows.length !== 1 ? 's' : ''}…{validRows.length > 500 ? ` (${Math.ceil(validRows.length / 500)} batches)` : ''}</p>
                <Progress value={importProgress} className="h-2" />
                <p className="text-xs text-muted-foreground mt-1">{importProgress}% complete</p>
                <p className="text-xs text-muted-foreground mt-1">Checking for duplicates and writing to database — this may take 10–30 seconds. Do not close this page.</p>
              </CardContent>
            </Card>
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={runAgentResolution} disabled={resolving || importing || validRows.length === 0}>
              {resolving ? (
                <>Checking agents…</>
              ) : importing ? (
                <>Importing…</>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Continue — Review Agents
                </>
              )}
            </Button>
            <Button variant="outline" onClick={reset} disabled={resolving || importing}>
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

      {/* ── STEP 4: AGENT REVIEW ────────────────────────────────────────────────────── */}
      {step === 'agent-review' && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-yellow-500" />
                Agent Review Required
              </CardTitle>
              <CardDescription>
                Some agent names in your file need your attention before importing.
                Auto-resolved agents (exact matches) are shown for reference only.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {agentResolutions.map((resolution) => {
                const decision = agentDecisions[resolution.csvName];
                const isAutoResolved = resolution.status === 'auto_resolved' ||
                  (resolution.status === 'fuzzy_match' && (resolution.similarity ?? 0) >= 95);

                return (
                  <div key={resolution.csvName} className={cn(
                    'border rounded-lg p-4 space-y-3',
                    isAutoResolved ? 'border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/20' :
                    resolution.status === 'former_agent' ? 'border-orange-200 bg-orange-50/50 dark:border-orange-900 dark:bg-orange-950/20' :
                    resolution.status === 'no_match' ? 'border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20' :
                    'border-yellow-200 bg-yellow-50/50 dark:border-yellow-900 dark:bg-yellow-950/20'
                  )}>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-medium">{resolution.csvName}</p>
                        <p className="text-xs text-muted-foreground">
                          Appears on {resolution.rowNumbers.length} row{resolution.rowNumbers.length !== 1 ? 's' : ''}
                          {resolution.rowNumbers.length <= 5 ? ` (rows ${resolution.rowNumbers.join(', ')})` : ''}
                        </p>
                      </div>
                      <Badge variant="outline" className={cn(
                        'shrink-0 text-xs',
                        isAutoResolved ? 'border-green-500 text-green-700' :
                        resolution.status === 'former_agent' ? 'border-orange-500 text-orange-700' :
                        resolution.status === 'no_match' ? 'border-red-500 text-red-700' :
                        'border-yellow-500 text-yellow-700'
                      )}>
                        {isAutoResolved ? '✓ Auto-resolved' :
                         resolution.status === 'former_agent' ? 'Former agent' :
                         resolution.status === 'no_match' ? 'No match found' :
                         `${Math.round((resolution.similarity ?? 0) * 100)}% match`}
                      </Badge>
                    </div>

                    {isAutoResolved ? (
                      <p className="text-sm text-green-700 dark:text-green-400">
                        ✓ Matched to <strong>{resolution.matchedDisplayName}</strong> (exact match)
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {resolution.status === 'former_agent' && (
                          <p className="text-sm text-orange-700 dark:text-orange-400">
                            This agent (<strong>{resolution.matchedDisplayName}</strong>) is marked as inactive/former.
                            Choose how to handle their {resolution.rowNumbers.length} transaction{resolution.rowNumbers.length !== 1 ? 's' : ''}:
                          </p>
                        )}
                        {resolution.status === 'fuzzy_match' && (
                          <p className="text-sm text-yellow-700 dark:text-yellow-400">
                            Possible match: <strong>{resolution.matchedDisplayName}</strong> ({Math.round((resolution.similarity ?? 0) * 100)}% similar).
                            Is this the same person?
                          </p>
                        )}
                        {resolution.status === 'no_match' && (
                          <p className="text-sm text-red-700 dark:text-red-400">
                            No existing agent found for this name.
                          </p>
                        )}

                        {/* Action buttons */}
                        <div className="flex flex-wrap gap-2">
                          {(resolution.status === 'fuzzy_match' || resolution.status === 'former_agent') && resolution.matchedAgentId && (
                            <Button
                              size="sm"
                              variant={decision?.action === 'use_existing' ? 'default' : 'outline'}
                              onClick={() => setAgentDecisions(prev => ({ ...prev, [resolution.csvName]: { action: 'use_existing', agentId: resolution.matchedAgentId } }))}
                            >
                              {resolution.status === 'former_agent' ? 'Import to former agent' : '✓ Yes, same person'}
                            </Button>
                          )}
                          {resolution.status === 'former_agent' && resolution.matchedAgentId && (
                            <Button
                              size="sm"
                              variant={decision?.action === 'historical' ? 'default' : 'outline'}
                              onClick={() => setAgentDecisions(prev => ({ ...prev, [resolution.csvName]: { action: 'historical', agentId: resolution.matchedAgentId } }))}
                            >
                              Import as historical only
                            </Button>
                          )}
                          {resolution.status === 'fuzzy_match' && (
                            <Button
                              size="sm"
                              variant={decision?.action === 'create_new' ? 'default' : 'outline'}
                              onClick={() => setAgentDecisions(prev => ({ ...prev, [resolution.csvName]: { action: 'create_new', displayName: resolution.csvName } }))}
                            >
                              No, different person — create new
                            </Button>
                          )}
                          {resolution.status === 'no_match' && (
                            <Button
                              size="sm"
                              variant={decision?.action === 'create_new' ? 'default' : 'outline'}
                              onClick={() => setAgentDecisions(prev => ({ ...prev, [resolution.csvName]: { action: 'create_new', displayName: resolution.csvName } }))}
                            >
                              Create new historical profile
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant={decision?.action === 'skip' ? 'destructive' : 'outline'}
                            onClick={() => setAgentDecisions(prev => ({ ...prev, [resolution.csvName]: { action: 'skip' } }))}
                          >
                            Skip all {resolution.rowNumbers.length} rows
                          </Button>
                        </div>

                        {/* Manual agent picker for no_match */}
                        {resolution.status === 'no_match' && (
                          <div className="mt-2">
                            <p className="text-xs text-muted-foreground mb-1">Or assign to an existing agent:</p>
                            <div className="flex gap-2">
                              <input
                                type="text"
                                placeholder="Search agents…"
                                className="flex-1 text-sm border rounded px-2 py-1"
                                value={agentSearchTerms[resolution.csvName] ?? ''}
                                onChange={e => setAgentSearchTerms(prev => ({ ...prev, [resolution.csvName]: e.target.value }))}
                              />
                            </div>
                            {agentSearchTerms[resolution.csvName] && (
                              <div className="mt-1 border rounded max-h-32 overflow-y-auto">
                                {activeAgentsList
                                  .filter(a => a.displayName.toLowerCase().includes((agentSearchTerms[resolution.csvName] ?? '').toLowerCase()))
                                  .slice(0, 8)
                                  .map(a => (
                                    <button
                                      key={a.agentId}
                                      className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted"
                                      onClick={() => {
                                        setAgentDecisions(prev => ({ ...prev, [resolution.csvName]: { action: 'use_existing', agentId: a.agentId, displayName: a.displayName } }));
                                        setAgentSearchTerms(prev => ({ ...prev, [resolution.csvName]: '' }));
                                      }}
                                    >
                                      {a.displayName}
                                    </button>
                                  ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Summary and proceed */}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={() => doImport(agentDecisions)}
              disabled={importing || agentResolutions.some(r => {
                const isAutoResolved = r.status === 'auto_resolved' || (r.status === 'fuzzy_match' && (r.similarity ?? 0) >= 95);
                return !isAutoResolved && !agentDecisions[r.csvName];
              })}
            >
              {importing ? (
                <>Importing…</>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Import {validRows.length} Transaction{validRows.length !== 1 ? 's' : ''}
                </>
              )}
            </Button>
            <Button variant="outline" onClick={() => setStep('preview')} disabled={importing}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Preview
            </Button>
            {agentResolutions.some(r => {
              const isAutoResolved = r.status === 'auto_resolved' || (r.status === 'fuzzy_match' && (r.similarity ?? 0) >= 95);
              return !isAutoResolved && !agentDecisions[r.csvName];
            }) && (
              <p className="text-sm text-yellow-600">
                Please resolve all flagged agents before importing.
              </p>
            )}
          </div>

          {importing && (
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm font-medium mb-2">Importing {validRows.length} transactions…</p>
                <Progress value={importProgress} className="h-2" />
                <p className="text-xs text-muted-foreground mt-1">{importProgress}% complete</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── STEP 3: RESULT ────────────────────────────────────────────────── */}
      {step === 'result' && importResult && (
        <div className="space-y-6">
          {/* Result hero */}
          <Card className={cn(
            'border-2',
            importResult.imported === 0 && importResult.updated === 0
              ? 'border-red-500/60'
              : importResult.failed === 0 ? 'border-green-500/40' : 'border-yellow-500/40'
          )}>
            <CardContent className="pt-8 pb-8 text-center">
              {importResult.imported === 0 && importResult.updated === 0 ? (
                <XCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
              ) : importResult.failed === 0 ? (
                <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto mb-4" />
              ) : (
                <AlertTriangle className="h-16 w-16 text-yellow-500 mx-auto mb-4" />
              )}
              <h2 className="text-2xl font-bold mb-2">
                {importResult.imported === 0 && importResult.updated === 0 && (
                  <span className="text-red-600">Nothing Was Saved to the Database</span>
                )}
                {importResult.imported > 0 && `${importResult.imported} New Transaction${importResult.imported !== 1 ? 's' : ''} Created`}
                {importResult.imported > 0 && importResult.updated > 0 && ' · '}
                {importResult.updated > 0 && `${importResult.updated} Existing Transaction${importResult.updated !== 1 ? 's' : ''} Updated`}
              </h2>
              {importResult.imported === 0 && importResult.updated === 0 && importResult.failed > 0 && (
                <p className="text-red-600 font-medium">
                  All {importResult.failed} row{importResult.failed !== 1 ? 's' : ''} failed. See the error table below for details.
                </p>
              )}
              {(importResult.imported > 0 || importResult.updated > 0) && importResult.failed > 0 && (
                <p className="text-muted-foreground">
                  {importResult.failed} row{importResult.failed !== 1 ? 's' : ''} failed and were skipped. See error table below.
                </p>
              )}
              {importResult.failed === 0 && importResult.updated > 0 && importResult.imported === 0 && (
                <p className="text-muted-foreground">All rows matched existing transactions — no duplicates created.</p>
              )}
              {importResult.failed === 0 && importResult.imported > 0 && importResult.updated === 0 && (
                <p className="text-muted-foreground">All rows imported as new transactions.</p>
              )}
              {importResult.failed === 0 && importResult.imported > 0 && importResult.updated > 0 && (
                <p className="text-muted-foreground">Duplicate detection ran on every row — existing transactions were updated, new ones were created.</p>
              )}
            </CardContent>
          </Card>

          {/* Fuzzy-matched agents (misspellings auto-corrected) */}
          {importResult.fuzzyMatchedAgents && importResult.fuzzyMatchedAgents.length > 0 && (
            <Alert className="border-green-500/40 bg-green-50">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertTitle className="text-green-800">
                {importResult.fuzzyMatchedAgents.length} Misspelled Name{importResult.fuzzyMatchedAgents.length !== 1 ? 's' : ''} Auto-Corrected
              </AlertTitle>
              <AlertDescription>
                <p className="text-sm mb-2 text-green-700">
                  These names were similar to existing agents and were automatically matched instead of creating duplicates:
                </p>
                <div className="mt-2 space-y-1">
                  {importResult.fuzzyMatchedAgents.map((m, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <span className="text-gray-500">Row {m.row}:</span>
                      <span className="line-through text-red-600">{m.csvName}</span>
                      <span className="text-gray-400">→</span>
                      <span className="font-medium text-green-700">{m.matchedName}</span>
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                        {m.similarity}% match
                      </span>
                    </div>
                  ))}
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Auto-created agents */}
          {importResult.autoCreatedAgents && importResult.autoCreatedAgents.length > 0 && (
            <Alert className="border-blue-500/40">
              <Info className="h-4 w-4" />
              <AlertTitle>
                {importResult.autoCreatedAgents.length} New Agent Profile{importResult.autoCreatedAgents.length !== 1 ? 's' : ''} Created
              </AlertTitle>
              <AlertDescription>
                <p className="text-sm mb-2">
                  The following agents were not found and were automatically created. You can update their details in the Agents section.
                </p>
                <ul className="list-disc list-inside mt-1 space-y-1 text-sm">
                  {importResult.autoCreatedAgents.map((a, i) => (
                    <li key={i}>{a.name}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {/* Failed rows (server-side failures) */}
          {importResult.errors && importResult.errors.length > 0 && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>{importResult.errors.length} Row{importResult.errors.length !== 1 ? 's' : ''} Failed to Import</AlertTitle>
              <AlertDescription>
                <p className="text-sm mb-2">These rows were skipped. Common causes: invalid status value, missing agent name, or unrecognized address format.</p>
                <div className="mt-2 max-h-64 overflow-y-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-red-300">
                        <th className="text-left py-1 pr-3 font-medium">Row</th>
                        <th className="text-left py-1 font-medium">Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importResult.errors.slice(0, 50).map((e, i) => (
                        <tr key={i} className="border-b border-red-200/50">
                          <td className="py-1 pr-3 font-mono">{e.row}</td>
                          <td className="py-1">{e.error}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {importResult.errors.length > 50 && (
                    <p className="text-xs mt-2">…and {importResult.errors.length - 50} more rows failed.</p>
                  )}
                </div>
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
