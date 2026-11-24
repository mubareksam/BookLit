import { NextRequest, NextResponse } from 'next/server';
import { clearSessionCookie, getAuthenticatedUser } from '@/lib/server/auth';
import {
  ensureStoreHydrated,
  persistStoreNow,
  readServerStore,
  writeServerStore,
} from '@/lib/server/store';
import { SyncQueueItem, UserProfile } from '@/lib/types';

export async function GET(req: NextRequest) {
  await ensureStoreHydrated();
  const authUser = getAuthenticatedUser(req);
  if (!authUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const store = readServerStore();
  const userBucket = store.usersData[authUser.id] ?? null;
  return NextResponse.json({ status: 'ok', userId: authUser.id, syncedSnapshot: userBucket });
}

export async function POST(req: NextRequest) {
  await ensureStoreHydrated();
  const authUser = getAuthenticatedUser(req);
  if (!authUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = (await req.json()) as { items?: SyncQueueItem[] };
    if (!Array.isArray(body.items)) {
      return NextResponse.json({ error: 'Invalid sync payload' }, { status: 400 });
    }

    const store = readServerStore();
    const userId = authUser.id;
    if (!store.usersData[userId]) {
      store.usersData[userId] = {
        profile: authUser,
        books: {},
        sessions: {},
        verificationEvents: {},
        tbr: {},
        dailyAggregates: {},
        updatedAt: new Date().toISOString(),
      };
    }

    const bucket = store.usersData[userId];
    for (const item of body.items) {
      if (item.user_id !== userId) continue;
      const record = item.payload as Record<string, unknown> | null;
      const id = record && typeof record.id === 'string' ? record.id : item.id;

      if (item.entity === 'profile' && record) {
        const updatedProfile = {
          ...authUser,
          ...(record as unknown as UserProfile),
          id: userId,
          email: authUser.email,
          username: authUser.username,
        };
        bucket.profile = updatedProfile;
        if (store.accountsById[userId]) {
          store.accountsById[userId].user = updatedProfile;
        }
      } else if (item.entity === 'book') {
        if (item.operation === 'delete') delete bucket.books[id];
        else bucket.books[id] = record;
      } else if (item.entity === 'session') {
        if (item.operation === 'delete') delete bucket.sessions[id];
        else bucket.sessions[id] = record;
      } else if (item.entity === 'verification_event') {
        bucket.verificationEvents[id] = record;
      } else if (item.entity === 'tbr') {
        if (item.operation === 'delete') delete bucket.tbr[id];
        else bucket.tbr[id] = record;
      } else if (item.entity === 'daily_aggregate') {
        bucket.dailyAggregates[id] = record;
      }
    }

    bucket.updatedAt = new Date().toISOString();
    writeServerStore(store);

    return NextResponse.json({
      status: 'synced',
      processed: body.items.length,
      syncedAt: bucket.updatedAt,
    });
  } catch {
    return NextResponse.json({ error: 'Sync processing error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  await ensureStoreHydrated();
  const authUser = getAuthenticatedUser(req);
  if (!authUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const store = readServerStore();

    // 1. Cloud snapshots + credentials + lookup indexes
    delete store.usersData[authUser.id];
    delete store.accountsById[authUser.id];
    delete store.accountIdByEmail[(authUser.email ?? '').trim().toLowerCase()];
    delete store.accountIdByUsername[(authUser.username ?? '').trim().toLowerCase()];

    // 2. Tethers in both directions
    delete store.followsByUserId[authUser.id];
    for (const [viewerId, list] of Object.entries(store.followsByUserId)) {
      store.followsByUserId[viewerId] = list.filter((id) => id !== authUser.id);
    }

    // 3. Sparks this reader received or gave
    for (const [eventId, list] of Object.entries(store.sparksByEventId)) {
      const remaining = list.filter((id) => id !== authUser.id);
      if (remaining.length > 0) store.sparksByEventId[eventId] = remaining;
      else delete store.sparksByEventId[eventId];
    }
    store.activityFeed = store.activityFeed.filter(
      (event) => event.actorUserId !== authUser.id
    );

    // 4. Duel entries and challenge leaderboard rows
    for (const [duelId, duel] of Object.entries(store.duels)) {
      if (duel.challenger.userId === authUser.id || duel.opponent?.userId === authUser.id) {
        delete store.duels[duelId];
      }
    }
    for (const challenge of Object.values(store.challenges)) {
      challenge.participants = challenge.participants.filter(
        (participant) => participant.userId !== authUser.id
      );
    }

    // 5. Live rooms owned by the reader
    for (const [roomId, room] of Object.entries(store.liveWatchRooms)) {
      if (room.host_user_id === authUser.id) delete store.liveWatchRooms[roomId];
    }

    await persistStoreNow(store);

    const res = NextResponse.json({ status: 'deleted', userId: authUser.id });
    clearSessionCookie(res);
    return res;
  } catch (err) {
    return NextResponse.json(
      { error: `Delete failed: ${(err as Error).message}` },
      { status: 500 }
    );
  }
}
