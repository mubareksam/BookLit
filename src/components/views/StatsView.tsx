'use client';

import React, { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { format } from 'date-fns';
import { Activity, BookOpen, Clock, Flame, Gauge, ShieldCheck } from 'lucide-react';
import { useBooklit } from '@/context/BooklitContext';
import { BookGenre, GENRE_META } from '@/lib/types';
import { estimateUserGenreSpeed, formatMinutesHuman } from '@/lib/domain/speedModel';

export function StatsView() {
  const { user, books, sessions, dailyAggregates } = useBooklit();

  const verifiedSessions = useMemo(
    () => sessions.filter((s) => s.verified && !s.strike_issued),
    [sessions]
  );
  const booksById = useMemo(() => new Map(books.map((b) => [b.id, b])), [books]);

  const totalVerifiedMinutes = useMemo(
    () => verifiedSessions.reduce((acc, s) => acc + s.actual_minutes, 0),
    [verifiedSessions]
  );

  const totalAppForegroundMinutes = useMemo(
    () => dailyAggregates.reduce((acc, d) => acc + d.app_foreground_minutes, 0),
    [dailyAggregates]
  );

  const totalPagesRead = useMemo(
    () =>
      verifiedSessions.reduce((acc, s) => acc + Math.max(0, s.end_page - s.start_page), 0),
    [verifiedSessions]
  );

  const avgSessionMinutes =
    verifiedSessions.length > 0 ? totalVerifiedMinutes / verifiedSessions.length : 0;

  // Daily chart data (separating Verified Reading Minutes from In-App Foreground Time!)
  const dailyChartData = useMemo(() => {
    return dailyAggregates.slice(-10).map((d) => ({
      day: format(new Date(`${d.date}T12:00:00Z`), 'MMM d'),
      verifiedReadingMin: Math.round(d.verified_minutes * 10) / 10,
      appForegroundMin: Math.round(d.app_foreground_minutes * 10) / 10,
      pages: d.pages_read,
    }));
  }, [dailyAggregates]);

  // Predicted vs Actual accuracy data
  const accuracyChartData = useMemo(() => {
    return [...verifiedSessions]
      .reverse()
      .slice(-8)
      .map((s, idx) => ({
        session: `#${idx + 1}`,
        book: booksById.get(s.book_id)?.title.slice(0, 16) ?? 'Session',
        predicted: Math.round(s.predicted_minutes * 10) / 10,
        actual: Math.round(s.actual_minutes * 10) / 10,
        wpm: s.wpm_observed,
      }));
  }, [verifiedSessions, booksById]);

  // Mean percentage accuracy between predicted & actual
  const predictionAccuracyPct = useMemo(() => {
    if (verifiedSessions.length === 0) return 92;
    const errors = verifiedSessions.map((s) =>
      Math.min(1, Math.abs(s.actual_minutes - s.predicted_minutes) / Math.max(5, s.actual_minutes))
    );
    const meanError = errors.reduce((a, b) => a + b, 0) / errors.length;
    return Math.round((1 - meanError) * 100);
  }, [verifiedSessions]);

  // Genre distribution + Bayesian speed comfort profiles
  const genreBreakdown = useMemo(() => {
    const minsByGenre = new Map<BookGenre, number>();
    for (const s of verifiedSessions) {
      const b = booksById.get(s.book_id);
      const g = b?.genre[0] ?? 'general_nonfiction';
      minsByGenre.set(g, (minsByGenre.get(g) ?? 0) + s.actual_minutes);
    }

    const activeGenres: BookGenre[] = Array.from(
      new Set([
        ...Array.from(minsByGenre.keys()),
        ...(user?.preferred_genres ?? []),
      ])
    ).slice(0, 6);

    return activeGenres.map((g) => {
      const est = estimateUserGenreSpeed(g, verifiedSessions, booksById);
      return {
        genre: g,
        label: GENRE_META[g].label,
        minutes: Math.round(minsByGenre.get(g) ?? 0),
        priorWpm: est.priorWpm,
        personalExpectedWpm: est.expectedWpm,
        bandText: `${est.lowWpm}–${est.highWpm} WPM`,
      };
    });
  }, [verifiedSessions, booksById, user?.preferred_genres]);

  if (!user) return null;

  return (
    <div className="space-y-6 pb-20">
      <div>
        <h1 className="font-serif text-2xl font-bold text-stone-900 dark:text-stone-100">
          Reading Telemetry & Speed Analytics
        </h1>
        <p className="text-xs text-stone-500 dark:text-stone-400">
          Verified reading minutes and in-app foreground usage are tracked on separate ledgers and
          never conflated.
        </p>
      </div>

      {/* Top KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
        <div className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white/85 dark:bg-ink-900 p-4">
          <div className="text-xs text-stone-500 flex items-center justify-between">
            <span>Current Streak</span>
            <Flame className="w-4 h-4 text-amber-500" />
          </div>
          <div className="font-mono text-2xl font-bold mt-1">{user.streak_count}d</div>
          <div className="text-[11px] text-stone-400">≥15m verified / day</div>
        </div>

        <div className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white/85 dark:bg-ink-900 p-4">
          <div className="text-xs text-stone-500 flex items-center justify-between">
            <span>Verified Reading</span>
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="font-mono text-2xl font-bold mt-1">
            {formatMinutesHuman(totalVerifiedMinutes)}
          </div>
          <div className="text-[11px] text-emerald-700 dark:text-emerald-300">
            Habit metric ({verifiedSessions.length} sessions)
          </div>
        </div>

        <div className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white/85 dark:bg-ink-900 p-4">
          <div className="text-xs text-stone-500 flex items-center justify-between">
            <span>In-App Screen Time</span>
            <Activity className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="font-mono text-2xl font-bold mt-1">
            {formatMinutesHuman(totalAppForegroundMinutes)}
          </div>
          <div className="text-[11px] text-stone-400">Product-usage metric (separate)</div>
        </div>

        <div className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white/85 dark:bg-ink-900 p-4">
          <div className="text-xs text-stone-500 flex items-center justify-between">
            <span>Verified Pages</span>
            <BookOpen className="w-4 h-4 text-emerald-700" />
          </div>
          <div className="font-mono text-2xl font-bold mt-1">{totalPagesRead}</div>
          <div className="text-[11px] text-stone-400">
            Avg sitting: {Math.round(avgSessionMinutes)}m
          </div>
        </div>

        <div className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white/85 dark:bg-ink-900 p-4 col-span-2 lg:col-span-1">
          <div className="text-xs text-stone-500 flex items-center justify-between">
            <span>Forecast Accuracy</span>
            <Clock className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="font-mono text-2xl font-bold mt-1">{predictionAccuracyPct}%</div>
          <div className="text-[11px] text-stone-400">Predicted vs. actual</div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Chart 1: Daily Verified Reading vs In-App Foreground Usage */}
        <div className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white/90 dark:bg-ink-900 p-5 space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-100">
              Daily Verified Reading Time vs. In-App Foreground Time
            </h2>
            <p className="text-xs text-stone-500">
              Low app time + steady reading time means Booklit stays out of the way while you read.
            </p>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyChartData}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} unit="m" />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar
                  dataKey="verifiedReadingMin"
                  name="Verified Reading (min)"
                  fill="#1f7a53"
                  radius={[6, 6, 0, 0]}
                />
                <Bar
                  dataKey="appForegroundMin"
                  name="App Foreground UI (min)"
                  fill="#94a3b8"
                  radius={[6, 6, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Predicted vs Actual Session Duration + WPM */}
        <div className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white/90 dark:bg-ink-900 p-5 space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-100">
              Bayesian Predicted vs. Actual Session Duration
            </h2>
            <p className="text-xs text-stone-500">
              Tracks how closely our genre speed model predicts each page-span sitting.
            </p>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={accuracyChartData}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="session" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} unit="m" />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line
                  type="monotone"
                  dataKey="predicted"
                  name="Predicted Minutes"
                  stroke="#6366f1"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                />
                <Line
                  type="monotone"
                  dataKey="actual"
                  name="Actual Verified Minutes"
                  stroke="#1f7a53"
                  strokeWidth={2.5}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Personal Bayesian WPM Model by Genre */}
      <div className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white/90 dark:bg-ink-900 p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Gauge className="w-4 h-4 text-emerald-700 dark:text-emerald-300" />
          <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-100">
            Personal Genre WPM Envelopes & Distribution
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {genreBreakdown.map((item) => (
            <div
              key={item.genre}
              className="rounded-xl bg-paper-100 dark:bg-ink-800/70 p-3.5 flex items-center justify-between gap-3"
            >
              <div>
                <div className="text-xs font-semibold text-stone-900 dark:text-stone-100">
                  {item.label}
                </div>
                <div className="text-[11px] text-stone-500 mt-0.5">
                  Logged: {formatMinutesHuman(item.minutes)} · Pop. prior: ~{item.priorWpm} wpm
                </div>
              </div>
              <div className="text-right font-mono">
                <div className="text-sm font-bold text-emerald-700 dark:text-emerald-300">
                  ~{item.personalExpectedWpm} wpm
                </div>
                <div className="text-[10px] text-stone-500">{item.bandText}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
