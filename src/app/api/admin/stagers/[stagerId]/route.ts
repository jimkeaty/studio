// PUT    /api/admin/stagers/[stagerId]  — update a stager
// DELETE /api/admin/stagers/[stagerId]  — delete a stager
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

type RouteContext = { params: Promise<{ stagerId: string }> };

export async function PUT(req: NextRequest, ctx: RouteContext) {
  const uid = await getUid(req);
  if (!uid) return jsonError(401, 'Unauthorized');
  if (!(await isAdminLike(uid))) return jsonError(403, 'Forbidden');
  const { stagerId } = await ctx.params;
  try {
    const body = await req.json();
    const { name, email, phone, company, active } = body;
    await adminDb.collection('stagers').doc(stagerId).update({
      ...(name !== undefined && { name: name.trim() }),
      ...(email !== undefined && { email: email?.trim() || null }),
      ...(phone !== undefined && { phone: phone?.trim() || null }),
      ...(company !== undefined && { company: company?.trim() || null }),
      ...(active !== undefined && { active }),
      updatedAt: new Date().toISOString(),
    });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return jsonError(500, err.message);
  }
}

export async function DELETE(req: NextRequest, ctx: RouteContext) {
  const uid = await getUid(req);
  if (!uid) return jsonError(401, 'Unauthorized');
  if (!(await isAdminLike(uid))) return jsonError(403, 'Forbidden');
  const { stagerId } = await ctx.params;
  try {
    await adminDb.collection('stagers').doc(stagerId).delete();
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return jsonError(500, err.message);
  }
}
