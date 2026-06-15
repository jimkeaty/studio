import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';

// This cron runs every Wednesday. It:
// 1. Finds all active listings/needs that haven't been confirmed in 7+ days
// 2. Sends in-app notification + email + SMS to the posting agent
// 3. Auto-removes any listing that hasn't been confirmed in 14+ days (missed 2 weeks)
//
// Trigger via: POST /api/cron/tv-staleness
// Protected by CRON_SECRET header

const COLLECTIONS = [
  { name: 'openHouseListings', label: 'Open House', emoji: '🏠' },
  { name: 'buyerNeeds', label: 'Buyer Need', emoji: '🔍' },
  { name: 'comingSoonListings', label: 'Coming Soon Listing', emoji: '⏰' },
] as const;

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
    console.error('Failed to send in-app notification:', e);
  }
}

async function sendEmailNotification(email: string, agentName: string, itemLabel: string, itemDescription: string, confirmUrl: string) {
  // Uses the existing email utility if available, otherwise logs
  try {
    // Dynamic import — module may not exist in all deployments
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const emailMod: any = await import('@/lib/email' as string).catch(() => null);
    const sendEmail: ((opts: { to: string; subject: string; html: string }) => Promise<void>) | null = emailMod?.sendEmail ?? null;
    if (sendEmail) {
      await sendEmail({
        to: email,
        subject: `Action Required: Confirm your ${itemLabel} is still active`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #f97316;">Smart Broker — Weekly Board Refresh</h2>
            <p>Hi ${agentName},</p>
            <p>Your <strong>${itemLabel}</strong> on the office board needs to be confirmed as still active:</p>
            <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin: 16px 0;">
              <strong>${itemDescription}</strong>
            </div>
            <p>If this is still active, please click the button below to keep it on the board. If you don't confirm within 7 days, it will be automatically removed.</p>
            <a href="${confirmUrl}" style="display: inline-block; background: #f97316; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; margin: 16px 0;">
              ✅ Yes, Keep It Active
            </a>
            <p style="color: #6b7280; font-size: 14px;">If this listing has sold, gone pending, or the buyer need is filled, simply ignore this email and it will be removed automatically.</p>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
            <p style="color: #9ca3af; font-size: 12px;">Smart Broker USA — Keaty Real Estate</p>
          </div>
        `,
      });
    }
  } catch (e) {
    console.error('Failed to send email notification:', e);
  }
}

export async function POST(req: NextRequest) {
  // Verify cron secret
  const secret = req.headers.get('x-cron-secret');
  if (secret !== process.env.CRON_SECRET && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  const results: Record<string, { warned: number; removed: number }> = {};
  const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://smart-broker-usa-next--smart-broker-usa.us-central1.hosted.app';

  for (const col of COLLECTIONS) {
    let warned = 0;
    let removed = 0;

    const snapshot = await adminDb
      .collection(col.name)
      .where('status', '==', 'active')
      .get();

    for (const doc of snapshot.docs) {
      const data = doc.data();
      const lastConfirmed: Date = data.lastConfirmedAt?.toDate?.() ?? data.createdAt?.toDate?.() ?? new Date(0);

      // Auto-remove if not confirmed in 14+ days
      if (lastConfirmed < fourteenDaysAgo) {
        await doc.ref.update({ status: 'removed', removedAt: FieldValue.serverTimestamp(), removedReason: 'auto_stale' });
        removed++;

        // Send removal notification
        if (data.agentProfileId) {
          await sendInAppNotification(
            data.agentProfileId,
            `${col.emoji} ${col.label} Removed`,
            `Your ${col.label.toLowerCase()} "${data.address || data.area || 'listing'}" was automatically removed from the office board because it wasn't confirmed as active for 2 weeks.`
          );
        }
        continue;
      }

      // Send warning if not confirmed in 7+ days
      if (lastConfirmed < sevenDaysAgo) {
        warned++;

        const itemDescription = data.address || data.area || `${data.beds ? data.beds + 'bd ' : ''}${data.baths ? data.baths + 'ba' : ''}`.trim() || col.label;
        const confirmUrl = `${appBaseUrl}/dashboard/tv-mode/${col.name === 'openHouseListings' ? 'open-houses' : col.name === 'buyerNeeds' ? 'buyer-needs' : 'coming-soon'}?confirm=${doc.id}`;

        // In-app notification
        if (data.agentProfileId) {
          await sendInAppNotification(
            data.agentProfileId,
            `${col.emoji} Confirm Your ${col.label} is Still Active`,
            `Your ${col.label.toLowerCase()} "${itemDescription}" needs to be confirmed as still active. It will be removed next Wednesday if not confirmed.`
          );
        }

        // Email notification
        if (data.agentEmail) {
          await sendEmailNotification(
            data.agentEmail,
            data.agentName || 'Agent',
            col.label,
            itemDescription,
            confirmUrl
          );
        }

        // SMS notification — store pending SMS in a collection for the SMS worker to pick up
        if (data.agentPhone) {
          await adminDb.collection('pendingSms').add({
            to: data.agentPhone,
            body: `Smart Broker: Your ${col.label} "${itemDescription}" needs confirmation. Reply YES to keep it active or it'll be removed Wed. Confirm: ${confirmUrl}`,
            createdAt: FieldValue.serverTimestamp(),
            type: 'tv_staleness',
          });
        }
      }
    }

    results[col.name] = { warned, removed };
  }

  return NextResponse.json({ ok: true, results, runAt: now.toISOString() });
}

// Also allow GET for manual trigger from admin
export async function GET(req: NextRequest) {
  return POST(req);
}
