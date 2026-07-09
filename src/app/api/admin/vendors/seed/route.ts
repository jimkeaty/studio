// POST /api/admin/vendors/seed
// Migrates existing stagers collection into the vendors collection.
// Safe to call multiple times — skips duplicates by name+category.
// Requires admin role.
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

const INITIAL_VENDORS = [
  { name: 'Renee Doré',  email: 'Renee@keatyrealestate.com', phone: '337-280-8837', company: null,             category: 'stager' },
  { name: 'Lori Danos',  email: 'Lori@housedressingslft.com', phone: '337-326-7678', company: 'House Dressings', category: 'stager' },
  { name: 'Amy Landry',  email: null,                          phone: '337-278-9307', company: null,             category: 'stager' },
];

export async function POST(req: NextRequest) {
  const h = req.headers.get('Authorization') || '';
  const token = h.startsWith('Bearer ') ? h.slice(7).trim() : null;
  if (!token) return jsonError(401, 'Unauthorized');
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    const uid = decoded.uid;
    const userDoc = await adminDb.collection('users').doc(uid).get();
    const role = userDoc.data()?.role;
    if (!['admin', 'broker', 'staff'].includes(role)) {
      return jsonError(403, 'Forbidden — admin only');
    }

    // Build a set of existing vendor name+category combos
    const existing = await adminDb.collection('vendors').get();
    const existingKeys = new Set(
      existing.docs.map(d => `${d.data().name?.toLowerCase()}::${d.data().category}`)
    );

    const added: string[] = [];
    const skipped: string[] = [];

    for (const v of INITIAL_VENDORS) {
      const key = `${v.name.toLowerCase()}::${v.category}`;
      if (existingKeys.has(key)) {
        skipped.push(v.name);
        continue;
      }
      await adminDb.collection('vendors').add({
        ...v,
        notes: null,
        active: true,
        createdAt: new Date().toISOString(),
      });
      added.push(v.name);
    }

    return NextResponse.json({ ok: true, added, skipped });
  } catch (err: any) {
    return jsonError(500, err.message);
  }
}
