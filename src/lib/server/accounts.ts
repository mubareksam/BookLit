import crypto from 'crypto';
import { UserProfile } from '../types';
import { hashPassword } from './auth';
import { ServerDataShape, StoredAccountRecord } from './store';

/**
 * Account helpers shared by every sign-in path (password, Google, recovery and
 * password reset). Keeping the lookup + creation rules in one place is what
 * makes "the account I just created" always signable-in afterwards.
 */

export function normalizeIdentifier(raw: string): string {
  return (raw ?? '').trim().replace(/^@+/, '').replace(/\s+/g, '').toLowerCase();
}

/**
 * Resolve an email OR @username to an account id. Falls back to scanning the
 * accounts table so an account restored from a backup (or created before an
 * index existed) can always sign in — and the index is repaired in place.
 */
export function resolveAccountId(store: ServerDataShape, identifier: string): string | null {
  const key = normalizeIdentifier(identifier);
  if (!key) return null;

  const byEmail = store.accountIdByEmail[key];
  if (byEmail && store.accountsById[byEmail]) return byEmail;

  const byUsername = store.accountIdByUsername[key];
  if (byUsername && store.accountsById[byUsername]) return byUsername;

  for (const [userId, account] of Object.entries(store.accountsById ?? {})) {
    const email = normalizeIdentifier(account.user?.email ?? '');
    const username = normalizeIdentifier(account.user?.username ?? '');
    if (email === key || username === key) {
      store.accountIdByEmail[email] = userId;
      store.accountIdByUsername[username] = userId;
      return userId;
    }
  }
  return null;
}

export function resolveAccountIdByEmail(store: ServerDataShape, email: string): string | null {
  return resolveAccountId(store, email);
}

export function findAccountIdByGoogleSubject(store: ServerDataShape, subject: string): string | null {
  const indexed = store.accountIdByGoogleSub?.[subject];
  if (indexed && store.accountsById[indexed]) return indexed;

  for (const [userId, account] of Object.entries(store.accountsById ?? {})) {
    if (account.googleSubject && account.googleSubject === subject) {
      store.accountIdByGoogleSub[subject] = userId;
      return userId;
    }
  }
  return null;
}

/** "sam.reads@gmail.com" → "sam_reads", always unique and URL/handle safe. */
export function deriveUsername(store: ServerDataShape, email: string, displayName?: string): string {
  const local = (email ?? '').split('@')[0] ?? '';
  let base = local.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  if (base.length < 3) {
    const fromName = (displayName ?? '').toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_');
    base = fromName.replace(/^_|_$/g, '').slice(0, 20);
  }
  if (base.length < 3) base = `reader_${crypto.randomBytes(2).toString('hex')}`;
  return uniqueUsername(store, base.slice(0, 20));
}

export function uniqueUsername(store: ServerDataShape, preferred: string): string {
  const clean = preferred.toLowerCase().replace(/[^a-z0-9_]/g, '') || 'reader';
  const taken = (candidate: string) =>
    Boolean(store.accountIdByUsername?.[candidate]) ||
    Object.values(store.accountsById ?? {}).some(
      (a) => (a.user?.username ?? '').toLowerCase() === candidate
    );

  if (!taken(clean)) return clean;
  for (let i = 2; i < 500; i++) {
    const candidate = `${clean.slice(0, 20)}_${i}`;
    if (!taken(candidate)) return candidate;
  }
  return `${clean.slice(0, 14)}_${crypto.randomBytes(2).toString('hex')}`;
}

export function buildDefaultSettings(): UserProfile['settings_json'] {
  return {
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
  };
}

export interface CreateAccountParams {
  email: string;
  username?: string;
  displayName: string;
  password?: string | null;
  googleSubject?: string | null;
  timezone?: string;
  authProvider?: UserProfile['auth_provider'];
  goalType?: UserProfile['reading_goal_type'];
  goalTarget?: number;
  preferredGenres?: UserProfile['preferred_genres'];
}

/** Insert a ready-to-sign-in account (indexes, profile row and cloud bucket). */
export function createAccount(
  store: ServerDataShape,
  params: CreateAccountParams
): { userId: string; user: UserProfile } {
  const email = params.email.trim().toLowerCase();
  const username = params.username
    ? uniqueUsername(store, params.username)
    : deriveUsername(store, email, params.displayName);

  const userId = `usr_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`;
  const nowIso = new Date().toISOString();
  const credentials = params.password ? hashPassword(params.password) : { salt: '', hash: '' };

  const user: UserProfile = {
    id: userId,
    username,
    email,
    display_name: params.displayName.trim() || username,
    auth_provider: params.authProvider ?? (params.password ? 'email_password' : 'google'),
    timezone: params.timezone || 'UTC',
    created_at: nowIso,
    reading_goal_type: params.goalType ?? 'minutes_day',
    reading_goal_target: params.goalTarget ?? 30,
    preferred_genres:
      params.preferredGenres && params.preferredGenres.length > 0
        ? params.preferredGenres
        : ['general_nonfiction', 'literary_fiction'],
    strike_count: 0,
    streak_count: 0,
    last_verified_session_at: null,
    settings_json: buildDefaultSettings(),
  };

  const record: StoredAccountRecord = {
    user,
    passwordSalt: credentials.salt,
    passwordHash: credentials.hash,
    googleSubject: params.googleSubject ?? null,
  };

  store.accountsById[userId] = record;
  store.accountIdByEmail[email] = userId;
  store.accountIdByUsername[username] = userId;
  if (params.googleSubject) store.accountIdByGoogleSub[params.googleSubject] = userId;

  store.usersData[userId] = {
    profile: user,
    books: {},
    sessions: {},
    verificationEvents: {},
    tbr: {},
    dailyAggregates: {},
    updatedAt: nowIso,
  };

  return { userId, user };
}

/** Link a Google identity to an existing email account (keeps history + password). */
export function linkGoogleAccount(
  store: ServerDataShape,
  accountId: string,
  subject: string,
  profile?: { displayName?: string }
): void {
  const account = store.accountsById[accountId];
  if (!account) return;
  account.googleSubject = subject;
  store.accountIdByGoogleSub[subject] = accountId;
  if (account.user.auth_provider === 'email_password') {
    // Keep the password usable: `auth_provider` now reflects "verified by Google".
    account.user.auth_provider = 'google';
  }
  if (profile?.displayName && !account.user.display_name) {
    account.user.display_name = profile.displayName;
  }
}

// ---- Password resets --------------------------------------------------------

const RESET_TTL_MINUTES = 60;
const RESET_RETENTION_HOURS = 24;

function hashResetToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function issuePasswordReset(
  store: ServerDataShape,
  accountId: string
): { token: string; expiresAt: string } {
  const account = store.accountsById[accountId];
  if (!account) throw new Error('Account not found');

  // Drop stale tokens for this account (one live link at a time).
  const now = Date.now();
  for (const [key, record] of Object.entries(store.passwordResets ?? {})) {
    const ageMs = now - new Date(record.requestedAt).getTime();
    if (record.accountId === accountId || !Number.isFinite(ageMs) || ageMs > RESET_RETENTION_HOURS * 3600_000) {
      delete store.passwordResets[key];
    }
  }

  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(now + RESET_TTL_MINUTES * 60_000).toISOString();
  store.passwordResets[hashResetToken(token)] = {
    accountId,
    email: account.user.email,
    requestedAt: new Date(now).toISOString(),
    expiresAt,
    usedAt: null,
  };
  return { token, expiresAt };
}

export function findPasswordReset(
  store: ServerDataShape,
  token: string
): { key: string; record: NonNullable<ServerDataShape['passwordResets'][string]> } | null {
  if (!token || token.length < 16) return null;
  const key = hashResetToken(token);
  const record = store.passwordResets?.[key];
  if (!record) return null;
  if (record.usedAt) return null;
  if (new Date(record.expiresAt).getTime() < Date.now()) return null;
  if (!store.accountsById[record.accountId]) return null;
  return { key, record };
}

/** Invalidate a token and install the new password. */
export function consumePasswordReset(
  store: ServerDataShape,
  token: string,
  newPassword: string
): { accountId: string } | null {
  const found = findPasswordReset(store, token);
  if (!found) return null;

  const account = store.accountsById[found.record.accountId];
  const credentials = hashPassword(newPassword);
  account.passwordSalt = credentials.salt;
  account.passwordHash = credentials.hash;

  found.record.usedAt = new Date().toISOString();
  // Any other outstanding link for this account dies with it.
  for (const [key, record] of Object.entries(store.passwordResets ?? {})) {
    if (record.accountId === found.record.accountId && key !== found.key) {
      delete store.passwordResets[key];
    }
  }
  return { accountId: found.record.accountId };
}

export function setPassword(store: ServerDataShape, accountId: string, newPassword: string): void {
  const account = store.accountsById[accountId];
  if (!account) return;
  const credentials = hashPassword(newPassword);
  account.passwordSalt = credentials.salt;
  account.passwordHash = credentials.hash;
}
