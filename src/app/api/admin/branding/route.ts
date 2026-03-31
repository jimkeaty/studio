// src/app/api/admin/branding/route.ts
// GET  /api/admin/branding — fetch current branding settings
// POST /api/admin/branding — create or update branding settings
// PUT  /api/admin/branding — update branding settings
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { isAdminLike } from '@/lib/auth/staffAccess';


function serializeFirestore(val: any): any {
  if (val == null) return val;
  if (typeof val?.toDate === 'function') return val.toDate().toISOString();
  if (Array.isArray(val)) return val.map(serializeFirestore);
  if (typeof val === 'object' && val.constructor === Object) {
    const out: any = {};
    for (const [k, v] of Object.entries(val)) {
      out[k] = serializeFirestore(v);
    }
    return out;
  }
  return val;
}

function extractBearer(req: NextRequest) {
  const h = req.headers.get('Authorization') || '';
  if (!h.startsWith('Bearer ')) return null;
  return h.slice('Bearer '.length).trim();
}

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

async function verifyAdmin(req: NextRequest) {
  const token = extractBearer(req);
  if (!token) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    if (!(await isAdminLike(decoded.uid))) return null;
    return decoded;
  } catch {
    return null;
  }
}

// --------------- GET ---------------
export async function GET(req: NextRequest) {
  try {
    const decoded = await verifyAdmin(req);
    if (!decoded) return jsonError(403, 'Forbidden: Admin only');

    const doc = await adminDb.collection('brandingSettings').doc('default').get();

    if (!doc.exists) {
      // Return defaults when no branding has been saved yet
      return NextResponse.json({
        ok: true,
        branding: {
          companyName: 'Smart Broker USA',
          tagline: null,
          logoUrl: null,
          animatedLogoUrl: null,
          useAnimatedLogo: false,
          primaryColor: null,
          updatedAt: null,
        },
      });
    }

    const data = serializeFirestore(doc.data()!);
    return NextResponse.json({
      ok: true,
      branding: {
        companyName: data.companyName ?? 'Smart Broker USA',
        tagline: data.tagline ?? null,
        logoUrl: data.logoUrl ?? null,
        animatedLogoUrl: data.animatedLogoUrl ?? null,
        useAnimatedLogo: data.useAnimatedLogo ?? false,
        primaryColor: data.primaryColor ?? null,
        updatedAt: data.updatedAt ?? null,
      },
    });
  } catch (err: any) {
    console.error('[GET /api/admin/branding]', err);
    return jsonError(500, err.message || 'Internal Server Error');
  }
}

// --------------- POST / PUT (shared handler) ---------------
async function upsertBranding(req: NextRequest) {
  try {
    const decoded = await verifyAdmin(req);
    if (!decoded) return jsonError(403, 'Forbidden: Admin only');

    const body = await req.json();

    const {
      companyName,
      tagline,
      logoUrl,
      animatedLogoUrl,
      useAnimatedLogo,
      primaryColor,
    } = body;

    if (!companyName || typeof companyName !== 'string' || !companyName.trim()) {
      return jsonError(400, 'companyName is required');
    }

    // Validate primaryColor if provided
    if (primaryColor != null && typeof primaryColor === 'string' && primaryColor.trim()) {
      if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(primaryColor.trim())) {
        return jsonError(400, 'primaryColor must be a valid hex color (e.g. #FF5500)');
      }
    }

    const update: Record<string, any> = {
      companyName: companyName.trim(),
      tagline: tagline?.trim() || null,
      logoUrl: logoUrl?.trim() || null,
      animatedLogoUrl: animatedLogoUrl?.trim() || null,
      useAnimatedLogo: Boolean(useAnimatedLogo),
      primaryColor: primaryColor?.trim() || null,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: decoded.uid,
    };

    await adminDb.collection('brandingSettings').doc('default').set(update, { merge: true });

    return NextResponse.json({ ok: true, branding: { ...update, updatedAt: new Date().toISOString() } });
  } catch (err: any) {
    console.error('[POST/PUT /api/admin/branding]', err);
    return jsonError(500, err.message || 'Internal Server Error');
  }
}

export async function POST(req: NextRequest) {
  return upsertBranding(req);
}

export async function PUT(req: NextRequest) {
  return upsertBranding(req);
}
