import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { attachSessionCookie } from '@/lib/server/auth';
import { createAccount, resolveAccountIdByEmail } from '@/lib/server/accounts';
import {
  clearAuthAttemptLimit,
  ensureStoreHydrated,
  getStoreDiagnostics,
  persistStoreNow,
  readServerStore,
} from '@/lib/server/store';
import { BOOK_GENRES } from '@/lib/types';

const RegisterSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(24, 'Username max 24 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Letters, numbers, and underscores only'),
  displayName: z.string().min(2, 'Name must be at least 2 characters').max(60),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  timezone: z.string().default('UTC'),
  goalType: z.enum(['books_year', 'minutes_day', 'pages_day']).default('minutes_day'),
  goalTarget: z.number().int().min(1).max(1000).default(30),
  preferredGenres: z.array(z.enum(BOOK_GENRES)).default(['general_nonfiction', 'literary_fiction']),
});

export async function POST(req: NextRequest) {
  try {
    await ensureStoreHydrated();
    const raw = await req.json();
    const parsed = RegisterSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid registration fields' },
        { status: 400 }
      );
    }

    const { email, username, displayName, password, timezone, goalType, goalTarget, preferredGenres } =
      parsed.data;
    const cleanEmail = email.trim().toLowerCase();
    const cleanUsername = username.trim().replace(/^@+/, '').toLowerCase();

    const store = readServerStore();
    if (store.accountIdByEmail[cleanEmail] || resolveAccountIdByEmail(store, cleanEmail)) {
      return NextResponse.json(
        { error: 'An account with this email already exists. Please sign in.' },
        { status: 409 }
      );
    }
    if (store.accountIdByUsername[cleanUsername]) {
      return NextResponse.json(
        { error: 'That username is already taken. Choose another handle.' },
        { status: 409 }
      );
    }

    const { userId, user } = createAccount(store, {
      email: cleanEmail,
      username: cleanUsername,
      displayName,
      password,
      authProvider: 'email_password',
      timezone,
      goalType,
      goalTarget,
      preferredGenres,
    });

    // Persist immediately (local disk + remote database when configured) so the
    // account definitely exists before the reader is signed in.
    const persisted = await persistStoreNow(store);
    if (!persisted) {
      const diagnostics = getStoreDiagnostics();
      return NextResponse.json(
        {
          error:
            'Account could not be saved durably on this server. Configure SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY (or a persistent disk) and try again.',
          code: 'STORAGE_UNWRITABLE',
          storage: diagnostics,
        },
        { status: 503 }
      );
    }
    clearAuthAttemptLimit(cleanUsername);
    clearAuthAttemptLimit(cleanEmail);

    const res = NextResponse.json({
      user,
      snapshot: store.usersData[userId],
      storage: getStoreDiagnostics(),
    });
    attachSessionCookie(res, userId);
    return res;
  } catch {
    return NextResponse.json({ error: 'Account creation failed' }, { status: 500 });
  }
}
