// GET  /api/admin/vendors          — list vendors (all authenticated users; optional ?category= filter)
// POST /api/admin/vendors          — create a new vendor (admin only)
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

async function getUid(req: NextRequest): Promise<string | null> {
  const h = req.headers.get('Authorization') || '';
  const token = h.startsWith('Bearer ') ? h.slice(7).trim() : null;
  if (!token) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    return decoded.uid;
  } catch { return null; }
}

export async function GET(req: NextRequest) {
  const uid = await getUid(req);
  if (!uid) return jsonError(401, 'Unauthorized');
  const category = req.nextUrl.searchParams.get('category') || null;
  try {
    // Special case: inspector_all fetches all inspector_* categories in one call.
    // Avoid composite index requirement by filtering active in memory and sorting by name.
    if (category === 'inspector_all') {
      const inspectorCategories = [
        'inspector_general', 'inspector_roof', 'inspector_termite',
        'inspector_foundation', 'inspector_sewer', 'inspector_hvac',
        'inspector_pool', 'inspector_water_well', 'inspector_survey',
        'inspector_elevation', 'inspector_stucco',
      ];
      const snap = await adminDb.collection('vendors')
        .where('category', 'in', inspectorCategories)
        .get();
      type VendorDoc = Record<string, any> & { id: string };
      const vendors: VendorDoc[] = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as VendorDoc))
        .filter((v: VendorDoc) => v['active'] !== false)
        .sort((a: VendorDoc, b: VendorDoc) => String(a['name'] || '').localeCompare(String(b['name'] || '')));
      return NextResponse.json({ ok: true, vendors });
    }

    // For a specific category: fetch by category only (no composite index needed),
    // then filter active in memory and sort by name.
    if (category) {
      const snap = await adminDb.collection('vendors')
        .where('category', '==', category)
        .get();
      type VendorDoc2 = Record<string, any> & { id: string };
      const vendors: VendorDoc2[] = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as VendorDoc2))
        .sort((a: VendorDoc2, b: VendorDoc2) => String(a['name'] || '').localeCompare(String(b['name'] || '')));
      return NextResponse.json({ ok: true, vendors });
    }

    // No category filter — return all vendors sorted by name (admin management page)
    const snap = await adminDb.collection('vendors').orderBy('name').get();
    const vendors = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    return NextResponse.json({ ok: true, vendors });
  } catch (err: any) {
    return jsonError(500, err.message);
  }
}

export async function POST(req: NextRequest) {
  const uid = await getUid(req);
  if (!uid) return jsonError(401, 'Unauthorized');
  if (!(await isAdminLike(uid))) return jsonError(403, 'Forbidden');
  try {
    const body = await req.json();
    const { name, email, phone, company, category, notes } = body;
    if (!name?.trim()) return jsonError(400, 'Name is required');
    if (!category?.trim()) return jsonError(400, 'Category is required');
    const doc = await adminDb.collection('vendors').add({
      name: name.trim(),
      email: email?.trim() || null,
      phone: phone?.trim() || null,
      company: company?.trim() || null,
      category: category.trim(),
      notes: notes?.trim() || null,
      active: true,
      createdAt: new Date().toISOString(),
    });
    return NextResponse.json({ ok: true, id: doc.id });
  } catch (err: any) {
    return jsonError(500, err.message);
  }
}
