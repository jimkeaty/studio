// GET /manifest — dynamic web app manifest
// Reads branding settings from Firestore and returns a manifest.json
// with the custom PWA icon if one has been uploaded, otherwise falls
// back to the default static icons.
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  let pwaIconUrl: string | null = null;
  let companyName = 'Smart Broker USA';
  let primaryColor = '#2563eb';

  try {
    const doc = await adminDb.collection('brandingSettings').doc('default').get();
    if (doc.exists) {
      const data = doc.data()!;
      pwaIconUrl = data.pwaIconUrl ?? null;
      companyName = data.companyName ?? companyName;
      primaryColor = data.primaryColor ?? primaryColor;
    }
  } catch {
    // Fall back to defaults on error
  }

  const icons = pwaIconUrl
    ? [
        { src: pwaIconUrl, sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        { src: pwaIconUrl, sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
      ]
    : [
        { src: '/icons/icon-72x72.png',   sizes: '72x72',   type: 'image/png', purpose: 'any' },
        { src: '/icons/icon-96x96.png',   sizes: '96x96',   type: 'image/png', purpose: 'any' },
        { src: '/icons/icon-128x128.png', sizes: '128x128', type: 'image/png', purpose: 'any' },
        { src: '/icons/icon-144x144.png', sizes: '144x144', type: 'image/png', purpose: 'any' },
        { src: '/icons/icon-152x152.png', sizes: '152x152', type: 'image/png', purpose: 'any' },
        { src: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
        { src: '/icons/icon-384x384.png', sizes: '384x384', type: 'image/png', purpose: 'any' },
        { src: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
      ];

  const manifest = {
    name: companyName,
    short_name: companyName.split(' ')[0] || companyName,
    description: `Performance and accountability dashboard for ${companyName}.`,
    start_url: '/dashboard',
    display: 'browser',
    orientation: 'portrait-primary',
    background_color: primaryColor,
    theme_color: primaryColor,
    categories: ['business', 'productivity'],
    icons,
    shortcuts: [
      {
        name: 'Add Deal',
        short_name: 'Add Deal',
        description: 'Submit a new transaction',
        url: '/dashboard/transactions/new',
        icons: [{ src: pwaIconUrl || '/icons/icon-96x96.png', sizes: '96x96' }],
      },
      {
        name: 'Daily Tracker',
        short_name: 'Tracker',
        description: 'Log today\'s activity',
        url: '/dashboard/tracker',
        icons: [{ src: pwaIconUrl || '/icons/icon-96x96.png', sizes: '96x96' }],
      },
      {
        name: 'My Dashboard',
        short_name: 'Dashboard',
        description: 'View your performance',
        url: '/dashboard',
        icons: [{ src: pwaIconUrl || '/icons/icon-96x96.png', sizes: '96x96' }],
      },
    ],
    prefer_related_applications: false,
  };

  return new NextResponse(JSON.stringify(manifest, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/manifest+json',
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=60',
    },
  });
}
