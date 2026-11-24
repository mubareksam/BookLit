'use client';

import React, { useMemo, useState } from 'react';
import { Award, Check, Clock, Copy, Plus, Share2, Sparkles } from 'lucide-react';
import { useBooklit } from '@/context/BooklitContext';
import { GENRE_META } from '@/lib/types';
import { generateBookRecommendations, BookRecommendation } from '@/lib/domain/recommendationEngine';
import { formatMinutesHuman } from '@/lib/domain/speedModel';

export function RecommendationsAndRecapView({
  initialSection = 'recommendations',
}: {
  initialSection?: 'recommendations' | 'year_in_books';
}) {
  const { user, books, sessions, addBook, addTbrItem } = useBooklit();
  const [section, setSection] = useState<'recommendations' | 'year_in_books'>(initialSection);
  const [addedIds, setAddedIds] = useState<Record<string, string>>({});
  const [copiedRecap, setCopiedRecap] = useState(false);

  const recommendations = useMemo(() => {
    if (!user) return [];
    return generateBookRecommendations({
      user,
      userBooks: books,
      sessions,
    });
  }, [user, books, sessions]);

  const recapStats = useMemo(() => {
    const finished = books.filter((b) => b.status === 'finished');
    const verified = sessions.filter((s) => s.verified && !s.strike_issued);
    const totalMins = verified.reduce((acc, s) => acc + s.actual_minutes, 0);
    const totalPages = verified.reduce(
      (acc, s) => acc + Math.max(0, s.end_page - s.start_page),
      0
    );

    const genreCounts = new Map<string, number>();
    for (const b of books) {
      for (const g of b.genre) {
        genreCounts.set(g, (genreCounts.get(g) ?? 0) + 1);
      }
    }
    const topGenreKey =
      Array.from(genreCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ??
      'literary_fiction';

    return {
      year: new Date().getFullYear(),
      booksFinished: finished.length,
      finishedTitles: finished.map((b) => b.title),
      verifiedHours: Math.round((totalMins / 60) * 10) / 10,
      verifiedPages: totalPages,
      topGenreLabel:
        GENRE_META[topGenreKey as keyof typeof GENRE_META]?.label ?? 'Literary Fiction',
      streak: user?.streak_count ?? 0,
    };
  }, [books, sessions, user?.streak_count]);

  if (!user) return null;

  const handleAcceptRec = async (rec: BookRecommendation, target: 'tbr' | 'reading') => {
    const created = await addBook({
      title: rec.seed.title,
      author: rec.seed.author,
      isbn: rec.seed.isbn,
      genre: rec.seed.genre,
      subgenre: rec.seed.subgenre,
      page_count: rec.seed.page_count,
      word_count_estimate: rec.seed.word_count_estimate,
      difficulty_band: rec.seed.difficulty_band,
      medium_default: 'physical',
      description: rec.seed.description,
      source: rec.seed.source,
      status: target,
      sample_passages: rec.seed.sample_passages,
    });
    if (target === 'tbr') {
      await addTbrItem({
        bookId: created.id,
        notes: rec.rationale,
      });
    }
    setAddedIds((prev) => ({
      ...prev,
      [rec.seed.catalogId]: target === 'tbr' ? 'Added to TBR' : 'Started Reading',
    }));
  };

  const handleCopyRecap = async () => {
    const summary = `Booklit ${recapStats.year} Year in Books — ${user.display_name}\n• ${recapStats.booksFinished} Books Finished\n• ${recapStats.verifiedHours} Verified Reading Hours (${recapStats.verifiedPages} pages)\n• Top Genre: ${recapStats.topGenreLabel}\n• ${recapStats.streak}-Day Verified Habit Streak`;
    try {
      await navigator.clipboard.writeText(summary);
      setCopiedRecap(true);
      setTimeout(() => setCopiedRecap(false), 2500);
    } catch {}
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold text-stone-900 dark:text-stone-100">
            {section === 'recommendations'
              ? 'Speed-Matched Recommendations'
              : `${recapStats.year} Year in Books Recap`}
          </h1>
          <p className="text-xs text-stone-500 dark:text-stone-400">
            {section === 'recommendations'
              ? 'Hybrid content + genre-adjacency engine calibrated to your Bayesian reading speed and ratings.'
              : 'Your verified reading milestones in a calm, shareable Literary card.'}
          </p>
        </div>

        <div className="rounded-xl bg-stone-200/70 dark:bg-ink-800 p-1 flex gap-1">
          <button
            onClick={() => setSection('recommendations')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
              section === 'recommendations'
                ? 'bg-white dark:bg-ink-700 text-stone-900 dark:text-white shadow-sm'
                : 'text-stone-600 dark:text-stone-400'
            }`}
          >
            Recommendations
          </button>
          <button
            onClick={() => setSection('year_in_books')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
              section === 'year_in_books'
                ? 'bg-white dark:bg-ink-700 text-stone-900 dark:text-white shadow-sm'
                : 'text-stone-600 dark:text-stone-400'
            }`}
          >
            Year in Books
          </button>
        </div>
      </div>

      {section === 'recommendations' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {recommendations.map((rec) => {
            const statusText = addedIds[rec.seed.catalogId];
            return (
              <div
                key={rec.seed.catalogId}
                className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white/90 dark:bg-ink-900 p-5 flex flex-col justify-between gap-4"
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-wrap gap-1">
                      {rec.seed.genre.map((g) => (
                        <span
                          key={g}
                          className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${GENRE_META[g].badgeColor}`}
                        >
                          {GENRE_META[g].label}
                        </span>
                      ))}
                    </div>
                    <span className="text-xs font-mono font-semibold text-emerald-700 dark:text-emerald-300">
                      {rec.score}% Match
                    </span>
                  </div>

                  <div>
                    <h3 className="font-serif text-lg font-bold text-stone-900 dark:text-stone-100">
                      {rec.seed.title}
                    </h3>
                    <p className="text-xs text-stone-500">
                      {rec.seed.author} · {rec.seed.page_count} pages · Difficulty{' '}
                      {rec.seed.difficulty_band}/5
                    </p>
                  </div>

                  {/* Required One-Sentence Rationale */}
                  <div className="rounded-xl bg-emerald-950/5 dark:bg-emerald-950/30 border border-emerald-700/20 p-3 text-xs leading-relaxed text-stone-800 dark:text-stone-200">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-600 inline mr-1.5 -mt-0.5" />
                    {rec.rationale}
                  </div>

                  <p className="text-xs text-stone-600 dark:text-stone-400 line-clamp-2">
                    {rec.seed.description}
                  </p>
                </div>

                <div className="pt-3 border-t border-stone-200/70 dark:border-stone-800 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-mono text-stone-600 dark:text-stone-300 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-emerald-600" />
                    {formatMinutesHuman(rec.predictedMinutes)} (~{rec.sessionsToFinishEstimate}{' '}
                    sittings at {rec.wpmUsed} wpm)
                  </div>

                  {statusText ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                      <Check className="w-3.5 h-3.5" /> {statusText}
                    </span>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleAcceptRec(rec, 'tbr')}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-stone-300 dark:border-stone-700 text-xs font-medium hover:bg-stone-100 dark:hover:bg-ink-800"
                      >
                        <Plus className="w-3 h-3" /> TBR
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAcceptRec(rec, 'reading')}
                        className="px-3 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold"
                      >
                        Read Now
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* YEAR IN BOOKS SHAREABLE RECAP POSTER */
        <div className="max-w-xl mx-auto space-y-4">
          <div className="rounded-3xl bg-gradient-to-br from-[#0F1714] via-[#13221B] to-[#090A0D] text-paper-50 p-7 sm:p-9 border border-emerald-500/25 shadow-2xl space-y-6">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-[0.2em] text-emerald-400 font-semibold">
                Booklit · {recapStats.year} Year in Books
              </span>
              <Award className="w-5 h-5 text-emerald-400" />
            </div>

            <div className="space-y-1">
              <h2 className="font-serif text-3xl font-bold leading-tight">
                {user.display_name}’s Verified Reading Ledger
              </h2>
              <p className="text-xs text-stone-400">
                Every hour earned offline-first at a human pace.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4 py-2">
              <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
                <div className="text-[11px] uppercase tracking-wider text-stone-400">
                  Books Finished
                </div>
                <div className="font-mono text-3xl font-bold mt-1">
                  {recapStats.booksFinished}
                </div>
              </div>
              <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
                <div className="text-[11px] uppercase tracking-wider text-stone-400">
                  Verified Hours
                </div>
                <div className="font-mono text-3xl font-bold mt-1 text-emerald-400">
                  {recapStats.verifiedHours}h
                </div>
              </div>
              <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
                <div className="text-[11px] uppercase tracking-wider text-stone-400">
                  Signature Genre
                </div>
                <div className="font-serif text-base font-semibold mt-1.5">
                  {recapStats.topGenreLabel}
                </div>
              </div>
              <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
                <div className="text-[11px] uppercase tracking-wider text-stone-400">
                  Habit Streak
                </div>
                <div className="font-mono text-2xl font-bold mt-1">{recapStats.streak} days</div>
              </div>
            </div>

            {recapStats.finishedTitles.length > 0 && (
              <div className="space-y-1.5 pt-2 border-t border-white/10">
                <div className="text-[11px] uppercase tracking-wider text-stone-400">
                  Completed Shelf Highlights
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {recapStats.finishedTitles.map((t, i) => (
                    <span
                      key={i}
                      className="px-2.5 py-1 rounded-full bg-white/10 text-xs font-serif"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={handleCopyRecap}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold"
            >
              {copiedRecap ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copiedRecap ? 'Copied Shareable Summary!' : 'Share / Copy Recap Text'}
            </button>
            <span className="text-xs text-stone-500 inline-flex items-center gap-1">
              <Share2 className="w-3.5 h-3.5" /> Ready for book clubs
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
