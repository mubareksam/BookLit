import { NextResponse } from 'next/server';
import { googleStatus } from '@/lib/server/google';
import { mailStatus } from '@/lib/server/mailer';

/** Which sign-in methods this deployment can offer right now. */
export async function GET() {
  const google = googleStatus();
  const mail = mailStatus();
  return NextResponse.json({
    google: { configured: google.configured, redirectUri: google.redirectHint },
    emailPassword: { configured: true },
    passwordReset: { emailDelivery: mail.configured, provider: mail.provider },
  });
}
