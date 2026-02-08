'use client';

import { useEffect, useState } from 'react';
import { errorEmitter } from '@/firebase/error-emitter';
import type { FirestorePermissionError } from '@/firebase/errors';

// This component listens for permission errors and throws them so that
// the Next.js error overlay can catch and display them during development.
// It does nothing in production.
export function FirebaseErrorListener({ children }: { children: React.ReactNode }) {
  const [error, setError] = useState<FirestorePermissionError | null>(null);

  useEffect(() => {
    const handleError = (e: FirestorePermissionError) => {
      setError(e);
    };

    errorEmitter.on('permission-error', handleError);

    // This listener should not be removed, so we don't return a cleanup function.
  }, []);

  if (error && process.env.NODE_ENV === 'development') {
    // This throw will be caught by the Next.js error overlay, showing rich context.
    throw error;
  }

  return <>{children}</>;
}
