/**
 * POST /api/cron/transaction-reminders
 *
 * Runs daily (recommended: 8 AM local time via Cloud Scheduler).
 * Handles three reminder types:
 *
 * 1. weekly_hug  — Sends agent a reminder to call their seller every 7 days
 *                  while the listing is active.
 * 2. commission_summary — Alerts TC/Staff 5 days before closing to prepare
 *                         and send the commission summary to the agent.
 * 3. buyer_checkin      — Sends agent a reminder to check in with buyers
 *                         3 days and 14 days after closing date.
 *
 * Secured by CRON_SECRET header.
 */
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { sendNotification } from '@/lib/notifications/sendNotification';

const CRON_SECRET = process.env.CRON_SECRET || '';

function jsonErr(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function diffDays(a: string, b: string): number {
  const da = new Date(a + 'T12:00:00').getTime();
  const db = new Date(b + 'T12:00:00').getTime();
  return Math.round((db - da) / 86400000);
}

export async function POST(req: NextRequest) {
  // Auth check
  const secret = req.headers.get('x-cron-secret') || req.headers.get('authorization')?.replace('Bearer ', '');
  if (!CRON_SECRET || secret !== CRON_SECRET) return jsonErr(401, 'Unauthorized');

  const today = todayStr();
  const results = { weeklyHug: 0, commissionSummary: 0, buyerCheckin: 0, errors: 0 };

  try {
    // ── 1. Weekly Hug Reminders ─────────────────────────────────────────────
    // Find all active listings where the agent has a task workflow
    const agentTasksSnap = await adminDb.collection('agentTasks').get();

    for (const taskDoc of agentTasksSnap.docs) {
      const taskData = taskDoc.data();
      if (!taskData.transactionId || !taskData.agentId) continue;

      // Find the weekly hug task
      const tasks: any[] = taskData.tasks || [];
      const hugTask = tasks.find((t: any) => t.id === 'weekly_hug_calls' && !t.completed);
      if (!hugTask) continue;

      // Check if listing is still active
      const txDoc = await adminDb.collection('transactions').doc(taskData.transactionId).get();
      if (!txDoc.exists) continue;
      const tx = txDoc.data()!;
      if (!['active', 'coming_soon', 'temp_off_market'].includes(tx.status || '')) continue;

      // Check if it's been 7 days since last hug reminder
      const lastHugDate: string | null = taskData.lastHugReminderDate || null;
      if (lastHugDate && diffDays(lastHugDate, today) < 7) continue;

      // Send reminder to agent
      try {
        await sendNotification(adminDb, {
          recipientUids: [taskData.agentId],
          type: 'agent_task_reminder',
          title: '📞 Weekly Seller Check-In',
          body: `Time for your weekly "hug call" with the sellers at ${tx.address || 'your listing'}. Keep them informed and engaged!`,
          data: { transactionId: taskData.transactionId, taskType: 'weekly_hug' },
        });

        // Update lastHugReminderDate
        await taskDoc.ref.update({ lastHugReminderDate: today });
        results.weeklyHug++;
      } catch (e) {
        console.error('weekly_hug error', e);
        results.errors++;
      }
    }

    // ── 2. Commission Summary Alert (5 days before closing) ────────────────
    // Find transactions closing in exactly 5 days
    const fiveDaysOut = addDays(today, 5);

    const closingSnap = await adminDb.collection('transactions')
      .where('closedDate', '==', fiveDaysOut)
      .get();

    for (const txDoc of closingSnap.docs) {
      const tx = txDoc.data();
      if (!tx.agentId) continue;

      // Check if we already sent this alert
      if (tx.commissionSummaryAlertSent) continue;

      const address = tx.address || tx.transactionAddress || 'your transaction';

      try {
        // Alert TC if working with TC
        if (tx.tcWorking && tx.tcId) {
          await sendNotification(adminDb, {
            recipientUids: [tx.tcId],
            type: 'commission_summary_prepare',
            title: '💰 Commission Summary Due in 5 Days',
            body: `Closing on ${fiveDaysOut} — please prepare and send the commission summary to ${tx.agentName || 'the agent'} for ${address}.`,
            data: { transactionId: txDoc.id, closingDate: fiveDaysOut },
          });
        }

        // Alert all staff
        const staffSnap = await adminDb.collection('users')
          .where('role', 'in', ['staff', 'admin'])
          .get();

        const staffUids = staffSnap.docs.map(d => d.id);
        if (staffUids.length > 0) {
          await sendNotification(adminDb, {
            recipientUids: staffUids,
            type: 'commission_summary_prepare',
            title: '💰 Commission Summary Due in 5 Days',
            body: `Closing on ${fiveDaysOut} — prepare and send commission summary to ${tx.agentName || 'the agent'} for ${address}.`,
            data: { transactionId: txDoc.id, closingDate: fiveDaysOut },
          });
        }

        // Mark alert as sent
        await txDoc.ref.update({ commissionSummaryAlertSent: true, commissionSummaryAlertDate: today });
        results.commissionSummary++;
      } catch (e) {
        console.error('commission_summary error', e);
        results.errors++;
      }
    }

    // ── 3. Buyer Check-In Reminders (3 days and 14 days after closing) ─────
    // Find buyer transactions that closed 3 or 14 days ago
    const threeDaysAgo = addDays(today, -3);
    const fourteenDaysAgo = addDays(today, -14);

    for (const daysAgo of [threeDaysAgo, fourteenDaysAgo]) {
      const closedSnap = await adminDb.collection('transactions')
        .where('closedDate', '==', daysAgo)
        .where('closingType', 'in', ['buyer', 'buyers_agent'])
        .get();

      for (const txDoc of closedSnap.docs) {
        const tx = txDoc.data();
        if (!tx.agentId) continue;

        const dayLabel = daysAgo === threeDaysAgo ? '3-day' : '14-day';
        const alreadySentKey = daysAgo === threeDaysAgo ? 'buyerCheckin3Sent' : 'buyerCheckin14Sent';
        if (tx[alreadySentKey]) continue;

        const address = tx.address || tx.transactionAddress || 'your buyer';
        const buyerName = tx.buyerFirstName ? `${tx.buyerFirstName} ${tx.buyerLastName || ''}`.trim() : 'your buyer';

        try {
          await sendNotification(adminDb, {
            recipientUids: [tx.agentId],
            type: 'agent_task_reminder',
            title: `🏠 ${dayLabel} Buyer Check-In`,
            body: `Time to check in with ${buyerName} at ${address}. How are they settling in? This touch keeps the relationship warm!`,
            data: { transactionId: txDoc.id, checkInType: dayLabel },
          });

          await txDoc.ref.update({ [alreadySentKey]: true });
          results.buyerCheckin++;
        } catch (e) {
          console.error('buyer_checkin error', e);
          results.errors++;
        }
      }
    }

    return NextResponse.json({ ok: true, today, results });
  } catch (err: any) {
    console.error('transaction-reminders cron error:', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
