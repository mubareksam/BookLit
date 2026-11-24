import assert from 'node:assert/strict';
import { Book, ReadingSession, UserProfile } from '../src/lib/types';
import { estimateUserGenreSpeed, predictBookFinish } from '../src/lib/domain/speedModel';
import {
  evaluateSpeechPassage,
  findCurableStrikeSession,
  scoreReadingSession,
} from '../src/lib/domain/verificationEngine';
import { computeSignatureDistance } from '../src/lib/domain/ocrService';
import { normalizeTrustScore, toTrustPercent } from '../src/lib/domain/trust';
import { scoreField } from '../src/lib/domain/fuzzySearch';
import { searchCatalog } from '../src/lib/domain/catalog';
import { generateBookRecommendations } from '../src/lib/domain/recommendationEngine';
import { computeAchievementBadges, computeReaderRank } from '../src/lib/domain/badges';
import {
  hashPassword,
  signSessionToken,
  verifyPassword,
  verifySessionToken,
} from '../src/lib/server/auth';

function runDomainTests() {
  const user: UserProfile = {
    id: 'usr-test-1',
    username: 'reader_one',
    email: 'reader@example.com',
    display_name: 'Reader One',
    auth_provider: 'email_password',
    timezone: 'UTC',
    created_at: '2026-11-20T10:00:00Z',
    reading_goal_type: 'minutes_day',
    reading_goal_target: 30,
    preferred_genres: ['literary_fiction', 'technical'],
    strike_count: 1,
    streak_count: 4,
    last_verified_session_at: '2026-11-24T12:00:00Z',
    settings_json: {
      comprehensionOptIn: true,
      challengeMode: false,
      retainAudioForDebug: false,
      whisperModeDefault: false,
      analyticsConsent: false,
      notificationsPromptedAfterFirstSession: true,
      notificationsEnabled: false,
      cameraExplainerSeen: true,
      micExplainerSeen: true,
      streakInsuranceAvailable: true,
      streakInsuranceLastUsedMonth: null,
      themePreference: 'system',
      reminderWindows: [],
    },
  };

  const litBook: Book = {
    id: 'book-lit',
    user_id: user.id,
    title: 'The Remains of the Day',
    author: 'Kazuo Ishiguro',
    isbn: '9780679731726',
    genre: ['literary_fiction'],
    subgenre: [],
    page_count: 258,
    current_page: 120,
    word_count_estimate: 72000,
    difficulty_band: 3,
    cover_url: null,
    description: '',
    source: 'OpenLibrary',
    status: 'reading',
    medium_default: 'physical',
    rating: 5,
    finished_at: null,
    sample_passages: [],
    created_at: '2026-11-20T10:00:00Z',
    updated_at: '2026-11-24T10:00:00Z',
  };

  const techBook: Book = {
    ...litBook,
    id: 'book-tech',
    title: 'Designing Data-Intensive Applications',
    author: 'Martin Kleppmann',
    genre: ['technical'],
    page_count: 616,
    current_page: 80,
    word_count_estimate: 210000,
    difficulty_band: 5,
  };

  const booksById = new Map<string, Book>([
    [litBook.id, litBook],
    [techBook.id, techBook],
  ]);

  const verifiedSessions: ReadingSession[] = [
    {
      id: 'sess-1',
      user_id: user.id,
      book_id: litBook.id,
      medium: 'physical',
      started_at: '2026-11-23T14:00:00Z',
      ended_at: '2026-11-23T14:20:00Z',
      start_page: 100,
      end_page: 120,
      verified: true,
      live_camera_verified: true,
      challenge_eligible: true,
      verification_tier: 'active',
      trust_score: 94,
      predicted_minutes: 21,
      actual_minutes: 20,
      wpm_observed: 265,
      wpm_expected_range_low: 215,
      wpm_expected_range_high: 305,
      flags_json: [],
      strike_issued: false,
      cure_session_id: null,
    },
  ];

  // 1. Genre speed calibration: Technical/Academic slower than Literary Fiction
  const techSpeed = estimateUserGenreSpeed('technical', verifiedSessions, booksById, 5);
  const litSpeed = estimateUserGenreSpeed('literary_fiction', verifiedSessions, booksById, 3);
  const poetrySpeed = estimateUserGenreSpeed('poetry', verifiedSessions, booksById, 3);
  assert(techSpeed.expectedWpm < litSpeed.expectedWpm);
  assert(poetrySpeed.expectedWpm < litSpeed.expectedWpm);

  // 2. Book finish prediction
  const techPred = predictBookFinish(techBook, verifiedSessions, booksById);
  assert(techPred.optimisticMinutes < techPred.conservativeMinutes);
  assert(techPred.expectedMinutes > 100);

  // 3. Speech verification: standard & whisper mode
  const excerpt =
    'Evening is often the finest hour of the day when the lamps come on along the pier and one reflects without haste.';
  const passSpeech = evaluateSpeechPassage({
    expectedText: excerpt,
    transcribedText: 'evening is often the finest hour of the day when the lamps come on',
    durationSeconds: 6.2,
    whisperMode: false,
  });
  assert.equal(passSpeech.result, 'pass');

  const whisperSpeech = evaluateSpeechPassage({
    expectedText: excerpt,
    transcribedText: 'evening finest hour lamps come along pier reflects haste',
    durationSeconds: 6.8,
    whisperMode: true,
  });
  assert.equal(whisperSpeech.result, 'pass');

  // 4. Single Tier 2 voice failure MUST NEVER issue a strike alone
  const singleFailureScoring = scoreReadingSession({
    medium: 'physical',
    book: litBook,
    wpmBand: litSpeed,
    startedAtIso: '2026-11-24T14:00:00Z',
    endedAtIso: '2026-11-24T14:18:00Z',
    monotonicElapsedSeconds: 18 * 60,
    startPage: 148,
    endPage: 163,
    hasTier1ScanOrImport: true,
    liveCameraStart: true,
    liveCameraEnd: true,
    startFrameSignature: 'a0f0a0f0a0f0a0f0',
    endFrameSignature: '0f050f050f050f05',
    voiceCheck: {
      result: 'fail',
      confidence: 0.25,
      matchedRatio: 0.2,
      wps: 2.1,
      whisperMode: false,
      rmsVoiceDetected: true,
      explanation: 'Isolated noisy mismatch',
    },
    recentVerificationEvents7d: [],
    recentSessions7d: [],
  });
  assert.equal(singleFailureScoring.strikeIssued, false);

  // 5. Dual independent signals (implausible speed + failed voice check) DO issue a curable strike
  const dualSignalScoring = scoreReadingSession({
    medium: 'physical',
    book: litBook,
    wpmBand: litSpeed,
    startedAtIso: '2026-11-24T14:00:00Z',
    endedAtIso: '2026-11-24T14:04:00Z',
    monotonicElapsedSeconds: 4 * 60,
    startPage: 148,
    endPage: 228,
    hasTier1ScanOrImport: true,
    voiceCheck: {
      result: 'fail',
      confidence: 0.22,
      matchedRatio: 0.15,
      wps: 3.1,
      whisperMode: false,
      rmsVoiceDetected: true,
      explanation: 'Unrelated passage',
    },
    recentVerificationEvents7d: [],
    recentSessions7d: [],
  });
  assert.equal(dualSignalScoring.strikeIssued, true);
  assert.equal(dualSignalScoring.challengeEligible, false);

  // 6. Anti-cheat: Duplicate start/end camera frame signature blocks Challenge eligibility
  assert.equal(computeSignatureDistance('f0f0f0f0f0f0f0f0', 'f0f0f0f0f0f0f0f0'), 0);
  const duplicateFrameScoring = scoreReadingSession({
    medium: 'physical',
    book: litBook,
    wpmBand: litSpeed,
    startedAtIso: '2026-11-24T14:00:00Z',
    endedAtIso: '2026-11-24T14:15:00Z',
    monotonicElapsedSeconds: 15 * 60,
    startPage: 120,
    endPage: 132,
    hasTier1ScanOrImport: true,
    liveCameraStart: true,
    liveCameraEnd: true,
    startFrameSignature: 'f0f0f0f0f0f0f0f0',
    endFrameSignature: 'f0f0f0f0f0f0f0f0',
    strictChallengeMode: true,
    recentVerificationEvents7d: [],
    recentSessions7d: [],
  });
  assert.equal(duplicateFrameScoring.challengeEligible, false);
  assert(duplicateFrameScoring.flags.some((f) => f.code === 'duplicate_scan_frame'));

  // 7. 7-Day Strike Cure
  const struckSession: ReadingSession = {
    ...verifiedSessions[0],
    id: 'sess-struck-1',
    verified: false,
    strike_issued: true,
    ended_at: '2026-11-22T15:00:00Z',
  };
  const curable = findCurableStrikeSession(
    {
      verified: true,
      strike_issued: false,
      actual_minutes: 12.5,
      ended_at: '2026-11-24T15:00:00Z',
    },
    [struckSession]
  );
  assert.equal(curable?.id, 'sess-struck-1');

  // 8. Password scrypt hashing & HMAC session token verification
  const { salt, hash } = hashPassword('StrongReaderPass!2026');
  assert.equal(verifyPassword('StrongReaderPass!2026', salt, hash), true);
  assert.equal(verifyPassword('WrongPassword', salt, hash), false);

  const token = signSessionToken(user.id);
  assert.equal(verifySessionToken(token), user.id);
  assert.equal(verifySessionToken(`${token}tampered`), null);

  // 9. Explainable recommendations
  const recs = generateBookRecommendations({
    user,
    userBooks: [litBook, techBook],
    sessions: verifiedSessions,
  });
  assert(recs.length >= 4);

  // 10. Social Rank, Achievement Badges & 1v1 Duel Victor calculation
  assert.equal(computeReaderRank(25, 95), 'Initiate');
  assert.equal(computeReaderRank(320, 92), 'Scholar');
  assert.equal(computeReaderRank(2500, 94), 'Grandmaster');

  const badgeResult = computeAchievementBadges({
    userId: user.id,
    streakCount: 8,
    books: [litBook, techBook],
    sessions: verifiedSessions,
    challenges: [],
    duels: [
      {
        id: 'duel-test-1',
        invite_code: 'DL99AA',
        title: '1v1 Showdown',
        metric: 'verified_minutes',
        target_value: 60,
        duration_hours: 72,
        status: 'completed',
        challenger: {
          userId: user.id,
          username: user.username,
          displayName: user.display_name,
          verifiedMinutes: 65,
          verifiedPages: 50,
          verifiedSessionsCount: 3,
          avgTrustScore: 95,
          lastVerifiedAt: '2026-11-24T12:00:00Z',
        },
        opponent: {
          userId: 'usr-test-2',
          username: 'rival_reader',
          displayName: 'Rival Reader',
          verifiedMinutes: 40,
          verifiedPages: 30,
          verifiedSessionsCount: 2,
          avgTrustScore: 91,
          lastVerifiedAt: '2026-11-24T11:00:00Z',
        },
        invited_username: 'rival_reader',
        winner_user_id: user.id,
        created_at: '2026-11-23T10:00:00Z',
        starts_at: '2026-11-23T10:05:00Z',
        ends_at: '2026-11-26T10:05:00Z',
      },
    ],
  });
  assert.equal(badgeResult.duelWins, 1);
  assert.equal(badgeResult.badges.find((b) => b.id === 'first_seal')?.unlocked, true);
  assert.equal(badgeResult.badges.find((b) => b.id === 'seven_day_flame')?.unlocked, true);
  assert.equal(badgeResult.badges.find((b) => b.id === 'duel_victor')?.unlocked, true);

  // 11. Honest Rate lives on a 1000-point scale (100 was too coarse)
  const verifiedScoring = scoreReadingSession({
    medium: 'physical',
    book: litBook,
    wpmBand: litSpeed,
    startedAtIso: '2026-11-24T14:00:00Z',
    endedAtIso: '2026-11-24T14:20:00Z',
    monotonicElapsedSeconds: 20 * 60,
    startPage: 100,
    endPage: 120,
    hasTier1ScanOrImport: true,
    liveCameraStart: true,
    liveCameraEnd: true,
    startFrameSignature: 'a0f0a0f0a0f0a0f0',
    endFrameSignature: '0f050f050f050f05',
    strictChallengeMode: true,
    voiceCheck: {
      result: 'pass',
      confidence: 0.9,
      matchedRatio: 0.85,
      wps: 2.4,
      whisperMode: false,
      rmsVoiceDetected: true,
      explanation: 'Natural cadence',
    },
    recentVerificationEvents7d: [],
    recentSessions7d: [],
  });
  assert.equal(verifiedScoring.trustScale, 1000);
  assert(verifiedScoring.trustScore > 100);
  assert(verifiedScoring.trustScore <= 1000);
  assert.equal(normalizeTrustScore(94), 940);
  assert.equal(normalizeTrustScore(940, 1000), 940);
  assert.equal(toTrustPercent(940), 94);

  // 12. E-Reader seal: no page scan possible, so paced checkpoints + presence +
  //     voice + comprehension must still verify and stay challenge eligible.
  const ereaderScoring = scoreReadingSession({
    medium: 'ebook',
    book: litBook,
    wpmBand: litSpeed,
    startedAtIso: '2026-11-24T15:00:00Z',
    endedAtIso: '2026-11-24T15:22:00Z',
    monotonicElapsedSeconds: 22 * 60,
    startPage: 200,
    endPage: 222,
    hasTier1ScanOrImport: false,
    liveCameraStart: false,
    liveCameraEnd: false,
    ereaderCheckpointVerified: true,
    ereaderStartPercent: 42,
    ereaderEndPercent: 51,
    ereaderAttentionChecks: 2,
    ereaderAttentionChecksPassed: 2,
    strictChallengeMode: true,
    voiceCheck: {
      result: 'pass',
      confidence: 0.88,
      matchedRatio: 0.8,
      wps: 2.5,
      whisperMode: false,
      rmsVoiceDetected: true,
      explanation: 'Live voice confirmed',
    },
    comprehensionCheck: { result: 'pass', confidence: 0.95, explanation: 'Correct passage answer' },
    recentVerificationEvents7d: [],
    recentSessions7d: [],
  });
  assert.equal(ereaderScoring.verified, true);
  assert.equal(ereaderScoring.challengeEligible, true);
  assert(ereaderScoring.flags.every((f) => f.severity !== 'escalated'));

  // E-reader sessions with no position progress can never verify
  const ereaderStalled = scoreReadingSession({
    medium: 'ebook',
    book: litBook,
    wpmBand: litSpeed,
    startedAtIso: '2026-11-24T15:00:00Z',
    endedAtIso: '2026-11-24T15:20:00Z',
    monotonicElapsedSeconds: 20 * 60,
    startPage: 200,
    endPage: 200,
    hasTier1ScanOrImport: false,
    ereaderCheckpointVerified: true,
    ereaderStartPercent: 40,
    ereaderEndPercent: 40,
    recentVerificationEvents7d: [],
    recentSessions7d: [],
  });
  assert.equal(ereaderStalled.verified, false);
  assert(ereaderStalled.flags.some((f) => f.code === 'ereader_no_progress'));

  // E-reader readers who only track "% read" (no page numbers) still verify
  const ereaderPercentOnly = scoreReadingSession({
    medium: 'ebook',
    book: litBook,
    wpmBand: litSpeed,
    startedAtIso: '2026-11-24T16:00:00Z',
    endedAtIso: '2026-11-24T16:25:00Z',
    monotonicElapsedSeconds: 25 * 60,
    startPage: 45,
    endPage: 45,
    hasTier1ScanOrImport: false,
    ereaderCheckpointVerified: true,
    ereaderStartPercent: 20,
    ereaderEndPercent: 38,
    ereaderAttentionChecks: 2,
    ereaderAttentionChecksPassed: 2,
    recentVerificationEvents7d: [],
    recentSessions7d: [],
  });
  assert.equal(ereaderPercentOnly.verified, true);
  assert.equal(ereaderPercentOnly.strikeIssued, false);

  // 13. Add Book search is fuzzy (typos, partials, authors) — never exact-only
  assert(scoreField('Project Hail Mary', 'project hail') > 0.9);
  assert(scoreField('Thinking, Fast and Slow', 'thinkng fast') >= 0.62);
  assert(scoreField('Daniel Kahneman', 'kahnman') >= 0.62);
  const fuzzySearch = searchCatalog('project hail mary');
  assert(fuzzySearch.length > 0);
  assert.equal(fuzzySearch[0].title, 'Project Hail Mary');
  const typoSearch = searchCatalog('meditatons');
  assert(typoSearch.some((b) => b.title === 'Meditations'));
  assert(searchCatalog('kahneman').some((b) => b.author.includes('Kahneman')));
  assert(searchCatalog('zzzzzz').length === 0);

  console.log('✓ All 13 Booklit v3 social, 1v1 duel, e-reader & anti-cheat invariants verified.');
}

runDomainTests();
