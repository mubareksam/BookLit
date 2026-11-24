import { NextRequest, NextResponse } from 'next/server';
import { attachSessionCookie, verifyPassword } from '@/lib/server/auth';
import { normalizeIdentifier, resolveAccountId } from '@/lib/server/accounts';
import {
  checkAuthAttemptLimit,
  clearAuthAttemptLimit,
  ensureStoreHydrated,
  persistStoreNow,
  readServerStore,
} from '@/lib/server/store';

export async function POST(req: NextRequest) {
  try {
    await ensureStoreHydrated();

    const body = (await req.json()) as { identifier?: string; password?: string };
    const identifier = normalizeIdentifier(body.identifier ?? '');
    const password = (body.password ?? '').trim();
    const rawIdentifier = (body.identifier ?? '').trim();

    if (!identifier || !password) {
      return NextResponse.json(
        { error: 'Enter your email or @username and your password.' },
        { status: 400 }
      );
    }

    const limit = checkAuthAttemptLimit(identifier);
    if (!limit.allowed) {
      return NextResponse.json(
        {
          error: `Too many sign-in attempts. Try again in ${Math.ceil(
            limit.retryAfterSeconds / 60
          )} minute(s).`,
        },
        { status: 429 }
      );
    }

    const store = readServerStore();
    const userId = resolveAccountId(store, identifier);

    if (!userId || !store.accountsById[userId]) {
      return NextResponse.json(
        {
          error: `No Booklit account found for “${rawIdentifier}”. Use Create Account, or check the email/username you signed up with.`,
          code: 'ACCOUNT_NOT_FOUND',
        },
        { status: 404 }
      );
    }

    const account = store.accountsById[userId];
    if (!account.passwordHash) {
      return NextResponse.json(
        {
          error: `@${account.user.username} signs in with Google. Continue with Google, or use “Forgot password?” to set a password for this email.`,
          code: 'USE_GOOGLE',
        },
        { status: 409 }
      );
    }
    if (!verifyPassword(password, account.passwordSalt, account.passwordHash)) {
      return NextResponse.json(
        {
          error: `Incorrect password for @${account.user.username}. Passwords are case-sensitive.`,
          code: 'WRONG_PASSWORD',
        },
        { status: 401 }
      );
    }

    clearAuthAttemptLimit(identifier);

    // Persist the repaired lookup indexes so the next sign-in is instant.
    await persistStoreNow(store);

    const snapshot = store.usersData[userId] ?? null;
    const res = NextResponse.json({
      user: account.user,
      snapshot,
    });
    attachSessionCookie(res, userId);
    return res;
  } catch (err) {
    return NextResponse.json(
      { error: `Sign-in failed: ${(err as Error).message}` },
      { status: 500 }
    );
  }
}
