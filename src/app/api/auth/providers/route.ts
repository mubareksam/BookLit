import { NextRequest, NextResponse } from 'next/server';
import { getRedirectUri, googleConfig } from '@/lib/server/google';
import { mailStatus } from '@/lib/server/mailer';

export const dynamic = 'force-dynamic';

/**
 * Which sign-in methods this deployment can offer right now — plus the exact
 * redirect URI to whitelist in Google Cloud Console, so setup is copy/paste.
 */
export async function GET(req: NextRequest) {
  const google = googleConfig();
  const mail = mailStatus();
  return NextResponse.json({
    google: {
      configured: google.configured,
      redirectUri: getRedirectUri(req),
    },
    emailPassword: { configured: true },
    passwordReset: { emailDelivery: mail.configured, provider: mail.provider },
  });
}
