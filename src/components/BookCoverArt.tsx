'use client';

import React from 'react';
import { Book, GENRE_META } from '@/lib/types';

const PALETTE = [
  'from-emerald-900 via-emerald-800 to-teal-950',
  'from-indigo-950 via-slate-900 to-indigo-900',
  'from-amber-900 via-stone-900 to-amber-950',
  'from-rose-950 via-stone-900 to-rose-900',
  'from-cyan-950 via-slate-900 to-teal-900',
  'from-purple-950 via-slate-900 to-violet-950',
];

function hashTitle(title: string): number {
  let h = 0;
  for (let i = 0; i < title.length; i++) {
    h = (h * 31 + title.charCodeAt(i)) >>> 0;
  }
  return h;
}

export function BookCoverArt({
  book,
  size = 'md',
}: {
  book: Pick<Book, 'title' | 'author' | 'genre' | 'difficulty_band'>;
  size?: 'sm' | 'md' | 'lg';
}) {
  const gradient = PALETTE[hashTitle(book.title) % PALETTE.length];
  const primaryGenre = book.genre[0] ?? 'general_nonfiction';
  const genreLabel = GENRE_META[primaryGenre]?.label ?? 'Book';

  const dims =
    size === 'sm'
      ? 'w-12 h-16 p-1.5 text-[9px]'
      : size === 'lg'
      ? 'w-28 h-40 p-3.5 text-xs'
      : 'w-20 h-28 p-2.5 text-[10px]';

  return (
    <div
      className={`relative shrink-0 rounded-r-md rounded-l-[3px] bg-gradient-to-br ${gradient} text-paper-50 shadow-md overflow-hidden select-none flex flex-col justify-between border border-white/10 ${dims}`}
    >
      {/* Book spine crease */}
      <div className="absolute inset-y-0 left-0 w-1.5 bg-black/30 border-r border-white/10" />
      <div className="pl-1.5">
        <div className="uppercase tracking-wider text-[8px] text-paper-200/75 truncate">
          {size === 'sm' ? '' : genreLabel.split(' ')[0]}
        </div>
        <div
          className={`font-serif font-semibold leading-snug text-paper-50 mt-0.5 ${
            size === 'sm' ? 'line-clamp-2 text-[9px]' : 'line-clamp-3'
          }`}
        >
          {book.title}
        </div>
      </div>
      {size !== 'sm' && (
        <div className="pl-1.5 pt-1 border-t border-white/15 flex items-center justify-between gap-1 text-[9px] text-paper-200/80">
          <span className="truncate">{book.author.split('(')[0].trim()}</span>
          <span className="font-mono text-[8px] opacity-80">D{book.difficulty_band}</span>
        </div>
      )}
    </div>
  );
}
