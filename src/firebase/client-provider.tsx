'use client';

import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { getRedirectResult } from 'firebase/auth';
import { getFirebaseApp, getFirebaseAuth } from '@/lib/firebase';
import { FirebaseProvider } from './provider';

export function FirebaseClientProvider({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);

  // Create app/auth once on the client
  const app = useMemo(() => getFirebaseApp(), []);
  const auth = useMemo(() => getFirebaseAuth(), []);

  useEffect(() => {
    setMounted(true);

    // Process Google redirect sign-in result (no-op if not in redirect flow)
    getRedirectResult(auth)
      .then((result) => {
        if (result && process.env.NODE_ENV === 'development') {
          console.log('Firebase redirect result processed successfully.');
        }
      })
      .catch((error) => {
        console.error('Error processing Firebase redirect result:', error);
      });
  }, [auth]);

  // Prevent hydration mismatch by ensuring server + first client render match
  if (!mounted) return null;

  return <FirebaseProvider value={{ app, auth }}>{children}</FirebaseProvider>;
}
