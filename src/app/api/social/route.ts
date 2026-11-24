import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/server/auth';
import { readServerStore, ServerDataShape, writeServerStore } from '@/lib/server/store';
import { computeAchievementBadges } from '@/lib/domain/badges';
import { Book, PublicReaderProfile, ReadingSession, UserProfile } from '@/lib/types';
import { settleExpiredDuels } from '@/app/api/duels/route';

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
    avgTrustScore: computed.avgTrustScore,
    duelWins: computed.duelWins,
    duelLosses: computed.duelLosses,
    followersCount,
    followingCount,
    isFollowing,
    currentlyReading,
    badges: computed.badges,
  };
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
  const others = allProfiles
    .filter((p) => p.userId !== viewer.id)
    .filter((p) => {
      if (!searchParam) return true;
      return (
        p.username.toLowerCase().includes(searchParam) ||
        p.displayName.toLowerCase().includes(searchParam)
      );
    })
    .sort((a, b) => b.verifiedMinutesTotal - a.verifiedMinutesTotal)
    .slice(0, 24);

  return NextResponse.json({
    myProfile,
    readers: others,
    activityFeed: store.activityFeed.slice(0, 30),
  });
}

export async function POST(req: NextRequest) {
  const viewer = getAuthenticatedUser(req);
  if (!viewer) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  try {
    const body = (await req.json()) as {
      action: 'toggle_follow';
      targetUserId: string;
    };

    if (body.action !== 'toggle_follow' || !body.targetUserId) {
      return NextResponse.json({ error: 'Invalid social request' }, { status: 400 });
    }
    if (body.targetUserId === viewer.id) {
      return NextResponse.json({ error: 'Cannot follow yourself' }, { status: 400 });
    }

    const store = readServerStore();
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
    writeServerStore(store);

    return NextResponse.json({ following });
  } catch {
    return NextResponse.json({ error: 'Social update failed' }, { status: 500 });
  }
}
