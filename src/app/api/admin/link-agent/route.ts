// src/app/api/admin/link-agent/route.ts
import { NextRequest, NextResponse } from 'next/server';
import admin from 'firebase-admin';

// --- Firebase Admin Initialization ---
if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId: 'smart-broker-usa',
    });
  } catch (error) {
    console.error('Firebase admin initialization error', error);
  }
}
const db = admin.firestore();

// --- API Helper ---
function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

// --- Route Handler ---
export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate and Authorize
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return jsonError(401, 'Unauthorized: Missing token');
    }
    const idToken = authHeader.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const uid = decodedToken.uid;
    const email = decodedToken.email;

    // 2. Hardcoded Admin Check
    if (email !== 'jim@keatyrealestate.com') {
      return jsonError(403, 'Forbidden: This action is restricted to administrators.');
    }

    // 3. Get agentId from request body
    const body = await req.json();
    const { agentId } = body;

    if (!agentId || typeof agentId !== 'string') {
      return jsonError(400, 'Bad Request: Missing or invalid "agentId" in request body.');
    }

    // 4. Update the user document with the agentId
    const userRef = db.collection('users').doc(uid);
    await userRef.set({ agentId: agentId }, { merge: true });

    // 5. Return success response
    return NextResponse.json({ ok: true, uid, agentId });

  } catch (error: any) {
    console.error('[API/admin/link-agent] Error:', error);
    if (error.code && error.code.startsWith('auth/')) {
        return jsonError(401, `Unauthorized: ${error.message}`);
    }
    return jsonError(500, 'Internal Server Error');
  }
}
