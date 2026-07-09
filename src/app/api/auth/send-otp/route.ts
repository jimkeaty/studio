/**
 * POST /api/auth/send-otp
 *
 * Stateless OTP flow — no Firestore required.
 * Generates a 6-digit OTP, signs it with HMAC-SHA256, and returns the
 * session token to the client. The client stores it in React state and
 * passes it back to /api/auth/verify-otp along with the code.
 *
 * Body: { email: string }
 * Returns: { ok: true, sessionToken: string } or { ok: false, error: string }
 */
import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'crypto';
import { Resend } from 'resend';
import { adminAuth } from '@/lib/firebase/admin';

export const runtime = 'nodejs';

function getOtpSecret(): string {
  return process.env.RESEND_API_KEY || 'fallback-otp-secret';
}

export function signOtpToken(email: string, otp: string, expiresAt: number, uid: string): string {
  const payload = `${email}|${otp}|${expiresAt}|${uid}`;
  const hmac = createHmac('sha256', getOtpSecret()).update(payload).digest('hex');
  const data = Buffer.from(payload).toString('base64url');
  return `${data}.${hmac}`;
}

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json({ ok: false, error: 'Valid email address required.' }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Verify the email belongs to a known user in Firebase Auth
    let userRecord;
    try {
      userRecord = await adminAuth.getUserByEmail(normalizedEmail);
    } catch {
      // Don't reveal whether the email exists
      const fakeToken = signOtpToken(normalizedEmail, '000000', 0, 'invalid');
      return NextResponse.json({ ok: true, sessionToken: fakeToken });
    }

    if (!userRecord) {
      const fakeToken = signOtpToken(normalizedEmail, '000000', 0, 'invalid');
      return NextResponse.json({ ok: true, sessionToken: fakeToken });
    }

    // Generate a 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

    // Create a stateless HMAC session token — no Firestore needed
    const sessionToken = signOtpToken(normalizedEmail, otp, expiresAt, userRecord.uid);

    // Send via Resend
    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
      console.error('[send-otp] RESEND_API_KEY not set');
      return NextResponse.json({ ok: false, error: 'Email service not configured.' }, { status: 500 });
    }

    const resend = new Resend(resendKey);
    const fromDomain = process.env.RESEND_FROM_DOMAIN || 'smartbrokerusa.com';

    await resend.emails.send({
      from: `Keaty Real Estate <noreply@${fromDomain}>`,
      to: normalizedEmail,
      subject: `${otp} — Your Keaty Real Estate sign-in code`,
      html: `
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
        <body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 16px">
            <tr><td align="center">
              <table width="100%" style="max-width:480px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1)">
                <tr>
                  <td style="background:#1d4ed8;padding:32px;text-align:center">
                    <div style="width:48px;height:48px;background:rgba(255,255,255,0.2);border-radius:12px;display:inline-flex;align-items:center;justify-content:center;margin-bottom:12px">
                      <span style="color:white;font-size:24px;font-weight:bold">K</span>
                    </div>
                    <h1 style="margin:0;color:white;font-size:20px;font-weight:700">Keaty Real Estate</h1>
                    <p style="margin:4px 0 0;color:rgba(255,255,255,0.8);font-size:13px">Keaty Real Estate Dashboard</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:32px;text-align:center">
                    <h2 style="margin:0 0 8px;font-size:18px;color:#111827">Your sign-in code</h2>
                    <p style="margin:0 0 24px;color:#6b7280;font-size:14px;line-height:1.5">
                      Enter this code in the app to sign in. It expires in 10 minutes.
                    </p>
                    <div style="background:#f0f4ff;border:2px solid #1d4ed8;border-radius:12px;padding:20px 32px;display:inline-block;margin-bottom:24px">
                      <span style="font-size:40px;font-weight:800;letter-spacing:12px;color:#1d4ed8;font-family:monospace">${otp}</span>
                    </div>
                    <p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.5">
                      If you did not request this code, you can safely ignore this email.<br>
                      This code was requested for ${normalizedEmail}.
                    </p>
                  </td>
                </tr>
              </table>
            </td></tr>
          </table>
        </body>
        </html>
      `,
    });

    return NextResponse.json({ ok: true, sessionToken });

  } catch (err: any) {
    console.error('[send-otp] error:', err?.message);
    return NextResponse.json({ ok: false, error: 'Failed to send code.' }, { status: 500 });
  }
}
