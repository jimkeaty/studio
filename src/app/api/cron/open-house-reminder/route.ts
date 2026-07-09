/**
 * POST /api/cron/open-house-reminder
 *
 * Modes (pass ?mode=...):
 *
 *  deadline (default — Thursday 8 AM):
 *    Sends in-app + rich HTML email to ALL active agents reminding them of the
 *    Thursday deadline. Lists open houses already submitted for the coming weekend.
 *
 *  staff_deadline (Friday 9 AM):
 *    Sends in-app + email to ALL staff reminding them the email blast is due.
 *
 * Secured by CRON_SECRET header.
 * Settings are read from Firestore `openHouseSettings/default`.
 */
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { sendNotification } from '@/lib/notifications/sendNotification';
import { format, parseISO } from 'date-fns';

const CRON_SECRET = process.env.CRON_SECRET || '';

function jsonErr(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */

/** Returns the ISO date strings for the coming Saturday and Sunday */
function getComingWeekend(): { saturday: string; sunday: string } {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon … 6=Sat
  const daysUntilSat = (6 - dayOfWeek + 7) % 7 || 7;
  const sat = new Date(now);
  sat.setDate(now.getDate() + daysUntilSat);
  const sun = new Date(sat);
  sun.setDate(sat.getDate() + 1);
  return {
    saturday: sat.toISOString().split('T')[0],
    sunday: sun.toISOString().split('T')[0],
  };
}

/** Formats a time string like "1:00 PM" */
function fmtTime(t?: string): string {
  if (!t) return '';
  if (t.includes('AM') || t.includes('PM')) return t;
  try {
    const [h, m] = t.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
  } catch { return t; }
}

/* ── Rich HTML email builder ─────────────────────────────────────────────── */

interface OHItem {
  agentName: string;
  propertyAddress?: string;
  mlsNumber?: string;
  startTime?: string;
  endTime?: string;
  status: string;
}

function buildReminderEmail(
  appName: string,
  appUrl: string,
  recipientName: string,
  deadline: string,
  satItems: OHItem[],
  sunItems: OHItem[],
): string {
  const submitUrl = `${appUrl}/dashboard/open-house`;

  const renderRow = (item: OHItem) => {
    const addr = item.propertyAddress || (item.mlsNumber ? `MLS# ${item.mlsNumber}` : 'Address TBD');
    const time = item.startTime ? `${fmtTime(item.startTime)}–${fmtTime(item.endTime)}` : '';
    const badge = item.status === 'email_sent'
      ? `<span style="font-size:10px;background:#dcfce7;color:#166534;padding:1px 7px;border-radius:999px;font-weight:600;margin-left:6px;">Confirmed</span>`
      : `<span style="font-size:10px;background:#fef9c3;color:#854d0e;padding:1px 7px;border-radius:999px;font-weight:600;margin-left:6px;">Pending</span>`;
    return `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;">
          <span style="font-weight:600;color:#111827;">${item.agentName}</span>${badge}<br>
          <span style="color:#374151;font-size:14px;">${addr}</span>
          ${time ? `<span style="color:#6b7280;font-size:13px;"> &nbsp;·&nbsp; ${time}</span>` : ''}
        </td>
      </tr>`;
  };

  const satSection = satItems.length > 0 ? `
    <p style="margin:20px 0 8px;font-size:15px;font-weight:700;color:#1e40af;">📅 Saturday</p>
    <table width="100%" cellpadding="0" cellspacing="0">${satItems.map(renderRow).join('')}</table>` : '';

  const sunSection = sunItems.length > 0 ? `
    <p style="margin:20px 0 8px;font-size:15px;font-weight:700;color:#1e40af;">📅 Sunday</p>
    <table width="100%" cellpadding="0" cellspacing="0">${sunItems.map(renderRow).join('')}</table>` : '';

  const noSubmissionsYet = satItems.length === 0 && sunItems.length === 0
    ? `<p style="color:#6b7280;font-size:14px;font-style:italic;">No open houses have been submitted yet for this weekend — be the first!</p>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:580px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1);">

        <!-- Header -->
        <tr><td style="background:#1e40af;padding:28px 32px;">
          <p style="margin:0;color:#ffffff;font-size:20px;font-weight:800;letter-spacing:-.3px;">${appName}</p>
          <p style="margin:6px 0 0;color:#bfdbfe;font-size:13px;">Open House Submission Reminder</p>
        </td></tr>

        <!-- Hero banner -->
        <tr><td style="background:#dbeafe;padding:20px 32px;border-bottom:2px solid #1e40af;">
          <p style="margin:0;font-size:22px;font-weight:800;color:#1e3a8a;">🏠 Open Houses This Weekend</p>
          <p style="margin:6px 0 0;color:#1e40af;font-size:14px;font-weight:600;">
            ⏰ Deadline to submit: ${deadline}
          </p>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:28px 32px;">
          <p style="margin:0 0 6px;color:#6b7280;font-size:15px;">Hey ${recipientName}!</p>
          <p style="margin:0 0 20px;color:#374151;font-size:15px;line-height:1.6;">
            Are you hosting an open house this weekend? <strong>Submit by the deadline</strong> and we will take care of:
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
            <tr><td style="padding:5px 0;color:#374151;font-size:14px;">✅ &nbsp;Weekly email blast to all agents, clients &amp; leads</td></tr>
            <tr><td style="padding:5px 0;color:#374151;font-size:14px;">✅ &nbsp;MLS open house status update</td></tr>
            <tr><td style="padding:5px 0;color:#374151;font-size:14px;">✅ &nbsp;Boomtown open house notification</td></tr>
            <tr><td style="padding:5px 0;color:#374151;font-size:14px;">✅ &nbsp;Social media open house posts</td></tr>
          </table>

          <p style="margin:0 0 20px;color:#92400e;font-size:13px;background:#fef3c7;padding:12px 16px;border-radius:8px;border-left:4px solid #f59e0b;">
            ⚠️ <strong>Once the schedule is locked and published to social media, we cannot make changes.</strong>
            Late submissions may not be included in all marketing channels.
          </p>

          <!-- CTA Button -->
          <div style="text-align:center;margin:24px 0;">
            <a href="${submitUrl}" style="display:inline-block;background:#1e40af;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:14px 36px;border-radius:8px;letter-spacing:.2px;">
              Submit Your Open House →
            </a>
          </div>

          <!-- Divider -->
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">

          <!-- Current submissions -->
          <p style="margin:0 0 4px;font-size:16px;font-weight:700;color:#111827;">Already Scheduled This Weekend</p>
          <p style="margin:0 0 16px;color:#6b7280;font-size:13px;">The following open houses have already been submitted:</p>
          ${noSubmissionsYet}
          ${satSection}
          ${sunSection}
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:16px 32px;border-top:1px solid #f3f4f6;">
          <p style="margin:0;color:#9ca3af;font-size:12px;">
            You're receiving this as an active agent at ${appName}.
            <a href="${appUrl}/dashboard/settings/notifications" style="color:#6b7280;">Manage preferences</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/* ── Main handler ────────────────────────────────────────────────────────── */

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') || req.headers.get('authorization')?.replace('Bearer ', '');
  if (CRON_SECRET && secret !== CRON_SECRET) return jsonErr(401, 'Unauthorized');

  const url = new URL(req.url);
  const mode = url.searchParams.get('mode') || 'deadline';

  // Load admin-configurable settings from Firestore
  const settingsSnap = await adminDb.collection('openHouseSettings').doc('default').get();
  const settings = settingsSnap.exists ? settingsSnap.data()! : {};
  const deadlineText = (settings.deadlineText as string) || 'Thursday by 4:00 PM';
  const appName = process.env.NEXT_PUBLIC_APP_NAME || 'Keaty Real Estate';
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://smart-broker-usa.web.app';

  /* ── mode: deadline ─────────────────────────────────────────────────── */
  if (mode === 'deadline') {
    const { saturday, sunday } = getComingWeekend();

    // Fetch open house submissions for the coming weekend (both pending and confirmed)
    const [satSnap, sunSnap] = await Promise.all([
      adminDb.collection('openHouseSubmissions')
        .where('openHouseDate', '==', saturday)
        .where('status', 'in', ['pending', 'email_sent'])
        .get(),
      adminDb.collection('openHouseSubmissions')
        .where('openHouseDate', '==', sunday)
        .where('status', 'in', ['pending', 'email_sent'])
        .get(),
    ]);

    const toOHItem = (d: FirebaseFirestore.QueryDocumentSnapshot): OHItem => {
      const data = d.data();
      return {
        agentName: data.agentName || 'Agent',
        propertyAddress: data.propertyAddress,
        mlsNumber: data.mlsNumber,
        startTime: data.startTime,
        endTime: data.endTime,
        status: data.status,
      };
    };

    const satItems = satSnap.docs.map(toOHItem);
    const sunItems = sunSnap.docs.map(toOHItem);

    // Build plain-text summary for in-app notification body
    const lines: string[] = [];
    if (satItems.length > 0) {
      lines.push(`Sat: ${satItems.map(i => `${i.agentName} – ${i.propertyAddress || 'TBD'}`).join(', ')}`);
    }
    if (sunItems.length > 0) {
      lines.push(`Sun: ${sunItems.map(i => `${i.agentName} – ${i.propertyAddress || 'TBD'}`).join(', ')}`);
    }
    const submittedSummary = lines.length > 0
      ? ` Already scheduled: ${lines.join(' | ')}.`
      : ' No open houses submitted yet — be the first!';

    // Fetch all active agents
    const agentSnap = await adminDb.collection('agentProfiles')
      .where('status', '==', 'active')
      .get();

    const agentUids: string[] = [];
    const agentEmails: { uid: string; email: string; name: string }[] = [];

    for (const doc of agentSnap.docs) {
      const data = doc.data();
      if (data.isDemoAccount) continue;
      const uid = data.firebaseUid || data.uid;
      if (!uid) continue;
      agentUids.push(uid);
      if (data.email) {
        agentEmails.push({
          uid,
          email: data.email,
          name: data.firstName || data.displayName?.split(' ')[0] || 'Agent',
        });
      }
    }

    // Send in-app notifications in batches of 50
    const batchSize = 50;
    for (let i = 0; i < agentUids.length; i += batchSize) {
      const batch = agentUids.slice(i, i + batchSize);
      await sendNotification(adminDb, {
        type: 'system',
        recipientUids: batch,
        title: '🏠 Open House Deadline: Today!',
        body: `Submit your open house by ${deadlineText} to be included in the email blast, MLS, Boomtown, and social media posts.${submittedSummary}`,
        url: '/dashboard/open-house',
      });
    }

    // Send individual rich HTML emails via Resend
    let emailsSent = 0;
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey) {
      const { Resend } = await import('resend');
      const resend = new Resend(resendKey);
      const fromDomain = process.env.RESEND_FROM_DOMAIN || 'smartbrokerusa.com';
      for (const agent of agentEmails) {
        try {
          const html = buildReminderEmail(appName, appUrl, agent.name, deadlineText, satItems, sunItems);
          await resend.emails.send({
            from: `${appName} <notifications@${fromDomain}>`,
            to: [agent.email],
            subject: `🏠 Open House Deadline Today — Submit by ${deadlineText}`,
            html,
          });
          emailsSent++;
        } catch (err) {
          console.error(`[open-house-reminder] Email failed for ${agent.email}:`, err);
        }
      }
    }

    return NextResponse.json({
      ok: true,
      mode,
      agentsNotified: agentUids.length,
      emailsSent,
      satItems: satItems.length,
      sunItems: sunItems.length,
    });
  }

  /* ── mode: staff_deadline ───────────────────────────────────────────── */
  if (mode === 'staff_deadline') {
    const staffSnap = await adminDb.collection('users')
      .where('role', 'in', ['staff', 'admin', 'broker'])
      .get();
    const staffUids = staffSnap.docs.map(d => d.id);

    const { saturday, sunday } = getComingWeekend();
    const [satSnap, sunSnap] = await Promise.all([
      adminDb.collection('openHouseSubmissions')
        .where('openHouseDate', '==', saturday)
        .where('status', '==', 'pending')
        .get(),
      adminDb.collection('openHouseSubmissions')
        .where('openHouseDate', '==', sunday)
        .where('status', '==', 'pending')
        .get(),
    ]);
    const pendingCount = satSnap.size + sunSnap.size;

    if (staffUids.length > 0) {
      await sendNotification(adminDb, {
        type: 'staff_queue_new',
        recipientUids: staffUids,
        title: `📧 Open House Email Blast Due Today`,
        body: `There ${pendingCount === 1 ? 'is 1 open house submission' : `are ${pendingCount} open house submissions`} waiting. Please complete the MLS, Boomtown, and email blast checklist for each and mark them done in the Staff Queue.`,
        url: '/dashboard/admin/staff-queue',
      });
    }

    return NextResponse.json({ ok: true, mode, staffNotified: staffUids.length, pendingSubmissions: pendingCount });
  }

  return jsonErr(400, 'Unknown mode. Valid: deadline, staff_deadline');
}
