import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
export const runtime = 'nodejs';
// TEMPORARY DEBUG ENDPOINT - remove after diagnosis
export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get('email') || '';
  if (!email) return NextResponse.json({ error: 'no email param' });
  try {
    const docRef = adminDb.collection('otpCodes').doc(email.toLowerCase().trim());
    const doc = await docRef.get();
    if (!doc.exists) {
      // Also list all docs in the collection to see what's there
      const all = await adminDb.collection('otpCodes').limit(10).get();
      const docs = all.docs.map(d => ({ id: d.id, expiresAt: d.data().expiresAt }));
      return NextResponse.json({ exists: false, allDocs: docs });
    }
    const data = doc.data()!;
    return NextResponse.json({
      exists: true,
      expiresAt: data.expiresAt,
      expiresIn: Math.round((data.expiresAt - Date.now()) / 1000) + 's',
      uid: data.uid,
      hasOtp: !!data.otp,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message, code: e.code });
  }
}
