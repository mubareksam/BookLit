/**
 * Transactional email for password resets.
 *
 * Booklit ships with one zero-dependency transport (Resend's HTTP API) because
 * it works from serverless and container hosts alike. When no provider is
 * configured the app still issues reset links — it just cannot deliver them,
 * and says so explicitly instead of pretending an email was sent.
 */

export interface MailStatus {
  configured: boolean;
  provider: 'resend' | 'none';
  from: string;
}

const DEFAULT_FROM = 'Booklit <onboarding@resend.dev>';

export function mailStatus(): MailStatus {
  const apiKey = (process.env.RESEND_API_KEY || '').trim();
  return {
    configured: Boolean(apiKey),
    provider: apiKey ? 'resend' : 'none',
    from: (process.env.BOOKLIT_MAIL_FROM || '').trim() || DEFAULT_FROM,
  };
}

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export async function sendMail(message: MailMessage): Promise<{ sent: boolean; error?: string }> {
  const status = mailStatus();
  if (!status.configured) {
    console.warn(
      `[booklit] No mail provider configured (set RESEND_API_KEY). ${message.subject} for ${message.to} was not delivered.`
    );
    return { sent: false, error: 'MAIL_NOT_CONFIGURED' };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: status.from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
      signal: AbortSignal.timeout(12_000),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error(`[booklit] Resend rejected the email (${res.status}): ${detail.slice(0, 300)}`);
      return { sent: false, error: `MAIL_PROVIDER_${res.status}` };
    }
    return { sent: true };
  } catch (err) {
    console.error('[booklit] Email delivery failed:', (err as Error).message);
    return { sent: false, error: 'MAIL_DELIVERY_FAILED' };
  }
}

export function passwordResetEmail(params: {
  displayName: string;
  username: string;
  resetUrl: string;
  expiresMinutes: number;
}): MailMessage['html'] {
  const { displayName, username, resetUrl, expiresMinutes } = params;
  return `
  <div style="font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;padding:28px;color:#18181b">
    <div style="font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:#059669;font-weight:700">Booklit</div>
    <h1 style="font-size:20px;margin:14px 0 8px">Reset your password</h1>
    <p style="font-size:14px;line-height:1.6;color:#52525b;margin:0 0 18px">
      Hi ${displayName || username}, use the button below to choose a new password for
      <strong>@${username}</strong>. The link works once and expires in ${expiresMinutes} minutes.
    </p>
    <a href="${resetUrl}" style="display:inline-block;background:#059669;color:#fff;text-decoration:none;padding:12px 20px;border-radius:12px;font-weight:600;font-size:14px">Choose a new password</a>
    <p style="font-size:12px;line-height:1.6;color:#a1a1aa;margin:20px 0 0">
      If you didn't ask for this, you can ignore this email — your password stays unchanged.
    </p>
    <p style="font-size:11px;color:#a1a1aa;word-break:break-all;margin:16px 0 0">${resetUrl}</p>
  </div>`;
}
