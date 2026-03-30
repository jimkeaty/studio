// GET /api/broker/multi-year-compare
// Returns monthly gross margin, volume, and sales for all years with transaction data
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';

const ADMIN_UID = '1kJsXTU1JjZXMidmoIPXgXxizll1';

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

export interface YearMonthData {
  year: number;
  months: {
    month: number;
    label: string;
    grossMargin: number;
    volume: number;
    sales: number;
    gci: number;
  }[];
  totals: {
    grossMargin: number;
    volume: number;
    sales: number;
    gci: number;
  };
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

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

    // Fetch ALL closed transactions
    let query: FirebaseFirestore.Query = adminDb.collection('transactions')
      .where('status', '==', 'closed');

    if (teamId) {
      query = query.where('splitSnapshot.primaryTeamId', '==', teamId);
    }

    const snap = await query.get();

    // Group by year and month
    const yearMap = new Map<number, Map<number, { grossMargin: number; volume: number; sales: number; gci: number }>>();

    for (const doc of snap.docs) {
      const d = doc.data();
      const closedDate = toDate(d.closedDate);
      if (!closedDate) continue;

      const yr = closedDate.getFullYear();
      const mo = closedDate.getMonth() + 1; // 1-12

      if (!yearMap.has(yr)) {
        yearMap.set(yr, new Map());
      }
      const monthMap = yearMap.get(yr)!;
      if (!monthMap.has(mo)) {
        monthMap.set(mo, { grossMargin: 0, volume: 0, sales: 0, gci: 0 });
      }
      const bucket = monthMap.get(mo)!;

      const split = d.splitSnapshot || {};
      const gci = Number(split.grossCommission) || Number(d.commission) || 0;
      const agentNet = Number(split.agentNetCommission) || 0;
      const companyRetained = Number(split.companyRetained) || 0;
      const grossMargin = companyRetained > 0 ? companyRetained : Math.max(0, gci - agentNet);
      const dealValue = Number(d.dealValue) || Number(d.listPrice) || 0;

      bucket.grossMargin += grossMargin;
      bucket.volume += dealValue;
      bucket.sales += 1;
      bucket.gci += gci;
    }

    // Convert to sorted array
    const years: YearMonthData[] = [];
    const sortedYears = [...yearMap.keys()].sort((a, b) => a - b);

    for (const yr of sortedYears) {
      const monthMap = yearMap.get(yr)!;
      const months: YearMonthData['months'] = [];
      let totalGM = 0, totalVol = 0, totalSales = 0, totalGci = 0;

      for (let m = 1; m <= 12; m++) {
        const bucket = monthMap.get(m) || { grossMargin: 0, volume: 0, sales: 0, gci: 0 };
        months.push({
          month: m,
          label: MONTH_LABELS[m - 1],
          ...bucket,
        });
        totalGM += bucket.grossMargin;
        totalVol += bucket.volume;
        totalSales += bucket.sales;
        totalGci += bucket.gci;
      }

      years.push({
        year: yr,
        months,
        totals: { grossMargin: totalGM, volume: totalVol, sales: totalSales, gci: totalGci },
      });
    }

    return NextResponse.json({ ok: true, years });
  } catch (err: any) {
    console.error('[multi-year-compare]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
