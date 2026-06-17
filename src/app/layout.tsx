import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { FirebaseClientProvider } from '@/firebase/client-provider';
import BuildBadge from '@/components/BuildBadge';

export const metadata: Metadata = {
  title: 'Smart Broker USA',
  description: 'Performance and accountability dashboard for real estate agents and brokers.',
  // NOTE: Do NOT set metadata.manifest here — Next.js overrides it to /manifest.json
  // which bypasses our dynamic /manifest route. The <link rel="manifest"> tag is
  // set manually in the <head> below, pointing to /manifest (the dynamic route).
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Smart Broker',
  },
  // NOTE: Do NOT set metadata.icons here — Next.js ignores query strings (?v=2)
  // on icon URLs, so cache-busting doesn't work. Icons are set manually below.
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
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="mobile-web-app-capable" content="yes" />
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
