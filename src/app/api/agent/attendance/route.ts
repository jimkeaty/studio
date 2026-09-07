import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';
import {
  centralParts,
  floorTimeSummary,
  isScheduledAttendanceEvent,
  SCHEDULED_ATTENDANCE_EVENTS,
  scheduledEventWindow,
  type ScheduledAttendanceEvent,
} from '@/lib/attendance/rules';

type AuthContext = { uid: string; isAdmin: boolean };
type OfficeLocation = {
  latitude: number;
  longitude: number;
  radiusMeters: number;
  address: string | null;
  updatedAt: string | null;
};
type AttendanceRecord = Record<string, any> & { id: string };

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
      const officeLocation = await getOfficeLocation();
      return NextResponse.json({
        ok: true,
        today: centralParts().date,
        schedules: SCHEDULED_ATTENDANCE_EVENTS,
        officeLocationConfigured: Boolean(officeLocation),
        officeLocation,
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
    return NextResponse.json({
      ok: true,
      agentId,
      agentName: target.agentName,
      today,
      schedules: SCHEDULED_ATTENDANCE_EVENTS,
      officeLocationConfigured: Boolean(await getOfficeLocation()),
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
