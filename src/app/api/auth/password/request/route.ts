import { NextRequest, NextResponse } from 'next/server';
import { issuePasswordReset, resolveAccountIdByEmail } from '@/lib/server/accounts';
import { mailStatus, passwordResetEmail, sendMail } from '@/lib/server/mailer';
import { resolveOrigin } from '@/lib/server/google';
import {
  checkPasswordResetRateLimit,
  ensureStoreHydrated,
  persistStoreNow,
  readServerStore,
} from '@/lib/server/store';

export const dynamic = 'force-dynamic';

const GENERIC_MESSAGE =
  'If that email has a Booklit account, a reset link is on its way. The link works once and expires in 60 minutes.';

/**
 * Sends a one-time password-reset link. The response never reveals whether the
 * address exists (no account enumeration).
 */
export async function POST(req: NextRequest) {
  await ensureStoreHydrated();

  const body = (await req.json().catch(() => ({}))) as { email?: string };
  const email = (body.email ?? '').trim().toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Enter the email you signed up with.' }, { status: 400 });
  }

  const limit = checkPasswordResetRateLimit(email);
  if (!limit.allowed) {
    return NextResponse.json(
      {
        error: `Too many reset requests for this email. Try again in ${Math.ceil(
          limit.retryAfterSeconds / 60
        )} minute(s).`,
      },
      { status: 429 }
    );
  }

  const store = readServerStore();
  const accountId = resolveAccountIdByEmail(store, email);
  const origin = resolveOrigin(req);

  if (!accountId) {
    return NextResponse.json({ status: 'sent', message: GENERIC_MESSAGE, delivery: 'email' });
  }

  const account = store.accountsById[accountId];
  await persistStoreNow(store);

  const { token } = issuePasswordReset(store, accountId);
  await persistStoreNow(store);

  const resetUrl = `${origin}/?reset=${encodeURIComponent(token)}`;
  const result = await sendMail({
    to: account.user.email,
    subject: `Reset your Booklit password (@${account.user.username})`,
    html: passwordResetEmail({
      displayName: account.user.display_name,
      username: account.user.username,
      resetUrl,
      expiresMinutes: 60,
    }),
    text: `Reset your Booklit password for @${account.user.username}: ${resetUrl} (expires in 60 minutes).`,
  });

  const mail = mailStatus();
  const delivery = result.sent ? 'email' : mail.configured ? 'failed' : 'unconfigured';
  // Development aid only: without an email provider there is no other way to
  // reach the link locally. Never exposed by a production build.
  const devLink = !result.sent && process.env.NODE_ENV !== 'production' ? resetUrl : undefined;

  if (!result.sent) {
    console.warn(
      `[booklit] Password reset for @${account.user.username} could not be emailed (${delivery}). Open: ${resetUrl}`
    );
  }

  return NextResponse.json({
    status: 'sent',
    message: GENERIC_MESSAGE,
    delivery,
    devLink,
  });
}
