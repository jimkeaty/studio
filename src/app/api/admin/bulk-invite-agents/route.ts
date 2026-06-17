// POST /api/admin/bulk-invite-agents
// Admin-only endpoint that:
//  1. Scans all agentProfiles that have no Firebase Auth account
//  2. Creates a Firebase Auth user for each one (email + no password)
//  3. Generates a Firebase password-reset link (valid 1 hour)
//  4. Sends a branded welcome email via Resend with the sign-in link
//  5. Stamps the new firebaseUid onto the agentProfile doc
//
// Supports optional `emails` array in the request body to target specific agents only.
// Supports optional `reinvite: true` to re-send to agents who already have accounts.
//
// NOTE: adminAuth.generatePasswordResetLink() only GENERATES the URL —
// it does NOT send an email. We send it ourselves via Resend (same as
// the individual /invite endpoint).
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { isAdminLike } from '@/lib/auth/staffAccess';

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(req: NextRequest) {
  try {
    // Require admin auth
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) return jsonError(401, 'Missing auth token');
    const token = authHeader.slice('Bearer '.length);
    const decoded = await adminAuth.verifyIdToken(token);
    if (!(await isAdminLike(decoded.uid))) return jsonError(403, 'Admin only');

    // Optional: target specific emails or profileIds only; reinvite existing accounts
    let body: {
      emails?: string[];
      profileIds?: string[];
      dryRun?: boolean;
      reinvite?: boolean;
    } = {};
    try { body = await req.json(); } catch { /* no body */ }
    const targetEmails = body.emails?.map((e) => e.toLowerCase().trim());
    const targetProfileIds = body.profileIds?.map((id) => id.trim());
    const dryRun = body.dryRun === true;
    const reinvite = body.reinvite === true;

    // Resend config
    const resendApiKey = process.env.RESEND_API_KEY;
    const fromDomain = process.env.RESEND_FROM_DOMAIN || 'smartbrokerusa.com';
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      'https://smart-broker-usa-next--smart-broker-usa.us-central1.hosted.app';
    const appName = process.env.NEXT_PUBLIC_APP_NAME || 'Smart Broker USA';

    if (!resendApiKey) {
      return jsonError(500, 'RESEND_API_KEY is not configured — cannot send invite emails');
    }

    // Fetch all agentProfiles
    const profilesSnap = await adminDb.collection('agentProfiles').get();

    const results: {
      profileId: string;
      email: string;
      name: string;
      status: 'invited' | 'reinvited' | 'already_exists' | 'skipped_no_email' | 'skipped_filter' | 'dry_run' | string;
      firebaseUid?: string;
      emailSent?: boolean;
      error?: string;
    }[] = [];

    for (const doc of profilesSnap.docs) {
      const data = doc.data() || {};
      const email: string | undefined =
        data.email?.toLowerCase().trim() ||
        data.contactEmail?.toLowerCase().trim() ||
        data.workEmail?.toLowerCase().trim();
      const name: string = data.displayName || data.name || doc.id;

      if (!email) {
        results.push({ profileId: doc.id, email: '(none)', name, status: 'skipped_no_email' });
        continue;
      }

      // Apply filters
      if (targetEmails && !targetEmails.includes(email)) {
        results.push({ profileId: doc.id, email, name, status: 'skipped_filter' });
        continue;
      }
      if (targetProfileIds && !targetProfileIds.includes(doc.id)) {
        results.push({ profileId: doc.id, email, name, status: 'skipped_filter' });
        continue;
      }

      // Check if Firebase Auth account already exists
      let firebaseUid: string | undefined;
      let isNewAccount = false;

      try {
        const existingUser = await adminAuth.getUserByEmail(email);
        firebaseUid = existingUser.uid;

        // Stamp firebaseUid if missing on the profile
        if (!data.firebaseUid && !dryRun) {
          await adminDb.collection('agentProfiles').doc(doc.id)
            .update({ firebaseUid })
            .catch(() => {});
        }

        if (!reinvite) {
          // Not reinviting — skip agents who already have accounts
          results.push({ profileId: doc.id, email, name, status: 'already_exists', firebaseUid });
          continue;
        }
        // reinvite=true: fall through to send a new invite email
        isNewAccount = false;
      } catch (lookupErr: any) {
        if (lookupErr.code !== 'auth/user-not-found') {
          results.push({ profileId: doc.id, email, name, status: 'error_lookup', error: lookupErr.message });
          continue;
        }
        // User not found — create a new account
        isNewAccount = true;
      }

      if (dryRun) {
        results.push({ profileId: doc.id, email, name, status: 'dry_run' });
        continue;
      }

      // Create Firebase Auth user if new
      if (isNewAccount) {
        try {
          const newUser = await adminAuth.createUser({
            email,
            displayName: name,
            emailVerified: false,
          });
          firebaseUid = newUser.uid;

          // Stamp firebaseUid onto the profile doc
          await adminDb.collection('agentProfiles').doc(doc.id)
            .update({ firebaseUid })
            .catch((e: any) => console.warn(`[bulk-invite] Could not stamp UID on ${doc.id}:`, e.message));
        } catch (createErr: any) {
          results.push({ profileId: doc.id, email, name, status: 'error_create', error: createErr.message });
          continue;
        }
      }

      // Generate password-reset / sign-in link
      let resetLink: string;
      try {
        resetLink = await adminAuth.generatePasswordResetLink(email, { url: appUrl });
      } catch (linkErr: any) {
        results.push({
          profileId: doc.id,
          email,
          name,
          status: isNewAccount ? 'invited' : 'reinvited',
          firebaseUid,
          emailSent: false,
          error: `Account ready but could not generate invite link: ${linkErr.message}`,
        });
        continue;
      }

      // Send branded welcome email via Resend
      let emailSent = false;
      let emailError: string | undefined;
      try {
        const { Resend } = await import('resend');
        const resend = new Resend(resendApiKey);
        const { error: sendError } = await resend.emails.send({
          from: `${appName} <invites@${fromDomain}>`,
          to: [email],
          subject: isNewAccount
            ? `You're invited to ${appName} — set up your account`
            : `Your ${appName} invite link`,
          html: buildInviteEmailHtml({ appName, appUrl, agentName: name, resetLink, isNewAccount }),
        });
        if (sendError) {
          emailError = typeof sendError === 'string' ? sendError : JSON.stringify(sendError);
          console.error(`[bulk-invite] Resend error for ${email}:`, sendError);
        } else {
          emailSent = true;
        }
      } catch (sendErr: any) {
        emailError = sendErr?.message || 'Unknown Resend error';
        console.error(`[bulk-invite] Failed to send email to ${email}:`, sendErr);
      }

      results.push({
        profileId: doc.id,
        email,
        name,
        status: isNewAccount ? 'invited' : 'reinvited',
        firebaseUid,
        emailSent,
        ...(emailError ? { error: emailError } : {}),
      });
    }

    const invited = results.filter((r) => r.status === 'invited').length;
    const reinvited = results.filter((r) => r.status === 'reinvited').length;
    const alreadyExists = results.filter((r) => r.status === 'already_exists').length;
    const skippedNoEmail = results.filter((r) => r.status === 'skipped_no_email').length;
    const skippedFilter = results.filter((r) => r.status === 'skipped_filter').length;
    const wouldInvite = results.filter((r) => r.status === 'dry_run').length;
    const emailsSent = results.filter((r) => r.emailSent).length;
    const errors = results.filter((r) => r.status.startsWith('error')).length;

    console.log(
      `[bulk-invite-agents] invited=${invited}, reinvited=${reinvited}, emailsSent=${emailsSent}, ` +
      `alreadyExists=${alreadyExists}, skippedNoEmail=${skippedNoEmail}, errors=${errors}, dryRun=${dryRun}`
    );

    return NextResponse.json({
      ok: true,
      dryRun,
      summary: {
        invited,
        reinvited,
        emailsSent,
        alreadyExists,
        skippedNoEmail,
        skippedFilter,
        wouldInvite,
        errors,
        total: results.length,
      },
      results: results.filter((r) => r.status !== 'skipped_filter'),
    });
  } catch (err: any) {
    console.error('[bulk-invite-agents]', err);
    return jsonError(500, err.message || 'Internal Server Error');
  }
}

// ── Email template (same branded design as individual invite) ─────────────────
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
