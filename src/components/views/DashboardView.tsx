'use client';

import React, { useMemo } from 'react';
import { format, isSameDay } from 'date-fns';
import {
  AlertTriangle,
  Award,
  BookOpen,
  ChevronRight,
  Clock,
  Flame,
  Play,
  Plus,
  ShieldCheck,
  Swords,
  Trophy,
  Users,
} from 'lucide-react';
import { useBooklit } from '@/context/BooklitContext';
import { GENRE_META } from '@/lib/types';
import { predictBookFinish } from '@/lib/domain/speedModel';
import { normalizeTrustScore } from '@/lib/domain/trust';
import { computeAchievementBadges } from '@/lib/domain/badges';

export function DashboardView() {
  const {
    user,
    books,
    sessions,
    challenges,
    duels,
    activeDraft,
    openSessionFlow,
    setAddBookModalOpen,
    setSelectedBookId,
    setSelectedReaderUsername,
    setActiveView,
    activityFeed,
    readers,
  } = useBooklit();

  const booksById = useMemo(() => new Map(books.map((b) => [b.id, b])), [books]);
  const verifiedSessions = useMemo(
    () => sessions.filter((s) => s.verified && !s.strike_issued),
    [sessions]
  );

  const primaryReading = useMemo(
    () => books.find((b) => b.status === 'reading') ?? null,
    [books]
  );

  const todayMinutes = useMemo(() => {
    const now = new Date();
    return Math.round(
      sessions
        .filter((s) => isSameDay(new Date(s.ended_at), now))
        .reduce((acc, s) => acc + s.actual_minutes, 0)
    );
  }, [sessions]);

  const activeStrikes = useMemo(
    () => sessions.filter((s) => s.strike_issued && !s.strike_cured_at),
    [sessions]
  );

  const avgTrust = useMemo(() => {
    if (sessions.length === 0) return 1000;
    const recent = sessions.slice(0, 6);
    return Math.round(
      recent.reduce((acc, s) => acc + normalizeTrustScore(s.trust_score, s.trust_scale), 0) /
        recent.length
    );
  }, [sessions]);

  const primaryPred = useMemo(() => {
    if (!primaryReading) return null;
    return predictBookFinish(primaryReading, verifiedSessions, booksById);
  }, [primaryReading, verifiedSessions, booksById]);

  const dailyGoal =
    user?.reading_goal_type === 'minutes_day' ? user.reading_goal_target : 30;
  const dailyPct = Math.min(100, Math.round((todayMinutes / Math.max(5, dailyGoal)) * 100));

  const myChallenges = useMemo(
    () => challenges.filter((c) => c.participants.some((p) => p.userId === user?.id)),
    [challenges, user?.id]
  );

  const myActiveDuels = useMemo(
    () =>
      duels.filter(
        (d) =>
          d.status === 'active' &&
          (d.challenger.userId === user?.id || d.opponent?.userId === user?.id)
      ),
    [duels, user?.id]
  );

  const badgeSummary = useMemo(() => {
    if (!user) return null;
    return computeAchievementBadges({
      userId: user.id,
      streakCount: user.streak_count ?? 0,
      books,
      sessions,
      challenges,
      duels,
    });
  }, [user, books, sessions, challenges, duels]);

  return (
    <div className="space-y-5 pb-20 min-w-0">
      {/* Strike Cure Banner */}
      {activeStrikes.length > 0 && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <div className="text-xs min-w-0">
              <span className="font-semibold">
                {activeStrikes.length} Curable Strike{activeStrikes.length > 1 ? 's' : ''}
              </span>
              <span className="text-zinc-600 dark:text-zinc-400 ml-1.5">
                Complete a ≥10m live-scanned session within 7 days to clear.
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => openSessionFlow(activeStrikes[0].book_id, activeStrikes[0].id)}
            className="px-3 py-1.5 rounded-xl bg-amber-600 text-white text-xs font-semibold shrink-0"
          >
            Cure Strike
          </button>
        </div>
      )}

      {/* Top Row: Active Book + Daily Goal */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-8 rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 sm:p-6 min-w-0">
          {primaryReading ? (
            <div className="flex flex-col sm:flex-row gap-5 items-start sm:items-center min-w-0">
              <button
                type="button"
                onClick={() => setSelectedBookId(primaryReading.id)}
                className="w-20 h-28 rounded-2xl bg-gradient-to-br from-emerald-800 via-teal-900 to-zinc-950 shadow-md shrink-0 flex items-end p-2.5 text-left text-white"
              >
                <span className="text-[10px] font-semibold line-clamp-2 leading-tight">
                  {primaryReading.title}
                </span>
              </button>

              <div className="flex-1 min-w-0 space-y-2.5 w-full">
                <div className="flex items-center gap-2 text-xs">
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-medium">
                    Reading Now
                  </span>
                  <span className="text-zinc-400 truncate">
                    {GENRE_META[primaryReading.genre[0]]?.label}
                  </span>
                </div>

                <div className="min-w-0">
                  <button
                    type="button"
                    onClick={() => setSelectedBookId(primaryReading.id)}
                    className="text-lg sm:text-xl font-bold text-left hover:text-emerald-600 transition truncate block max-w-full"
                  >
                    {primaryReading.title}
                  </button>
                  <p className="text-xs text-zinc-500 truncate">{primaryReading.author}</p>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-zinc-500 font-mono">
                      p.{primaryReading.current_page} / {primaryReading.page_count}
                    </span>
                    {primaryPred && (
                      <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                        {primaryPred.formattedExpected} left
                      </span>
                    )}
                  </div>
                  <div className="h-2 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                    <div
                      className="h-full bg-emerald-600 rounded-full"
                      style={{
                        width: `${Math.min(
                          100,
                          Math.round(
                            (primaryReading.current_page / Math.max(1, primaryReading.page_count)) *
                              100
                          )
                        )}%`,
                      }}
                    />
                  </div>
                </div>

                <div className="pt-1 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => openSessionFlow(primaryReading.id)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    {activeDraft ? 'Resume Timer' : 'Start Verified Session'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedBookId(primaryReading.id)}
                    className="px-3.5 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-medium"
                  >
                    Details
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="py-6 text-center space-y-3">
              <div className="w-11 h-11 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center mx-auto">
                <BookOpen className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h2 className="text-base font-bold">Welcome, {user?.display_name}</h2>
                <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                  Add the book you are currently reading to track pace, ETAs, and verified
                  sessions.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAddBookModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
              >
                <Plus className="w-4 h-4" />
                Add Your First Book
              </button>
            </div>
          )}
        </div>

        {/* Daily Goal & Trust Card */}
        <div className="lg:col-span-4 rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 flex flex-col justify-between gap-4 min-w-0">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-zinc-500">
              <span className="inline-flex items-center gap-1 font-medium">
                <Clock className="w-3.5 h-3.5 text-emerald-600" /> Today
              </span>
              <span className="font-mono">
                {todayMinutes} / {dailyGoal}m
              </span>
            </div>
            <div className="text-2xl font-bold font-mono">{dailyPct}%</div>
            <div className="h-2 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
              <div
                className="h-full bg-emerald-600 rounded-full transition-all"
                style={{ width: `${dailyPct}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
            <div className="rounded-xl bg-zinc-50 dark:bg-zinc-800/70 p-2.5">
              <div className="text-[11px] text-zinc-500 flex items-center gap-1">
                <Flame className="w-3 h-3 text-amber-500" /> Streak
              </div>
              <div className="font-mono text-sm font-bold mt-0.5">
                {user?.streak_count ?? 0}d
              </div>
            </div>
            <div className="rounded-xl bg-zinc-50 dark:bg-zinc-800/70 p-2.5">
              <div className="text-[11px] text-zinc-500 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-emerald-600" /> Honest
              </div>
              <div className="font-mono text-sm font-bold mt-0.5">{avgTrust}/1000</div>
            </div>
          </div>
        </div>
      </div>

      {/* Social strip: newest verified activity from the readers you tether */}
      <button
        type="button"
        onClick={() => setActiveView('social')}
        className="w-full text-left rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3.5 flex items-center gap-3 min-w-0 hover:border-emerald-500/40 transition"
      >
        <div className="w-9 h-9 rounded-full bg-emerald-600/10 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0">
          <Users className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold">Feed & readers</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-medium">
              {readers.length} reader{readers.length === 1 ? '' : 's'}
            </span>
          </div>
          <p className="text-[11px] text-zinc-500 truncate">
            {activityFeed[0]
              ? `@${activityFeed[0].actorUsername} ${activityFeed[0].summary}`
              : 'Verified sessions and duels from your tethers appear here.'}
          </p>
        </div>
        <ChevronRight className="w-4 h-4 text-zinc-300 dark:text-zinc-600 shrink-0" />
      </button>

      {/* Active Challenges, 1v1 Duels & Rank Strip */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 flex items-center justify-between gap-3 min-w-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 shrink-0">
              {myActiveDuels.length > 0 ? (
                <Swords className="w-4 h-4" />
              ) : (
                <Trophy className="w-4 h-4" />
              )}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold truncate">
                {myActiveDuels.length > 0 || myChallenges.length > 0
                  ? `${myChallenges.length} Challenge(s) · ${myActiveDuels.length} Active 1v1`
                  : 'Challenges & 1v1 Reading Duels'}
              </div>
              <p className="text-[11px] text-zinc-500 truncate">
                {myActiveDuels[0]?.title ||
                  myChallenges[0]?.title ||
                  'Compete live against friends or open lobbies.'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setActiveView('challenges')}
            className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 shrink-0"
          >
            Arena <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {badgeSummary && user && (
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 flex items-center justify-between gap-3 min-w-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600 shrink-0">
                <Award className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-semibold truncate">
                  {badgeSummary.rankTitle} ·{' '}
                  {badgeSummary.badges.filter((b) => b.unlocked).length}/
                  {badgeSummary.badges.length} Badges
                </div>
                <p className="text-[11px] text-zinc-500 truncate">
                  @{user.username} · {badgeSummary.duelWins}W–{badgeSummary.duelLosses}L Duels
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setSelectedReaderUsername(user.username)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 shrink-0"
            >
              Profile <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Recent Sessions */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Recent Sessions
          </h3>
          {sessions.length > 0 && (
            <button
              type="button"
              onClick={() => setActiveView('sessions')}
              className="text-xs text-emerald-600 font-medium"
            >
              View all
            </button>
          )}
        </div>

        {sessions.length === 0 ? (
          <p className="text-xs text-zinc-500 py-4 text-center">
            No sessions logged yet. Start a reading timer to record verified progress.
          </p>
        ) : (
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {sessions.slice(0, 4).map((s) => {
              const bk = booksById.get(s.book_id);
              return (
                <div
                  key={s.id}
                  className="py-2.5 flex items-center justify-between gap-3 text-xs min-w-0"
                >
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{bk?.title ?? 'Book'}</div>
                    <div className="text-[11px] text-zinc-500">
                      {format(new Date(s.ended_at), 'MMM d')} · p.{s.start_page}→{s.end_page} ·{' '}
                      {Math.round(s.actual_minutes)}m
                    </div>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full font-mono text-[11px] shrink-0 ${
                      s.verified
                        ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'
                    }`}
                  >
                    {normalizeTrustScore(s.trust_score, s.trust_scale)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
