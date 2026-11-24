import { NextRequest, NextResponse } from 'next/server';
import {
  OAUTH_STATE_COOKIE,
  buildAuthorizeUrl,
  createOAuthState,
  getRedirectUri,
  googleConfig,
  resolveOrigin,
  sanitizeNext,
} from '@/lib/server/google';

export const dynamic = 'force-dynamic';

/** Kicks off Google Sign-In / Sign-Up (same flow, account is created if new). */
export async function GET(req: NextRequest) {
  const nextPath = sanitizeNext(req.nextUrl.searchParams.get('next'));

  if (!googleConfig().configured) {
    return NextResponse.redirect(
      new URL('/?auth_error=google_unconfigured', resolveOrigin(req))
    );
  }

  const redirectUri = getRedirectUri(req);
  const state = createOAuthState(nextPath);

  const res = NextResponse.redirect(buildAuthorizeUrl({ redirectUri, state }));
  res.cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 10 * 60,
  });
  return res;
}
