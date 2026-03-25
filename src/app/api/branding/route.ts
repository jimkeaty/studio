// GET /api/branding — public endpoint to fetch branding settings (no auth required)
// Used by the sidebar and other client components to display the company name/logo
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';

export async function GET() {
  try {
    const doc = await adminDb.collection('brandingSettings').doc('default').get();

    if (!doc.exists) {
      return NextResponse.json({
        ok: true,
        branding: {
          companyName: 'Smart Broker USA',
          tagline: null,
          logoUrl: null,
          animatedLogoUrl: null,
          useAnimatedLogo: false,
          primaryColor: null,
        },
      });
    }

    const data = doc.data()!;
    return NextResponse.json({
      ok: true,
      branding: {
        companyName: data.companyName ?? 'Smart Broker USA',
        tagline: data.tagline ?? null,
        logoUrl: data.logoUrl ?? null,
        animatedLogoUrl: data.animatedLogoUrl ?? null,
        useAnimatedLogo: data.useAnimatedLogo ?? false,
        primaryColor: data.primaryColor ?? null,
      },
    });
  } catch (err: any) {
    console.error('[GET /api/branding]', err);
    // Return defaults on error so the sidebar doesn't break
    return NextResponse.json({
      ok: true,
      branding: {
        companyName: 'Smart Broker USA',
        tagline: null,
        logoUrl: null,
        animatedLogoUrl: null,
        useAnimatedLogo: false,
        primaryColor: null,
      },
    });
  }
}
