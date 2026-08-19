import { NextRequest, NextResponse } from 'next/server';
import { admin, adminAuth, adminDb } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';

const BUCKET_NAME = 'smart-broker-usa.firebasestorage.app';

function documentKey(document: any) {
  return String(document?.storagePath || document?.path || document?.storageKey || document?.url || '').trim();
}

function mergeDocuments(existing: any[], additions: any[]) {
  const merged = new Map<string, any>();
  for (const document of [...existing, ...additions]) {
    if (!document || typeof document !== 'object') continue;
    const key = documentKey(document);
    if (!key) continue;
    merged.set(key, { ...(merged.get(key) || {}), ...document });
  }
  return Array.from(merged.values());
}

export async function POST(req: NextRequest) {
  try {
    const authorization = req.headers.get('Authorization') || '';
    if (!authorization.startsWith('Bearer ')) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(authorization.slice('Bearer '.length).trim());
    if (!(await isAdminLike(decoded.uid))) {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const transactionId = String(body?.transactionId || '').trim();
    const storagePaths = Array.isArray(body?.storagePaths)
      ? Array.from(new Set(body.storagePaths.map((value: unknown) => String(value || '').trim()).filter(Boolean)))
      : [];
    if (!transactionId || storagePaths.length === 0) {
      return NextResponse.json({ ok: false, error: 'transactionId and approved storagePaths are required' }, { status: 400 });
    }

    const transactionRef = adminDb.collection('transactions').doc(transactionId);
    const transactionSnap = await transactionRef.get();
    if (!transactionSnap.exists) {
      return NextResponse.json({ ok: false, error: 'Transaction not found' }, { status: 404 });
    }
    const transaction = transactionSnap.data() as Record<string, any>;

    let uploaderUid = String(transaction.agentUid || transaction.submittedByUid || '').trim();
    if (!uploaderUid && transaction.agentId) {
      const profile = await adminDb.collection('agentProfiles').doc(String(transaction.agentId)).get();
      uploaderUid = String(profile.data()?.firebaseUid || '').trim();
    }
    if (!uploaderUid) {
      return NextResponse.json({ ok: false, error: 'Unable to verify transaction document owner' }, { status: 400 });
    }

    const ownerPrefix = `transactions/documents/${uploaderUid}/`;
    if (storagePaths.some((storagePath) => !storagePath.startsWith(ownerPrefix))) {
      return NextResponse.json({ ok: false, error: 'Approved storage paths must belong to the transaction owner' }, { status: 400 });
    }

    const bucket = admin.storage().bucket(BUCKET_NAME);
    const recoveredDocuments: any[] = [];
    for (const storagePath of storagePaths) {
      const file = bucket.file(storagePath);
      const [exists] = await file.exists();
      if (!exists) {
        return NextResponse.json({ ok: false, error: `Storage file not found: ${storagePath}` }, { status: 404 });
      }
      const [metadata] = await file.getMetadata();
      const originalName = String(metadata.metadata?.originalName || storagePath.split('/').pop() || '(unnamed)');
      const downloadToken = String(metadata.metadata?.firebaseStorageDownloadTokens || '').split(',')[0].trim();
      const url = downloadToken
        ? `https://firebasestorage.googleapis.com/v0/b/${BUCKET_NAME}/o/${encodeURIComponent(storagePath)}?alt=media&token=${downloadToken}`
        : undefined;
      recoveredDocuments.push({
        name: originalName,
        storagePath,
        ...(url ? { url } : {}),
        uploadedAt: metadata.timeCreated || new Date().toISOString(),
        recoveredAt: new Date().toISOString(),
        recoveredByUid: decoded.uid,
      });
    }

    const mergedDocuments = mergeDocuments(Array.isArray(transaction.documents) ? transaction.documents : [], recoveredDocuments);
    await transactionRef.update({
      documents: mergedDocuments,
      documentsRecoveredAt: new Date().toISOString(),
      documentsRecoveredByUid: decoded.uid,
      updatedAt: new Date().toISOString(),
    });

    return NextResponse.json({
      ok: true,
      transactionId,
      restoredCount: recoveredDocuments.length,
      totalDocumentCount: mergedDocuments.length,
      documents: recoveredDocuments.map((document) => ({ name: document.name, storagePath: document.storagePath })),
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'Unknown error' }, { status: 500 });
  }
}
