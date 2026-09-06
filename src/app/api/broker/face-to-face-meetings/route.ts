import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';

const MEETING_TYPES = new Set(['coffee', 'lunch', 'drinks', 'office_meeting', 'other']);
const OUTCOMES = new Set(['Interested', 'Follow-up Needed', 'Not Ready', 'Not Interested', 'Appointment Scheduled']);

type RecruiterGoalMap = Record<string, number>;
type GoalSnapshot = { effectiveOn: string; defaultWeeklyGoal: number; recruiterGoals: RecruiterGoalMap; changedAt: string; changedByUid: string };

function error(status: number, message: string) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

async function requireAdminLike(req: NextRequest) {
  const header = req.headers.get('Authorization') || '';
  if (!header.startsWith('Bearer ')) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(header.slice(7));
    return (await isAdminLike(decoded.uid)) ? decoded : null;
  } catch {
    return null;
  }
}

function isoDate(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value.match(/^\d{4}-\d{2}-\d{2}/)?.[0] || null;
  if (typeof (value as any).toDate === 'function') return (value as any).toDate().toISOString().slice(0, 10);
  return null;
}

function todayYmd() { return new Date().toISOString().slice(0, 10); }
function keyFor(value: string) { return value.trim().toLowerCase().replace(/\s+/g, ' '); }
function safeGoal(value: unknown, fallback = 4) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.min(parsed, 100) : fallback;
}
function weekStart(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  const weekday = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() + (weekday === 0 ? -6 : 1 - weekday));
  return date.toISOString().slice(0, 10);
}
function dateInRange(value: string | null, start: string, end: string) { return Boolean(value && value >= start && value <= end); }
function meetingGoalConfig(raw: any) {
  const source = raw?.faceToFaceRecruitingGoals || {};
  const defaultWeeklyGoal = safeGoal(source.defaultWeeklyGoal, 4);
  const recruiterGoals: RecruiterGoalMap = Object.fromEntries(
    Object.entries(source.recruiterGoals || {}).map(([key, value]) => [keyFor(key), safeGoal(value, defaultWeeklyGoal)])
  );
  return {
    defaultWeeklyGoal,
    recruiterGoals,
    history: Array.isArray(source.history) ? source.history.slice(-100) : [],
    updatedAt: source.updatedAt || null,
    updatedByUid: source.updatedByUid || null,
  };
}

export async function GET(req: NextRequest) {
  const caller = await requireAdminLike(req);
  if (!caller) return error(403, 'Administrator or staff access required');
  try {
    const year = Number(new URL(req.url).searchParams.get('year') || new Date().getFullYear());
    if (!Number.isInteger(year) || year < 2018 || year > 2100) return error(400, 'Invalid year');
    const today = todayYmd();
    const currentWeekStart = weekStart(today);
    const currentMonthStart = `${today.slice(0, 7)}-01`;
    const [planSnap, activitySnap, pipelineSnap, staffSnap] = await Promise.all([
      adminDb.collection('recruitingPlans').doc(String(year)).get(),
      adminDb.collection('directorDevelopmentActivities').where('year', '==', year).get(),
      adminDb.collection('recruitingPipeline').get(),
      adminDb.collection('staffUsers').where('status', '==', 'active').get(),
    ]);
    const goalConfig = meetingGoalConfig(planSnap.exists ? planSnap.data() : null);
    const meetings = activitySnap.docs
      .map(doc => ({ id: doc.id, ...(doc.data() as Record<string, any>) } as Record<string, any>))
      .filter(record => record.activityType === 'in_person_relationship_meeting')
      .map(record => ({
        id: record.id,
        occurredOn: isoDate(record.occurredOn),
        agentOrRecruit: String(record.title || record.relatedAgentName || 'Unknown'),
        recruiterName: String(record.recruiterName || 'Ethan'),
        recruiterId: String(record.recruiterId || ''),
        meetingType: String(record.meetingType || 'other'),
        organization: String(record.organization || ''),
        notes: String(record.notes || ''),
        recruitingStatus: String(record.recruitingStatus || ''),
        outcome: String(record.outcome || ''),
        nextFollowUpDate: isoDate(record.nextFollowUpDate),
        nextFollowUpAction: String(record.nextFollowUpAction || ''),
        pipelineCandidateId: String(record.pipelineCandidateId || ''),
        createdAt: String(record.createdAt || ''),
      }))
      .sort((a, b) => String(b.occurredOn || '').localeCompare(String(a.occurredOn || '')) || b.createdAt.localeCompare(a.createdAt));
    const candidateById = new Map(pipelineSnap.docs.map(doc => [doc.id, { id: doc.id, name: String((doc.data() as any).name || doc.id), brokerage: String((doc.data() as any).brokerage || ''), status: String((doc.data() as any).status || '') }]));
    const candidates = [...candidateById.values()].sort((a, b) => a.name.localeCompare(b.name));
    const recruiterNames = new Set<string>(['Ethan']);
    staffSnap.docs.forEach(doc => {
      const data = doc.data() as any;
      const name = String(data.displayName || data.name || '').trim();
      if (name) recruiterNames.add(name);
    });
    meetings.forEach(meeting => recruiterNames.add(meeting.recruiterName));
    Object.keys(goalConfig.recruiterGoals).forEach(key => recruiterNames.add(key));
    const recruiters = [...recruiterNames]
      .filter(Boolean)
      .map(name => ({ name, key: keyFor(name), weeklyGoal: goalConfig.recruiterGoals[keyFor(name)] ?? goalConfig.defaultWeeklyGoal }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const recruiterSummary = recruiters.map(recruiter => {
      const recruiterMeetings = meetings.filter(meeting => keyFor(meeting.recruiterName) === recruiter.key);
      const weekly = recruiterMeetings.filter(meeting => dateInRange(meeting.occurredOn, currentWeekStart, today)).length;
      const monthly = recruiterMeetings.filter(meeting => dateInRange(meeting.occurredOn, currentMonthStart, today)).length;
      return { ...recruiter, weekly, monthly, ytd: recruiterMeetings.length, attainmentPct: recruiter.weeklyGoal > 0 ? Math.round((weekly / recruiter.weeklyGoal) * 100) : null };
    });
    return NextResponse.json({ ok: true, year, today, currentWeekStart, currentMonthStart, goalConfig, recruiters, recruiterSummary, meetings, candidates });
  } catch (cause: any) {
    return error(500, cause?.message || 'Unable to load face-to-face recruiting meetings');
  }
}

export async function POST(req: NextRequest) {
  const caller = await requireAdminLike(req);
  if (!caller) return error(403, 'Administrator or staff access required');
  try {
    const body = await req.json();
    const year = Number(body.year || new Date().getFullYear());
    if (!Number.isInteger(year) || year < 2018 || year > 2100) return error(400, 'Invalid year');
    if (body.action === 'saveGoals') {
      const existingSnap = await adminDb.collection('recruitingPlans').doc(String(year)).get();
      const prior = meetingGoalConfig(existingSnap.exists ? existingSnap.data() : null);
      const defaultWeeklyGoal = safeGoal(body.defaultWeeklyGoal, prior.defaultWeeklyGoal);
      const recruiterGoals: RecruiterGoalMap = Object.fromEntries(
        Object.entries(body.recruiterGoals || {}).map(([key, value]) => [keyFor(key), safeGoal(value, defaultWeeklyGoal)])
      );
      const changedAt = new Date().toISOString();
      const snapshot: GoalSnapshot = { effectiveOn: body.effectiveOn || todayYmd(), defaultWeeklyGoal, recruiterGoals, changedAt, changedByUid: caller.uid };
      const history = [...prior.history, snapshot].slice(-100);
      const faceToFaceRecruitingGoals = { defaultWeeklyGoal, recruiterGoals, history, updatedAt: changedAt, updatedByUid: caller.uid };
      await adminDb.collection('recruitingPlans').doc(String(year)).set({ faceToFaceRecruitingGoals }, { merge: true });
      return NextResponse.json({ ok: true, goalConfig: faceToFaceRecruitingGoals });
    }
    if (body.action === 'logMeeting') {
      const occurredOn = isoDate(body.occurredOn);
      const agentOrRecruit = String(body.agentOrRecruit || '').trim().slice(0, 120);
      const recruiterName = String(body.recruiterName || '').trim().slice(0, 120);
      const meetingType = String(body.meetingType || '');
      const organization = String(body.organization || '').trim().slice(0, 120);
      const recruitingStatus = String(body.recruitingStatus || '').trim().slice(0, 120);
      const outcome = String(body.outcome || '');
      const notes = String(body.notes || '').trim().slice(0, 2_000);
      const nextFollowUpDate = isoDate(body.nextFollowUpDate);
      const nextFollowUpAction = String(body.nextFollowUpAction || '').trim().slice(0, 240);
      const pipelineCandidateId = String(body.pipelineCandidateId || '').trim();
      if (!occurredOn || !occurredOn.startsWith(String(year))) return error(400, 'Meeting date must be within the selected year');
      if (!agentOrRecruit || !recruiterName || !MEETING_TYPES.has(meetingType) || !OUTCOMES.has(outcome)) return error(400, 'Agent/recruit, recruiter, meeting type, and outcome are required');
      if (nextFollowUpDate && !nextFollowUpAction) return error(400, 'Add the next follow-up action when setting a follow-up date');
      const now = new Date().toISOString();
      const meeting = {
        year,
        activityType: 'in_person_relationship_meeting',
        source: 'face_to_face_recruiting',
        occurredOn,
        title: agentOrRecruit,
        recruiterName,
        recruiterId: String(body.recruiterId || '').trim() || null,
        meetingType,
        organization,
        recruitingStatus,
        outcome,
        notes,
        nextFollowUpDate,
        nextFollowUpAction,
        pipelineCandidateId: pipelineCandidateId || null,
        relatedAgentId: null,
        relatedAgentName: null,
        relationshipPurpose: 'recruiting',
        count: 1,
        durationHours: 0,
        createdAt: now,
        createdByUid: caller.uid,
      };
      const ref = await adminDb.collection('directorDevelopmentActivities').add(meeting);
      if (pipelineCandidateId && nextFollowUpDate) {
        const pipelineActivityRef = adminDb.collection('recruitingPipelineActivity').doc();
        await pipelineActivityRef.set({
          candidateId: pipelineCandidateId,
          type: 'face_to_face_meeting',
          summary: `${meetingType.replace(/_/g, ' ')} with ${agentOrRecruit}: ${outcome}`,
          notes: notes || null,
          sourceFaceToFaceMeetingId: ref.id,
          authorUid: caller.uid,
          authorName: recruiterName,
          followUpDate: nextFollowUpDate,
          followUpAction: nextFollowUpAction,
          createdAt: now,
        });
        await adminDb.collection('recruitingPipeline').doc(pipelineCandidateId).set({ lastContactedAt: now, followUpDate: nextFollowUpDate, followUpAction: nextFollowUpAction, updatedAt: now }, { merge: true });
      }
      return NextResponse.json({ ok: true, meeting: { id: ref.id, ...meeting } });
    }
    return error(400, 'Unknown action');
  } catch (cause: any) {
    return error(500, cause?.message || 'Unable to save face-to-face recruiting meeting');
  }
}
