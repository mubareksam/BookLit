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
import { computeSignatureDistance } from './ocrService';
import { toTrustScale } from './trust';

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
  liveCameraStart?: boolean;
  liveCameraEnd?: boolean;
  startFrameSignature?: string | null;
  endFrameSignature?: string | null;
  strictChallengeMode?: boolean;
  /** E-Reader / Kindle path: page scans are impossible, so Booklit verifies paced
   *  progress checkpoints + voice presence instead of an OCR page scan. */
  ereaderCheckpointVerified?: boolean;
  ereaderStartPercent?: number;
  ereaderEndPercent?: number;
  ereaderAttentionChecks?: number;
  ereaderAttentionChecksPassed?: number;
  backgroundSeconds?: number;
  focusTransitions?: number;
  voiceCheck?: {
    result: VerificationResult;
    confidence: number;
    matchedRatio: number;
    wps: number;
    whisperMode: boolean;
    rmsVoiceDetected?: boolean;
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
  /** Honest Rate on the 0–1000 scale. */
  trustScore: number;
  trustScale: number;
  verified: boolean;
  challengeEligible: boolean;
  creditMultiplier: 1 | 0.5 | 0;
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

export function normalizeTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

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
  const minWps = whisperMode ? 0.9 : 1.15;
  const maxWps = 4.4;
  const ratePlausible = wps >= minWps && wps <= maxWps;

  const expectedPauses = Math.max(1, Math.round(duration / 3.2));
  const observedPauses = params.pauseCount ?? expectedPauses;
  const pauseDelta = Math.abs(observedPauses - expectedPauses);
  const pauseFluencyScore = Math.max(0.35, Math.min(1, 1 - pauseDelta * 0.14));

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
        explanation: `Verified natural speech cadence (${wps} wps).`,
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
          ? 'Clip was too short. Read one full sentence aloud for 5–8 seconds.'
          : `Speech cadence (${wps} wps) fell outside natural reading bounds.`,
    };
  }

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
      explanation: `Matched ${Math.round(matchedRatio * 100)}% of passage words at ${wps} wps.`,
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
      explanation: `Partial match (${Math.round(matchedRatio * 100)}%). Marked inconclusive—no strike issued.`,
    };
  }

  return {
    result: 'fail',
    confidence: 0.25,
    matchedRatio,
    wordsPerSecond: wps,
    pauseFluencyScore,
    whisperMode,
    explanation: `Only ${Math.round(matchedRatio * 100)}% of spoken words matched the passage.`,
  };
}

export function computeRandomVoiceCheckProbability(params: {
  rollingTrustScore: number;
  hasRecentPaceVariance: boolean;
  activeStrikeCount: number;
}): number {
  let prob = 0.2;
  if (params.rollingTrustScore >= 88) prob = 0.16;
  else if (params.rollingTrustScore >= 72) prob = 0.3;
  else if (params.rollingTrustScore >= 55) prob = 0.5;
  else prob = 0.75;

  if (params.hasRecentPaceVariance) prob = Math.min(0.85, prob + 0.22);
  if (params.activeStrikeCount > 0) prob = Math.min(0.88, prob + 0.15);
  return Math.round(prob * 100) / 100;
}

export function scoreReadingSession(input: SessionScoringInput): SessionScoringOutput {
  const flags: SessionFlag[] = [];
  const independentAdverseSignals: string[] = [];

  const startMs = new Date(input.startedAtIso).getTime();
  const endMs = new Date(input.endedAtIso).getTime();
  const wallMinutes = Math.max(0.25, (endMs - startMs) / 60000);
  const actualMinutes = Math.round(wallMinutes * 100) / 100;

  let pagesRead = Math.max(0, input.endPage - input.startPage);

  // E-Readers usually expose a percentage, not page numbers. When a reader logs
  // progress as "% read" only, convert that delta into a page equivalent so the
  // session can still be verified and paced against their speed model.
  if (
    pagesRead <= 0 &&
    input.ereaderCheckpointVerified &&
    (input.ereaderEndPercent ?? 0) > (input.ereaderStartPercent ?? 0)
  ) {
    const pctDelta = (input.ereaderEndPercent ?? 0) - (input.ereaderStartPercent ?? 0);
    pagesRead = Math.max(1, Math.round((input.book.page_count * pctDelta) / 100));
  }

  const defaultWordsPerPage =
    input.book.page_count > 0 ? input.book.word_count_estimate / input.book.page_count : 280;
  const wordsPerPage =
    input.wordsPerPageObserved && input.wordsPerPageObserved > 30
      ? input.wordsPerPageObserved
      : defaultWordsPerPage;

  const spanPrediction = predictPageSpanMinutes({
    pagesRead: Math.max(1, pagesRead),
    wordsPerPage,
    wpmBand: input.wpmBand,
  });

  const wpmObserved =
    pagesRead > 0 ? Math.round((pagesRead * wordsPerPage) / Math.max(0.25, actualMinutes)) : 0;

  const ereaderSeal = Boolean(input.ereaderCheckpointVerified);
  const baseTrustScore = input.hasTier1ScanOrImport ? 86 : ereaderSeal ? 80 : 74;

  let trustScore = baseTrustScore;
  let verificationTier: VerificationTier = input.hasTier1ScanOrImport
    ? 'passive'
    : ereaderSeal
    ? 'passive'
    : 'none';
  let shouldEscalateNextSession = false;
  let clockAnomaly = false;
  let duplicateFrameDetected = false;

  // --- TIER 0: Passive Anti-Cheat Signals ---
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
      label: 'Implausible Pace',
      explanation: `${wpmObserved} WPM exceeds >2× your ${input.wpmBand.personal95thWpm} WPM ceiling.`,
      cureHint: 'Scan accurate start/end pages or complete a ≥10m verified Cure Session.',
    });
  }

  if (typeof input.monotonicElapsedSeconds === 'number' && input.monotonicElapsedSeconds > 0) {
    const monoMinutes = input.monotonicElapsedSeconds / 60;
    if (Math.abs(actualMinutes - monoMinutes) > 2.5) {
      clockAnomaly = true;
      trustScore -= 34;
      independentAdverseSignals.push('clock_anomaly');
      flags.push({
        code: 'clock_anomaly',
        severity: 'escalated',
        label: 'Clock Tampering Detected',
        explanation: `Device clock (${actualMinutes.toFixed(1)}m) diverged from live monotonic timer (${monoMinutes.toFixed(1)}m).`,
        cureHint: 'Keep automatic system time enabled during live sessions.',
      });
    }
  }

  // Anti-cheat duplicate scan frame check (prevent scanning identical page for both start & end)
  if (
    pagesRead >= 1 &&
    input.startFrameSignature &&
    input.endFrameSignature &&
    computeSignatureDistance(input.startFrameSignature, input.endFrameSignature) <= 3
  ) {
    duplicateFrameDetected = true;
    trustScore -= 36;
    independentAdverseSignals.push('duplicate_scan_frame');
    flags.push({
      code: 'duplicate_scan_frame',
      severity: 'escalated',
      label: 'Identical Start & End Page Frame',
      explanation: 'Start and end camera scans appear to capture the exact same page.',
      cureHint: 'Scan the opening page at start and the new page reached at session end.',
    });
  }

  const bgSeconds = input.backgroundSeconds ?? 0;
  const focusSwitches = input.focusTransitions ?? 0;
  if (focusSwitches >= 14 && bgSeconds > actualMinutes * 60 * 0.75) {
    trustScore -= 5;
    flags.push({
      code: 'excessive_background_soft',
      severity: 'info',
      label: 'Frequent App Switching',
      explanation: `${focusSwitches} rapid app switches logged (soft note only).`,
      cureHint: 'Lock your screen while reading physical books to stay focused.',
    });
  }

  // --- E-READER PATH: Paced Progress Checkpoints (no OCR page scan possible on e-ink) ---
  if (ereaderSeal) {
    verificationTier = 'active';
    const startPct = Math.max(0, Math.min(100, input.ereaderStartPercent ?? 0));
    const endPct = Math.max(0, Math.min(100, input.ereaderEndPercent ?? 0));
    const progressed = endPct > startPct;

    if (!progressed && pagesRead <= 0) {
      trustScore -= 26;
      independentAdverseSignals.push('ereader_no_progress');
      flags.push({
        code: 'ereader_no_progress',
        severity: 'escalated',
        label: 'No E-Reader Progress',
        explanation: 'End position never advanced past your start position.',
        cureHint: 'Record the reading percentage shown on your e-reader at start and at end.',
      });
    }

    const attentionChecks = input.ereaderAttentionChecks ?? 0;
    const attentionPassed = input.ereaderAttentionChecksPassed ?? attentionChecks;
    if (attentionChecks > 0 && attentionPassed < attentionChecks) {
      trustScore -= 14;
      flags.push({
        code: 'ereader_attention_missed',
        severity: 'soft',
        label: 'Missed E-Reader Presence Check',
        explanation: `${attentionChecks - attentionPassed} of ${attentionChecks} mid-session presence taps were missed.`,
        cureHint: 'Tap the presence prompt that appears while you read on your e-reader.',
      });
    } else if (attentionChecks > 0) {
      trustScore += 5;
    }
  }

  // --- TIER 1: Live Scan Boundary Tolerance (±35%) ---
  if (input.hasTier1ScanOrImport && pagesRead > 0) {
    verificationTier = 'active';
    const withinTolerance =
      actualMinutes >= spanPrediction.toleranceLowMinutes &&
      actualMinutes <= spanPrediction.toleranceHighMinutes;

    if (withinTolerance && !duplicateFrameDetected) {
      trustScore += 8;
    } else if (!independentAdverseSignals.includes('implausible_speed')) {
      trustScore -= 10;
      shouldEscalateNextSession = true;
      flags.push({
        code: 'pace_variance',
        severity: 'soft',
        label: 'Outside ±35% Expected Window',
        explanation: `${pagesRead}p in ${actualMinutes.toFixed(1)}m vs expected ${spanPrediction.toleranceLowMinutes.toFixed(1)}–${spanPrediction.toleranceHighMinutes.toFixed(1)}m.`,
        cureHint: 'Counts normally; a short voice check may trigger on your next session.',
      });
    }
  }

  // --- TIER 2: Live Voice Verification & Comprehension ---
  if (input.voiceCheck) {
    verificationTier = 'active';
    if (input.voiceCheck.rmsVoiceDetected === false) {
      trustScore -= 28;
      independentAdverseSignals.push('silent_audio_rejected');
      flags.push({
        code: 'silent_audio_rejected',
        severity: 'escalated',
        label: 'Silent Microphone Rejected',
        explanation: 'No human voice energy was detected on the microphone stream.',
        cureHint: 'Unmute your microphone and read the short passage aloud for 5–8s.',
      });
    } else if (input.voiceCheck.result === 'pass') {
      trustScore += 12;
    } else if (input.voiceCheck.result === 'inconclusive') {
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
        cureHint: 'Toggle Whisper Mode in quiet rooms or complete a 10m Cure Session.',
      });
    } else {
      const priorVoiceIssues = input.recentVerificationEvents7d.filter(
        (ev) => ev.type === 'voice_check' && (ev.result === 'fail' || ev.result === 'inconclusive')
      ).length;

      if (priorVoiceIssues >= 1) {
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
            ? 'Voice Check Mismatch (1st Warning)'
            : 'Voice Check Failed',
        explanation: input.voiceCheck.explanation,
        cureHint: 'Isolated failures never strike. Read from your active page range for 6–8s.',
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
        label: 'Passage Check Missed',
        explanation: input.comprehensionCheck.explanation,
        cureHint: 'Review the passage before finishing your next session.',
      });
    }
  }

  // --- TIER 3: Two-Independent-Signal Strike Gate ---
  const uniqueSignals = Array.from(new Set(independentAdverseSignals));
  const strikeIssued = uniqueSignals.length >= 2;

  if (strikeIssued) {
    verificationTier = 'escalated';
    trustScore = Math.min(trustScore, 34);
  }

  trustScore = Math.max(5, Math.min(100, Math.round(trustScore)));

  // Verified requires live scan or active check without strike
  const verified =
    !strikeIssued &&
    !duplicateFrameDetected &&
    !clockAnomaly &&
    trustScore >= 58 &&
    pagesRead > 0 &&
    (input.hasTier1ScanOrImport || ereaderSeal);

  // Competitive Challenge Eligibility: strictly requires BOTH live camera scans, distinct frames, real timer, and voice check when strict mode is active
  const bothLiveScans = Boolean(input.liveCameraStart && input.liveCameraEnd);
  const liveScanBoundary = bothLiveScans || ereaderSeal;
  const voicePassedForStrict = input.strictChallengeMode
    ? Boolean(
        input.voiceCheck &&
          input.voiceCheck.result === 'pass' &&
          input.voiceCheck.rmsVoiceDetected !== false
      )
    : true;

  const challengeEligible =
    verified &&
    liveScanBoundary &&
    !duplicateFrameDetected &&
    !clockAnomaly &&
    actualMinutes >= 3 &&
    voicePassedForStrict;

  const creditMultiplier: 1 | 0.5 | 0 = strikeIssued ? 0 : trustScore >= 65 ? 1 : 0.5;

  let summaryMessage = verified
    ? 'Verified session recorded.'
    : !input.hasTier1ScanOrImport && !ereaderSeal
    ? 'Logged as unverified progress (live camera scan or e-reader checkpoint required).'
    : 'Session flagged—review signal details below.';

  if (strikeIssued) {
    summaryMessage =
      'Curable strike recorded (2 signals aligned). Complete a ≥10m verified Cure Session within 7 days to clear it.';
  }

  return {
    trustScore: toTrustScale(trustScore),
    trustScale: 1000,
    verified,
    challengeEligible,
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
