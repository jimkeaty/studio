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
          ? `/dashboard/transactions/${request.transactionId}`
          : '/dashboard/transactions',
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

    return NextResponse.json({
      ok: true,
      message: 'Your availability has been confirmed. The agent will be notified.',
      vendorName: request.vendorName,
      inspectionType,
      confirmedDate,
      confirmedTime,
      propertyAddress: request.propertyAddress,
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
      return NextResponse.json({ ok: true, status: 'confirmed', alreadyConfirmed: true });
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
