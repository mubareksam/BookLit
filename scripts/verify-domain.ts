import assert from 'node:assert/strict';
import { Book, ReadingSession, UserProfile } from '../src/lib/types';
import { estimateUserGenreSpeed, predictBookFinish } from '../src/lib/domain/speedModel';
import {
  evaluateSpeechPassage,
  findCurableStrikeSession,
  scoreReadingSession,
} from '../src/lib/domain/verificationEngine';
import { computeSignatureDistance } from '../src/lib/domain/ocrService';
import { generateBookRecommendations } from '../src/lib/domain/recommendationEngine';
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

  console.log('✓ All 9 Booklit v2 production & anti-cheat invariants verified.');
}

runDomainTests();
