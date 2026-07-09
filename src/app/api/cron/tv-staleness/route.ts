import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';

// ─── TV Board Staleness Cron ──────────────────────────────────────────────────
//
// TWO separate cron jobs call this endpoint with a `mode` query param:
//
//   mode=monday  (runs every Monday)
//     - Finds active posts that are 14+ days old AND haven't had a renewal prompt
//       sent yet (renewalPromptSentAt is null/missing)
//     - Sends renewal prompt: email + SMS + in-app notification asking agent
//       "Do you still have this buyer need? Yes/No"
//     - Sets renewalPromptSentAt = now on the doc
//
//   mode=wednesday  (runs every Wednesday)
//     - Finds active posts where renewalPromptSentAt was set (prompt was sent on Monday)
//       AND the agent has NOT confirmed (lastConfirmedAt < renewalPromptSentAt)
//     - Archives those posts: status = 'archived', archivedAt = now, archivedReason = 'no_renewal_response'
//     - Sends removal notification to agent
//     - Posts that were confirmed (agent clicked Yes) have lastConfirmedAt updated,
//       which resets the 14-day clock and clears renewalPromptSentAt
//
// NEW RULE: A post must be at least 14 days old before it is eligible for removal.
// If the agent clicks "Yes, Keep It" → lastConfirmedAt is updated and renewalPromptSentAt
// is cleared, giving them another 14 days.
// If the agent clicks "No" or doesn't respond → archived on Wednesday.
// Archived posts are soft-deleted (status='archived') and can be re-added by the agent.
//
// Trigger via: POST /api/cron/tv-staleness?mode=monday  or  ?mode=wednesday
// Protected by x-cron-secret header

// All 4 collections receive the Monday renewal prompt
const ALL_COLLECTIONS = [
  { name: 'openHouseListings',  label: 'Open House Opportunity', emoji: '🏠', archive: false },
  { name: 'buyerNeeds',         label: 'Buyer Need',             emoji: '🔍', archive: true  },
  { name: 'comingSoonListings', label: 'Coming Soon Listing',     emoji: '⏰', archive: true  },
  { name: 'agentHelpRequests',  label: 'Agent Help Request',     emoji: '🤝', archive: false },
] as const;

// Alias for the Monday prompt loop (all 4)
const COLLECTIONS = ALL_COLLECTIONS;

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;
const ONE_EIGHTY_DAYS_MS = 180 * 24 * 60 * 60 * 1000;

function sectionSlug(colName: string): string {
  if (colName === 'openHouseListings')  return 'open-houses';
  if (colName === 'buyerNeeds')         return 'buyer-needs';
  if (colName === 'comingSoonListings') return 'coming-soon';
  return 'agent-help';
}

async function sendInAppNotification(agentProfileId: string, title: string, body: string) {
  try {
    await adminDb.collection('notifications').add({
      userId: agentProfileId,
      title,
      body,
      type: 'tv_staleness',
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (e) {
    console.error('[tv-staleness] Failed to send in-app notification:', e);
  }
}

async function sendRenewalEmail(
  email: string,
  agentName: string,
  itemLabel: string,
  itemDescription: string,
  confirmUrl: string,
  declineUrl: string,
) {
  try {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return;
    const { Resend } = await import('resend');
    const resend = new Resend(apiKey);
    const fromDomain = process.env.RESEND_FROM_DOMAIN || 'smartbrokerusa.com';
    await resend.emails.send({
      from: `Keaty Real Estate <notifications@${fromDomain}>`,
      to: [email],
      subject: `Do you still have this ${itemLabel}? Confirm by Wednesday`,
      html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;">
          <div style="background:#f97316;padding:24px 32px;border-radius:12px 12px 0 0;">
            <p style="margin:0;color:#fff;font-size:18px;font-weight:700;">Keaty Real Estate</p>
            <span style="display:inline-block;margin-top:8px;background:rgba(255,255,255,.2);color:#fff;font-size:11px;font-weight:600;padding:2px 10px;border-radius:999px;">Board Renewal</span>
          </div>
          <div style="background:#fff;padding:32px;border:1px solid #e5e7eb;border-top:none;">
            <p style="margin:0 0 8px;color:#111827;font-size:20px;font-weight:700;">Do you still have this ${itemLabel}?</p>
            <p style="margin:0 0 24px;color:#6b7280;font-size:15px;">Hi ${agentName},</p>
            <p style="margin:0 0 8px;color:#374151;font-size:15px;">Your <strong>${itemLabel}</strong> has been on the office board for 14 days:</p>
            <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:16px 0;">
              <strong style="color:#111827;">${itemDescription}</strong>
            </div>
            <p style="margin:0 0 24px;color:#374151;font-size:15px;">If this is still active, click <strong>Yes, Keep It</strong> to keep it on the board for another 14 days. If it's been filled or is no longer needed, click <strong>No, Remove It</strong>.</p>
            <p style="margin:0 0 8px;color:#6b7280;font-size:13px;font-weight:600;">⚠️ If you don't respond by Wednesday, it will be automatically archived.</p>
            <div style="margin:24px 0;display:flex;gap:12px;">
              <a href="${confirmUrl}" style="display:inline-block;background:#16a34a;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;margin-right:12px;">✅ Yes, Keep It Active</a>
              <a href="${declineUrl}" style="display:inline-block;background:#dc2626;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">❌ No, Remove It</a>
            </div>
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
            <p style="color:#9ca3af;font-size:12px;">Keaty Real Estate — Keaty Real Estate</p>
          </div>
        </div>
      `,
    });
  } catch (e) {
    console.error('[tv-staleness] Failed to send renewal email:', e);
  }
}

async function sendArchiveEmail(
  email: string,
  agentName: string,
  itemLabel: string,
  itemDescription: string,
  readdUrl: string,
) {
  try {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return;
    const { Resend } = await import('resend');
    const resend = new Resend(apiKey);
    const fromDomain = process.env.RESEND_FROM_DOMAIN || 'smartbrokerusa.com';
    await resend.emails.send({
      from: `Keaty Real Estate <notifications@${fromDomain}>`,
      to: [email],
      subject: `Your ${itemLabel} has been archived`,
      html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;">
          <div style="background:#6b7280;padding:24px 32px;border-radius:12px 12px 0 0;">
            <p style="margin:0;color:#fff;font-size:18px;font-weight:700;">Keaty Real Estate</p>
            <span style="display:inline-block;margin-top:8px;background:rgba(255,255,255,.2);color:#fff;font-size:11px;font-weight:600;padding:2px 10px;border-radius:999px;">Archived</span>
          </div>
          <div style="background:#fff;padding:32px;border:1px solid #e5e7eb;border-top:none;">
            <p style="margin:0 0 8px;color:#111827;font-size:20px;font-weight:700;">Your ${itemLabel} was archived</p>
            <p style="margin:0 0 24px;color:#6b7280;font-size:15px;">Hi ${agentName},</p>
            <p style="margin:0 0 8px;color:#374151;font-size:15px;">Your <strong>${itemLabel}</strong> was automatically archived because we didn't receive a response to our renewal prompt:</p>
            <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:16px 0;">
              <strong style="color:#111827;">${itemDescription}</strong>
            </div>
            <p style="margin:0 0 24px;color:#374151;font-size:15px;">It has been saved to your Archived Posts. If you still need it on the board, you can re-add it with one click.</p>
            <a href="${readdUrl}" style="display:inline-block;background:#f97316;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">Re-add to Board</a>
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
            <p style="color:#9ca3af;font-size:12px;">Keaty Real Estate — Keaty Real Estate</p>
          </div>
        </div>
      `,
    });
  } catch (e) {
    console.error('[tv-staleness] Failed to send archive email:', e);
  }
}

// ── Monday mode: send renewal prompts for posts that are 14+ days old ─────────
async function runMondayPrompts(appBaseUrl: string) {
  const now = new Date();
  const fourteenDaysAgo = new Date(now.getTime() - FOURTEEN_DAYS_MS);
  const results: Record<string, { prompted: number }> = {};

  for (const col of COLLECTIONS) {
    let prompted = 0;

    const snapshot = await adminDb
      .collection(col.name)
      .where('status', '==', 'active')
      .get();

    for (const doc of snapshot.docs) {
      const data = doc.data();

      // Only prompt posts that are 14+ days old
      const createdAt: Date = data.createdAt?.toDate?.() ?? new Date(0);
      const lastConfirmed: Date = data.lastConfirmedAt?.toDate?.() ?? createdAt;

      // If confirmed recently (within 14 days), skip
      if (lastConfirmed >= fourteenDaysAgo) continue;

      // If we already sent a renewal prompt this cycle (since last confirmation), skip
      const promptSentAt: Date | null = data.renewalPromptSentAt?.toDate?.() ?? null;
      if (promptSentAt && promptSentAt > lastConfirmed) continue;

      // Send renewal prompt
      prompted++;
      const itemDescription = data.address || data.area ||
        `${data.beds ? data.beds + 'bd ' : ''}${data.baths ? data.baths + 'ba' : ''}`.trim() ||
        col.label;
      const slug = sectionSlug(col.name);
      const confirmUrl = `${appBaseUrl}/dashboard/tv-mode?tab=${slug}&confirm=${doc.id}`;
      const declineUrl = `${appBaseUrl}/dashboard/tv-mode?tab=${slug}&decline=${doc.id}`;
      const readdUrl   = `${appBaseUrl}/dashboard/tv-mode?tab=archived`;

      // Mark prompt sent
      await doc.ref.update({ renewalPromptSentAt: FieldValue.serverTimestamp() });

      // In-app notification
      if (data.agentProfileId) {
        await sendInAppNotification(
          data.agentProfileId,
          `${col.emoji} Do you still have this ${col.label}?`,
          `Your ${col.label.toLowerCase()} "${itemDescription}" has been on the board for 14 days. Confirm by Wednesday or it will be archived. Tap to respond.`
        );
      }

      // Email
      if (data.agentEmail) {
        await sendRenewalEmail(
          data.agentEmail,
          data.agentName || 'Agent',
          col.label,
          itemDescription,
          confirmUrl,
          declineUrl,
        );
      }

      // SMS
      if (data.agentPhone) {
        await adminDb.collection('pendingSms').add({
          to: data.agentPhone,
          body: `Smart Broker: Do you still have this ${col.label}? "${itemDescription}" — Reply YES to keep it or NO to remove. Must respond by Wednesday: ${confirmUrl}`,
          createdAt: FieldValue.serverTimestamp(),
          type: 'tv_renewal_prompt',
        });
      }
    }

    results[col.name] = { prompted };
  }

  return results;
}

// ── Wednesday mode: archive posts that didn't respond to Monday prompt ─────────
async function runWednesdayArchive(appBaseUrl: string) {
  const results: Record<string, { archived: number; purged: number }> = {};
  const now = new Date();
  const oneEightyDaysAgo = new Date(now.getTime() - ONE_EIGHTY_DAYS_MS);

  for (const col of ALL_COLLECTIONS) {
    let archived = 0;
    let purged = 0;

    const snapshot = await adminDb
      .collection(col.name)
      .where('status', '==', 'active')
      .get();

    for (const doc of snapshot.docs) {
      const data = doc.data();

      // Only archive if a renewal prompt was sent
      const promptSentAt: Date | null = data.renewalPromptSentAt?.toDate?.() ?? null;
      if (!promptSentAt) continue;

      // If agent confirmed AFTER the prompt was sent, they responded — skip
      const lastConfirmed: Date = data.lastConfirmedAt?.toDate?.() ?? new Date(0);
      if (lastConfirmed > promptSentAt) continue;

      // No response — archive (buyer needs + coming soon) or just remove (open house + agent help)
      archived++;
      if (col.archive) {
        await doc.ref.update({
          status: 'archived',
          archivedAt: FieldValue.serverTimestamp(),
          archivedReason: 'no_renewal_response',
          renewalPromptSentAt: FieldValue.delete(),
        });
      } else {
        await doc.ref.update({
          status: 'removed',
          removedAt: FieldValue.serverTimestamp(),
          removedReason: 'no_renewal_response',
          renewalPromptSentAt: FieldValue.delete(),
        });
      }

      const itemDescription = data.address || data.area ||
        `${data.beds ? data.beds + 'bd ' : ''}${data.baths ? data.baths + 'ba' : ''}`.trim() ||
        col.label;
      const readdUrl = col.archive ? `${appBaseUrl}/dashboard/tv-mode?tab=archived` : `${appBaseUrl}/dashboard/tv-mode`;

      // In-app notification
      if (data.agentProfileId) {
        await sendInAppNotification(
          data.agentProfileId,
          `${col.emoji} ${col.label} ${col.archive ? 'Archived' : 'Removed'}`,
          `Your ${col.label.toLowerCase()} "${itemDescription}" was ${col.archive ? 'archived' : 'removed'} because we didn't receive a response.${col.archive ? ' You can re-add it from your Archived Posts.' : ''}`
        );
      }

      // Email
      if (data.agentEmail) {
        await sendArchiveEmail(
          data.agentEmail,
          data.agentName || 'Agent',
          col.label,
          itemDescription,
          readdUrl,
        );
      }

      // SMS
      if (data.agentPhone) {
        await adminDb.collection('pendingSms').add({
          to: data.agentPhone,
          body: `Smart Broker: Your ${col.label} "${itemDescription}" was ${col.archive ? 'archived' : 'removed'} (no response received).${col.archive ? ` Re-add it here: ${readdUrl}` : ''}`,
          createdAt: FieldValue.serverTimestamp(),
          type: 'tv_archived',
        });
      }
    }

    // ── 180-day purge: permanently delete archived records older than 180 days ──
    if (col.archive) {
      const oldArchived = await adminDb
        .collection(col.name)
        .where('status', '==', 'archived')
        .get();
      for (const doc of oldArchived.docs) {
        const data = doc.data();
        const archivedAt: Date = data.archivedAt?.toDate?.() ?? new Date(0);
        if (archivedAt < oneEightyDaysAgo) {
          await doc.ref.delete();
          purged++;
        }
      }
    }

    results[col.name] = { archived, purged };
  }

  return results;
}

export async function POST(req: NextRequest) {
  // Verify cron secret
  const secret = req.headers.get('x-cron-secret');
  if (secret !== process.env.CRON_SECRET && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const mode = searchParams.get('mode') ?? 'wednesday';
  const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://smart-broker-usa-next--smart-broker-usa.us-central1.hosted.app';

  if (mode === 'monday') {
    const results = await runMondayPrompts(appBaseUrl);
    return NextResponse.json({ ok: true, mode: 'monday', results, runAt: new Date().toISOString() });
  } else {
    const results = await runWednesdayArchive(appBaseUrl);
    return NextResponse.json({ ok: true, mode: 'wednesday', results, runAt: new Date().toISOString() });
  }
}

// Also allow GET for manual trigger from admin
export async function GET(req: NextRequest) {
  return POST(req);
}
