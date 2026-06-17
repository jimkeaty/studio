import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { FirebaseClientProvider } from '@/firebase/client-provider';
import BuildBadge from '@/components/BuildBadge';

export const metadata: Metadata = {
  title: 'Smart Broker USA',
  description: 'Performance and accountability dashboard for real estate agents and brokers.',
  // IMPORTANT: Do NOT add manifest, icons, or appleWebApp here.
  // Next.js metadata auto-generates <link> tags for these that:
  //   - Strip ?v=2 cache-busting query strings from icon URLs
  //   - Point manifest to /manifest.json (static) instead of /manifest (dynamic)
  //   - Duplicate the apple-touch-icon tag without the correct sizes attribute
  // All PWA-related tags are set manually in the <head> block below.
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f5f7fa' },
    { media: '(prefers-color-scheme: dark)',  color: '#0f172a' },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        {/* PWA — v2 query string forces iOS Safari to bust its apple-touch-icon cache */}
        <link rel="manifest" href="/manifest" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png?v=2" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon.png?v=2" />
        <link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192x192.png?v=2" />
        {/* Note: apple-mobile-web-app-capable intentionally removed.
            That meta tag forces iOS to treat Add-to-Home-Screen as a standalone
            PWA with isolated storage, which breaks Google OAuth sign-in.
            Without it, Add-to-Home-Screen creates a Safari bookmark that shares
            the Safari session — so agents stay signed in. */}
      </head>
      <body className="font-body antialiased" suppressHydrationWarning>
        <FirebaseClientProvider>{children}</FirebaseClientProvider>
        <Toaster />

        {/* Build stamp: shows in live + preview so we can confirm what we're looking at */}
        <div className="fixed bottom-2 right-2 z-50 rounded-md border bg-background/90 px-2 py-1 text-[10px] text-muted-foreground shadow">
  <BuildBadge />
</div>
      </body>
    </html>
  );
}
