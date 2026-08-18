import { NextRequest, NextResponse } from 'next/server';
import { admin, adminAuth, adminDb } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';

const BUCKET_NAME = 'smart-broker-usa.firebasestorage.app';

function documentSummary(document: any) {
  if (!document || typeof document !== 'object') return null;
  return {
    name: String(document.name || document.fileName || document.title || '(unnamed)'),
    storagePath: String(document.storagePath || document.path || document.storageKey || ''),
    hasUrl: Boolean(document.url || document.downloadURL || document.storagePath || document.path || document.storageKey),
  };
}

function readDocuments(raw: Record<string, any> | undefined) {
  return Array.isArray(raw?.documents) ? raw!.documents.map(documentSummary).filter(Boolean) : [];
}

function toMillis(value: any) {
  if (!value) return null;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  const parsed = new Date(String(value)).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    if (!(await isAdminLike(decoded.uid))) return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });

    const transactionId = String(req.nextUrl.searchParams.get('transactionId') || '').trim();
    if (!transactionId) return NextResponse.json({ ok: false, error: 'transactionId is required' }, { status: 400 });

    const transactionSnap = await adminDb.collection('transactions').doc(transactionId).get();
    if (!transactionSnap.exists) return NextResponse.json({ ok: false, error: 'Transaction not found' }, { status: 404 });
    const transaction = transactionSnap.data() as Record<string, any>;
    const intakeId = String(transaction.intakeId || transaction.approvedIntakeId || '').trim();

    const intakeRecords: Array<{ collection: string; id: string; documents: any[] }> = [];
    if (intakeId) {
      for (const collection of ['tcIntakes', 'transactionIntakes']) {
        const intakeSnap = await adminDb.collection(collection).doc(intakeId).get();
        if (intakeSnap.exists) intakeRecords.push({ collection, id: intakeSnap.id, documents: readDocuments(intakeSnap.data() as Record<string, any>) });
      }
    }

    let uploaderUid = String(transaction.agentUid || transaction.submittedByUid || '').trim();
    if (!uploaderUid && transaction.agentId) {
      const profileSnap = await adminDb.collection('agentProfiles').doc(String(transaction.agentId)).get();
      uploaderUid = String(profileSnap.data()?.firebaseUid || '').trim();
    }

    const sourceCreatedAt = toMillis(transaction.createdAt) || toMillis(transaction.submittedAt) || null;
    let storageCandidates: any[] = [];
    if (uploaderUid) {
      const [files] = await admin.storage().bucket(BUCKET_NAME).getFiles({
        prefix: `transactions/documents/${uploaderUid}/`,
        maxResults: 1000,
      });
      storageCandidates = files
        .map((file) => {
          const metadata = file.metadata || {};
          const createdAt = metadata.timeCreated || metadata.updated || null;
          const createdMillis = toMillis(createdAt);
          return {
            name: String(metadata.metadata?.originalName || file.name.split('/').pop() || '(unnamed)'),
            storagePath: file.name,
            createdAt,
            withinSevenDaysOfTransaction: sourceCreatedAt && createdMillis
              ? Math.abs(createdMillis - sourceCreatedAt) <= 7 * 24 * 60 * 60 * 1000
              : null,
          };
        })
        .filter((candidate) => candidate.withinSevenDaysOfTransaction !== false)
        .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
        .slice(0, 100);
    }

    return NextResponse.json({
      ok: true,
      transaction: {
        id: transactionId,
        address: transaction.propertyAddress || transaction.address || null,
        canonicalDocuments: readDocuments(transaction),
        intakeId: intakeId || null,
        uploaderUidFound: Boolean(uploaderUid),
      },
      intakeRecords,
      storageCandidates,
      note: 'Read-only metadata only. No file contents or document references were changed.',
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'Unknown error' }, { status: 500 });
  }
}
