import {
  NextRequest,
  NextResponse } from 'next/server'; import { addHours } from 'date-fns'; import { getAuthenticatedUser } from '@/lib/server/auth'; import {   appendActivityEvent,
  ServerDataShape,
  ensureStoreHydrated,
  readServerStore,
  writeServerStore,
} from '@/lib/server/store';
import { ReadingDuel } from '@/lib/types';
import { settleExpiredDuels } from '@/lib/server/duelSettlement';

export async function GET(req: NextRequest) {
  await ensureStoreHydrated();
  const user = getAuthenticatedUser(req);
  if (!user) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  const store = readServerStore();
  if (settleExpiredDuels(store)) {
    writeServerStore(store);
  }

  const relevantDuels = Object.values(store.duels)
    .filter((d) => {
      if (d.status === 'declined') return false;
      const isParticipant =
        d.challenger.userId === user.id || d.opponent?.userId === user.id;
      const isInvited =
        d.invited_username && d.invited_username.toLowerCase() === user.username.toLowerCase();
      const isOpenPublic = d.status === 'open' && !d.invited_username;
      return isParticipant || isInvited || isOpenPublic || d.status === 'active';
    })
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return NextResponse.json({ duels: relevantDuels });
}

export async function POST(req: NextRequest) {
  await ensureStoreHydrated();
  const user = getAuthenticatedUser(req);
  if (!user) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  try {
    const body = (await req.json()) as {
      action: 'create' | 'accept' | 'decline';
      duelId?: string;
      inviteCode?: string;
      title?: string;
      metric?: 'verified_minutes' | 'verified_pages';
      targetValue?: number;
      durationHours?: number;
      invitedUsername?: string | null;
    };

    const store = readServerStore();
    settleExpiredDuels(store);

    if (body.action === 'create') {
      const rawInvited = (body.invitedUsername ?? '').trim().replace(/^@/, '').toLowerCase();
      if (rawInvited) {
        if (rawInvited === user.username.toLowerCase()) {
          return NextResponse.json(
            { error: 'You cannot challenge yourself to a 1v1 duel.' },
            { status: 400 }
          );
        }
        if (!store.accountIdByUsername[rawInvited]) {
          return NextResponse.json(
            { error: `Reader @${rawInvited} was not found.` },
            { status: 404 }
          );
        }
      }

      const hours = [24, 72, 168].includes(Number(body.durationHours))
        ? Number(body.durationHours)
        : 72;
      const metric = body.metric === 'verified_pages' ? 'verified_pages' : 'verified_minutes';
      const targetValue = Math.max(
        15,
        Math.min(5000, Number(body.targetValue) || (metric === 'verified_pages' ? 80 : 90))
      );
      const code = `DL${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      const nowIso = new Date().toISOString();

      const title =
        (body.title ?? '').trim() ||
        (rawInvited ? `1v1 vs @${rawInvited}` : `${hours}h Open Reading Duel`);

      const duel: ReadingDuel = {
        id: `duel_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        invite_code: code,
        title: title.slice(0, 80),
        metric,
        target_value: targetValue,
        duration_hours: hours,
        status: 'open',
        challenger: {
          userId: user.id,
          username: user.username,
          displayName: user.display_name,
          verifiedMinutes: 0,
          verifiedPages: 0,
          verifiedSessionsCount: 0,
          avgTrustScore: 1000,
          lastVerifiedAt: null,
        },
        opponent: null,
        invited_username: rawInvited || null,
        winner_user_id: null,
        created_at: nowIso,
        starts_at: null,
        ends_at: null,
      };

      store.duels[duel.id] = duel;
      appendActivityEvent(store, {
        actorUserId: user.id,
        actorUsername: user.username,
        actorDisplayName: user.display_name,
        type: 'duel_created',
        summary: rawInvited
          ? `challenged @${rawInvited} to a 1v1 duel (${targetValue}${
              metric === 'verified_pages' ? 'p' : 'm'
            })`
          : `opened a 1v1 duel "${duel.title}" (${targetValue}${
              metric === 'verified_pages' ? 'p' : 'm'
            })`,
      });
      writeServerStore(store);

      return NextResponse.json({ duel });
    }

    // Find target duel by ID or inviteCode
    let duel: ReadingDuel | undefined;
    if (body.duelId) {
      duel = store.duels[body.duelId];
    } else if (body.inviteCode) {
      const cleanCode = body.inviteCode.trim().toUpperCase();
      duel = Object.values(store.duels).find((d) => d.invite_code === cleanCode);
    }

    if (!duel) {
      return NextResponse.json({ error: 'Duel not found.' }, { status: 404 });
    }

    if (body.action === 'accept') {
      if (duel.status !== 'open') {
        return NextResponse.json({ error: 'This duel is no longer open.' }, { status: 400 });
      }
      if (duel.challenger.userId === user.id) {
        return NextResponse.json({ error: 'Waiting for an opponent to accept.' }, { status: 400 });
      }
      if (
        duel.invited_username &&
        duel.invited_username.toLowerCase() !== user.username.toLowerCase()
      ) {
        return NextResponse.json(
          { error: `Reserved for @${duel.invited_username}.` },
          { status: 403 }
        );
      }

      const now = new Date();
      duel.opponent = {
        userId: user.id,
        username: user.username,
        displayName: user.display_name,
        verifiedMinutes: 0,
        verifiedPages: 0,
        verifiedSessionsCount: 0,
        avgTrustScore: 1000,
        lastVerifiedAt: null,
      };
      duel.status = 'active';
      duel.starts_at = now.toISOString();
      duel.ends_at = addHours(now, duel.duration_hours).toISOString();

      appendActivityEvent(store, {
        actorUserId: user.id,
        actorUsername: user.username,
        actorDisplayName: user.display_name,
        type: 'duel_accepted',
        summary: `accepted @${duel.challenger.username}’s 1v1 duel "${duel.title}"`,
      });
      writeServerStore(store);

      return NextResponse.json({ duel });
    }

    if (body.action === 'decline') {
      if (
        duel.status === 'open' &&
        duel.invited_username?.toLowerCase() === user.username.toLowerCase()
      ) {
        duel.status = 'declined';
        writeServerStore(store);
      }
      return NextResponse.json({ duel });
    }

    return NextResponse.json({ error: 'Invalid duel action' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'Duel request failed' }, { status: 500 });
  }
}
