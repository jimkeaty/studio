import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { FirebaseClientProvider } from '@/firebase/client-provider';
import { BUILD_STAMP } from '@/lib/buildStamp';

export const metadata: Metadata = {
  title: 'Smart Broker USA',
  description: 'Performance and accountability dashboard for real estate agents and brokers.',
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
      </head>
      <body className="font-body antialiased" suppressHydrationWarning>
        <FirebaseClientProvider>{children}</FirebaseClientProvider>
        <Toaster />

        {/* Build stamp: shows in live + preview so we can confirm what we're looking at */}
        <div className="fixed bottom-2 right-2 z-50 rounded-md border bg-background/90 px-2 py-1 text-[10px] text-muted-foreground shadow">
          Build: {BUILD_STAMP}
        </div>
      </body>
    </html>
  );
}