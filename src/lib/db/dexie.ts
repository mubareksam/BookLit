import Dexie, { Table } from 'dexie';
import { format } from 'date-fns';
import {
  Book,
  DailyAggregate,
  LiveWatchSession,
  ReadingSession,
  SessionDraft,
  SyncQueueItem,
  TBRItem,
  UserProfile,
  VerificationEvent,
} from '../types';
import { buildSeedData, DEFAULT_USER_ID } from './seed';

export class BooklitDexie extends Dexie {
  users!: Table<UserProfile, string>;
  books!: Table<Book, string>;
  sessions!: Table<ReadingSession, string>;
  verificationEvents!: Table<VerificationEvent, string>;
  tbrItems!: Table<TBRItem, string>;
  dailyAggregates!: Table<DailyAggregate, string>;
  liveWatchSessions!: Table<LiveWatchSession, string>;
  sessionDrafts!: Table<SessionDraft, string>;
  syncQueue!: Table<SyncQueueItem, string>;

  constructor() {
    super('BooklitOfflineDB_v1');
    this.version(1).stores({
      users: 'id, email',
      books: 'id, user_id, status, title, author, updated_at',
      sessions: 'id, user_id, book_id, started_at, ended_at, verified, strike_issued',
      verificationEvents: 'id, user_id, session_id, type, created_at',
      tbrItems: 'id, user_id, priority, book_id',
      dailyAggregates: 'id, user_id, date',
      liveWatchSessions: 'id, room_code, host_user_id, status',
      sessionDrafts: 'id, user_id, book_id, updated_at',
      syncQueue: 'id, user_id, entity, created_at',
    });
  }
}

export const db = typeof window !== 'undefined' ? new BooklitDexie() : (null as unknown as BooklitDexie);

let seedPromise: Promise<string> | null = null;

export async function ensureDatabaseSeeded(): Promise<string> {
  if (typeof window === 'undefined' || !db) return DEFAULT_USER_ID;
  if (seedPromise) return seedPromise;

  seedPromise = (async () => {
    const activeUserId =
      window.localStorage.getItem('booklit_active_user_id') || DEFAULT_USER_ID;

    const existingCount = await db.users.count();
    if (existingCount === 0) {
      const seeded = buildSeedData(new Date());
      await db.transaction(
        'rw',
        [
          db.users,
          db.books,
          db.sessions,
          db.verificationEvents,
          db.tbrItems,
          db.dailyAggregates,
          db.liveWatchSessions,
        ],
        async () => {
          await db.users.put(seeded.user);
          await db.books.bulkPut(seeded.books);
          await db.sessions.bulkPut(seeded.sessions);
          await db.verificationEvents.bulkPut(seeded.verificationEvents);
          await db.tbrItems.bulkPut(seeded.tbrItems);
          await db.dailyAggregates.bulkPut(seeded.dailyAggregates);
          await db.liveWatchSessions.bulkPut(seeded.liveWatchSessions);
        }
      );
      window.localStorage.setItem('booklit_active_user_id', seeded.user.id);
      return seeded.user.id;
    }

    const activeExists = await db.users.get(activeUserId);
    if (activeExists) return activeExists.id;

    const firstUser = await db.users.toCollection().first();
    if (firstUser) {
      window.localStorage.setItem('booklit_active_user_id', firstUser.id);
      return firstUser.id;
    }
    return DEFAULT_USER_ID;
  })();

  return seedPromise;
}

export async function enqueueSyncItem(
  userId: string,
  entity: SyncQueueItem['entity'],
  operation: SyncQueueItem['operation'],
  payload: unknown
): Promise<void> {
  if (!db) return;
  const item: SyncQueueItem = {
    id: `sync-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    user_id: userId,
    entity,
    operation,
    payload,
    created_at: new Date().toISOString(),
    attempts: 0,
  };
  await db.syncQueue.put(item);
}

export async function flushSyncQueue(
  userId: string,
  forceOfflineSimulation = false
): Promise<{ syncedCount: number; remainingCount: number }> {
  if (!db) return { syncedCount: 0, remainingCount: 0 };
  const pending = await db.syncQueue.where('user_id').equals(userId).toArray();

  if (forceOfflineSimulation || (typeof navigator !== 'undefined' && !navigator.onLine)) {
    return { syncedCount: 0, remainingCount: pending.length };
  }

  if (pending.length === 0) {
    return { syncedCount: 0, remainingCount: 0 };
  }

  try {
    const res = await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, items: pending }),
    });

    if (res.ok) {
      await db.syncQueue.bulkDelete(pending.map((p) => p.id));
      // Mark unsynced sessions as synced
      const unsyncedSessions = await db.sessions
        .where('user_id')
        .equals(userId)
        .filter((s) => !s.synced)
        .toArray();
      if (unsyncedSessions.length > 0) {
        await db.sessions.bulkPut(unsyncedSessions.map((s) => ({ ...s, synced: true })));
      }
      return { syncedCount: pending.length, remainingCount: 0 };
    }
  } catch {
    // Keep safely in IndexedDB queue for later retry
  }

  return { syncedCount: 0, remainingCount: pending.length };
}

/**
 * Records active Booklit foreground app time separately from verified reading session time.
 */
export async function recordAppForegroundSeconds(
  userId: string,
  deltaSeconds: number
): Promise<void> {
  if (!db || deltaSeconds <= 0) return;
  const today = format(new Date(), 'yyyy-MM-dd');
  const aggId = `${userId}_${today}`;
  const existing = await db.dailyAggregates.get(aggId);
  const deltaMin = deltaSeconds / 60;

  if (existing) {
    await db.dailyAggregates.put({
      ...existing,
      app_foreground_minutes:
        Math.round((existing.app_foreground_minutes + deltaMin) * 100) / 100,
    });
  } else {
    await db.dailyAggregates.put({
      id: aggId,
      user_id: userId,
      date: today,
      verified_minutes: 0,
      unverified_minutes: 0,
      app_foreground_minutes: Math.round(deltaMin * 100) / 100,
      pages_read: 0,
      sessions_count: 0,
      strike_events: 0,
      cure_events: 0,
      streak_qualifies: false,
    });
  }
}

export async function exportAllUserDataJson(userId: string): Promise<string> {
  const [user, books, sessions, verificationEvents, tbrItems, dailyAggregates] =
    await Promise.all([
      db.users.get(userId),
      db.books.where('user_id').equals(userId).toArray(),
      db.sessions.where('user_id').equals(userId).toArray(),
      db.verificationEvents.where('user_id').equals(userId).toArray(),
      db.tbrItems.where('user_id').equals(userId).toArray(),
      db.dailyAggregates.where('user_id').equals(userId).toArray(),
    ]);

  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      platform: 'Booklit',
      schemaVersion: '1.0',
      user,
      books,
      readingSessions: sessions,
      verificationEvents,
      tbrItems,
      dailyAggregates,
    },
    null,
    2
  );
}

export async function exportAllUserDataCsv(userId: string): Promise<string> {
  const [books, sessions] = await Promise.all([
    db.books.where('user_id').equals(userId).toArray(),
    db.sessions.where('user_id').equals(userId).toArray(),
  ]);
  const bookMap = new Map(books.map((b) => [b.id, b]));

  const escapeCsv = (val: unknown) => {
    const str = val === null || val === undefined ? '' : String(val);
    if (/[",\n]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const headers = [
    'session_id',
    'book_title',
    'author',
    'genres',
    'medium',
    'started_at_utc',
    'ended_at_utc',
    'start_page',
    'end_page',
    'pages_read',
    'actual_minutes',
    'predicted_minutes',
    'wpm_observed',
    'trust_score',
    'verified',
    'verification_tier',
    'strike_issued',
    'cure_session_id',
    'flags',
  ];

  const rows = sessions
    .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())
    .map((s) => {
      const book = bookMap.get(s.book_id);
      return [
        s.id,
        book?.title ?? 'Unknown Book',
        book?.author ?? '',
        book?.genre.join('|') ?? '',
        s.medium,
        s.started_at,
        s.ended_at,
        s.start_page,
        s.end_page,
        Math.max(0, s.end_page - s.start_page),
        s.actual_minutes,
        s.predicted_minutes,
        s.wpm_observed,
        s.trust_score,
        s.verified,
        s.verification_tier,
        s.strike_issued,
        s.cure_session_id ?? '',
        s.flags_json.map((f) => f.code).join('|'),
      ]
        .map(escapeCsv)
        .join(',');
    });

  return [headers.join(','), ...rows].join('\n');
}

export async function deleteUserAccountData(userId: string): Promise<void> {
  await db.transaction(
    'rw',
    [
      db.users,
      db.books,
      db.sessions,
      db.verificationEvents,
      db.tbrItems,
      db.dailyAggregates,
      db.sessionDrafts,
      db.syncQueue,
    ],
    async () => {
      await db.users.delete(userId);
      await db.books.where('user_id').equals(userId).delete();
      await db.sessions.where('user_id').equals(userId).delete();
      await db.verificationEvents.where('user_id').equals(userId).delete();
      await db.tbrItems.where('user_id').equals(userId).delete();
      await db.dailyAggregates.where('user_id').equals(userId).delete();
      await db.sessionDrafts.where('user_id').equals(userId).delete();
      await db.syncQueue.where('user_id').equals(userId).delete();
    }
  );

  try {
    await fetch('/api/sync', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
  } catch {
    // Local deletion already complete
  }
}
