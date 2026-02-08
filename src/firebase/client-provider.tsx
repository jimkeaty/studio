'use client';
import { useMemo, type ReactNode } from 'react';
import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

import { firebaseConfig } from './config';
import { FirebaseProvider } from './provider';

export function FirebaseClientProvider({ children }: { children: ReactNode }) {
    const firebase = useMemo(() => {
        const apps = getApps();
        if (apps.length === 0) {
            const app = initializeApp(firebaseConfig);
            const auth = getAuth(app);
            const db = getFirestore(app);
            return { app, auth, db };
        } else {
            const app = getApp();
            const auth = getAuth(app);
            const db = getFirestore(app);
            return { app, auth, db };
        }
    }, []);

    return <FirebaseProvider value={firebase}>{children}</FirebaseProvider>;
}
