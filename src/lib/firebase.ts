'use client';
import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { firebaseConfig } from '@/firebase/config';

// Singleton pattern to prevent re-initializing the app
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

if (process.env.NODE_ENV === 'development') {
    console.log('[Firebase Runtime Config]', {
        projectId: app.options.projectId,
        authDomain: app.options.authDomain,
        appId: app.options.appId,
    });
}

export { app, auth, db };
