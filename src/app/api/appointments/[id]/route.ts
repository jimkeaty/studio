// src/app/api/appointments/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth, admin } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';

import { FieldValue } from 'firebase-admin/firestore';
import { differenceInDays } from 'date-fns';

const EDIT_WINDOW_DAYS = 45;

function jsonError(status: number, error: string, code?: string) {
  return NextResponse.json({ ok: false, error, code: code ?? `http_${status}` }, { status });
}

async function requireUser(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw { status: 401, message: 'Missing Authorization bearer token', code: 'auth/missing-bearer' };
  }
  const token = authHeader.slice('Bearer '.length);
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    const userSnap = await adminDb.collection('users').doc(decoded.uid).get();
    const role = userSnap.exists ? userSnap.data()?.role : 'agent';
    return { uid: decoded.uid, role };
  } catch (err: any) {
    throw { status: 401, message: 'Invalid or expired token', code: 'auth/invalid-token' };
  }
}

function isDateEditable(dateStr: string, role: string): boolean {
    if (role === 'admin') return true;
    const date = new Date(dateStr + "T00:00:00");
    const today = new Date();
    const diff = differenceInDays(
        new Date(today.getFullYear(), today.getMonth(), today.getDate()),
        new Date(date.getFullYear(), date.getMonth(), date.getDate())
    );
    return diff <= EDIT_WINDOW_DAYS;
}

/**
 * Build the full set of agentId values for a given uid.
 * Appointments may be stored under the Firebase UID, the Firestore profile doc ID,
 * or the agentId slug — this resolves all three so permission checks work regardless
 * of which ID was used when the appointment was created.
 */
async function buildAgentIdSet(uid: string): Promise<Set<string>> {
  const agentIdSet = new Set([uid]);
  try {
    const profileByIdSnap = await adminDb.collection('agentProfiles').doc(uid).get();
    if (profileByIdSnap.exists) {
      const d = profileByIdSnap.data();
      if (d?.agentId) agentIdSet.add(String(d.agentId));
      if (d?.firebaseUid) agentIdSet.add(String(d.firebaseUid));
    } else {
      // uid might be a slug
      const profileBySlugSnap = await adminDb.collection('agentProfiles')
        .where('agentId', '==', uid).limit(1).get();
      if (!profileBySlugSnap.empty) {
        agentIdSet.add(profileBySlugSnap.docs[0].id);
        const d = profileBySlugSnap.docs[0].data();
        if (d?.firebaseUid) agentIdSet.add(String(d.firebaseUid));
      }
      // uid might be a Firebase UID stored in the firebaseUid field
      const profileByFbUidSnap = await adminDb.collection('agentProfiles')
        .where('firebaseUid', '==', uid).limit(1).get();
      if (!profileByFbUidSnap.empty) {
        agentIdSet.add(profileByFbUidSnap.docs[0].id);
        const d = profileByFbUidSnap.docs[0].data();
        if (d?.agentId) agentIdSet.add(String(d.agentId));
      }
    }
  } catch { /* ignore profile lookup errors */ }
  return agentIdSet;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { uid: callerUid, role } = await requireUser(req);
    const { id } = await params;
    const body = await req.json();

    const callerIsAdmin = await isAdminLike(callerUid);
    const effectiveRole = callerIsAdmin ? 'admin' : role;

    // Admin can patch on behalf of any agent via body.viewAs
    const viewAs = body?.viewAs;
    const uid = (callerIsAdmin && viewAs) ? viewAs : callerUid;

    const docRef = adminDb.collection('appointments').doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return jsonError(404, 'Appointment not found');
    }

    const data = docSnap.data()!;

    // Build full agentId set so the check works regardless of which ID was stored
    if (!callerIsAdmin) {
      const agentIdSet = await buildAgentIdSet(callerUid);
      if (!agentIdSet.has(data.agentId)) {
        return jsonError(403, 'You do not have permission to edit this appointment');
      }
    } else if (uid !== callerUid) {
      // Admin impersonating — verify the target agent owns this appointment
      const agentIdSet = await buildAgentIdSet(uid);
      if (!agentIdSet.has(data.agentId)) {
        return jsonError(403, 'You do not have permission to edit this appointment');
      }
    }

    // Check edit window on the original date
    if (!isDateEditable(data.date, effectiveRole)) {
        return jsonError(403, 'Edits are locked after 45 days.', 'edit_window_expired');
    }
    // Also check if the date is being changed to a locked date
    if (body.date && !isDateEditable(body.date, effectiveRole)) {
        return jsonError(403, 'Cannot move appointment to a date that is locked for edits.', 'edit_window_expired');
    }

    // Strip community-board-only fields before writing to appointment doc
    const { postToCommunity, communityArea, agentNameOverride, agentPhoneOverride, ...appointmentFields } = body;
    const dataToUpdate = { ...appointmentFields, updatedAt: FieldValue.serverTimestamp() };
    await docRef.update(dataToUpdate);

    // ── Community board auto-post on edit ───────────────────────────────────────────
    if (postToCommunity) {
      try {
        const effectiveUid = uid;
        let agentName = agentNameOverride as string | undefined;
        let agentPhone = agentPhoneOverride as string | undefined;
        let agentProfileId = effectiveUid;

        if (!agentName || !agentPhone) {
          const profileSnap = await adminDb.collection('agentProfiles').doc(effectiveUid).get();
          if (profileSnap.exists) {
            const pd = profileSnap.data()!;
            agentName = agentName || [pd.firstName, pd.lastName].filter(Boolean).join(' ') || pd.displayName || pd.agentId || effectiveUid;
            agentPhone = agentPhone || pd.phone || pd.phoneNumber || '';
            agentProfileId = profileSnap.id;
          } else {
            const byFbUid = await adminDb.collection('agentProfiles').where('firebaseUid', '==', effectiveUid).limit(1).get();
            if (!byFbUid.empty) {
              const pd = byFbUid.docs[0].data();
              agentName = agentName || [pd.firstName, pd.lastName].filter(Boolean).join(' ') || pd.displayName || effectiveUid;
              agentPhone = agentPhone || pd.phone || pd.phoneNumber || '';
              agentProfileId = byFbUid.docs[0].id;
            }
          }
        }

        // Use updated fields where available, fall back to stored doc fields
        const category = (body.category || data.category) as string;
        const listingAddress = body.listingAddress ?? data.listingAddress;
        const notes = body.notes ?? data.notes;
        const priceRangeLow = body.priceRangeLow ?? data.priceRangeLow;
        const priceRangeHigh = body.priceRangeHigh ?? data.priceRangeHigh;
        const now = FieldValue.serverTimestamp();

        if (category === 'buyer') {
          const area = listingAddress || notes || 'Area TBD';
          await adminDb.collection('buyerNeeds').add({
            agentName: (agentName || effectiveUid).trim(),
            agentPhone: (agentPhone || '').trim(),
            agentProfileId,
            createdByUid: callerUid,
            area,
            minPrice: priceRangeLow ? Number(priceRangeLow) : null,
            maxPrice: priceRangeHigh ? Number(priceRangeHigh) : null,
            beds: null,
            baths: null,
            notes: notes || null,
            sourceAppointmentId: id,
            active: true,
            lastConfirmedAt: now,
            createdAt: now,
            updatedAt: now,
          });
        } else if (category === 'seller') {
          const area = communityArea || notes || 'Area TBD';
          await adminDb.collection('comingSoon').add({
            agentName: (agentName || effectiveUid).trim(),
            agentPhone: (agentPhone || '').trim(),
            agentProfileId,
            createdByUid: callerUid,
            address: null,
            area,
            price: priceRangeLow ? Number(priceRangeLow) : (priceRangeHigh ? Number(priceRangeHigh) : null),
            beds: null,
            baths: null,
            notes: notes || null,
            expectedDate: null,
            sourceAppointmentId: id,
            active: true,
            lastConfirmedAt: now,
            createdAt: now,
            updatedAt: now,
          });
        }
      } catch (communityErr) {
        console.error('[API/appointments/[id]] community board post failed:', communityErr);
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return jsonError(err.status ?? 500, err.message ?? 'Failed to update appointment');
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { uid: callerUid, role } = await requireUser(req);
    const { id } = await params;

    const isAdmin = await isAdminLike(callerUid);
    const effectiveRole = isAdmin ? 'admin' : role;

    // Admin can delete on behalf of any agent via ?viewAs= query param
    const viewAs = new URL(req.url).searchParams.get('viewAs');
    const uid = (isAdmin && viewAs) ? viewAs : callerUid;

    const docRef = adminDb.collection('appointments').doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return jsonError(404, 'Appointment not found');
    }

    const data = docSnap.data()!;

    // Admin can delete any appointment; agents can only delete their own.
    // Build a full set of agentId values (Firebase UID, profile doc ID, slug)
    // so the check works regardless of which ID was stored on the appointment.
    if (!isAdmin) {
      const agentIdSet = await buildAgentIdSet(callerUid);
      if (!agentIdSet.has(data.agentId)) {
        return jsonError(403, 'You do not have permission to delete this appointment');
      }
    } else if (uid !== callerUid) {
      // Admin impersonating — verify the target agent owns this appointment
      const agentIdSet = await buildAgentIdSet(uid);
      if (!agentIdSet.has(data.agentId)) {
        return jsonError(403, 'You do not have permission to delete this appointment');
      }
    }

    if (!isDateEditable(data.date, effectiveRole)) {
        return jsonError(403, 'Deletions are locked after 45 days.', 'edit_window_expired');
    }

    await docRef.delete();

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return jsonError(err.status ?? 500, err.message ?? 'Failed to delete appointment');
  }
}
