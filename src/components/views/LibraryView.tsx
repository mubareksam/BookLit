'use client';

import React, { useMemo, useState } from 'react';
import { BookOpen, Play, Plus, Search, Star } from 'lucide-react';
import { useBooklit } from '@/context/BooklitContext';
import { Book, GENRE_META } from '@/lib/types';

export function LibraryView() {
  const { books, openSessionFlow, setSelectedBookId, setAddBookModalOpen } = useBooklit();
  const [filter, setFilter] = useState<'all' | Book['status']>('all');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    return books.filter((b) => {
      if (filter !== 'all' && b.status !== filter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q);
      }
      return true;
    });
  }, [books, filter, search]);

  return (
    <div className="space-y-5 pb-20 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Library</h1>
          <p className="text-xs text-zinc-500">{books.length} book(s) in your collection.</p>
        </div>

        <button
          type="button"
          onClick={() => setAddBookModalOpen(true)}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold shrink-0"
        >
          <Plus className="w-4 h-4" />
          Add Book
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-2.5 sm:items-center justify-between min-w-0">
        <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
          {(['all', 'reading', 'tbr', 'paused', 'finished'] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setFilter(st)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium uppercase whitespace-nowrap shrink-0 ${
                filter === st
                  ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                  : 'bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-500'
              }`}
            >
              {st}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-60 shrink-0">
          <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter books…"
            className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-zinc-200 dark:border-zinc-800 p-10 text-center space-y-3">
          <BookOpen className="w-7 h-7 text-zinc-400 mx-auto" />
          <p className="text-xs text-zinc-500">
            {books.length === 0
              ? 'Your library is empty. Search or scan an ISBN to add books.'
              : 'No books match this shelf filter.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {filtered.map((book) => {
            const pct = Math.min(
              100,
              Math.round((book.current_page / Math.max(1, book.page_count)) * 100)
            );
            return (
              <div
                key={book.id}
                className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 flex flex-col justify-between gap-3 min-w-0"
              >
                <div className="flex gap-3 min-w-0">
                  <button
                    type="button"
                    onClick={() => setSelectedBookId(book.id)}
                    className="w-12 h-16 rounded-xl bg-gradient-to-br from-emerald-800 to-zinc-900 shrink-0 shadow flex items-center justify-center text-white"
                  >
                    <BookOpen className="w-4 h-4 opacity-80" />
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[10px] font-medium uppercase text-emerald-600 dark:text-emerald-400 truncate">
                        {GENRE_META[book.genre[0]]?.label}
                      </span>
                      <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500 shrink-0">
                        {book.status}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedBookId(book.id)}
                      className="text-sm font-bold text-left hover:text-emerald-600 truncate block max-w-full mt-0.5"
                    >
                      {book.title}
                    </button>
                    <p className="text-xs text-zinc-500 truncate">{book.author}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-[11px] text-zinc-500 font-mono">
                    <span>
                      p.{book.current_page}/{book.page_count}
                    </span>
                    <span>{pct}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                    <div
                      className="h-full bg-emerald-600 rounded-full"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-0.5">
                    {book.rating ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-500">
                        <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                        {book.rating}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setSelectedBookId(book.id)}
                        className="text-xs text-zinc-500 hover:underline"
                      >
                        Details
                      </button>
                    )}
                  </div>

                  {book.status !== 'finished' && (
                    <button
                      type="button"
                      onClick={() => openSessionFlow(book.id)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold"
                    >
                      <Play className="w-3 h-3 fill-current" />
                      Read
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
