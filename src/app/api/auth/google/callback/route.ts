import { NextRequest, NextResponse } from 'next/server';
import { attachSessionCookie } from '@/lib/server/auth';
import {
  createAccount,
  findAccountIdByGoogleSubject,
  linkGoogleAccount,
  resolveAccountIdByEmail,
} from '@/lib/server/accounts';
import {
  OAUTH_STATE_COOKIE,
  exchangeCodeForIdToken,
  getRedirectUri,
  googleConfig,
  verifyGoogleIdToken,
  verifyOAuthState,
} from '@/lib/server/google';
import {
  checkAuthAttemptLimit,
  clearAuthAttemptLimit,
  ensureStoreHydrated,
  persistStoreNow,
  readServerStore,
} from '@/lib/server/store';

export const dynamic = 'force-dynamic';

function back(origin: string, path: string, error?: string) {
  const url = new URL(path || '/', origin);
  if (error) url.searchParams.set('auth_error', error);
  return url;
}

export async function GET(req: NextRequest) {
  const redirectUri = getRedirectUri(req);
  const origin = new URL(redirectUri).origin;

  const stateParam = req.nextUrl.searchParams.get('state');
  const stateCookie = req.cookies.get(OAUTH_STATE_COOKIE)?.value;
  const verifiedState = verifyOAuthState(stateParam);

  const finish = (res: NextResponse) => {
    res.cookies.set(OAUTH_STATE_COOKIE, '', { path: '/', maxAge: 0 });
    return res;
  };

  if (!googleConfig().configured) {
    return finish(NextResponse.redirect(back(origin, '/', 'google_unconfigured')));
  }
  if (req.nextUrl.searchParams.get('error')) {
    return finish(NextResponse.redirect(back(origin, '/', 'google_cancelled')));
  }
  if (!verifiedState || !stateCookie || verifiedState.next === undefined || stateCookie !== stateParam) {
    return finish(NextResponse.redirect(back(origin, '/', 'google_state_mismatch')));
  }

  const code = req.nextUrl.searchParams.get('code');
  if (!code) return finish(NextResponse.redirect(back(origin, '/', 'google_code_missing')));

  try {
    await ensureStoreHydrated();
    const idToken = await exchangeCodeForIdToken({ code, redirectUri });
    const identity = await verifyGoogleIdToken(idToken);

    const store = readServerStore();
    let accountId = findAccountIdByGoogleSubject(store, identity.subject);
    let created = false;

    if (!accountId) {
      // Existing email account: link Google to it so history and password stay.
      const byEmail = resolveAccountIdByEmail(store, identity.email);
      if (byEmail) {
        linkGoogleAccount(store, byEmail, identity.subject, { displayName: identity.name });
        accountId = byEmail;
      } else {
        const snapshotLimit = checkAuthAttemptLimit(identity.email);
        if (!snapshotLimit.allowed) {
          return finish(NextResponse.redirect(back(origin, '/', 'too_many_attempts')));
        }
        const created0 = createAccount(store, {
          email: identity.email,
          displayName: identity.name,
          googleSubject: identity.subject,
          authProvider: 'google',
        });
        accountId = created0.userId;
        created = true;
      }
    }

    const account = store.accountsById[accountId];
    if (!account) return finish(NextResponse.redirect(back(origin, '/', 'google_account_missing')));

    const persisted = await persistStoreNow(store);
    if (!persisted) {
      // Never hand out a session for an account that could not be saved.
      if (created) {
        delete store.accountsById[accountId];
        delete store.accountIdByEmail[account.user.email];
        delete store.accountIdByUsername[account.user.username];
        delete store.accountIdByGoogleSub[identity.subject];
        delete store.usersData[accountId];
        await persistStoreNow(store).catch(() => false);
      }
      return finish(NextResponse.redirect(back(origin, '/', 'storage_unwritable')));
    }

    clearAuthAttemptLimit(identity.email);
    clearAuthAttemptLimit(account.user.username);

    const res = NextResponse.redirect(back(origin, verifiedState.next, undefined));
    attachSessionCookie(res, accountId);
    return finish(res);
  } catch (err) {
    console.error('[booklit] Google sign-in failed:', (err as Error).message);
    return finish(NextResponse.redirect(back(origin, '/', 'google_failed')));
  }
}
