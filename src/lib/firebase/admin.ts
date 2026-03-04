import admin from 'firebase-admin';

// This file ensures that Firebase Admin is initialized only once.
// All server-side API routes should import this `adminDb` and `adminAuth`
// instead of initializing their own instance.

if (!admin.apps.length) {
  admin.initializeApp({
    // In Firebase App Hosting and Cloud Functions v2, Application Default Credentials
    // are used automatically. No explicit configuration is needed.
    // For local development, ensure you've run `gcloud auth application-default login`.
  });
}

const adminDb = admin.firestore();
const adminAuth = admin.auth();

export { admin, adminDb, adminAuth };
