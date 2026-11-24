import fs from 'fs';
import path from 'path';
import {
  ActivityFeedEvent,
  LiveWatchSession,
  ReadingChallenge,
  ReadingDuel,
  UserProfile,
} from '../types';

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
  activityFeed: ActivityFeedEvent[];
}

const DATA_DIR = process.env.BOOKLIT_DATA_DIR || path.join(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'booklit-prod-v2.json');

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
    activityFeed: [],
  };
}

export function readServerStore(): ServerDataShape {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      return createEmptyStore();
    }
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<ServerDataShape>;
    return {
      accountsById: parsed.accountsById ?? {},
      accountIdByEmail: parsed.accountIdByEmail ?? {},
      accountIdByUsername: parsed.accountIdByUsername ?? {},
      usersData: parsed.usersData ?? {},
      liveWatchRooms: parsed.liveWatchRooms ?? {},
      challenges: parsed.challenges ?? {},
      duels: parsed.duels ?? {},
      followsByUserId: parsed.followsByUserId ?? {},
      activityFeed: Array.isArray(parsed.activityFeed) ? parsed.activityFeed : [],
    };
  } catch {
    return createEmptyStore();
  }
}

export function writeServerStore(data: ServerDataShape): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const tmp = `${DATA_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, DATA_FILE);
  } catch {
    // Non-fatal fallback
  }
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
