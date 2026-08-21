/**
 * POST /api/agent/inspection-request/confirm
 *
 * Called by the public inspector scheduling page (/inspect/[token]).
 * No authentication required — uses the one-time token.
 *
 * Body: { token: string, confirmedDate: string, confirmedTime: string }
 *
 * On success:
 *  1. Marks the request as 'confirmed'
 *  2. Marks any other pending requests for the same transaction+category as 'taken'
 *  3. Sends push/email/SMS notification to the agent (per their prefs)
 *  4. If agent works with TC, pushes to TC queue notification
 */
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { sendNotification } from '@/lib/notifications/sendNotification';

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

function formatTime(t: string) {
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`;
}

function formatDate(d: string) {
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

function buildGoogleCalendarUrl(opts: {
  inspectionType: string;
  propertyAddress: string;
  confirmedDate: string;
  confirmedTime: string;
  agentName?: string;
}) {
  const [year, month, day] = opts.confirmedDate.split('-').map(Number);
  const [hour, minute] = opts.confirmedTime.split(':').map(Number);
  if (![year, month, day, hour, minute].every(Number.isFinite)) return '';

  // Keep the selected appointment as a Central Time wall-clock event, regardless
  // of the inspector's device timezone. Two hours is the editable default length.
  const start = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  const toGoogleDate = (date: Date) => [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('') + `T${String(date.getUTCHours()).padStart(2, '0')}${String(date.getUTCMinutes()).padStart(2, '0')}00`;

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `${opts.inspectionType} at ${opts.propertyAddress}`,
    dates: `${toGoogleDate(start)}/${toGoogleDate(end)}`,
    details: `Inspection scheduled with ${opts.agentName || 'the requesting agent'}.`,
    location: opts.propertyAddress,
    ctz: 'America/Chicago',
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function buildInspectorConfirmationEmail(opts: {
  appName: string;
  inspectorName: string;
  inspectionType: string;
  propertyAddress: string;
  confirmedDate: string;
  confirmedTime: string;
  agentName?: string;
  agentEmail?: string;
  scheduleLink: string;
  calendarLink: string;
}) {
  const accent = '#1e40af';
  const {
    appName, inspectorName, inspectionType, propertyAddress, confirmedDate, confirmedTime,
    agentName, agentEmail, scheduleLink, calendarLink,
  } = opts;
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;"><tr><td align="center">
    <table width="100%" style="max-width:580px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1);">
      <tr><td style="background:${accent};padding:24px 32px;"><p style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">${appName}</p><span style="display:inline-block;margin-top:8px;background:rgba(255,255,255,.2);color:#fff;font-size:11px;font-weight:600;padding:3px 12px;border-radius:999px;letter-spacing:.5px;">Inspection Confirmed</span></td></tr>
      <tr><td style="padding:32px;">
        <p style="margin:0 0 8px;color:#111827;font-size:22px;font-weight:700;">Your inspection is scheduled</p>
        <p style="margin:0 0 24px;color:#4b5563;font-size:15px;">Hi ${inspectorName}, thank you for confirming. Here are your appointment details.</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:26px;border:1px solid #bbf7d0;border-radius:8px;overflow:hidden;">
          <tr style="background:#f0fdf4;"><td colspan="2" style="padding:10px 16px;font-size:12px;font-weight:700;color:#166534;text-transform:uppercase;letter-spacing:.5px;">Confirmed Appointment</td></tr>
          <tr><td style="padding:10px 16px;font-size:14px;color:#6b7280;width:40%;border-top:1px solid #dcfce7;">Inspection</td><td style="padding:10px 16px;font-size:14px;color:#111827;font-weight:600;border-top:1px solid #dcfce7;">${inspectionType}</td></tr>
          <tr><td style="padding:10px 16px;font-size:14px;color:#6b7280;border-top:1px solid #dcfce7;">Date</td><td style="padding:10px 16px;font-size:14px;color:#111827;font-weight:600;border-top:1px solid #dcfce7;">${formatDate(confirmedDate)}</td></tr>
          <tr><td style="padding:10px 16px;font-size:14px;color:#6b7280;border-top:1px solid #dcfce7;">Time</td><td style="padding:10px 16px;font-size:14px;color:#111827;font-weight:600;border-top:1px solid #dcfce7;">${formatTime(confirmedTime)} Central Time</td></tr>
          <tr><td style="padding:10px 16px;font-size:14px;color:#6b7280;border-top:1px solid #dcfce7;">Property</td><td style="padding:10px 16px;font-size:14px;color:#111827;font-weight:600;border-top:1px solid #dcfce7;">${propertyAddress}</td></tr>
        </table>
        <div style="text-align:center;margin-bottom:12px;"><a href="${calendarLink}" style="display:inline-block;background:${accent};color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:14px 26px;border-radius:9px;">Add to Calendar</a></div>
        <div style="text-align:center;"><a href="${scheduleLink}" style="color:${accent};font-size:14px;font-weight:600;text-decoration:none;">View Appointment Details</a></div>
      </td></tr>
      <tr><td style="padding:16px 32px;border-top:1px solid #f3f4f6;"><p style="margin:0;color:#6b7280;font-size:12px;">Questions? Contact ${agentName || 'the requesting agent'}${agentEmail ? ` at ${agentEmail}` : ''}.</p></td></tr>
    </table>
  </td></tr></table>
</body>
</html>`;
}

function normalizePhone(value: unknown) {
  const raw = String(value || '').trim();
  const digits = raw.replace(/\D/g, '');
  if (raw.startsWith('+')) return raw;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return '';
}

async function sendInspectorConfirmationReceipt(request: Record<string, any>, opts: {
  inspectionType: string;
  confirmedDate: string;
  confirmedTime: string;
}) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://smart-broker-usa-next--smart-broker-usa.us-central1.hosted.app';
  const appName = process.env.NEXT_PUBLIC_APP_NAME || 'Keaty Real Estate';
  const scheduleLink = `${appUrl}/inspect/${request.token}`;
  const calendarLink = buildGoogleCalendarUrl({
    inspectionType: opts.inspectionType,
    propertyAddress: request.propertyAddress || 'the property',
    confirmedDate: opts.confirmedDate,
    confirmedTime: opts.confirmedTime,
    agentName: request.agentName,
  });
  let inspectorEmail = typeof request.vendorEmail === 'string' ? request.vendorEmail : '';
  let inspectorPhone = typeof request.vendorPhone === 'string' ? request.vendorPhone : '';

  // Older request records did not keep the vendor phone. Recover it from the
  // vendor directory so existing links receive the same confirmation receipt.
  if ((!inspectorEmail || !inspectorPhone) && request.vendorId) {
    try {
      const vendor = await adminDb.collection('vendors').doc(request.vendorId).get();
      const vendorData = vendor.data();
      inspectorEmail ||= vendorData?.email || '';
      inspectorPhone ||= vendorData?.phone || '';
    } catch (err) {
      console.error('[inspection-confirm] Could not resolve inspector contact:', err);
    }
  }

  let emailSent = false;
  const resendApiKey = process.env.RESEND_API_KEY;
  if (resendApiKey && inspectorEmail) {
    try {
      const { Resend } = await import('resend');
      const resend = new Resend(resendApiKey);
      const fromDomain = process.env.RESEND_FROM_DOMAIN || 'smartbrokerusa.com';
      const fromEmail = `${appName} <inspections@${fromDomain}>`;
      const replyTo = typeof request.agentEmail === 'string' && /^\S+@\S+\.\S+$/.test(request.agentEmail.trim())
        ? request.agentEmail.trim()
        : undefined;
      const { error } = await resend.emails.send({
        from: fromEmail,
        to: [inspectorEmail],
        subject: `Inspection Confirmed — ${opts.inspectionType} at ${request.propertyAddress || 'the property'}`,
        html: buildInspectorConfirmationEmail({
          appName,
          inspectorName: request.vendorName || 'Inspector',
          inspectionType: opts.inspectionType,
          propertyAddress: request.propertyAddress || 'the property',
          confirmedDate: opts.confirmedDate,
          confirmedTime: opts.confirmedTime,
          agentName: request.agentName,
          agentEmail: request.agentEmail,
          scheduleLink,
          calendarLink,
        }),
        ...(replyTo ? { replyTo } : {}),
      });
      emailSent = !error;
      if (error) console.error('[inspection-confirm] Inspector confirmation email error:', error);
    } catch (err) {
      console.error('[inspection-confirm] Inspector confirmation email error:', err);
    }
  }

  let smsSent = false;
  const toNumber = normalizePhone(inspectorPhone);
  if (toNumber) {
    try {
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      const twilioSettings = await adminDb.collection('settings').doc('twilio').get();
      const fromNumber = twilioSettings.data()?.fromNumber || process.env.TWILIO_FROM_NUMBER;
      if (accountSid && authToken && fromNumber) {
        const twilio = (await import('twilio')).default;
        const client = twilio(accountSid, authToken);
        await client.messages.create({
          from: fromNumber,
          to: toNumber,
          body: `${appName}: Your ${opts.inspectionType} is confirmed for ${request.propertyAddress || 'the property'} on ${formatDate(opts.confirmedDate)} at ${formatTime(opts.confirmedTime)} Central Time. View your appointment or add it to your calendar: ${scheduleLink}`.slice(0, 1600),
        });
        smsSent = true;
      }
    } catch (err) {
      console.error('[inspection-confirm] Inspector confirmation SMS error:', err);
    }
  }

  return { emailSent, smsSent, calendarLink };
}

export async function POST(req: NextRequest) {
  try {
    const { token, confirmedDate, confirmedTime } = await req.json();

    if (!token) return jsonError(400, 'Token is required');
    if (!confirmedDate) return jsonError(400, 'confirmedDate is required');
    if (!confirmedTime) return jsonError(400, 'confirmedTime is required');

    // Find the request by token
    const snap = await adminDb.collection('inspectionRequests')
      .where('token', '==', token)
      .limit(1)
      .get();

    if (snap.empty) return jsonError(404, 'Invalid or expired link');

    const requestDoc = snap.docs[0];
    const request = requestDoc.data();

    // Check status
    if (request.status === 'confirmed') {
      return NextResponse.json({
        ok: false,
        alreadyConfirmed: true,
        message: 'This inspection has already been scheduled. Thank you!',
      });
    }
    if (request.status === 'taken') {
      return NextResponse.json({
        ok: false,
        taken: true,
        message: 'This inspection has already been assigned to another inspector. Thank you for your response!',
      });
    }
    if (request.status === 'expired') {
      return NextResponse.json({
        ok: false,
        expired: true,
        message: 'This scheduling link has expired.',
      });
    }

    // Check expiry
    if (request.expiresAt && new Date(request.expiresAt) < new Date()) {
      await requestDoc.ref.update({ status: 'expired' });
      return NextResponse.json({
        ok: false,
        expired: true,
        message: 'This scheduling link has expired.',
      });
    }

    // Mark this request as confirmed
    await requestDoc.ref.update({
      status: 'confirmed',
      confirmedDate,
      confirmedTime,
      confirmedAt: new Date().toISOString(),
    });

    // If blast, mark all other pending requests for same transaction+category as 'taken'
    if (request.isBlast && request.transactionId && request.inspectionCategory) {
      const others = await adminDb.collection('inspectionRequests')
        .where('transactionId', '==', request.transactionId)
        .where('inspectionCategory', '==', request.inspectionCategory)
        .where('status', '==', 'pending')
        .get();
      const batch = adminDb.batch();
      others.docs.forEach(d => {
        if (d.id !== requestDoc.id) {
          batch.update(d.ref, { status: 'taken', takenAt: new Date().toISOString() });
        }
      });
      await batch.commit();
    }

    // Also update the transaction's inspection record if transactionId is set
    if (request.transactionId) {
      try {
        const txRef = adminDb.collection('transactions').doc(request.transactionId);
        const txDoc = await txRef.get();
        if (txDoc.exists) {
          const txData = txDoc.data()!;
          const inspections = txData.inspections || {};
          const catKey = request.inspectionCategory;
          inspections[catKey] = {
            ...(inspections[catKey] || {}),
            confirmedDate,
            confirmedTime,
            confirmedVendorId: request.vendorId,
            confirmedVendorName: request.vendorName,
            status: 'confirmed',
          };
          await txRef.update({ inspections, updatedAt: new Date().toISOString() });
        }
      } catch (err) {
        console.error('[inspection-confirm] Failed to update transaction:', err);
      }
    }

    // Notify the agent
    const agentUid = request.agentUid;
    const inspectionType = getCategoryLabel(request.inspectionCategory);
    const confirmedDateStr = formatDate(confirmedDate);
    const confirmedTimeStr = formatTime(confirmedTime);
    const address = request.propertyAddress || 'the property';

    if (agentUid) {
      await sendNotification(adminDb, {
        type: 'inspection_confirmed',
        recipientUids: [agentUid],
        title: `Inspection Confirmed — ${inspectionType}`,
        body: `${request.vendorName} confirmed ${inspectionType} at ${address} on ${confirmedDateStr} at ${confirmedTimeStr}.`,
        url: request.transactionId
          ? `/dashboard/transactions/new?edit=${request.transactionId}`
          : '/dashboard/my-transactions',
        data: {
          transactionId: request.transactionId || '',
          inspectionCategory: request.inspectionCategory,
          vendorName: request.vendorName,
          confirmedDate,
          confirmedTime,
        },
      });

      // If agent works with TC, also notify TC
      if (request.transactionId) {
        try {
          const txDoc = await adminDb.collection('transactions').doc(request.transactionId).get();
          const txData = txDoc.data();
          if (txData?.tcWorking === 'yes' && txData?.tcUid) {
            await sendNotification(adminDb, {
              type: 'inspection_confirmed',
              recipientUids: [txData.tcUid],
              title: `Inspection Confirmed — ${inspectionType}`,
              body: `${request.vendorName} confirmed ${inspectionType} at ${address} on ${confirmedDateStr} at ${confirmedTimeStr}. Agent acceptance may be required.`,
              url: `/dashboard/admin/tc`,
              data: {
                transactionId: request.transactionId,
                inspectionCategory: request.inspectionCategory,
                vendorName: request.vendorName,
                confirmedDate,
                confirmedTime,
              },
            });
          }
        } catch (err) {
          console.error('[inspection-confirm] TC notification error:', err);
        }
      }
    }

    // The public inspector should receive their own dated confirmation receipt,
    // not only an internal notification to the requesting agent and TC.
    const inspectorConfirmation = await sendInspectorConfirmationReceipt(request, {
      inspectionType,
      confirmedDate,
      confirmedTime,
    });

    return NextResponse.json({
      ok: true,
      message: 'Your availability has been confirmed. The agent will be notified.',
      vendorName: request.vendorName,
      inspectionType,
      confirmedDate,
      confirmedTime,
      propertyAddress: request.propertyAddress,
      calendarLink: inspectorConfirmation.calendarLink,
      inspectorConfirmation: {
        emailSent: inspectorConfirmation.emailSent,
        smsSent: inspectorConfirmation.smsSent,
      },
    });
  } catch (err: any) {
    console.error('[inspection-confirm] Error:', err);
    return jsonError(500, err.message);
  }
}

/**
 * GET /api/agent/inspection-request/confirm?token=xxx
 * Returns the request details for the public scheduling page to display.
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!token) return jsonError(400, 'Token is required');

  try {
    const snap = await adminDb.collection('inspectionRequests')
      .where('token', '==', token)
      .limit(1)
      .get();

    if (snap.empty) return jsonError(404, 'Invalid or expired link');

    const request = snap.docs[0].data();

    // Check if already handled
    if (request.status === 'confirmed') {
      return NextResponse.json({
        ok: true,
        status: 'confirmed',
        alreadyConfirmed: true,
        inspectionType: getCategoryLabel(request.inspectionCategory),
        propertyAddress: request.propertyAddress,
        confirmedDate: request.confirmedDate,
        confirmedTime: request.confirmedTime,
        agentName: request.agentName,
        agentPhone: request.agentPhone,
        agentEmail: request.agentEmail,
      });
    }
    if (request.status === 'taken') {
      return NextResponse.json({ ok: true, status: 'taken', taken: true });
    }
    if (request.status === 'expired' || (request.expiresAt && new Date(request.expiresAt) < new Date())) {
      return NextResponse.json({ ok: true, status: 'expired', expired: true });
    }

    return NextResponse.json({
      ok: true,
      status: 'pending',
      inspectionCategory: request.inspectionCategory,
      inspectionType: getCategoryLabel(request.inspectionCategory),
      propertyAddress: request.propertyAddress,
      clientName: request.clientName,
      clientPhone: request.clientPhone,
      clientEmail: request.clientEmail,
      agentName: request.agentName,
      agentPhone: request.agentPhone,
      agentEmail: request.agentEmail,
      sqft: request.sqft,
      accessNotes: request.accessNotes,
      preferredDate: request.preferredDate,
      preferredTimeStart: request.preferredTimeStart,
      preferredTimeEnd: request.preferredTimeEnd,
      fallbackDateStart: request.fallbackDateStart,
      fallbackDateEnd: request.fallbackDateEnd,
      isBlast: request.isBlast,
    });
  } catch (err: any) {
    return jsonError(500, err.message);
  }
}
