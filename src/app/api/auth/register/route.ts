import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { attachSessionCookie, hashPassword } from '@/lib/server/auth';
import { readServerStore, writeServerStore } from '@/lib/server/store';
import { BOOK_GENRES, UserProfile } from '@/lib/types';

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
    const cleanUsername = username.trim().toLowerCase();

    const store = readServerStore();
    if (store.accountIdByEmail[cleanEmail]) {
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

    const userId = `usr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
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
      reading_goal_type: goalType,
      reading_goal_target: goalTarget,
      preferred_genres: preferredGenres.length > 0 ? preferredGenres : ['general_nonfiction'],
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
        reminderWindows: [
          {
            id: 'rem-default',
            label: 'Daily Reading Window',
            startTime: '20:30',
            durationMinutes: 30,
            days: [1, 2, 3, 4, 5],
            enabled: false,
            channel: 'local_push',
          },
        ],
      },
    };

    store.accountsById[userId] = {
      user,
      passwordSalt: salt,
      passwordHash: hash,
    };
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

    writeServerStore(store);

    const res = NextResponse.json({
      user,
      snapshot: store.usersData[userId],
    });
    attachSessionCookie(res, userId);
    return res;
  } catch {
    return NextResponse.json({ error: 'Account creation failed' }, { status: 500 });
  }
}
