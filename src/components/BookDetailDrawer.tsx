'use client';

import React, { useMemo } from 'react';
import { Clock, Play, ShieldCheck, Star, X } from 'lucide-react';
import { format } from 'date-fns';
import { useBooklit } from '@/context/BooklitContext';
import { GENRE_META } from '@/lib/types';
import { BookCoverArt } from './BookCoverArt';
import { formatMinutesHuman, predictBookFinish } from '@/lib/domain/speedModel';

export function BookDetailDrawer() {
  const {
    selectedBookId,
    setSelectedBookId,
    books,
    sessions,
    updateBook,
    openSessionFlow,
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

  const prediction = useMemo(() => {
    if (!book) return null;
    return predictBookFinish(book, verifiedSessions, booksById);
  }, [book, verifiedSessions, booksById]);

  const bookSessions = useMemo(
    () => (book ? sessions.filter((s) => s.book_id === book.id) : []),
    [book, sessions]
  );

  if (!book || !prediction) return null;

  const progressPct = Math.min(100, Math.round((book.current_page / book.page_count) * 100));

  return (
    <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm flex justify-end">
      <div className="w-full max-w-xl bg-paper-50 dark:bg-ink-900 h-full border-l border-stone-200 dark:border-stone-800 shadow-2xl flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-stone-200 dark:border-stone-800 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-stone-500">
            Book Details & Bayesian Finish Forecast
          </span>
          <button
            onClick={() => setSelectedBookId(null)}
            aria-label="Close book detail"
            className="p-1.5 rounded-lg text-stone-500 hover:bg-stone-200/70 dark:hover:bg-ink-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          <div className="flex items-start gap-4">
            <BookCoverArt book={book} size="lg" />
            <div className="space-y-2 min-w-0 flex-1">
              <div className="flex flex-wrap gap-1.5">
                {book.genre.map((g) => (
                  <span
                    key={g}
                    className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${GENRE_META[g].badgeColor}`}
                  >
                    {GENRE_META[g].label}
                  </span>
                ))}
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-stone-200/80 dark:bg-ink-800 font-mono">
                  Difficulty {book.difficulty_band}/5
                </span>
              </div>

              <h2 className="font-serif text-xl font-bold text-stone-900 dark:text-stone-100">
                {book.title}
              </h2>
              <p className="text-sm text-stone-600 dark:text-stone-400">{book.author}</p>

              {book.isbn && (
                <p className="text-[11px] font-mono text-stone-500">
                  ISBN {book.isbn} · Source: {book.source}
                </p>
              )}

              <div className="pt-1 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const id = book.id;
                    setSelectedBookId(null);
                    openSessionFlow(id);
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold"
                >
                  <Play className="w-3.5 h-3.5" />
                  Start Session
                </button>

                <select
                  value={book.status}
                  onChange={(e) => {
                    const nextStatus = e.target.value as typeof book.status;
                    updateBook(book.id, {
                      status: nextStatus,
                      current_page:
                        nextStatus === 'finished' ? book.page_count : book.current_page,
                      finished_at:
                        nextStatus === 'finished' ? new Date().toISOString() : book.finished_at,
                    });
                  }}
                  className="rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-ink-800 px-3 py-2 text-xs font-medium capitalize"
                >
                  <option value="reading">Reading</option>
                  <option value="tbr">To-Be-Read</option>
                  <option value="finished">Finished</option>
                  <option value="paused">Paused</option>
                </select>
              </div>
            </div>
          </div>

          {/* Progress bar + Rating */}
          <div className="rounded-2xl bg-paper-100 dark:bg-ink-800/80 border border-stone-200 dark:border-stone-800 p-4 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-stone-700 dark:text-stone-300">
                Page {book.current_page} of {book.page_count} ({progressPct}%)
              </span>
              <span className="font-mono text-stone-500">
                ~{book.word_count_estimate.toLocaleString()} total words
              </span>
            </div>
            <div className="h-2 rounded-full bg-stone-200 dark:bg-ink-950 overflow-hidden">
              <div
                className="h-full bg-emerald-700 rounded-full transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-stone-500">Your Rating:</span>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 4.5, 5].map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => updateBook(book.id, { rating: val })}
                    className={`px-2 py-0.5 rounded-lg text-xs font-mono flex items-center gap-0.5 border transition ${
                      book.rating === val
                        ? 'border-amber-500 bg-amber-500/15 text-amber-700 dark:text-amber-300 font-semibold'
                        : 'border-stone-200 dark:border-stone-700 text-stone-500 hover:bg-stone-200/50 dark:hover:bg-ink-700'
                    }`}
                  >
                    <Star className="w-3 h-3 fill-current" />
                    {val}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Personalized Finish-Time Prediction Card */}
          <div className="rounded-2xl border border-emerald-700/25 bg-emerald-950/5 dark:bg-emerald-950/25 p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                <Clock className="w-3.5 h-3.5" />
                How Much Time Will This Take Me?
              </span>
              <span className="text-[11px] font-mono text-stone-500">
                {Math.round(prediction.wpmBand.posteriorWeightPersonal * 100)}% personal /{' '}
                {Math.round((1 - prediction.wpmBand.posteriorWeightPersonal) * 100)}% genre prior
              </span>
            </div>

            {prediction.remainingPages > 0 ? (
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <span className="font-mono text-2xl font-bold text-stone-900 dark:text-white">
                    {prediction.formattedExpected}
                  </span>
                  <span className="text-xs text-stone-600 dark:text-stone-400 ml-2">
                    remaining ({prediction.formattedRange} confidence band)
                  </span>
                </div>
                <span className="text-xs font-mono text-emerald-700 dark:text-emerald-300">
                  {prediction.wpmBand.lowWpm}–{prediction.wpmBand.highWpm} WPM
                </span>
              </div>
            ) : (
              <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">
                Completed! Your verified pace on this book updated your{' '}
                {GENRE_META[book.genre[0]]?.label} speed model.
              </p>
            )}

            <p className="text-[11px] text-stone-600 dark:text-stone-400">
              Computed from {prediction.remainingWords.toLocaleString()} remaining words ÷ your
              Bayesian {GENRE_META[book.genre[0]]?.label.toLowerCase()} comfort pace (~
              {prediction.wpmBand.expectedWpm} WPM, adjusted for difficulty band{' '}
              {book.difficulty_band}/5).
            </p>
          </div>

          {book.description && (
            <div className="space-y-1">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                About This Book
              </h3>
              <p className="text-xs leading-relaxed text-stone-700 dark:text-stone-300">
                {book.description}
              </p>
            </div>
          )}

          {/* Session History for this Book */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-500">
              Sessions Logged ({bookSessions.length})
            </h3>
            {bookSessions.length === 0 ? (
              <p className="text-xs text-stone-500">No sessions recorded for this book yet.</p>
            ) : (
              <div className="space-y-2">
                {bookSessions.map((s) => (
                  <div
                    key={s.id}
                    className="rounded-xl border border-stone-200 dark:border-stone-800 p-3 text-xs flex items-center justify-between gap-2 bg-white/60 dark:bg-ink-800/40"
                  >
                    <div>
                      <div className="font-medium text-stone-900 dark:text-stone-100 flex items-center gap-1.5">
                        <span>
                          p. {s.start_page} → {s.end_page} ({formatMinutesHuman(s.actual_minutes)})
                        </span>
                        {s.verified && (
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 inline" />
                        )}
                      </div>
                      <div className="text-[11px] text-stone-500">
                        {format(new Date(s.ended_at), 'MMM d, h:mm a')} · Predicted{' '}
                        {formatMinutesHuman(s.predicted_minutes)} · {s.wpm_observed} WPM
                      </div>
                    </div>
                    <span className="font-mono text-xs px-2 py-1 rounded-lg bg-stone-200/70 dark:bg-ink-700">
                      Trust {s.trust_score}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
