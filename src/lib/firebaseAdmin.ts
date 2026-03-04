import 'server-only';
import admin from 'firebase-admin';

export function initAdmin() {
  if (admin.apps.length) return admin.app();

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("Missing Firebase Admin env vars");
  }

  // Hard guardrail: never allow wrong project
  if (projectId !== "smart-broker-usa") {
    throw new Error(`WRONG FIREBASE PROJECT: expected smart-broker-usa, got ${projectId}`);
  }

  return admin.initializeApp({
    credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
  });
}

export function adminDb() {
  initAdmin();
  return admin.firestore();
}
