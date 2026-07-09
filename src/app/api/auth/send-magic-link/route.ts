import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase/admin';
import { Resend } from 'resend';

/**
 * POST /api/auth/send-magic-link
 *
 * Sends a Firebase email sign-in link (magic link) to the given email address.
 * Works in every context including iOS PWA standalone mode because:
 *  - No popup required
 *  - No redirect through firebaseapp.com
 *  - No third-party cookies
 *  - Agent just taps a link in their email
 *
 * Body: { email: string }
 * Returns: { ok: true } or { ok: false, error: string }
 */
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
      // Don't reveal whether the email exists — just say "if you have an account, check your email"
      // This prevents email enumeration attacks
      return NextResponse.json({ ok: true });
    }

    if (!userRecord) {
      return NextResponse.json({ ok: true });
    }

    // Generate the Firebase email sign-in link
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://smart-broker-usa-next--smart-broker-usa.us-central1.hosted.app';
    // Embed the email in the callback URL so the callback page never needs
    // localStorage — which is NOT shared between the iOS PWA and Safari.
    const callbackUrl = `${appUrl}/auth/callback?email=${encodeURIComponent(normalizedEmail)}`;
    const actionCodeSettings = {
      url: callbackUrl,
      handleCodeInApp: true,
    };

    const signInLink = await adminAuth.generateSignInWithEmailLink(
      normalizedEmail,
      actionCodeSettings
    );

    // Send via Resend
    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
      console.error('[send-magic-link] RESEND_API_KEY not set');
      return NextResponse.json({ ok: false, error: 'Email service not configured.' }, { status: 500 });
    }

    const resend = new Resend(resendKey);
    const fromDomain = process.env.RESEND_FROM_DOMAIN || 'smartbrokerusa.com';

    await resend.emails.send({
      from: `Keaty Real Estate <noreply@${fromDomain}>`,
      to: normalizedEmail,
      subject: 'Your sign-in link for Keaty Real Estate',
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
                  <td style="padding:32px">
                    <h2 style="margin:0 0 8px;font-size:18px;color:#111827">Your sign-in link</h2>
                    <p style="margin:0 0 24px;color:#6b7280;font-size:14px;line-height:1.5">
                      Tap the button below to sign in to your dashboard. This link expires in 1 hour and can only be used once.
                    </p>
                    <a href="${signInLink}"
                       style="display:block;background:#1d4ed8;color:white;text-decoration:none;text-align:center;padding:14px 24px;border-radius:10px;font-size:15px;font-weight:600">
                      Sign In to Dashboard
                    </a>
                    <p style="margin:24px 0 0;color:#9ca3af;font-size:12px;text-align:center;line-height:1.5">
                      If you did not request this link, you can safely ignore this email.<br>
                      This link was requested for ${normalizedEmail}.
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

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[send-magic-link] error:', err);
    return NextResponse.json({ ok: false, error: 'Failed to send sign-in link.' }, { status: 500 });
  }
}
