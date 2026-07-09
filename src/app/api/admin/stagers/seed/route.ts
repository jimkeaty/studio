// POST /api/admin/stagers/seed
// One-time endpoint to seed the initial stagers into Firestore.
// Only callable by admins. Safe to call multiple times (checks for duplicates by name).
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

const INITIAL_STAGERS = [
  {
    name: 'Renee Doré',
    email: 'Renee@keatyrealestate.com',
    phone: '337-280-8837',
    company: null,
    active: true,
  },
  {
    name: 'Lori Danos',
    email: 'Lori@housedressingslft.com',
    phone: '337-326-7678',
    company: 'House Dressings',
    active: true,
  },
  {
    name: 'Amy Landry',
    email: null,
    phone: '337-278-9307',
    company: null,
    active: true,
  },
];

export async function POST(req: NextRequest) {
  const h = req.headers.get('Authorization') || '';
  const token = h.startsWith('Bearer ') ? h.slice(7).trim() : null;
  if (!token) return jsonError(401, 'Unauthorized');

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    const uid = decoded.uid;

    // Check admin role
    const userDoc = await adminDb.collection('users').doc(uid).get();
    const role = userDoc.data()?.role;
    if (!['admin', 'broker', 'staff'].includes(role)) {
      return jsonError(403, 'Forbidden — admin only');
    }

    // Get existing stagers to avoid duplicates
    const existing = await adminDb.collection('stagers').get();
    const existingNames = new Set(existing.docs.map(d => d.data().name?.toLowerCase()));

    const added: string[] = [];
    const skipped: string[] = [];

    for (const stager of INITIAL_STAGERS) {
      if (existingNames.has(stager.name.toLowerCase())) {
        skipped.push(stager.name);
        continue;
      }
      await adminDb.collection('stagers').add({
        ...stager,
        createdAt: new Date().toISOString(),
      });
      added.push(stager.name);
    }

    return NextResponse.json({ ok: true, added, skipped });
  } catch (err: any) {
    return jsonError(500, err.message);
  }
}
