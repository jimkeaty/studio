'use client';

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { app, auth, db } from '@/lib/firebase';
import { FirebaseProvider } from './provider';

export function FirebaseClientProvider({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
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
