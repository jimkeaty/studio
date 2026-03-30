// src/app/api/admin/branding/upload/route.ts
// POST /api/admin/branding/upload?type=logo|animated
// Accepts multipart/form-data with a `logo` file field.
// Uploads to Firebase Storage and returns the public URL.
import { NextRequest, NextResponse } from 'next/server';
import { admin, adminAuth } from '@/lib/firebase/admin';

const ADMIN_UID = '1kJsXTU1JjZXMidmoIPXgXxizll1';
const BUCKET_NAME = 'smart-broker-usa.firebasestorage.app';
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/svg+xml',
  'image/webp',
]);
const EXTENSION_MAP: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'image/webp': 'webp',
};

function extractBearer(req: NextRequest) {
  const h = req.headers.get('Authorization') || '';
  if (!h.startsWith('Bearer ')) return null;
  return h.slice('Bearer '.length).trim();
}

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(req: NextRequest) {
  try {
    // ---------- Auth ----------
    const token = extractBearer(req);
    if (!token) return jsonError(401, 'Unauthorized');

    const decoded = await adminAuth.verifyIdToken(token);
    if (!(await isAdminLike(decoded.uid))) return jsonError(403, 'Forbidden: Admin only');

    // ---------- Parse type query param ----------
    const url = new URL(req.url);
    const uploadType = url.searchParams.get('type') || 'logo'; // "logo" | "animated"
    if (uploadType !== 'logo' && uploadType !== 'animated') {
      return jsonError(400, 'Query param `type` must be "logo" or "animated"');
    }

    // ---------- Parse multipart form ----------
    const formData = await req.formData();
    const file = formData.get('logo') as File | null;

    if (!file || typeof file === 'string') {
      return jsonError(400, 'Missing file field "logo"');
    }

    // ---------- Validate MIME ----------
    if (!ALLOWED_TYPES.has(file.type)) {
      return jsonError(
        400,
        `Invalid file type "${file.type}". Allowed: png, jpg, gif, svg, webp.`
      );
    }

    // ---------- Validate size ----------
    if (file.size > MAX_FILE_SIZE) {
      return jsonError(400, `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 5 MB.`);
    }

    // ---------- Read file bytes ----------
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // ---------- Upload to Storage ----------
    const ext = EXTENSION_MAP[file.type] || 'png';
    const timestamp = Date.now();
    const storagePath = `branding/${uploadType}-${timestamp}.${ext}`;

    const bucket = admin.storage().bucket(BUCKET_NAME);
    const blob = bucket.file(storagePath);

    await blob.save(buffer, {
      metadata: {
        contentType: file.type,
        metadata: {
          uploadedBy: decoded.uid,
          uploadType,
        },
      },
    });

    // Make publicly accessible
    await blob.makePublic();

    const publicUrl = `https://storage.googleapis.com/${BUCKET_NAME}/${storagePath}`;

    return NextResponse.json({
      ok: true,
      url: publicUrl,
      type: uploadType,
      storagePath,
    });
  } catch (err: any) {
    console.error('[POST /api/admin/branding/upload]', err);
    return jsonError(500, err.message || 'Internal Server Error');
  }
}
