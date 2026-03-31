'use client';

/**
 * global-error.tsx
 *
 * This is the root-level error boundary for Next.js App Router.
 * It must NOT use React hooks (useEffect, useContext, etc.) because
 * Next.js prerenders this page during `next build` and hooks cannot
 * be called during static generation.
 *
 * Keep this component hook-free to prevent the build error:
 * "TypeError: Cannot read properties of null (reading 'useContext')"
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ padding: 24, fontFamily: 'Inter, system-ui, sans-serif' }}>
        <h2 style={{ fontSize: 20, fontWeight: 700 }}>Something went wrong</h2>
        <p style={{ marginTop: 8, color: '#666' }}>
          An unexpected error occurred. Please try refreshing the page.
        </p>
        {error?.message && (
          <pre
            style={{
              marginTop: 12,
              whiteSpace: 'pre-wrap',
              background: '#f5f5f5',
              padding: 12,
              borderRadius: 8,
              fontSize: 13,
            }}
          >
            {error.message}
          </pre>
        )}
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
