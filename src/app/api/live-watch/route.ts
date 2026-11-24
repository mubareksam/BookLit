import { NextRequest, NextResponse } from 'next/server';
import { readServerStore, writeServerStore } from '@/lib/server/store';
import { LiveWatchSession } from '@/lib/types';

export async function GET(req: NextRequest) {
  const roomCode = req.nextUrl.searchParams.get('roomCode');
  const store = readServerStore();

  if (roomCode) {
    const room = store.liveWatchRooms[roomCode.toUpperCase()] ?? null;
    return NextResponse.json({ room });
  }

  return NextResponse.json({
    rooms: Object.values(store.liveWatchRooms),
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      action: 'create' | 'join' | 'heartbeat' | 'complete';
      roomCode?: string;
      title?: string;
      targetMinutes?: number;
      userId: string;
      displayName: string;
      verifiedMinutesDelta?: number;
      status?: 'reading_calmly' | 'verifying' | 'paused' | 'completed';
    };

    const store = readServerStore();

    if (body.action === 'create') {
      const code = `LAMP-${Math.floor(100 + Math.random() * 899)}`;
      const room: LiveWatchSession = {
        id: `lw-${Date.now()}`,
        room_code: code,
        title: body.title?.trim() || 'Quiet Accountability Room',
        host_user_id: body.userId,
        guest_user_ids: [],
        started_at: new Date().toISOString(),
        ended_at: null,
        target_minutes: Math.max(10, Math.min(180, body.targetMinutes ?? 30)),
        status: 'active',
        host_verified_minutes: 0,
        guest_verified_minutes: {},
        participants: [
          {
            userId: body.userId,
            displayName: body.displayName || 'Host Reader',
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
      if (room.host_user_id !== body.userId && !room.guest_user_ids.includes(body.userId)) {
        room.guest_user_ids.push(body.userId);
        room.guest_verified_minutes[body.userId] = 0;
      }
      if (!room.participants.some((p) => p.userId === body.userId)) {
        room.participants.push({
          userId: body.userId,
          displayName: body.displayName || 'Guest Reader',
          role: room.host_user_id === body.userId ? 'host' : 'guest',
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
      if (room.host_user_id === body.userId) {
        room.host_verified_minutes =
          Math.round((room.host_verified_minutes + delta) * 10) / 10;
      } else {
        const cur = room.guest_verified_minutes[body.userId] ?? 0;
        room.guest_verified_minutes[body.userId] = Math.round((cur + delta) * 10) / 10;
      }
      room.participants = room.participants.map((p) =>
        p.userId === body.userId
          ? {
              ...p,
              verifiedMinutesInRoom:
                Math.round((p.verifiedMinutesInRoom + delta) * 10) / 10,
              status: body.status ?? p.status,
            }
          : p
      );
      writeServerStore(store);
      return NextResponse.json({ room });
    }

    if (body.action === 'complete') {
      room.status = 'completed';
      room.ended_at = new Date().toISOString();
      writeServerStore(store);
      return NextResponse.json({ room });
    }

    return NextResponse.json({ room });
  } catch {
    return NextResponse.json({ error: 'LiveWatch request failed' }, { status: 400 });
  }
}
