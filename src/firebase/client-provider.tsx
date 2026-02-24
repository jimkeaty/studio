'use client';

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { getRedirectResult } from 'firebase/auth';
import { app, auth, db } from '@/lib/firebase';
import { FirebaseProvider } from './provider';

export function FirebaseClientProvider({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // This will process the redirect result from Google Sign-In when the app loads.
    // This is a crucial step in the redirect sign-in flow.
    getRedirectResult(auth)
      .then((result) => {
        if (result) {
          // You could log analytics here or handle new user creation if needed.
          if (process.env.NODE_ENV === 'development') {
            console.log('Firebase redirect result processed successfully.');
          }
        }
      })
      .catch((error) => {
        // Handle errors here, such as account-exists-with-different-credential
        console.error('Error processing Firebase redirect result:', error);
      });
  }, []);

  // Prevent hydration mismatch by ensuring server + first client render match
  if (!mounted) {
    return null;
  }

  return (
    <FirebaseProvider value={{ app, auth, db }}>
      {children}
    </FirebaseProvider>
  );
}
