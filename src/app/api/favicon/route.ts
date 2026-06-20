// GET /api/favicon — dynamic favicon proxy
// Reads pwaIconUrl from Firestore brandingSettings and streams it back.
// Falls back to the static /favicon.png redirect if none is set.
// Used in layout.tsx so the browser tab icon updates when branding changes.
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    const doc = await adminDb.collection('brandingSettings').doc('default').get();
    if (doc.exists) {
      const data = doc.data()!;
      const pwaIconUrl: string | null = data.pwaIconUrl ?? null;
      if (pwaIconUrl) {
        // Fetch the icon and proxy it so browsers treat it as a local resource
        const upstream = await fetch(pwaIconUrl, { cache: 'no-store' });
        if (upstream.ok) {
          const contentType = upstream.headers.get('content-type') || 'image/png';
          const body = await upstream.arrayBuffer();
          return new NextResponse(body, {
            status: 200,
            headers: {
              'Content-Type': contentType,
              'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
            },
          });
        }
      }
    }
  } catch {
    // Fall through to static fallback
  }

  // No custom icon — redirect to the static default favicon
  const origin = req.nextUrl.origin;
  return NextResponse.redirect(`${origin}/favicon.png`, { status: 302 });
}
