/**
 * Client Firebase init (AUTH ONLY).
 * No Firestore client usage is allowed in this app.
 */
import { initializeApp, getApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";

type WebAppConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  databaseURL?: string;
};

function readWebAppConfig(): WebAppConfig {
  // Firebase App Hosting provides FIREBASE_WEBAPP_CONFIG at build time.
  // Locally, you may need NEXT_PUBLIC_FIREBASE_* env vars.
  const raw = process.env.FIREBASE_WEBAPP_CONFIG;

  if (raw) {
    return JSON.parse(raw) as WebAppConfig;
  }

  // Local fallback (optional). If you don't have these, set them in .env.local.
  const cfg: WebAppConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
    databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL || "",
  };

  return cfg;
}

export function getFirebaseApp(): FirebaseApp {
  const config = readWebAppConfig();

  if (!config.apiKey || !config.authDomain || !config.projectId || !config.appId) {
    throw new Error(
      "Missing Firebase Web App config. Provide FIREBASE_WEBAPP_CONFIG (App Hosting) or NEXT_PUBLIC_FIREBASE_* env vars (local)."
    );
  }

  return getApps().length ? getApp() : initializeApp(config);
}

export function getFirebaseAuth(): Auth {
  return getAuth(getFirebaseApp());
}
