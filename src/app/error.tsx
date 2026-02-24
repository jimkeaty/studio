'use client';

import { useEffect } from 'react';

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[RootError]', error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ padding: 24, fontFamily: 'Inter, system-ui, sans-serif' }}>
        <h2 style={{ fontSize: 20, fontWeight: 700 }}>App hit an error</h2>
        <p style={{ marginTop: 8 }}>
          This is the global error boundary. It should stop refresh loops and show the real message.
        </p>
        <pre
          style={{
            marginTop: 12,
            whiteSpace: 'pre-wrap',
            background: '#f5f5f5',
            padding: 12,
            borderRadius: 8,
          }}
        >
          {error?.message}
        </pre>
        <button
          onClick={() => reset()}
          style={{
            marginTop: 16,
            padding: '10px 14px',
            borderRadius: 8,
            border: '1px solid #ccc',
            cursor: 'pointer',
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
