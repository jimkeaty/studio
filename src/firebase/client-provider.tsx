'use client';
import { initializeFirebase, FirebaseProvider } from '@/firebase';
import { type ReactNode } from 'react';

export function FirebaseClientProvider({ children }: { children: ReactNode }) {
    const firebase = initializeFirebase();
    return <FirebaseProvider value={firebase}>{children}</FirebaseProvider>;
}
