import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/server/auth';
import { readServerStore, ServerDataShape, writeServerStore } from '@/lib/server/store';
import { computeAchievementBadges } from '@/lib/domain/badges';
import { scoreField } from '@/lib/domain/fuzzySearch';
import { normalizeTrustScore } from '@/lib/domain/trust';
import { Book, PublicReaderProfile, ReadingSession, UserProfile } from '@/lib/types';
import { settleExpiredDuels } from '@/lib/server/duelSettlement';

function buildPublicProfile(
  store: ServerDataShape,
  targetUser: UserProfile,
  viewerUserId: string
): PublicReaderProfile | null {
  const bucket = store.usersData[targetUser.id];
  const latestProfile = bucket?.profile ?? targetUser;

  const myFollowing = store.followsByUserId[viewerUserId] ?? [];
  const isFollowing = myFollowing.includes(targetUser.id);
  const isSelf = targetUser.id === viewerUserId;
  const isTethered = isFollowing && (store.followsByUserId[targetUser.id] ?? []).includes(viewerUserId);

  if (latestProfile.profile_visibility === 'private' && !isSelf && !isFollowing) {
    return null;
  }

  const books = Object.values((bucket?.books ?? {}) as Record<string, Book>);
  const sessions = Object.values((bucket?.sessions ?? {}) as Record<string, ReadingSession>);
  const challenges = Object.values(store.challenges);
  const duels = Object.values(store.duels);

  const computed = computeAchievementBadges({
    userId: targetUser.id,
    streakCount: latestProfile.streak_count ?? 0,
    books,
    sessions,
    challenges,
    duels,
  });

  const activeBook = books.find((b) => b.status === 'reading') ?? null;
  const currentlyReading = activeBook
    ? {
        title: activeBook.title,
        author: activeBook.author,
        progressPct: Math.min(
          100,
          Math.round((activeBook.current_page / Math.max(1, activeBook.page_count)) * 100)
        ),
      }
    : null;

  let followersCount = 0;
  for (const list of Object.values(store.followsByUserId)) {
    if (list.includes(targetUser.id)) followersCount++;
  }
  const followingCount = (store.followsByUserId[targetUser.id] ?? []).length;

  // Sparks earned = sparks other readers dropped on this reader's verified activity.
  let sparkCount = 0;
  for (const event of store.activityFeed) {
    if (event.actorUserId !== targetUser.id) continue;
    sparkCount += (store.sparksByEventId[event.id] ?? []).length;
  }

  const normalizedSessions = sessions.map((s) => ({
    ...s,
    trust_score: normalizeTrustScore(s.trust_score, s.trust_scale),
    trust_scale: 1000,
  }));
  const avgHonestRate =
    normalizedSessions.filter((s) => s.verified && !s.strike_issued).length > 0
      ? Math.round(
          normalizedSessions
            .filter((s) => s.verified && !s.strike_issued)
            .reduce((acc, s) => acc + s.trust_score, 0) /
            normalizedSessions.filter((s) => s.verified && !s.strike_issued).length
        )
      : computed.avgTrustScore;

  return {
    userId: targetUser.id,
    username: latestProfile.username,
    displayName: latestProfile.display_name,
    bio: latestProfile.bio || '',
    joinedAt: latestProfile.created_at,
    rankTitle: computed.rankTitle,
    streakCount: latestProfile.streak_count ?? 0,
    verifiedMinutesTotal: computed.verifiedMinutesTotal,
    verifiedPagesTotal: computed.verifiedPagesTotal,
    verifiedSessionsCount: computed.verifiedSessionsCount,
    avgTrustScore: avgHonestRate,
    duelWins: computed.duelWins,
    duelLosses: computed.duelLosses,
    followersCount,
    followingCount,
    isFollowing,
    isTethered,
    sparkCount,
    currentlyReading,
    badges: computed.badges,
  };
}

function decorateFeed(store: ServerDataShape, viewerUserId: string) {
  return store.activityFeed.slice(0, 40).map((event) => {
    const sparks = store.sparksByEventId[event.id] ?? [];
    return {
      ...event,
      sparkCount: sparks.length,
      sparkedByMe: sparks.includes(viewerUserId),
    };
  });
}

export async function GET(req: NextRequest) {
  const viewer = getAuthenticatedUser(req);
  if (!viewer) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  const store = readServerStore();
  if (settleExpiredDuels(store)) {
    writeServerStore(store);
  }

  const usernameParam = req.nextUrl.searchParams.get('username');
  const userIdParam = req.nextUrl.searchParams.get('userId');
  const searchParam = (req.nextUrl.searchParams.get('q') ?? '').trim().toLowerCase();

  if (usernameParam || userIdParam) {
    const targetId = userIdParam
      ? userIdParam
      : store.accountIdByUsername[usernameParam!.replace(/^@/, '').toLowerCase()];
    const record = targetId ? store.accountsById[targetId] : undefined;
    if (!record) {
      return NextResponse.json({ error: 'Reader not found' }, { status: 404 });
    }
    const profile = buildPublicProfile(store, record.user, viewer.id);
    if (!profile) {
      return NextResponse.json({ error: 'This profile is private.' }, { status: 403 });
    }
    return NextResponse.json({ profile });
  }

  const allProfiles: PublicReaderProfile[] = [];
  for (const acc of Object.values(store.accountsById)) {
    const built = buildPublicProfile(store, acc.user, viewer.id);
    if (built) allProfiles.push(built);
  }

  const myProfile = allProfiles.find((p) => p.userId === viewer.id) ?? null;
  const others = allProfiles.filter((p) => p.userId !== viewer.id);

  // Reader discovery: fuzzy on @username and display name so partial or slightly
  // misspelled searches still find real people.
  const ranked = others
    .map((profile) => {
      if (!searchParam) {
        return {
          profile,
          score: profile.isFollowing ? 1.4 : 0,
        };
      }
      const handle = profile.username.replace(/^@/, '').toLowerCase();
      const score = Math.max(
        scoreField(handle, searchParam) * 1.06,
        scoreField(profile.displayName, searchParam),
        profile.rankTitle.toLowerCase().includes(searchParam) ? 0.5 : 0
      );
      return { profile, score };
    })
    .filter((entry) => (!searchParam ? true : entry.score >= 0.34))
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.profile.verifiedMinutesTotal - a.profile.verifiedMinutesTotal ||
        a.profile.username.localeCompare(b.profile.username)
    )
    .slice(0, 24)
    .map((entry) => entry.profile);

  return NextResponse.json({
    myProfile,
    readers: ranked,
    activityFeed: decorateFeed(store, viewer.id),
  });
}

export async function POST(req: NextRequest) {
  const viewer = getAuthenticatedUser(req);
  if (!viewer) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  try {
    const body = (await req.json()) as {
      action: 'toggle_tether' | 'toggle_follow' | 'toggle_spark';
      targetUserId?: string;
      eventId?: string;
    };

    const store = readServerStore();

    // ---- Sparks: Booklit's verified "like" on arena activity ----
    if (body.action === 'toggle_spark') {
      if (!body.eventId) {
        return NextResponse.json({ error: 'Missing activity event' }, { status: 400 });
      }
      const event = store.activityFeed.find((e) => e.id === body.eventId);
      if (!event) {
        return NextResponse.json({ error: 'Activity not found' }, { status: 404 });
      }

      const current = new Set(store.sparksByEventId[body.eventId] ?? []);
      let sparked: boolean;
      if (current.has(viewer.id)) {
        current.delete(viewer.id);
        sparked = false;
      } else {
        current.add(viewer.id);
        sparked = true;
      }
      if (current.size === 0) delete store.sparksByEventId[body.eventId];
      else store.sparksByEventId[body.eventId] = Array.from(current);

      writeServerStore(store);
      return NextResponse.json({ sparked, sparkCount: current.size });
    }

    // ---- Tether: mutual reader connection (follow = one-way, tether = two-way) ----
    if (body.action !== 'toggle_tether' && body.action !== 'toggle_follow') {
      return NextResponse.json({ error: 'Invalid social request' }, { status: 400 });
    }
    if (!body.targetUserId) {
      return NextResponse.json({ error: 'Missing reader' }, { status: 400 });
    }
    if (body.targetUserId === viewer.id) {
      return NextResponse.json({ error: 'You cannot tether yourself' }, { status: 400 });
    }
    if (!store.accountsById[body.targetUserId]) {
      return NextResponse.json({ error: 'Reader not found' }, { status: 404 });
    }

    const current = new Set(store.followsByUserId[viewer.id] ?? []);
    let following: boolean;
    if (current.has(body.targetUserId)) {
      current.delete(body.targetUserId);
      following = false;
    } else {
      current.add(body.targetUserId);
      following = true;
    }

    store.followsByUserId[viewer.id] = Array.from(current);
    const mutual =
      following && (store.followsByUserId[body.targetUserId] ?? []).includes(viewer.id);
    writeServerStore(store);

    return NextResponse.json({ following, tethered: mutual });
  } catch {
    return NextResponse.json({ error: 'Social update failed' }, { status: 500 });
  }
}
