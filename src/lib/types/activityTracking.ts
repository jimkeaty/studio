// src/lib/types/activityTracking.ts
// Types for the activity tracking import system

export interface ActivityRecord {
  /** Firestore document ID */
  id?: string;

  /** Agent identifiers */
  agentId: string;
  agentDisplayName: string;

  /** Activity date (ISO YYYY-MM-DD) */
  activityDate: string;
  /** Year extracted from activityDate for indexed queries */
  year: number;
  /** Month (1–12) extracted from activityDate */
  month: number;
  /** ISO week number (1–53) */
  week: number;

  /** Activity metrics */
  hours: number;
  calls: number;
  spokeTo: number;
  listingApptsSet: number;
  listingApptsHeld: number;
  listingContractsSigned: number;
  buyerApptsSet: number;
  buyerApptsHeld: number;
  buyerContractsSigned: number;

  /** Optional notes / comments */
  notes: string | null;

  /**
   * Unique key used to prevent duplicate imports.
   * Format: `src:{sourceRowId}` when sourceRowId is available,
   * otherwise `{agentId}|{activityDate}|{calls}|{spokeTo}|{hours}|{lcs}|{bcs}`
   */
  dedupeKey: string;

  /** Source row identifier from the spreadsheet (if present) */
  sourceRowId: string | null;

  /** UUID of the import batch this record came from */
  importBatchId: string;

  /** Raw spreadsheet row preserved for audit / debugging */
  rawRow: Record<string, any>;

  source: 'import';
  importedAt: Date;
  createdAt: Date;
}

/** Shape of one row as mapped from the spreadsheet and sent to the API */
export interface ActivityImportRow {
  sourceRowId: string;
  activityDate: string;
  agentName: string;
  hours: string;
  notes: string;
  calls: string;
  spokeTo: string;
  listingApptsSet: string;
  listingApptsHeld: string;
  listingContractsSigned: string;
  buyerApptsSet: string;
  buyerApptsHeld: string;
  buyerContractsSigned: string;
}

/** Rollup period for the dashboard history card */
export type ActivityRollupPeriod = 'daily' | 'weekly' | 'monthly';

/** One bucket in a rolled-up activity series */
export interface ActivityRollupBucket {
  label: string;   // "Jan", "Wk 12", "Mar 15", etc.
  date: string;    // ISO date of period start
  hours: number;
  calls: number;
  spokeTo: number;
  listingApptsSet: number;
  listingApptsHeld: number;
  listingContractsSigned: number;
  buyerApptsSet: number;
  buyerApptsHeld: number;
  buyerContractsSigned: number;
}
