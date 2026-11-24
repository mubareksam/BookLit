import { NextRequest, NextResponse } from 'next/server';
import { readServerStore, writeServerStore } from '@/lib/server/store';
import { SyncQueueItem } from '@/lib/types';

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId');
  if (!userId) {
    return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
  }
  const store = readServerStore();
  const userBucket = store.usersData[userId] ?? null;
  return NextResponse.json({ status: 'ok', userId, syncedSnapshot: userBucket });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { userId?: string; items?: SyncQueueItem[] };
    const userId = body.userId;
    if (!userId || !Array.isArray(body.items)) {
      return NextResponse.json({ error: 'Invalid sync payload' }, { status: 400 });
    }

    const store = readServerStore();
    if (!store.usersData[userId]) {
      store.usersData[userId] = {
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
      // Enforce RLS-style user_id scoping on server
      if (item.user_id !== userId) continue;
      const record = item.payload as Record<string, unknown> | null;
      const id = record && typeof record.id === 'string' ? record.id : item.id;

      if (item.entity === 'profile') {
        bucket.profile = record;
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
  try {
    const body = (await req.json()) as { userId?: string };
    if (!body.userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }
    const store = readServerStore();
    delete store.usersData[body.userId];
    writeServerStore(store);
    return NextResponse.json({ status: 'deleted', userId: body.userId });
  } catch {
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
  }
}
