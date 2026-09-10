import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';
import {
  CENTRAL_TIME_ZONE,
  centralParts,
  FLOOR_TIME_QR_DEDUPLICATION_MINUTES,
  floorTimeSummary,
  hasRecentFloorTimeQrCheckIn,
  isScheduledAttendanceEvent,
  SCHEDULED_ATTENDANCE_EVENTS,
  scheduledEventWindow,
  type ScheduledAttendanceEvent,
} from '@/lib/attendance/rules';
import { sendTransactionalSmsWithResult } from '@/lib/notifications/sendNotification';

type AuthContext = { uid: string; isAdmin: boolean };
type OfficeLocation = {
  latitude: number;
  longitude: number;
  radiusMeters: number;
  address: string | null;
  updatedAt: string | null;
};
type AttendanceRecord = Record<string, any> & { id: string };
type FloorTimeQrSettings = {
  enabled: boolean;
  codeId: string | null;
  directorRecipientUid: string | null;
  directorRecipientName: string | null;
  updatedAt: string | null;
};

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

async function authenticate(req: NextRequest): Promise<AuthContext | null> {
  const header = req.headers.get('Authorization') || '';
  if (!header.startsWith('Bearer ')) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(header.slice(7));
    return { uid: decoded.uid, isAdmin: await isAdminLike(decoded.uid) };
  } catch {
    return null;
  }
}

async function resolveAgent(identity: string) {
  const direct = await adminDb.collection('agentProfiles').doc(identity).get();
  const byUid = direct.exists
    ? null
    : await adminDb.collection('agentProfiles').where('uid', '==', identity).limit(1).get();
  const byFirebaseUid = !direct.exists && (!byUid || byUid.empty)
    ? await adminDb.collection('agentProfiles').where('firebaseUid', '==', identity).limit(1).get()
    : null;
  const byAgentId = !direct.exists && (!byUid || byUid.empty) && (!byFirebaseUid || byFirebaseUid.empty)
    ? await adminDb.collection('agentProfiles').where('agentId', '==', identity).limit(1).get()
    : null;
  const queriedProfile = byUid?.docs[0] ?? byFirebaseUid?.docs[0] ?? byAgentId?.docs[0] ?? null;
  let profileDoc = direct.exists ? direct : queriedProfile;

  if (!profileDoc) {
    const linkedUser = await adminDb.collection('users').doc(identity).get();
    const linkedAgentId = linkedUser.exists ? String(linkedUser.data()?.agentId || '') : '';
    if (linkedAgentId) profileDoc = await adminDb.collection('agentProfiles').doc(linkedAgentId).get();
  }
  if (!profileDoc?.exists) return null;
  const profile = profileDoc.data() as Record<string, any>;
  const status = String(profile.status || profile.agentStatus || 'active').toLowerCase();
  if (['inactive', 'out', 'terminated', 'churned'].includes(status)) return null;
  return {
    agentId: String(profile.agentId || profileDoc.id),
    agentName: String(profile.displayName || profile.name || `${profile.firstName || ''} ${profile.lastName || ''}`.trim() || 'Agent'),
  };
}

function validLocation(value: unknown): value is { latitude: number; longitude: number; accuracy?: number } {
  const location = value as any;
  return Number.isFinite(Number(location?.latitude)) && Number.isFinite(Number(location?.longitude))
    && Math.abs(Number(location.latitude)) <= 90 && Math.abs(Number(location.longitude)) <= 180;
}

function distanceMeters(from: OfficeLocation, to: { latitude: number; longitude: number }) {
  const earthRadius = 6_371_000;
  const toRadians = (degrees: number) => degrees * Math.PI / 180;
  const dLat = toRadians(to.latitude - from.latitude);
  const dLon = toRadians(to.longitude - from.longitude);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRadians(from.latitude)) * Math.cos(toRadians(to.latitude)) * Math.sin(dLon / 2) ** 2;
  return Math.round(earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

async function getOfficeLocation() {
  const snapshot = await adminDb.collection('attendanceSettings').doc('office').get();
  const data = snapshot.exists ? snapshot.data() as Record<string, any> : null;
  const latitude = Number(data?.officeLocation?.latitude);
  const longitude = Number(data?.officeLocation?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return {
    latitude,
    longitude,
    radiusMeters: Number.isFinite(Number(data?.officeLocation?.radiusMeters))
      ? Math.max(25, Math.min(Number(data?.officeLocation?.radiusMeters), 1_000))
      : 250,
    address: typeof data?.officeLocation?.address === 'string' && data.officeLocation.address.trim()
      ? data.officeLocation.address.trim()
      : null,
    updatedAt: typeof data?.updatedAt === 'string' ? data.updatedAt : null,
  };
}

function floorTimeQrSettings(data: Record<string, any> | null | undefined): FloorTimeQrSettings {
  const source = data?.floorTimeQr || {};
  return {
    enabled: source?.enabled === true,
    codeId: typeof source?.codeId === 'string' && source.codeId.trim() ? source.codeId : null,
    directorRecipientUid: typeof source?.directorRecipientUid === 'string' && source.directorRecipientUid.trim() ? source.directorRecipientUid : null,
    directorRecipientName: typeof source?.directorRecipientName === 'string' && source.directorRecipientName.trim() ? source.directorRecipientName : null,
    updatedAt: typeof source?.updatedAt === 'string' ? source.updatedAt : null,
  };
}

async function getFloorTimeQrSettings() {
  const snapshot = await adminDb.collection('attendanceSettings').doc('office').get();
  return floorTimeQrSettings(snapshot.exists ? snapshot.data() as Record<string, any> : null);
}

async function resolveDirectorRecipient(uid: string) {
  const [userDoc, staffSnap] = await Promise.all([
    adminDb.collection('users').doc(uid).get(),
    adminDb.collection('staffUsers').where('firebaseUid', '==', uid).limit(1).get(),
  ]);
  const user = userDoc.exists ? userDoc.data() as Record<string, any> : {};
  const staff = staffSnap.empty ? {} : staffSnap.docs[0].data() as Record<string, any>;
  if (staff.status && String(staff.status).toLowerCase() !== 'active') return null;
  return {
    uid,
    displayName: String(user.displayName || user.name || staff.displayName || staff.name || 'Director of Agent Development').trim(),
    phone: String(user.phone || staff.phone || '').trim() || null,
  };
}

function localFloorTimeLabel(now: Date) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: CENTRAL_TIME_ZONE,
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(now);
}

async function recordsForAgent(agentId: string): Promise<AttendanceRecord[]> {
  const snapshot = await adminDb.collection('agentAttendance').where('agentId', '==', agentId).get();
  return snapshot.docs
    .map(doc => ({ id: doc.id, ...(doc.data() as Record<string, any>) }) as AttendanceRecord)
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(b.checkInAt || '').localeCompare(String(a.checkInAt || '')));
}

export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (!auth) return jsonError(401, 'Sign in is required');
  const { searchParams } = new URL(req.url);
  const scope = searchParams.get('scope');
  const requestedAgentId = searchParams.get('agentId');

  if (scope === 'all') {
    if (!auth.isAdmin) return jsonError(403, 'Administrator access is required');
    try {
      const year = searchParams.get('year');
      const snapshot = await adminDb.collection('agentAttendance').get();
      const records = snapshot.docs
        .map(doc => ({ id: doc.id, ...(doc.data() as Record<string, any>) }) as AttendanceRecord)
        .filter(record => !year || String(record.date || '').startsWith(year))
        .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(b.checkInAt || '').localeCompare(String(a.checkInAt || '')));
      const [officeLocation, floorTimeQr] = await Promise.all([getOfficeLocation(), getFloorTimeQrSettings()]);
      return NextResponse.json({
        ok: true,
        today: centralParts().date,
        schedules: SCHEDULED_ATTENDANCE_EVENTS,
        officeLocationConfigured: Boolean(officeLocation),
        officeLocation,
        floorTimeQr,
        records: records.slice(0, 500),
      });
    } catch (error: any) {
      return jsonError(500, error?.message || 'Unable to load attendance review');
    }
  }

  if (!auth.isAdmin && requestedAgentId) return jsonError(403, 'You can only view your own attendance');
  const self = await resolveAgent(auth.uid);
  const target = auth.isAdmin && requestedAgentId ? await resolveAgent(requestedAgentId) : self;
  if (!target) return jsonError(403, 'An active agent profile is required');
  const agentId = target.agentId;

  try {
    const records = await recordsForAgent(agentId);
    const today = centralParts().date;
    const filtered = records.filter(record => !searchParams.get('year') || String(record.date || '').startsWith(searchParams.get('year')!));
    const attendance = {
      huddlesThisMonth: filtered.filter(record => record.type === 'huddle' && String(record.date || '').startsWith(today.slice(0, 7))).length,
      rolePlayThisMonth: filtered.filter(record => record.type === 'role_play_ids' && String(record.date || '').startsWith(today.slice(0, 7))).length,
      trainingThisMonth: filtered.filter(record => record.type === 'training' && String(record.date || '').startsWith(today.slice(0, 7))).length,
      salesMeetingsThisMonth: filtered.filter(record => record.type === 'sales_meeting' && String(record.date || '').startsWith(today.slice(0, 7))).length,
    };
    const floorTimeQr = await getFloorTimeQrSettings();
    return NextResponse.json({
      ok: true,
      agentId,
      agentName: target.agentName,
      today,
      schedules: SCHEDULED_ATTENDANCE_EVENTS,
      officeLocationConfigured: Boolean(await getOfficeLocation()),
      floorTimeQrEnabled: floorTimeQr.enabled,
      records: filtered.slice(0, 150),
      summary: { ...attendance, ...floorTimeSummary(filtered, today) },
    });
  } catch (error: any) {
    return jsonError(500, error?.message || 'Unable to load attendance');
  }
}

export async function POST(req: NextRequest) {
  const auth = await authenticate(req);
  if (!auth) return jsonError(401, 'Sign in is required');

  try {
    const body = await req.json();
    const action = String(body.action || '');
    const now = new Date();
    const nowCentral = centralParts(now);
    const self = await resolveAgent(auth.uid);

    if (action === 'checkInEvent') {
      const eventType = String(body.eventType || '');
      if (!self) return jsonError(403, 'An active agent profile is required for attendance check-in');
      if (!isScheduledAttendanceEvent(eventType)) return jsonError(400, 'Invalid scheduled event');
      const eventWindow = scheduledEventWindow(eventType, now);
      if (!eventWindow.eligible) return jsonError(400, `${eventWindow.label} check-in is only available during its scheduled check-in window`);
      const recordRef = adminDb.collection('agentAttendance').doc(`${self.agentId}_${eventType}_${eventWindow.date}`);
      const existing = await recordRef.get();
      if (existing.exists) return jsonError(409, `You are already checked in for ${eventWindow.label} today`);
      const record = {
        agentId: self.agentId,
        agentDisplayName: self.agentName,
        type: eventType,
        date: eventWindow.date,
        eventLabel: eventWindow.label,
        scheduledStart: eventWindow.startLabel,
        durationMinutes: null,
        topic: null,
        notes: null,
        checkInAt: now.toISOString(),
        source: 'qr',
        loggedByUid: auth.uid,
        createdAt: now.toISOString(),
      };
      await recordRef.create(record);
      return NextResponse.json({ ok: true, record });
    }

    if (action === 'checkInFloorTimeQr') {
      if (!self) return jsonError(403, 'An active agent profile is required for Floor Time QR check-in');
      const settings = await getFloorTimeQrSettings();
      const qrCodeId = String(body.qrCodeId || '').trim();
      if (!settings.enabled || !settings.codeId || !qrCodeId || qrCodeId !== settings.codeId) {
        return jsonError(403, 'This Floor Time QR code is disabled, expired, or invalid');
      }
      const agentRecords = await recordsForAgent(self.agentId);
      if (hasRecentFloorTimeQrCheckIn(agentRecords, self.agentId, qrCodeId, now)) {
        return jsonError(409, `A Floor Time QR check-in was already recorded within the ${FLOOR_TIME_QR_DEDUPLICATION_MINUTES}-minute deduplication window`);
      }
      const checkInAt = now.toISOString();
      const recordRef = adminDb.collection('agentAttendance').doc();
      const record = {
        agentId: self.agentId,
        agentDisplayName: self.agentName,
        type: 'floor_time',
        eventType: 'floor_time_qr',
        eventLabel: 'Floor Time QR Check-In',
        date: nowCentral.date,
        businessTimeZone: CENTRAL_TIME_ZONE,
        qrCodeId,
        qrPresenceOnly: true,
        durationMinutes: 0,
        checkInAt,
        checkOutAt: checkInAt,
        locationVerified: false,
        source: 'floor_time_qr',
        notificationState: 'pending',
        notificationAttemptId: null,
        loggedByUid: auth.uid,
        createdAt: checkInAt,
      };
      await recordRef.create(record);

      const recipient = settings.directorRecipientUid ? await resolveDirectorRecipient(settings.directorRecipientUid) : null;
      const attemptRef = adminDb.collection('attendanceNotificationAttempts').doc();
      const attemptBase = {
        attendanceRecordId: recordRef.id,
        eventType: 'floor_time_qr',
        recipientRole: 'director_of_agent_development',
        recipientUid: recipient?.uid || settings.directorRecipientUid || null,
        recipientDisplayName: recipient?.displayName || settings.directorRecipientName || null,
        provider: 'twilio',
        providerMessageId: null,
        createdAt: checkInAt,
        updatedAt: checkInAt,
        createdByUid: auth.uid,
      };
      await attemptRef.create({
        ...attemptBase,
        state: recipient ? 'pending' : 'failed',
        failureReason: recipient ? null : 'director_recipient_not_configured',
      });
      await recordRef.update({ notificationAttemptId: attemptRef.id, updatedAt: now.toISOString() });
      if (!recipient) {
        await recordRef.update({ notificationState: 'failed', notificationFailureReason: 'director_recipient_not_configured', notificationUpdatedAt: new Date().toISOString() });
        return NextResponse.json({ ok: true, record: { id: recordRef.id, ...record, notificationAttemptId: attemptRef.id, notificationState: 'failed' }, notification: { state: 'failed', reason: 'director_recipient_not_configured' } });
      }

      const sms = await sendTransactionalSmsWithResult(adminDb, {
        toPhone: recipient.phone,
        body: `Floor Time check-in: ${self.agentName} checked in at ${localFloorTimeLabel(now)}. Please verify or activate floor-time leads for this agent.`,
      });
      const notificationUpdatedAt = new Date().toISOString();
      await Promise.all([
        attemptRef.update({ state: sms.state, providerMessageId: sms.providerMessageId, failureReason: sms.failureReason, updatedAt: notificationUpdatedAt }),
        recordRef.update({ notificationState: sms.state, notificationFailureReason: sms.failureReason, notificationUpdatedAt }),
      ]);
      return NextResponse.json({ ok: true, record: { id: recordRef.id, ...record, notificationAttemptId: attemptRef.id, notificationState: sms.state }, notification: { state: sms.state } });
    }

    if (action === 'floorCheckIn') {
      if (!self) return jsonError(403, 'An active agent profile is required for floor-time check-in');
      if (!validLocation(body.location)) return jsonError(400, 'Office location access is required for floor-time check-in');
      const office = await getOfficeLocation();
      if (!office) return jsonError(409, 'Office location has not been configured by an administrator yet');
      const distance = distanceMeters(office, body.location);
      const accuracy = Math.max(0, Math.round(Number(body.location.accuracy || 0)));
      if (distance > office.radiusMeters + accuracy) return jsonError(403, 'You must be at the office to begin a floor-time shift');

      const existing = (await recordsForAgent(self.agentId)).find(record => record.type === 'floor_time' && !record.checkOutAt);
      if (existing) return jsonError(409, 'You already have an open floor-time shift. Check out before starting another shift.');
      const record = {
        agentId: self.agentId,
        agentDisplayName: self.agentName,
        type: 'floor_time',
        date: nowCentral.date,
        durationMinutes: null,
        topic: body.topic ? String(body.topic).trim().slice(0, 120) : 'Floor Time',
        notes: null,
        checkInAt: now.toISOString(),
        checkOutAt: null,
        locationVerified: true,
        distanceMeters: distance,
        locationAccuracyMeters: accuracy,
        source: 'secure_office_checkin',
        loggedByUid: auth.uid,
        createdAt: now.toISOString(),
      };
      const ref = await adminDb.collection('agentAttendance').add(record);
      return NextResponse.json({ ok: true, record: { id: ref.id, ...record } });
    }

    if (action === 'floorCheckOut') {
      if (!self) return jsonError(403, 'An active agent profile is required for floor-time check-out');
      if (!validLocation(body.location)) return jsonError(400, 'Office location access is required for floor-time check-out');
      const office = await getOfficeLocation();
      if (!office) return jsonError(409, 'Office location has not been configured by an administrator yet');
      const distance = distanceMeters(office, body.location);
      const accuracy = Math.max(0, Math.round(Number(body.location.accuracy || 0)));
      if (distance > office.radiusMeters + accuracy) return jsonError(403, 'You must be at the office to check out of floor time');
      const openShift = (await recordsForAgent(self.agentId)).find(record => record.type === 'floor_time' && !record.checkOutAt);
      if (!openShift) return jsonError(404, 'No open floor-time shift was found');
      const checkIn = new Date(String(openShift.checkInAt));
      const durationMinutes = Math.max(0, Math.floor((now.getTime() - checkIn.getTime()) / 60_000));
      await adminDb.collection('agentAttendance').doc(openShift.id).update({
        checkOutAt: now.toISOString(),
        durationMinutes,
        checkOutLocationVerified: true,
        checkOutDistanceMeters: distance,
        checkOutLocationAccuracyMeters: accuracy,
        updatedAt: now.toISOString(),
      });
      return NextResponse.json({ ok: true, durationMinutes, checkOutAt: now.toISOString() });
    }

    if (action === 'setOfficeLocation') {
      if (!auth.isAdmin) return jsonError(403, 'Administrator access is required');
      if (!validLocation(body.location)) return jsonError(400, 'A valid office location is required');
      const radiusMeters = Math.max(25, Math.min(Number(body.radiusMeters || 250), 1_000));
      const address = String(body.address || '').trim().replace(/\s+/g, ' ').slice(0, 300) || null;
      const officeLocation = {
        latitude: Number(body.location.latitude),
        longitude: Number(body.location.longitude),
        radiusMeters,
        address,
      };
      await adminDb.collection('attendanceSettings').doc('office').set({
        officeLocation,
        updatedAt: now.toISOString(),
        updatedByUid: auth.uid,
      }, { merge: true });
      return NextResponse.json({ ok: true, radiusMeters, officeLocation: { ...officeLocation, updatedAt: now.toISOString() } });
    }

    if (action === 'configureFloorTimeQr') {
      if (!auth.isAdmin) return jsonError(403, 'Administrator access is required');
      const existingDoc = await adminDb.collection('attendanceSettings').doc('office').get();
      const existing = floorTimeQrSettings(existingDoc.exists ? existingDoc.data() as Record<string, any> : null);
      const enabled = body.enabled === true;
      const directorRecipientUid = String(body.directorRecipientUid || '').trim() || null;
      let directorRecipientName: string | null = null;
      if (directorRecipientUid) {
        const recipient = await resolveDirectorRecipient(directorRecipientUid);
        if (!recipient) return jsonError(400, 'Select an active staff recipient for Floor Time notifications');
        directorRecipientName = recipient.displayName;
      }
      const codeId = body.rotateCode === true || !existing.codeId
        ? adminDb.collection('attendanceSettings').doc().id
        : existing.codeId;
      const updatedAt = now.toISOString();
      const floorTimeQr = {
        enabled,
        codeId,
        directorRecipientUid,
        directorRecipientName,
        updatedAt,
        updatedByUid: auth.uid,
      };
      await adminDb.collection('attendanceSettings').doc('office').set({ floorTimeQr, updatedAt, updatedByUid: auth.uid }, { merge: true });
      return NextResponse.json({ ok: true, floorTimeQr: floorTimeQrSettings({ floorTimeQr }) });
    }

    if (action === 'recordTrainingSession') {
      if (!auth.isAdmin) return jsonError(403, 'Administrator access is required');
      const date = String(body.date || '');
      const topic = String(body.topic || '').trim().slice(0, 160);
      const participantIds: string[] = Array.isArray(body.participantIds)
        ? [...new Set<string>(body.participantIds.map((value: unknown) => String(value)).filter(Boolean))].slice(0, 300)
        : [];
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !topic || !participantIds.length) return jsonError(400, 'Training date, topic, and at least one participant are required');
      const sessionId = adminDb.collection('agentAttendance').doc().id;
      const participantProfiles = await Promise.all(participantIds.map(id => adminDb.collection('agentProfiles').doc(id).get()));
      const batch = adminDb.batch();
      participantProfiles.forEach((profile, index) => {
        const data = profile.exists ? profile.data() as Record<string, any> : {};
        const agentId = String(data.agentId || profile.id || participantIds[index]);
        const agentDisplayName = String(data.displayName || data.name || `${data.firstName || ''} ${data.lastName || ''}`.trim() || agentId);
        const ref = adminDb.collection('agentAttendance').doc(`${sessionId}_${agentId}`);
        batch.set(ref, {
          agentId,
          agentDisplayName,
          type: 'training',
          date,
          durationMinutes: Math.max(0, Number(body.durationMinutes || 0)),
          topic,
          notes: String(body.notes || '').trim().slice(0, 2_000) || null,
          sessionId,
          source: 'staff_training_roster',
          loggedByUid: auth.uid,
          createdAt: now.toISOString(),
        });
      });
      if (body.directorLed === true) {
        batch.set(adminDb.collection('directorDevelopmentActivities').doc(sessionId), {
          year: Number(date.slice(0, 4)),
          activityType: 'training_session',
          occurredOn: date,
          title: topic,
          count: 1,
          durationHours: Math.max(0, Number(body.durationMinutes || 0)) / 60,
          participantCount: participantIds.length,
          relatedAgentId: null,
          relatedAgentName: null,
          organization: null,
          relationshipPurpose: null,
          customKpiId: null,
          notes: String(body.notes || '').trim().slice(0, 2_000) || null,
          source: 'training_attendance_roster',
          createdAt: now.toISOString(),
          createdByUid: auth.uid,
        });
      }
      await batch.commit();
      return NextResponse.json({ ok: true, sessionId, participantCount: participantIds.length });
    }

    return jsonError(400, 'Unknown attendance action');
  } catch (error: any) {
    return jsonError(500, error?.message || 'Unable to save attendance');
  }
}
