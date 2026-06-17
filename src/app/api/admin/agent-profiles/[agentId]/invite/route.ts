// POST /api/admin/agent-profiles/[agentId]/invite
//
// Sends a welcome / invite email to a single agent using Resend.
//
// Flow:
//   1. Look up the agent profile by doc ID or agentId slug
//   2. Read the email from the profile (email / contactEmail / workEmail)
//   3. Create a Firebase Auth account if one doesn't exist
//   4. Generate a Firebase password-reset link (valid 1 hour)
//   5. Send a branded welcome email via Resend with the sign-in link
//
// NOTE: adminAuth.generatePasswordResetLink() only GENERATES the URL —
// it does NOT send an email. We must send it ourselves via Resend.
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

type RouteContext = {
  params: Promise<{ agentId: string }>;
};

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    // ── Auth check ────────────────────────────────────────────────────────
    const h = req.headers.get('Authorization') || '';
    const token = h.startsWith('Bearer ') ? h.slice(7).trim() : null;
    if (!token) return jsonError(401, 'Unauthorized');
    const decoded = await adminAuth.verifyIdToken(token);
    if (!(await isAdminLike(decoded.uid))) return jsonError(403, 'Forbidden');

    const { agentId } = await context.params;

    // ── Look up the profile ───────────────────────────────────────────────
    let profileSnap = await adminDb.collection('agentProfiles').doc(agentId).get();

    if (!profileSnap.exists) {
      const q = await adminDb
        .collection('agentProfiles')
        .where('agentId', '==', agentId)
        .limit(1)
        .get();
      if (!q.empty) profileSnap = q.docs[0] as any;
    }

    if (!profileSnap.exists) {
      return jsonError(404, 'Agent profile not found');
    }

    const data = profileSnap.data() || {};
    const profileDocId = profileSnap.id;

    // ── Get email ─────────────────────────────────────────────────────────
    const email: string | null =
      (data.email?.trim() || data.contactEmail?.trim() || data.workEmail?.trim() || null);

    if (!email) {
      return NextResponse.json({
        ok: false,
        status: 'skipped_no_email',
        error: 'No email address on this profile — add an email first',
      });
    }

    const name: string = data.displayName || data.name || agentId;

    // ── Ensure Firebase Auth account exists ───────────────────────────────
    let firebaseUid: string;
    let accountStatus: 'created' | 'already_exists';

    try {
      const existingUser = await adminAuth.getUserByEmail(email);
      firebaseUid = existingUser.uid;
      accountStatus = 'already_exists';

      // Stamp firebaseUid if missing
      if (!data.firebaseUid) {
        await adminDb
          .collection('agentProfiles')
          .doc(profileDocId)
          .update({ firebaseUid })
          .catch(() => {});
      }
    } catch (lookupErr: any) {
      if (lookupErr.code !== 'auth/user-not-found') {
        return jsonError(500, `Error checking existing account: ${lookupErr.message}`);
      }

      // Create new Firebase Auth user
      try {
        const newUser = await adminAuth.createUser({
          email,
          displayName: name,
          emailVerified: false,
        });
        firebaseUid = newUser.uid;
        accountStatus = 'created';

        // Stamp firebaseUid onto the profile doc
        await adminDb
          .collection('agentProfiles')
          .doc(profileDocId)
          .update({ firebaseUid })
          .catch(() => {});
      } catch (createErr: any) {
        return jsonError(500, `Could not create account: ${createErr.message}`);
      }
    }

    // ── Generate password-reset link ──────────────────────────────────────
    // This link lets the agent set their password and sign in.
    // It is valid for 1 hour.
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      'https://smart-broker-usa-next--smart-broker-usa.us-central1.hosted.app';

    let resetLink: string;
    try {
      resetLink = await adminAuth.generatePasswordResetLink(email, {
        url: appUrl,
      });
    } catch (linkErr: any) {
      return jsonError(500, `Could not generate invite link: ${linkErr.message}`);
    }

    // ── Send invite email via Resend ──────────────────────────────────────
    const resendApiKey = process.env.RESEND_API_KEY;
    const fromDomain = process.env.RESEND_FROM_DOMAIN || 'smartbrokerusa.com';
    const appName = process.env.NEXT_PUBLIC_APP_NAME || 'Smart Broker USA';

    if (!resendApiKey) {
      return NextResponse.json({
        ok: true,
        status: accountStatus,
        email,
        firebaseUid,
        emailSent: false,
        message: `Account ready for ${email} but RESEND_API_KEY is not configured — email not sent`,
      });
    }

    let emailSent = false;
    let emailError: string | null = null;

    try {
      const { Resend } = await import('resend');
      const resend = new Resend(resendApiKey);

      const emailHtml = buildInviteEmailHtml({
        appName,
        appUrl,
        agentName: name,
        resetLink,
        isNewAccount: accountStatus === 'created',
      });

      const { error: sendError } = await resend.emails.send({
        from: `${appName} <invites@${fromDomain}>`,
        to: [email],
        subject: `You're invited to ${appName} — set up your account`,
        html: emailHtml,
      });

      if (sendError) {
        emailError = (sendError as any).message || JSON.stringify(sendError);
        console.error(`[invite] Resend error for ${email}:`, sendError);
      } else {
        emailSent = true;
      }
    } catch (err: any) {
      emailError = err.message || 'Unknown email error';
      console.error(`[invite] Failed to send invite email to ${email}:`, err);
    }

    return NextResponse.json({
      ok: true,
      status: accountStatus === 'created' ? 'invited' : 'reinvited',
      email,
      firebaseUid,
      emailSent,
      ...(emailError ? { emailError } : {}),
      message: emailSent
        ? `Invite email sent to ${email}`
        : `Account ready for ${email} but email could not be sent: ${emailError}`,
    });
  } catch (err: any) {
    console.error('[invite]', err);
    return jsonError(500, err.message || 'Internal Server Error');
  }
}

// ── Email template ────────────────────────────────────────────────────────────

function buildInviteEmailHtml({
  appName,
  appUrl,
  agentName,
  resetLink,
  isNewAccount,
}: {
  appName: string;
  appUrl: string;
  agentName: string;
  resetLink: string;
  isNewAccount: boolean;
}): string {
  const firstName = agentName.split(' ')[0] || agentName;
  const ctaText = isNewAccount ? 'Set Up My Account' : 'Sign In to Dashboard';
  const intro = isNewAccount
    ? `Your broker has created an account for you on <strong>${appName}</strong> — your real estate performance dashboard.`
    : `Here is your updated invite link for <strong>${appName}</strong>.`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>You're invited to ${appName}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background:#0f172a;padding:32px 40px;text-align:center;">
              <div style="display:inline-block;width:56px;height:56px;background:#2563eb;border-radius:14px;line-height:56px;text-align:center;font-size:28px;font-weight:700;color:#ffffff;margin-bottom:12px;">K</div>
              <div style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.3px;">${appName}</div>
              <div style="color:#94a3b8;font-size:13px;margin-top:4px;">Real Estate Performance Dashboard</div>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 32px;">
              <p style="margin:0 0 8px;font-size:22px;font-weight:700;color:#0f172a;">Hi ${firstName}! 👋</p>
              <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.6;">${intro}</p>

              <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.6;">
                Click the button below to ${isNewAccount ? 'set your password and access' : 'sign in to'} your dashboard.
                This link is valid for <strong>1 hour</strong>.
              </p>

              <!-- CTA Button -->
              <table cellpadding="0" cellspacing="0" style="margin:0 auto 32px;">
                <tr>
                  <td style="background:#2563eb;border-radius:10px;padding:14px 32px;">
                    <a href="${resetLink}" style="color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;display:block;">${ctaText}</a>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 8px;font-size:13px;color:#94a3b8;">If the button doesn't work, copy and paste this link into your browser:</p>
              <p style="margin:0 0 32px;font-size:12px;color:#2563eb;word-break:break-all;">
                <a href="${resetLink}" style="color:#2563eb;">${resetLink}</a>
              </p>

              <div style="border-top:1px solid #e2e8f0;padding-top:24px;">
                <p style="margin:0 0 8px;font-size:13px;color:#64748b;line-height:1.6;">
                  <strong>Tip:</strong> After setting your password, you can also sign in with Google using this same email address — no password needed.
                </p>
                <p style="margin:0;font-size:13px;color:#64748b;">
                  Your dashboard: <a href="${appUrl}" style="color:#2563eb;">${appUrl}</a>
                </p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc;padding:20px 40px;border-top:1px solid #e2e8f0;text-align:center;">
              <p style="margin:0;font-size:12px;color:#94a3b8;">
                This invite was sent by your broker via ${appName}.<br/>
                If you did not expect this email, you can safely ignore it.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
