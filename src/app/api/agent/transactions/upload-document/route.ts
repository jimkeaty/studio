// POST /api/agent/transactions/upload-document
// Accepts multipart/form-data with a `file` field.
// Uploads to Firebase Storage under transactions/documents/ and returns a signed URL.
// Any authenticated user (agent or admin) may call this endpoint.
import { NextRequest, NextResponse } from 'next/server';
import { admin, adminAuth } from '@/lib/firebase/admin';

const BUCKET_NAME = 'smart-broker-usa.firebasestorage.app';
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

const ALLOWED_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/heic',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const EXTENSION_MAP: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
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
    // ── Auth ──────────────────────────────────────────────────────────────────
    const token = extractBearer(req);
    if (!token) return jsonError(401, 'Unauthorized');

    const decoded = await adminAuth.verifyIdToken(token);
    const uid = decoded.uid;

    // ── Parse multipart form ──────────────────────────────────────────────────
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file || typeof file === 'string') {
      return jsonError(400, 'Missing file field "file"');
    }

    // ── Validate MIME ─────────────────────────────────────────────────────────
    // Some browsers send application/octet-stream for .heic — allow it
    const mimeType = file.type || 'application/octet-stream';
    const isAllowed =
      ALLOWED_TYPES.has(mimeType) ||
      (mimeType === 'application/octet-stream' && file.name.toLowerCase().endsWith('.heic'));

    if (!isAllowed) {
      return jsonError(
        400,
        `Invalid file type "${mimeType}". Allowed: PDF, JPG, PNG, WEBP, HEIC, DOC, DOCX.`
      );
    }

    // ── Validate size ─────────────────────────────────────────────────────────
    if (file.size > MAX_FILE_SIZE) {
      return jsonError(400, `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 25 MB.`);
    }

    // ── Read file bytes ───────────────────────────────────────────────────────
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // ── Build storage path ────────────────────────────────────────────────────
    // Path: transactions/documents/{uid}/{timestamp}-{sanitized-filename}
    const ext = EXTENSION_MAP[mimeType] || file.name.split('.').pop() || 'bin';
    const timestamp = Date.now();
    const safeName = file.name
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/_{2,}/g, '_')
      .slice(0, 80);
    const storagePath = `transactions/documents/${uid}/${timestamp}-${safeName}`;

    // ── Upload to Storage ─────────────────────────────────────────────────────
    const bucket = admin.storage().bucket(BUCKET_NAME);
    const blob = bucket.file(storagePath);

    await blob.save(buffer, {
      metadata: {
        contentType: mimeType,
        metadata: {
          uploadedBy: uid,
          originalName: file.name,
        },
      },
    });

    // ── Generate a long-lived signed URL (10 years) ───────────────────────────
    // Uniform bucket-level access is enabled — makePublic() does not work.
    const [signedUrl] = await blob.getSignedUrl({
      action: 'read',
      expires: Date.now() + 10 * 365 * 24 * 60 * 60 * 1000, // 10 years
    });

    return NextResponse.json({
      ok: true,
      url: signedUrl,
      name: file.name,
      storagePath,
      uploadedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('[POST /api/agent/transactions/upload-document]', err);
    return jsonError(500, err.message || 'Internal Server Error');
  }
}
