const APHW_CONSULTATION_URL = 'https://www.aphw.com/consultation/';

export type AphwEducationSide = 'buyer' | 'seller';

type InvitationTransaction = Record<string, unknown>;

export type AphwInvitationResult = {
  sentTo: string[];
  missingEmailSides: AphwEducationSide[];
  failedSides: AphwEducationSide[];
};

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function clientRecipients(transaction: InvitationTransaction, side: AphwEducationSide) {
  const prefix = side === 'buyer' ? 'buyer' : 'seller';
  const recipients: Array<{ name: string; email: string }> = [];
  const seen = new Set<string>();

  for (const suffix of ['', '2', '3', '4']) {
    const email = String(transaction[`${prefix}${suffix}Email`] ?? '').trim().toLowerCase();
    if (!isValidEmail(email) || seen.has(email)) continue;
    seen.add(email);
    recipients.push({
      name: String(transaction[`${prefix}${suffix}Name`] ?? '').trim() || (side === 'buyer' ? 'Buyer' : 'Seller'),
      email,
    });
  }

  // Older files can hold the sole client contact under generic client fields.
  if (recipients.length === 0) {
    const email = String(transaction.clientEmail ?? '').trim().toLowerCase();
    if (isValidEmail(email)) {
      recipients.push({ name: String(transaction.clientName ?? '').trim() || (side === 'buyer' ? 'Buyer' : 'Seller'), email });
    }
  }

  return recipients;
}

function invitationContent(side: AphwEducationSide, recipientName: string, address: string, agentName: string) {
  const subject = side === 'buyer'
    ? `Your Home Warranty Education Call — ${address}`
    : `Your Seller Home Warranty Coverage — ${address}`;

  const body = side === 'buyer'
    ? `
      <p>Hi ${escapeHtml(recipientName)},</p>
      <p>${escapeHtml(agentName)} and Keaty Real Estate would like to offer you a free, no-obligation call with America&apos;s Preferred Home Warranty (APHW). Whether you are purchasing a warranty or receiving one through your transaction, APHW can explain how coverage works, what it may cover, key exclusions, the claims process, and how to use the warranty if you need it.</p>
      <p>Based on Keaty Real Estate&apos;s internal tracking, our clients received more than $60,000 in home-warranty claim support last year. If you would like to schedule a conversation, please use the link below. Our staff may also follow up to make sure you were able to schedule if you would like to do so.</p>
    `
    : `
      <p>Hi ${escapeHtml(recipientName)},</p>
      <p>${escapeHtml(agentName)} and Keaty Real Estate want to make sure you understand the seller home-warranty coverage available while your home is listed. Your listing includes this seller coverage at no additional charge through the APHW listing program, with an expectation that the buyer will purchase a warranty at closing.</p>
      <p>America&apos;s Preferred Home Warranty can explain what seller coverage may include, how to make a claim if an eligible issue arises during the listing term, and the benefits of offering a warranty to the buyer. Please use the link below if you would like to schedule a free, no-obligation call. Our staff may also follow up to see whether you would like help scheduling.</p>
    `;

  return { subject, body };
}

function buildEmailHtml(title: string, body: string) {
  const appName = process.env.NEXT_PUBLIC_APP_NAME || 'Keaty Real Estate';
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1f2937;">
  <table width="100%" cellspacing="0" cellpadding="0" style="padding:32px 16px;background:#f4f4f5;"><tr><td align="center">
    <table width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;">
      <tr><td style="padding:24px 32px;background:#0f3b63;color:#ffffff;"><strong style="font-size:20px;">${escapeHtml(appName)}</strong></td></tr>
      <tr><td style="padding:32px;"><h1 style="margin:0 0 20px;font-size:22px;color:#111827;">${escapeHtml(title)}</h1>${body}
      <p style="margin:28px 0 0;"><a href="${APHW_CONSULTATION_URL}" style="display:inline-block;background:#0f6f8f;color:#ffffff;text-decoration:none;font-weight:700;padding:13px 22px;border-radius:7px;">Schedule Your Free APHW Consultation</a></p>
      <p style="margin:24px 0 0;font-size:12px;color:#6b7280;">Home-warranty coverage, eligibility, exclusions, claims, and program benefits are governed by America&apos;s Preferred Home Warranty&apos;s current written terms.</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

/**
 * Sends only after an agent has selected Yes, which records their confirmation
 * that the relevant client contact may receive this educational invitation.
 */
export async function sendAphwEducationInvitations(
  transaction: InvitationTransaction,
  sides: AphwEducationSide[],
): Promise<AphwInvitationResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const result: AphwInvitationResult = { sentTo: [], missingEmailSides: [], failedSides: [] };
  if (!apiKey) {
    console.warn('[APHW education] RESEND_API_KEY is not configured; client invitations were not sent.');
    return { ...result, failedSides: [...sides] };
  }

  const { Resend } = await import('resend');
  const resend = new Resend(apiKey);
  const appName = process.env.NEXT_PUBLIC_APP_NAME || 'Keaty Real Estate';
  const from = `${appName} <notifications@${process.env.RESEND_FROM_DOMAIN || 'smartbrokerusa.com'}>`;
  const agentName = String(transaction.agentDisplayName ?? 'your Keaty Real Estate agent').trim() || 'your Keaty Real Estate agent';
  const agentEmail = String(transaction.agentEmail ?? transaction.submittedByEmail ?? '').trim();
  const address = String(transaction.propertyAddress ?? transaction.address ?? 'your property').trim() || 'your property';

  for (const side of [...new Set(sides)]) {
    const recipients = clientRecipients(transaction, side);
    if (recipients.length === 0) {
      result.missingEmailSides.push(side);
      continue;
    }

    for (const recipient of recipients) {
      const { subject, body } = invitationContent(side, recipient.name, address, agentName);
      try {
        const { error } = await resend.emails.send({
          from,
          to: [recipient.email],
          ...(isValidEmail(agentEmail) ? { replyTo: agentEmail } : {}),
          subject,
          html: buildEmailHtml(subject, body),
        });
        if (error) {
          console.error('[APHW education] Resend rejected invitation:', error);
          result.failedSides.push(side);
        } else {
          result.sentTo.push(recipient.email);
        }
      } catch (error) {
        console.error('[APHW education] Invitation send failed:', error);
        result.failedSides.push(side);
      }
    }
  }

  return result;
}

export { APHW_CONSULTATION_URL };
