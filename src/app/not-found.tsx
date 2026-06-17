import Link from 'next/link';

export default function NotFound() {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          padding: 0,
          fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
          background: '#0f172a',
          color: '#f8fafc',
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <div style={{ fontSize: '5rem', fontWeight: 800, color: '#2563eb', lineHeight: 1 }}>
            404
          </div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: '1rem', color: '#f8fafc' }}>
            Page not found
          </h1>
          <p style={{ marginTop: '0.75rem', color: '#94a3b8', maxWidth: 360, margin: '0.75rem auto 0' }}>
            The page you&apos;re looking for doesn&apos;t exist or may have been moved.
          </p>
          <div style={{ marginTop: '2rem', display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <a
              href="/dashboard"
              style={{
                display: 'inline-block',
                padding: '0.625rem 1.25rem',
                background: '#2563eb',
                color: '#fff',
                borderRadius: '0.5rem',
                textDecoration: 'none',
                fontWeight: 600,
                fontSize: '0.875rem',
              }}
            >
              Go to Dashboard
            </a>
            <a
              href="/"
              style={{
                display: 'inline-block',
                padding: '0.625rem 1.25rem',
                background: 'transparent',
                color: '#94a3b8',
                borderRadius: '0.5rem',
                textDecoration: 'none',
                fontWeight: 600,
                fontSize: '0.875rem',
                border: '1px solid #334155',
              }}
            >
              Sign In
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
