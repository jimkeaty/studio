// src/app/api/admin/branding/upload/route.ts
// POST /api/admin/branding/upload?type=logo|animated
// Accepts multipart/form-data with a `logo` file field.
// Uploads to Firebase Storage and returns a permanent download URL using
// Firebase Storage download tokens (no IAM signBlob permission required).
import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { admin, adminAuth } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';

const BUCKET_NAME = 'smart-broker-usa.firebasestorage.app';
const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15 MB
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

/**
 * Build a permanent Firebase Storage download URL from a storage path and token.
 * Format: https://firebasestorage.googleapis.com/v0/b/{bucket}/o/{encodedPath}?alt=media&token={token}
 */
function buildDownloadUrl(bucket: string, storagePath: string, token: string): string {
  const encodedPath = encodeURIComponent(storagePath);
  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodedPath}?alt=media&token=${token}`;
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
    const uploadType = url.searchParams.get('type') || 'logo'; // "logo" | "animated" | "pwaIcon"
    if (uploadType !== 'logo' && uploadType !== 'animated' && uploadType !== 'pwaIcon') {
      return jsonError(400, 'Query param `type` must be "logo", "animated", or "pwaIcon"');
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
      return jsonError(400, `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 15 MB.`);
    }

    // ---------- Read file bytes ----------
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // ---------- Generate a download token ----------
    // Setting firebaseStorageDownloadTokens in the metadata creates a permanent
    // public download URL without requiring iam.serviceAccountTokenCreator.
    const downloadToken = uuidv4();

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
          // This token is what Firebase uses to generate the public download URL
          firebaseStorageDownloadTokens: downloadToken,
        },
      },
    });

    // ---------- Build permanent download URL ----------
    const downloadUrl = buildDownloadUrl(BUCKET_NAME, storagePath, downloadToken);

    return NextResponse.json({
      ok: true,
      url: downloadUrl,
      type: uploadType,
      storagePath,
    });
  } catch (err: any) {
    console.error('[POST /api/admin/branding/upload]', err);
    return jsonError(500, err.message || 'Internal Server Error');
  }
}
