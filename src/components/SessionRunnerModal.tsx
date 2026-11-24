'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  Camera,
  CheckCircle2,
  Clock,
  HelpCircle,
  Mic,
  RefreshCw,
  ShieldCheck,
  Trophy,
  VolumeX,
  WifiOff,
  X,
} from 'lucide-react';
import { useBooklit } from '@/context/BooklitContext';
import { GENRE_META, ReadingMedium, ReadingSession } from '@/lib/types';
import {
  analyzePageCapture,
  computeSignatureDistance,
  PageScanAnalysis,
} from '@/lib/domain/ocrService';
import {
  estimateUserGenreSpeed,
  formatMinutesHuman,
  predictPageSpanMinutes,
} from '@/lib/domain/speedModel';
import { computeRandomVoiceCheckProbability } from '@/lib/domain/verificationEngine';

type FlowStep =
  | 'setup'
  | 'camera_explainer'
  | 'live_reading'
  | 'end_boundary'
  | 'mic_explainer'
  | 'voice_check'
  | 'comprehension_check'
  | 'result';

export function SessionRunnerModal() {
  const {
    sessionModalOpen,
    sessionModalBookId,
    sessionModalCureTargetId,
    sessionModalChallengeId,
    sessionModalDuelId,
    closeSessionFlow,
    setAddBookModalOpen,
    books,
    sessions,
    challenges,
    duels,
    user,
    activeDraft,
    isOnline,
    interactionProfile,
    startSessionDraft,
    updateSessionDraft,
    discardSessionDraft,
    completeReadingSession,
    updateProfile,
  } = useBooklit();

  const [step, setStep] = useState<FlowStep>('setup');
  const [selectedBookId, setSelectedBookId] = useState<string>('');
  const [medium, setMedium] = useState<ReadingMedium>('physical');
  const [startPage, setStartPage] = useState<number>(1);
  const [endPage, setEndPage] = useState<number>(10);

  // Live Camera Only state (NO file upload allowed!)
  const [scanTarget, setScanTarget] = useState<'start' | 'end'>('start');
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [startScanResult, setStartScanResult] = useState<PageScanAnalysis | null>(null);
  const [endScanResult, setEndScanResult] = useState<PageScanAnalysis | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  // Live timer (strictly monotonic—no fast-forward)
  const [liveSeconds, setLiveSeconds] = useState(0);

  // Live Microphone Voice Check (strictly <= 10s + WebAudio RMS liveness check)
  const [whisperMode, setWhisperMode] = useState(false);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [liveMicLevel, setLiveMicLevel] = useState(0);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [spokenTranscriptPreview, setSpokenTranscriptPreview] = useState('');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const speechRecRef = useRef<{ stop: () => void } | null>(null);

  // Comprehension check
  const [selectedAnswerIdx, setSelectedAnswerIdx] = useState<number | null>(null);
  const [generatedQuestion, setGeneratedQuestion] = useState<{
    prompt: string;
    options: string[];
    correctIndex: number;
    explanation: string;
  } | null>(null);

  const [completedResult, setCompletedResult] = useState<ReadingSession | null>(null);

  const activeChallenge = useMemo(
    () =>
      challenges.find(
        (c) =>
          c.id === (activeDraft?.challenge_id ?? sessionModalChallengeId) ||
          c.participants.some((p) => p.userId === user?.id)
      ) ?? null,
    [challenges, activeDraft?.challenge_id, sessionModalChallengeId, user?.id]
  );

  const activeDuel = useMemo(
    () =>
      duels.find(
        (d) =>
          d.status === 'active' &&
          (d.id === (activeDraft?.duel_id ?? sessionModalDuelId) ||
            d.challenger.userId === user?.id ||
            d.opponent?.userId === user?.id)
      ) ?? null,
    [duels, activeDraft?.duel_id, sessionModalDuelId, user?.id]
  );

  const strictChallengeActive = Boolean(
    sessionModalChallengeId ||
      sessionModalDuelId ||
      activeDraft?.challenge_id ||
      activeDraft?.duel_id ||
      activeChallenge?.strict_verification ||
      activeDuel ||
      user?.settings_json.challengeMode
  );

  const stopCameraStream = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    setCameraActive(false);
  };

  useEffect(() => {
    if (!sessionModalOpen) {
      stopCameraStream();
      return;
    }

    setWhisperMode(Boolean(user?.settings_json.whisperModeDefault));
    setCompletedResult(null);
    setSelectedAnswerIdx(null);
    setGeneratedQuestion(null);
    setScanError(null);
    setVoiceError(null);

    if (activeDraft) {
      setSelectedBookId(activeDraft.book_id);
      setMedium(activeDraft.medium);
      setStartPage(activeDraft.start_page);
      const book = books.find((b) => b.id === activeDraft.book_id);
      setEndPage(Math.min(book?.page_count ?? 300, activeDraft.start_page + 10));
      setStep('live_reading');
      return;
    }

    const readingBooks = books.filter((b) => b.status === 'reading' || b.status === 'tbr');
    const initialBook =
      books.find((b) => b.id === sessionModalBookId) || readingBooks[0] || books[0];

    if (initialBook) {
      setSelectedBookId(initialBook.id);
      setMedium(initialBook.medium_default);
      setStartPage(initialBook.current_page);
      setEndPage(Math.min(initialBook.page_count, initialBook.current_page + 10));
    }
    setStartScanResult(null);
    setEndScanResult(null);
    setStep('setup');
  }, [
    sessionModalOpen,
    sessionModalBookId,
    activeDraft,
    books,
    user?.settings_json.whisperModeDefault,
  ]);

  const currentBook = useMemo(
    () => books.find((b) => b.id === selectedBookId) ?? books[0] ?? null,
    [books, selectedBookId]
  );

  const booksById = useMemo(() => new Map(books.map((b) => [b.id, b])), [books]);
  const verifiedHistory = useMemo(
    () => sessions.filter((s) => s.verified && !s.strike_issued),
    [sessions]
  );

  const wpmBand = useMemo(() => {
    if (!currentBook) return null;
    return estimateUserGenreSpeed(
      currentBook.genre[0] ?? 'general_nonfiction',
      verifiedHistory,
      booksById,
      currentBook.difficulty_band
    );
  }, [currentBook, verifiedHistory, booksById]);

  const rollingTrustScore = useMemo(() => {
    if (sessions.length === 0) return 88;
    const recent = sessions.slice(0, 6);
    return Math.round(recent.reduce((acc, s) => acc + s.trust_score, 0) / recent.length);
  }, [sessions]);

  // Live reading stopwatch + passive visibility tracking
  useEffect(() => {
    if (!sessionModalOpen || step !== 'live_reading' || !activeDraft) return;

    const updateTick = () => {
      const elapsed = Math.max(
        0,
        Math.floor((Date.now() - new Date(activeDraft.started_at).getTime()) / 1000)
      );
      setLiveSeconds(elapsed);
    };
    updateTick();
    const timer = window.setInterval(updateTick, 1000);

    let hiddenSince: number | null = null;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenSince = Date.now();
      } else if (hiddenSince) {
        const bgDelta = Math.round((Date.now() - hiddenSince) / 1000);
        hiddenSince = null;
        updateSessionDraft(activeDraft.id, {
          background_seconds: activeDraft.background_seconds + bgDelta,
          focus_transitions: activeDraft.focus_transitions + 1,
        }).catch(() => {});
      }
    };

    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [sessionModalOpen, step, activeDraft, updateSessionDraft]);

  // Reference passage: prefer actual OCR-scanned page text if extracted, else book sample passage
  const referenceExcerpt = useMemo(() => {
    const ocrSnippet =
      endScanResult?.extractedSnippet && endScanResult.extractedSnippet.length > 35
        ? endScanResult.extractedSnippet
        : activeDraft?.start_extracted_snippet &&
          activeDraft.start_extracted_snippet.length > 35
        ? activeDraft.start_extracted_snippet
        : '';

    if (ocrSnippet && !ocrSnippet.startsWith('Offline') && !ocrSnippet.startsWith('Live page')) {
      return ocrSnippet;
    }

    if (currentBook && currentBook.sample_passages.length > 0) {
      const matched =
        currentBook.sample_passages.find(
          (p) => startPage >= p.pageStart && startPage <= p.pageEnd
        ) || currentBook.sample_passages[0];
      return matched.excerpt;
    }

    return '';
  }, [currentBook, startPage, endScanResult, activeDraft?.start_extracted_snippet]);

  const spanForecast = useMemo(() => {
    if (!currentBook || !wpmBand) return null;
    const pages = Math.max(1, endPage - startPage);
    const wordsPerPage =
      endScanResult?.estimatedWordsOnPage ||
      startScanResult?.estimatedWordsOnPage ||
      Math.round(currentBook.word_count_estimate / Math.max(1, currentBook.page_count));
    return predictPageSpanMinutes({
      pagesRead: pages,
      wordsPerPage,
      wpmBand,
    });
  }, [currentBook, wpmBand, endPage, startPage, startScanResult, endScanResult]);

  if (!sessionModalOpen) return null;

  // Empty library guard: prompt user to add their real book first
  if (!currentBook) {
    return (
      <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="w-full max-w-sm rounded-3xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 text-center space-y-4 shadow-2xl">
          <div className="w-11 h-11 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
            <BookOpen className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-zinc-900 dark:text-white">
              Add a book to start reading
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Search by title, scan an ISBN barcode, or enter your book first.
            </p>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={closeSessionFlow}
              className="flex-1 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-medium"
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => {
                closeSessionFlow();
                setAddBookModalOpen(true);
              }}
              className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
            >
              Add Book
            </button>
          </div>
        </div>
      </div>
    );
  }

  const totalElapsedMinutes = Math.round((liveSeconds / 60) * 10) / 10;

  // --- LIVE CAMERA ONLY SCANNER ---
  const requestCameraWithExplainer = (target: 'start' | 'end') => {
    setScanTarget(target);
    setScanError(null);
    if (!user?.settings_json.cameraExplainerSeen) {
      setStep('camera_explainer');
      return;
    }
    openLiveWebcam(target);
  };

  const openLiveWebcam = async (targetOverride?: 'start' | 'end') => {
    const activeTarget = targetOverride ?? scanTarget;
    setScanError(null);
    await updateProfile({ settingsPatch: { cameraExplainerSeen: true } });
    if (step === 'camera_explainer') {
      setStep(activeTarget === 'start' ? 'setup' : 'end_boundary');
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setScanError('Camera access is not available on this device/browser.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 960 },
        },
      });
      mediaStreamRef.current = stream;
      setCameraActive(true);
      setTimeout(() => {
        if (videoRef.current) videoRef.current.srcObject = stream;
      }, 80);
    } catch {
      setCameraActive(false);
      setScanError('Camera permission denied. Allow camera access to verify your page scan.');
    }
  };

  const captureLiveWebcamFrame = async () => {
    if (!videoRef.current || videoRef.current.readyState < 2) {
      setScanError('Camera stream is still warming up—wait a moment and tap Capture.');
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth || 640;
    canvas.height = videoRef.current.videoHeight || 840;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/png');
    stopCameraStream();

    setScanning(true);
    setScanError(null);
    try {
      const hint = scanTarget === 'start' ? startPage : endPage;
      const analysis = await analyzePageCapture(dataUrl, hint);

      if (!analysis.livenessValid) {
        setScanError(
          analysis.rejectionReason ||
            'Could not detect readable page text. Frame your open page under clear light.'
        );
        return;
      }

      // If scanning End Page, block scanning the exact same page frame as Start Page!
      if (
        scanTarget === 'end' &&
        activeDraft?.start_frame_signature &&
        computeSignatureDistance(activeDraft.start_frame_signature, analysis.frameSignature) <= 3
      ) {
        setScanError(
          'Anti-cheat alert: End scan matches your start page frame. Scan the new page you reached.'
        );
        return;
      }

      if (scanTarget === 'start') {
        setStartScanResult(analysis);
        if (analysis.detectedPage) {
          const pg = Math.min(currentBook.page_count, analysis.detectedPage);
          setStartPage(pg);
          setEndPage(Math.min(currentBook.page_count, pg + 10));
        }
      } else {
        setEndScanResult(analysis);
        if (analysis.detectedPage) {
          setEndPage(
            Math.max(
              activeDraft?.start_page ?? startPage,
              Math.min(currentBook.page_count, analysis.detectedPage)
            )
          );
        }
      }
    } finally {
      setScanning(false);
    }
  };

  const handleBeginReading = async () => {
    if (strictChallengeActive && !startScanResult?.livenessValid) {
      setScanError('Challenge sessions require a live camera scan of your starting page.');
      return;
    }
    stopCameraStream();

    const hasRecentVariance = sessions
      .slice(0, 3)
      .some((s) => s.flags_json.some((f) => f.code === 'pace_variance'));
    const prob = computeRandomVoiceCheckProbability({
      rollingTrustScore,
      hasRecentPaceVariance: hasRecentVariance,
      activeStrikeCount: user?.strike_count ?? 0,
    });
    const randomScheduled =
      strictChallengeActive || Math.random() < prob || Boolean(sessionModalCureTargetId);

    await startSessionDraft({
      bookId: currentBook.id,
      medium,
      startPage,
      startWordsOnPage: startScanResult?.estimatedWordsOnPage,
      startScanConfidence: startScanResult?.confidence,
      startFrameSignature: startScanResult?.frameSignature ?? null,
      startScannedLive: Boolean(startScanResult?.livenessValid),
      startExtractedSnippet: startScanResult?.extractedSnippet,
      isCureAttemptFor: sessionModalCureTargetId,
      challengeId: sessionModalChallengeId ?? activeChallenge?.id ?? null,
      duelId: sessionModalDuelId ?? activeDuel?.id ?? null,
      randomCheckScheduled: randomScheduled,
    });
    setLiveSeconds(0);
    setStep('live_reading');
  };

  const handleProceedAfterEndBoundary = async () => {
    if (!activeDraft) return;
    if (strictChallengeActive && !endScanResult?.livenessValid) {
      setScanError('Challenge sessions require a live camera scan of your ending page.');
      return;
    }

    if (activeDraft.random_check_scheduled && !activeDraft.random_check_completed) {
      if (!user?.settings_json.micExplainerSeen) setStep('mic_explainer');
      else setStep('voice_check');
      return;
    }

    if (
      (strictChallengeActive || user?.settings_json.comprehensionOptIn) &&
      referenceExcerpt.length >= 30 &&
      !activeDraft.comprehension_result
    ) {
      await prepareComprehensionStep();
      return;
    }

    await finalizeSessionNow();
  };

  const prepareComprehensionStep = async () => {
    const builtInQuestion = currentBook.sample_passages.find((p) => p.question)?.question;
    if (builtInQuestion) {
      setGeneratedQuestion(builtInQuestion);
      setStep('comprehension_check');
      return;
    }
    try {
      const res = await fetch('/api/comprehension', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ excerpt: referenceExcerpt, bookTitle: currentBook.title }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.question) {
          setGeneratedQuestion(data.question);
          setStep('comprehension_check');
          return;
        }
      }
    } catch {}
    await finalizeSessionNow();
  };

  // --- LIVE MICROPHONE VOICE VERIFICATION (with WebAudio RMS Liveness!) ---
  const startRealMicRecording = async () => {
    setVoiceError(null);
    setSpokenTranscriptPreview('');
    audioChunksRef.current = [];
    await updateProfile({ settingsPatch: { micExplainerSeen: true } });

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      // WebAudio RMS voice-activity energy monitor (prevents muted/silent mic spoofing!)
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioCtx();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const pcm = new Uint8Array(analyser.fftSize);
      let activeFramesWithVoice = 0;

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) audioChunksRef.current.push(ev.data);
      };

      const SpeechRecCtor =
        (
          window as unknown as {
            SpeechRecognition?: new () => {
              lang: string;
              interimResults: boolean;
              continuous: boolean;
              onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
              start: () => void;
              stop: () => void;
            };
            webkitSpeechRecognition?: new () => {
              lang: string;
              interimResults: boolean;
              continuous: boolean;
              onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
              start: () => void;
              stop: () => void;
            };
          }
        ).SpeechRecognition ||
        (
          window as unknown as {
            webkitSpeechRecognition?: new () => {
              lang: string;
              interimResults: boolean;
              continuous: boolean;
              onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
              start: () => void;
              stop: () => void;
            };
          }
        ).webkitSpeechRecognition;

      let liveTranscript = '';
      if (SpeechRecCtor) {
        try {
          const rec = new SpeechRecCtor();
          rec.lang = 'en-US';
          rec.interimResults = true;
          rec.continuous = true;
          rec.onresult = (event) => {
            const parts: string[] = [];
            for (let i = 0; i < event.results.length; i++) {
              parts.push(event.results[i][0].transcript);
            }
            liveTranscript = parts.join(' ');
            setSpokenTranscriptPreview(liveTranscript);
          };
          rec.start();
          speechRecRef.current = rec;
        } catch {}
      }

      const startedRecMs = Date.now();
      setIsRecordingVoice(true);
      setRecordingSeconds(0);

      const recInterval = window.setInterval(() => {
        analyser.getByteTimeDomainData(pcm);
        let sumSq = 0;
        for (let i = 0; i < pcm.length; i++) {
          const norm = (pcm[i] - 128) / 128;
          sumSq += norm * norm;
        }
        const rms = Math.sqrt(sumSq / pcm.length);
        setLiveMicLevel(Math.min(100, Math.round(rms * 360)));
        if (rms > 0.018) activeFramesWithVoice++;

        const secs = (Date.now() - startedRecMs) / 1000;
        setRecordingSeconds(Math.min(10, Math.round(secs * 10) / 10));
        if (secs >= 9.8 && recorder.state === 'recording') {
          recorder.stop();
        }
      }, 150);

      recorder.onstop = async () => {
        window.clearInterval(recInterval);
        setIsRecordingVoice(false);
        setLiveMicLevel(0);
        stream.getTracks().forEach((t) => t.stop());
        audioCtx.close().catch(() => {});
        if (speechRecRef.current) {
          try {
            speechRecRef.current.stop();
          } catch {}
        }

        const durationSec = Math.max(2, Math.min(10, (Date.now() - startedRecMs) / 1000));
        const rmsVoiceDetected = activeFramesWithVoice >= 4;
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });

        await submitVoiceVerificationBlob(
          blob,
          liveTranscript || spokenTranscriptPreview,
          durationSec,
          rmsVoiceDetected
        );
      };

      recorder.start();
    } catch {
      setIsRecordingVoice(false);
      setVoiceError('Microphone access was blocked. Allow microphone permission to verify.');
    }
  };

  const stopRealMicRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  };

  const submitVoiceVerificationBlob = async (
    audioBlob: Blob,
    transcriptText: string,
    durationSeconds: number,
    rmsVoiceDetected: boolean
  ) => {
    if (!activeDraft) return;
    if (!rmsVoiceDetected) {
      setVoiceError('No voice detected on microphone. Speak clearly for 5–8 seconds.');
      await updateSessionDraft(activeDraft.id, {
        random_check_completed: true,
        voice_check_result: {
          result: 'fail',
          confidence: 0.1,
          matchedRatio: 0,
          wps: 0,
          whisperMode,
          rmsVoiceDetected: false,
          explanation: 'Microphone stream was silent.',
        },
      });
      return;
    }

    setVoiceBusy(true);
    try {
      const form = new FormData();
      form.append('audio', audioBlob, 'check.webm');
      form.append('expectedText', referenceExcerpt);
      form.append('transcript', transcriptText);
      form.append('durationSeconds', String(durationSeconds));
      form.append('whisperMode', String(whisperMode));
      form.append(
        'retainAudioForDebug',
        String(Boolean(user?.settings_json.retainAudioForDebug))
      );
      form.append('anySentenceFallback', String(referenceExcerpt.length === 0));

      const res = await fetch('/api/verify-speech', {
        method: 'POST',
        headers: { 'x-user-id': user?.id ?? 'auth' },
        body: form,
      });

      if (res.ok) {
        const data = await res.json();
        await updateSessionDraft(activeDraft.id, {
          random_check_completed: true,
          voice_check_result: {
            result: data.result,
            confidence: data.confidence,
            matchedRatio: data.matchedRatio,
            wps: data.wordsPerSecond,
            whisperMode: Boolean(data.whisperMode),
            rmsVoiceDetected: true,
            explanation: data.explanation,
          },
        });
      }
    } finally {
      setVoiceBusy(false);
    }
  };

  const handleComprehensionSubmit = async () => {
    if (!activeDraft || !generatedQuestion || selectedAnswerIdx === null) return;
    const isCorrect = selectedAnswerIdx === generatedQuestion.correctIndex;
    const compRes = {
      result: (isCorrect ? 'pass' : 'fail') as 'pass' | 'fail',
      confidence: isCorrect ? 0.95 : 0.3,
      explanation: generatedQuestion.explanation,
    };
    await updateSessionDraft(activeDraft.id, { comprehension_result: compRes });
    await finalizeSessionNow(compRes);
  };

  const finalizeSessionNow = async (
    explicitComp?: {
      result: 'pass' | 'fail' | 'inconclusive';
      confidence: number;
      explanation: string;
    } | null
  ) => {
    if (!activeDraft) return;
    const mergedDraft = explicitComp
      ? { ...activeDraft, comprehension_result: explicitComp }
      : activeDraft;

    const liveEnd = Boolean(endScanResult?.livenessValid);
    const hasTier1 = Boolean(activeDraft.start_scanned_live && liveEnd);

    const finished = await completeReadingSession({
      draft: mergedDraft,
      endPage: Math.max(activeDraft.start_page, endPage),
      endWordsOnPage: endScanResult?.estimatedWordsOnPage,
      endScanConfidence: endScanResult?.confidence,
      endFrameSignature: endScanResult?.frameSignature ?? null,
      endScannedLive: liveEnd,
      hasTier1ScanOrImport: hasTier1,
      strictChallengeMode: strictChallengeActive,
    });
    setCompletedResult(finished);
    setStep('result');
  };

  const isPwaProfile = interactionProfile === 'pwa';

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div
        className={`w-full ${
          isPwaProfile ? 'max-w-lg rounded-t-3xl sm:rounded-3xl' : 'max-w-xl rounded-2xl'
        } bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl max-h-[92vh] flex flex-col overflow-hidden`}
      >
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-2 min-w-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
              <BookOpen className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                {sessionModalCureTargetId
                  ? 'Strike Cure Session (≥10m)'
                  : step === 'live_reading'
                  ? 'Live Reading Timer'
                  : step === 'result'
                  ? 'Session Verified Result'
                  : 'Verified Reading Session'}
              </h2>
              <div className="flex items-center gap-2 text-[11px] text-zinc-500 truncate">
                <span className="truncate">{currentBook.title}</span>
                {strictChallengeActive && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium shrink-0">
                    <Trophy className="w-3 h-3" /> Challenge Seal
                  </span>
                )}
                {!isOnline && (
                  <span className="inline-flex items-center gap-1 text-amber-600 shrink-0">
                    <WifiOff className="w-3 h-3" /> Offline
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={closeSessionFlow}
            aria-label="Close"
            className="p-2 rounded-xl text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto overflow-x-hidden space-y-4">
          {step === 'setup' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="min-w-0">
                  <label className="block text-xs font-medium text-zinc-500 mb-1">Book</label>
                  <select
                    value={selectedBookId}
                    onChange={(e) => {
                      const b = books.find((item) => item.id === e.target.value);
                      setSelectedBookId(e.target.value);
                      if (b) {
                        setMedium(b.medium_default);
                        setStartPage(b.current_page);
                        setEndPage(Math.min(b.page_count, b.current_page + 10));
                      }
                    }}
                    className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-xs font-medium truncate"
                  >
                    {books.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.title} (p.{b.current_page}/{b.page_count})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-500 mb-1">Medium</label>
                  <div className="grid grid-cols-3 gap-1 rounded-xl bg-zinc-100 dark:bg-zinc-800 p-1">
                    {(['physical', 'ebook', 'audio'] as ReadingMedium[]).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setMedium(m)}
                        className={`py-1.5 rounded-lg text-xs font-medium capitalize transition ${
                          medium === m
                            ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-sm'
                            : 'text-zinc-500'
                        }`}
                      >
                        {m === 'ebook' ? 'E-Reader' : m}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {wpmBand && (
                <div className="rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200/70 dark:border-zinc-800 px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs">
                  <span className="text-zinc-500 truncate">
                    {GENRE_META[currentBook.genre[0]]?.label} pace
                  </span>
                  <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400 shrink-0">
                    {wpmBand.lowWpm}–{wpmBand.highWpm} WPM
                  </span>
                </div>
              )}

              {/* Live Camera Scan Box (NO image upload!) */}
              <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                      Live Start Page Scan
                    </div>
                    <p className="text-[11px] text-zinc-500">
                      Live camera only · Image uploads disabled
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-xs text-zinc-500">p.</span>
                    <input
                      type="number"
                      min={0}
                      max={currentBook.page_count}
                      value={startPage}
                      onChange={(e) =>
                        setStartPage(
                          Math.max(0, Math.min(currentBook.page_count, Number(e.target.value) || 0))
                        )
                      }
                      className="w-16 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-2 py-1 font-mono text-xs text-center"
                    />
                  </div>
                </div>

                {!cameraActive && (
                  <button
                    type="button"
                    onClick={() => requestCameraWithExplainer('start')}
                    className="w-full py-2.5 rounded-xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-semibold inline-flex items-center justify-center gap-2 hover:opacity-90 transition"
                  >
                    <Camera className="w-4 h-4" />
                    {startScanResult ? 'Rescan Start Page' : 'Open Live Camera Scanner'}
                  </button>
                )}

                {cameraActive && scanTarget === 'start' && (
                  <div className="rounded-2xl overflow-hidden border border-zinc-300 dark:border-zinc-700 bg-black relative">
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-56 object-cover"
                    />
                    <div className="absolute inset-4 border border-emerald-400/60 rounded-xl pointer-events-none" />
                    <div className="p-3 bg-black/85 flex items-center justify-between gap-2">
                      <span className="text-[11px] text-zinc-300 truncate">
                        Frame page text & page number
                      </span>
                      <div className="flex gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={stopCameraStream}
                          className="px-2.5 py-1.5 rounded-lg text-xs text-zinc-300 hover:bg-white/10"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={captureLiveWebcamFrame}
                          className="px-3.5 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold"
                        >
                          Capture Live
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {scanning && (
                  <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Verifying live page liveness & word density…
                  </div>
                )}

                {scanError && (
                  <div className="rounded-xl bg-rose-500/10 border border-rose-500/25 px-3 py-2 text-xs text-rose-600 dark:text-rose-400">
                    {scanError}
                  </div>
                )}

                {startScanResult?.livenessValid && !scanning && (
                  <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/25 px-3 py-2.5 text-xs flex items-center justify-between gap-2">
                    <span className="text-emerald-800 dark:text-emerald-300 font-medium truncate">
                      Live Scan Verified · {Math.round(startScanResult.confidence * 100)}% OCR (~
                      {startScanResult.estimatedWordsOnPage} words)
                    </span>
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={handleBeginReading}
                className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm flex items-center justify-center gap-2 transition"
              >
                <Clock className="w-4 h-4" />
                Start Reading (p. {startPage})
              </button>
            </div>
          )}

          {step === 'camera_explainer' && (
            <div className="py-4 space-y-4 text-center max-w-sm mx-auto">
              <div className="w-11 h-11 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center mx-auto">
                <Camera className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-semibold">Live Page Boundary Check</h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                Snap one live frame of your start and end page. No continuous video, and image
                uploads are disabled to keep challenges fair.
              </p>
              <div className="flex gap-2 justify-center pt-1">
                {!strictChallengeActive && (
                  <button
                    type="button"
                    onClick={() => setStep(scanTarget === 'start' ? 'setup' : 'end_boundary')}
                    className="px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-medium"
                  >
                    Not now
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => openLiveWebcam()}
                  className="px-5 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold"
                >
                  Open Camera
                </button>
              </div>
            </div>
          )}

          {step === 'live_reading' && activeDraft && (
            <div className="space-y-4">
              <div className="rounded-3xl bg-zinc-950 text-white p-7 text-center space-y-3 border border-zinc-800">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-400 text-xs font-medium">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  Reading from p. {activeDraft.start_page}
                </div>

                <div className="font-mono text-5xl font-light tracking-tight tabular-nums py-2">
                  {String(Math.floor(liveSeconds / 60)).padStart(2, '0')}:
                  {String(liveSeconds % 60).padStart(2, '0')}
                </div>

                <p className="text-[11px] text-zinc-400">
                  Lock your screen freely while reading—session draft is saved offline.
                </p>
              </div>

              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    await discardSessionDraft(activeDraft.id);
                    closeSessionFlow();
                  }}
                  className="px-3.5 py-2.5 rounded-xl text-xs font-medium text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setScanError(null);
                    setStep('end_boundary');
                  }}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
                >
                  Finish & Scan End Page →
                </button>
              </div>
            </div>
          )}

          {step === 'end_boundary' && activeDraft && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-semibold">End Page Live Scan</h3>
                    <p className="text-[11px] text-zinc-500">
                      Started p.{activeDraft.start_page} · Elapsed {totalElapsedMinutes.toFixed(1)}m
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-zinc-500">End p.</span>
                    <input
                      type="number"
                      min={activeDraft.start_page}
                      max={currentBook.page_count}
                      value={endPage}
                      onChange={(e) =>
                        setEndPage(
                          Math.max(
                            activeDraft.start_page,
                            Math.min(currentBook.page_count, Number(e.target.value) || 0)
                          )
                        )
                      }
                      className="w-16 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-2 py-1 font-mono text-xs text-center"
                    />
                  </div>
                </div>

                {spanForecast && endPage > activeDraft.start_page && (
                  <div className="rounded-xl bg-zinc-50 dark:bg-zinc-800/70 px-3 py-2 text-xs flex items-center justify-between gap-2">
                    <span>{endPage - activeDraft.start_page} pages</span>
                    <span className="font-mono text-emerald-600 dark:text-emerald-400">
                      Expected: {spanForecast.toleranceLowMinutes.toFixed(1)}–
                      {spanForecast.toleranceHighMinutes.toFixed(1)}m
                    </span>
                  </div>
                )}

                {!cameraActive && (
                  <button
                    type="button"
                    onClick={() => requestCameraWithExplainer('end')}
                    className="w-full py-2.5 rounded-xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-semibold inline-flex items-center justify-center gap-2"
                  >
                    <Camera className="w-4 h-4" />
                    {endScanResult ? 'Rescan End Page' : 'Scan End Page with Camera'}
                  </button>
                )}

                {cameraActive && scanTarget === 'end' && (
                  <div className="rounded-2xl overflow-hidden border border-zinc-300 dark:border-zinc-700 bg-black relative">
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-56 object-cover"
                    />
                    <div className="absolute inset-4 border border-emerald-400/60 rounded-xl pointer-events-none" />
                    <div className="p-3 bg-black/85 flex items-center justify-between gap-2">
                      <span className="text-[11px] text-zinc-300 truncate">
                        Frame ending page clearly
                      </span>
                      <div className="flex gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={stopCameraStream}
                          className="px-2.5 py-1.5 rounded-lg text-xs text-zinc-300"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={captureLiveWebcamFrame}
                          className="px-3.5 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold"
                        >
                          Capture Live
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {scanning && (
                  <div className="flex items-center gap-2 text-xs text-emerald-600">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Checking frame signature & OCR…
                  </div>
                )}

                {scanError && (
                  <div className="rounded-xl bg-rose-500/10 border border-rose-500/25 px-3 py-2 text-xs text-rose-600 dark:text-rose-400">
                    {scanError}
                  </div>
                )}

                {endScanResult?.livenessValid && !scanning && (
                  <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/25 px-3 py-2.5 text-xs flex items-center justify-between">
                    <span className="text-emerald-800 dark:text-emerald-300 font-medium">
                      End Scan Verified · {Math.round(endScanResult.confidence * 100)}% OCR
                    </span>
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setStep('live_reading')}
                  className="px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-medium"
                >
                  ← Timer
                </button>
                <button
                  type="button"
                  onClick={handleProceedAfterEndBoundary}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
                >
                  Verify & Complete
                </button>
              </div>
            </div>
          )}

          {step === 'mic_explainer' && (
            <div className="py-4 space-y-4 text-center max-w-sm mx-auto">
              <div className="w-11 h-11 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center mx-auto">
                <Mic className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-semibold">6-Second Live Voice Check</h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                Read a short sentence aloud for 5–10 seconds. Audio is scored immediately and never
                saved unless enabled in Settings.
              </p>
              <div className="flex gap-2 justify-center pt-1">
                {!strictChallengeActive && (
                  <button
                    type="button"
                    onClick={() => finalizeSessionNow()}
                    className="px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-medium"
                  >
                    Skip
                  </button>
                )}
                <button
                  type="button"
                  onClick={async () => {
                    await updateProfile({ settingsPatch: { micExplainerSeen: true } });
                    setStep('voice_check');
                  }}
                  className="px-5 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold"
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {step === 'voice_check' && activeDraft && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  Live Voice Check (Max 10s)
                </span>
                <button
                  type="button"
                  onClick={() => setWhisperMode((w) => !w)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border ${
                    whisperMode
                      ? 'border-indigo-500 bg-indigo-500/10 text-indigo-600 dark:text-indigo-300'
                      : 'border-zinc-200 dark:border-zinc-700 text-zinc-500'
                  }`}
                >
                  <VolumeX className="w-3 h-3" />
                  {whisperMode ? 'Whisper Mode ON' : 'Whisper Mode'}
                </button>
              </div>

              <div className="rounded-2xl bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 p-4 space-y-1.5">
                <div className="text-[11px] text-zinc-500">
                  {referenceExcerpt
                    ? 'Read this passage aloud (5–10s):'
                    : 'Read one sentence from your current page aloud (5–10s):'}
                </div>
                {referenceExcerpt && (
                  <p className="font-serif text-sm sm:text-base leading-relaxed text-zinc-900 dark:text-zinc-100">
                    “{referenceExcerpt}”
                  </p>
                )}
              </div>

              <div className="flex flex-col items-center gap-3 py-2">
                {!isRecordingVoice ? (
                  <button
                    type="button"
                    disabled={voiceBusy}
                    onClick={startRealMicRecording}
                    className="px-6 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center gap-2 shadow disabled:opacity-50"
                  >
                    <Mic className="w-4 h-4" />
                    {voiceBusy ? 'Verifying speech…' : 'Record Live Voice (6–10s)'}
                  </button>
                ) : (
                  <div className="w-full space-y-2 text-center">
                    <button
                      type="button"
                      onClick={stopRealMicRecording}
                      className="px-6 py-3 rounded-2xl bg-rose-600 text-white text-xs font-semibold inline-flex items-center gap-2 animate-pulse"
                    >
                      Stop & Verify ({recordingSeconds.toFixed(1)}s / 10.0s)
                    </button>
                    <div className="w-48 h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-full mx-auto overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 transition-all"
                        style={{ width: `${liveMicLevel}%` }}
                      />
                    </div>
                  </div>
                )}

                {spokenTranscriptPreview && (
                  <p className="text-xs text-zinc-500 italic text-center">
                    “{spokenTranscriptPreview}”
                  </p>
                )}

                {voiceError && (
                  <p className="text-xs text-rose-600 dark:text-rose-400 text-center">
                    {voiceError}
                  </p>
                )}
              </div>

              {activeDraft.voice_check_result && (
                <div
                  className={`rounded-xl p-3 border text-xs ${
                    activeDraft.voice_check_result.result === 'pass'
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
                      : 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200'
                  }`}
                >
                  <div className="font-semibold capitalize">
                    {activeDraft.voice_check_result.result} (
                    {Math.round(activeDraft.voice_check_result.confidence * 100)}%)
                  </div>
                  <p className="mt-0.5">{activeDraft.voice_check_result.explanation}</p>
                </div>
              )}

              <div className="flex justify-between pt-1">
                <button
                  type="button"
                  onClick={() => setStep('end_boundary')}
                  className="px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs"
                >
                  ← Back
                </button>
                <button
                  type="button"
                  disabled={strictChallengeActive && !activeDraft.voice_check_result}
                  onClick={async () => {
                    if (
                      (strictChallengeActive || user?.settings_json.comprehensionOptIn) &&
                      referenceExcerpt.length >= 30 &&
                      !activeDraft.comprehension_result
                    ) {
                      await prepareComprehensionStep();
                    } else {
                      await finalizeSessionNow();
                    }
                  }}
                  className="px-5 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold disabled:opacity-40"
                >
                  Continue →
                </button>
              </div>
            </div>
          )}

          {step === 'comprehension_check' && generatedQuestion && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  <HelpCircle className="w-3.5 h-3.5" />
                  Passage Checkpoint
                </span>
                {!strictChallengeActive && (
                  <button
                    type="button"
                    onClick={() => finalizeSessionNow()}
                    className="text-xs text-zinc-500 hover:underline"
                  >
                    Skip
                  </button>
                )}
              </div>

              <p className="text-xs sm:text-sm font-medium text-zinc-900 dark:text-zinc-100">
                {generatedQuestion.prompt}
              </p>

              <div className="space-y-2">
                {generatedQuestion.options.map((opt, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSelectedAnswerIdx(idx)}
                    className={`w-full text-left p-3 rounded-xl border text-xs transition ${
                      selectedAnswerIdx === idx
                        ? 'border-emerald-600 bg-emerald-600/10 font-semibold'
                        : 'border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>

              <button
                type="button"
                disabled={selectedAnswerIdx === null}
                onClick={handleComprehensionSubmit}
                className="w-full py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-semibold disabled:opacity-40"
              >
                Submit & Finish
              </button>
            </div>
          )}

          {step === 'result' && completedResult && (
            <div className="space-y-4">
              <div
                className={`rounded-2xl p-4 border ${
                  completedResult.strike_issued
                    ? 'border-rose-500/30 bg-rose-500/10'
                    : completedResult.verified
                    ? 'border-emerald-500/30 bg-emerald-500/10'
                    : 'border-amber-500/30 bg-amber-500/10'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {completedResult.strike_issued ? (
                      <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
                    ) : (
                      <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold truncate">
                        {completedResult.strike_issued
                          ? 'Curable Strike Recorded'
                          : completedResult.verified
                          ? 'Verified Session'
                          : 'Unverified Progress Logged'}
                      </h3>
                      <p className="text-[11px] text-zinc-500">
                        p.{completedResult.start_page} → {completedResult.end_page}
                        {completedResult.challenge_eligible ? ' · Challenge Credited ✓' : ''}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono text-xl font-bold">
                      {completedResult.trust_score}
                      <span className="text-xs font-normal text-zinc-500">/100</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-zinc-50 dark:bg-zinc-800 p-2.5">
                  <div className="text-[10px] text-zinc-500">Actual</div>
                  <div className="font-mono text-sm font-semibold mt-0.5">
                    {formatMinutesHuman(completedResult.actual_minutes)}
                  </div>
                </div>
                <div className="rounded-xl bg-zinc-50 dark:bg-zinc-800 p-2.5">
                  <div className="text-[10px] text-zinc-500">Predicted</div>
                  <div className="font-mono text-sm font-semibold mt-0.5">
                    {formatMinutesHuman(completedResult.predicted_minutes)}
                  </div>
                </div>
                <div className="rounded-xl bg-zinc-50 dark:bg-zinc-800 p-2.5">
                  <div className="text-[10px] text-zinc-500">Pace</div>
                  <div className="font-mono text-sm font-semibold mt-0.5">
                    {completedResult.wpm_observed} wpm
                  </div>
                </div>
              </div>

              {completedResult.flags_json.length > 0 && (
                <div className="space-y-2">
                  {completedResult.flags_json.map((flag, i) => (
                    <div
                      key={i}
                      className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3 text-xs space-y-0.5"
                    >
                      <div className="font-semibold">{flag.label}</div>
                      <p className="text-zinc-500">{flag.explanation}</p>
                      <p className="text-emerald-600 dark:text-emerald-400 font-medium">
                        {flag.cureHint}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={closeSessionFlow}
                className="w-full py-3 rounded-2xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-semibold"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
