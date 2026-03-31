// GET /api/agent/activity-history
// Returns activity tracking records for the calling agent, rolled up by period.
// ?period=daily|weekly|monthly  (default: monthly)
// ?year=2026                    (default: current year)
// ?agentId=xxx                  (admin-only viewAs override)
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';
import type { ActivityRecord, ActivityRollupBucket, ActivityRollupPeriod } from '@/lib/types/activityTracking';
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function getBearerToken(req: NextRequest): string | null {
  const h = req.headers.get('authorization') || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : null;
}

function emptyBucket(): Omit<ActivityRollupBucket, 'label' | 'date'> {
  return {
    hours: 0, calls: 0, spokeTo: 0,
    listingApptsSet: 0, listingApptsHeld: 0, listingContractsSigned: 0,
    buyerApptsSet: 0, buyerApptsHeld: 0, buyerContractsSigned: 0,
  };
}

function addRecord(
  bucket: Omit<ActivityRollupBucket, 'label' | 'date'>,
  r: ActivityRecord,
) {
  bucket.hours += r.hours;
  bucket.calls += r.calls;
  bucket.spokeTo += r.spokeTo;
  bucket.listingApptsSet += r.listingApptsSet;
  bucket.listingApptsHeld += r.listingApptsHeld;
  bucket.listingContractsSigned += r.listingContractsSigned;
  bucket.buyerApptsSet += r.buyerApptsSet;
  bucket.buyerApptsHeld += r.buyerApptsHeld;
  bucket.buyerContractsSigned += r.buyerContractsSigned;
}

export async function GET(req: NextRequest) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const decoded = await adminAuth.verifyIdToken(token);
    const { searchParams } = new URL(req.url);

    // Admin can view any agent
    const viewAsParam = searchParams.get('agentId');
    const callerIsAdmin = await isAdminLike(decoded.uid);
    const uid = (viewAsParam && callerIsAdmin) ? viewAsParam : decoded.uid;

    const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()), 10);
    const period = (searchParams.get('period') || 'monthly') as ActivityRollupPeriod;

    // ── Fetch records for this agent & year ───────────────────────────────────
    const snap = await adminDb.collection('activityTracking')
      .where('agentId', '==', uid)
      .where('year', '==', year)
      .orderBy('activityDate', 'asc')
      .get();

    const records = snap.docs.map(d => ({ id: d.id, ...d.data() } as ActivityRecord));

    // Also fetch available years (distinct years with data)
    const allYearsSnap = await adminDb.collection('activityTracking')
      .where('agentId', '==', uid)
      .select('year')
      .get();
    const availableYears = [...new Set(allYearsSnap.docs.map(d => d.data().year as number))].sort((a, b) => b - a);

    // ── Build rollup buckets ──────────────────────────────────────────────────
    let buckets: ActivityRollupBucket[];

    if (period === 'monthly') {
      // 12 buckets: Jan–Dec
      const monthMap = new Map<number, Omit<ActivityRollupBucket, 'label' | 'date'>>();
      for (let m = 1; m <= 12; m++) monthMap.set(m, emptyBucket());

      for (const r of records) {
        const bucket = monthMap.get(r.month);
        if (bucket) addRecord(bucket, r);
      }

      buckets = Array.from(monthMap.entries()).map(([m, b]) => ({
        label: MONTH_LABELS[m - 1],
        date: `${year}-${String(m).padStart(2, '0')}-01`,
        ...b,
      }));
    } else if (period === 'weekly') {
      // Dynamic buckets by ISO week
      const weekMap = new Map<string, { week: number; date: string; data: Omit<ActivityRollupBucket, 'label' | 'date'> }>();

      for (const r of records) {
        const key = `${r.year}-W${String(r.week).padStart(2, '0')}`;
        if (!weekMap.has(key)) {
          weekMap.set(key, { week: r.week, date: r.activityDate, data: emptyBucket() });
        }
        addRecord(weekMap.get(key)!.data, r);
      }

      buckets = [...weekMap.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([, v]) => ({
          label: `Wk ${v.week}`,
          date: v.date,
          ...v.data,
        }));
    } else {
      // Daily — each distinct activityDate is a bucket
      const dayMap = new Map<string, Omit<ActivityRollupBucket, 'label' | 'date'>>();

      for (const r of records) {
        if (!dayMap.has(r.activityDate)) dayMap.set(r.activityDate, emptyBucket());
        addRecord(dayMap.get(r.activityDate)!, r);
      }

      buckets = [...dayMap.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, b]) => {
          const d = new Date(date + 'T00:00:00');
          const label = `${MONTH_LABELS[d.getMonth()]} ${d.getDate()}`;
          return { label, date, ...b };
        });
    }

    // ── Totals ────────────────────────────────────────────────────────────────
    const totals = emptyBucket();
    for (const r of records) addRecord(totals, r);

    return NextResponse.json({
      ok: true,
      agentId: uid,
      year,
      period,
      buckets,
      totals,
      recordCount: records.length,
      availableYears,
    });
  } catch (err: any) {
    console.error('[agent/activity-history]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
