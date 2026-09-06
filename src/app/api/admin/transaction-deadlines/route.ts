import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';

const fields = [
  ['inspectionDeadline', 'Inspection / Due Diligence'], ['dueDiligenceDeadline', 'Due Diligence'], ['depositDeadline', 'Deposit / Earnest Money'], ['loanApplicationDeadline', 'Loan Application'], ['financingDeadline', 'Financing / Application'], ['financingCommitmentDeadline', 'Financing Commitment'], ['finalLoanCommitmentDeadline', 'Final Loan Commitment'], ['appraisalDeadline', 'Appraisal'], ['projectedCloseDate', 'Closing / Act of Sale'], ['closedDate', 'Closing / Act of Sale'], ['occupancyDate', 'Occupancy / Possession'],
] as const;
const iso = (date: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(date);
const inactive = new Set(['closed', 'cancelled', 'canceled', 'withdrawn', 'archived', 'dead']);
export async function GET(req: NextRequest) {
  const header = req.headers.get('authorization') || ''; if (!header.startsWith('Bearer ')) return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
  try {
    const decoded = await adminAuth.verifyIdToken(header.slice(7)); if (!(await isAdminLike(decoded.uid))) return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    const today = iso(new Date()); const tomorrowDate = new Date(); tomorrowDate.setDate(tomorrowDate.getDate() + 1); const tomorrow = iso(tomorrowDate);
    const snapshot = await adminDb.collection('transactions').limit(1500).get();
    const buckets: Record<'dueToday' | 'dueTomorrow' | 'overdue', any[]> = { dueToday: [], dueTomorrow: [], overdue: [] };
    snapshot.docs.forEach((doc) => { const tx = doc.data() as Record<string, any>; if (inactive.has(String(tx.status || '').toLowerCase())) return; fields.forEach(([field, label]) => { const date = String(tx[field] || ''); if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return; const item = { transactionId: doc.id, address: tx.address || tx.transactionAddress || 'Address unavailable', status: tx.status || 'Unknown', deadlineField: field, deadlineType: label, date, agentName: tx.agentName || null, tcId: tx.tcId || null }; if (date === today) buckets.dueToday.push(item); else if (date === tomorrow) buckets.dueTomorrow.push(item); else if (date < today) buckets.overdue.push(item); }); });
    return NextResponse.json({ ok: true, today, tomorrow, ...buckets });
  } catch (error: any) { return NextResponse.json({ ok: false, error: error.message || 'Unable to load transaction deadlines.' }, { status: 500 }); }
}
