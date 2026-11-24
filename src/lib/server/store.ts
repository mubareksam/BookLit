import fs from 'fs';
import path from 'path';
import { LiveWatchSession } from '../types';

interface ServerDataShape {
  usersData: Record<
    string,
    {
      profile?: unknown;
      books: Record<string, unknown>;
      sessions: Record<string, unknown>;
      verificationEvents: Record<string, unknown>;
      tbr: Record<string, unknown>;
      dailyAggregates: Record<string, unknown>;
      updatedAt: string;
    }
  >;
  liveWatchRooms: Record<string, LiveWatchSession>;
}

const DATA_DIR = process.env.BOOKLIT_DATA_DIR || path.join(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'booklit-server.json');

function ensureDefaultStore(): ServerDataShape {
  return {
    usersData: {},
    liveWatchRooms: {
      'LAMP-402': {
        id: 'lw-room-evening',
        room_code: 'LAMP-402',
        title: 'Evening Quiet Reading Hour',
        host_user_id: 'reader-hana-001',
        guest_user_ids: ['guest-dawit', 'guest-mira'],
        started_at: new Date(Date.now() - 18 * 60000).toISOString(),
        ended_at: null,
        target_minutes: 45,
        status: 'active',
        host_verified_minutes: 25.4,
        guest_verified_minutes: {
          'guest-dawit': 21.0,
          'guest-mira': 16.5,
        },
        participants: [
          {
            userId: 'reader-hana-001',
            displayName: 'Hana Tekle',
            role: 'host',
            verifiedMinutesInRoom: 25.4,
            status: 'reading_calmly',
            joinedAt: new Date(Date.now() - 18 * 60000).toISOString(),
          },
          {
            userId: 'guest-dawit',
            displayName: 'Dawit A.',
            role: 'guest',
            verifiedMinutesInRoom: 21.0,
            status: 'reading_calmly',
            joinedAt: new Date(Date.now() - 16 * 60000).toISOString(),
          },
          {
            userId: 'guest-mira',
            displayName: 'Mira K.',
            role: 'guest',
            verifiedMinutesInRoom: 16.5,
            status: 'reading_calmly',
            joinedAt: new Date(Date.now() - 14 * 60000).toISOString(),
          },
        ],
      },
    },
  };
}

export function readServerStore(): ServerDataShape {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      return ensureDefaultStore();
    }
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(raw) as ServerDataShape;
  } catch {
    return ensureDefaultStore();
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
    // Non-fatal in read-only environments
  }
}

// Sliding-window rate limiter for voice verification endpoint (max 12 checks / 5 minutes per client/user)
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
