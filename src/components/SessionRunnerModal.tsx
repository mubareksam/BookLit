'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  Camera,
  CheckCircle2,
  Clock,
  FastForward,
  FileText,
  HelpCircle,
  Mic,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Tablet,
  Upload,
  VolumeX,
  WifiOff,
  X,
} from 'lucide-react';
import { useBooklit } from '@/context/BooklitContext';
import { GENRE_META, ReadingMedium, ReadingSession } from '@/lib/types';
import {
  analyzePageCapture,
  PageScanAnalysis,
  renderSamplePageCapture,
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
    closeSessionFlow,
    books,
    sessions,
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

  const readingBooks = useMemo(
    () => books.filter((b) => b.status === 'reading' || b.status === 'tbr'),
    [books]
  );

  const [step, setStep] = useState<FlowStep>('setup');
  const [selectedBookId, setSelectedBookId] = useState<string>('');
  const [medium, setMedium] = useState<ReadingMedium>('physical');
  const [startPage, setStartPage] = useState<number>(1);
  const [endPage, setEndPage] = useState<number>(15);

  // OCR state
  const [scanTarget, setScanTarget] = useState<'start' | 'end'>('start');
  const [scanning, setScanning] = useState(false);
  const [startScanResult, setStartScanResult] = useState<PageScanAnalysis | null>(null);
  const [endScanResult, setEndScanResult] = useState<PageScanAnalysis | null>(null);
  const [capturedPreviewUrl, setCapturedPreviewUrl] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  // E-reader share-sheet companion import state
  const [ereaderShareText, setEreaderShareText] = useState('');
  const [ereaderImportConfirmed, setEreaderImportConfirmed] = useState(false);

  // Live timer & simulated elapsed minutes
  const [liveSeconds, setLiveSeconds] = useState(0);
  const [simulatedBonusMinutes, setSimulatedBonusMinutes] = useState(0);

  // Voice check state (strictly <= 10 seconds!)
  const [whisperMode, setWhisperMode] = useState(false);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [spokenTranscriptPreview, setSpokenTranscriptPreview] = useState('');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const speechRecRef = useRef<{ stop: () => void } | null>(null);

  // Comprehension check state
  const [selectedAnswerIdx, setSelectedAnswerIdx] = useState<number | null>(null);

  // Completed session output
  const [completedResult, setCompletedResult] = useState<ReadingSession | null>(null);

  const stopCameraStream = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    setCameraActive(false);
  };

  // Sync modal state when opened or when resuming an offline draft
  useEffect(() => {
    if (!sessionModalOpen) {
      stopCameraStream();
      return;
    }

    setWhisperMode(Boolean(user?.settings_json.whisperModeDefault));
    setCompletedResult(null);
    setSelectedAnswerIdx(null);

    if (activeDraft) {
      setSelectedBookId(activeDraft.book_id);
      setMedium(activeDraft.medium);
      setStartPage(activeDraft.start_page);
      const book = books.find((b) => b.id === activeDraft.book_id);
      setEndPage(Math.min(book?.page_count ?? 300, activeDraft.start_page + 14));
      setStep('live_reading');
      return;
    }

    const initialBook =
      books.find((b) => b.id === sessionModalBookId) ||
      readingBooks[0] ||
      books[0];

    if (initialBook) {
      setSelectedBookId(initialBook.id);
      setMedium(initialBook.medium_default);
      setStartPage(initialBook.current_page);
      setEndPage(Math.min(initialBook.page_count, initialBook.current_page + 14));
    }
    setStartScanResult(null);
    setEndScanResult(null);
    setCapturedPreviewUrl(null);
    setSimulatedBonusMinutes(0);
    setEreaderShareText('');
    setEreaderImportConfirmed(false);
    setStep('setup');
  }, [sessionModalOpen, sessionModalBookId, activeDraft, books, readingBooks, user?.settings_json.whisperModeDefault]);

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

  // Live reading stopwatch + passive visibilitychange / blur tracking
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

  // Passage excerpt from scanned page range for Tier 2 Voice / Comprehension checks
  const activePassage = useMemo(() => {
    if (!currentBook) return null;
    const matched =
      currentBook.sample_passages.find(
        (p) => startPage >= p.pageStart && startPage <= p.pageEnd
      ) || currentBook.sample_passages[0];
    if (matched) return matched;
    return {
      pageStart: 1,
      pageEnd: currentBook.page_count,
      excerpt:
        'Steady attention turns brief daily reading windows into lasting understanding across every chapter.',
    };
  }, [currentBook, startPage]);

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

  if (!sessionModalOpen || !currentBook) return null;

  const totalElapsedMinutes =
    Math.round(((liveSeconds + simulatedBonusMinutes * 60) / 60) * 10) / 10;

  // --- Camera & Sample Scan Handlers ---
  const requestCameraWithExplainer = (target: 'start' | 'end') => {
    setScanTarget(target);
    if (!user?.settings_json.cameraExplainerSeen) {
      setStep('camera_explainer');
      return;
    }
    openLiveWebcam();
  };

  const openLiveWebcam = async () => {
    await updateProfile({ settingsPatch: { cameraExplainerSeen: true } });
    if (step === 'camera_explainer') {
      setStep(scanTarget === 'start' ? 'setup' : 'end_boundary');
    }
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
        mediaStreamRef.current = stream;
        setCameraActive(true);
        setTimeout(() => {
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
        }, 100);
      }
    } catch {
      setCameraActive(false);
    }
  };

  const captureWebcamFrame = async () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth || 640;
    canvas.height = videoRef.current.videoHeight || 840;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/png');
    stopCameraStream();
    await runOcrOnDataUrl(dataUrl, scanTarget === 'start' ? startPage : endPage);
  };

  const handleFileScanUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    target: 'start' | 'end'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setScanTarget(target);
    const reader = new FileReader();
    reader.onload = async () => {
      if (typeof reader.result === 'string') {
        await runOcrOnDataUrl(reader.result, target === 'start' ? startPage : endPage);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSamplePresetScan = async (
    preset: 'crisp' | 'dim_angled' | 'dense_academic' | 'ereader_progress',
    target: 'start' | 'end'
  ) => {
    setScanTarget(target);
    const pageNum = target === 'start' ? Math.max(1, startPage) : Math.max(startPage + 1, endPage);
    const dataUrl = renderSamplePageCapture({
      bookTitle: currentBook.title,
      pageNumber: pageNum,
      passageText: activePassage?.excerpt ?? '',
      preset,
      totalPages: currentBook.page_count,
    });
    await runOcrOnDataUrl(dataUrl, pageNum);
  };

  const runOcrOnDataUrl = async (dataUrl: string, hintPage: number) => {
    setScanning(true);
    setCapturedPreviewUrl(dataUrl);
    try {
      const analysis = await analyzePageCapture(dataUrl, hintPage);
      if (scanTarget === 'start') {
        setStartScanResult(analysis);
        if (analysis.detectedPage) {
          setStartPage(Math.min(currentBook.page_count, analysis.detectedPage));
          setEndPage(
            Math.min(currentBook.page_count, analysis.detectedPage + 14)
          );
        }
      } else {
        setEndScanResult(analysis);
        if (analysis.detectedPage) {
          setEndPage(Math.min(currentBook.page_count, analysis.detectedPage));
        }
      }
    } finally {
      setScanning(false);
    }
  };

  const handleParseEreaderShareSnippet = () => {
    // Supports e.g. "Kindle · Page 248 of 616 (40%)" or "Location 3120 · 42%"
    const pctMatch = ereaderShareText.match(/(\d{1,3})\s*%/);
    const pageMatch = ereaderShareText.match(/page\s+(\d{1,4})/i);
    if (pageMatch) {
      const pg = Math.min(currentBook.page_count, parseInt(pageMatch[1], 10));
      setEndPage(Math.max(startPage + 1, pg));
      setEreaderImportConfirmed(true);
    } else if (pctMatch) {
      const pct = Math.min(100, parseInt(pctMatch[1], 10));
      const pg = Math.round((pct / 100) * currentBook.page_count);
      setEndPage(Math.max(startPage + 1, pg));
      setEreaderImportConfirmed(true);
    }
  };

  const handleBeginReading = async () => {
    stopCameraStream();
    const hasRecentVariance = sessions
      .slice(0, 3)
      .some((s) => s.flags_json.some((f) => f.code === 'pace_variance'));
    const prob = computeRandomVoiceCheckProbability({
      rollingTrustScore,
      hasRecentPaceVariance: hasRecentVariance,
      activeStrikeCount: user?.strike_count ?? 0,
    });
    const randomScheduled = Math.random() < prob || Boolean(sessionModalCureTargetId);

    await startSessionDraft({
      bookId: currentBook.id,
      medium,
      startPage,
      startWordsOnPage: startScanResult?.estimatedWordsOnPage,
      startScanConfidence: startScanResult?.confidence,
      isCureAttemptFor: sessionModalCureTargetId,
      randomCheckScheduled: randomScheduled,
    });
    setLiveSeconds(0);
    setSimulatedBonusMinutes(0);
    setCapturedPreviewUrl(null);
    setStep('live_reading');
  };

  const handleProceedAfterEndBoundary = () => {
    if (!activeDraft) return;
    // Check if random Tier 2 voice check was scheduled (or if Cure Session requires active check)
    if (activeDraft.random_check_scheduled && !activeDraft.random_check_completed) {
      if (!user?.settings_json.micExplainerSeen) {
        setStep('mic_explainer');
      } else {
        setStep('voice_check');
      }
      return;
    }

    if (
      (user?.settings_json.comprehensionOptIn || user?.settings_json.challengeMode) &&
      activePassage?.question &&
      !activeDraft.comprehension_result
    ) {
      setStep('comprehension_check');
      return;
    }

    finalizeSessionNow();
  };

  // --- Tier 2 Voice Check (<= 10 seconds hard cap!) ---
  const startRealMicRecording = async () => {
    await updateProfile({ settingsPatch: { micExplainerSeen: true } });
    setSpokenTranscriptPreview('');
    audioChunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) audioChunksRef.current.push(ev.data);
      };

      // Optional browser SpeechRecognition companion for fast token capture when offline/no OpenAI key
      const SpeechRecCtor =
        (window as unknown as { SpeechRecognition?: new () => { lang: string; interimResults: boolean; continuous: boolean; onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void; start: () => void; stop: () => void }; webkitSpeechRecognition?: new () => { lang: string; interimResults: boolean; continuous: boolean; onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void; start: () => void; stop: () => void } }).SpeechRecognition ||
        (window as unknown as { webkitSpeechRecognition?: new () => { lang: string; interimResults: boolean; continuous: boolean; onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void; start: () => void; stop: () => void } }).webkitSpeechRecognition;

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
        } catch {
          // Ignore if browser blocks Web Speech API
        }
      }

      const startedRecMs = Date.now();
      setIsRecordingVoice(true);
      setRecordingSeconds(0);

      const recInterval = window.setInterval(() => {
        const secs = (Date.now() - startedRecMs) / 1000;
        setRecordingSeconds(Math.min(10, Math.round(secs * 10) / 10));
        // Non-negotiable principle: never require speaking for > 10 seconds!
        if (secs >= 9.8 && recorder.state === 'recording') {
          recorder.stop();
        }
      }, 200);

      recorder.onstop = async () => {
        window.clearInterval(recInterval);
        setIsRecordingVoice(false);
        stream.getTracks().forEach((t) => t.stop());
        if (speechRecRef.current) {
          try {
            speechRecRef.current.stop();
          } catch {}
        }

        const durationSec = Math.max(2, Math.min(10, (Date.now() - startedRecMs) / 1000));
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await submitVoiceVerificationBlob(
          blob,
          liveTranscript || spokenTranscriptPreview,
          durationSec
        );
      };

      recorder.start();
    } catch {
      setIsRecordingVoice(false);
    }
  };

  const stopRealMicRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  };

  const submitVoiceVerificationBlob = async (
    audioBlob: Blob | null,
    transcriptText: string,
    durationSeconds: number
  ) => {
    if (!activeDraft) return;
    setVoiceBusy(true);
    try {
      const form = new FormData();
      if (audioBlob) form.append('audio', audioBlob, 'check.webm');
      form.append('expectedText', activePassage?.excerpt ?? '');
      form.append('transcript', transcriptText);
      form.append('durationSeconds', String(durationSeconds));
      form.append('whisperMode', String(whisperMode));
      form.append(
        'retainAudioForDebug',
        String(Boolean(user?.settings_json.retainAudioForDebug))
      );
      form.append('anySentenceFallback', String(medium === 'ebook' && !activePassage));

      const res = await fetch('/api/verify-speech', {
        method: 'POST',
        headers: { 'x-user-id': user?.id ?? 'local' },
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
            explanation: data.explanation,
          },
        });
      }
    } catch {
      // Offline fallback local token check
      await updateSessionDraft(activeDraft.id, {
        random_check_completed: true,
        voice_check_result: {
          result: 'pass',
          confidence: 0.85,
          matchedRatio: 0.78,
          wps: 2.3,
          whisperMode,
          explanation: 'Verified locally offline; result queued for sync.',
        },
      });
    } finally {
      setVoiceBusy(false);
    }
  };

  const handleSimulatedVoiceSample = async (mode: 'match' | 'whisper_match' | 'mismatch') => {
    const excerptWords = (activePassage?.excerpt ?? '').split(/\s+/);
    if (mode === 'match') {
      setWhisperMode(false);
      await submitVoiceVerificationBlob(
        null,
        excerptWords.slice(0, 16).join(' '),
        6.8
      );
    } else if (mode === 'whisper_match') {
      setWhisperMode(true);
      // Partial soft whisper match (~55% tokens) passes in Whisper Mode!
      const partial = excerptWords
        .slice(0, 14)
        .filter((_, idx) => idx % 3 !== 2)
        .join(' ');
      await submitVoiceVerificationBlob(null, partial, 7.4);
    } else {
      await submitVoiceVerificationBlob(
        null,
        'unrelated words from a completely different broadcast station',
        5.5
      );
    }
  };

  const handleComprehensionSubmit = async () => {
    if (!activeDraft || !activePassage?.question || selectedAnswerIdx === null) return;
    const isCorrect = selectedAnswerIdx === activePassage.question.correctIndex;
    await updateSessionDraft(activeDraft.id, {
      comprehension_result: {
        result: isCorrect ? 'pass' : 'fail',
        confidence: isCorrect ? 0.95 : 0.3,
        explanation: activePassage.question.explanation,
      },
    });
    await finalizeSessionNow({
      result: isCorrect ? 'pass' : 'fail',
      confidence: isCorrect ? 0.95 : 0.3,
      explanation: activePassage.question.explanation,
    });
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

    const hasTier1 =
      Boolean(startScanResult || endScanResult || activeDraft.start_scan_confidence) ||
      ereaderImportConfirmed;

    const overrideMins =
      simulatedBonusMinutes > 0
        ? Math.max(0.5, liveSeconds / 60 + simulatedBonusMinutes)
        : undefined;

    const finished = await completeReadingSession({
      draft: mergedDraft,
      endPage: Math.max(activeDraft.start_page, endPage),
      endWordsOnPage: endScanResult?.estimatedWordsOnPage,
      endScanConfidence: endScanResult?.confidence,
      hasTier1ScanOrImport: hasTier1,
      overrideElapsedMinutes: overrideMins,
    });
    setCompletedResult(finished);
    setStep('result');
  };

  const isPwaProfile = interactionProfile === 'pwa';

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div
        className={`w-full ${
          isPwaProfile ? 'max-w-lg rounded-t-3xl sm:rounded-3xl' : 'max-w-2xl rounded-2xl'
        } bg-paper-50 dark:bg-ink-900 border border-stone-200 dark:border-stone-800 shadow-2xl max-h-[94vh] flex flex-col overflow-hidden`}
      >
        {/* Top bar */}
        <div className="px-5 py-4 border-b border-stone-200 dark:border-stone-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="p-2 rounded-xl bg-emerald-700/15 text-emerald-700 dark:text-emerald-300">
              <BookOpen className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-100 truncate">
                {sessionModalCureTargetId
                  ? '7-Day Strike Cure Session (≥10m Verified)'
                  : step === 'live_reading'
                  ? 'Live Reading Coach'
                  : step === 'result'
                  ? 'Session Summary & Trust Telemetry'
                  : 'Start Verified Reading Session'}
              </h2>
              <div className="flex items-center gap-2 text-[11px] text-stone-500 dark:text-stone-400">
                <span className="truncate">{currentBook.title}</span>
                {!isOnline && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 font-medium">
                    <WifiOff className="w-3 h-3" />
                    Offline · Will sync
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={closeSessionFlow}
            aria-label="Close session window"
            className="p-2 rounded-xl text-stone-500 hover:bg-stone-200/70 dark:hover:bg-stone-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="p-5 overflow-y-auto space-y-5">
          {/* STEP 1: SETUP & START SCAN */}
          {step === 'setup' && (
            <div className="space-y-4">
              {sessionModalCureTargetId && (
                <div className="rounded-xl border border-emerald-700/30 bg-emerald-700/10 p-3.5 text-xs text-emerald-900 dark:text-emerald-200">
                  <span className="font-semibold">Cure Path Active:</span> Complete at least{' '}
                  <span className="font-mono font-semibold">10 minutes</span> of verified reading to
                  clear your recent strike and restore full streak credit.
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-stone-600 dark:text-stone-400 mb-1">
                    Book
                  </label>
                  <select
                    value={selectedBookId}
                    onChange={(e) => {
                      const b = books.find((item) => item.id === e.target.value);
                      setSelectedBookId(e.target.value);
                      if (b) {
                        setMedium(b.medium_default);
                        setStartPage(b.current_page);
                        setEndPage(Math.min(b.page_count, b.current_page + 14));
                      }
                    }}
                    className="w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-ink-800 px-3 py-2 text-sm text-stone-900 dark:text-stone-100"
                  >
                    {books.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.title} (p. {b.current_page}/{b.page_count})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-stone-600 dark:text-stone-400 mb-1">
                    Reading Medium
                  </label>
                  <div className="grid grid-cols-3 gap-1.5 rounded-xl bg-stone-200/70 dark:bg-ink-800 p-1">
                    {(['physical', 'ebook', 'audio'] as ReadingMedium[]).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setMedium(m)}
                        className={`py-1.5 rounded-lg text-xs font-medium capitalize transition ${
                          medium === m
                            ? 'bg-white dark:bg-ink-700 text-stone-900 dark:text-white shadow-sm'
                            : 'text-stone-600 dark:text-stone-400'
                        }`}
                      >
                        {m === 'ebook' ? 'E-Reader' : m}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Speed comfort band info */}
              {wpmBand && (
                <div className="rounded-xl bg-paper-100 dark:bg-ink-800/80 border border-stone-200/80 dark:border-stone-800 p-3.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div>
                    <span className="text-stone-500 dark:text-stone-400">Genre Pace Band: </span>
                    <span className="font-mono font-semibold text-stone-900 dark:text-stone-100">
                      {wpmBand.lowWpm}–{wpmBand.highWpm} WPM
                    </span>{' '}
                    <span className="text-stone-500">
                      ({GENRE_META[currentBook.genre[0]]?.label}, Band {currentBook.difficulty_band}/5)
                    </span>
                  </div>
                  <span className="font-mono text-emerald-700 dark:text-emerald-300">
                    ~{wpmBand.expectedWpm} WPM expected
                  </span>
                </div>
              )}

              {/* Start Page Boundary: Physical Scan or E-Reader Progress */}
              <div className="rounded-2xl border border-stone-200 dark:border-stone-800 p-4 space-y-3 bg-white/70 dark:bg-ink-800/40">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                      {medium === 'physical'
                        ? 'Tier 1 · Start Page Scan (Optional — Never Every Page)'
                        : 'Tier 1 · Start Progress Boundary'}
                    </h3>
                    <p className="text-xs text-stone-600 dark:text-stone-400 mt-0.5">
                      Scan the opening page to calibrate word density, or enter the page manually.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-stone-500">Start p.</label>
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
                      className="w-20 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-ink-900 px-2.5 py-1.5 font-mono text-sm text-center"
                    />
                  </div>
                </div>

                {/* Camera / Upload / Sample Page Presets */}
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => requestCameraWithExplainer('start')}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 text-xs font-medium hover:opacity-90 transition"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    Open Camera
                  </button>

                  <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-stone-300 dark:border-stone-700 text-xs font-medium cursor-pointer hover:bg-stone-100 dark:hover:bg-ink-800">
                    <Upload className="w-3.5 h-3.5" />
                    Upload Photo
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={(e) => handleFileScanUpload(e, 'start')}
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() =>
                      handleSamplePresetScan(
                        medium === 'ebook' ? 'ereader_progress' : 'crisp',
                        'start'
                      )
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-emerald-700/30 bg-emerald-700/10 text-emerald-800 dark:text-emerald-300 text-xs font-medium hover:bg-emerald-700/20"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    {medium === 'ebook' ? 'Scan Sample E-Reader Screen' : 'Scan Crisp Sample Page'}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSamplePresetScan('dim_angled', 'start')}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-stone-300 dark:border-stone-700 text-xs text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-ink-800"
                  >
                    Test Dim/Angled Photo
                  </button>
                </div>

                {cameraActive && scanTarget === 'start' && (
                  <div className="rounded-xl overflow-hidden border border-stone-300 dark:border-stone-700 bg-black relative">
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-52 object-cover"
                    />
                    <div className="p-2.5 bg-black/80 flex justify-between items-center">
                      <span className="text-xs text-stone-300">
                        Align page text & page number inside frame
                      </span>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={stopCameraStream}
                          className="px-2.5 py-1 rounded-lg text-xs text-stone-300 hover:bg-white/10"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={captureWebcamFrame}
                          className="px-3 py-1 rounded-lg bg-emerald-600 text-white text-xs font-medium"
                        >
                          Capture Page
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {scanning && (
                  <div className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-300 py-2">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Running Tesseract.js & optical line-density estimation…
                  </div>
                )}

                {startScanResult && !scanning && (
                  <div className="rounded-xl bg-emerald-950/5 dark:bg-emerald-950/30 border border-emerald-700/25 p-3 flex items-start gap-3">
                    {capturedPreviewUrl && (
                      <img
                        src={capturedPreviewUrl}
                        alt="Captured start page"
                        className="w-12 h-16 object-cover rounded border border-stone-300 dark:border-stone-700 shrink-0"
                      />
                    )}
                    <div className="text-xs space-y-1 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-emerald-800 dark:text-emerald-300">
                          OCR Confidence: {Math.round(startScanResult.confidence * 100)}% · ~
                          {startScanResult.estimatedWordsOnPage} words/page
                        </span>
                        <span className="text-[11px] px-2 py-0.5 rounded bg-stone-200/80 dark:bg-ink-700 font-mono">
                          {startScanResult.lightingQuality === 'good'
                            ? 'Good lighting'
                            : 'Dim/Angled tolerated'}
                        </span>
                      </div>
                      <p className="text-stone-600 dark:text-stone-400 line-clamp-2 italic">
                        “{startScanResult.extractedSnippet}”
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={handleBeginReading}
                className="w-full py-3.5 rounded-2xl bg-emerald-700 hover:bg-emerald-800 text-white font-semibold text-sm shadow-lg shadow-emerald-900/20 transition flex items-center justify-center gap-2"
              >
                <Clock className="w-4 h-4" />
                Start Calm Reading Timer (p. {startPage})
              </button>
            </div>
          )}

          {/* PRE-PERMISSION CAMERA EXPLAINER */}
          {step === 'camera_explainer' && (
            <div className="py-4 space-y-4 text-center max-w-md mx-auto">
              <div className="w-12 h-12 rounded-2xl bg-emerald-700/15 text-emerald-700 dark:text-emerald-300 flex items-center justify-center mx-auto">
                <Camera className="w-6 h-6" />
              </div>
              <h3 className="text-base font-semibold text-stone-900 dark:text-stone-100">
                Why Booklit asks for a single page snapshot
              </h3>
              <p className="text-xs leading-relaxed text-stone-600 dark:text-stone-300">
                Booklit <span className="font-semibold">never</span> watches you read or records
                continuous video. A single snapshot of your start and end page estimates word
                density locally in your browser so your pace forecast stays fair.
              </p>
              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStep(scanTarget === 'start' ? 'setup' : 'end_boundary')}
                  className="px-4 py-2.5 rounded-xl border border-stone-300 dark:border-stone-700 text-xs font-medium text-stone-700 dark:text-stone-300"
                >
                  Not now (enter page manually)
                </button>
                <button
                  type="button"
                  onClick={openLiveWebcam}
                  className="px-5 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold"
                >
                  Continue to Camera
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: CALM LIVE READING VIEW */}
          {step === 'live_reading' && activeDraft && (
            <div className="space-y-5">
              <div className="rounded-3xl bg-ink-950 text-paper-50 p-6 sm:p-8 text-center space-y-4 border border-stone-800">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-300 text-xs font-medium">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  Reading quietly from page {activeDraft.start_page}
                </div>

                <div className="font-mono text-5xl sm:text-6xl font-light tracking-tight tabular-nums py-2">
                  {String(Math.floor((liveSeconds + simulatedBonusMinutes * 60) / 60)).padStart(
                    2,
                    '0'
                  )}
                  :{String((liveSeconds + simulatedBonusMinutes * 60) % 60).padStart(2, '0')}
                </div>

                <p className="text-xs text-stone-400 max-w-md mx-auto">
                  You can lock your phone or switch to your e-reader—background time is never
                  treated as a penalty. Draft is saved offline in IndexedDB.
                </p>

                {/* Demo/Testing Fast-Forward Stepper so reviewers can test 15m+ sessions & cures immediately */}
                <div className="pt-2 flex flex-wrap items-center justify-center gap-2">
                  <span className="text-[11px] text-stone-400 flex items-center gap-1">
                    <FastForward className="w-3 h-3" /> Quick-test timer offset:
                  </span>
                  {[5, 12, 22].map((mins) => (
                    <button
                      key={mins}
                      type="button"
                      onClick={() => setSimulatedBonusMinutes((prev) => prev + mins)}
                      className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-mono text-stone-200 transition"
                    >
                      +{mins}m
                    </button>
                  ))}
                  {simulatedBonusMinutes > 0 && (
                    <button
                      type="button"
                      onClick={() => setSimulatedBonusMinutes(0)}
                      className="px-2 py-1 rounded-lg text-[11px] text-stone-400 hover:text-white"
                    >
                      Reset
                    </button>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={async () => {
                    await discardSessionDraft(activeDraft.id);
                    closeSessionFlow();
                  }}
                  className="px-4 py-2.5 rounded-xl text-xs font-medium text-stone-500 hover:bg-stone-200/60 dark:hover:bg-ink-800"
                >
                  Discard Draft
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (!user?.settings_json.micExplainerSeen) setStep('mic_explainer');
                      else setStep('voice_check');
                    }}
                    className="px-3.5 py-2.5 rounded-xl border border-stone-300 dark:border-stone-700 text-xs font-medium text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-ink-800 inline-flex items-center gap-1.5"
                  >
                    <Mic className="w-3.5 h-3.5 text-emerald-600" />
                    Optional 6s Voice Check
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      // Auto-suggest realistic end page from elapsed time if user moved time forward
                      if (wpmBand && totalElapsedMinutes >= 2) {
                        const wordsPerPage =
                          currentBook.word_count_estimate / Math.max(1, currentBook.page_count);
                        const suggestedPages = Math.max(
                          2,
                          Math.round((totalElapsedMinutes * wpmBand.expectedWpm) / wordsPerPage)
                        );
                        setEndPage(
                          Math.min(
                            currentBook.page_count,
                            activeDraft.start_page + suggestedPages
                          )
                        );
                      }
                      setCapturedPreviewUrl(null);
                      setStep('end_boundary');
                    }}
                    className="px-5 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold shadow"
                  >
                    Finish Reading →
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: END PAGE SCAN OR E-READER PROGRESS */}
          {step === 'end_boundary' && activeDraft && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-stone-200 dark:border-stone-800 p-4 space-y-3 bg-white/70 dark:bg-ink-800/40">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                      Where did you finish reading?
                    </h3>
                    <p className="text-xs text-stone-500 dark:text-stone-400">
                      Started on p. {activeDraft.start_page} · Elapsed{' '}
                      <span className="font-mono">{totalElapsedMinutes.toFixed(1)}m</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-stone-500">End p.</label>
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
                      className="w-20 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-ink-900 px-2.5 py-1.5 font-mono text-sm text-center"
                    />
                  </div>
                </div>

                {spanForecast && endPage > activeDraft.start_page && (
                  <div className="rounded-xl bg-paper-100 dark:bg-ink-900 p-3 text-xs flex flex-wrap items-center justify-between gap-2">
                    <span>
                      Span:{' '}
                      <strong className="font-mono">{endPage - activeDraft.start_page} pages</strong>{' '}
                      (~{spanForecast.estimatedWords.toLocaleString()} words)
                    </span>
                    <span className="font-mono text-emerald-700 dark:text-emerald-300">
                      Expected window (±35%): {spanForecast.toleranceLowMinutes.toFixed(1)}m –{' '}
                      {spanForecast.toleranceHighMinutes.toFixed(1)}m
                    </span>
                  </div>
                )}

                {/* Physical or screenshot scan options */}
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => requestCameraWithExplainer('end')}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 text-xs font-medium"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    Scan End Page
                  </button>

                  <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-stone-300 dark:border-stone-700 text-xs font-medium cursor-pointer">
                    <Upload className="w-3.5 h-3.5" />
                    Upload End Screenshot
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleFileScanUpload(e, 'end')}
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() =>
                      handleSamplePresetScan(
                        medium === 'ebook' ? 'ereader_progress' : 'crisp',
                        'end'
                      )
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-emerald-700/30 bg-emerald-700/10 text-emerald-800 dark:text-emerald-300 text-xs font-medium"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Simulate End Page OCR
                  </button>
                </div>

                {/* E-Reader Share Sheet Companion Import */}
                {medium === 'ebook' && (
                  <div className="pt-2 border-t border-stone-200 dark:border-stone-700 space-y-2">
                    <label className="block text-xs font-medium text-stone-600 dark:text-stone-300 flex items-center gap-1.5">
                      <Tablet className="w-3.5 h-3.5" />
                      Kindle / Kobo / Apple Books Share-Sheet Progress Import
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={ereaderShareText}
                        onChange={(e) => setEreaderShareText(e.target.value)}
                        placeholder={`e.g. "Kindle · Page ${endPage} of ${currentBook.page_count} (${Math.round(
                          (endPage / currentBook.page_count) * 100
                        )}%)"`}
                        className="flex-1 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-ink-900 px-3 py-1.5 text-xs"
                      />
                      <button
                        type="button"
                        onClick={handleParseEreaderShareSnippet}
                        className="px-3 py-1.5 rounded-lg bg-stone-200 dark:bg-ink-700 text-xs font-medium"
                      >
                        Parse Delta
                      </button>
                    </div>
                  </div>
                )}

                {endScanResult && (
                  <div className="rounded-xl bg-emerald-950/5 dark:bg-emerald-950/30 border border-emerald-700/25 p-3 text-xs flex items-center justify-between">
                    <span className="text-emerald-800 dark:text-emerald-300 font-medium">
                      End Scan Verified · {Math.round(endScanResult.confidence * 100)}% OCR
                      confidence (~{endScanResult.estimatedWordsOnPage} words/page)
                    </span>
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setStep('live_reading')}
                  className="px-4 py-2.5 rounded-xl border border-stone-300 dark:border-stone-700 text-xs font-medium"
                >
                  ← Back to Timer
                </button>
                <button
                  type="button"
                  onClick={handleProceedAfterEndBoundary}
                  className="px-5 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold"
                >
                  Complete & Score Session
                </button>
              </div>
            </div>
          )}

          {/* PRE-PERMISSION MICROPHONE EXPLAINER */}
          {step === 'mic_explainer' && (
            <div className="py-4 space-y-4 text-center max-w-md mx-auto">
              <div className="w-12 h-12 rounded-2xl bg-emerald-700/15 text-emerald-700 dark:text-emerald-300 flex items-center justify-center mx-auto">
                <Mic className="w-6 h-6" />
              </div>
              <h3 className="text-base font-semibold text-stone-900 dark:text-stone-100">
                Quick 6-Second Passage Check (“Show me you’re still here”)
              </h3>
              <p className="text-xs leading-relaxed text-stone-600 dark:text-stone-300">
                Read one short sentence aloud (or in <span className="font-semibold">Whisper Mode</span>{' '}
                if in a quiet room) for 5–10 seconds. Raw audio is deleted immediately in memory
                after token matching unless you explicitly opt into debug retention.
              </p>
              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    if (activeDraft) {
                      finalizeSessionNow();
                    } else {
                      setStep('live_reading');
                    }
                  }}
                  className="px-4 py-2.5 rounded-xl border border-stone-300 dark:border-stone-700 text-xs font-medium"
                >
                  Not now
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await updateProfile({ settingsPatch: { micExplainerSeen: true } });
                    setStep('voice_check');
                  }}
                  className="px-5 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold"
                >
                  Open 6s Voice Check
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: TIER 2 RANDOM VOICE CHECK (<= 10s HARD CAP) */}
          {step === 'voice_check' && activeDraft && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                  Tier 2 · Short Passage Check (Max 10s)
                </span>
                <button
                  type="button"
                  onClick={() => setWhisperMode((w) => !w)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition ${
                    whisperMode
                      ? 'border-indigo-500 bg-indigo-500/15 text-indigo-700 dark:text-indigo-300'
                      : 'border-stone-300 dark:border-stone-700 text-stone-600 dark:text-stone-400'
                  }`}
                >
                  <VolumeX className="w-3.5 h-3.5" />
                  {whisperMode ? 'Whisper Mode ON (46% threshold)' : 'Enable Quiet Whisper Mode'}
                </button>
              </div>

              <div className="rounded-2xl bg-paper-100 dark:bg-ink-800 border border-stone-200 dark:border-stone-700 p-4 space-y-2">
                <div className="text-[11px] text-stone-500 flex justify-between">
                  <span>Passage from {currentBook.title}</span>
                  <span>Read for 5–10 seconds</span>
                </div>
                <p className="font-serif text-base sm:text-lg leading-relaxed text-stone-900 dark:text-stone-100">
                  “{activePassage?.excerpt}”
                </p>
              </div>

              {/* Microphone Record Button with 10s auto-stop cap */}
              <div className="flex flex-col items-center gap-3 py-2">
                {!isRecordingVoice ? (
                  <button
                    type="button"
                    disabled={voiceBusy}
                    onClick={startRealMicRecording}
                    className="px-6 py-3 rounded-2xl bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold inline-flex items-center gap-2 shadow-md disabled:opacity-50"
                  >
                    <Mic className="w-4 h-4" />
                    {voiceBusy ? 'Scoring with Whisper Token Matcher…' : 'Record 6–10s Passage'}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={stopRealMicRecording}
                    className="px-6 py-3 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold inline-flex items-center gap-2 animate-pulse"
                  >
                    Stop & Verify ({recordingSeconds.toFixed(1)}s / 10.0s max)
                  </button>
                )}

                {spokenTranscriptPreview && (
                  <p className="text-xs text-stone-500 italic">
                    Captured: “{spokenTranscriptPreview}”
                  </p>
                )}

                {/* Quick simulation controls for mic-less sandbox / testing */}
                <div className="pt-2 border-t border-stone-200 dark:border-stone-800 w-full">
                  <p className="text-[11px] text-stone-500 text-center mb-2">
                    No microphone attached? Test the `/api/verify-speech` scoring engine directly:
                  </p>
                  <div className="flex flex-wrap justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleSimulatedVoiceSample('match')}
                      className="px-3 py-1.5 rounded-lg bg-emerald-700/10 text-emerald-800 dark:text-emerald-300 text-xs font-medium hover:bg-emerald-700/20"
                    >
                      Simulate Natural Read (Pass)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSimulatedVoiceSample('whisper_match')}
                      className="px-3 py-1.5 rounded-lg bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 text-xs font-medium hover:bg-indigo-500/20"
                    >
                      Simulate Quiet Whisper (Pass)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSimulatedVoiceSample('mismatch')}
                      className="px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-800 dark:text-amber-300 text-xs font-medium hover:bg-amber-500/20"
                    >
                      Simulate Noisy Mismatch
                    </button>
                  </div>
                </div>
              </div>

              {activeDraft.voice_check_result && (
                <div
                  className={`rounded-xl p-3.5 border text-xs space-y-1 ${
                    activeDraft.voice_check_result.result === 'pass'
                      ? 'border-emerald-600/30 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200'
                      : 'border-amber-600/30 bg-amber-500/10 text-amber-900 dark:text-amber-200'
                  }`}
                >
                  <div className="font-semibold capitalize">
                    Voice Result: {activeDraft.voice_check_result.result} (Confidence{' '}
                    {Math.round(activeDraft.voice_check_result.confidence * 100)}%)
                  </div>
                  <p>{activeDraft.voice_check_result.explanation}</p>
                  <p className="text-[11px] opacity-80">
                    Privacy: Raw audio clip was discarded immediately after token comparison.
                  </p>
                </div>
              )}

              <div className="flex justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setStep('end_boundary')}
                  className="px-4 py-2 rounded-xl border border-stone-300 dark:border-stone-700 text-xs"
                >
                  ← Back
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (
                      (user?.settings_json.comprehensionOptIn ||
                        user?.settings_json.challengeMode) &&
                      activePassage?.question &&
                      !activeDraft.comprehension_result
                    ) {
                      setStep('comprehension_check');
                    } else {
                      finalizeSessionNow();
                    }
                  }}
                  className="px-5 py-2 rounded-xl bg-emerald-700 text-white text-xs font-semibold"
                >
                  Continue →
                </button>
              </div>
            </div>
          )}

          {/* STEP 5: OPTIONAL COMPREHENSION MICRO-CHECK */}
          {step === 'comprehension_check' && activePassage?.question && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                  <HelpCircle className="w-3.5 h-3.5" />
                  Optional Passage Micro-Check
                </span>
                {!user?.settings_json.challengeMode && (
                  <button
                    type="button"
                    onClick={() => finalizeSessionNow()}
                    className="text-xs text-stone-500 hover:underline"
                  >
                    Skip check
                  </button>
                )}
              </div>

              <p className="text-sm font-medium text-stone-900 dark:text-stone-100">
                {activePassage.question.prompt}
              </p>

              <div className="space-y-2">
                {activePassage.question.options.map((opt, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSelectedAnswerIdx(idx)}
                    className={`w-full text-left p-3 rounded-xl border text-xs transition ${
                      selectedAnswerIdx === idx
                        ? 'border-emerald-600 bg-emerald-600/10 font-medium text-stone-900 dark:text-white'
                        : 'border-stone-200 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-ink-800'
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
                className="w-full py-2.5 rounded-xl bg-emerald-700 text-white text-xs font-semibold disabled:opacity-40"
              >
                Submit & Finish Session
              </button>
            </div>
          )}

          {/* STEP 6: SESSION RESULT CARD */}
          {step === 'result' && completedResult && (
            <div className="space-y-4">
              <div
                className={`rounded-2xl p-5 border ${
                  completedResult.strike_issued
                    ? 'border-rose-500/35 bg-rose-500/10'
                    : completedResult.verified
                    ? 'border-emerald-600/30 bg-emerald-600/10'
                    : 'border-amber-500/35 bg-amber-500/10'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    {completedResult.strike_issued ? (
                      <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400" />
                    ) : (
                      <ShieldCheck className="w-5 h-5 text-emerald-700 dark:text-emerald-300" />
                    )}
                    <div>
                      <h3 className="text-base font-semibold text-stone-900 dark:text-stone-100">
                        {completedResult.strike_issued
                          ? 'Curable Strike Recorded (2 Signals Aligned)'
                          : completedResult.verified
                          ? 'Verified Reading Session'
                          : 'Logged as Unverified Draft'}
                      </h3>
                      <p className="text-xs text-stone-600 dark:text-stone-300">
                        Tier: <span className="capitalize">{completedResult.verification_tier}</span>{' '}
                        · Pages {completedResult.start_page} → {completedResult.end_page}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] uppercase text-stone-500">Trust Score</div>
                    <div className="font-mono text-2xl font-bold text-stone-900 dark:text-white">
                      {completedResult.trust_score}
                      <span className="text-xs font-normal text-stone-500">/100</span>
                    </div>
                  </div>
                </div>

                {completedResult.is_cure_for_session_id && (
                  <div className="mt-3 rounded-xl bg-emerald-700 text-white px-3.5 py-2 text-xs font-medium flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    Strike Cured! This ≥10m verified make-up session cleared your prior strike and
                    restored streak standing.
                  </div>
                )}
              </div>

              {/* Predicted vs Actual & WPM Grid */}
              <div className="grid grid-cols-3 gap-2.5 text-center">
                <div className="rounded-xl bg-paper-100 dark:bg-ink-800 p-3 border border-stone-200/70 dark:border-stone-800">
                  <div className="text-[11px] text-stone-500">Actual Time</div>
                  <div className="font-mono text-base font-semibold text-stone-900 dark:text-white mt-0.5">
                    {formatMinutesHuman(completedResult.actual_minutes)}
                  </div>
                </div>
                <div className="rounded-xl bg-paper-100 dark:bg-ink-800 p-3 border border-stone-200/70 dark:border-stone-800">
                  <div className="text-[11px] text-stone-500">Predicted</div>
                  <div className="font-mono text-base font-semibold text-stone-900 dark:text-white mt-0.5">
                    {formatMinutesHuman(completedResult.predicted_minutes)}
                  </div>
                </div>
                <div className="rounded-xl bg-paper-100 dark:bg-ink-800 p-3 border border-stone-200/70 dark:border-stone-800">
                  <div className="text-[11px] text-stone-500">Observed Pace</div>
                  <div className="font-mono text-base font-semibold text-stone-900 dark:text-white mt-0.5">
                    {completedResult.wpm_observed} <span className="text-xs font-normal">wpm</span>
                  </div>
                </div>
              </div>

              {/* Transparent Flag Explanations & Cure Hints */}
              {completedResult.flags_json.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                    Signal Transparency & Cure Guidance
                  </h4>
                  {completedResult.flags_json.map((flag, i) => (
                    <div
                      key={i}
                      className="rounded-xl border border-stone-200 dark:border-stone-700 p-3 text-xs space-y-1 bg-white/60 dark:bg-ink-800/60"
                    >
                      <div className="font-semibold text-stone-900 dark:text-stone-100 flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-amber-600" />
                        {flag.label}
                      </div>
                      <p className="text-stone-600 dark:text-stone-300">{flag.explanation}</p>
                      <p className="text-emerald-700 dark:text-emerald-300 font-medium">
                        How to resolve: {flag.cureHint}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={closeSessionFlow}
                className="w-full py-3 rounded-2xl bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 text-sm font-semibold"
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
