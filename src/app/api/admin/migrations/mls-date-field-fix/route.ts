/**
 * POST /api/admin/migrations/mls-date-field-fix
 *
 * Operation A — MLS Field Name Fix
 *
 * Problem: The MLS import stores dates as:
 *   closeDate        (should be → closedDate)
 *   underContractDate (should be → contractDate)
 *
 * The main SmartBroker system reads closedDate and contractDate.
 * So MLS-imported transactions appear to have missing dates even though
 * the data is there under different field names.
 *
 * This migration:
 *   1. Scans all transactions with source = 'mls_import'
 *   2. For each record where closedDate is blank but closeDate is populated:
 *      → copies closeDate → closedDate
 *   3. For each record where contractDate is blank but underContractDate is populated:
 *      → copies underContractDate → contractDate
 *   4. Recalculates year from closedDate if it changed
 *   5. Validates: closedDate > listingDate, closedDate > contractDate, no future closedDates
 *   6. In dryRun mode: returns full preview with no writes
 *   7. In execute mode: writes updates in Firestore batches and triggers rollup rebuilds
 *
 * Body: { dryRun: boolean, yearFrom?: number, yearTo?: number }
 * Admin only.
 */
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';
import { rebuildAgentRollup } from '@/lib/rollups/rebuildAgentRollup';

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

function toDateStr(val: any): string | null {
  if (!val) return null;
  if (typeof val === 'string') return val.slice(0, 10);
  if (val?.toDate) return val.toDate().toISOString().slice(0, 10);
  return null;
}

function yearFromDateStr(d: string | null): number | null {
  if (!d) return null;
  const y = parseInt(d.slice(0, 4), 10);
  return isNaN(y) ? null : y;
}

function compareDates(a: string | null, b: string | null): number {
  if (!a || !b) return 0;
  return a < b ? -1 : a > b ? 1 : 0;
}

type ValidationIssue = 'FUTURE_CLOSE_DATE' | 'CLOSE_BEFORE_LISTING' | 'CLOSE_BEFORE_CONTRACT';

interface RecordPreview {
  id: string;
  address: string;
  agentDisplayName: string;
  agentId: string;
  currentClosedDate: string | null;
  currentContractDate: string | null;
  currentYear: number | null;
  sourceCloseDate: string | null;        // closeDate field
  sourceUnderContractDate: string | null; // underContractDate field
  listingDate: string | null;
  proposedClosedDate: string | null;
  proposedContractDate: string | null;
  proposedYear: number | null;
  yearWillChange: boolean;
  closedDateWillChange: boolean;
  contractDateWillChange: boolean;
  validationIssues: ValidationIssue[];
}

export async function POST(req: NextRequest) {
  try {
    // ── Auth ──────────────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization') || req.headers.get('authorization') || '';
    if (!authHeader.startsWith('Bearer ')) return jsonError(401, 'Unauthorized');
    const token = authHeader.slice('Bearer '.length).trim();
    const decoded = await adminAuth.verifyIdToken(token);
    if (!(await isAdminLike(decoded.uid))) return jsonError(403, 'Forbidden: Admin only');

    // ── Body ──────────────────────────────────────────────────────────────
    const body = await req.json().catch(() => ({}));
    const dryRun: boolean = body.dryRun !== false; // default to dryRun=true for safety
    const yearFrom: number | null = body.yearFrom ? Number(body.yearFrom) : null;
    const yearTo: number | null = body.yearTo ? Number(body.yearTo) : null;
    const today = new Date().toISOString().slice(0, 10);

    // ── Load all MLS-imported transactions ────────────────────────────────
    let query: FirebaseFirestore.Query = adminDb
      .collection('transactions')
      .where('source', '==', 'mls_import');

    const snap = await query.get();
    const allDocs = snap.docs;

    // ── Analyze each record ───────────────────────────────────────────────
    const willUpdate: RecordPreview[] = [];
    const alreadyComplete: number[] = [];   // count only
    const noSourceDate: number[] = [];       // count only
    const validationFailed: RecordPreview[] = [];

    for (const doc of allDocs) {
      const d = doc.data();

      // Year range filter (applied to existing year or derived year)
      const existingYear = d.year ? Number(d.year) : null;
      if (yearFrom && existingYear && existingYear < yearFrom) continue;
      if (yearTo && existingYear && existingYear > yearTo) continue;

      const currentClosedDate = toDateStr(d.closedDate ?? d.closingDate);
      const currentContractDate = toDateStr(d.contractDate);
      const currentYear = existingYear;
      const listingDate = toDateStr(d.listingDate);

      // Source fields (the MLS-specific field names)
      const sourceCloseDate = toDateStr(d.closeDate ?? d.soldDate);
      const sourceUnderContractDate = toDateStr(d.underContractDate);

      // Determine what would change
      const proposedClosedDate = !currentClosedDate && sourceCloseDate ? sourceCloseDate : currentClosedDate;
      const proposedContractDate = !currentContractDate && sourceUnderContractDate ? sourceUnderContractDate : currentContractDate;

      const closedDateWillChange = proposedClosedDate !== currentClosedDate;
      const contractDateWillChange = proposedContractDate !== currentContractDate;

      // If nothing will change, check why
      if (!closedDateWillChange && !contractDateWillChange) {
        if (currentClosedDate) {
          alreadyComplete.push(1);
        } else {
          noSourceDate.push(1);
        }
        continue;
      }

      // Calculate proposed year
      const proposedYear = yearFromDateStr(proposedClosedDate) ?? yearFromDateStr(toDateStr(d.listingDate)) ?? currentYear;
      const yearWillChange = proposedYear !== currentYear;

      // Validate
      const validationIssues: ValidationIssue[] = [];

      if (proposedClosedDate) {
        // No future close dates for historical records
        if (proposedClosedDate > today) {
          validationIssues.push('FUTURE_CLOSE_DATE');
        }
        // closedDate must be after listingDate
        if (listingDate && compareDates(proposedClosedDate, listingDate) < 0) {
          validationIssues.push('CLOSE_BEFORE_LISTING');
        }
        // closedDate must be after contractDate
        if (proposedContractDate && compareDates(proposedClosedDate, proposedContractDate) < 0) {
          validationIssues.push('CLOSE_BEFORE_CONTRACT');
        }
      }

      const preview: RecordPreview = {
        id: doc.id,
        address: String(d.address || d.propertyAddress || ''),
        agentDisplayName: String(d.agentDisplayName || d.agentName || d.agentId || ''),
        agentId: String(d.agentId || ''),
        currentClosedDate,
        currentContractDate,
        currentYear,
        sourceCloseDate,
        sourceUnderContractDate,
        listingDate,
        proposedClosedDate,
        proposedContractDate,
        proposedYear,
        yearWillChange,
        closedDateWillChange,
        contractDateWillChange,
        validationIssues,
      };

      if (validationIssues.length > 0) {
        validationFailed.push(preview);
      } else {
        willUpdate.push(preview);
      }
    }

    // ── Summary ───────────────────────────────────────────────────────────
    const yearChanges = willUpdate.filter(r => r.yearWillChange).length;
    const closedDateFixes = willUpdate.filter(r => r.closedDateWillChange).length;
    const contractDateFixes = willUpdate.filter(r => r.contractDateWillChange).length;

    const summary = {
      totalMlsTransactionsScanned: allDocs.length,
      alreadyHaveClosedDate: alreadyComplete.length,
      noSourceDateAvailable: noSourceDate.length,
      willBeUpdated: willUpdate.length,
      validationFailed: validationFailed.length,
      closedDateFixes,
      contractDateFixes,
      yearChanges,
      dryRun,
    };

    // ── If dry run, return preview only ───────────────────────────────────
    if (dryRun) {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        summary,
        // Return first 200 records for preview
        preview: willUpdate.slice(0, 200),
        validationFailures: validationFailed.slice(0, 50),
        previewTruncated: willUpdate.length > 200,
        validationTruncated: validationFailed.length > 50,
      });
    }

    // ── Execute: write updates in Firestore batches ───────────────────────
    const MAX_BATCH = 400;
    let batch = adminDb.batch();
    let batchCount = 0;
    let updated = 0;
    const agentYearsToRebuild = new Set<string>(); // "agentId:year"

    for (const record of willUpdate) {
      const ref = adminDb.collection('transactions').doc(record.id);
      const updates: Record<string, any> = {};

      if (record.closedDateWillChange && record.proposedClosedDate) {
        updates.closedDate = record.proposedClosedDate;
        updates.closingDate = record.proposedClosedDate; // keep legacy field in sync
      }
      if (record.contractDateWillChange && record.proposedContractDate) {
        updates.contractDate = record.proposedContractDate;
      }
      if (record.yearWillChange && record.proposedYear) {
        updates.year = record.proposedYear;
        // Track old year for rollup rebuild
        if (record.currentYear && record.agentId) {
          agentYearsToRebuild.add(`${record.agentId}:${record.currentYear}`);
        }
      }
      if (record.proposedYear && record.agentId) {
        agentYearsToRebuild.add(`${record.agentId}:${record.proposedYear}`);
      }

      updates.mlsDateFieldFixApplied = true;
      updates.mlsDateFieldFixAt = new Date().toISOString();

      batch.update(ref, updates);
      batchCount++;
      updated++;

      if (batchCount >= MAX_BATCH) {
        await batch.commit();
        batch = adminDb.batch();
        batchCount = 0;
      }
    }
    if (batchCount > 0) await batch.commit();

    // ── Rebuild leaderboard rollups for affected agent/year combos ────────
    const rebuildResults: { agentId: string; year: number; ok: boolean }[] = [];
    for (const key of agentYearsToRebuild) {
      const [agentId, yearStr] = key.split(':');
      const year = Number(yearStr);
      try {
        await rebuildAgentRollup(adminDb as any, agentId, year);
        rebuildResults.push({ agentId, year, ok: true });
      } catch {
        rebuildResults.push({ agentId, year, ok: false });
      }
    }

    return NextResponse.json({
      ok: true,
      dryRun: false,
      summary: { ...summary, updated },
      rollupRebuilds: rebuildResults.length,
      rollupRebuildDetails: rebuildResults.slice(0, 50),
      validationFailures: validationFailed.slice(0, 50),
    });
  } catch (err: any) {
    console.error('[mls-date-field-fix]', err);
    return jsonError(500, err.message ?? 'Internal Server Error');
  }
}
