import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/server/auth';
import { readServerStore, writeServerStore } from '@/lib/server/store';
import { LiveWatchSession } from '@/lib/types';

export async function GET(req: NextRequest) {
  const user = getAuthenticatedUser(req);
  if (!user) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  const roomCode = req.nextUrl.searchParams.get('roomCode');
  const store = readServerStore();

  if (roomCode) {
    const room = store.liveWatchRooms[roomCode.toUpperCase()] ?? null;
    return NextResponse.json({ room });
  }

  return NextResponse.json({
    rooms: Object.values(store.liveWatchRooms).filter((r) => r.status === 'active'),
  });
}

export async function POST(req: NextRequest) {
  const user = getAuthenticatedUser(req);
  if (!user) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  try {
    const body = (await req.json()) as {
      action: 'create' | 'join' | 'heartbeat' | 'complete';
      roomCode?: string;
      title?: string;
      targetMinutes?: number;
      verifiedMinutesDelta?: number;
      status?: 'reading_calmly' | 'verifying' | 'paused' | 'completed';
    };

    const store = readServerStore();

    if (body.action === 'create') {
      const code = `RM-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      const room: LiveWatchSession = {
        id: `lw-${Date.now()}`,
        room_code: code,
        title: body.title?.trim() || `${user.display_name}’s Reading Room`,
        host_user_id: user.id,
        guest_user_ids: [],
        started_at: new Date().toISOString(),
        ended_at: null,
        target_minutes: Math.max(10, Math.min(180, body.targetMinutes ?? 30)),
        status: 'active',
        host_verified_minutes: 0,
        guest_verified_minutes: {},
        participants: [
          {
            userId: user.id,
            username: user.username,
            displayName: user.display_name,
            role: 'host',
            verifiedMinutesInRoom: 0,
            status: 'reading_calmly',
            joinedAt: new Date().toISOString(),
          },
        ],
      };
      store.liveWatchRooms[code] = room;
      writeServerStore(store);
      return NextResponse.json({ room });
    }

    const code = (body.roomCode ?? '').toUpperCase();
    const room = store.liveWatchRooms[code];
    if (!room) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 });
    }

    if (body.action === 'join') {
      if (room.host_user_id !== user.id && !room.guest_user_ids.includes(user.id)) {
        room.guest_user_ids.push(user.id);
        room.guest_verified_minutes[user.id] = 0;
      }
      if (!room.participants.some((p) => p.userId === user.id)) {
        room.participants.push({
          userId: user.id,
          username: user.username,
          displayName: user.display_name,
          role: room.host_user_id === user.id ? 'host' : 'guest',
          verifiedMinutesInRoom: 0,
          status: 'reading_calmly',
          joinedAt: new Date().toISOString(),
        });
      }
      writeServerStore(store);
      return NextResponse.json({ room });
    }

    if (body.action === 'heartbeat') {
      const delta = Math.max(0, Number(body.verifiedMinutesDelta ?? 0));
      if (room.host_user_id === user.id) {
        room.host_verified_minutes = Math.round((room.host_verified_minutes + delta) * 10) / 10;
      } else {
        const cur = room.guest_verified_minutes[user.id] ?? 0;
        room.guest_verified_minutes[user.id] = Math.round((cur + delta) * 10) / 10;
      }
      room.participants = room.participants.map((p) =>
        p.userId === user.id
          ? {
              ...p,
              verifiedMinutesInRoom: Math.round((p.verifiedMinutesInRoom + delta) * 10) / 10,
              status: body.status ?? p.status,
            }
          : p
      );
      writeServerStore(store);
      return NextResponse.json({ room });
    }

    if (body.action === 'complete' && room.host_user_id === user.id) {
      room.status = 'completed';
      room.ended_at = new Date().toISOString();
      writeServerStore(store);
      return NextResponse.json({ room });
    }

    return NextResponse.json({ room });
  } catch {
    return NextResponse.json({ error: 'Live room request failed' }, { status: 400 });
  }
}
