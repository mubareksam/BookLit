import Dexie, { Table } from 'dexie';
import { format } from 'date-fns';
import {
  Book,
  DailyAggregate,
  ReadingSession,
  SessionDraft,
  SyncQueueItem,
  TBRItem,
  UserProfile,
  VerificationEvent,
} from '../types';

export class BooklitDexie extends Dexie {
  users!: Table<UserProfile, string>;
  books!: Table<Book, string>;
  sessions!: Table<ReadingSession, string>;
  verificationEvents!: Table<VerificationEvent, string>;
  tbrItems!: Table<TBRItem, string>;
  dailyAggregates!: Table<DailyAggregate, string>;
  sessionDrafts!: Table<SessionDraft, string>;
  syncQueue!: Table<SyncQueueItem, string>;

  constructor() {
    super('BooklitProdDB_v2');
    this.version(1).stores({
      users: 'id, email, username',
      books: 'id, user_id, status, title, author, updated_at',
      sessions: 'id, user_id, book_id, started_at, ended_at, verified, strike_issued',
      verificationEvents: 'id, user_id, session_id, type, created_at',
      tbrItems: 'id, user_id, priority, book_id',
      dailyAggregates: 'id, user_id, date',
      sessionDrafts: 'id, user_id, book_id, updated_at',
      syncQueue: 'id, user_id, entity, created_at',
    });
  }
}

export const db =
  typeof window !== 'undefined' ? new BooklitDexie() : (null as unknown as BooklitDexie);

export async function hydrateUserSnapshotIntoDexie(
  user: UserProfile,
  snapshot?: {
    books?: Record<string, Book>;
    sessions?: Record<string, ReadingSession>;
    verificationEvents?: Record<string, VerificationEvent>;
    tbr?: Record<string, TBRItem>;
    dailyAggregates?: Record<string, DailyAggregate>;
  } | null
): Promise<void> {
  if (typeof window === 'undefined' || !db) return;

  await db.transaction(
    'rw',
    [db.users, db.books, db.sessions, db.verificationEvents, db.tbrItems, db.dailyAggregates],
    async () => {
      await db.users.put(user);
      if (!snapshot) return;

      const books = Object.values(snapshot.books ?? {});
      const sessions = Object.values(snapshot.sessions ?? {});
      const events = Object.values(snapshot.verificationEvents ?? {});
      const tbr = Object.values(snapshot.tbr ?? {});
      const aggs = Object.values(snapshot.dailyAggregates ?? {});

      if (books.length > 0) await db.books.bulkPut(books);
      if (sessions.length > 0) await db.sessions.bulkPut(sessions);
      if (events.length > 0) await db.verificationEvents.bulkPut(events);
      if (tbr.length > 0) await db.tbrItems.bulkPut(tbr);
      if (aggs.length > 0) await db.dailyAggregates.bulkPut(aggs);
    }
  );
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

/**
 * Re-upload everything this device already holds for a reader. Used after an
 * account recovery so local-only history is never stranded on the device.
 */
export async function pushLocalDataToCloud(userId: string): Promise<number> {
  if (!db) return 0;

  const [books, sessions, events, tbr, aggregates] = await Promise.all([
    db.books.where('user_id').equals(userId).toArray(),
    db.sessions.where('user_id').equals(userId).toArray(),
    db.verificationEvents.where('user_id').equals(userId).toArray(),
    db.tbrItems.where('user_id').equals(userId).toArray(),
    db.dailyAggregates.where('user_id').equals(userId).toArray(),
  ]);

  let queued = 0;
  for (const book of books) {
    await enqueueSyncItem(userId, 'book', 'upsert', book);
    queued++;
  }
  for (const session of sessions) {
    await enqueueSyncItem(userId, 'session', 'upsert', session);
    queued++;
  }
  for (const event of events) {
    await enqueueSyncItem(userId, 'verification_event', 'upsert', event);
    queued++;
  }
  for (const item of tbr) {
    await enqueueSyncItem(userId, 'tbr', 'upsert', item);
    queued++;
  }
  for (const aggregate of aggregates) {
    await enqueueSyncItem(userId, 'daily_aggregate', 'upsert', aggregate);
    queued++;
  }

  if (queued > 0) await flushSyncQueue(userId);
  return queued;
}

export async function findLocalUserByIdentifier(
  identifier: string
): Promise<UserProfile | null> {
  if (!db) return null;
  const needle = identifier.trim().replace(/^@+/, '').toLowerCase();
  if (!needle) return null;
  const users = await db.users.toArray();
  return (
    users.find(
      (user) =>
        (user.email ?? '').toLowerCase() === needle ||
        (user.username ?? '').toLowerCase() === needle
    ) ?? null
  );
}

export async function flushSyncQueue(
  userId: string
): Promise<{ syncedCount: number; remainingCount: number }> {
  if (!db) return { syncedCount: 0, remainingCount: 0 };
  const pending = await db.syncQueue.where('user_id').equals(userId).toArray();

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { syncedCount: 0, remainingCount: pending.length };
  }

  if (pending.length === 0) {
    return { syncedCount: 0, remainingCount: 0 };
  }

  try {
    const res = await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: pending }),
    });

    if (res.ok) {
      await db.syncQueue.bulkDelete(pending.map((p) => p.id));
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
    // Kept safely in IndexedDB until connectivity returns
  }

  return { syncedCount: 0, remainingCount: pending.length };
}

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
      app_foreground_minutes: Math.round((existing.app_foreground_minutes + deltaMin) * 100) / 100,
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
      schemaVersion: '2.0',
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
    'challenge_eligible',
    'verification_tier',
    'strike_issued',
    'cure_session_id',
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
        Boolean(s.challenge_eligible),
        s.verification_tier,
        s.strike_issued,
        s.cure_session_id ?? '',
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

  await fetch('/api/sync', { method: 'DELETE' }).catch(() => {});
}
