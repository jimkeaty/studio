// POST /api/agent/staging-request
// Saves a staging request to Firestore and emails the selected stager.
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';

export const maxDuration = 30;

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

async function getUid(req: NextRequest): Promise<string | null> {
  const h = req.headers.get('Authorization') || '';
  const token = h.startsWith('Bearer ') ? h.slice(7).trim() : null;
  if (!token) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    return decoded.uid;
  } catch { return null; }
}

function buildStagingEmailHtml(data: {
  agentName: string;
  agentPhone: string;
  agentEmail: string;
  sellerName: string;
  sellerPhone: string;
  sellerEmail: string;
  propertyAddress: string;
  consultationDate: string;
  consultationTime: string;
  paymentMethod: string;
  currentlyOnMarket: string;
  targetedMarketDate: string;
  listPrice: string;
  sqft: string;
  homeStyle: string;
  occupancy: string;
  reasonForSelling: string;
  specialNotes: string;
  stagerName: string;
}): string {
  const appName = process.env.NEXT_PUBLIC_APP_NAME || 'Smart Broker USA';
  const accentColor = '#1d4ed8';

  const row = (label: string, value: string) =>
    value ? `<tr><td style="padding:6px 0;color:#6b7280;font-size:13px;width:180px;vertical-align:top;">${label}</td><td style="padding:6px 0;color:#111827;font-size:13px;font-weight:500;">${value}</td></tr>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1);">
        <!-- Header -->
        <tr><td style="background:${accentColor};padding:24px 32px;">
          <p style="margin:0;color:#ffffff;font-size:18px;font-weight:700;">${appName}</p>
          <span style="display:inline-block;margin-top:8px;background:rgba(255,255,255,.2);color:#fff;font-size:11px;font-weight:600;padding:2px 10px;border-radius:999px;letter-spacing:.5px;">Staging Request</span>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:32px;">
          <p style="margin:0 0 6px;color:#111827;font-size:20px;font-weight:700;">New Staging Request</p>
          <p style="margin:0 0 24px;color:#6b7280;font-size:14px;">Hi ${data.stagerName}, a new staging consultation request has been submitted.</p>

          <!-- Consultation Details -->
          <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
            <p style="margin:0 0 12px;font-size:14px;font-weight:700;color:#1e40af;">📅 Consultation Details</p>
            <table cellpadding="0" cellspacing="0" width="100%">
              ${row('Target Date', data.consultationDate)}
              ${row('Preferred Time', data.consultationTime)}
              ${row('Payment Method', data.paymentMethod)}
            </table>
          </div>

          <!-- Property Details -->
          <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
            <p style="margin:0 0 12px;font-size:14px;font-weight:700;color:#374151;">🏠 Property Details</p>
            <table cellpadding="0" cellspacing="0" width="100%">
              ${row('Address', data.propertyAddress)}
              ${row('List Price', data.listPrice)}
              ${row('Square Footage', data.sqft ? data.sqft + ' sqft' : '')}
              ${row('Home Style', data.homeStyle)}
              ${row('Occupancy', data.occupancy)}
              ${row('Currently on Market', data.currentlyOnMarket)}
              ${row('Target Market Date', data.targetedMarketDate)}
              ${row('Reason for Selling', data.reasonForSelling)}
            </table>
          </div>

          <!-- Seller Contact -->
          <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
            <p style="margin:0 0 12px;font-size:14px;font-weight:700;color:#374151;">👤 Seller Contact</p>
            <table cellpadding="0" cellspacing="0" width="100%">
              ${row('Name', data.sellerName)}
              ${row('Phone', data.sellerPhone)}
              ${row('Email', data.sellerEmail)}
            </table>
          </div>

          <!-- Agent Contact -->
          <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
            <p style="margin:0 0 12px;font-size:14px;font-weight:700;color:#374151;">🏢 Agent Contact</p>
            <table cellpadding="0" cellspacing="0" width="100%">
              ${row('Name', data.agentName)}
              ${row('Phone', data.agentPhone)}
              ${row('Email', data.agentEmail)}
            </table>
          </div>

          ${data.specialNotes ? `
          <!-- Special Notes -->
          <div style="background:#fefce8;border:1px solid #fde68a;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
            <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#92400e;">📝 Special Notes from Agent</p>
            <p style="margin:0;color:#374151;font-size:14px;line-height:1.6;white-space:pre-wrap;">${data.specialNotes}</p>
          </div>` : ''}

          <p style="margin:24px 0 0;color:#9ca3af;font-size:12px;">This staging request was submitted via ${appName}. Please reply to this email to respond to the agent.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function POST(req: NextRequest) {
  const uid = await getUid(req);
  if (!uid) return jsonError(401, 'Unauthorized');

  try {
    const body = await req.json();
    const {
      stagerId,
      // Consultation
      consultationDate,
      consultationTime,
      paymentMethod,
      // Property
      propertyAddress,
      currentlyOnMarket,
      targetedMarketDate,
      listPrice,
      sqft,
      homeStyle,
      occupancy,
      reasonForSelling,
      specialNotes,
      // Seller
      sellerName,
      sellerPhone,
      sellerEmail,
      // Agent (passed from frontend)
      agentName,
      agentPhone,
      agentEmail,
      // Optional transaction link
      transactionId,
    } = body;

    if (!stagerId) return jsonError(400, 'stagerId is required');

    // Look up the stager — check vendors collection first (new), fall back to stagers (legacy)
    let stager: Record<string, any> | null = null;
    const vendorDoc = await adminDb.collection('vendors').doc(stagerId).get();
    if (vendorDoc.exists) {
      stager = vendorDoc.data()!;
    } else {
      const stagerDoc = await adminDb.collection('stagers').doc(stagerId).get();
      if (stagerDoc.exists) stager = stagerDoc.data()!;
    }
    if (!stager) return jsonError(404, 'Stager not found');

    if (!stager.email) return jsonError(400, 'Stager has no email address on file');

    // Save staging request to Firestore
    const requestRef = await adminDb.collection('stagingRequests').add({
      uid,
      stagerId,
      stagerName: stager.name,
      stagerEmail: stager.email,
      consultationDate: consultationDate || null,
      consultationTime: consultationTime || null,
      paymentMethod: paymentMethod || null,
      propertyAddress: propertyAddress || null,
      currentlyOnMarket: currentlyOnMarket || null,
      targetedMarketDate: targetedMarketDate || null,
      listPrice: listPrice || null,
      sqft: sqft || null,
      homeStyle: homeStyle || null,
      occupancy: occupancy || null,
      reasonForSelling: reasonForSelling || null,
      specialNotes: specialNotes || null,
      sellerName: sellerName || null,
      sellerPhone: sellerPhone || null,
      sellerEmail: sellerEmail || null,
      agentName: agentName || null,
      agentPhone: agentPhone || null,
      agentEmail: agentEmail || null,
      transactionId: transactionId || null,
      status: 'sent',
      createdAt: new Date().toISOString(),
    });

    // Send email via Resend
    const resendApiKey = process.env.RESEND_API_KEY;
    const fromDomain = process.env.RESEND_FROM_DOMAIN || 'smartbrokerusa.com';

    if (!resendApiKey) {
      console.warn('[staging-request] RESEND_API_KEY not configured — email not sent');
      return NextResponse.json({ ok: true, id: requestRef.id, emailSent: false, warning: 'Email not sent — Resend not configured' });
    }

    const emailHtml = buildStagingEmailHtml({
      agentName: agentName || 'Agent',
      agentPhone: agentPhone || '',
      agentEmail: agentEmail || '',
      sellerName: sellerName || '',
      sellerPhone: sellerPhone || '',
      sellerEmail: sellerEmail || '',
      propertyAddress: propertyAddress || '',
      consultationDate: consultationDate || '',
      consultationTime: consultationTime || '',
      paymentMethod: paymentMethod || '',
      currentlyOnMarket: currentlyOnMarket || '',
      targetedMarketDate: targetedMarketDate || '',
      listPrice: listPrice ? `$${Number(listPrice).toLocaleString()}` : '',
      sqft: sqft ? String(sqft) : '',
      homeStyle: homeStyle || '',
      occupancy: occupancy || '',
      reasonForSelling: reasonForSelling || '',
      specialNotes: specialNotes || '',
      stagerName: stager.name,
    });

    try {
      const { Resend } = await import('resend');
      const resend = new Resend(resendApiKey);

      // Send from agent's email (reply-to also set to agent)
      const fromEmail = agentEmail
        ? `${agentName || 'Agent'} via Smart Broker USA <staging@${fromDomain}>`
        : `Smart Broker USA <staging@${fromDomain}>`;

      const { error: sendError } = await resend.emails.send({
        from: fromEmail,
        to: [stager.email],
        replyTo: agentEmail || undefined,
        subject: `Staging Request — ${propertyAddress || 'New Property'}`,
        html: emailHtml,
      });

      if (sendError) {
        console.error('[staging-request] Resend error:', sendError);
        return NextResponse.json({ ok: true, id: requestRef.id, emailSent: false, emailError: (sendError as any).message });
      }

      // Update Firestore record with email sent status
      await requestRef.update({ emailSentAt: new Date().toISOString() });

      return NextResponse.json({ ok: true, id: requestRef.id, emailSent: true });
    } catch (emailErr: any) {
      console.error('[staging-request] Email send failed:', emailErr);
      return NextResponse.json({ ok: true, id: requestRef.id, emailSent: false, emailError: emailErr.message });
    }
  } catch (err: any) {
    console.error('[staging-request] Error:', err);
    return jsonError(500, err.message);
  }
}
