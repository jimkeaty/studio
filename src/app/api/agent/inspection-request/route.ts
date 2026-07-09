/**
 * POST /api/agent/inspection-request
 *
 * Creates an inspection request record in Firestore and sends email(s) to
 * the selected inspector(s).  Supports two modes:
 *   - sendMode: 'selected'  → email only the chosen vendor
 *   - sendMode: 'all'       → email all active vendors of that category
 *
 * Each email contains a secure one-time scheduling link:
 *   /inspect/[token]
 *
 * The Firestore document is written to:
 *   inspectionRequests/{requestId}
 *
 * Body shape:
 * {
 *   transactionId: string,
 *   transactionType: 'listing' | 'buyer',
 *   inspectionCategory: string,   // e.g. 'inspector_general'
 *   vendorId?: string,            // required when sendMode === 'selected'
 *   sendMode: 'selected' | 'all',
 *   preferredDate: string,        // ISO date e.g. '2025-07-09'
 *   preferredTimeStart: string,   // e.g. '13:00'
 *   preferredTimeEnd: string,     // e.g. '17:00'
 *   fallbackDateStart: string,    // ISO date
 *   fallbackDateEnd: string,      // ISO date
 *   propertyAddress: string,
 *   clientName: string,
 *   clientPhone: string,
 *   clientEmail: string,
 *   agentName: string,
 *   agentPhone: string,
 *   agentEmail: string,
 *   sqft?: string,
 *   accessNotes?: string,
 * }
 */
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import crypto from 'crypto';

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

function formatTime(t: string) {
  // '13:00' → '1:00 PM'
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`;
}

function formatDate(d: string) {
  // '2025-07-09' → 'July 9, 2025'
  const dt = new Date(d + 'T12:00:00');
  return dt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function getCategoryLabel(cat: string) {
  const map: Record<string, string> = {
    inspector_general:    'General Home Inspection',
    inspector_termite:    'Termite Inspection',
    inspector_foundation: 'Foundation Inspection',
    inspector_sewer:      'Sewer Inspection',
    inspector_roof:       'Roof Inspection',
    inspector_hvac:       'HVAC Inspection',
    inspector_pool:       'Pool Inspection',
    inspector_water_well: 'Water Well Inspection',
    inspector_survey:     'Survey',
    inspector_elevation:  'Elevation Certificate',
    inspector_stucco:     'Stucco Inspection',
  };
  return map[cat] ?? cat;
}

function buildInspectorEmail(opts: {
  appName: string;
  appUrl: string;
  inspectorName: string;
  inspectionType: string;
  propertyAddress: string;
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  agentName: string;
  agentPhone: string;
  agentEmail: string;
  sqft: string;
  accessNotes: string;
  preferredDate: string;
  preferredTimeStart: string;
  preferredTimeEnd: string;
  fallbackDateStart: string;
  fallbackDateEnd: string;
  scheduleLink: string;
  isBlast: boolean;
}): string {
  const accent = '#1e40af';
  const {
    appName, inspectorName, inspectionType, propertyAddress,
    clientName, clientPhone, clientEmail,
    agentName, agentPhone, agentEmail,
    sqft, accessNotes,
    preferredDate, preferredTimeStart, preferredTimeEnd,
    fallbackDateStart, fallbackDateEnd,
    scheduleLink, isBlast,
  } = opts;

  const blastNote = isBlast
    ? `<p style="margin:0 0 16px;padding:12px 16px;background:#fef9c3;border-left:4px solid #eab308;color:#713f12;font-size:14px;border-radius:4px;">
        <strong>Note:</strong> This request was sent to multiple inspectors. The first to confirm will be assigned.
       </p>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:580px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1);">
        <tr><td style="background:${accent};padding:24px 32px;">
          <p style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">${appName}</p>
          <span style="display:inline-block;margin-top:8px;background:rgba(255,255,255,.2);color:#fff;font-size:11px;font-weight:600;padding:3px 12px;border-radius:999px;letter-spacing:.5px;">Inspection Request</span>
        </td></tr>
        <tr><td style="padding:32px;">
          <p style="margin:0 0 4px;color:#111827;font-size:22px;font-weight:700;">${inspectionType}</p>
          <p style="margin:0 0 24px;color:#6b7280;font-size:15px;">Hi ${inspectorName}, you have a new inspection request.</p>
          ${blastNote}

          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
            <tr style="background:#f9fafb;"><td colspan="2" style="padding:10px 16px;font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;">Property Details</td></tr>
            <tr><td style="padding:10px 16px;font-size:14px;color:#6b7280;width:40%;border-top:1px solid #f3f4f6;">Address</td><td style="padding:10px 16px;font-size:14px;color:#111827;font-weight:600;border-top:1px solid #f3f4f6;">${propertyAddress}</td></tr>
            ${sqft ? `<tr><td style="padding:10px 16px;font-size:14px;color:#6b7280;border-top:1px solid #f3f4f6;">Sq Ft</td><td style="padding:10px 16px;font-size:14px;color:#111827;border-top:1px solid #f3f4f6;">${sqft}</td></tr>` : ''}
            ${accessNotes ? `<tr><td style="padding:10px 16px;font-size:14px;color:#6b7280;border-top:1px solid #f3f4f6;">Access Notes</td><td style="padding:10px 16px;font-size:14px;color:#111827;border-top:1px solid #f3f4f6;">${accessNotes}</td></tr>` : ''}
          </table>

          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
            <tr style="background:#f9fafb;"><td colspan="2" style="padding:10px 16px;font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;">Requested Schedule</td></tr>
            <tr><td style="padding:10px 16px;font-size:14px;color:#6b7280;width:40%;border-top:1px solid #f3f4f6;">Preferred Date</td><td style="padding:10px 16px;font-size:14px;color:#111827;font-weight:600;border-top:1px solid #f3f4f6;">${formatDate(preferredDate)}</td></tr>
            <tr><td style="padding:10px 16px;font-size:14px;color:#6b7280;border-top:1px solid #f3f4f6;">Preferred Time</td><td style="padding:10px 16px;font-size:14px;color:#111827;font-weight:600;border-top:1px solid #f3f4f6;">${formatTime(preferredTimeStart)} – ${formatTime(preferredTimeEnd)}</td></tr>
            <tr><td style="padding:10px 16px;font-size:14px;color:#6b7280;border-top:1px solid #f3f4f6;">Available Range</td><td style="padding:10px 16px;font-size:14px;color:#111827;border-top:1px solid #f3f4f6;">${formatDate(fallbackDateStart)} – ${formatDate(fallbackDateEnd)}</td></tr>
          </table>

          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
            <tr style="background:#f9fafb;"><td colspan="2" style="padding:10px 16px;font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;">Contact Information</td></tr>
            <tr><td style="padding:10px 16px;font-size:14px;color:#6b7280;width:40%;border-top:1px solid #f3f4f6;">Client</td><td style="padding:10px 16px;font-size:14px;color:#111827;border-top:1px solid #f3f4f6;">${clientName}${clientPhone ? ` · ${clientPhone}` : ''}${clientEmail ? ` · ${clientEmail}` : ''}</td></tr>
            <tr><td style="padding:10px 16px;font-size:14px;color:#6b7280;border-top:1px solid #f3f4f6;">Agent</td><td style="padding:10px 16px;font-size:14px;color:#111827;border-top:1px solid #f3f4f6;">${agentName}${agentPhone ? ` · ${agentPhone}` : ''}${agentEmail ? ` · ${agentEmail}` : ''}</td></tr>
          </table>

          <div style="text-align:center;margin-bottom:8px;">
            <a href="${scheduleLink}" style="display:inline-block;background:${accent};color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;padding:16px 40px;border-radius:10px;">
              Confirm Your Availability →
            </a>
          </div>
          <p style="margin:16px 0 0;color:#9ca3af;font-size:12px;text-align:center;">This link is unique to you and expires in 7 days. Do not forward it.</p>
        </td></tr>
        <tr><td style="padding:16px 32px;border-top:1px solid #f3f4f6;">
          <p style="margin:0;color:#9ca3af;font-size:12px;">Sent by ${agentName} via ${appName}. Questions? Contact the agent directly at ${agentEmail}.</p>
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
      transactionId,
      transactionType,
      inspectionCategory,
      vendorId,
      sendMode,
      preferredDate,
      preferredTimeStart,
      preferredTimeEnd,
      fallbackDateStart,
      fallbackDateEnd,
      propertyAddress,
      clientName,
      clientPhone,
      clientEmail,
      agentName,
      agentPhone,
      agentEmail,
      sqft,
      accessNotes,
    } = body;

    if (!inspectionCategory) return jsonError(400, 'inspectionCategory is required');
    if (!sendMode) return jsonError(400, 'sendMode is required');
    if (!preferredDate) return jsonError(400, 'preferredDate is required');
    if (sendMode === 'selected' && !vendorId) return jsonError(400, 'vendorId is required for selected mode');

    // Resolve vendor(s) to email
    let vendors: Array<{ id: string; name: string; email: string }> = [];
    if (sendMode === 'selected') {
      const vDoc = await adminDb.collection('vendors').doc(vendorId).get();
      if (!vDoc.exists) return jsonError(404, 'Vendor not found');
      const vd = vDoc.data()!;
      if (!vd.email) return jsonError(400, 'Selected vendor has no email address');
      vendors = [{ id: vDoc.id, name: vd.name, email: vd.email }];
    } else {
      // blast all active vendors in that category
      const snap = await adminDb.collection('vendors')
        .where('category', '==', inspectionCategory)
        .where('active', '==', true)
        .get();
      vendors = snap.docs
        .filter(d => d.data().email)
        .map(d => ({ id: d.id, name: d.data().name, email: d.data().email }));
      if (vendors.length === 0) return jsonError(404, 'No active vendors with email found for this category');
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://smart-broker-usa-next--smart-broker-usa.us-central1.hosted.app';
    const appName = process.env.NEXT_PUBLIC_APP_NAME || 'Smart Broker USA';
    const resendApiKey = process.env.RESEND_API_KEY;
    const fromDomain = process.env.RESEND_FROM_DOMAIN || 'smartbrokerusa.com';
    const fromEmail = `${appName} <inspections@${fromDomain}>`;
    const isBlast = sendMode === 'all';

    // Create one request document per vendor
    const requestIds: string[] = [];
    const emailResults: Array<{ vendorId: string; vendorName: string; emailSent: boolean }> = [];

    for (const vendor of vendors) {
      // Generate a secure token for the scheduling link
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days

      const requestRef = await adminDb.collection('inspectionRequests').add({
        token,
        transactionId: transactionId || null,
        transactionType: transactionType || null,
        inspectionCategory,
        vendorId: vendor.id,
        vendorName: vendor.name,
        vendorEmail: vendor.email,
        sendMode,
        isBlast,
        status: 'pending',  // pending | confirmed | expired | taken
        preferredDate,
        preferredTimeStart,
        preferredTimeEnd,
        fallbackDateStart,
        fallbackDateEnd,
        propertyAddress,
        clientName: clientName || null,
        clientPhone: clientPhone || null,
        clientEmail: clientEmail || null,
        agentUid: uid,
        agentName: agentName || null,
        agentPhone: agentPhone || null,
        agentEmail: agentEmail || null,
        sqft: sqft || null,
        accessNotes: accessNotes || null,
        expiresAt,
        createdAt: new Date().toISOString(),
      });

      requestIds.push(requestRef.id);

      // Send email
      let emailSent = false;
      if (resendApiKey && vendor.email) {
        try {
          const { Resend } = await import('resend');
          const resend = new Resend(resendApiKey);
          const scheduleLink = `${appUrl}/inspect/${token}`;
          const html = buildInspectorEmail({
            appName,
            appUrl,
            inspectorName: vendor.name,
            inspectionType: getCategoryLabel(inspectionCategory),
            propertyAddress,
            clientName: clientName || 'Client',
            clientPhone: clientPhone || '',
            clientEmail: clientEmail || '',
            agentName: agentName || 'Your Agent',
            agentPhone: agentPhone || '',
            agentEmail: agentEmail || '',
            sqft: sqft || '',
            accessNotes: accessNotes || '',
            preferredDate,
            preferredTimeStart,
            preferredTimeEnd,
            fallbackDateStart,
            fallbackDateEnd,
            scheduleLink,
            isBlast,
          });
          const { error: sendError } = await resend.emails.send({
            from: fromEmail,
            to: [vendor.email],
            subject: `Inspection Request — ${getCategoryLabel(inspectionCategory)} at ${propertyAddress}`,
            html,
          });
          if (!sendError) emailSent = true;
          else console.error('[inspection-request] Resend error:', sendError);
        } catch (err) {
          console.error('[inspection-request] Email error:', err);
        }
      }

      emailResults.push({ vendorId: vendor.id, vendorName: vendor.name, emailSent });
    }

    return NextResponse.json({
      ok: true,
      requestIds,
      emailResults,
      vendorCount: vendors.length,
    });
  } catch (err: any) {
    console.error('[inspection-request] Error:', err);
    return jsonError(500, err.message);
  }
}
