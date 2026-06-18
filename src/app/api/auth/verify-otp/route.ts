/**
 * POST /api/auth/verify-otp
 *
 * Validates the 6-digit OTP against the stored code in Firestore.
 * On success, returns a Firebase custom token that the client uses
 * with signInWithCustomToken() to sign in directly within the PWA context.
 *
 * Body: { email: string, otp: string }
 * Returns: { ok: true, token: string } or { ok: false, error: string }
 */
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const { email, otp } = await req.json();

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json({ ok: false, error: 'Valid email address required.' }, { status: 400 });
    }
    if (!otp || typeof otp !== 'string' || otp.length !== 6) {
      return NextResponse.json({ ok: false, error: 'Invalid code format.' }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedOtp = otp.trim();

    // Look up the stored OTP
    const docRef = adminDb.collection('otpCodes').doc(normalizedEmail);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json({ ok: false, error: 'Code not found. Please request a new one.' }, { status: 400 });
    }

    const data = doc.data()!;

    // Check expiry
    if (Date.now() > data.expiresAt) {
      await docRef.delete();
      return NextResponse.json({ ok: false, error: 'Code has expired. Please request a new one.' }, { status: 400 });
    }

    // Check code match
    if (data.otp !== normalizedOtp) {
      return NextResponse.json({ ok: false, error: 'Incorrect code. Please try again.' }, { status: 400 });
    }

    // Code is valid — delete it immediately (single use)
    await docRef.delete();

    // Create a Firebase custom token for the user
    const customToken = await adminAuth.createCustomToken(data.uid);

    return NextResponse.json({ ok: true, token: customToken });
  } catch (err: any) {
    console.error('[verify-otp] error:', err);
    return NextResponse.json({ ok: false, error: 'Verification failed. Please try again.' }, { status: 500 });
  }
}
