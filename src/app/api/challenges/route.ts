import { NextRequest, NextResponse } from 'next/server';
import { addDays } from 'date-fns';
import { getAuthenticatedUser } from '@/lib/server/auth';
import { readServerStore, writeServerStore } from '@/lib/server/store';
import { ReadingChallenge } from '@/lib/types';

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

  // Sort participants on leaderboard by challenge metric descending
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
      inviteCode?: string;
      title?: string;
      description?: string;
      metric?: 'verified_minutes' | 'verified_pages';
      targetValue?: number;
      durationDays?: number;
      visibility?: 'public' | 'private';
      strictVerification?: boolean;
      // For record_verified_session:
      verifiedMinutes?: number;
      verifiedPages?: number;
      trustScore?: number;
      liveCameraVerified?: boolean;
      challengeEligible?: boolean;
    };

    const store = readServerStore();

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
        writeServerStore(store);
      }

      return NextResponse.json({ challenge: target });
    }

    if (body.action === 'record_verified_session') {
      // Credit all active challenges this user has joined ONLY if session passed strict challenge anti-cheat
      if (!body.challengeEligible || !body.liveCameraVerified) {
        return NextResponse.json({
          creditedChallenges: 0,
          reason: 'Live start/end camera scan + anti-cheat seal required for challenge points.',
        });
      }

      const mins = Math.max(0, Math.min(240, Number(body.verifiedMinutes) || 0));
      const pages = Math.max(0, Math.min(400, Number(body.verifiedPages) || 0));
      const trust = Math.max(50, Math.min(100, Number(body.trustScore) || 85));
      const nowMs = Date.now();
      let credited = 0;

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
        entry.lastVerifiedAt = new Date().toISOString();
        credited++;
      }

      if (credited > 0) writeServerStore(store);
      return NextResponse.json({ creditedChallenges: credited });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'Challenge request failed' }, { status: 500 });
  }
}
