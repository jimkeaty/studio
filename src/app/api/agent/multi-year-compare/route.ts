// GET /api/agent/multi-year-compare
// Returns monthly net income, volume, and sales for all years for the calling agent.
// Mirrors /api/broker/multi-year-compare but scoped to the authenticated agent (or team).
// ?view=personal|team  — team view available to team leaders only
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function getBearerToken(req: NextRequest): string | null {
  const h = req.headers.get('authorization') || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : null;
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

export interface AgentYearMonthData {
  year: number;
  months: {
    month: number;
    label: string;
    netIncome: number; // agent take-home after broker split
    volume: number;
    sales: number;
    gci: number;
  }[];
  totals: {
    netIncome: number;
    volume: number;
    sales: number;
    gci: number;
  };
}

export async function GET(req: NextRequest) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 401 });

    const decoded = await adminAuth.verifyIdToken(token);
    const uid = decoded.uid;

    const { searchParams } = new URL(req.url);
    const view = searchParams.get('view') || 'personal';

    // ── Determine which agent IDs to include ─────────────────────────────────
    let agentIds: string[] = [uid];

    if (view === 'team') {
      const profileSnap = await adminDb.collection('agentProfiles')
        .where('agentId', '==', uid).limit(1).get();
      const profile = profileSnap.empty ? null : profileSnap.docs[0].data();

      if (profile?.teamRole === 'leader' && profile?.primaryTeamId) {
        const membersSnap = await adminDb.collection('agentProfiles')
          .where('primaryTeamId', '==', profile.primaryTeamId).get();
        const memberIds = membersSnap.docs.map(d => d.data().agentId as string).filter(Boolean);
        agentIds = [...new Set([uid, ...memberIds])];
      }
    }

    // ── Fetch all closed transactions for these agents ────────────────────────
    // Batch IN queries at 30 (Firestore limit)
    const snapPromises: Promise<FirebaseFirestore.QuerySnapshot>[] = [];
    for (let i = 0; i < agentIds.length; i += 30) {
      snapPromises.push(
        adminDb.collection('transactions')
          .where('agentId', 'in', agentIds.slice(i, i + 30))
          .where('status', '==', 'closed')
          .get()
      );
    }
    const snaps = await Promise.all(snapPromises);
    const docs = snaps.flatMap(s => s.docs);

    // ── Group by year → month ─────────────────────────────────────────────────
    const yearMap = new Map<number, Map<number, { netIncome: number; volume: number; sales: number; gci: number }>>();

    for (const doc of docs) {
      const d = doc.data();
      const closedDate = toDate(d.closedDate);
      if (!closedDate) continue;

      const yr = closedDate.getFullYear();
      const mo = closedDate.getMonth() + 1; // 1-12

      if (!yearMap.has(yr)) yearMap.set(yr, new Map());
      const monthMap = yearMap.get(yr)!;
      if (!monthMap.has(mo)) monthMap.set(mo, { netIncome: 0, volume: 0, sales: 0, gci: 0 });
      const bucket = monthMap.get(mo)!;

      const split = d.splitSnapshot || {};
      const gci = Number(split.grossCommission) || Number(d.commission) || 0;
      const companyRetained = Number(split.companyRetained) || Number(d.brokerProfit) || 0;
      // agentNetCommission from snapshot is most accurate; fall back to gci - companyRetained
      const agentNet = Number(split.agentNetCommission) || Math.max(0, gci - companyRetained);
      const dealValue = Number(d.dealValue) || 0;

      bucket.netIncome += agentNet;
      bucket.volume += dealValue;
      bucket.sales += 1;
      bucket.gci += gci;
    }

    // ── Build sorted year array ───────────────────────────────────────────────
    const years: AgentYearMonthData[] = [];
    for (const yr of [...yearMap.keys()].sort((a, b) => a - b)) {
      const monthMap = yearMap.get(yr)!;
      const months: AgentYearMonthData['months'] = [];
      let totalNet = 0, totalVol = 0, totalSales = 0, totalGci = 0;

      for (let m = 1; m <= 12; m++) {
        const bucket = monthMap.get(m) || { netIncome: 0, volume: 0, sales: 0, gci: 0 };
        months.push({ month: m, label: MONTH_LABELS[m - 1], ...bucket });
        totalNet += bucket.netIncome;
        totalVol += bucket.volume;
        totalSales += bucket.sales;
        totalGci += bucket.gci;
      }

      years.push({
        year: yr,
        months,
        totals: { netIncome: totalNet, volume: totalVol, sales: totalSales, gci: totalGci },
      });
    }

    return NextResponse.json({ ok: true, years });
  } catch (err: any) {
    console.error('[agent/multi-year-compare]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
