// src/app/api/admin/import-mls/route.ts
// POST /api/admin/import-mls
// Accepts a CSV of MLS historical data (year, month?, salesCount, salesVolume)
// and stores it in mlsHistoricalData/{year} with Tier 1 (confirmed) data.
// Tier 2 (estimated GCI, margin, broker commission) is calculated on-the-fly
// using the broker plan assumptions and returned in the response.
//
// Firestore: mlsHistoricalData/{year} → {
//   year, source: 'mls', tier: 1,
//   annual: { salesCount, salesVolume },
//   monthly: { [month]: { salesCount, salesVolume } },
//   importedAt, importedBy
// }
//
// The broker plan assumptions (avgCommissionPct, companyRetentionPct) are read
// from brokerCommandGoals and recruitingPlans to compute Tier 2 estimates.

import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';

function extractBearer(req: NextRequest): string | null {
  const h = req.headers.get('Authorization') ?? '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : null;
}

function jsonError(status: number, error: string, details?: any) {
  return NextResponse.json({ ok: false, error, details: details ?? null }, { status });
}

function toNum(v: any): number {
  const n = Number(String(v ?? '').replace(/[$,%\s]/g, '').trim());
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function toInt(v: any): number {
  return Math.round(toNum(v));
}

// Parse a CSV string into rows of key→value objects
function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_'));
  return lines.slice(1).map(line => {
    const vals = line.split(',');
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = (vals[i] ?? '').trim(); });
    return row;
  });
}

// Normalize column names — handles many variations from different MLS exports
function normalizeRow(row: Record<string, string>): {
  year: number | null;
  month: number | null;
  salesCount: number;
  salesVolume: number;
} {
  // Year
  const yearVal = row.year ?? row.yr ?? row.sale_year ?? row.close_year ?? null;
  const year = yearVal ? parseInt(yearVal) : null;

  // Month (optional)
  const monthVal = row.month ?? row.mo ?? row.sale_month ?? row.close_month ?? null;
  const month = monthVal ? parseInt(monthVal) : null;

  // Sales count
  const countVal =
    row.sales_count ?? row.count ?? row.transactions ?? row.num_sales ??
    row.number_of_sales ?? row.closed ?? row.closings ?? null;
  const salesCount = countVal != null ? toInt(countVal) : 0;

  // Sales volume
  const volumeVal =
    row.sales_volume ?? row.volume ?? row.total_volume ?? row.sold_volume ??
    row.total_sales_volume ?? row.gross_sales_volume ?? row.sales_price ?? null;
  const salesVolume = volumeVal != null ? toNum(volumeVal) : 0;

  return { year, month, salesCount, salesVolume };
}

export async function POST(req: NextRequest) {
  const token = extractBearer(req);
  if (!token) return jsonError(401, 'Unauthorized');

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    const ok = await isAdminLike(decoded.uid);
    if (!ok) return jsonError(403, 'Forbidden');

    const contentType = req.headers.get('content-type') ?? '';
    let csvText = '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;
      if (!file) return jsonError(400, 'No file provided');
      csvText = await file.text();
    } else if (contentType.includes('application/json')) {
      const body = await req.json();
      csvText = body.csv ?? '';
    } else {
      csvText = await req.text();
    }

    if (!csvText.trim()) return jsonError(400, 'Empty CSV');

    const rows = parseCSV(csvText);
    if (rows.length === 0) return jsonError(400, 'No data rows found in CSV');

    // ── Parse rows into year/month buckets ────────────────────────────────────
    type YearBucket = {
      annual: { salesCount: number; salesVolume: number };
      monthly: Record<number, { salesCount: number; salesVolume: number }>;
    };
    const byYear: Record<number, YearBucket> = {};

    for (const row of rows) {
      const { year, month, salesCount, salesVolume } = normalizeRow(row);
      if (!year || year < 1990 || year > 2100) continue;
      if (!byYear[year]) {
        byYear[year] = {
          annual: { salesCount: 0, salesVolume: 0 },
          monthly: {},
        };
      }
      if (month && month >= 1 && month <= 12) {
        if (!byYear[year].monthly[month]) {
          byYear[year].monthly[month] = { salesCount: 0, salesVolume: 0 };
        }
        byYear[year].monthly[month].salesCount += salesCount;
        byYear[year].monthly[month].salesVolume += salesVolume;
        byYear[year].annual.salesCount += salesCount;
        byYear[year].annual.salesVolume += salesVolume;
      } else {
        // Annual row — add directly to annual
        byYear[year].annual.salesCount += salesCount;
        byYear[year].annual.salesVolume += salesVolume;
      }
    }

    const years = Object.keys(byYear).map(Number);
    if (years.length === 0) return jsonError(400, 'No valid year data found');

    // ── Fetch broker plan assumptions for Tier 2 estimates ────────────────────
    let avgCommissionPct = 0.03; // default 3%
    let retentionPct = 0.29;     // default 29%

    try {
      // Try to get from broker plan
      const planSnap = await adminDb
        .collection('brokerCommandGoals')
        .where('period', '==', 'TOTAL')
        .orderBy('year', 'desc')
        .limit(1)
        .get();
      if (!planSnap.empty) {
        const planData = planSnap.docs[0].data();
        if (planData.avgCommissionPct) avgCommissionPct = planData.avgCommissionPct / 100;
      }
    } catch { /* use defaults */ }

    try {
      const currentYear = new Date().getFullYear();
      const recruitSnap = await adminDb
        .collection('recruitingPlans')
        .doc(String(currentYear))
        .get();
      if (recruitSnap.exists) {
        const rd = recruitSnap.data() as Record<string, any>;
        if (rd.companyRetentionPct) retentionPct = rd.companyRetentionPct / 100;
      }
    } catch { /* use defaults */ }

    // ── Write to Firestore and compute Tier 2 estimates ───────────────────────
    const now = new Date().toISOString();
    const results: any[] = [];

    for (const year of years) {
      const bucket = byYear[year];
      const { salesCount, salesVolume } = bucket.annual;

      // Tier 2 estimates
      const estimatedGCI = salesVolume * avgCommissionPct;
      const estimatedGrossMargin = estimatedGCI * retentionPct;
      const estimatedBrokerCommission = estimatedGrossMargin;

      const docData = {
        year,
        source: 'mls',
        tier: 1,
        annual: {
          salesCount,
          salesVolume,
          // Tier 2 estimates stored alongside Tier 1 data
          estimatedGCI: Math.round(estimatedGCI),
          estimatedGrossMargin: Math.round(estimatedGrossMargin),
          estimatedBrokerCommission: Math.round(estimatedBrokerCommission),
          assumptionsUsed: {
            avgCommissionPct: avgCommissionPct * 100,
            retentionPct: retentionPct * 100,
          },
        },
        monthly: Object.fromEntries(
          Object.entries(bucket.monthly).map(([m, data]) => {
            const mGCI = data.salesVolume * avgCommissionPct;
            const mMargin = mGCI * retentionPct;
            return [m, {
              salesCount: data.salesCount,
              salesVolume: data.salesVolume,
              estimatedGCI: Math.round(mGCI),
              estimatedGrossMargin: Math.round(mMargin),
              estimatedBrokerCommission: Math.round(mMargin),
            }];
          })
        ),
        importedAt: now,
        importedBy: decoded.uid,
      };

      await adminDb.collection('mlsHistoricalData').doc(String(year)).set(docData, { merge: true });

      results.push({
        year,
        salesCount,
        salesVolume,
        estimatedGCI: Math.round(estimatedGCI),
        estimatedGrossMargin: Math.round(estimatedGrossMargin),
        monthsImported: Object.keys(bucket.monthly).length,
      });
    }

    return NextResponse.json({
      ok: true,
      yearsImported: years.length,
      results,
      assumptionsUsed: {
        avgCommissionPct: avgCommissionPct * 100,
        retentionPct: retentionPct * 100,
      },
      tier2Note:
        'GCI, gross margin, and broker commission are Tier 2 estimates calculated from your plan assumptions. ' +
        'They will appear with a dashed border and "est." badge in all charts.',
    });
  } catch (err: any) {
    console.error('[POST /api/admin/import-mls]', err);
    return jsonError(500, 'Internal Server Error');
  }
}

// ── GET — return all imported MLS years ──────────────────────────────────────

export async function GET(req: NextRequest) {
  const token = extractBearer(req);
  if (!token) return jsonError(401, 'Unauthorized');

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    const ok = await isAdminLike(decoded.uid);
    if (!ok) return jsonError(403, 'Forbidden');

    const snap = await adminDb
      .collection('mlsHistoricalData')
      .orderBy('year', 'desc')
      .get();

    const years = snap.docs.map(doc => {
      const d = doc.data();
      return {
        year: d.year,
        salesCount: d.annual?.salesCount ?? 0,
        salesVolume: d.annual?.salesVolume ?? 0,
        estimatedGCI: d.annual?.estimatedGCI ?? 0,
        estimatedGrossMargin: d.annual?.estimatedGrossMargin ?? 0,
        hasMonthly: Object.keys(d.monthly ?? {}).length > 0,
        importedAt: d.importedAt ?? null,
        assumptionsUsed: d.annual?.assumptionsUsed ?? null,
      };
    });

    return NextResponse.json({ ok: true, years });
  } catch (err: any) {
    console.error('[GET /api/admin/import-mls]', err);
    return jsonError(500, 'Internal Server Error');
  }
}
