// src/app/api/appointments/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';

import { FieldValue, Query } from 'firebase-admin/firestore';
import { differenceInDays, startOfMonth, endOfMonth, format } from 'date-fns';

const EDIT_WINDOW_DAYS = 45;

function serializeFirestore(val: any): any {
  if (val == null) return val;
  if (typeof val?.toDate === 'function') return val.toDate().toISOString();
  if (Array.isArray(val)) return val.map(serializeFirestore);
  if (typeof val === 'object' && val.constructor === Object) {
    const out: any = {};
    for (const [k, v] of Object.entries(val)) {
      out[k] = serializeFirestore(v);
    }
    return out;
  }
  return val;
}

// --- API Helpers ---
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

// --- Route Handlers ---

/**
 * GET /api/appointments?date=YYYY-MM-DD
 * GET /api/appointments?year=YYYY&month=MM          (monthly log view)
 * GET /api/appointments?year=YYYY                   (full-year pipeline view)
 */
export async function GET(req: NextRequest) {
  try {
    const { uid: callerUid } = await requireUser(req);
    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date');
    const year = searchParams.get('year');
    const month = searchParams.get('month');
    const viewAs = searchParams.get('viewAs');
    const uid = (await isAdminLike(callerUid) && viewAs) ? viewAs : callerUid;

    // Resolve all possible agentId values (Firebase UID, slug, profile docId)
    // so bulk-imported appointments stored under any ID are always found
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
    const agentIdList = Array.from(agentIdSet);

    // Build date filter strings
    let startDate: string | null = null;
    let endDate: string | null = null;
    let singleDate: string | null = null;

    if (date) {
      singleDate = date;
    } else if (year && month) {
      startDate = format(startOfMonth(new Date(parseInt(year), parseInt(month) - 1)), 'yyyy-MM-dd');
      endDate = format(endOfMonth(new Date(parseInt(year), parseInt(month) - 1)), 'yyyy-MM-dd');
    } else if (year) {
      startDate = `${year}-01-01`;
      endDate = `${year}-12-31`;
    } else {
      return jsonError(400, 'Missing query params: must provide either `date`, `year`, or `year` and `month`');
    }

    // Query appointments for all resolved agentId values and merge by doc ID
    const apptDocMap = new Map<string, any>();
    await Promise.all(
      agentIdList.map(async (agentIdVal) => {
        try {
          let q: Query = adminDb.collection('appointments').where('agentId', '==', agentIdVal);
          if (singleDate) {
            q = q.where('date', '==', singleDate);
          } else if (startDate && endDate) {
            q = q.where('date', '>=', startDate).where('date', '<=', endDate);
          }
          const snap = await q.get();
          for (const doc of snap.docs) {
            if (!apptDocMap.has(doc.id)) {
              const serialized = serializeFirestore(doc.data());
              if (!serialized.createdAt) serialized.createdAt = new Date(0).toISOString();
              apptDocMap.set(doc.id, { id: doc.id, ...serialized });
            }
          }
        } catch (e) {
          console.warn('[API/appointments] query failed for agentId=' + agentIdVal, e);
        }
      })
    );

    const appointments = Array.from(apptDocMap.values());

    // Sort in memory: by date ascending (upcoming first), then by creation time
    appointments.sort((a, b) => {
        const dateCompare = a.date.localeCompare(b.date);
        if (dateCompare !== 0) return dateCompare;
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

    return NextResponse.json({ ok: true, appointments });
  } catch (err: any) {
    console.error(`[API/appointments] GET failed:`, err);
    return jsonError(err.status ?? 500, err.message ?? 'Failed to load appointments');
  }
}

/**
 * POST /api/appointments
 */
export async function POST(req: NextRequest) {
  try {
    const { uid: callerUid, role } = await requireUser(req);

    let body: any;
    try {
      body = await req.json();
    } catch {
      return jsonError(400, 'Invalid or missing JSON body');
    }

    // Admin can create appointment for any agent via body.viewAs
    const viewAs = body?.viewAs;
    const uid = (await isAdminLike(callerUid) && viewAs) ? viewAs : callerUid;
    const effectiveRole = await isAdminLike(callerUid) ? 'admin' : role;

    if (!body.date || !body.contactName || !body.category) {
      return jsonError(400, 'Missing required fields: date, contactName, category');
    }

    if (!isDateEditable(body.date, effectiveRole)) {
        return jsonError(403, 'Edits are locked after 45 days.', 'edit_window_expired');
    }

    // ── 'both' category: create 2 separate appointments (buyer + seller) ──────
    if (body.category === 'both') {
      const ids: string[] = [];
      // Fetch agent profile once for community posting
      let dualAgentName: string | undefined;
      let dualAgentPhone: string | undefined;
      let dualAgentProfileId = uid;
      if (body.postToCommunity) {
        try {
          const profileSnap = await adminDb.collection('agentProfiles').doc(uid).get();
          if (profileSnap.exists) {
            const pd = profileSnap.data()!;
            dualAgentName = [pd.firstName, pd.lastName].filter(Boolean).join(' ') || pd.displayName || uid;
            dualAgentPhone = pd.phone || pd.phoneNumber || '';
            dualAgentProfileId = profileSnap.id;
          } else {
            const byFbUid = await adminDb.collection('agentProfiles').where('firebaseUid', '==', uid).limit(1).get();
            if (!byFbUid.empty) {
              const pd = byFbUid.docs[0].data();
              dualAgentName = [pd.firstName, pd.lastName].filter(Boolean).join(' ') || pd.displayName || uid;
              dualAgentPhone = pd.phone || pd.phoneNumber || '';
              dualAgentProfileId = byFbUid.docs[0].id;
            }
          }
        } catch { /* non-fatal */ }
      }
      for (const cat of ['buyer', 'seller'] as const) {
        const dualData = {
          agentId: uid,
          createdByUid: callerUid,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          date: body.date,
          contactName: body.contactName,
          category: cat,
          status: body.status ?? 'set',
          pipelineStatus: body.pipelineStatus ?? 'active',
          contactPhone: body.contactPhone ?? null,
          contactEmail: body.contactEmail ?? null,
          listingAddress: body.listingAddress ?? null,
          priceRangeLow: body.priceRangeLow ? Number(body.priceRangeLow) : null,
          priceRangeHigh: body.priceRangeHigh ? Number(body.priceRangeHigh) : null,
          estimatedCommission: body.estimatedCommission ? Number(body.estimatedCommission) : null,
          timing: body.timing ?? null,
          dateSet: body.dateSet ?? null,
          timeSet: body.timeSet ?? null,
          source: body.source ?? 'manual',
          notes: body.notes ?? null,
          scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
          heldAt: body.heldAt ? new Date(body.heldAt) : null,
          dualAppointment: true,
        };
        const ref = await adminDb.collection('appointments').add(dualData);
        ids.push(ref.id);
        // Post to community board if requested
        if (body.postToCommunity) {
          try {
            const now = FieldValue.serverTimestamp();
            if (cat === 'buyer') {
              await adminDb.collection('buyerNeeds').add({
                agentName: (dualAgentName || uid).trim(),
                agentPhone: (dualAgentPhone || '').trim(),
                agentProfileId: dualAgentProfileId,
                createdByUid: callerUid,
                area: body.communityArea || body.notes || 'Area TBD',
                minPrice: body.priceRangeLow ? Number(body.priceRangeLow) : null,
                maxPrice: body.priceRangeHigh ? Number(body.priceRangeHigh) : null,
                beds: null, baths: null,
                notes: body.notes || null,
                sourceAppointmentId: ref.id,
                active: true,
                lastConfirmedAt: now, createdAt: now, updatedAt: now,
              });
            } else {
              await adminDb.collection('comingSoon').add({
                agentName: (dualAgentName || uid).trim(),
                agentPhone: (dualAgentPhone || '').trim(),
                agentProfileId: dualAgentProfileId,
                createdByUid: callerUid,
                address: null, // address intentionally omitted for privacy
                area: body.communityArea || body.notes || 'Area TBD',
                price: body.priceRangeHigh ? Number(body.priceRangeHigh) : (body.priceRangeLow ? Number(body.priceRangeLow) : null),
                beds: null, baths: null,
                notes: body.notes || null,
                expectedDate: null,
                sourceAppointmentId: ref.id,
                active: true,
                lastConfirmedAt: now, createdAt: now, updatedAt: now,
              });
            }
          } catch (communityErr) {
            console.error('[API/appointments] dual community post failed for', cat, communityErr);
          }
        }
      }
      return NextResponse.json({ ok: true, ids, dual: true });
    }

    const dataToSave = {
      agentId: uid,
      createdByUid: callerUid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      // Core fields
      date: body.date,
      contactName: body.contactName,
      category: body.category,                          // buyer | seller | commercial
      status: body.status ?? 'set',                     // legacy log status: set | held
      // Pipeline status (new)
      pipelineStatus: body.pipelineStatus ?? 'active',  // active | set | held | ghost | on_hold | trash
      // Contact info
      contactPhone: body.contactPhone ?? null,
      contactEmail: body.contactEmail ?? null,
      // Property / deal info
      listingAddress: body.listingAddress ?? null,
      priceRangeLow: body.priceRangeLow ? Number(body.priceRangeLow) : null,
      priceRangeHigh: body.priceRangeHigh ? Number(body.priceRangeHigh) : null,
      estimatedCommission: body.estimatedCommission ? Number(body.estimatedCommission) : null,
      // Timing bucket: how soon the client expects to transact
      timing: body.timing ?? null,
      // Date appointment was set (logged)
      dateSet: body.dateSet ?? null,
      timeSet: body.timeSet ?? null,
      // Source flag
      source: body.source ?? 'manual',
      // Notes
      notes: body.notes ?? null,
      scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
      heldAt: body.heldAt ? new Date(body.heldAt) : null,
      // Link to the original appointment set (for held appointments)
      linkedSetAppointmentId: body.linkedSetAppointmentId ?? null,
    };

    const docRef = await adminDb.collection('appointments').add(dataToSave);

    // ── Community board auto-post ──────────────────────────────────────────────
    // If the agent checked "Post to Buyer Needs" (buyer appt) or
    // "Post to Coming Soon" (seller appt), create the community doc now.
    const postToCommunity = body.postToCommunity as boolean | undefined;
    if (postToCommunity) {
      try {
        // Fetch agent profile to get display name + phone
        let agentName = body.agentNameOverride as string | undefined;
        let agentPhone = body.agentPhoneOverride as string | undefined;
        let agentProfileId = uid;

        if (!agentName || !agentPhone) {
          // Try profile doc by uid first
          const profileSnap = await adminDb.collection('agentProfiles').doc(uid).get();
          if (profileSnap.exists) {
            const pd = profileSnap.data()!;
            agentName = agentName || [pd.firstName, pd.lastName].filter(Boolean).join(' ') || pd.displayName || pd.agentId || uid;
            agentPhone = agentPhone || pd.phone || pd.phoneNumber || '';
            agentProfileId = profileSnap.id;
          } else {
            // Try by firebaseUid field
            const byFbUid = await adminDb.collection('agentProfiles').where('firebaseUid', '==', uid).limit(1).get();
            if (!byFbUid.empty) {
              const pd = byFbUid.docs[0].data();
              agentName = agentName || [pd.firstName, pd.lastName].filter(Boolean).join(' ') || pd.displayName || uid;
              agentPhone = agentPhone || pd.phone || pd.phoneNumber || '';
              agentProfileId = byFbUid.docs[0].id;
            }
          }
        }

        const category = body.category as string;
        const now = FieldValue.serverTimestamp();

        if (category === 'buyer') {
          // Post to buyerNeeds
          const area = body.listingAddress || body.notes || 'Area TBD';
          await adminDb.collection('buyerNeeds').add({
            agentName: (agentName || uid).trim(),
            agentPhone: (agentPhone || '').trim(),
            agentProfileId,
            createdByUid: callerUid,
            area,
            minPrice: body.priceRangeLow ? Number(body.priceRangeLow) : null,
            maxPrice: body.priceRangeHigh ? Number(body.priceRangeHigh) : null,
            beds: null,
            baths: null,
            notes: body.notes || null,
            sourceAppointmentId: docRef.id,
            active: true,
            lastConfirmedAt: now,
            createdAt: now,
            updatedAt: now,
          });
        } else if (category === 'seller') {
          // Post to comingSoon — omit address, use area/notes only
          const area = body.communityArea || body.notes || 'Area TBD';
          await adminDb.collection('comingSoon').add({
            agentName: (agentName || uid).trim(),
            agentPhone: (agentPhone || '').trim(),
            agentProfileId,
            createdByUid: callerUid,
            // address intentionally omitted for privacy
            address: null,
            area,
            price: body.priceRangeLow ? Number(body.priceRangeLow) : (body.priceRangeHigh ? Number(body.priceRangeHigh) : null),
            beds: null,
            baths: null,
            notes: body.notes || null,
            expectedDate: null,
            sourceAppointmentId: docRef.id,
            active: true,
            lastConfirmedAt: now,
            createdAt: now,
            updatedAt: now,
          });
        }
      } catch (communityErr) {
        // Non-fatal — appointment was saved; log and continue
        console.error('[API/appointments] community board post failed:', communityErr);
      }
    }
    // ─────────────────────────────────────────────────────────────────────────
    // ── Facebook Group auto-post ───────────────────────────────────────────────
    // If the agent checked "Share to KRE Agents Facebook Group", post via Graph API.
    const postToFacebook = body.postToFacebook as boolean | undefined;
    if (postToFacebook) {
      try {
        // Get agent's stored Facebook token
        const userDoc = await adminDb.collection('users').doc(callerUid).get();
        const userData = userDoc.data() || {};
        const fbToken = userData.facebookToken as string | undefined;
        const fbExpiresAt = userData.facebookTokenExpiresAt as string | undefined;

        if (fbToken && (!fbExpiresAt || new Date(fbExpiresAt) > new Date())) {
          const category = body.category as string;
          const agentName = (body.agentNameOverride as string) || callerUid;
          let fbMessage = '';

          if (category === 'buyer') {
            const area = body.listingAddress || body.notes || 'Area TBD';
            const minP = body.priceRangeLow ? `$${Number(body.priceRangeLow).toLocaleString()}` : null;
            const maxP = body.priceRangeHigh ? `$${Number(body.priceRangeHigh).toLocaleString()}` : null;
            const priceRange = minP && maxP ? `${minP} – ${maxP}` : maxP || minP || '';
            fbMessage = [
              `🔍 BUYER NEEDS — ${agentName}`,
              ``,
              `Looking for a home in: ${area}`,
              priceRange ? `Price range: ${priceRange}` : '',
              body.notes ? `Notes: ${body.notes}` : '',
              ``,
              `Contact me if you have a match! #KREAgents #BuyerNeeds`,
            ].filter(Boolean).join('\n');
          } else if (category === 'seller') {
            const area = body.communityArea || body.notes || 'Area TBD';
            const price = body.priceRangeLow ? `$${Number(body.priceRangeLow).toLocaleString()}` : (body.priceRangeHigh ? `$${Number(body.priceRangeHigh).toLocaleString()}` : '');
            fbMessage = [
              `🏡 COMING SOON — ${agentName}`,
              ``,
              `Neighborhood / Area: ${area}`,
              price ? `Price: ${price}` : '',
              body.notes ? `Notes: ${body.notes}` : '',
              ``,
              `Reach out if you have a buyer! #KREAgents #ComingSoon`,
            ].filter(Boolean).join('\n');
          } else {
            // 'both'
            const area = body.communityArea || body.listingAddress || body.notes || 'Area TBD';
            fbMessage = [
              `📋 BUYER NEEDS + 🏡 COMING SOON — ${agentName}`,
              ``,
              `Area: ${area}`,
              body.notes ? `Notes: ${body.notes}` : '',
              ``,
              `#KREAgents`,
            ].filter(Boolean).join('\n');
          }

          const FACEBOOK_GROUP_ID = process.env.FACEBOOK_GROUP_ID || '1590583281249545';
          const fbRes = await fetch(
            `https://graph.facebook.com/v19.0/${FACEBOOK_GROUP_ID}/feed`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ message: fbMessage, access_token: fbToken }),
            }
          );
          const fbData = await fbRes.json();
          if (fbData.error) {
            console.error('[API/appointments] Facebook post error:', fbData.error);
            // If token revoked, clear it
            if (fbData.error.code === 190 || fbData.error.code === 200) {
              await adminDb.collection('users').doc(callerUid).update({ facebookToken: null, facebookTokenExpiresAt: null });
            }
          } else {
            console.log(`[API/appointments] Facebook post success: ${fbData.id}`);
            // Audit log
            await adminDb.collection('facebookPosts').add({
              uid: callerUid,
              postType: category === 'buyer' ? 'buyer_needs' : category === 'seller' ? 'coming_soon' : 'both',
              groupId: FACEBOOK_GROUP_ID,
              fbPostId: fbData.id || '',
              messagePreview: fbMessage.slice(0, 200),
              sourceAppointmentId: docRef.id,
              postedAt: new Date().toISOString(),
            });
          }
        } else {
          console.warn(`[API/appointments] Facebook post requested but token missing/expired for uid=${callerUid}`);
        }
      } catch (fbErr) {
        // Non-fatal — appointment was saved; log and continue
        console.error('[API/appointments] Facebook post failed:', fbErr);
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    return NextResponse.json({ ok: true, id: docRef.id });
  } catch (err: any) {
    console.error(`[API/appointments] POST failed:`, err);
    return jsonError(err.status ?? 500, err.message ?? 'Failed to save appointment');
  }
}
