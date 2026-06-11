import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';

/**
 * GET /api/company-plugins
 * Returns the company-level plugin settings from Firestore.
 * The `companyPlugins` document lives at /companyConfig/plugins.
 *
 * POST /api/company-plugins  (admin only)
 * Updates the company-level plugin settings.
 */
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    await adminAuth.verifyIdToken(authHeader.slice(7));
    const snap = await adminDb.collection('companyConfig').doc('plugins').get();
    if (!snap.exists) {
      return NextResponse.json({ ok: true, allAgentsPlugins: [] });
    }
    const data = snap.data() as Record<string, any>;
    return NextResponse.json({
      ok: true,
      allAgentsPlugins: data.allAgentsPlugins ?? [],
    });
  } catch (err: any) {
    if (err?.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authHeader2 = req.headers.get('Authorization');
    if (!authHeader2?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const decoded2 = await adminAuth.verifyIdToken(authHeader2.slice(7));
    const callerIsAdmin = await isAdminLike(decoded2.uid);
    if (!callerIsAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const body = await req.json();
    const allAgentsPlugins: string[] = Array.isArray(body.allAgentsPlugins)
      ? body.allAgentsPlugins
      : [];
    await adminDb.collection('companyConfig').doc('plugins').set(
      { allAgentsPlugins, updatedAt: new Date().toISOString() },
      { merge: true }
    );
    return NextResponse.json({ ok: true, allAgentsPlugins });
  } catch (err: any) {
    if (err?.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (err?.message === 'FORBIDDEN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
