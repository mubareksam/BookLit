import {
  ActivityFeedEvent,
  LiveWatchSession,
  ReadingChallenge,
  ReadingDuel,
  UserProfile,
} from '../types';
import fs from 'fs';
import {
  flushRemoteSave,
  isRemoteConfigured,
  queueRemoteSave,
  readLocalJson,
  readRemoteJson,
  resolveStorageLocation,
  storageDiagnostics,
  writeLocalJson,
} from './storage';

export interface StoredAccountRecord {
  user: UserProfile;
  passwordSalt: string;
  passwordHash: string;
}

export interface UserCloudBucket {
  profile: UserProfile;
  books: Record<string, unknown>;
  sessions: Record<string, unknown>;
  verificationEvents: Record<string, unknown>;
  tbr: Record<string, unknown>;
  dailyAggregates: Record<string, unknown>;
  updatedAt: string;
}

export interface ServerDataShape {
  accountsById: Record<string, StoredAccountRecord>;
  accountIdByEmail: Record<string, string>;
  accountIdByUsername: Record<string, string>;
  usersData: Record<string, UserCloudBucket>;
  liveWatchRooms: Record<string, LiveWatchSession>;
  challenges: Record<string, ReadingChallenge>;
  duels: Record<string, ReadingDuel>;
  followsByUserId: Record<string, string[]>;
  /** Sparks (Booklit's verified "like") keyed by activity event id → user ids. */
  sparksByEventId: Record<string, string[]>;
  activityFeed: ActivityFeedEvent[];
  /** ISO timestamp of the last durable write (used to pick the freshest copy). */
  updatedAt?: string;
  schemaVersion?: number;
}

export const STORE_SCHEMA_VERSION = 3;

function createEmptyStore(): ServerDataShape {
  return {
    accountsById: {},
    accountIdByEmail: {},
    accountIdByUsername: {},
    usersData: {},
    liveWatchRooms: {},
    challenges: {},
    duels: {},
    followsByUserId: {},
    sparksByEventId: {},
    activityFeed: [],
    schemaVersion: STORE_SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
  };
}

function normalizeStore(parsed: Partial<ServerDataShape> | null | undefined): ServerDataShape {
  const empty = createEmptyStore();
  if (!parsed || typeof parsed !== 'object') return empty;
  return {
    accountsById: parsed.accountsById ?? {},
    accountIdByEmail: parsed.accountIdByEmail ?? {},
    accountIdByUsername: parsed.accountIdByUsername ?? {},
    usersData: parsed.usersData ?? {},
    liveWatchRooms: parsed.liveWatchRooms ?? {},
    challenges: parsed.challenges ?? {},
    duels: parsed.duels ?? {},
    followsByUserId: parsed.followsByUserId ?? {},
    sparksByEventId: parsed.sparksByEventId ?? {},
    activityFeed: Array.isArray(parsed.activityFeed) ? parsed.activityFeed : [],
    schemaVersion: STORE_SCHEMA_VERSION,
    updatedAt: parsed.updatedAt ?? new Date().toISOString(),
  };
}

// ---- In-process cache -------------------------------------------------------
// Next.js compiles every API route into its own bundle, so each route can hold
// its own copy of this module while sharing the same data file. The cache is
// therefore validated against the file's mtime on every read; a newer file on
// disk always wins, which keeps concurrent routes from clobbering each other.
let cache: ServerDataShape | null = null;
let cacheFileMtimeMs = 0;
// `durableHydrated` = the document has been reconciled with the durable source
// (remote database / disk). A plain in-memory read must never satisfy it.
let durableHydrated = false;
let hydrationPromise: Promise<void> | null = null;
let lastSavedAt: string | null = null;
let lastSaveError: string | null = null;

function dataFileMtimeMs(): number {
  try {
    return fs.statSync(resolveStorageLocation().dataFile).mtimeMs;
  } catch {
    return 0;
  }
}

function updatedAtMs(store: ServerDataShape | null): number {
  if (!store?.updatedAt) return 0;
  const ms = new Date(store.updatedAt).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function accountCount(store: ServerDataShape | null): number {
  return store ? Object.keys(store.accountsById ?? {}).length : 0;
}

/**
 * Load the durable document once per process. API routes await this before
 * touching the store so a fresh instance (right after a deploy) restores every
 * account, tether, spark, duel and cloud snapshot instead of starting empty.
 */
export async function ensureStoreHydrated(): Promise<void> {
  if (durableHydrated) return;
  if (!hydrationPromise) {
    hydrationPromise = (async () => {
      const local = normalizeStore(readLocalJson() as Partial<ServerDataShape> | null);
      let chosen = local;

      if (isRemoteConfigured()) {
        const remote = normalizeStore((await readRemoteJson()) as Partial<ServerDataShape> | null);
        const remoteHasData = accountCount(remote) > 0;
        const localHasData = accountCount(local) > 0;

        if (remoteHasData && (!localHasData || updatedAtMs(remote) >= updatedAtMs(local))) {
          chosen = remote;
        } else if (remoteHasData && accountCount(remote) >= accountCount(local)) {
          chosen = remote;
        } else if (localHasData && !remoteHasData) {
          // Local copy is richer (e.g. first boot with a blank database): push it up.
          queueRemoteSave(local);
        }
      }

      cache = chosen;
      durableHydrated = true;
      // Seed the local working copy from the durable copy when needed.
      if (accountCount(chosen) > 0 && writeLocalJson(chosen)) {
        cacheFileMtimeMs = dataFileMtimeMs();
      }
    })().finally(() => {
      hydrationPromise = null;
    });
  }
  await hydrationPromise;
}

export function readServerStore(): ServerDataShape {
  const location = resolveStorageLocation();

  // Read-only host: memory is the only place we can hold the document.
  if (cache && !location.writable) return cache;

  const mtime = dataFileMtimeMs();
  if (cache && mtime > 0 && mtime === cacheFileMtimeMs) return cache;

  // Another route (or instance) wrote a newer document, or this process has not
  // loaded anything yet — read the freshest copy from disk.
  const fromDisk = normalizeStore(readLocalJson() as Partial<ServerDataShape> | null);

  // A missing file is ambiguous (first boot, or a remote-backed instance whose
  // local write failed). Never trade known accounts for an unknown disk state.
  if (mtime === 0 && cache && accountCount(cache) > 0) return cache;

  cache = fromDisk;
  cacheFileMtimeMs = mtime;
  return cache;
}

export function writeServerStore(data: ServerDataShape): boolean {
  data.schemaVersion = STORE_SCHEMA_VERSION;
  data.updatedAt = new Date().toISOString();
  cache = data;

  const localOk = writeLocalJson(data);
  queueRemoteSave(data);

  if (localOk) {
    cacheFileMtimeMs = dataFileMtimeMs();
    lastSavedAt = data.updatedAt;
    lastSaveError = null;
  } else {
    lastSaveError = 'Local data directory is not writable.';
  }
  return localOk || isRemoteConfigured();
}

/** Await the durable write — used on signup/login-critical mutations. */
export async function persistStoreNow(data: ServerDataShape): Promise<boolean> {
  const accepted = writeServerStore(data);
  if (!isRemoteConfigured()) return accepted;
  const remoteOk = await flushRemoteSave();
  return remoteOk;
}

export function getStoreDiagnostics(): Record<string, unknown> {
  const store = readServerStore();
  return storageDiagnostics({
    accounts: Object.keys(store.accountsById ?? {}).length,
    tethers: Object.values(store.followsByUserId ?? {}).reduce(
      (acc, list) => acc + (Array.isArray(list) ? list.length : 0),
      0
    ),
    sparks: Object.values(store.sparksByEventId ?? {}).reduce(
      (acc, list) => acc + (Array.isArray(list) ? list.length : 0),
      0
    ),
    duels: Object.keys(store.duels ?? {}).length,
    challenges: Object.keys(store.challenges ?? {}).length,
    activityEvents: (store.activityFeed ?? []).length,
    lastUpdatedAt: store.updatedAt ?? null,
    lastSavedAt:
      lastSavedAt ??
      (dataFileMtimeMs() > 0 ? new Date(dataFileMtimeMs()).toISOString() : null),
    lastSaveError,
    durableHydrated,
    dataFile: resolveStorageLocation().dataFile,
  });
}

export function appendActivityEvent(
  store: ServerDataShape,
  params: Omit<ActivityFeedEvent, 'id' | 'createdAt'>
): void {
  const entry: ActivityFeedEvent = {
    id: `act_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    createdAt: new Date().toISOString(),
    ...params,
  };
  store.activityFeed = [entry, ...store.activityFeed].slice(0, 120);
}

const voiceRateBuckets = new Map<string, number[]>();

export function checkVoiceRateLimit(key: string): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const windowMs = 5 * 60 * 1000;
  const maxRequests = 12;

  const history = (voiceRateBuckets.get(key) ?? []).filter((ts) => now - ts < windowMs);
  if (history.length >= maxRequests) {
    const oldest = history[0];
    const retryAfterSeconds = Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000));
    voiceRateBuckets.set(key, history);
    return { allowed: false, retryAfterSeconds };
  }

  history.push(now);
  voiceRateBuckets.set(key, history);
  return { allowed: true, retryAfterSeconds: 0 };
}

// ---- Auth attempt throttling (brute-force protection) -----------------------
const authAttemptBuckets = new Map<string, number[]>();

export function checkAuthAttemptLimit(identifier: string): {
  allowed: boolean;
  retryAfterSeconds: number;
} {
  const now = Date.now();
  const windowMs = 10 * 60 * 1000;
  const maxAttempts = 10;
  const key = identifier.trim().toLowerCase();

  const history = (authAttemptBuckets.get(key) ?? []).filter((ts) => now - ts < windowMs);
  if (history.length >= maxAttempts) {
    const retryAfterSeconds = Math.max(1, Math.ceil((windowMs - history[0]) / 1000));
    authAttemptBuckets.set(key, history);
    return { allowed: false, retryAfterSeconds };
  }
  history.push(now);
  authAttemptBuckets.set(key, history);
  return { allowed: true, retryAfterSeconds: 0 };
}

export function clearAuthAttemptLimit(identifier: string): void {
  authAttemptBuckets.delete(identifier.trim().toLowerCase());
}
