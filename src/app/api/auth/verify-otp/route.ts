/**
 * POST /api/auth/verify-otp
 *
 * Verifies the 6-digit OTP against the HMAC session token returned by send-otp.
 * Completely stateless — no Firestore required.
 *
 * Body: { email: string, otp: string, sessionToken: string }
 * Returns: { ok: true, customToken: string } or { ok: false, error: string }
 */
import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import admin from 'firebase-admin';

export const runtime = 'nodejs';

/**
 * Get or initialise a Firebase Admin app that uses the explicit service account
 * credentials from env vars.  We use a named app ("otp-signer") so it doesn't
 * conflict with the default app used by other routes.
 */
function getAdminAuth() {
  const appName = 'otp-signer';
  if (admin.apps.find((a) => a?.name === appName)) {
    return admin.app(appName).auth();
  }

  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'smart-broker-usa';

  if (!clientEmail || !privateKey) {
    throw new Error('FIREBASE_CLIENT_EMAIL or FIREBASE_PRIVATE_KEY env vars are missing');
  }

  const app = admin.initializeApp(
    {
      credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
    },
    appName
  );
  return app.auth();
}

function getOtpSecret(): string {
  return process.env.RESEND_API_KEY || 'fallback-otp-secret';
}

function verifyOtpToken(
  sessionToken: string,
  email: string,
  otp: string
): { valid: boolean; uid?: string } {
  try {
    const [dataPart, hmacPart] = sessionToken.split('.');
    if (!dataPart || !hmacPart) return { valid: false };

    const payload = Buffer.from(dataPart, 'base64url').toString('utf-8');
    const [tokenEmail, tokenOtp, tokenExpiresAt, tokenUid] = payload.split('|');

    // Verify HMAC
    const expectedHmac = createHmac('sha256', getOtpSecret()).update(payload).digest('hex');
    const hmacBuffer = Buffer.from(hmacPart, 'hex');
    const expectedBuffer = Buffer.from(expectedHmac, 'hex');
    if (hmacBuffer.length !== expectedBuffer.length) return { valid: false };
    if (!timingSafeEqual(hmacBuffer, expectedBuffer)) return { valid: false };

    // Check expiry
    const expiresAt = parseInt(tokenExpiresAt, 10);
    if (Date.now() > expiresAt) return { valid: false };

    // Check email and OTP match
    if (tokenEmail !== email.trim().toLowerCase()) return { valid: false };
    if (tokenOtp !== otp.trim()) return { valid: false };

    // Guard against the fake token returned for unknown emails
    if (tokenUid === 'invalid') return { valid: false };

    return { valid: true, uid: tokenUid };
  } catch {
    return { valid: false };
  }
}

export async function POST(req: NextRequest) {
  try {
    const { email, otp, sessionToken } = await req.json();

    if (!email || !otp || !sessionToken) {
      return NextResponse.json(
        { ok: false, error: 'Email, code, and session token are required.' },
        { status: 400 }
      );
    }

    const result = verifyOtpToken(sessionToken, email, otp);

    if (!result.valid || !result.uid) {
      return NextResponse.json(
        { ok: false, error: 'Invalid or expired code. Please request a new one.' },
        { status: 400 }
      );
    }

    // Create a Firebase custom token using the explicit service account credentials
    const auth = getAdminAuth();
    const customToken = await auth.createCustomToken(result.uid);

    return NextResponse.json({ ok: true, customToken });

  } catch (err: any) {
    console.error('[verify-otp] error:', err?.message);
    return NextResponse.json(
      { ok: false, error: 'Verification failed. Please try again.' },
      { status: 500 }
    );
  }
}
