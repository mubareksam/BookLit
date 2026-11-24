import { Book, BookGenre, GENRE_META, ReadingSession } from '../types';

export interface GenreSpeedEstimate {
  genre: BookGenre;
  priorWpm: number;
  expectedWpm: number;
  lowWpm: number;
  highWpm: number;
  personal95thWpm: number;
  genreCeilingWpm: number;
  sampleCount: number;
  posteriorWeightPersonal: number; // 0.0 -> 1.0
}

export interface FinishPrediction {
  remainingPages: number;
  remainingWords: number;
  expectedMinutes: number;
  optimisticMinutes: number;
  conservativeMinutes: number;
  formattedExpected: string;
  formattedRange: string;
  wpmBand: GenreSpeedEstimate;
}

export function formatMinutesHuman(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return '0m';
  const rounded = Math.max(1, Math.round(minutes));
  const hrs = Math.floor(rounded / 60);
  const mins = rounded % 60;
  if (hrs === 0) return `${mins}m`;
  if (mins === 0) return `${hrs}h`;
  return `${hrs}h ${mins}m`;
}

/**
 * Computes difficulty multiplier relative to genre default difficulty.
 * Band 1 is ~12% faster, Band 5 is ~14% slower than mid-band.
 */
export function getDifficultyMultiplier(
  difficultyBand: 1 | 2 | 3 | 4 | 5,
  genreDefaultDifficulty: 1 | 2 | 3 | 4 | 5
): number {
  const delta = difficultyBand - genreDefaultDifficulty;
  return Math.max(0.72, Math.min(1.22, 1 - delta * 0.065));
}

/**
 * Rolling Bayesian normal-normal shrinkage estimator per user & genre.
 * Prior weight n0 = 4 sessions so after 3-5 verified sessions personal history blends smoothly.
 */
export function estimateUserGenreSpeed(
  genre: BookGenre,
  verifiedSessions: ReadingSession[],
  booksById: Map<string, Book>,
  difficultyBand?: 1 | 2 | 3 | 4 | 5
): GenreSpeedEstimate {
  const meta = GENRE_META[genre] ?? GENRE_META.general_nonfiction;
  const priorMean = meta.priorWpm;
  const priorSd = meta.priorSd;
  const priorWeight = 4; // virtual prior observations

  // Collect verified sessions matching this genre (full weight) or adjacent genres (0.35 weight)
  const relevantObservations: { wpmNormalized: number; weight: number }[] = [];

  // Sort newest first, take rolling window of last 25 relevant sessions
  const sorted = [...verifiedSessions]
    .filter((s) => s.verified && !s.strike_issued && s.wpm_observed > 40 && s.wpm_observed < 900)
    .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());

  for (const session of sorted) {
    const book = booksById.get(session.book_id);
    if (!book) continue;
    const primaryGenre = book.genre[0] ?? 'general_nonfiction';
    const hasExactGenre = book.genre.includes(genre);
    const hasAdjacent = book.genre.some((g) => meta.adjacent.includes(g));

    if (!hasExactGenre && !hasAdjacent) continue;

    // Normalize observed WPM back to genre baseline difficulty before pooling
    const bookMeta = GENRE_META[primaryGenre] ?? meta;
    const diffMult = getDifficultyMultiplier(book.difficulty_band, bookMeta.defaultDifficulty);
    const genreScale = meta.priorWpm / bookMeta.priorWpm;
    const normalizedWpm = (session.wpm_observed / diffMult) * (hasExactGenre ? 1 : genreScale);

    relevantObservations.push({
      wpmNormalized: normalizedWpm,
      weight: hasExactGenre ? 1.0 : 0.35,
    });

    if (relevantObservations.length >= 25) break;
  }

  const effectiveN = relevantObservations.reduce((acc, item) => acc + item.weight, 0);
  const weightedSum = relevantObservations.reduce(
    (acc, item) => acc + item.wpmNormalized * item.weight,
    0
  );
  const sampleMean = effectiveN > 0 ? weightedSum / effectiveN : priorMean;

  const posteriorMeanBase =
    (priorWeight * priorMean + effectiveN * sampleMean) / (priorWeight + effectiveN);

  // Compute empirical dispersion blended with prior SD
  let empiricalVariance = priorSd * priorSd;
  if (effectiveN >= 2) {
    const sqDiffSum = relevantObservations.reduce(
      (acc, item) => acc + item.weight * Math.pow(item.wpmNormalized - sampleMean, 2),
      0
    );
    const sampleVar = sqDiffSum / effectiveN;
    empiricalVariance =
      (priorWeight * priorSd * priorSd + effectiveN * sampleVar) / (priorWeight + effectiveN);
  }
  const blendedSd = Math.max(18, Math.sqrt(empiricalVariance));

  const targetDifficulty = difficultyBand ?? meta.defaultDifficulty;
  const difficultyFactor = getDifficultyMultiplier(targetDifficulty, meta.defaultDifficulty);

  const expectedWpm = Math.round(posteriorMeanBase * difficultyFactor);
  // 80% comfort band (~1.28 SD, narrowed slightly as sample count grows)
  const bandHalfWidth = Math.max(20, Math.round(blendedSd * 1.15 * difficultyFactor));
  const lowWpm = Math.max(65, expectedWpm - bandHalfWidth);
  const highWpm = Math.min(meta.ceilingWpm, expectedWpm + bandHalfWidth);
  const personal95thWpm = Math.round((posteriorMeanBase + 1.645 * blendedSd) * difficultyFactor);

  return {
    genre,
    priorWpm: Math.round(priorMean * difficultyFactor),
    expectedWpm,
    lowWpm,
    highWpm,
    personal95thWpm,
    genreCeilingWpm: meta.ceilingWpm,
    sampleCount: Math.round(effectiveN * 10) / 10,
    posteriorWeightPersonal: Math.round((effectiveN / (priorWeight + effectiveN)) * 100) / 100,
  };
}

export function predictBookFinish(
  book: Book,
  verifiedSessions: ReadingSession[],
  booksById: Map<string, Book>
): FinishPrediction {
  const primaryGenre = book.genre[0] ?? 'general_nonfiction';
  const wpmBand = estimateUserGenreSpeed(
    primaryGenre,
    verifiedSessions,
    booksById,
    book.difficulty_band
  );

  const remainingPages = Math.max(0, book.page_count - book.current_page);
  const wordsPerPage =
    book.page_count > 0
      ? book.word_count_estimate / book.page_count
      : GENRE_META[primaryGenre].wordsPerPageDefault;
  const remainingWords = Math.round(remainingPages * wordsPerPage);

  const expectedMinutes = remainingWords / Math.max(60, wpmBand.expectedWpm);
  const optimisticMinutes = remainingWords / Math.max(80, wpmBand.highWpm);
  const conservativeMinutes = remainingWords / Math.max(50, wpmBand.lowWpm);

  return {
    remainingPages,
    remainingWords,
    expectedMinutes: Math.round(expectedMinutes * 10) / 10,
    optimisticMinutes: Math.round(optimisticMinutes * 10) / 10,
    conservativeMinutes: Math.round(conservativeMinutes * 10) / 10,
    formattedExpected: formatMinutesHuman(expectedMinutes),
    formattedRange: `${formatMinutesHuman(optimisticMinutes)} – ${formatMinutesHuman(conservativeMinutes)}`,
    wpmBand,
  };
}

export function predictPageSpanMinutes(params: {
  pagesRead: number;
  wordsPerPage: number;
  wpmBand: GenreSpeedEstimate;
}): {
  estimatedWords: number;
  predictedMinutes: number;
  toleranceLowMinutes: number;
  toleranceHighMinutes: number;
} {
  const estimatedWords = Math.max(1, Math.round(params.pagesRead * params.wordsPerPage));
  const predictedMinutes = estimatedWords / Math.max(60, params.wpmBand.expectedWpm);
  // Generous ±35% Tier 1 tolerance window per specification
  const toleranceLowMinutes = Math.max(0.5, predictedMinutes * 0.65);
  const toleranceHighMinutes = Math.max(predictedMinutes * 1.35, predictedMinutes + 2.5);

  return {
    estimatedWords,
    predictedMinutes: Math.round(predictedMinutes * 100) / 100,
    toleranceLowMinutes: Math.round(toleranceLowMinutes * 100) / 100,
    toleranceHighMinutes: Math.round(toleranceHighMinutes * 100) / 100,
  };
}
