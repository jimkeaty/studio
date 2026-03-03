// src/app/api/admin/link-agent/route.ts
import { NextRequest, NextResponse } from 'next/server';
import admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: 'smart-broker-usa',
  });
}
const db = admin.firestore();

function jsonError(status: number, error: string, details?: any) {
  return NextResponse.json({ ok: false, error, details: details || null }, { status });
}

function extractBearerToken(req: NextRequest): string | null {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  return authHeader.split('Bearer ')[1]?.trim() || null;
}

const ADMIN_EMAILS = new Set([
  'jim@keatyrealestate.com',
]);

export async function POST(req: NextRequest) {
  try {
    // 1) Authenticate caller
    const idToken = extractBearerToken(req);
    if (!idToken) return jsonError(401, 'Unauthorized: Missing token');

    const decoded = await admin.auth().verifyIdToken(idToken);
    const callerEmail = decoded.email || '';

    // 2) Authorize caller
    if (!ADMIN_EMAILS.has(callerEmail)) {
      return jsonError(403, 'Forbidden: This action is restricted to administrators.');
    }

    // 3) Parse body
    const body = await req.json();
    const { agentId, targetUid, targetEmail } = body as {
      agentId?: string;
      targetUid?: string;
      targetEmail?: string;
    };

    if (!agentId || typeof agentId !== 'string') {
      return jsonError(400, 'Bad Request: Missing or invalid "agentId".');
    }


      // If no target specified, default to linking the caller (self-link).
      const hasTargetUid = !!targetUid && typeof targetUid === 'string';
      const hasTargetEmail = !!targetEmail && typeof targetEmail === 'string';

      let resolvedUid = hasTargetUid ? targetUid : undefined;
      let resolvedEmail = hasTargetEmail ? targetEmail : undefined;

      if (!resolvedUid && !resolvedEmail) {
        resolvedUid = decoded.uid;
        resolvedEmail = decoded.email || undefined;
      }


    if (!resolvedUid) {
      // look up by email
      const u = await admin.auth().getUserByEmail(resolvedEmail!);
      resolvedUid = u.uid;
      resolvedEmail = u.email || resolvedEmail;
    } else if (!resolvedEmail) {
      // look up email for convenience/confirmation
      const u = await admin.auth().getUser(resolvedUid);
      resolvedEmail = u.email || undefined;
    }

    // 5) Write link
    const userRef = db.collection('users').doc(resolvedUid!);
    await userRef.set(
      {
        agentId,
        linkedBy: callerEmail,
        linkedAt: admin.firestore.FieldValue.serverTimestamp(),
        targetEmail: resolvedEmail || null,
      },
      { merge: true }
    );

    return NextResponse.json({
      ok: true,
      agentId,
      targetUid: resolvedUid,
      targetEmail: resolvedEmail || null,
    });
  } catch (error: any) {
    console.error('[API/admin/link-agent] Error:', { code: error?.code, message: error?.message });

    if (error?.code?.startsWith?.('auth/')) {
      return jsonError(401, `Unauthorized: ${error.message}`);
    }
    return jsonError(500, 'Internal Server Error', { message: error?.message || String(error) });
  }
}