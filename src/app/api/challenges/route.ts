import { NextRequest, NextResponse } from 'next/server';
import { addDays } from 'date-fns';
import { getAuthenticatedUser } from '@/lib/server/auth';
import { appendActivityEvent, readServerStore, writeServerStore } from '@/lib/server/store';
import { ReadingChallenge } from '@/lib/types';
import { settleExpiredDuels } from '@/app/api/duels/route';

export async function GET(req: NextRequest) {
  const user = getAuthenticatedUser(req);
  if (!user) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  const store = readServerStore();
  const allChallenges = Object.values(store.challenges).filter(
    (c) =>
      c.visibility === 'public' ||
      c.creator_user_id === user.id ||
      c.participants.some((p) => p.userId === user.id)
  );

  const sorted = allChallenges
    .map((c) => ({
      ...c,
      participants: [...c.participants].sort((a, b) =>
        c.metric === 'verified_pages'
          ? b.verifiedPages - a.verifiedPages
          : b.verifiedMinutes - a.verifiedMinutes
      ),
    }))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return NextResponse.json({ challenges: sorted });
}

export async function POST(req: NextRequest) {
  const user = getAuthenticatedUser(req);
  if (!user) {
    return NextResponse.json(
      { error: 'You must sign in to participate in challenges.' },
      { status: 401 }
    );
  }

  try {
    const body = (await req.json()) as {
      action: 'create' | 'join' | 'record_verified_session';
      challengeId?: string;
      duelId?: string;
      inviteCode?: string;
      title?: string;
      description?: string;
      metric?: 'verified_minutes' | 'verified_pages';
      targetValue?: number;
      durationDays?: number;
      visibility?: 'public' | 'private';
      strictVerification?: boolean;
      verifiedMinutes?: number;
      verifiedPages?: number;
      trustScore?: number;
      bookTitle?: string;
      liveCameraVerified?: boolean;
      challengeEligible?: boolean;
    };

    const store = readServerStore();
    settleExpiredDuels(store);

    if (body.action === 'create') {
      const title = (body.title ?? '').trim();
      if (title.length < 3) {
        return NextResponse.json(
          { error: 'Challenge title must be at least 3 characters.' },
          { status: 400 }
        );
      }

      const code = Math.random().toString(36).slice(2, 8).toUpperCase();
      const now = new Date();
      const days = Math.max(1, Math.min(90, Number(body.durationDays) || 7));

      const challenge: ReadingChallenge = {
        id: `chl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        invite_code: code,
        title,
        description: (body.description ?? '').trim().slice(0, 240),
        creator_user_id: user.id,
        creator_name: user.display_name,
        metric: body.metric === 'verified_pages' ? 'verified_pages' : 'verified_minutes',
        target_value: Math.max(10, Math.min(10000, Number(body.targetValue) || 180)),
        visibility: body.visibility === 'private' ? 'private' : 'public',
        strict_verification: body.strictVerification !== false,
        starts_at: now.toISOString(),
        ends_at: addDays(now, days).toISOString(),
        created_at: now.toISOString(),
        participants: [
          {
            userId: user.id,
            username: user.username,
            displayName: user.display_name,
            verifiedMinutes: 0,
            verifiedPages: 0,
            verifiedSessionsCount: 0,
            avgTrustScore: 100,
            joinedAt: now.toISOString(),
            lastVerifiedAt: null,
          },
        ],
      };

      store.challenges[challenge.id] = challenge;
      if (challenge.visibility === 'public') {
        appendActivityEvent(store, {
          actorUserId: user.id,
          actorUsername: user.username,
          actorDisplayName: user.display_name,
          type: 'challenge_created',
          summary: `launched challenge "${challenge.title}"`,
        });
      }
      writeServerStore(store);
      return NextResponse.json({ challenge });
    }

    if (body.action === 'join') {
      let target: ReadingChallenge | undefined;
      if (body.challengeId) {
        target = store.challenges[body.challengeId];
      } else if (body.inviteCode) {
        const cleanCode = body.inviteCode.trim().toUpperCase();
        target = Object.values(store.challenges).find((c) => c.invite_code === cleanCode);
      }

      if (!target) {
        return NextResponse.json({ error: 'Challenge not found.' }, { status: 404 });
      }

      if (!target.participants.some((p) => p.userId === user.id)) {
        target.participants.push({
          userId: user.id,
          username: user.username,
          displayName: user.display_name,
          verifiedMinutes: 0,
          verifiedPages: 0,
          verifiedSessionsCount: 0,
          avgTrustScore: 100,
          joinedAt: new Date().toISOString(),
          lastVerifiedAt: null,
        });
        appendActivityEvent(store, {
          actorUserId: user.id,
          actorUsername: user.username,
          actorDisplayName: user.display_name,
          type: 'challenge_joined',
          summary: `joined "${target.title}"`,
        });
        writeServerStore(store);
      }

      return NextResponse.json({ challenge: target });
    }

    if (body.action === 'record_verified_session') {
      // Strict Anti-Cheat Gate: ONLY live-camera scanned + anti-cheat eligible sessions credit Challenges or Duels
      if (!body.challengeEligible || !body.liveCameraVerified) {
        return NextResponse.json({
          creditedChallenges: 0,
          creditedDuels: 0,
          reason: 'Live start/end camera scan + anti-cheat seal required for competitive points.',
        });
      }

      const mins = Math.max(0, Math.min(240, Number(body.verifiedMinutes) || 0));
      const pages = Math.max(0, Math.min(400, Number(body.verifiedPages) || 0));
      const trust = Math.max(50, Math.min(100, Number(body.trustScore) || 85));
      const nowMs = Date.now();
      const nowIso = new Date().toISOString();

      let creditedChallenges = 0;
      let creditedDuels = 0;

      // 1. Credit active Multi-User Challenges
      for (const ch of Object.values(store.challenges)) {
        if (new Date(ch.ends_at).getTime() < nowMs) continue;
        const entry = ch.participants.find((p) => p.userId === user.id);
        if (!entry) continue;
        if (body.challengeId && ch.id !== body.challengeId) continue;

        const prevCount = entry.verifiedSessionsCount;
        entry.verifiedMinutes = Math.round((entry.verifiedMinutes + mins) * 10) / 10;
        entry.verifiedPages += pages;
        entry.verifiedSessionsCount = prevCount + 1;
        entry.avgTrustScore = Math.round(
          (entry.avgTrustScore * prevCount + trust) / (prevCount + 1)
        );
        entry.lastVerifiedAt = nowIso;
        creditedChallenges++;
      }

      // 2. Credit active 1v1 Reading Duels & check instant target victory
      for (const duel of Object.values(store.duels)) {
        if (duel.status !== 'active') continue;
        if (duel.ends_at && new Date(duel.ends_at).getTime() < nowMs) continue;
        if (body.duelId && duel.id !== body.duelId) continue;

        const contender =
          duel.challenger.userId === user.id
            ? duel.challenger
            : duel.opponent?.userId === user.id
            ? duel.opponent
            : null;
        if (!contender) continue;

        const prevCount = contender.verifiedSessionsCount;
        contender.verifiedMinutes = Math.round((contender.verifiedMinutes + mins) * 10) / 10;
        contender.verifiedPages += pages;
        contender.verifiedSessionsCount = prevCount + 1;
        contender.avgTrustScore = Math.round(
          (contender.avgTrustScore * prevCount + trust) / (prevCount + 1)
        );
        contender.lastVerifiedAt = nowIso;
        creditedDuels++;

        // First to reach target_value wins the 1v1 Duel immediately!
        const newScore =
          duel.metric === 'verified_pages' ? contender.verifiedPages : contender.verifiedMinutes;
        if (newScore >= duel.target_value) {
          duel.status = 'completed';
          duel.winner_user_id = user.id;
          const other =
            duel.challenger.userId === user.id ? duel.opponent : duel.challenger;
          appendActivityEvent(store, {
            actorUserId: user.id,
            actorUsername: user.username,
            actorDisplayName: user.display_name,
            type: 'duel_won',
            summary: `hit ${duel.target_value}${
              duel.metric === 'verified_pages' ? 'p' : 'm'
            } first to win 1v1 duel "${duel.title}"${other ? ` vs @${other.username}` : ''}`,
            trustScore: trust,
          });
        }
      }

      // Emit verified session activity event
      if (mins >= 1 || pages >= 1) {
        appendActivityEvent(store, {
          actorUserId: user.id,
          actorUsername: user.username,
          actorDisplayName: user.display_name,
          type: 'verified_session',
          summary: `verified ${Math.round(mins)}m · ${pages}p${
            body.bookTitle ? ` on ${body.bookTitle}` : ''
          }`,
          trustScore: trust,
        });
      }

      writeServerStore(store);
      return NextResponse.json({ creditedChallenges, creditedDuels });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'Challenge request failed' }, { status: 500 });
  }
}
