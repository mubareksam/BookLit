'use client';

import React, { useMemo } from 'react';
import { format, isSameDay, subDays } from 'date-fns';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useBooklit } from '@/context/BooklitContext';
import { BookGenre, GENRE_META } from '@/lib/types';
import { estimateUserGenreSpeed } from '@/lib/domain/speedModel';

export function StatsView() {
  const { books, sessions } = useBooklit();
  const booksById = useMemo(() => new Map(books.map((b) => [b.id, b])), [books]);
  const verifiedSessions = useMemo(
    () => sessions.filter((s) => s.verified && !s.strike_issued),
    [sessions]
  );

  const last7Days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const date = subDays(new Date(), 6 - i);
      const mins = Math.round(
        sessions
          .filter((s) => isSameDay(new Date(s.ended_at), date))
          .reduce((acc, s) => acc + s.actual_minutes, 0)
      );
      return { day: format(date, 'EEE'), minutes: mins };
    });
  }, [sessions]);

  const genreSpeeds = useMemo(() => {
    const activeGenres = new Set<BookGenre>();
    books.forEach((b) => b.genre.forEach((g) => activeGenres.add(g)));
    const list =
      activeGenres.size > 0
        ? Array.from(activeGenres)
        : (['literary_fiction', 'fiction', 'general_nonfiction', 'technical'] as BookGenre[]);
    return list.slice(0, 5).map((g) => {
      const band = estimateUserGenreSpeed(g, verifiedSessions, booksById);
      return {
        genre: GENRE_META[g].label.split(' ')[0],
        wpm: band.expectedWpm,
      };
    });
  }, [books, verifiedSessions, booksById]);

  const totalPages = useMemo(
    () => sessions.reduce((acc, s) => acc + Math.max(0, s.end_page - s.start_page), 0),
    [sessions]
  );
  const totalHours = useMemo(
    () => Math.round((sessions.reduce((acc, s) => acc + s.actual_minutes, 0) / 60) * 10) / 10,
    [sessions]
  );
  const finishedBooks = useMemo(
    () => books.filter((b) => b.status === 'finished').length,
    [books]
  );

  return (
    <div className="space-y-5 pb-20 min-w-0">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Analytics</h1>
        <p className="text-xs text-zinc-500">Reading volume and genre-calibrated speed.</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
          <div className="text-[11px] text-zinc-500">Hours Read</div>
          <div className="font-mono text-xl font-bold mt-0.5">{totalHours}h</div>
        </div>
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
          <div className="text-[11px] text-zinc-500">Pages Read</div>
          <div className="font-mono text-xl font-bold mt-0.5">{totalPages}</div>
        </div>
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
          <div className="text-[11px] text-zinc-500">Finished</div>
          <div className="font-mono text-xl font-bold mt-0.5">{finishedBooks}</div>
        </div>
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
          <div className="text-[11px] text-zinc-500">Verified</div>
          <div className="font-mono text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
            {verifiedSessions.length}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 space-y-3 min-w-0">
          <h3 className="text-xs font-semibold">Last 7 Days (Minutes)</h3>
          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={last7Days}>
                <XAxis dataKey="day" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={28} />
                <Tooltip />
                <Bar dataKey="minutes" fill="#059669" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 space-y-3 min-w-0">
          <h3 className="text-xs font-semibold">Calibrated Speed by Genre (WPM)</h3>
          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={genreSpeeds} layout="vertical">
                <XAxis type="number" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis
                  type="category"
                  dataKey="genre"
                  tick={{ fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={72}
                />
                <Tooltip />
                <Bar dataKey="wpm" fill="#10b981" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
