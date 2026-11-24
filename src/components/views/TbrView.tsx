'use client';

import React, { useMemo } from 'react';
import { ArrowDown, ArrowUp, ListTodo, Play, Plus, Trash2 } from 'lucide-react';
import { useBooklit } from '@/context/BooklitContext';
import { GENRE_META } from '@/lib/types';
import { predictBookFinish } from '@/lib/domain/speedModel';

export function TbrView() {
  const {
    books,
    sessions,
    tbrItems,
    reorderTbrItems,
    promoteTbrToReading,
    deleteTbrItem,
    openSessionFlow,
    setAddBookModalOpen,
    setSelectedBookId,
  } = useBooklit();

  const booksById = useMemo(() => new Map(books.map((b) => [b.id, b])), [books]);
  const verifiedSessions = useMemo(
    () => sessions.filter((s) => s.verified && !s.strike_issued),
    [sessions]
  );

  const activeTbr = useMemo(
    () => tbrItems.filter((t) => !t.completed_at).sort((a, b) => a.priority - b.priority),
    [tbrItems]
  );

  const totalHours = useMemo(() => {
    let mins = 0;
    for (const item of activeTbr) {
      const book = item.book_id ? booksById.get(item.book_id) : null;
      if (book) {
        mins += predictBookFinish(book, verifiedSessions, booksById).expectedMinutes;
      } else {
        mins += 360;
      }
    }
    return Math.round((mins / 60) * 10) / 10;
  }, [activeTbr, verifiedSessions, booksById]);

  const moveRank = async (idx: number, dir: -1 | 1) => {
    const next = [...activeTbr];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    await reorderTbrItems(next.map((t) => t.id));
  };

  return (
    <div className="space-y-5 pb-20 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">TBR Queue</h1>
          <p className="text-xs text-zinc-500">
            {activeTbr.length} queued · ~{totalHours}h total reading time
          </p>
        </div>

        <button
          type="button"
          onClick={() => setAddBookModalOpen(true)}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold shrink-0"
        >
          <Plus className="w-4 h-4" />
          Add to TBR
        </button>
      </div>

      {activeTbr.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-zinc-200 dark:border-zinc-800 p-10 text-center space-y-3">
          <ListTodo className="w-7 h-7 text-zinc-400 mx-auto" />
          <p className="text-xs text-zinc-500">
            Queue books you want to read next—each shows a genre-calibrated time estimate.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {activeTbr.map((item, idx) => {
            const book = item.book_id ? booksById.get(item.book_id) : null;
            const pred = book ? predictBookFinish(book, verifiedSessions, booksById) : null;
            const title = book?.title ?? item.free_text_title ?? 'Untitled Book';
            const author = book?.author ?? item.free_text_author ?? 'Unknown Author';
            const genreKey = book?.genre[0] ?? item.free_text_genre ?? 'general_nonfiction';

            return (
              <div
                key={item.id}
                className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 min-w-0"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="flex flex-col gap-0.5 shrink-0">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => moveRank(idx, -1)}
                      className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={idx === activeTbr.length - 1}
                      onClick={() => moveRank(idx, 1)}
                      className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <span className="font-mono text-xs text-zinc-400 w-5 shrink-0">#{idx + 1}</span>

                  <div className="min-w-0">
                    {book ? (
                      <button
                        type="button"
                        onClick={() => setSelectedBookId(book.id)}
                        className="text-sm font-bold text-left hover:text-emerald-600 truncate block max-w-full"
                      >
                        {title}
                      </button>
                    ) : (
                      <div className="text-sm font-bold truncate">{title}</div>
                    )}
                    <p className="text-xs text-zinc-500 truncate">
                      {author} · {GENRE_META[genreKey]?.label}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 ml-auto shrink-0">
                  {pred && (
                    <span className="font-mono text-xs text-emerald-600 dark:text-emerald-400">
                      ~{pred.formattedExpected}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={async () => {
                      await promoteTbrToReading(item.id);
                      if (book) openSessionFlow(book.id);
                    }}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-semibold"
                  >
                    <Play className="w-3 h-3 fill-current" />
                    Start
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteTbrItem(item.id)}
                    aria-label="Remove from TBR"
                    className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-500"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
