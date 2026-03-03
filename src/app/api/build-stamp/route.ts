import { NextResponse } from 'next/server';
import { BUILD_STAMP } from '@/lib/buildStamp';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      build: BUILD_STAMP,
      now: new Date().toISOString(),
    },
    {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    }
  );
}
