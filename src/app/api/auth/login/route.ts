import { NextRequest, NextResponse } from 'next/server';
import { attachSessionCookie, verifyPassword } from '@/lib/server/auth';
import {
  checkAuthAttemptLimit,
  clearAuthAttemptLimit,
  ensureStoreHydrated,
  persistStoreNow,
  readServerStore,
  ServerDataShape,
} from '@/lib/server/store';

function normalizeIdentifier(raw: string): string {
  return raw.trim().replace(/^@+/, '').replace(/\s+/g, '').toLowerCase();
}

/**
 * Resolve an email OR @username to an account. Falls back to scanning accounts
 * so an account created before an index existed (or restored from an older
 * backup) can always sign in — and the index is repaired in place.
 */
function resolveAccountId(store: ServerDataShape, identifier: string): string | null {
  const byEmail = store.accountIdByEmail[identifier];
  if (byEmail && store.accountsById[byEmail]) return byEmail;

  const byUsername = store.accountIdByUsername[identifier];
  if (byUsername && store.accountsById[byUsername]) return byUsername;

  for (const [userId, account] of Object.entries(store.accountsById)) {
    const email = (account.user.email ?? '').trim().toLowerCase();
    const username = (account.user.username ?? '').trim().replace(/^@+/, '').toLowerCase();
    if (email === identifier || username === identifier) {
      store.accountIdByEmail[email] = userId;
      store.accountIdByUsername[username] = userId;
      return userId;
    }
  }
  return null;
}

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
