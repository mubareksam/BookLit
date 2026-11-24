import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { attachSessionCookie, hashPassword } from '@/lib/server/auth';
import {
  clearAuthAttemptLimit,
  ensureStoreHydrated,
  getStoreDiagnostics,
  persistStoreNow,
  readServerStore,
} from '@/lib/server/store';
import { BOOK_GENRES, UserProfile } from '@/lib/types';

/**
 * Account recovery for a device that still holds the reader's local history.
 *
 * If a deployment ever started with empty server storage (ephemeral disk, wiped
 * volume, first boot against a new database), the account row disappears even
 * though the reader's IndexedDB still has their books and sessions. This endpoint
 * re-creates the account using the SAME user id the device already knows, so no
 * local history is orphaned, then lets the client push its data back up.
 */
const RecoverSchema = z.object({
  userId: z.string().min(4).max(64),
  email: z.string().email('Enter a valid email address'),
  username: z
    .string()
    .min(3)
    .max(24)
    .regex(/^[a-zA-Z0-9_]+$/, 'Letters, numbers, and underscores only'),
  displayName: z.string().min(2).max(60),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  timezone: z.string().default('UTC'),
});

export async function POST(req: NextRequest) {
  try {
    await ensureStoreHydrated();

    const parsed = RecoverSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid recovery details' },
        { status: 400 }
      );
    }

    const { userId, email, displayName, password, timezone } = parsed.data;
    const cleanEmail = email.trim().toLowerCase();
    const cleanUsername = parsed.data.username.trim().replace(/^@+/, '').toLowerCase();

    const store = readServerStore();

    if (store.accountsById[userId]) {
      return NextResponse.json(
        { error: 'This account already exists on the server. Sign in instead.', code: 'ALREADY_EXISTS' },
        { status: 409 }
      );
    }
    if (store.accountIdByEmail[cleanEmail] || store.accountIdByUsername[cleanUsername]) {
      return NextResponse.json(
        { error: 'That email or username is already used by another account.', code: 'TAKEN' },
        { status: 409 }
      );
    }

    const nowIso = new Date().toISOString();
    const { salt, hash } = hashPassword(password);

    const user: UserProfile = {
      id: userId,
      username: cleanUsername,
      email: cleanEmail,
      display_name: displayName.trim(),
      auth_provider: 'email_password',
      timezone,
      created_at: nowIso,
      reading_goal_type: 'minutes_day',
      reading_goal_target: 30,
      preferred_genres: [BOOK_GENRES[0], BOOK_GENRES[3]],
      strike_count: 0,
      streak_count: 0,
      last_verified_session_at: null,
      settings_json: {
        comprehensionOptIn: false,
        challengeMode: false,
        retainAudioForDebug: false,
        whisperModeDefault: false,
        analyticsConsent: false,
        notificationsPromptedAfterFirstSession: false,
        notificationsEnabled: false,
        cameraExplainerSeen: false,
        micExplainerSeen: false,
        streakInsuranceAvailable: true,
        streakInsuranceLastUsedMonth: null,
        themePreference: 'system',
        reminderWindows: [],
      },
    };

    store.accountsById[userId] = { user, passwordSalt: salt, passwordHash: hash };
    store.accountIdByEmail[cleanEmail] = userId;
    store.accountIdByUsername[cleanUsername] = userId;
    store.usersData[userId] = {
      profile: user,
      books: {},
      sessions: {},
      verificationEvents: {},
      tbr: {},
      dailyAggregates: {},
      updatedAt: nowIso,
    };

    const persisted = await persistStoreNow(store);
    if (!persisted) {
      return NextResponse.json(
        {
          error: 'Recovered account could not be saved durably. Configure durable storage first.',
          storage: getStoreDiagnostics(),
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
  } catch (err) {
    return NextResponse.json(
      { error: `Recovery failed: ${(err as Error).message}` },
      { status: 500 }
    );
  }
}
