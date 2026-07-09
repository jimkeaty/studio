/**
 * GET /api/admin/staff-queue/closings
 *
 * Returns all transactions with a closingDate falling on a weekday (Mon–Fri)
 * within the current week and the following week.
 *
 * Secured by Firebase Auth — admin/staff only.
 */
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { adminAuth } from '@/lib/firebase/admin';
import { isStaff } from '@/lib/auth/staffAccess';
import { format, startOfWeek, endOfWeek, addWeeks, parseISO, isWeekend } from 'date-fns';

function jsonErr(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function GET(req: NextRequest) {
  const token = (req.headers.get('Authorization') || '').replace('Bearer ', '').trim();
  if (!token) return jsonErr(401, 'Unauthorized');
  let uid: string;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return jsonErr(401, 'Unauthorized');
  }
  const staffOk = await isStaff(uid);
  if (!staffOk) return jsonErr(403, 'Forbidden');

  try {
    const now = new Date();
    // Get Mon of this week and Sun of next week
    const thisWeekStart = startOfWeek(now, { weekStartsOn: 1 }); // Monday
    const nextWeekEnd = endOfWeek(addWeeks(now, 1), { weekStartsOn: 1 }); // Sunday of next week

    const startStr = format(thisWeekStart, 'yyyy-MM-dd');
    const endStr = format(nextWeekEnd, 'yyyy-MM-dd');

    // Query transactions with closingDate in range
    const snap = await adminDb
      .collection('transactions')
      .where('closingDate', '>=', startStr)
      .where('closingDate', '<=', endStr)
      .get();

    type ClosingItem = {
      id: string;
      transactionId: string;
      address: string;
      agentId: string;
      agentName: string;
      closingDate: string;
      closingType: string | null;
      dealType: string | null;
      salePrice: number | null;
      gci: number | null;
      tcWorking: boolean;
      tcName: string | null;
      status: string;
      isWeekend: boolean;
    };

    const closings: ClosingItem[] = [];

    for (const doc of snap.docs) {
      const d = doc.data();
      const closingDate = d.closingDate as string;

      // Skip weekends
      let isWknd = false;
      try {
        isWknd = isWeekend(parseISO(closingDate));
      } catch { /* ignore parse errors */ }
      if (isWknd) continue;

      // Resolve agent name
      let agentName = d.agentName || d.submittedByName || '';
      if (!agentName && d.agentId) {
        try {
          const agentSnap = await adminDb.collection('users').doc(d.agentId).get();
          if (agentSnap.exists) {
            const a = agentSnap.data()!;
            agentName = `${a.firstName || ''} ${a.lastName || ''}`.trim() || a.email || '';
          }
        } catch { /* ignore */ }
      }

      // Resolve TC name if working with TC
      let tcName: string | null = null;
      if (d.workingWithTc || d.tcWorking) {
        try {
          const tcSnap = await adminDb.collection('users')
            .where('role', '==', 'tc')
            .limit(1)
            .get();
          if (!tcSnap.empty) {
            const tc = tcSnap.docs[0].data();
            tcName = `${tc.firstName || ''} ${tc.lastName || ''}`.trim() || tc.email || null;
          }
        } catch { /* ignore */ }
      }

      closings.push({
        id: doc.id,
        transactionId: doc.id,
        address: d.address || d.propertyAddress || 'Unknown Address',
        agentId: d.agentId || '',
        agentName,
        closingDate,
        closingType: d.closingType || d.transactionType || null,
        dealType: d.dealType || null,
        salePrice: d.salePrice ?? d.listPrice ?? null,
        gci: d.gci ?? null,
        tcWorking: !!(d.workingWithTc || d.tcWorking),
        tcName,
        status: d.status || 'active',
        isWeekend: isWknd,
      });
    }

    // Sort by closingDate ascending
    closings.sort((a, b) => a.closingDate.localeCompare(b.closingDate));

    return NextResponse.json({ ok: true, closings });
  } catch (err: any) {
    console.error('[staff-queue/closings] error:', err);
    return jsonErr(500, err.message || 'Internal server error');
  }
}
