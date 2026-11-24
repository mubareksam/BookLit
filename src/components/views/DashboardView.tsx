'use client';

import React, { useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { format } from 'date-fns';
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Flame,
  Keyboard,
  MoreHorizontal,
  Plus,
  ShieldCheck,
  Sparkles,
  WifiOff,
} from 'lucide-react';
import { useBooklit } from '@/context/BooklitContext';
import { Book, GENRE_META } from '@/lib/types';
import { BookCoverArt } from '../BookCoverArt';
import { formatMinutesHuman, predictBookFinish } from '@/lib/domain/speedModel';

export function DashboardView() {
  const {
    user,
    books,
    sessions,
    tbrItems,
    dailyAggregates,
    activeDraft,
    interactionProfile,
    isOnline,
    pendingSyncCount,
    openSessionFlow,
    setSelectedBookId,
    setAddBookModalOpen,
    setActiveView,
    promoteTbrToReading,
    updateBook,
  } = useBooklit();

  const prefersReducedMotion = useReducedMotion();
  const [pwaSwipeIndex, setPwaSwipeIndex] = useState(0);
  const [quickActionBook, setQuickActionBook] = useState<Book | null>(null);
  const longPressTimerRef = useRef<number | null>(null);

  const currentReads = useMemo(
    () => books.filter((b) => b.status === 'reading'),
    [books]
  );

  const booksById = useMemo(() => new Map(books.map((b) => [b.id, b])), [books]);
  const verifiedSessions = useMemo(
    () => sessions.filter((s) => s.verified && !s.strike_issued),
    [sessions]
  );

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const todayAgg = useMemo(
    () => dailyAggregates.find((d) => d.date === todayStr),
    [dailyAggregates, todayStr]
  );

  const todayVerifiedMinutes = todayAgg?.verified_minutes ?? 0;
  const todayPages = todayAgg?.pages_read ?? 0;

  const activeCurableStrike = useMemo(
    () =>
      sessions.find(
        (s) =>
          s.strike_issued &&
          !s.cure_session_id &&
          Date.now() - new Date(s.ended_at).getTime() <= 7 * 24 * 60 * 60 * 1000
      ) ?? null,
    [sessions]
  );

  const rollingTrust = useMemo(() => {
    if (sessions.length === 0) return 90;
    const recent = sessions.slice(0, 6);
    return Math.round(recent.reduce((acc, s) => acc + s.trust_score, 0) / recent.length);
  }, [sessions]);

  if (!user) return null;

  const dailyTargetMinutes =
    user.reading_goal_type === 'minutes_day'
      ? user.reading_goal_target
      : user.reading_goal_type === 'pages_day'
      ? Math.round(user.reading_goal_target * 1.2)
      : 30;
  const goalPct = Math.min(100, Math.round((todayVerifiedMinutes / dailyTargetMinutes) * 100));

  // Long-press handlers for Touch/PWA profile
  const handleTouchStartBook = (b: Book) => {
    longPressTimerRef.current = window.setTimeout(() => {
      setQuickActionBook(b);
    }, 480);
  };
  const handleTouchEndBook = () => {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  // ============================================================================
  // PROFILE B: TOUCH-FIRST INSTALLED PWA HOME
  // ============================================================================
  if (interactionProfile === 'pwa') {
    const clampedIdx = Math.min(Math.max(0, pwaSwipeIndex), Math.max(0, currentReads.length - 1));
    const activeBook = currentReads[clampedIdx] ?? null;
    const activePrediction = activeBook
      ? predictBookFinish(activeBook, verifiedSessions, booksById)
      : null;

    return (
      <div className="space-y-5 pb-24 max-w-lg mx-auto">
        {/* Offline / Draft Sync Pill */}
        {(!isOnline || pendingSyncCount > 0 || activeDraft) && (
          <div className="flex flex-wrap items-center gap-2">
            {!isOnline && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-300 text-xs font-medium">
                <WifiOff className="w-3.5 h-3.5" />
                Offline · Sessions saved locally (will sync)
              </span>
            )}
            {pendingSyncCount > 0 && isOnline && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 text-xs font-medium">
                Syncing {pendingSyncCount} item(s)…
              </span>
            )}
            {activeDraft && (
              <button
                onClick={() => openSessionFlow(activeDraft.book_id)}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-700 text-white text-xs font-semibold"
              >
                Resume Active Timer →
              </button>
            )}
          </div>
        )}

        {/* Compact Streak & Today Ring */}
        <div className="rounded-3xl bg-ink-900 dark:bg-ink-950 text-paper-50 p-5 border border-stone-800 shadow-lg space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-stone-400">Today’s Verified Reading</p>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="font-mono text-3xl font-bold">
                  {Math.round(todayVerifiedMinutes)}m
                </span>
                <span className="text-xs text-stone-400">
                  / {dailyTargetMinutes}m goal ({todayPages} pages)
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-white/10">
              <Flame className="w-4 h-4 text-amber-400" />
              <span className="font-mono text-sm font-semibold">{user.streak_count}d</span>
            </div>
          </div>

          <div className="h-2 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all"
              style={{ width: `${goalPct}%` }}
            />
          </div>

          <button
            type="button"
            onClick={() => openSessionFlow(activeBook?.id)}
            className="w-full py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.99] text-white font-semibold text-base shadow-lg shadow-emerald-950/50 flex items-center justify-center gap-2.5 transition"
          >
            <Camera className="w-5 h-5" />
            {activeDraft ? 'Resume Live Reading Session' : 'Start Reading (Scan Page)'}
          </button>
        </div>

        {/* Curable Strike Coach Card */}
        {activeCurableStrike && (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-rose-700 dark:text-rose-300 flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4" />1 Curable Strike (7-Day Recovery Open)
              </span>
              <button
                onClick={() => openSessionFlow(activeCurableStrike.book_id, activeCurableStrike.id)}
                className="px-3 py-1.5 rounded-xl bg-emerald-700 text-white text-xs font-semibold"
              >
                Cure in 10m
              </button>
            </div>
            <p className="text-xs text-stone-600 dark:text-stone-300">
              Historical verified minutes were preserved. Complete any ≥10m verified session to
              clear this strike.
            </p>
          </div>
        )}

        {/* Swipeable Current Reads Deck (long-press for quick actions!) */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-stone-500">
              Swipe Current Reads · Hold Card for Quick Actions
            </h2>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={clampedIdx === 0}
                onClick={() => setPwaSwipeIndex((i) => Math.max(0, i - 1))}
                aria-label="Previous book"
                className="p-1 rounded-lg border border-stone-300 dark:border-stone-700 disabled:opacity-30"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="text-xs font-mono px-1">
                {currentReads.length === 0 ? '0/0' : `${clampedIdx + 1}/${currentReads.length}`}
              </span>
              <button
                type="button"
                disabled={clampedIdx >= currentReads.length - 1}
                onClick={() =>
                  setPwaSwipeIndex((i) => Math.min(currentReads.length - 1, i + 1))
                }
                aria-label="Next book"
                className="p-1 rounded-lg border border-stone-300 dark:border-stone-700 disabled:opacity-30"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {activeBook && activePrediction ? (
            <motion.div
              key={activeBook.id}
              drag={prefersReducedMotion ? false : 'x'}
              dragConstraints={{ left: 0, right: 0 }}
              onDragEnd={(_, info) => {
                if (info.offset.x < -55 && clampedIdx < currentReads.length - 1) {
                  setPwaSwipeIndex(clampedIdx + 1);
                } else if (info.offset.x > 55 && clampedIdx > 0) {
                  setPwaSwipeIndex(clampedIdx - 1);
                }
              }}
              onTouchStart={() => handleTouchStartBook(activeBook)}
              onTouchEnd={handleTouchEndBook}
              onContextMenu={(e) => {
                e.preventDefault();
                setQuickActionBook(activeBook);
              }}
              className="rounded-3xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-ink-900 p-4 shadow-sm space-y-3 select-none cursor-grab active:cursor-grabbing"
            >
              <div className="flex items-start gap-3.5">
                <BookCoverArt book={activeBook} size="md" />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <h3
                      onClick={() => setSelectedBookId(activeBook.id)}
                      className="font-serif font-bold text-base text-stone-900 dark:text-stone-100 leading-snug"
                    >
                      {activeBook.title}
                    </h3>
                    <button
                      type="button"
                      aria-label="Quick actions"
                      onClick={() => setQuickActionBook(activeBook)}
                      className="p-1.5 rounded-xl text-stone-500 hover:bg-stone-100 dark:hover:bg-ink-800"
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-xs text-stone-500">{activeBook.author}</p>
                  <div className="text-xs font-mono text-emerald-700 dark:text-emerald-300 pt-1">
                    Finish in ~{activePrediction.formattedExpected} ({activePrediction.formattedRange})
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-[11px] text-stone-500">
                  <span>
                    Page {activeBook.current_page} / {activeBook.page_count}
                  </span>
                  <span>
                    ~{activePrediction.wpmBand.expectedWpm} WPM ({activeBook.medium_default})
                  </span>
                </div>
                <div className="h-2 rounded-full bg-stone-200 dark:bg-ink-800 overflow-hidden">
                  <div
                    className="h-full bg-emerald-700 rounded-full"
                    style={{
                      width: `${Math.min(
                        100,
                        Math.round((activeBook.current_page / activeBook.page_count) * 100)
                      )}%`,
                    }}
                  />
                </div>
              </div>
            </motion.div>
          ) : (
            <button
              onClick={() => setAddBookModalOpen(true)}
              className="w-full py-8 rounded-3xl border border-dashed border-stone-300 dark:border-stone-700 text-xs font-medium text-stone-500"
            >
              + Add your first current read
            </button>
          )}
        </div>

        {/* Long-Press Quick Action Bottom Sheet */}
        {quickActionBook && (
          <div
            onClick={() => setQuickActionBook(null)}
            className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center p-3"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-3xl bg-paper-50 dark:bg-ink-900 border border-stone-200 dark:border-stone-800 p-4 space-y-2 shadow-2xl"
            >
              <div className="px-2 pb-2 border-b border-stone-200 dark:border-stone-800">
                <p className="text-xs text-stone-500">Quick Actions</p>
                <p className="font-serif font-semibold text-sm text-stone-900 dark:text-white">
                  {quickActionBook.title}
                </p>
              </div>
              <button
                onClick={() => {
                  const id = quickActionBook.id;
                  setQuickActionBook(null);
                  openSessionFlow(id);
                }}
                className="w-full text-left px-3.5 py-3 rounded-xl hover:bg-stone-200/60 dark:hover:bg-ink-800 text-sm font-medium"
              >
                Start Scanned Session
              </button>
              <button
                onClick={async () => {
                  await updateBook(quickActionBook.id, {
                    current_page: Math.min(
                      quickActionBook.page_count,
                      quickActionBook.current_page + 10
                    ),
                  });
                  setQuickActionBook(null);
                }}
                className="w-full text-left px-3.5 py-3 rounded-xl hover:bg-stone-200/60 dark:hover:bg-ink-800 text-sm font-medium"
              >
                Bookmark +10 Pages Offline
              </button>
              <button
                onClick={async () => {
                  await updateBook(quickActionBook.id, { status: 'tbr' });
                  setQuickActionBook(null);
                }}
                className="w-full text-left px-3.5 py-3 rounded-xl hover:bg-stone-200/60 dark:hover:bg-ink-800 text-sm font-medium"
              >
                Move to TBR Queue
              </button>
              <button
                onClick={() => {
                  const id = quickActionBook.id;
                  setQuickActionBook(null);
                  setSelectedBookId(id);
                }}
                className="w-full text-left px-3.5 py-3 rounded-xl hover:bg-stone-200/60 dark:hover:bg-ink-800 text-sm font-medium"
              >
                Open Finish Forecast & Details
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ============================================================================
  // PROFILE A: DESKTOP WEB DENSE COACH DASHBOARD
  // ============================================================================
  const pendingTbr = tbrItems.filter((t) => !t.completed_at).slice(0, 3);

  return (
    <div className="space-y-6">
      {/* Top Dense KPI Telemetry Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white/80 dark:bg-ink-900 p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-stone-500">
            <span>Today’s Verified Minutes</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-2xl font-bold text-stone-900 dark:text-white">
              {Math.round(todayVerifiedMinutes)}m
            </span>
            <span className="text-xs text-stone-500">of {dailyTargetMinutes}m daily goal</span>
          </div>
          <div className="h-1.5 rounded-full bg-stone-200 dark:bg-ink-800 overflow-hidden">
            <div
              className="h-full bg-emerald-700 rounded-full transition-all"
              style={{ width: `${goalPct}%` }}
            />
          </div>
        </div>

        <div className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white/80 dark:bg-ink-900 p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-stone-500">
            <span>Reading Streak</span>
            <Flame className="w-4 h-4 text-amber-500" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-2xl font-bold text-stone-900 dark:text-white">
              {user.streak_count} days
            </span>
            <span className="text-xs text-emerald-700 dark:text-emerald-300">
              {todayAgg?.streak_qualifies ? 'Qualified today' : '15m verified qualifies'}
            </span>
          </div>
          <p className="text-[11px] text-stone-500">
            Streak insurance:{' '}
            {user.settings_json.streakInsuranceLastUsedMonth === format(new Date(), 'yyyy-MM')
              ? 'Used this month'
              : '1 grace day ready'}
          </p>
        </div>

        <div
          title="Rolling probabilistic trust score across your last 6 sessions. Never a hard gate."
          className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white/80 dark:bg-ink-900 p-4 space-y-2 cursor-help"
        >
          <div className="flex items-center justify-between text-xs text-stone-500">
            <span>Rolling Trust Standing</span>
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-2xl font-bold text-stone-900 dark:text-white">
              {rollingTrust}
              <span className="text-sm font-normal text-stone-400">/100</span>
            </span>
            <span
              className={`text-xs font-medium ${
                user.strike_count > 0
                  ? 'text-amber-700 dark:text-amber-300'
                  : 'text-emerald-700 dark:text-emerald-300'
              }`}
            >
              {user.strike_count > 0 ? `${user.strike_count} curable strike` : 'High trust'}
            </span>
          </div>
          <button
            onClick={() => setActiveView('verification')}
            className="text-[11px] text-emerald-700 dark:text-emerald-300 hover:underline inline-flex items-center gap-1"
          >
            Inspect verification signals <ArrowRight className="w-3 h-3" />
          </button>
        </div>

        <div className="rounded-2xl border border-emerald-700/25 bg-emerald-950/5 dark:bg-emerald-950/20 p-4 flex flex-col justify-between">
          <div className="text-xs font-medium text-emerald-900 dark:text-emerald-200">
            {activeDraft
              ? 'Live Reading Draft Running Offline-First'
              : 'Ready for a Scanned or E-Reader Session?'}
          </div>
          <div className="flex items-center gap-2 pt-2">
            <button
              onClick={() => openSessionFlow(activeDraft?.book_id ?? currentReads[0]?.id)}
              className="flex-1 py-2.5 px-3 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold transition"
            >
              {activeDraft ? 'Open Live Timer (E)' : 'Start Session (S)'}
            </button>
            <button
              onClick={() => setAddBookModalOpen(true)}
              aria-label="Add book"
              className="p-2.5 rounded-xl border border-stone-300 dark:border-stone-700 hover:bg-white dark:hover:bg-ink-800"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Curable Strike Coach Banner (if present) */}
      {activeCurableStrike && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 dark:bg-rose-950/25 px-5 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-semibold text-rose-700 dark:text-rose-300">
              <AlertCircle className="w-4 h-4" />
              Curable Strike Recovery Window Open (7 Days)
            </div>
            <p className="text-xs text-stone-700 dark:text-stone-300">
              Two independent signals aligned on{' '}
              <span className="font-medium">
                {booksById.get(activeCurableStrike.book_id)?.title}
              </span>{' '}
              ({activeCurableStrike.flags_json.map((f) => f.label).join(' + ')}). Historical
              verified minutes remain untouched—complete a ≥10m verified make-up session to cure it.
            </p>
          </div>
          <button
            onClick={() => openSessionFlow(activeCurableStrike.book_id, activeCurableStrike.id)}
            className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold shrink-0"
          >
            Start 10m Cure Session
          </button>
        </div>
      )}

      {/* Main Two-Column Desktop Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 cols: Current Reads with Predicted Finish Dates */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-100 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-emerald-700 dark:text-emerald-300" />
              Currently Reading ({currentReads.length})
            </h2>
            <button
              onClick={() => setAddBookModalOpen(true)}
              className="text-xs font-medium text-emerald-700 dark:text-emerald-300 hover:underline"
            >
              + Add book or scan ISBN
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {currentReads.map((book) => {
              const pred = predictBookFinish(book, verifiedSessions, booksById);
              const pct = Math.min(100, Math.round((book.current_page / book.page_count) * 100));
              return (
                <div
                  key={book.id}
                  className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white/80 dark:bg-ink-900 p-4 flex flex-col justify-between gap-4 hover:border-emerald-700/40 transition"
                >
                  <div className="flex items-start gap-3.5">
                    <div
                      onClick={() => setSelectedBookId(book.id)}
                      className="cursor-pointer"
                    >
                      <BookCoverArt book={book} size="md" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex flex-wrap gap-1">
                        {book.genre.slice(0, 2).map((g) => (
                          <span
                            key={g}
                            className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${GENRE_META[g].badgeColor}`}
                          >
                            {GENRE_META[g].label}
                          </span>
                        ))}
                      </div>
                      <h3
                        onClick={() => setSelectedBookId(book.id)}
                        className="font-serif font-bold text-base text-stone-900 dark:text-stone-100 hover:text-emerald-700 dark:hover:text-emerald-300 cursor-pointer leading-snug line-clamp-2"
                      >
                        {book.title}
                      </h3>
                      <p className="text-xs text-stone-500 truncate">{book.author}</p>

                      {/* Hover Tooltip on Bayesian WPM & Predicted Finish */}
                      <div
                        title={`Bayesian ${GENRE_META[book.genre[0]]?.label} pace: ${pred.wpmBand.lowWpm}–${pred.wpmBand.highWpm} WPM (Difficulty ${book.difficulty_band}/5, ${pred.remainingWords.toLocaleString()} words left)`}
                        className="inline-flex items-center gap-1.5 text-xs font-mono text-emerald-700 dark:text-emerald-300 pt-0.5 cursor-help"
                      >
                        <Clock className="w-3.5 h-3.5" />
                        <span>~{pred.formattedExpected} left</span>
                        <span className="text-[10px] text-stone-400">({pred.formattedRange})</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    <div className="space-y-1">
                      <div className="flex justify-between text-[11px] text-stone-500 font-mono">
                        <span>
                          p. {book.current_page} / {book.page_count} ({pct}%)
                        </span>
                        <span className="uppercase">{book.medium_default}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-stone-200 dark:bg-ink-800 overflow-hidden">
                        <div
                          className="h-full bg-emerald-700 rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <button
                        onClick={() => setSelectedBookId(book.id)}
                        className="text-xs text-stone-600 dark:text-stone-400 hover:underline"
                      >
                        Forecast & notes
                      </button>
                      <button
                        onClick={() => openSessionFlow(book.id)}
                        className="px-3 py-1.5 rounded-xl bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 text-xs font-semibold hover:opacity-90"
                      >
                        Start Session
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right rail: TBR Next-Up + Shortcuts */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white/80 dark:bg-ink-900 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                TBR Next-Up Queue
              </h2>
              <button
                onClick={() => setActiveView('tbr')}
                className="text-xs text-emerald-700 dark:text-emerald-300 hover:underline"
              >
                Full TBR →
              </button>
            </div>

            {pendingTbr.length === 0 ? (
              <p className="text-xs text-stone-500">Your TBR queue is clear.</p>
            ) : (
              <div className="space-y-2.5">
                {pendingTbr.map((item, idx) => {
                  const linkedBook = item.book_id ? booksById.get(item.book_id) : null;
                  const title = linkedBook?.title ?? item.free_text_title ?? 'Untitled';
                  const author = linkedBook?.author ?? item.free_text_author ?? '';
                  return (
                    <div
                      key={item.id}
                      className="rounded-xl bg-paper-100 dark:bg-ink-800/70 p-3 flex items-start justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-stone-200 dark:bg-ink-700">
                            #{idx + 1}
                          </span>
                          <span className="font-serif font-semibold text-xs text-stone-900 dark:text-stone-100 truncate">
                            {title}
                          </span>
                        </div>
                        <p className="text-[11px] text-stone-500 truncate mt-0.5">{author}</p>
                        {item.planned_start_date && (
                          <p className="text-[10px] font-mono text-emerald-700 dark:text-emerald-300 mt-1">
                            Planned: {item.planned_start_date}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => promoteTbrToReading(item.id)}
                        className="px-2.5 py-1 rounded-lg border border-stone-300 dark:border-stone-700 text-[11px] font-medium hover:bg-white dark:hover:bg-ink-700 shrink-0"
                      >
                        Read Now
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Recommendations Teaser */}
          <div className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white/80 dark:bg-ink-900 p-4 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
              <Sparkles className="w-3.5 h-3.5" />
              Personalized Speed-Matched Picks
            </div>
            <p className="text-xs text-stone-600 dark:text-stone-300 leading-relaxed">
              Recommendations match your verified genre completion rates, difficulty comfort zone,
              and exact finish-time forecast.
            </p>
            <button
              onClick={() => setActiveView('recommendations')}
              className="text-xs font-semibold text-stone-900 dark:text-stone-100 hover:underline inline-flex items-center gap-1 pt-1"
            >
              Explore Recommendations <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Keyboard-First Cheat Strip */}
          <div className="rounded-2xl border border-stone-200/80 dark:border-stone-800 bg-paper-100/70 dark:bg-ink-900/60 p-3.5 space-y-2">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-stone-500">
              <Keyboard className="w-3.5 h-3.5" />
              Web Keyboard Shortcuts
            </div>
            <div className="grid grid-cols-2 gap-1.5 text-[11px] text-stone-600 dark:text-stone-400">
              <div>
                <kbd className="px-1.5 py-0.5 rounded bg-white dark:bg-ink-800 border border-stone-300 dark:border-stone-700 font-mono">
                  /
                </kbd>{' '}
                Search library
              </div>
              <div>
                <kbd className="px-1.5 py-0.5 rounded bg-white dark:bg-ink-800 border border-stone-300 dark:border-stone-700 font-mono">
                  S
                </kbd>{' '}
                Start session
              </div>
              <div>
                <kbd className="px-1.5 py-0.5 rounded bg-white dark:bg-ink-800 border border-stone-300 dark:border-stone-700 font-mono">
                  E
                </kbd>{' '}
                End session
              </div>
              <div>
                <kbd className="px-1.5 py-0.5 rounded bg-white dark:bg-ink-800 border border-stone-300 dark:border-stone-700 font-mono">
                  G
                </kbd>{' '}
                then{' '}
                <kbd className="px-1.5 py-0.5 rounded bg-white dark:bg-ink-800 border border-stone-300 dark:border-stone-700 font-mono">
                  D
                </kbd>{' '}
                Dashboard
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Verified Sessions Preview */}
      <div className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white/80 dark:bg-ink-900 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-100">
            Recent Reading Sessions
          </h2>
          <button
            onClick={() => setActiveView('sessions')}
            className="text-xs text-emerald-700 dark:text-emerald-300 hover:underline"
          >
            View all ({sessions.length}) →
          </button>
        </div>

        <div className="divide-y divide-stone-200/70 dark:divide-stone-800">
          {sessions.slice(0, 4).map((s) => {
            const b = booksById.get(s.book_id);
            return (
              <div
                key={s.id}
                className="py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                      s.strike_issued && !s.cure_session_id
                        ? 'bg-rose-500'
                        : s.verified
                        ? 'bg-emerald-600'
                        : 'bg-amber-500'
                    }`}
                  />
                  <div className="min-w-0">
                    <span className="font-serif font-semibold text-stone-900 dark:text-stone-100">
                      {b?.title ?? 'Book'}
                    </span>
                    <span className="text-stone-500 ml-2">
                      p. {s.start_page}→{s.end_page} · {s.medium}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-4 font-mono text-stone-600 dark:text-stone-300">
                  <span title={`Predicted: ${formatMinutesHuman(s.predicted_minutes)}`}>
                    {formatMinutesHuman(s.actual_minutes)} (pred{' '}
                    {formatMinutesHuman(s.predicted_minutes)})
                  </span>
                  <span title={`Expected range: ${s.wpm_expected_range_low}–${s.wpm_expected_range_high} WPM`}>
                    {s.wpm_observed} wpm
                  </span>
                  <span className="px-2 py-0.5 rounded bg-paper-100 dark:bg-ink-800">
                    Trust {s.trust_score}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
