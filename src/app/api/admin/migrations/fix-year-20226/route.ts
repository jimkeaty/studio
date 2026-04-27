// POST /api/admin/migrations/fix-year-20226
// Finds transactions with typo year 20226 in closedDate, contractDate, or listingDate
// and corrects them to 2026. Also fixes the year field if set to 20226.
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

function fixYear(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  // Replace 20226 with 2026 at the start of a date string
  return dateStr.replace(/^20226/, '2026');
}

export async function GET(req: NextRequest) {
  // Preview mode — show what would be fixed without writing
  try {
    const authHeader = req.headers.get('authorization') || '';
    if (!authHeader.startsWith('Bearer ')) return jsonError(401, 'Missing token');
    const token = authHeader.slice(7).trim();
    const decoded = await adminAuth.verifyIdToken(token);
    if (!(await isAdminLike(decoded.uid))) return jsonError(403, 'Forbidden');

    const snap = await adminDb.collection('transactions').get();
    const affected: { id: string; fields: Record<string, string> }[] = [];

    for (const doc of snap.docs) {
      const d = doc.data();
      const fields: Record<string, string> = {};

      for (const field of ['closedDate', 'contractDate', 'listingDate', 'projectedCloseDate']) {
        const val = d[field];
        if (typeof val === 'string' && val.startsWith('20226')) {
          fields[field] = val;
        }
      }
      if (d.year === 20226) fields['year'] = String(d.year);

      if (Object.keys(fields).length > 0) {
        affected.push({ id: doc.id, fields });
      }
    }

    return NextResponse.json({ ok: true, preview: true, count: affected.length, affected });
  } catch (err: any) {
    return jsonError(500, err.message);
  }
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    if (!authHeader.startsWith('Bearer ')) return jsonError(401, 'Missing token');
    const token = authHeader.slice(7).trim();
    const decoded = await adminAuth.verifyIdToken(token);
    if (!(await isAdminLike(decoded.uid))) return jsonError(403, 'Forbidden');

    const snap = await adminDb.collection('transactions').get();
    const fixed: { id: string; updates: Record<string, any> }[] = [];

    for (const doc of snap.docs) {
      const d = doc.data();
      const updates: Record<string, any> = {};

      for (const field of ['closedDate', 'contractDate', 'listingDate', 'projectedCloseDate']) {
        const val = d[field];
        if (typeof val === 'string' && val.startsWith('20226')) {
          updates[field] = fixYear(val);
        }
      }
      if (d.year === 20226) updates['year'] = 2026;

      if (Object.keys(updates).length > 0) {
        await adminDb.collection('transactions').doc(doc.id).update(updates);
        fixed.push({ id: doc.id, updates });
      }
    }

    return NextResponse.json({ ok: true, fixed: fixed.length, records: fixed });
  } catch (err: any) {
    return jsonError(500, err.message);
  }
}
