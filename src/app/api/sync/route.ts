import { NextRequest, NextResponse } from 'next/server';
import { clearSessionCookie, getAuthenticatedUser } from '@/lib/server/auth';
import { readServerStore, writeServerStore } from '@/lib/server/store';
import { SyncQueueItem, UserProfile } from '@/lib/types';

export async function GET(req: NextRequest) {
  const authUser = getAuthenticatedUser(req);
  if (!authUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const store = readServerStore();
  const userBucket = store.usersData[authUser.id] ?? null;
  return NextResponse.json({ status: 'ok', userId: authUser.id, syncedSnapshot: userBucket });
}

export async function POST(req: NextRequest) {
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
  const authUser = getAuthenticatedUser(req);
  if (!authUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const store = readServerStore();
    delete store.usersData[authUser.id];
    delete store.accountIdByEmail[authUser.email];
    delete store.accountIdByUsername[authUser.username];
    delete store.accountsById[authUser.id];
    writeServerStore(store);

    const res = NextResponse.json({ status: 'deleted', userId: authUser.id });
    clearSessionCookie(res);
    return res;
  } catch {
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
  }
}
