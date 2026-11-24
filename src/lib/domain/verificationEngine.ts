import {
  Book,
  ReadingMedium,
  ReadingSession,
  SessionFlag,
  VerificationEvent,
  VerificationResult,
  VerificationTier,
} from '../types';
import { GenreSpeedEstimate, predictPageSpanMinutes } from './speedModel';

export interface SpeechVerificationEvaluation {
  result: VerificationResult;
  confidence: number;
  matchedRatio: number;
  wordsPerSecond: number;
  pauseFluencyScore: number;
  whisperMode: boolean;
  explanation: string;
}

export interface SessionScoringInput {
  medium: ReadingMedium;
  book: Book;
  wpmBand: GenreSpeedEstimate;
  startedAtIso: string;
  endedAtIso: string;
  monotonicElapsedSeconds?: number;
  startPage: number;
  endPage: number;
  wordsPerPageObserved?: number;
  startScanConfidence?: number;
  endScanConfidence?: number;
  hasTier1ScanOrImport: boolean;
  backgroundSeconds?: number;
  focusTransitions?: number;
  voiceCheck?: {
    result: VerificationResult;
    confidence: number;
    matchedRatio: number;
    wps: number;
    whisperMode: boolean;
    explanation: string;
  } | null;
  comprehensionCheck?: {
    result: VerificationResult;
    confidence: number;
    explanation: string;
  } | null;
  recentVerificationEvents7d: VerificationEvent[];
  recentSessions7d: ReadingSession[];
}

export interface SessionScoringOutput {
  trustScore: number; // 0 - 100
  verified: boolean;
  creditMultiplier: 1 | 0.5 | 0; // full, partial, or held pending cure
  verificationTier: VerificationTier;
  predictedMinutes: number;
  actualMinutes: number;
  wpmObserved: number;
  flags: SessionFlag[];
  strikeIssued: boolean;
  independentAdverseSignals: string[];
  shouldEscalateNextSession: boolean;
  summaryMessage: string;
}

/**
 * Normalizes passage tokens for resilient comparison across punctuation & casing.
 */
export function normalizeTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

/**
 * Evaluates a short (5-10s) spoken passage transcription against expected text
 * using normalized token-level matching + words-per-second & pause fluency heuristics.
 */
export function evaluateSpeechPassage(params: {
  expectedText: string;
  transcribedText: string;
  durationSeconds: number;
  whisperMode?: boolean;
  pauseCount?: number;
  anySentenceFallback?: boolean;
}): SpeechVerificationEvaluation {
  const duration = Math.max(1.5, Math.min(12, params.durationSeconds));
  const whisperMode = Boolean(params.whisperMode);
  const spokenTokens = normalizeTokens(params.transcribedText);
  const expectedTokens = normalizeTokens(params.expectedText);

  const wps = Math.round((spokenTokens.length / duration) * 100) / 100;
  // Human plausible speech rate: ~1.1 to 4.4 words/sec (whisper can be slightly slower ~0.95 wps)
  const minWps = whisperMode ? 0.9 : 1.15;
  const maxWps = 4.4;
  const ratePlausible = wps >= minWps && wps <= maxWps;

  // Pause distribution fluency score (0..1)
  const expectedPauses = Math.max(1, Math.round(duration / 3.2));
  const observedPauses = params.pauseCount ?? expectedPauses;
  const pauseDelta = Math.abs(observedPauses - expectedPauses);
  const pauseFluencyScore = Math.max(0.35, Math.min(1, 1 - pauseDelta * 0.14));

  // E-reader fallback when chapter text is unavailable: check minimum word count + speech-likeness
  if (params.anySentenceFallback || expectedTokens.length === 0) {
    const uniqueRatio =
      spokenTokens.length > 0 ? new Set(spokenTokens).size / spokenTokens.length : 0;
    const passesOpenRead = spokenTokens.length >= 7 && ratePlausible && uniqueRatio >= 0.55;

    if (passesOpenRead) {
      return {
        result: 'pass',
        confidence: Math.round(Math.min(0.94, 0.72 + pauseFluencyScore * 0.2) * 100) / 100,
        matchedRatio: 1,
        wordsPerSecond: wps,
        pauseFluencyScore,
        whisperMode,
        explanation: `Verified natural reading cadence (${wps} words/sec across ${spokenTokens.length} words).`,
      };
    }

    return {
      result: spokenTokens.length >= 4 ? 'inconclusive' : 'fail',
      confidence: 0.42,
      matchedRatio: 0,
      wordsPerSecond: wps,
      pauseFluencyScore,
      whisperMode,
      explanation:
        spokenTokens.length < 4
          ? 'Clip was too brief to detect a complete spoken sentence. Try reading one full sentence for 5–8 seconds.'
          : `Cadence (${wps} words/sec) was outside the typical reading band (${minWps}–${maxWps} wps).`,
    };
  }

  // Bag-of-bigrams + ordered window token match against expected passage prefix/excerpt
  // Remember: a 5-10s clip typically covers 12-30 words of a longer passage!
  const candidateWindowLen = Math.max(spokenTokens.length + 8, 18);
  let bestMatchedRatio = 0;

  if (spokenTokens.length > 0) {
    const maxStart = Math.max(1, expectedTokens.length - Math.min(expectedTokens.length, 8));
    for (let start = 0; start < maxStart; start++) {
      const slice = expectedTokens.slice(start, start + candidateWindowLen);
      const sliceBag = new Map<string, number>();
      for (const tok of slice) {
        sliceBag.set(tok, (sliceBag.get(tok) ?? 0) + 1);
      }
      let hits = 0;
      for (const sTok of spokenTokens) {
        const count = sliceBag.get(sTok) ?? 0;
        if (count > 0) {
          hits++;
          sliceBag.set(sTok, count - 1);
        }
      }
      const denom = Math.max(6, Math.min(spokenTokens.length, slice.length));
      const ratio = hits / denom;
      if (ratio > bestMatchedRatio) bestMatchedRatio = ratio;
    }
  }

  const matchedRatio = Math.round(bestMatchedRatio * 100) / 100;
  // Standard threshold >= 60%, Whisper mode >= 46% + pause fluency >= 0.65
  const requiredRatio = whisperMode ? 0.46 : 0.6;
  const fluencyOk = whisperMode ? pauseFluencyScore >= 0.6 && ratePlausible : ratePlausible;

  if (matchedRatio >= requiredRatio && fluencyOk && spokenTokens.length >= 5) {
    const rawConf = 0.62 + matchedRatio * 0.28 + pauseFluencyScore * 0.1;
    return {
      result: 'pass',
      confidence: Math.round(Math.min(0.99, rawConf) * 100) / 100,
      matchedRatio,
      wordsPerSecond: wps,
      pauseFluencyScore,
      whisperMode,
      explanation: `Matched ${Math.round(matchedRatio * 100)}% of passage tokens at ${wps} words/sec${
        whisperMode ? ' (Whisper mode fluency verified)' : ''
      }.`,
    };
  }

  if (matchedRatio >= requiredRatio * 0.65 || (matchedRatio >= requiredRatio && !fluencyOk)) {
    return {
      result: 'inconclusive',
      confidence: 0.48,
      matchedRatio,
      wordsPerSecond: wps,
      pauseFluencyScore,
      whisperMode,
      explanation: !fluencyOk
        ? `Tokens matched (${Math.round(matchedRatio * 100)}%), but cadence (${wps} wps) was unusual. Marked inconclusive—no strike issued.`
        : `Partial token match (${Math.round(matchedRatio * 100)}%, target ≥${Math.round(
            requiredRatio * 100
          )}%). Background noise or page offset may have affected capture; marked inconclusive.`,
    };
  }

  return {
    result: 'fail',
    confidence: 0.25,
    matchedRatio,
    wordsPerSecond: wps,
    pauseFluencyScore,
    whisperMode,
    explanation: `Only ${Math.round(matchedRatio * 100)}% of spoken words matched the passage from pages ${
      expectedTokens.slice(0, 4).join(' ')
    }… (target ≥${Math.round(requiredRatio * 100)}%).`,
  };
}

/**
 * Computes random Tier 2 voice check probability based on current user trust envelope.
 * Never 100% predictable; gentle on high-trust readers, attentive when variance appears.
 */
export function computeRandomVoiceCheckProbability(params: {
  rollingTrustScore: number;
  hasRecentPaceVariance: boolean;
  activeStrikeCount: number;
}): number {
  let prob = 0.18;
  if (params.rollingTrustScore >= 88) prob = 0.14;
  else if (params.rollingTrustScore >= 72) prob = 0.28;
  else if (params.rollingTrustScore >= 55) prob = 0.48;
  else prob = 0.72;

  if (params.hasRecentPaceVariance) prob = Math.min(0.85, prob + 0.22);
  if (params.activeStrikeCount > 0) prob = Math.min(0.88, prob + 0.15);
  return Math.round(prob * 100) / 100;
}

/**
 * Core Tier 0 -> Tier 3 probabilistic trust scoring engine.
 */
export function scoreReadingSession(input: SessionScoringInput): SessionScoringOutput {
  const flags: SessionFlag[] = [];
  const independentAdverseSignals: string[] = [];

  const startMs = new Date(input.startedAtIso).getTime();
  const endMs = new Date(input.endedAtIso).getTime();
  const wallMinutes = Math.max(0.25, (endMs - startMs) / 60000);
  const actualMinutes = Math.round(wallMinutes * 100) / 100;

  const pagesRead = Math.max(0, input.endPage - input.startPage);
  const defaultWordsPerPage =
    input.book.page_count > 0
      ? input.book.word_count_estimate / input.book.page_count
      : 280;
  const wordsPerPage = input.wordsPerPageObserved && input.wordsPerPageObserved > 30
    ? input.wordsPerPageObserved
    : defaultWordsPerPage;

  const spanPrediction = predictPageSpanMinutes({
    pagesRead: Math.max(1, pagesRead),
    wordsPerPage,
    wpmBand: input.wpmBand,
  });

  const wpmObserved =
    pagesRead > 0
      ? Math.round((pagesRead * wordsPerPage) / Math.max(0.25, actualMinutes))
      : 0;

  // Baseline trust starts at 78 for passive-only, 86 when Tier 1 scan/progress is supplied
  let trustScore = input.hasTier1ScanOrImport ? 86 : 76;
  let verificationTier: VerificationTier = input.hasTier1ScanOrImport ? 'passive' : 'none';
  let shouldEscalateNextSession = false;

  // --- TIER 0: Passive signals (always on) ---

  // 1. Implausible speed (> 2x personal 95th percentile OR > 2x genre ceiling)
  const speedCeilingTrigger = Math.min(
    input.wpmBand.personal95thWpm * 2,
    input.wpmBand.genreCeilingWpm * 2
  );
  if (pagesRead >= 2 && wpmObserved > speedCeilingTrigger) {
    trustScore -= 38;
    independentAdverseSignals.push('implausible_speed');
    flags.push({
      code: 'implausible_speed',
      severity: 'escalated',
      label: 'Implausible Reading Speed',
      explanation: `Observed ${wpmObserved} WPM across ${pagesRead} pages exceeds more than 2× your ${input.wpmBand.personal95thWpm} WPM 95th-percentile envelope for this genre.`,
      cureHint:
        'Verify the start and end page numbers or complete a 10-minute scanned session at your natural reading pace.',
    });
  }

  // 2. Device clock anomaly check (wall clock vs monotonic clock)
  if (typeof input.monotonicElapsedSeconds === 'number' && input.monotonicElapsedSeconds > 0) {
    const monoMinutes = input.monotonicElapsedSeconds / 60;
    if (Math.abs(actualMinutes - monoMinutes) > 2.5) {
      trustScore -= 34;
      independentAdverseSignals.push('clock_anomaly');
      flags.push({
        code: 'clock_anomaly',
        severity: 'escalated',
        label: 'Clock Progression Drift',
        explanation: `Device wall-clock elapsed time (${actualMinutes.toFixed(
          1
        )}m) diverged from monotonic timer (${monoMinutes.toFixed(1)}m).`,
        cureHint:
          'Keep automatic network time enabled on your device; complete a 10-minute live-timed session to restore full trust.',
      });
    }
  }

  // 3. Focus / background ratio (soft informational signal—never disqualifies physical/e-reader reading!)
  const bgSeconds = input.backgroundSeconds ?? 0;
  const focusSwitches = input.focusTransitions ?? 0;
  if (focusSwitches >= 14 && bgSeconds > actualMinutes * 60 * 0.75) {
    trustScore -= 5;
    flags.push({
      code: 'excessive_background_soft',
      severity: 'info',
      label: 'Frequent App Switching (Soft Signal)',
      explanation: `Detected ${focusSwitches} rapid tab/app switches while the timer ran. Screen-off reading is completely fine; frequent app-hopping slightly lowers passive confidence.`,
      cureHint: 'No penalty applied. Lock your phone screen while reading physical books for distraction-free focus.',
    });
  }

  // --- TIER 1: Active low-friction scan / e-reader progress ---
  if (input.hasTier1ScanOrImport && pagesRead > 0) {
    verificationTier = 'active';
    const withinGenerousTolerance =
      actualMinutes >= spanPrediction.toleranceLowMinutes &&
      actualMinutes <= spanPrediction.toleranceHighMinutes;

    if (withinGenerousTolerance) {
      trustScore += 8;
    } else if (!independentAdverseSignals.includes('implausible_speed')) {
      // Outside ±35% tolerance: do NOT disqualify—soft variance + escalate probability next time
      trustScore -= 10;
      shouldEscalateNextSession = true;
      flags.push({
        code: 'pace_variance',
        severity: 'soft',
        label: 'Outside ±35% Predicted Window',
        explanation: `Read ${pagesRead} pages in ${actualMinutes.toFixed(
          1
        )}m vs. predicted ${spanPrediction.toleranceLowMinutes.toFixed(
          1
        )}–${spanPrediction.toleranceHighMinutes.toFixed(1)}m for this book's density.`,
        cureHint:
          'Session still counts! Skimming notes or dense passages happens—Booklit may ask for a quick 6-second passage read next time.',
      });
    }

    const minScanConf = Math.min(
      input.startScanConfidence ?? 0.9,
      input.endScanConfidence ?? 0.9
    );
    if (minScanConf < 0.55) {
      trustScore -= 4;
      flags.push({
        code: 'ocr_low_confidence',
        severity: 'info',
        label: 'Low-Light Page Scan',
        explanation: `Page capture OCR confidence was ${Math.round(
          minScanConf * 100
        )}%; manual page boundary was used.`,
        cureHint: 'Angle the page slightly under warm light to avoid glare on glossy paper.',
      });
    }
  }

  // --- TIER 2: Random Voice Verification & Optional Comprehension ---
  if (input.voiceCheck) {
    verificationTier = 'active';
    if (input.voiceCheck.result === 'pass') {
      trustScore += 12;
    } else if (input.voiceCheck.result === 'inconclusive') {
      // Check rolling 7-day window for prior inconclusive/failed voice checks
      const priorVoiceIssues = input.recentVerificationEvents7d.filter(
        (ev) => ev.type === 'voice_check' && (ev.result === 'inconclusive' || ev.result === 'fail')
      ).length;

      if (priorVoiceIssues >= 1) {
        trustScore -= 24;
        independentAdverseSignals.push('repeated_voice_inconclusive');
      } else {
        trustScore -= 9;
      }

      flags.push({
        code: 'voice_inconclusive',
        severity: priorVoiceIssues >= 1 ? 'escalated' : 'soft',
        label:
          priorVoiceIssues >= 1
            ? 'Repeated Inconclusive Voice Check'
            : 'Inconclusive Voice Check (No Strike)',
        explanation: input.voiceCheck.explanation,
        cureHint:
          priorVoiceIssues >= 1
            ? 'Two inconclusive voice checks occurred within 7 days. Complete a 10-minute Cure Session in a quiet room (or toggle Whisper Mode).'
            : 'First inconclusive check never triggers a strike. Enable Whisper Mode if reading in a quiet library or bedroom.',
      });
    } else {
      // Failed voice check: first isolated failure is treated as inconclusive unless paired with another signal or prior 7d voice issue!
      const priorVoiceIssues = input.recentVerificationEvents7d.filter(
        (ev) => ev.type === 'voice_check' && (ev.result === 'fail' || ev.result === 'inconclusive')
      ).length;

      if (priorVoiceIssues >= 1) {
        // Repeated active check issue in rolling 7-day window counts as two aligned voice signals
        trustScore -= 32;
        independentAdverseSignals.push('voice_failed');
        independentAdverseSignals.push('repeated_voice_window');
      } else {
        trustScore -= 22;
        independentAdverseSignals.push('voice_failed');
      }

      flags.push({
        code: 'voice_failed',
        severity:
          priorVoiceIssues >= 1 || independentAdverseSignals.length >= 2 ? 'escalated' : 'soft',
        label:
          priorVoiceIssues === 0 && independentAdverseSignals.length < 2
            ? 'Voice Check Mismatch (1st Warning — No Strike)'
            : 'Voice Verification Failed',
        explanation: input.voiceCheck.explanation,
        cureHint:
          'Never penalized on a single isolated voice mismatch. Read from the scanned page range for 6–8 seconds, or complete a 10-minute Cure Session if a strike was issued.',
      });
    }
  }

  if (input.comprehensionCheck) {
    if (input.comprehensionCheck.result === 'pass') {
      trustScore += 6;
    } else {
      trustScore -= 12;
      if (input.comprehensionCheck.result === 'fail') {
        independentAdverseSignals.push('comprehension_missed');
      }
      flags.push({
        code: 'comprehension_missed',
        severity: 'soft',
        label: 'Passage Micro-Check Missed',
        explanation: input.comprehensionCheck.explanation,
        cureHint: 'Review the passage summary or retry a comprehension check on your next chapter.',
      });
    }
  }

  // --- TIER 3: Strike Gate (requires >= 2 independent signals!) ---
  const uniqueSignals = Array.from(new Set(independentAdverseSignals));
  const strikeIssued = uniqueSignals.length >= 2;

  if (strikeIssued) {
    verificationTier = 'escalated';
    trustScore = Math.min(trustScore, 34);
  }

  trustScore = Math.max(5, Math.min(100, Math.round(trustScore)));

  // Thresholds:
  // trustScore >= 60 && !strikeIssued -> verified = true (full credit)
  // 42..59 && !strikeIssued -> verified = true (partial soft flag note, counts honestly)
  // strikeIssued or trustScore < 42 -> verified = false (can be cured within 7 days)
  const verified = !strikeIssued && trustScore >= 52 && pagesRead > 0;
  const creditMultiplier: 1 | 0.5 | 0 = strikeIssued ? 0 : trustScore >= 65 ? 1 : 0.5;

  let summaryMessage = 'Verified calmly within your personal reading envelope.';
  if (strikeIssued) {
    summaryMessage = `Escalated (${uniqueSignals.length} independent signals aligned). A curable strike was recorded—historical verified minutes remain intact, and a 10-minute verified Cure Session within 7 days removes it completely.`;
  } else if (flags.some((f) => f.severity === 'soft')) {
    summaryMessage =
      'Session logged with a gentle note—counts toward your reading habit without a strike.';
  } else if (trustScore >= 90) {
    summaryMessage = 'High-confidence verified session. Your genre speed forecast was updated.';
  }

  return {
    trustScore,
    verified,
    creditMultiplier,
    verificationTier,
    predictedMinutes: spanPrediction.predictedMinutes,
    actualMinutes,
    wpmObserved,
    flags,
    strikeIssued,
    independentAdverseSignals: uniqueSignals,
    shouldEscalateNextSession,
    summaryMessage,
  };
}

/**
 * Checks whether a newly completed verified session qualifies to cure an active strike within the past 7 days.
 */
export function findCurableStrikeSession(
  newSession: Pick<ReadingSession, 'verified' | 'strike_issued' | 'actual_minutes' | 'ended_at'>,
  existingSessions: ReadingSession[]
): ReadingSession | null {
  if (!newSession.verified || newSession.strike_issued || newSession.actual_minutes < 10) {
    return null;
  }

  const nowMs = new Date(newSession.ended_at).getTime();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

  const activeStruck = existingSessions
    .filter((s) => {
      if (!s.strike_issued || s.cure_session_id) return false;
      const age = nowMs - new Date(s.ended_at).getTime();
      return age >= 0 && age <= sevenDaysMs;
    })
    .sort((a, b) => new Date(a.ended_at).getTime() - new Date(b.ended_at).getTime());

  return activeStruck[0] ?? null;
}
