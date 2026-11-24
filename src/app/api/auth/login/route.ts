import { NextRequest, NextResponse } from 'next/server';
import { attachSessionCookie, verifyPassword } from '@/lib/server/auth';
import { readServerStore } from '@/lib/server/store';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { identifier?: string; password?: string };
    const identifier = (body.identifier ?? '').trim().toLowerCase();
    const password = body.password ?? '';

    if (!identifier || !password) {
      return NextResponse.json(
        { error: 'Email/username and password are required.' },
        { status: 400 }
      );
    }

    const store = readServerStore();
    const userId =
      store.accountIdByEmail[identifier] || store.accountIdByUsername[identifier];

    if (!userId || !store.accountsById[userId]) {
      return NextResponse.json({ error: 'Invalid credentials.' }, { status: 401 });
    }

    const account = store.accountsById[userId];
    const ok = verifyPassword(password, account.passwordSalt, account.passwordHash);
    if (!ok) {
      return NextResponse.json({ error: 'Invalid credentials.' }, { status: 401 });
    }

    const snapshot = store.usersData[userId] ?? null;
    const res = NextResponse.json({
      user: account.user,
      snapshot,
    });
    attachSessionCookie(res, userId);
    return res;
  } catch {
    return NextResponse.json({ error: 'Sign-in failed.' }, { status: 500 });
  }
}
