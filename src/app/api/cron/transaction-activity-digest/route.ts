/**
 * POST /api/cron/transaction-activity-digest
 *
 * Sends one daily, routine Staff/TC checklist digest per agent. Only canonical
 * transactions/{id}/activityEvents documents are read. Immediate workflow
 * events (approval/rejection/status changes) keep their existing notifications.
 * The deployed scheduler must provide x-cron-secret; this endpoint itself never
 * sends an empty digest and only marks entries sent after Resend accepts email.
 */
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { getAgentUid } from '@/lib/notifications/getRecipientUids';
import { sendDailyTransactionActivityDigest } from '@/lib/notifications/sendNotification';
import { centralDateKey } from '@/lib/notifications/transactionActivity';

const CRON_SECRET = process.env.CRON_SECRET || '';

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

function isDateKey(value: string | null): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') || req.headers.get('authorization')?.replace('Bearer ', '');
  if (!CRON_SECRET || secret !== CRON_SECRET) return jsonError(401, 'Unauthorized');

  const requestedDate = new URL(req.url).searchParams.get('date');
  if (requestedDate && !isDateKey(requestedDate)) return jsonError(400, 'date must use YYYY-MM-DD');
  const digestDate = requestedDate || centralDateKey();
  const runId = `${digestDate}-${Date.now()}`;
  const results = { candidates: 0, groups: 0, sent: 0, suppressed: 0, deferred: 0, errors: 0 };

  try {
    const snap = await adminDb.collectionGroup('activityEvents').where('activityDate', '==', digestDate).get();
    const groups = new Map<string, { agentUid: string; events: FirebaseFirestore.QueryDocumentSnapshot[] }>();

    for (const eventDoc of snap.docs) {
      const event = eventDoc.data() as Record<string, any>;
      if (event.eventType !== 'routine_checklist_changed' || event.digestStatus !== 'pending') continue;
      results.candidates++;
      const agentUid = event.submittedByUid || await getAgentUid(adminDb, String(event.agentId || '')).catch(() => null);
      if (!agentUid) {
        results.deferred++;
        continue;
      }
      const key = `${event.tenantId || 'default'}:${agentUid}`;
      const group: { agentUid: string; events: FirebaseFirestore.QueryDocumentSnapshot[] } =
        groups.get(key) || { agentUid, events: [] };
      group.events.push(eventDoc);
      groups.set(key, group);
    }

    for (const group of groups.values()) {
      // Claim the records first. Concurrent scheduler retries cannot deliver an
      // already-claimed batch; a failed send is explicitly returned to pending.
      const claimed: FirebaseFirestore.QueryDocumentSnapshot[] = [];
      for (const eventDoc of group.events) {
        const claim = await adminDb.runTransaction(async (transaction) => {
          const latest = await transaction.get(eventDoc.ref);
          if (!latest.exists || latest.data()?.digestStatus !== 'pending') return false;
          transaction.update(eventDoc.ref, { digestStatus: 'processing', digestRunId: runId, digestClaimedAt: new Date().toISOString() });
          return true;
        });
        if (claim) claimed.push(eventDoc);
      }
      if (claimed.length === 0) continue;
      results.groups++;

      const byTransaction = new Map<string, { address: string; lines: string[] }>();
      for (const eventDoc of claimed) {
        const event = eventDoc.data() as Record<string, any>;
        const row = byTransaction.get(event.transactionId) || {
          address: String(event.propertyAddress || 'Transaction'), lines: [],
        };
        const state = event.checklist?.completed ? 'completed' : 'reopened/corrected';
        row.lines.push(`${event.checklist?.label || 'Checklist item'} — ${state}`);
        byTransaction.set(event.transactionId, row);
      }
      const body = Array.from(byTransaction.entries()).map(([transactionId, row]) =>
        `${row.address}\n${row.lines.map((line) => `• ${line}`).join('\n')}\nView: /dashboard/transactions/new?edit=${transactionId}`
      ).join('\n\n');
      if (!body.trim()) {
        const batch = adminDb.batch();
        claimed.forEach((eventDoc) => batch.update(eventDoc.ref, { digestStatus: 'pending', digestRunId: null }));
        await batch.commit();
        continue;
      }

      const delivery = await sendDailyTransactionActivityDigest(adminDb, {
        recipientUid: group.agentUid,
        title: 'Daily transaction activity',
        body,
        url: '/dashboard/transactions',
        data: { digestDate },
      });
      const batch = adminDb.batch();
      if (delivery.delivered) {
        claimed.forEach((eventDoc) => batch.update(eventDoc.ref, {
          digestStatus: 'sent', digestRunId: runId, digestSentAt: new Date().toISOString(), digestAttempts: (eventDoc.data().digestAttempts || 0) + 1,
        }));
        results.sent++;
      } else if (delivery.reason === 'preference_disabled' || delivery.reason === 'missing_email') {
        claimed.forEach((eventDoc) => batch.update(eventDoc.ref, {
          digestStatus: 'suppressed', digestRunId: runId, digestSuppressedReason: delivery.reason,
        }));
        results.suppressed++;
      } else {
        claimed.forEach((eventDoc) => batch.update(eventDoc.ref, {
          digestStatus: 'pending', digestRunId: null, digestLastFailure: delivery.reason || 'delivery_failed', digestAttempts: (eventDoc.data().digestAttempts || 0) + 1,
        }));
        results.deferred++;
      }
      await batch.commit();
    }
    return NextResponse.json({ ok: true, digestDate, results });
  } catch (error: any) {
    console.error('[transaction-activity-digest]', error);
    results.errors++;
    return NextResponse.json({ ok: false, error: error.message || 'Internal error', results }, { status: 500 });
  }
}
