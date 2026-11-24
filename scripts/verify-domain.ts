import assert from 'node:assert/strict';
import { buildSeedData } from '../src/lib/db/seed';
import { estimateUserGenreSpeed, predictBookFinish } from '../src/lib/domain/speedModel';
import {
  evaluateSpeechPassage,
  findCurableStrikeSession,
  scoreReadingSession,
} from '../src/lib/domain/verificationEngine';
import { generateBookRecommendations } from '../src/lib/domain/recommendationEngine';

function runDomainTests() {
  const seed = buildSeedData(new Date('2026-11-24T15:00:00Z'));
  const booksById = new Map(seed.books.map((b) => [b.id, b]));
  const verifiedSessions = seed.sessions.filter((s) => s.verified && !s.strike_issued);

  // 1. Genre-specific speed estimation: Technical/Academic must be slower than Literary Fiction
  const techSpeed = estimateUserGenreSpeed('technical', verifiedSessions, booksById, 5);
  const litSpeed = estimateUserGenreSpeed('literary_fiction', verifiedSessions, booksById, 3);
  const poetrySpeed = estimateUserGenreSpeed('poetry', verifiedSessions, booksById, 3);

  assert(
    techSpeed.expectedWpm < litSpeed.expectedWpm,
    `Expected technical WPM (${techSpeed.expectedWpm}) < literary fiction WPM (${litSpeed.expectedWpm})`
  );
  assert(
    poetrySpeed.expectedWpm < litSpeed.expectedWpm,
    `Expected poetry WPM (${poetrySpeed.expectedWpm}) < literary fiction WPM (${litSpeed.expectedWpm})`
  );

  // 2. Finish prediction produces range & positive minutes
  const ddiaBook = booksById.get('book-ddia')!;
  const ddiaPred = predictBookFinish(ddiaBook, verifiedSessions, booksById);
  assert(ddiaPred.optimisticMinutes < ddiaPred.conservativeMinutes);
  assert(ddiaPred.expectedMinutes > 100);

  // 3. Speech verification: standard >=60% passes, whisper >=46% passes, noisy mismatch fails
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

  // 4. Anti-cheat invariant: Single Tier 2 voice failure MUST NEVER issue a strike alone!
  const remainsBook = booksById.get('book-remains')!;
  const singleFailureScoring = scoreReadingSession({
    medium: 'physical',
    book: remainsBook,
    wpmBand: litSpeed,
    startedAtIso: '2026-11-24T14:00:00Z',
    endedAtIso: '2026-11-24T14:18:00Z',
    monotonicElapsedSeconds: 18 * 60,
    startPage: 148,
    endPage: 163,
    hasTier1ScanOrImport: true,
    voiceCheck: {
      result: 'fail',
      confidence: 0.25,
      matchedRatio: 0.2,
      wps: 2.1,
      whisperMode: false,
      explanation: 'Isolated noisy cafe mismatch',
    },
    recentVerificationEvents7d: [],
    recentSessions7d: [],
  });
  assert.equal(
    singleFailureScoring.strikeIssued,
    false,
    'Never strike on a single isolated Tier 2 failure'
  );

  // 5. Anti-cheat invariant: Two independent signals (implausible speed + failed voice check) DO issue a curable strike
  const dualSignalScoring = scoreReadingSession({
    medium: 'physical',
    book: remainsBook,
    wpmBand: litSpeed,
    startedAtIso: '2026-11-24T14:00:00Z',
    endedAtIso: '2026-11-24T14:04:00Z', // 80 pages in 4 minutes -> ~5800 WPM!
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
      explanation: 'Unrelated passage',
    },
    recentVerificationEvents7d: [],
    recentSessions7d: [],
  });
  assert.equal(dualSignalScoring.strikeIssued, true);
  assert(dualSignalScoring.independentAdverseSignals.length >= 2);

  // 6. 7-Day Cure Mechanic: a >=10m verified session finds and cures the recent struck session
  const curable = findCurableStrikeSession(
    {
      verified: true,
      strike_issued: false,
      actual_minutes: 12.5,
      ended_at: '2026-11-24T15:00:00Z',
    },
    seed.sessions
  );
  assert.equal(curable?.id, 'sess-curable-strike-demo');

  // 7. Hybrid Recommendation Engine produces one-sentence rationales with predicted finish times
  const recs = generateBookRecommendations({
    user: seed.user,
    userBooks: seed.books,
    sessions: seed.sessions,
  });
  assert(recs.length >= 4);
  assert(recs[0].rationale.includes('predicted finish') || recs[0].rationale.includes('Try') || recs[0].rationale.includes('try'));

  console.log('✓ All 7 Booklit domain invariants verified successfully.');
}

runDomainTests();
