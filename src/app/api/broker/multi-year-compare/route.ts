// GET /api/broker/multi-year-compare
// Returns monthly gross margin, volume, sales, and contracts written for all years with transaction data
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';


function getBearerToken(req: NextRequest) {
  const h = req.headers.get('authorization') || '';
  if (!h.startsWith('Bearer ')) return null;
  return h.slice(7).trim();
}

function toDate(value: any): Date | null {
  if (!value) return null;
  if (typeof value?.toDate === 'function') return value.toDate();
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

type MonthBucket = {
  grossMargin: number;
  volume: number;
  sales: number;
  gci: number;
  pendingVolume: number;
  pendingSales: number;
  pendingGci: number;
  contractsWritten: number;  // deals that went under contract this month (by contractDate)
};

export interface YearMonthData {
  year: number;
  months: ({
    month: number;
    label: string;
  } & MonthBucket)[];
  totals: MonthBucket;
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function emptyBucket(): MonthBucket {
  return { grossMargin: 0, volume: 0, sales: 0, gci: 0, pendingVolume: 0, pendingSales: 0, pendingGci: 0, contractsWritten: 0 };
}

export async function GET(req: NextRequest) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 401 });

    const decoded = await adminAuth.verifyIdToken(token);
    if (!(await isAdminLike(decoded.uid))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const teamId = searchParams.get('teamId') || null;

    // Fetch ALL transactions (any status) — we need closed for revenue metrics
    // and contractDate for contractsWritten metric
    let allTxQuery: FirebaseFirestore.Query = adminDb.collection('transactions');
    if (teamId) {
      allTxQuery = adminDb.collection('transactions')
        .where('splitSnapshot.primaryTeamId', '==', teamId);
    }

    // Also fetch pending/under_contract transactions for the pending overlay
    let pendingQuery: FirebaseFirestore.Query = adminDb.collection('transactions')
      .where('status', 'in', ['pending', 'under_contract']);
    if (teamId) {
      pendingQuery = adminDb.collection('transactions')
        .where('splitSnapshot.primaryTeamId', '==', teamId)
        .where('status', 'in', ['pending', 'under_contract']);
    }

    const [allTxSnap, pendingSnap, demoSnap] = await Promise.all([
      allTxQuery.get(),
      pendingQuery.get(),
      adminDb.collection('agentProfiles').where('isDemoAccount', '==', true).get(),
    ]);

    // ── Filter out demo account transactions ─────────────────────────────
    const demoAgentIds = new Set(demoSnap.docs.map(d => String(d.data().agentId || d.id)));

    // Partial-month cap: when comparing across years, only count transactions
    // in the current calendar month if their day-of-month <= today's day.
    // This gives an apples-to-apples YTD comparison at any point during the month.
    const today = new Date();
    const currentMonth = today.getMonth() + 1; // 1-12
    const currentDayOfMonth = today.getDate(); // 1-31

    // Group by year and month
    const yearMap = new Map<number, Map<number, MonthBucket>>();

    const getOrCreate = (yr: number, mo: number): MonthBucket => {
      if (!yearMap.has(yr)) yearMap.set(yr, new Map());
      const monthMap = yearMap.get(yr)!;
      if (!monthMap.has(mo)) monthMap.set(mo, emptyBucket());
      return monthMap.get(mo)!;
    };

    // Process ALL transactions for closed metrics and contractsWritten
    for (const doc of allTxSnap.docs) {
      const d = doc.data();
      if (demoAgentIds.size > 0 && demoAgentIds.has(String(d.agentId || ''))) continue;

      const isDual = String(d.closingType || '').toLowerCase() === 'dual';
      const sideCount = isDual ? 2 : 1;
      const isPassThrough = String(d.dealSource || '').toLowerCase() === 'pass_through';
      const dealValue = (d.salePrice && Number(d.salePrice) > 0 ? Number(d.salePrice) : null) ?? (Number(d.listPrice) || 0);

      // ── contractsWritten: bucket by contractDate (any status) ──────────
      // Apply partial-month cap: if contractDate falls in the current calendar month,
      // only count it if its day-of-month <= today's day (apples-to-apples YTD comparison).
      const contractDate = toDate(d.contractDate);
      if (contractDate) {
        const cyr = contractDate.getFullYear();
        const cmo = contractDate.getMonth() + 1;
        if (!(cmo === currentMonth && contractDate.getDate() > currentDayOfMonth)) {
          const cb = getOrCreate(cyr, cmo);
          cb.contractsWritten += sideCount;
        }
      }

      // ── Closed metrics: bucket by closedDate ───────────────────────────
      if (d.status !== 'closed') continue;
      const closedDate = toDate(d.closedDate);
      if (!closedDate) continue;

      const yr = closedDate.getFullYear();
      const mo = closedDate.getMonth() + 1; // 1-12

      // Partial-month cap
      if (mo === currentMonth && closedDate.getDate() > currentDayOfMonth) continue;

      const bucket = getOrCreate(yr, mo);

      const split = d.splitSnapshot || {};
      const gci = Number(split.grossCommission) || Number(d.commission) || 0;
      const agentNet = Number(split.agentNetCommission) || 0;
      const companyRetained = Number(split.companyRetained) || 0;
      const grossMargin = companyRetained > 0 ? companyRetained : Math.max(0, gci - agentNet);

      if (!isPassThrough) bucket.grossMargin += grossMargin;
      bucket.volume += dealValue;
      bucket.sales += sideCount;
      if (!isPassThrough) bucket.gci += gci;
    }

    // Process pending transactions — bucket by projectedCloseDate
    for (const doc of pendingSnap.docs) {
      const d = doc.data();
      if (demoAgentIds.size > 0 && demoAgentIds.has(String(d.agentId || ''))) continue;
      const projectedDate = toDate(d.projectedCloseDate) || toDate(d.projectedClosingDate) || toDate(d.projectedClose);
      if (!projectedDate) continue; // skip if no projected date

      const yr = projectedDate.getFullYear();
      const mo = projectedDate.getMonth() + 1; // 1-12

      const bucket = getOrCreate(yr, mo);

      const dealValue = (d.salePrice && Number(d.salePrice) > 0 ? Number(d.salePrice) : null) ?? (Number(d.listPrice) || 0);
      const split = d.splitSnapshot || {};
      const gci = Number(split.grossCommission) || Number(d.commission) || 0;
      const isDual = String(d.closingType || '').toLowerCase() === 'dual';
      const sideCount = isDual ? 2 : 1;

      bucket.pendingVolume += dealValue;
      bucket.pendingSales += sideCount;
      bucket.pendingGci += gci;
    }

    // Convert to sorted array
    const years: YearMonthData[] = [];
    const sortedYears = [...yearMap.keys()].sort((a, b) => a - b);

    for (const yr of sortedYears) {
      const monthMap = yearMap.get(yr)!;
      const months: YearMonthData['months'] = [];
      const totals = emptyBucket();

      for (let m = 1; m <= 12; m++) {
        const bucket = monthMap.get(m) ?? emptyBucket();
        months.push({
          month: m,
          label: MONTH_LABELS[m - 1],
          ...bucket,
        });
        totals.grossMargin += bucket.grossMargin;
        totals.volume += bucket.volume;
        totals.sales += bucket.sales;
        totals.gci += bucket.gci;
        totals.pendingVolume += bucket.pendingVolume;
        totals.pendingSales += bucket.pendingSales;
        totals.pendingGci += bucket.pendingGci;
        totals.contractsWritten += bucket.contractsWritten;
      }

      years.push({ year: yr, months, totals });
    }

    return NextResponse.json({ ok: true, years });
  } catch (err: any) {
    console.error('[multi-year-compare]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
