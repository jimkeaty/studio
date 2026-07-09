/**
 * broadcastTvPost.ts
 *
 * When a new community post is created (Buyer Need, Coming Soon, Open House Opportunity,
 * Agent Help Request), this utility broadcasts a notification to all active agents who
 * have opted in to receive notifications for that post type.
 *
 * Agent notification preferences are stored in the agentProfiles collection under
 * the `tvNotificationPrefs` field:
 *
 *   tvNotificationPrefs: {
 *     buyerNeeds:         { in_app: true, email: true, sms: false },
 *     comingSoon:         { in_app: true, email: true, sms: false },
 *     openHouseOpps:      { in_app: true, email: false, sms: false },
 *     agentHelp:          { in_app: true, email: true, sms: true },
 *   }
 *
 * If `tvNotificationPrefs` is not set, the agent receives in-app notifications only
 * (opt-in default for in-app, opt-out default for email/SMS).
 */

import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';

export type TvPostType = 'buyerNeeds' | 'comingSoon' | 'openHouseOpps' | 'agentHelp';

interface PostInfo {
  postType: TvPostType;
  postId: string;
  label: string;
  emoji: string;
  description: string;   // short human-readable description of the post
  agentName: string;     // name of the agent who posted
  dashboardUrl: string;  // link to view the post
}

interface ChannelPrefs {
  in_app?: boolean;
  email?: boolean;
  sms?: boolean;
}

const DEFAULT_PREFS: ChannelPrefs = { in_app: true, email: false, sms: false };

export async function broadcastTvPost(info: PostInfo): Promise<{ notified: number }> {
  const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://smart-broker-usa-next--smart-broker-usa.us-central1.hosted.app';
  const fullUrl = info.dashboardUrl.startsWith('http')
    ? info.dashboardUrl
    : `${appBaseUrl}${info.dashboardUrl}`;

  // Load all active agent profiles
  const profilesSnap = await adminDb
    .collection('agentProfiles')
    .where('status', '==', 'active')
    .get();

  let notified = 0;

  for (const doc of profilesSnap.docs) {
    const agent = doc.data();

    // Skip agents with no contact info
    if (!agent.agentId && !doc.id) continue;

    // Get this agent's TV notification preferences
    const tvPrefs: Record<TvPostType, ChannelPrefs> = agent.tvNotificationPrefs ?? {};
    const prefs: ChannelPrefs = tvPrefs[info.postType] ?? DEFAULT_PREFS;

    // Skip if agent has opted out of in-app AND email AND sms
    const wantsAny = (prefs.in_app ?? DEFAULT_PREFS.in_app)
      || (prefs.email ?? DEFAULT_PREFS.email)
      || (prefs.sms ?? DEFAULT_PREFS.sms);
    if (!wantsAny) continue;

    const title = `${info.emoji} New ${info.label} from ${info.agentName}`;
    const body = info.description;

    notified++;

    // In-app notification
    if (prefs.in_app ?? DEFAULT_PREFS.in_app) {
      try {
        await adminDb.collection('notifications').add({
          userId: doc.id,
          title,
          body,
          type: `tv_new_${info.postType}`,
          read: false,
          actionUrl: fullUrl,
          createdAt: FieldValue.serverTimestamp(),
        });
      } catch (e) {
        console.error(`[broadcastTvPost] in-app notification failed for ${doc.id}:`, e);
      }
    }

    // Email notification
    if (prefs.email && agent.email) {
      try {
        const apiKey = process.env.RESEND_API_KEY;
        if (apiKey) {
          const { Resend } = await import('resend');
          const resend = new Resend(apiKey);
          const fromDomain = process.env.RESEND_FROM_DOMAIN || 'smartbrokerusa.com';
          await resend.emails.send({
            from: `Keaty Real Estate <notifications@${fromDomain}>`,
            to: [agent.email],
            subject: title,
            html: buildBroadcastEmail(agent.displayName || agent.firstName || 'Agent', info, fullUrl),
          });
        }
      } catch (e) {
        console.error(`[broadcastTvPost] email failed for ${agent.email}:`, e);
      }
    }

    // SMS notification
    if (prefs.sms && agent.phone) {
      try {
        await adminDb.collection('pendingSms').add({
          to: agent.phone,
          body: `Smart Broker: ${title}\n${body}\nView: ${fullUrl}`,
          createdAt: FieldValue.serverTimestamp(),
          type: `tv_new_${info.postType}`,
        });
      } catch (e) {
        console.error(`[broadcastTvPost] SMS queue failed for ${agent.phone}:`, e);
      }
    }
  }

  return { notified };
}

function buildBroadcastEmail(
  recipientName: string,
  info: PostInfo,
  url: string,
): string {
  const labelColors: Record<TvPostType, string> = {
    buyerNeeds:      '#7c3aed',
    comingSoon:      '#d97706',
    openHouseOpps:   '#0891b2',
    agentHelp:       '#dc2626',
  };
  const accent = labelColors[info.postType] ?? '#f97316';

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1);">
        <tr><td style="background:${accent};padding:24px 32px;">
          <p style="margin:0;color:#ffffff;font-size:18px;font-weight:700;">Keaty Real Estate</p>
          <span style="display:inline-block;margin-top:8px;background:rgba(255,255,255,.2);color:#fff;font-size:11px;font-weight:600;padding:2px 10px;border-radius:999px;">${info.emoji} ${info.label}</span>
        </td></tr>
        <tr><td style="padding:32px;">
          <p style="margin:0 0 8px;color:#111827;font-size:20px;font-weight:700;">New ${info.label} Posted</p>
          <p style="margin:0 0 24px;color:#6b7280;font-size:15px;">Hi ${recipientName},</p>
          <p style="margin:0 0 8px;color:#374151;font-size:15px;"><strong>${info.agentName}</strong> just posted a new ${info.label} on the office board:</p>
          <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:16px 0;">
            <p style="margin:0;color:#111827;font-size:15px;">${info.description}</p>
          </div>
          <a href="${url}" style="display:inline-block;background:${accent};color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 28px;border-radius:8px;">View on Office Board →</a>
        </td></tr>
        <tr><td style="padding:16px 32px;border-top:1px solid #f3f4f6;">
          <p style="margin:0;color:#9ca3af;font-size:12px;">You're receiving this because you have TV board notifications enabled. <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://smart-broker-usa.web.app'}/dashboard/settings/notifications" style="color:#6b7280;">Manage preferences</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
