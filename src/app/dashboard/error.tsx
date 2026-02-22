'use client'; // Error components must be Client Components

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error(error);
  }, [error]);

  return (
    <div style={{ padding: '2rem', textAlign: 'center', fontFamily: 'sans-serif' }}>
      <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#dc2626' }}>Something Went Wrong</h2>
      <p style={{ marginTop: '1rem', color: '#4b5563' }}>
        An unexpected error occurred. This simplified error page is shown because the main error display failed to load.
      </p>
      <div style={{
          marginTop: '1.5rem',
          padding: '1rem',
          border: '1px solid #e5e7eb',
          borderRadius: '0.5rem',
          background: '#f9fafb',
          textAlign: 'left',
          color: '#1f2937'
        }}>
        <p style={{ fontWeight: 'bold' }}>Error Message:</p>
        <pre style={{
            marginTop: '0.5rem',
            whiteSpace: 'pre-wrap',
            fontFamily: 'monospace',
            fontSize: '0.875rem',
            color: '#be123c',
          }}>
          {error.message}
        </pre>
      </div>
      <button
        onClick={() => reset()}
        style={{
          marginTop: '1.5rem',
          padding: '0.5rem 1rem',
          border: '1px solid transparent',
          borderRadius: '0.375rem',
          background: '#111827',
          color: '#ffffff',
          cursor: 'pointer'
        }}
      >
        Try Again
      </button>
    </div>
  );
}
