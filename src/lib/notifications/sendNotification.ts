/**
 * sendNotification — unified multi-channel notification dispatcher
 *
 * Channels:
 *  - in_app  : writes to Firestore `notifications` collection (always sent)
 *  - push    : Firebase Cloud Messaging (FCM) via firebase-admin
 *  - email   : Resend (RESEND_API_KEY env var required)
 *  - sms     : Twilio (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER env vars required)
 *
 * Each recipient's preferences are read from their Firestore user profile
 * (`users/{uid}.notificationPrefs`).  If no prefs exist, defaults are used.
 *
 * Usage:
 *   await sendNotification(db, {
 *     type: 'tc_new_intake',
 *     recipientUids: ['uid1', 'uid2'],
 *     title: 'New TC Intake',
 *     body: '123 Main St has been submitted for review.',
 *     url: '/dashboard/admin/tc',
 *   });
 */

import type { Firestore } from 'firebase-admin/firestore';

// ─── Types ────────────────────────────────────────────────────────────────────

export type NotificationType =
  | 'tc_new_intake'         // new transaction submitted to TC queue
  | 'tc_approved'           // TC intake approved → agent notified
  | 'tc_rejected'           // TC intake rejected → agent notified
  | 'tc_document_uploaded'  // agent uploaded a document on a TC-assigned transaction
  | 'tc_field_update'       // agent edited fields on a TC-assigned transaction
  | 'staff_queue_new'       // new item added to staff queue
  | 'staff_queue_resolved'  // staff queue item resolved → agent notified
  | 'staff_queue_attention' // staff queue item needs agent attention
  | 'tx_status_change'      // transaction status changed → agent notified
  | 'tx_new_agent'          // new transaction added by agent → TC/staff notified
  | 'co_agent_split'        // co-agent transaction split on close → both agents notified
  | 'agent_help_request'              // agent posted a help-needed request → all agents notified
  | 'agent_help_claimed'              // another agent claimed a help request → requester notified
  | 'open_house_opportunity'          // agent posted an open house opportunity → all agents notified
  | 'open_house_opportunity_claimed'  // another agent claimed an open house opportunity → poster notified
  | 'system';                         // generic system notification

export interface NotificationPayload {
  type: NotificationType;
  recipientUids: string[];
  title: string;
  body: string;
  url?: string;
  /** Optional extra data stored on the Firestore notification doc */
  data?: Record<string, string>;
  /** Sender display name (for email "from" name) */
  senderName?: string;
  /** Optional per-call channel overrides — bypasses stored prefs for this notification */
  channels?: { in_app?: boolean; email?: boolean; sms?: boolean; push?: boolean };
}

export interface NotificationPrefs {
  in_app: boolean;
  push: boolean;
  email: boolean;
  sms: boolean;
  // Per-event overrides — if undefined, falls back to channel default above
  events?: Partial<Record<NotificationType, { in_app?: boolean; push?: boolean; email?: boolean; sms?: boolean }>>;
}

const DEFAULT_PREFS: NotificationPrefs = {
  in_app: true,
  push: true,
  email: true,
  sms: false, // SMS off by default — user must opt in
};

// ─── Main dispatcher ─────────────────────────────────────────────────────────

export async function sendNotification(
  db: Firestore,
  payload: NotificationPayload,
): Promise<void> {
  const { type, recipientUids, title, body, url = '/dashboard', data } = payload;

  if (!recipientUids || recipientUids.length === 0) return;

  // Deduplicate UIDs
  const uids = [...new Set(recipientUids)];

  await Promise.allSettled(
    uids.map((uid) => dispatchToUser(db, uid, type, title, body, url, data, payload.channels)),
  );
}

async function dispatchToUser(
  db: Firestore,
  uid: string,
  type: NotificationType,
  title: string,
  body: string,
  url: string,
  data?: Record<string, string>,
  channelOverrides?: { in_app?: boolean; email?: boolean; sms?: boolean; push?: boolean },
) {
  // Load user profile for prefs + contact info
  const userDoc = await db.collection('users').doc(uid).get();
  const userData = userDoc.exists ? (userDoc.data() as Record<string, any>) : {};

  // ── Resolve contact info ──────────────────────────────────────────────────
  // If the users/{uid} doc is missing email/phone (common for staff users whose
  // doc was created before the self-link flow), fall back to the staffUsers record.
  let resolvedEmail: string = userData.email || '';
  let resolvedName:  string = userData.displayName || userData.name || '';
  let resolvedPhone: string = userData.phone || '';
  if (!resolvedEmail) {
    try {
      const staffSnap = await db
        .collection('staffUsers')
        .where('firebaseUid', '==', uid)
        .limit(1)
        .get();
      if (!staffSnap.empty) {
        const sd = staffSnap.docs[0].data() as Record<string, any>;
        resolvedEmail = sd.email || '';
        resolvedName  = resolvedName || sd.displayName || sd.name || '';
        resolvedPhone = resolvedPhone || sd.phone || '';
      }
    } catch {
      // staffUsers lookup failed — skip silently
    }
  }

  // ── Resolve notification preferences ─────────────────────────────────────
  // Stored prefs may use either 'in_app' (canonical) or legacy 'inApp' (camelCase).
  // Normalise both so the channel check always works.
  const storedPrefs = userData.notificationPrefs as Record<string, any> | undefined;
  const normalisedPrefs: NotificationPrefs = storedPrefs
    ? {
        in_app: storedPrefs.in_app ?? storedPrefs.inApp ?? DEFAULT_PREFS.in_app,
        push:   storedPrefs.push   ?? DEFAULT_PREFS.push,
        email:  storedPrefs.email  ?? DEFAULT_PREFS.email,
        sms:    storedPrefs.sms    ?? DEFAULT_PREFS.sms,
        events: storedPrefs.events ?? {},
      }
    : DEFAULT_PREFS;

  const rawPrefs: NotificationPrefs = normalisedPrefs;
  const eventOverride = rawPrefs.events?.[type] ?? {};

  const resolvedFromPrefs = {
    in_app: eventOverride.in_app ?? rawPrefs.in_app ?? DEFAULT_PREFS.in_app,
    push:   eventOverride.push   ?? rawPrefs.push   ?? DEFAULT_PREFS.push,
    email:  eventOverride.email  ?? rawPrefs.email  ?? DEFAULT_PREFS.email,
    sms:    eventOverride.sms    ?? rawPrefs.sms    ?? DEFAULT_PREFS.sms,
  };
  // If caller supplied explicit channel overrides, use them instead of stored prefs
  const channels = channelOverrides
    ? {
        in_app: channelOverrides.in_app ?? resolvedFromPrefs.in_app,
        push:   channelOverrides.push   ?? resolvedFromPrefs.push,
        email:  channelOverrides.email  ?? resolvedFromPrefs.email,
        sms:    channelOverrides.sms    ?? resolvedFromPrefs.sms,
      }
    : resolvedFromPrefs;

  const tasks: Promise<void>[] = [];

  // ── In-app ────────────────────────────────────────────────────────────────
  if (channels.in_app) {
    tasks.push(
      db.collection('notifications').add({
        recipientUid: uid,
        type,
        title,
        body,
        url,
        read: false,
        createdAt: new Date(),
        ...(data ?? {}),
      }).then(() => undefined),
    );
  }

  // ── Push (FCM) ────────────────────────────────────────────────────────────
  if (channels.push) {
    tasks.push(sendPush(db, uid, title, body, url, type));
  }

  // ── Email (Resend) ────────────────────────────────────────────────────────
  if (channels.email && resolvedEmail) {
    tasks.push(sendEmail(resolvedEmail, resolvedName || 'User', title, body, url, type));
  }

  // ── SMS (Twilio) ──────────────────────────────────────────────────────────
  // Phone priority: users/{uid}.phone > staffUsers.phone > agentProfiles.phone
  let smsPhone: string | null = resolvedPhone || null;
  if (!smsPhone && resolvedEmail) {
    try {
      const agentSnap = await db.collection('agentProfiles')
        .where('email', '==', resolvedEmail)
        .limit(1)
        .get();
      if (!agentSnap.empty) {
        smsPhone = agentSnap.docs[0].data().phone || null;
      }
    } catch {
      // agentProfiles lookup failed — skip silently
    }
  }
  if (channels.sms && smsPhone) {
    tasks.push(sendSms(db, smsPhone, title, body, url));
  }

  await Promise.allSettled(tasks);
}

// ─── FCM Push ─────────────────────────────────────────────────────────────────

async function sendPush(
  db: Firestore,
  uid: string,
  title: string,
  body: string,
  url: string,
  type: string,
): Promise<void> {
  try {
    const tokenDoc = await db.collection('fcmTokens').doc(uid).get();
    if (!tokenDoc.exists) return;
    const fcmToken = tokenDoc.data()?.token as string | undefined;
    if (!fcmToken) return;

    const { getMessaging } = await import('firebase-admin/messaging');
    await getMessaging().send({
      token: fcmToken,
      notification: { title, body },
      webpush: {
        notification: {
          title,
          body,
          icon: '/icons/icon-192x192.png',
          badge: '/icons/icon-72x72.png',
          tag: type,
          renotify: true,
        },
        fcmOptions: { link: url },
      },
      data: { type, url },
    });
  } catch (err) {
    console.error(`[sendNotification] FCM push failed for ${uid}:`, err);
  }
}

// ─── Email via Resend ─────────────────────────────────────────────────────────

async function sendEmail(
  toEmail: string,
  toName: string,
  title: string,
  body: string,
  url: string,
  type: NotificationType,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return; // Resend not configured — skip silently

  try {
    const { Resend } = await import('resend');
    const resend = new Resend(apiKey);

    const appName = process.env.NEXT_PUBLIC_APP_NAME || 'Smart Broker USA';
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://smart-broker-usa.web.app';
    const fullUrl = url.startsWith('http') ? url : `${appUrl}${url}`;

    await resend.emails.send({
      from: `${appName} <notifications@${process.env.RESEND_FROM_DOMAIN || 'smartbrokerusa.com'}>`,
      to: [toEmail],
      subject: title,
      html: buildEmailHtml(appName, toName, title, body, fullUrl, type),
    });
  } catch (err) {
    console.error(`[sendNotification] Resend email failed for ${toEmail}:`, err);
  }
}

function buildEmailHtml(
  appName: string,
  recipientName: string,
  title: string,
  body: string,
  url: string,
  type: NotificationType,
): string {
  const accentColor = '#2563eb'; // blue-600
  const typeLabel: Record<NotificationType, string> = {
    tc_new_intake:         'TC Queue',
    tc_approved:           'TC Approved',
    tc_rejected:           'TC Rejected',
    tc_document_uploaded:  'TC Document',
    tc_field_update:       'TC Update',
    staff_queue_new:       'Staff Queue',
    staff_queue_resolved:  'Resolved',
    staff_queue_attention: 'Action Required',
    tx_status_change:      'Status Update',
    tx_new_agent:          'New Transaction',
    co_agent_split:        'Transaction Split',
    agent_help_request:             'Agent Help Needed',
    agent_help_claimed:             'Help Claimed',
    open_house_opportunity:         'Open House Opportunity',
    open_house_opportunity_claimed: 'Open House Claimed',
    system:                         'System',
  };
  const badge = typeLabel[type] ?? 'Notification';

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1);">
        <!-- Header -->
        <tr><td style="background:${accentColor};padding:24px 32px;">
          <p style="margin:0;color:#ffffff;font-size:18px;font-weight:700;">${appName}</p>
          <span style="display:inline-block;margin-top:8px;background:rgba(255,255,255,.2);color:#fff;font-size:11px;font-weight:600;padding:2px 10px;border-radius:999px;letter-spacing:.5px;">${badge}</span>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:32px;">
          <p style="margin:0 0 8px;color:#111827;font-size:20px;font-weight:700;line-height:1.3;">${title}</p>
          <p style="margin:0 0 24px;color:#6b7280;font-size:15px;line-height:1.6;">Hi ${recipientName},</p>
          <p style="margin:0 0 28px;color:#374151;font-size:15px;line-height:1.6;">${body}</p>
          <a href="${url}" style="display:inline-block;background:${accentColor};color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 28px;border-radius:8px;">View in Dashboard →</a>
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:16px 32px;border-top:1px solid #f3f4f6;">
          <p style="margin:0;color:#9ca3af;font-size:12px;">You're receiving this because you have notifications enabled. <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://smart-broker-usa.web.app'}/dashboard/settings/notifications" style="color:#6b7280;">Manage preferences</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ─── SMS via Twilio ───────────────────────────────────────────────────────────

// Cache the Firestore FROM number to avoid a Firestore read on every SMS
let _cachedTwilioFromNumber: string | null = null;
let _twilioFromNumberCachedAt = 0;
const TWILIO_FROM_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function getTwilioFromNumber(db: Firestore): Promise<string | null> {
  // Return cached value if still fresh
  if (_cachedTwilioFromNumber && Date.now() - _twilioFromNumberCachedAt < TWILIO_FROM_CACHE_TTL_MS) {
    return _cachedTwilioFromNumber;
  }
  try {
    const doc = await db.collection('settings').doc('twilio').get();
    if (doc.exists && doc.data()?.fromNumber) {
      _cachedTwilioFromNumber = doc.data()!.fromNumber as string;
      _twilioFromNumberCachedAt = Date.now();
      return _cachedTwilioFromNumber;
    }
  } catch (err) {
    console.warn('[sendNotification] Could not read Twilio settings from Firestore, falling back to env var:', err);
  }
  // Fall back to env var
  const envFromNumber = process.env.TWILIO_FROM_NUMBER || null;
  _cachedTwilioFromNumber = envFromNumber;
  _twilioFromNumberCachedAt = Date.now();
  return envFromNumber;
}

async function sendSms(
  db: Firestore,
  toPhone: string,
  title: string,
  body: string,
  url: string,
): Promise<void> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken  = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = await getTwilioFromNumber(db);

  if (!accountSid || !authToken || !fromNumber) return; // Twilio not configured — skip silently

  try {
    const twilio = (await import('twilio')).default;
    const client = twilio(accountSid, authToken);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://smart-broker-usa.web.app';
    const fullUrl = url.startsWith('http') ? url : `${appUrl}${url}`;
    const message = `${title}\n${body}\n${fullUrl}`;
    await client.messages.create({
      body: message.slice(0, 1600), // SMS max
      from: fromNumber,
      to: toPhone,
    });
  } catch (err) {
    console.error(`[sendNotification] Twilio SMS failed for ${toPhone}:`, err);
  }
}
