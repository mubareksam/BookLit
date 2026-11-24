import {
  AchievementBadge,
  Book,
  ReadingChallenge,
  ReadingDuel,
  ReadingSession,
} from '../types';
import { normalizeTrustScore, TRUST_SCALE_MAX } from './trust';

export function computeReaderRank(verifiedMinutes: number, avgTrustScore: number): string {
  const trust = normalizeTrustScore(avgTrustScore);
  if (verifiedMinutes >= 2400 && trust >= 900) return 'Grandmaster';
  if (verifiedMinutes >= 900 && trust >= 850) return 'Luminary';
  if (verifiedMinutes >= 300) return 'Scholar';
  if (verifiedMinutes >= 60) return 'Scribe';
  return 'Initiate';
}

export function computeAchievementBadges(params: {
  userId: string;
  streakCount: number;
  books: Book[];
  sessions: ReadingSession[];
  challenges: ReadingChallenge[];
  duels: ReadingDuel[];
}): {
  badges: AchievementBadge[];
  rankTitle: string;
  verifiedMinutesTotal: number;
  verifiedPagesTotal: number;
  verifiedSessionsCount: number;
  avgTrustScore: number;
  duelWins: number;
  duelLosses: number;
} {
  const { userId, streakCount, books, sessions, challenges, duels } = params;

  const verifiedSessions = sessions.filter((s) => s.verified && !s.strike_issued);
  const liveCamSessions = verifiedSessions.filter((s) => s.live_camera_verified);
  const ereaderSessions = verifiedSessions.filter((s) => s.medium === 'ebook');

  const verifiedMinutesTotal = Math.round(
    verifiedSessions.reduce((acc, s) => acc + s.actual_minutes, 0)
  );
  const verifiedPagesTotal = verifiedSessions.reduce(
    (acc, s) => acc + Math.max(0, s.end_page - s.start_page),
    0
  );
  const avgTrustScore =
    verifiedSessions.length > 0
      ? Math.round(
          verifiedSessions.reduce((acc, s) => acc + normalizeTrustScore(s.trust_score, s.trust_scale), 0) /
            verifiedSessions.length
        )
      : TRUST_SCALE_MAX;

  // Distinct genres across verified sessions
  const booksById = new Map(books.map((b) => [b.id, b]));
  const distinctGenres = new Set<string>();
  for (const s of verifiedSessions) {
    const bk = booksById.get(s.book_id);
    bk?.genre.forEach((g) => distinctGenres.add(g));
  }

  // Challenge participation with > 0 verified score
  const challengeScoredCount = challenges.filter((c) => {
    const p = c.participants.find((entry) => entry.userId === userId);
    return Boolean(p && (p.verifiedMinutes > 0 || p.verifiedPages > 0));
  }).length;

  // Duel record
  let duelWins = 0;
  let duelLosses = 0;
  let duelsParticipated = 0;
  for (const d of duels) {
    const inDuel =
      d.challenger.userId === userId || (d.opponent && d.opponent.userId === userId);
    if (!inDuel) continue;
    if (d.status === 'active' || d.status === 'completed') duelsParticipated++;
    if (d.status === 'completed' && d.winner_user_id) {
      if (d.winner_user_id === userId) duelWins++;
      else duelLosses++;
    }
  }

  const rankTitle = computeReaderRank(verifiedMinutesTotal, avgTrustScore);

  const badges: AchievementBadge[] = [
    {
      id: 'first_seal',
      label: 'First Live Seal',
      description: 'Completed a live-camera verified reading session.',
      tier: 'bronze',
      unlocked: liveCamSessions.length >= 1,
      progressLabel: `${Math.min(1, liveCamSessions.length)}/1 scan`,
    },
    {
      id: 'seven_day_flame',
      label: '7-Day Flame',
      description: 'Maintained a 7-day verified reading streak.',
      tier: 'silver',
      unlocked: streakCount >= 7,
      progressLabel: `${Math.min(7, streakCount)}/7 days`,
    },
    {
      id: 'deep_reader',
      label: 'Deep Reader',
      description: 'Logged 10+ hours (600 mins) of verified reading.',
      tier: 'gold',
      unlocked: verifiedMinutesTotal >= 600,
      progressLabel: `${Math.min(600, verifiedMinutesTotal)}/600m`,
    },
    {
      id: 'page_turner',
      label: 'Page Turner',
      description: 'Turned 500+ verified pages.',
      tier: 'silver',
      unlocked: verifiedPagesTotal >= 500,
      progressLabel: `${Math.min(500, verifiedPagesTotal)}/500p`,
    },
    {
      id: 'ereader_seal',
      label: 'Screen Reader',
      description: '3+ verified e-reader checkpoint sessions (no page scan needed).',
      tier: 'bronze',
      unlocked: ereaderSessions.length >= 3,
      progressLabel: `${Math.min(3, ereaderSessions.length)}/3 sessions`,
    },
    {
      id: 'high_trust',
      label: 'Trusted Seal',
      description: '920+ average Honest Rate across 5+ verified sessions.',
      tier: 'emerald',
      unlocked: verifiedSessions.length >= 5 && avgTrustScore >= 920,
      progressLabel:
        verifiedSessions.length >= 5
          ? `${avgTrustScore}/1000 honest`
          : `${verifiedSessions.length}/5 sessions`,
    },
    {
      id: 'challenger',
      label: 'Arena Contender',
      description: 'Scored verified progress on a Challenge leaderboard.',
      tier: 'bronze',
      unlocked: challengeScoredCount >= 1,
      progressLabel: `${Math.min(1, challengeScoredCount)}/1 board`,
    },
    {
      id: 'duel_victor',
      label: 'Duel Victor',
      description: 'Won a 1v1 Head-to-Head Verified Reading Duel.',
      tier: 'emerald',
      unlocked: duelWins >= 1,
      progressLabel:
        duelWins >= 1
          ? `${duelWins}W–${duelLosses}L`
          : duelsParticipated > 0
          ? 'In duel'
          : '0/1 win',
    },
    {
      id: 'polymath',
      label: 'Polymath',
      description: 'Completed verified reading across 3+ distinct genres.',
      tier: 'gold',
      unlocked: distinctGenres.size >= 3,
      progressLabel: `${Math.min(3, distinctGenres.size)}/3 genres`,
    },
  ];

  return {
    badges,
    rankTitle,
    verifiedMinutesTotal,
    verifiedPagesTotal,
    verifiedSessionsCount: verifiedSessions.length,
    avgTrustScore,
    duelWins,
    duelLosses,
  };
}
