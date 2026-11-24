import { NextRequest, NextResponse } from 'next/server';
import { attachSessionCookie } from '@/lib/server/auth';
import { consumePasswordReset, findPasswordReset } from '@/lib/server/accounts';
import {
  clearAuthAttemptLimit,
  ensureStoreHydrated,
  persistStoreNow,
  readServerStore,
} from '@/lib/server/store';

export const dynamic = 'force-dynamic';

/** Consumes a reset link: installs the new password and signs the reader in. */
export async function POST(req: NextRequest) {
  await ensureStoreHydrated();

  const body = (await req.json().catch(() => ({}))) as { token?: string; password?: string };
  const token = (body.token ?? '').trim();
  const password = body.password ?? '';

  if (password.length < 8) {
    return NextResponse.json(
      { error: 'Choose a password with at least 8 characters.' },
      { status: 400 }
    );
  }

  const store = readServerStore();
  if (!findPasswordReset(store, token)) {
    return NextResponse.json(
      {
        error: 'This reset link is invalid or has expired. Request a new one.',
        code: 'RESET_INVALID',
      },
      { status: 400 }
    );
  }

  const consumed = consumePasswordReset(store, token, password);
  if (!consumed) {
    return NextResponse.json(
      { error: 'This reset link is invalid or has expired.', code: 'RESET_INVALID' },
      { status: 400 }
    );
  }

  const persisted = await persistStoreNow(store);
  if (!persisted) {
    return NextResponse.json(
      {
        error: 'Your new password could not be saved durably. Please try again shortly.',
        code: 'STORAGE_UNWRITABLE',
      },
      { status: 503 }
    );
  }

  const account = store.accountsById[consumed.accountId];
  clearAuthAttemptLimit(account.user.email);
  clearAuthAttemptLimit(account.user.username);

  const res = NextResponse.json({
    user: account.user,
    snapshot: store.usersData[consumed.accountId] ?? null,
  });
  attachSessionCookie(res, consumed.accountId);
  return res;
}
