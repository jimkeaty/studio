// GET /api/broker/kpi-actuals?year=2026
// Aggregates daily_activity across all agents for the given year and returns
// YTD totals for: calls, engagements, appointmentsSet, appointmentsHeld,
// contractsWritten, closings.
// Also returns recruiting actuals from recruitingTracking collection.
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';

function jsonError(s: number, e: string) {
  return NextResponse.json({ ok: false, error: e }, { status: s });
}

async function requireAdmin(req: NextRequest) {
  const h = req.headers.get('Authorization');
  if (!h?.startsWith('Bearer ')) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(h.slice(7));
    if (!(await isAdminLike(decoded.uid))) return null;
    return decoded;
  } catch { return null; }
}

export async function GET(req: NextRequest) {
  const decoded = await requireAdmin(req);
  if (!decoded) return jsonError(401, 'Unauthorized');
  try {
    const { searchParams } = new URL(req.url);
    const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()), 10);
    const today = new Date();
    const isCurrentYear = year === today.getFullYear();

    // Build date range: Jan 1 – today (or Dec 31 for past years)
    const startDate = `${year}-01-01`;
    const endDate = isCurrentYear
      ? today.toISOString().slice(0, 10)
      : `${year}-12-31`;

    // Load demo agent IDs to exclude from aggregation
    const demoSnap = await adminDb.collection('agentProfiles')
      .where('isDemoAccount', '==', true)
      .get();
    const demoIds = new Set<string>();
    demoSnap.docs.forEach(d => {
      const aid = d.data().agentId || d.id;
      if (aid) demoIds.add(String(aid));
    });

    // Query all daily_activity docs for the year
    const snap = await adminDb.collection('daily_activity')
      .where('date', '>=', startDate)
      .where('date', '<=', endDate)
      .get();

    let callsActual = 0;
    let engagementsActual = 0;
    let appointmentsSetActual = 0;
    let appointmentsHeldActual = 0;
    let contractsWrittenActual = 0;
    // closings come from transactions, not daily_activity

    snap.docs.forEach(d => {
      const a = d.data();
      if (a.agentId && demoIds.has(String(a.agentId))) return;
      callsActual += Number(a.callsCount ?? 0);
      engagementsActual += Number(a.engagementsCount ?? 0);
      appointmentsSetActual += Number(a.appointmentsSetCount ?? 0);
      appointmentsHeldActual += Number(a.appointmentsHeldCount ?? 0);
      contractsWrittenActual += Number(a.contractsWrittenCount ?? 0);
    });

    // Closings = count of closed transactions for the year (excluding demo agents)
    const txSnap = await adminDb.collection('transactions')
      .where('year', '==', year)
      .where('status', '==', 'closed')
      .get();
    let closingsActual = 0;
    txSnap.docs.forEach(d => {
      const t = d.data();
      if (t.agentId && demoIds.has(String(t.agentId))) return;
      closingsActual++;
    });

    // Recruiting actuals from recruitingTracking (YTD sum)
    const currentMonth = isCurrentYear ? today.getMonth() + 1 : 12;
    const recruitingSnap = await adminDb.collection('recruitingTracking')
      .where('year', '==', year)
      .where('month', '<=', currentMonth)
      .get();

    let recruitingCallsActual = 0;
    let recruitingApptSetActual = 0;
    let recruitingApptHeldActual = 0;
    let recruitingClosingsActual = 0; // new hires = closings in recruiting
    let agentCountActual = 0;

    recruitingSnap.docs.forEach(d => {
      const data = d.data();
      recruitingCallsActual += Number(data.prospectCalls ?? 0);
      recruitingApptSetActual += Number(data.interviewsSet ?? 0);
      recruitingApptHeldActual += Number(data.interviewsHeld ?? 0);
      recruitingClosingsActual += Number(data.newHires ?? 0);
    });

    // Current agent count from the latest recruiting tracking month
    const latestRecruitingSnap = await adminDb.collection('recruitingTracking')
      .where('year', '==', year)
      .orderBy('month', 'desc')
      .limit(1)
      .get();
    if (!latestRecruitingSnap.empty) {
      agentCountActual = Number(latestRecruitingSnap.docs[0].data().activeAgents ?? 0);
    }

    // Days elapsed for YTD pace calculation
    const startOfYear = new Date(year, 0, 1);
    const daysElapsed = isCurrentYear
      ? Math.floor((today.getTime() - startOfYear.getTime()) / 86400000) + 1
      : 365;
    const daysInYear = ((year % 4 === 0 && year % 100 !== 0) || year % 400 === 0) ? 366 : 365;
    const ytdFraction = daysElapsed / daysInYear;

    return NextResponse.json({
      ok: true,
      year,
      ytdFraction,
      daysElapsed,
      daysInYear,
      actuals: {
        calls: callsActual,
        engagements: engagementsActual,
        appointmentsSet: appointmentsSetActual,
        appointmentsHeld: appointmentsHeldActual,
        contractsWritten: contractsWrittenActual,
        closings: closingsActual,
        agentCount: agentCountActual,
        recruitingCalls: recruitingCallsActual,
        recruitingApptSet: recruitingApptSetActual,
        recruitingApptHeld: recruitingApptHeldActual,
        recruitingClosings: recruitingClosingsActual,
      },
    });
  } catch (err: any) {
    console.error('[broker/kpi-actuals]', err);
    return jsonError(500, err?.message || 'Internal Server Error');
  }
}
