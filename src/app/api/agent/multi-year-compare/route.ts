// GET /api/agent/multi-year-compare
// Returns monthly net income, volume, and sales for all years for the calling agent.
// Mirrors /api/broker/multi-year-compare but scoped to the authenticated agent (or team).
// ?view=personal|team  — team view available to team leaders only
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';

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
    gci?: number; // stripped from non-admin responses
    pendingVolume: number;
    pendingSales: number;
    pendingNetIncome: number;
    contractsWritten: number; // deals that went under contract (by contractDate)
  }[];
  totals: {
    netIncome: number;
    volume: number;
    sales: number;
    gci?: number; // stripped from non-admin responses
    pendingVolume: number;
    pendingSales: number;
    pendingNetIncome: number;
    contractsWritten: number;
  };
}

export async function GET(req: NextRequest) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 401 });

    const decoded = await adminAuth.verifyIdToken(token);
    const isAdminCaller = await isAdminLike(decoded.uid);
    const { searchParams } = new URL(req.url);
    const viewAs = searchParams.get('viewAs');
    const callerIsAdmin = await isAdminLike(decoded.uid);
    const uid = (viewAs && callerIsAdmin) ? viewAs : decoded.uid;
    const view = searchParams.get('view') || 'personal';

    // ── Determine which agent IDs to include ─────────────────────────────────
    let agentIds: string[] = [uid];

    if (view === 'team') {
      // Robust profile resolution: try agentId slug first, then firebaseUid
      let profileSnap = await adminDb.collection('agentProfiles')
        .where('agentId', '==', uid).limit(1).get();
      if (profileSnap.empty) {
        profileSnap = await adminDb.collection('agentProfiles')
          .where('firebaseUid', '==', uid).limit(1).get();
      }
      const profile = profileSnap.empty ? null : profileSnap.docs[0].data();

      if (profile?.teamRole === 'leader' && profile?.primaryTeamId) {
        const membersSnap = await adminDb.collection('agentProfiles')
          .where('primaryTeamId', '==', profile.primaryTeamId).get();
        const memberIds = membersSnap.docs
          .flatMap(d => {
            const pd = d.data();
            // Include both agentId slug and firebaseUid so transactions stored under either are found
            const ids: string[] = [];
            if (pd.agentId) ids.push(pd.agentId as string);
            if (pd.firebaseUid) ids.push(pd.firebaseUid as string);
            return ids;
          })
          .filter(Boolean);
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

    // Partial-month cap: when comparing across years, only count transactions
    // in the current calendar month if their day-of-month <= today's day.
    // This gives an apples-to-apples YTD comparison at any point during the month.
    const today = new Date();
    const currentMonth = today.getMonth() + 1; // 1-12
    const currentDayOfMonth = today.getDate(); // 1-31

    // ── Group by year → month ─────────────────────────────────────────────────
    const yearMap = new Map<number, Map<number, { netIncome: number; volume: number; sales: number; gci: number; pendingVolume: number; pendingSales: number; pendingNetIncome: number; contractsWritten: number }>>();

    // Also fetch pending/under_contract transactions for this agent/team
    const pendingPromises: Promise<FirebaseFirestore.QuerySnapshot>[] = [];
    for (let i = 0; i < agentIds.length; i += 30) {
      pendingPromises.push(
        adminDb.collection('transactions')
          .where('agentId', 'in', agentIds.slice(i, i + 30))
          .where('status', 'in', ['pending', 'under_contract'])
          .get()
      );
    }
    const pendingSnaps = await Promise.all(pendingPromises);
    const pendingDocs = pendingSnaps.flatMap(s => s.docs);

    for (const doc of docs) {
      const d = doc.data();
      const closedDate = toDate(d.closedDate);
      if (!closedDate) continue;

      const yr = closedDate.getFullYear();
      const mo = closedDate.getMonth() + 1; // 1-12

      // Partial-month cap: for any year, if the transaction falls in the same
      // calendar month as today, only include it if its day <= today's day.
      // This ensures June 2025 is only counted through June 3 when today is June 3.
      if (mo === currentMonth && closedDate.getDate() > currentDayOfMonth) continue;

      if (!yearMap.has(yr)) yearMap.set(yr, new Map());
      const monthMap = yearMap.get(yr)!;
      if (!monthMap.has(mo)) monthMap.set(mo, { netIncome: 0, volume: 0, sales: 0, gci: 0, pendingVolume: 0, pendingSales: 0, pendingNetIncome: 0, contractsWritten: 0 });
      const bucket = monthMap.get(mo)!;

      const split = d.splitSnapshot || {};
      const gci = Number(split.grossCommission) || Number(d.commission) || 0;
      const companyRetained = Number(split.companyRetained) || Number(d.brokerProfit) || 0;
      // agentNetCommission from snapshot is most accurate; fall back to gci - companyRetained
      const agentNet = Number(split.agentNetCommission) || Math.max(0, gci - companyRetained);
      const dealValue = (d.salePrice && Number(d.salePrice) > 0 ? Number(d.salePrice) : null) ?? (Number(d.dealValue) || 0);

      bucket.netIncome += agentNet;
      bucket.volume += dealValue;
      bucket.sales += 1;
      bucket.gci += gci;

      // Track contractsWritten — bucket by contractDate (when the deal went under contract)
      const contractDate = toDate(d.contractDate) || toDate(d.pendingDate);
      if (contractDate) {
        const cyr = contractDate.getFullYear();
        const cmo = contractDate.getMonth() + 1;
        if (!yearMap.has(cyr)) yearMap.set(cyr, new Map());
        const cMonthMap = yearMap.get(cyr)!;
        if (!cMonthMap.has(cmo)) cMonthMap.set(cmo, { netIncome: 0, volume: 0, sales: 0, gci: 0, pendingVolume: 0, pendingSales: 0, pendingNetIncome: 0, contractsWritten: 0 });
        cMonthMap.get(cmo)!.contractsWritten += 1;
      }
    }

    // Process pending transactions — bucket by projectedCloseDate (and also track contractsWritten by contractDate)
    for (const doc of pendingDocs) {
      const d = doc.data();
      const projectedDate = toDate(d.projectedCloseDate) || toDate(d.projectedClosingDate) || toDate(d.projectedClose);
      if (!projectedDate) continue; // skip if no projected date

      const yr = projectedDate.getFullYear();
      const mo = projectedDate.getMonth() + 1; // 1-12

      if (!yearMap.has(yr)) yearMap.set(yr, new Map());
      const monthMap = yearMap.get(yr)!;
      if (!monthMap.has(mo)) monthMap.set(mo, { netIncome: 0, volume: 0, sales: 0, gci: 0, pendingVolume: 0, pendingSales: 0, pendingNetIncome: 0, contractsWritten: 0 });
      const bucket = monthMap.get(mo)!;

      const dealValue = (d.salePrice && Number(d.salePrice) > 0 ? Number(d.salePrice) : null) ?? (Number(d.dealValue) || 0);
      const split = d.splitSnapshot || {};
      const gci = Number(split.grossCommission) || Number(d.commission) || 0;
      const companyRetained = Number(split.companyRetained) || Number(d.brokerProfit) || 0;
      const agentNet = Number(split.agentNetCommission) || Math.max(0, gci - companyRetained);
      const isDual = String(d.closingType || '').toLowerCase() === 'dual';
      const sideCount = isDual ? 2 : 1;

      bucket.pendingVolume += dealValue;
      bucket.pendingSales += sideCount;
      bucket.pendingNetIncome += agentNet;

      // Track contractsWritten for pending deals — bucket by contractDate
      const pendingContractDate = toDate(d.contractDate) || toDate(d.pendingDate);
      if (pendingContractDate) {
        const cyr = pendingContractDate.getFullYear();
        const cmo = pendingContractDate.getMonth() + 1;
        if (!yearMap.has(cyr)) yearMap.set(cyr, new Map());
        const cMonthMap = yearMap.get(cyr)!;
        if (!cMonthMap.has(cmo)) cMonthMap.set(cmo, { netIncome: 0, volume: 0, sales: 0, gci: 0, pendingVolume: 0, pendingSales: 0, pendingNetIncome: 0, contractsWritten: 0 });
        cMonthMap.get(cmo)!.contractsWritten += 1;
      }
    }

    // ── Build sorted year array ───────────────────────────────────────────────
    const years: AgentYearMonthData[] = [];
    for (const yr of [...yearMap.keys()].sort((a, b) => a - b)) {
      const monthMap = yearMap.get(yr)!;
      const months: AgentYearMonthData['months'] = [];
      let totalNet = 0, totalVol = 0, totalSales = 0, totalGci = 0;
      let totalPendingVol = 0, totalPendingSales = 0, totalPendingNet = 0, totalContractsWritten = 0;

      for (let m = 1; m <= 12; m++) {
        const bucket = monthMap.get(m) || { netIncome: 0, volume: 0, sales: 0, gci: 0, pendingVolume: 0, pendingSales: 0, pendingNetIncome: 0, contractsWritten: 0 };
        months.push({
          month: m,
          label: MONTH_LABELS[m - 1],
          netIncome: bucket.netIncome,
          volume: bucket.volume,
          sales: bucket.sales,
          gci: bucket.gci,
          pendingVolume: bucket.pendingVolume,
          pendingSales: bucket.pendingSales,
          pendingNetIncome: bucket.pendingNetIncome,
          contractsWritten: (bucket as any).contractsWritten ?? 0,
        });
        totalNet += bucket.netIncome;
        totalVol += bucket.volume;
        totalSales += bucket.sales;
        totalGci += bucket.gci;
        totalPendingVol += bucket.pendingVolume;
        totalPendingSales += bucket.pendingSales;
        totalPendingNet += bucket.pendingNetIncome;
        totalContractsWritten += (bucket as any).contractsWritten ?? 0;
      }

      // Strip GCI (gross commission income) from non-admin responses
      years.push({
        year: yr,
        months: months.map(m => isAdminCaller ? m : {
          month: m.month, label: m.label, netIncome: m.netIncome, volume: m.volume, sales: m.sales,
          pendingVolume: m.pendingVolume, pendingSales: m.pendingSales, pendingNetIncome: m.pendingNetIncome,
          contractsWritten: m.contractsWritten,
        }),
        totals: isAdminCaller
          ? { netIncome: totalNet, volume: totalVol, sales: totalSales, gci: totalGci, pendingVolume: totalPendingVol, pendingSales: totalPendingSales, pendingNetIncome: totalPendingNet, contractsWritten: totalContractsWritten }
          : { netIncome: totalNet, volume: totalVol, sales: totalSales, pendingVolume: totalPendingVol, pendingSales: totalPendingSales, pendingNetIncome: totalPendingNet, contractsWritten: totalContractsWritten },
      });
    }

    return NextResponse.json({ ok: true, years });
  } catch (err: any) {
    console.error('[agent/multi-year-compare]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
