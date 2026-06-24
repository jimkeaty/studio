// POST /api/admin/transactions/upload-document
// Uploads a document to Firebase Storage for a transaction.
// Accessible to admin, staff, and TC users.
import { NextRequest, NextResponse } from 'next/server';
import { admin, adminAuth } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';

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

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) return jsonError(401, 'Unauthorized');
    const token = authHeader.slice('Bearer '.length).trim();
    const decoded = await adminAuth.verifyIdToken(token);
    const uid = decoded.uid;

    // Allow admin/staff/TC
    if (!(await isAdminLike(uid))) return jsonError(403, 'Forbidden');

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file || typeof file === 'string') return jsonError(400, 'Missing file field "file"');

    const mimeType = file.type || 'application/octet-stream';
    const isAllowed =
      ALLOWED_TYPES.has(mimeType) ||
      (mimeType === 'application/octet-stream' && file.name.toLowerCase().endsWith('.heic'));
    if (!isAllowed) {
      return jsonError(400, `Invalid file type "${mimeType}". Allowed: PDF, JPG, PNG, WEBP, HEIC, DOC, DOCX.`);
    }
    if (file.size > MAX_FILE_SIZE) {
      return jsonError(400, `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 25 MB.`);
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const ext = EXTENSION_MAP[mimeType] || file.name.split('.').pop() || 'bin';
    const timestamp = Date.now();
    const safeName = file.name
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/_{2,}/g, '_')
      .slice(0, 80);
    const storagePath = `transactions/documents/${uid}/${timestamp}-${safeName}`;
    const downloadToken = crypto.randomUUID();

    const bucket = admin.storage().bucket(BUCKET_NAME);
    const blob = bucket.file(storagePath);
    await blob.save(buffer, {
      metadata: {
        contentType: mimeType,
        metadata: {
          firebaseStorageDownloadTokens: downloadToken,
          uploadedBy: uid,
          originalName: file.name,
        },
      },
    });

    const encodedPath = encodeURIComponent(storagePath);
    const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${BUCKET_NAME}/o/${encodedPath}?alt=media&token=${downloadToken}`;

    return NextResponse.json({
      ok: true,
      url: downloadUrl,
      name: file.name,
      storagePath,
      uploadedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('[POST /api/admin/transactions/upload-document]', err);
    return NextResponse.json({ ok: false, error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
