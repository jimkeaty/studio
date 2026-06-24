/**
 * GET  /api/admin/open-house-settings  — fetch current settings
 * POST /api/admin/open-house-settings  — save settings
 *
 * Settings stored in Firestore `openHouseSettings/default`.
 * Admin/broker only.
 */
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';

function jsonErr(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

async function verifyAdmin(req: NextRequest) {
  const h = req.headers.get('Authorization') || '';
  if (!h.startsWith('Bearer ')) return null;
  const token = h.slice(7).trim();
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    if (!(await isAdminLike(decoded.uid))) return null;
    return decoded;
  } catch { return null; }
}

const DEFAULTS = {
  deadlineText: 'Thursday by 4:00 PM',
  reminderDayOfWeek: 4,       // 0=Sun … 6=Sat; 4=Thursday
  reminderHour: 8,             // 8 AM
  reminderMinute: 0,
  staffReminderDayOfWeek: 5,  // Friday
  staffReminderHour: 9,
  staffReminderMinute: 0,
  reminderEnabled: true,
  staffReminderEnabled: true,
};

export async function GET(req: NextRequest) {
  const user = await verifyAdmin(req);
  if (!user) return jsonErr(403, 'Forbidden');
  const snap = await adminDb.collection('openHouseSettings').doc('default').get();
  const data = snap.exists ? snap.data()! : {};
  return NextResponse.json({ ok: true, settings: { ...DEFAULTS, ...data } });
}

export async function POST(req: NextRequest) {
  const user = await verifyAdmin(req);
  if (!user) return jsonErr(403, 'Forbidden');

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return jsonErr(400, 'Invalid JSON'); }

  const allowed = [
    'deadlineText',
    'reminderDayOfWeek', 'reminderHour', 'reminderMinute',
    'staffReminderDayOfWeek', 'staffReminderHour', 'staffReminderMinute',
    'reminderEnabled', 'staffReminderEnabled',
  ];
  const update: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) update[key] = body[key];
  }
  update.updatedAt = new Date().toISOString();
  update.updatedBy = user.uid;

  await adminDb.collection('openHouseSettings').doc('default').set(update, { merge: true });
  return NextResponse.json({ ok: true });
}
