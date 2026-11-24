'use client';

import React, { useMemo, useState } from 'react';
import { format } from 'date-fns';
import {
  BookOpen,
  Filter,
  Plus,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Star,
} from 'lucide-react';
import { useBooklit } from '@/context/BooklitContext';
import { BOOK_GENRES, BookGenre, GENRE_META, ReadingMedium } from '@/lib/types';
import { BookCoverArt } from '../BookCoverArt';
import { formatMinutesHuman, predictBookFinish } from '@/lib/domain/speedModel';

type SortField =
  | 'date_finished'
  | 'author'
  | 'title'
  | 'genre'
  | 'rating'
  | 'page_count'
  | 'verification_status';

export function LibraryView() {
  const {
    books,
    sessions,
    globalSearchQuery,
    setGlobalSearchQuery,
    setSelectedBookId,
    setAddBookModalOpen,
    openSessionFlow,
  } = useBooklit();

  const [sortField, setSortField] = useState<SortField>('date_finished');
  const [shelfFilter, setShelfFilter] = useState<'all' | 'finished' | 'reading' | 'tbr'>('all');
  const [mediumFilter, setMediumFilter] = useState<'all' | ReadingMedium>('all');
  const [genreFilter, setGenreFilter] = useState<'all' | BookGenre>('all');
  const [verifiedOnly, setVerifiedOnly] = useState(false);

  const booksById = useMemo(() => new Map(books.map((b) => [b.id, b])), [books]);
  const verifiedSessions = useMemo(
    () => sessions.filter((s) => s.verified && !s.strike_issued),
    [sessions]
  );

  // Per-book verification summary
  const bookVerificationMap = useMemo(() => {
    const map = new Map<string, { verifiedCount: number; verifiedMinutes: number }>();
    for (const s of sessions) {
      if (!s.verified || s.strike_issued) continue;
      const cur = map.get(s.book_id) ?? { verifiedCount: 0, verifiedMinutes: 0 };
      cur.verifiedCount += 1;
      cur.verifiedMinutes += s.actual_minutes;
      map.set(s.book_id, cur);
    }
    return map;
  }, [sessions]);

  const filteredBooks = useMemo(() => {
    const q = globalSearchQuery.trim().toLowerCase();
    const list = books.filter((b) => {
      if (shelfFilter !== 'all' && b.status !== shelfFilter) return false;
      if (mediumFilter !== 'all' && b.medium_default !== mediumFilter) return false;
      if (genreFilter !== 'all' && !b.genre.includes(genreFilter)) return false;
      if (verifiedOnly && (bookVerificationMap.get(b.id)?.verifiedCount ?? 0) === 0) {
        return false;
      }
      if (!q) return true;
      return (
        b.title.toLowerCase().includes(q) ||
        b.author.toLowerCase().includes(q) ||
        b.genre.some((g) => GENRE_META[g].label.toLowerCase().includes(q)) ||
        (b.isbn && b.isbn.includes(q))
      );
    });

    return list.sort((a, b) => {
      if (sortField === 'date_finished') {
        const da = a.finished_at ? new Date(a.finished_at).getTime() : 0;
        const dbTime = b.finished_at ? new Date(b.finished_at).getTime() : 0;
        if (dbTime !== da) return dbTime - da;
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      }
      if (sortField === 'author') return a.author.localeCompare(b.author);
      if (sortField === 'title') return a.title.localeCompare(b.title);
      if (sortField === 'genre') return (a.genre[0] ?? '').localeCompare(b.genre[0] ?? '');
      if (sortField === 'rating') return (b.rating ?? 0) - (a.rating ?? 0);
      if (sortField === 'page_count') return b.page_count - a.page_count;
      if (sortField === 'verification_status') {
        return (
          (bookVerificationMap.get(b.id)?.verifiedMinutes ?? 0) -
          (bookVerificationMap.get(a.id)?.verifiedMinutes ?? 0)
        );
      }
      return 0;
    });
  }, [
    books,
    globalSearchQuery,
    shelfFilter,
    mediumFilter,
    genreFilter,
    verifiedOnly,
    sortField,
    bookVerificationMap,
  ]);

  // Global search across sessions when query is entered
  const matchingSessions = useMemo(() => {
    const q = globalSearchQuery.trim().toLowerCase();
    if (!q) return [];
    return sessions
      .filter((s) => {
        const b = booksById.get(s.book_id);
        return (
          b?.title.toLowerCase().includes(q) ||
          s.medium.toLowerCase().includes(q) ||
          (s.notes && s.notes.toLowerCase().includes(q)) ||
          s.flags_json.some((f) => f.label.toLowerCase().includes(q))
        );
      })
      .slice(0, 5);
  }, [globalSearchQuery, sessions, booksById]);

  return (
    <div className="space-y-5 pb-20">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold text-stone-900 dark:text-stone-100">
            Read & Active Library
          </h1>
          <p className="text-xs text-stone-500 dark:text-stone-400">
            Search, sort, and filter across every genre, medium, and verification tier.
          </p>
        </div>
        <button
          onClick={() => setAddBookModalOpen(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold"
        >
          <Plus className="w-4 h-4" />
          Add Book
        </button>
      </div>

      {/* Search & Sort Chips */}
      <div className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white/80 dark:bg-ink-900 p-4 space-y-3">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-2.5" />
            <input
              type="text"
              value={globalSearchQuery}
              onChange={(e) => setGlobalSearchQuery(e.target.value)}
              placeholder="Search books, authors, ISBN, genres, or session notes…"
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-stone-300 dark:border-stone-700 bg-paper-50 dark:bg-ink-800 text-sm"
            />
          </div>

          <label className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-stone-300 dark:border-stone-700 text-xs font-medium cursor-pointer select-none">
            <input
              type="checkbox"
              checked={verifiedOnly}
              onChange={(e) => setVerifiedOnly(e.target.checked)}
              className="accent-emerald-700"
            />
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            Verified Only
          </label>
        </div>

        {/* Sort Chips */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="text-[11px] text-stone-500 inline-flex items-center gap-1 mr-1">
            <SlidersHorizontal className="w-3 h-3" /> Sort:
          </span>
          {(
            [
              { id: 'date_finished', label: 'Date Finished' },
              { id: 'title', label: 'Title' },
              { id: 'author', label: 'Author' },
              { id: 'genre', label: 'Genre' },
              { id: 'rating', label: 'Rating' },
              { id: 'page_count', label: 'Page Count' },
              { id: 'verification_status', label: 'Verification Status' },
            ] as { id: SortField; label: string }[]
          ).map((chip) => (
            <button
              key={chip.id}
              onClick={() => setSortField(chip.id)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition ${
                sortField === chip.id
                  ? 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900'
                  : 'bg-paper-100 dark:bg-ink-800 text-stone-600 dark:text-stone-400 hover:bg-stone-200/70'
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>

        {/* Filter Rail */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-stone-200/70 dark:border-stone-800 text-xs">
          <span className="text-[11px] text-stone-500 inline-flex items-center gap-1">
            <Filter className="w-3 h-3" /> Filters:
          </span>

          <select
            value={shelfFilter}
            onChange={(e) => setShelfFilter(e.target.value as typeof shelfFilter)}
            className="rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-ink-800 px-2.5 py-1"
          >
            <option value="all">All Shelves</option>
            <option value="finished">Finished (Read)</option>
            <option value="reading">Currently Reading</option>
            <option value="tbr">TBR</option>
          </select>

          <select
            value={mediumFilter}
            onChange={(e) => setMediumFilter(e.target.value as typeof mediumFilter)}
            className="rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-ink-800 px-2.5 py-1"
          >
            <option value="all">All Mediums</option>
            <option value="physical">Physical</option>
            <option value="ebook">E-Reader</option>
            <option value="audio">Audio</option>
          </select>

          <select
            value={genreFilter}
            onChange={(e) => setGenreFilter(e.target.value as typeof genreFilter)}
            className="rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-ink-800 px-2.5 py-1"
          >
            <option value="all">All Genres (Academic, Poetry, Fiction…)</option>
            {BOOK_GENRES.map((g) => (
              <option key={g} value={g}>
                {GENRE_META[g].label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Multi-Column Book Grid */}
      {filteredBooks.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-300 dark:border-stone-700 p-10 text-center text-sm text-stone-500">
          No books match the current filters.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredBooks.map((book) => {
            const vStat = bookVerificationMap.get(book.id);
            const pred = predictBookFinish(book, verifiedSessions, booksById);
            return (
              <div
                key={book.id}
                onClick={() => setSelectedBookId(book.id)}
                className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white/85 dark:bg-ink-900 p-4 flex flex-col justify-between gap-3 hover:border-emerald-700/40 cursor-pointer transition"
              >
                <div className="flex items-start gap-3.5">
                  <BookCoverArt book={book} size="md" />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full bg-paper-100 dark:bg-ink-800 text-stone-600 dark:text-stone-300">
                        {book.status} · {book.medium_default}
                      </span>
                      {vStat && vStat.verifiedCount > 0 && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
                          <ShieldCheck className="w-3.5 h-3.5" />
                          {formatMinutesHuman(vStat.verifiedMinutes)}
                        </span>
                      )}
                    </div>

                    <h3 className="font-serif font-bold text-base text-stone-900 dark:text-stone-100 leading-snug line-clamp-2">
                      {book.title}
                    </h3>
                    <p className="text-xs text-stone-500 truncate">{book.author}</p>

                    <div className="flex flex-wrap gap-1 pt-0.5">
                      {book.genre.map((g) => (
                        <span
                          key={g}
                          className={`text-[10px] px-2 py-0.5 rounded-full ${GENRE_META[g].badgeColor}`}
                        >
                          {GENRE_META[g].label}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-stone-200/70 dark:border-stone-800 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 text-stone-500">
                    <span className="font-mono">
                      {book.current_page}/{book.page_count}p
                    </span>
                    {book.rating && (
                      <span className="inline-flex items-center gap-0.5 text-amber-600 dark:text-amber-400 font-mono">
                        <Star className="w-3 h-3 fill-current" />
                        {book.rating}
                      </span>
                    )}
                    {book.finished_at && (
                      <span className="text-[11px]">
                        Finished {format(new Date(book.finished_at), 'MMM d')}
                      </span>
                    )}
                  </div>

                  {book.status !== 'finished' ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openSessionFlow(book.id);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-emerald-700/15 text-emerald-800 dark:text-emerald-300 font-medium hover:bg-emerald-700 hover:text-white transition"
                    >
                      ~{pred.formattedExpected} left · Read
                    </button>
                  ) : (
                    <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-1">
                      <BookOpen className="w-3 h-3" /> Read
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Global Session Search Matches */}
      {matchingSessions.length > 0 && (
        <div className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white/80 dark:bg-ink-900 p-4 space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-500">
            Matching Reading Sessions ({matchingSessions.length})
          </h3>
          {matchingSessions.map((s) => (
            <div key={s.id} className="text-xs flex items-center justify-between py-1.5">
              <span>
                <strong>{booksById.get(s.book_id)?.title}</strong> · p.{s.start_page}→{s.end_page}{' '}
                {s.notes ? `· "${s.notes}"` : ''}
              </span>
              <span className="font-mono text-stone-500">
                {formatMinutesHuman(s.actual_minutes)} · Trust {s.trust_score}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
