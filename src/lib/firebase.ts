/**
 * Client Firebase init (AUTH ONLY).
 * No Firestore client usage is allowed in this app.
 *
 * Build-safe: when FIREBASE_WEBAPP_CONFIG is absent at build time (e.g. during
 * Next.js static generation), getFirebaseApp() initialises a placeholder app
 * with dummy credentials instead of throwing.  The real config is always
 * present at runtime (App Hosting injects FIREBASE_WEBAPP_CONFIG; local dev
 * uses NEXT_PUBLIC_FIREBASE_* from .env.local).
 */
import { initializeApp, getApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { FIREBASE_WEBAPP_CONFIG_JSON } from "@/lib/firebaseWebAppConfig";

type WebAppConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  databaseURL?: string;
};

/** Dummy config used only during Next.js static-generation (build time). */
const PLACEHOLDER_CONFIG: WebAppConfig = {
  apiKey: "build-placeholder",
  authDomain: "build-placeholder.firebaseapp.com",
  projectId: "build-placeholder",
  storageBucket: "build-placeholder.appspot.com",
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:0000000000000000000000",
};

function readWebAppConfig(): WebAppConfig {
  const raw =
    FIREBASE_WEBAPP_CONFIG_JSON ||
    process.env.NEXT_PUBLIC_FIREBASE_WEBAPP_CONFIG;

  if (raw) {
    try {
      return JSON.parse(raw) as WebAppConfig;
    } catch {
      // fall through to env-var path
    }
  }

  // Local fallback: individual NEXT_PUBLIC_FIREBASE_* env vars (.env.local)
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (apiKey) {
    return {
      apiKey,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
      databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL || "",
    };
  }

  // Build-time fallback: return placeholder so Next.js static generation
  // does not throw.  This app is never actually used at runtime.
  return PLACEHOLDER_CONFIG;
}

export function getFirebaseApp(): FirebaseApp {
  // Reuse existing app if already initialised
  if (getApps().length) return getApp();

  const config = readWebAppConfig();

  // ── authDomain: use the Firebase default (firebaseapp.com) ─────────────────
  // We use signInWithPopup exclusively. The popup opens at:
  //   https://[authDomain]/__/auth/handler
  // Firebase App Hosting does NOT serve /__/auth/handler on the hosted.app
  // domain — only the Firebase default domain (smart-broker-usa.firebaseapp.com)
  // serves this route. So we must NOT override authDomain to window.location.hostname.
  //
  // The hosted.app domain is listed in Firebase Console → Authentication →
  // Authorized Domains, which is all that's needed for signInWithPopup to work
  // cross-origin (the popup opens on firebaseapp.com, then posts a message back
  // to the app origin — no redirect needed).

  // Always initialise as [DEFAULT] so that getApp() and getAuth() work
  // everywhere, including during Next.js static generation with the placeholder.
  return initializeApp(config);
}

export function getFirebaseAuth(): Auth {
  return getAuth(getFirebaseApp());
}
