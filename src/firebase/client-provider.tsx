'use client';
import type { ReactNode } from 'react';
import { app, auth, db } from '@/lib/firebase';
import { FirebaseProvider } from './provider';

export function FirebaseClientProvider({ children }: { children: ReactNode }) {
    return (
        <FirebaseProvider value={{ app, auth, db }}>
            {children}
        </FirebaseProvider>
    );
}
