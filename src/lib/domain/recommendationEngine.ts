import { Book, BookGenre, GENRE_META, ReadingSession, UserProfile } from '../types';
import { CATALOG_BOOKS, CatalogBookSeed } from './catalog';
import { estimateUserGenreSpeed, formatMinutesHuman } from './speedModel';

export interface BookRecommendation {
  seed: CatalogBookSeed;
  score: number; // 0..100 match
  predictedMinutes: number;
  formattedFinish: string;
  sessionsToFinishEstimate: number;
  wpmUsed: number;
  rationale: string;
  matchTags: string[];
}

export function generateBookRecommendations(params: {
  user: UserProfile;
  userBooks: Book[];
  sessions: ReadingSession[];
}): BookRecommendation[] {
  const { user, userBooks, sessions } = params;
  const booksById = new Map(userBooks.map((b) => [b.id, b]));
  const existingTitles = new Set(userBooks.map((b) => b.title.trim().toLowerCase()));
  const existingIsbns = new Set(
    userBooks.map((b) => b.isbn?.replace(/[^0-9x]/gi, '')).filter(Boolean)
  );

  const verifiedSessions = sessions.filter((s) => s.verified && !s.strike_issued);
  const avgSessionMinutes =
    verifiedSessions.length > 0
      ? verifiedSessions.reduce((acc, s) => acc + s.actual_minutes, 0) / verifiedSessions.length
      : 25;

  // Compute genre completion counts and highest-rated anchor books
  const genreStats = new Map<
    BookGenre,
    { finishedCount: number; totalCount: number; bestBook: Book | null; avgRating: number }
  >();

  for (const b of userBooks) {
    for (const g of b.genre) {
      const cur = genreStats.get(g) ?? {
        finishedCount: 0,
        totalCount: 0,
        bestBook: null,
        avgRating: 0,
      };
      cur.totalCount += 1;
      if (b.status === 'finished') cur.finishedCount += 1;
      if (b.rating && (!cur.bestBook || (cur.bestBook.rating ?? 0) < b.rating)) {
        cur.bestBook = b;
      }
      if (b.rating) {
        cur.avgRating = cur.avgRating > 0 ? (cur.avgRating + b.rating) / 2 : b.rating;
      }
      genreStats.set(g, cur);
    }
  }

  // User difficulty comfort zone
  const ratedOrFinished = userBooks.filter((b) => b.status === 'finished' || (b.rating ?? 0) >= 4);
  const avgDifficultyComfort =
    ratedOrFinished.length > 0
      ? ratedOrFinished.reduce((acc, b) => acc + b.difficulty_band, 0) / ratedOrFinished.length
      : 3.0;

  const candidates = CATALOG_BOOKS.filter(
    (seed) =>
      !existingTitles.has(seed.title.trim().toLowerCase()) &&
      !existingIsbns.has(seed.isbn.replace(/[^0-9x]/gi, ''))
  );

  const scored: BookRecommendation[] = candidates.map((seed) => {
    const primaryGenre = seed.genre[0];
    const meta = GENRE_META[primaryGenre];
    const speedEst = estimateUserGenreSpeed(
      primaryGenre,
      verifiedSessions,
      booksById,
      seed.difficulty_band
    );

    const predictedMinutes = Math.round(seed.word_count_estimate / Math.max(60, speedEst.expectedWpm));
    const formattedFinish = formatMinutesHuman(predictedMinutes);
    const sessionsToFinishEstimate = Math.max(
      1,
      Math.round(predictedMinutes / Math.max(12, avgSessionMinutes))
    );

    let score = 56;
    const matchTags: string[] = [];

    // 1. Explicit preferred genre match
    const inPreferred = seed.genre.some((g) => user.preferred_genres.includes(g));
    if (inPreferred) {
      score += 16;
      matchTags.push('Preferred Genre');
    }

    // 2. Genre completion & rating affinity (exact or adjacent)
    const directStat = genreStats.get(primaryGenre);
    let anchorBook: Book | null = directStat?.bestBook ?? null;
    let anchorGenreLabel = meta.label.toLowerCase();

    if (directStat && directStat.totalCount > 0) {
      const completionRate = directStat.finishedCount / directStat.totalCount;
      score += Math.round(completionRate * 12) + Math.round((directStat.avgRating || 3.8) * 2.5);
      if (completionRate >= 0.5) matchTags.push('High Completion Affinity');
    } else {
      // Check adjacent genres
      for (const adj of meta.adjacent) {
        const adjStat = genreStats.get(adj);
        if (adjStat && (adjStat.finishedCount > 0 || adjStat.bestBook)) {
          score += 10;
          if (!anchorBook && adjStat.bestBook) {
            anchorBook = adjStat.bestBook;
            anchorGenreLabel = GENRE_META[adj].label.toLowerCase();
          }
          matchTags.push(`Adjacent to ${GENRE_META[adj].label}`);
          break;
        }
      }
    }

    // 3. Difficulty tolerance alignment
    const diffDelta = Math.abs(seed.difficulty_band - avgDifficultyComfort);
    if (diffDelta <= 1.0) {
      score += 9;
      matchTags.push(`Band ${seed.difficulty_band}/5 Comfort Match`);
    } else if (diffDelta > 2.0) {
      score -= 6;
    }

    // 4. Session-length finishability sweet spot (~4 to 18 average sessions)
    if (sessionsToFinishEstimate >= 3 && sessionsToFinishEstimate <= 16) {
      score += 6;
      matchTags.push(`~${sessionsToFinishEstimate} sessions at your pace`);
    }

    score = Math.max(45, Math.min(99, score));

    // Construct crisp one-sentence rationale per specification
    let rationale: string;
    if (anchorBook && anchorBook.rating) {
      rationale = `Because you read ${anchorGenreLabel} at ~${speedEst.expectedWpm} wpm and rated ${anchorBook.title} ${anchorBook.rating} stars, try ${seed.title}—predicted finish ${formattedFinish}.`;
    } else if (inPreferred) {
      rationale = `Because ${meta.label.toLowerCase()} is in your goal focus (~${speedEst.expectedWpm} wpm comfort band, difficulty ${seed.difficulty_band}/5), try ${seed.title}—predicted finish ${formattedFinish} (~${sessionsToFinishEstimate} sessions).`;
    } else {
      rationale = `Adjacent to your recent verified reading and paced for ~${Math.round(
        avgSessionMinutes
      )}-minute sittings at ~${speedEst.expectedWpm} wpm, ${seed.title} has a predicted finish of ${formattedFinish}.`;
    }

    return {
      seed,
      score,
      predictedMinutes,
      formattedFinish,
      sessionsToFinishEstimate,
      wpmUsed: speedEst.expectedWpm,
      rationale,
      matchTags: matchTags.slice(0, 3),
    };
  });

  return scored.sort((a, b) => b.score - a.score);
}
