'use client';

import React, { useMemo } from 'react';
import { format } from 'date-fns';
import { BookOpen, Play, Star, X } from 'lucide-react';
import { useBooklit } from '@/context/BooklitContext';
import { Book, GENRE_META } from '@/lib/types';
import { formatMinutesHuman, predictBookFinish } from '@/lib/domain/speedModel';

export function BookDetailDrawer() {
  const {
    selectedBookId,
    setSelectedBookId,
    books,
    sessions,
    openSessionFlow,
    updateBook,
  } = useBooklit();

  const book = useMemo(
    () => books.find((b) => b.id === selectedBookId) ?? null,
    [books, selectedBookId]
  );
  const booksById = useMemo(() => new Map(books.map((b) => [b.id, b])), [books]);
  const verifiedSessions = useMemo(
    () => sessions.filter((s) => s.verified && !s.strike_issued),
    [sessions]
  );

  if (!book) return null;

  const pred = predictBookFinish(book, verifiedSessions, booksById);
  const bookSessions = sessions.filter((s) => s.book_id === book.id);
  const pct = Math.min(100, Math.round((book.current_page / Math.max(1, book.page_count)) * 100));

  return (
    <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm flex justify-end">
      <div className="w-full max-w-md bg-white dark:bg-zinc-900 h-full overflow-y-auto overflow-x-hidden border-l border-zinc-200 dark:border-zinc-800 p-5 space-y-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3 min-w-0">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-12 h-16 rounded-xl bg-gradient-to-br from-emerald-800 to-zinc-900 shrink-0 shadow flex items-center justify-center text-white">
              <BookOpen className="w-4 h-4 opacity-80" />
            </div>
            <div className="min-w-0">
              <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                {GENRE_META[book.genre[0]]?.label}
              </span>
              <h2 className="text-base font-bold leading-snug break-words">{book.title}</h2>
              <p className="text-xs text-zinc-500 truncate">{book.author}</p>
            </div>
          </div>
          <button
            onClick={() => setSelectedBookId(null)}
            className="p-1.5 rounded-xl text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Progress & ETA */}
        <div className="rounded-2xl bg-zinc-50 dark:bg-zinc-800/70 p-4 space-y-2.5 border border-zinc-200/70 dark:border-zinc-800">
          <div className="flex items-center justify-between text-xs">
            <span className="text-zinc-500 font-mono">
              p.{book.current_page} / {book.page_count}
            </span>
            <span className="font-mono font-semibold">{pct}%</span>
          </div>
          <div className="h-2 rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden">
            <div className="h-full bg-emerald-600 rounded-full" style={{ width: `${pct}%` }} />
          </div>
          <div className="flex justify-between text-[11px] text-zinc-500">
            <span>ETA: {pred.formattedExpected} left</span>
            <span className="font-mono">
              {pred.wpmBand.lowWpm}–{pred.wpmBand.highWpm} WPM
            </span>
          </div>
        </div>

        {/* Status & Start Session */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1">
            {(['reading', 'tbr', 'paused', 'finished'] as Book['status'][]).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => updateBook(book.id, { status: st })}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium uppercase ${
                  book.status === st
                    ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => {
              setSelectedBookId(null);
              openSessionFlow(book.id);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            Read
          </button>
        </div>

        {/* Rating */}
        <div className="flex items-center justify-between border-t border-b border-zinc-200 dark:border-zinc-800 py-2.5">
          <span className="text-xs font-medium text-zinc-500">Rating</span>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => updateBook(book.id, { rating: star })}
                className="p-1"
              >
                <Star
                  className={`w-4 h-4 ${
                    (book.rating ?? 0) >= star ? 'text-amber-400 fill-amber-400' : 'text-zinc-300'
                  }`}
                />
              </button>
            ))}
          </div>
        </div>

        {/* Recent Sessions on this Book */}
        <div className="space-y-2.5">
          <h3 className="text-xs font-semibold text-zinc-500">
            Book Sessions ({bookSessions.length})
          </h3>
          {bookSessions.length === 0 ? (
            <p className="text-xs text-zinc-500">No sessions recorded on this book yet.</p>
          ) : (
            <div className="space-y-2">
              {bookSessions.slice(0, 8).map((s) => (
                <div
                  key={s.id}
                  className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3 text-xs flex items-center justify-between gap-2"
                >
                  <div>
                    <div className="font-medium">
                      p.{s.start_page} → {s.end_page} ({formatMinutesHuman(s.actual_minutes)})
                    </div>
                    <div className="text-[11px] text-zinc-400">
                      {format(new Date(s.ended_at), 'MMM d')} · {s.wpm_observed} wpm
                    </div>
                  </div>
                  <span className="font-mono font-semibold text-emerald-600">{s.trust_score}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
