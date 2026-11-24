'use client';

import React, { useMemo, useState } from 'react';
import { Barcode, BookPlus, Check, Search, Sparkles, X } from 'lucide-react';
import { useBooklit } from '@/context/BooklitContext';
import { BOOK_GENRES, BookGenre, GENRE_META, ReadingMedium } from '@/lib/types';
import { CATALOG_BOOKS, CatalogBookSeed, searchCatalog } from '@/lib/domain/catalog';

export function AddBookModal() {
  const { addBookModalOpen, setAddBookModalOpen, addBook, addTbrItem } = useBooklit();

  const [tab, setTab] = useState<'catalog' | 'barcode' | 'manual'>('catalog');
  const [searchQuery, setSearchQuery] = useState('');
  const [barcodeInput, setBarcodeInput] = useState('');

  // Manual form
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [isbn, setIsbn] = useState('');
  const [selectedGenres, setSelectedGenres] = useState<BookGenre[]>(['general_nonfiction']);
  const [pageCount, setPageCount] = useState<number>(280);
  const [wordCountEst, setWordCountEst] = useState<string>('');
  const [difficulty, setDifficulty] = useState<1 | 2 | 3 | 4 | 5>(3);
  const [medium, setMedium] = useState<ReadingMedium>('physical');
  const [destination, setDestination] = useState<'reading' | 'tbr'>('reading');
  const [description, setDescription] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const catalogMatches = useMemo(() => searchCatalog(searchQuery), [searchQuery]);
  const barcodeMatch = useMemo(() => {
    const clean = barcodeInput.replace(/[^0-9x]/gi, '');
    if (clean.length < 4) return null;
    return CATALOG_BOOKS.find((c) => c.isbn.includes(clean)) ?? null;
  }, [barcodeInput]);

  if (!addBookModalOpen) return null;

  const handleQuickAddSeed = async (seed: CatalogBookSeed, target: 'reading' | 'tbr') => {
    const created = await addBook({
      title: seed.title,
      author: seed.author,
      isbn: seed.isbn,
      genre: seed.genre,
      subgenre: seed.subgenre,
      page_count: seed.page_count,
      word_count_estimate: seed.word_count_estimate,
      difficulty_band: seed.difficulty_band,
      medium_default: 'physical',
      description: seed.description,
      source: seed.source,
      status: target,
      sample_passages: seed.sample_passages,
    });
    if (target === 'tbr') {
      await addTbrItem({
        bookId: created.id,
        notes: `Added from ${seed.source}`,
      });
    }
    setAddBookModalOpen(false);
  };

  const toggleGenre = (g: BookGenre) => {
    setSelectedGenres((prev) => {
      if (prev.includes(g)) {
        return prev.length > 1 ? prev.filter((item) => item !== g) : prev;
      }
      const next = [...prev, g];
      setDifficulty(GENRE_META[next[0]].defaultDifficulty);
      return next;
    });
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setErrorMsg('Title is required.');
      return;
    }
    if (selectedGenres.length === 0) {
      setErrorMsg('Select at least one genre.');
      return;
    }
    const created = await addBook({
      title,
      author,
      isbn: isbn || null,
      genre: selectedGenres,
      page_count: Math.max(5, Number(pageCount) || 250),
      word_count_estimate: wordCountEst ? Number(wordCountEst) : undefined,
      difficulty_band: difficulty,
      medium_default: medium,
      description,
      source: 'manual',
      status: destination,
    });
    if (destination === 'tbr') {
      await addTbrItem({ bookId: created.id });
    }
    setAddBookModalOpen(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full max-w-2xl bg-paper-50 dark:bg-ink-900 rounded-t-3xl sm:rounded-2xl border border-stone-200 dark:border-stone-800 shadow-2xl max-h-[92vh] flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-stone-200 dark:border-stone-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <BookPlus className="w-4 h-4 text-emerald-700 dark:text-emerald-300" />
            <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-100">
              Add Book (Catalog Search · ISBN Barcode · Manual)
            </h2>
          </div>
          <button
            onClick={() => setAddBookModalOpen(false)}
            aria-label="Close add book modal"
            className="p-1.5 rounded-lg text-stone-500 hover:bg-stone-200/70 dark:hover:bg-ink-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode Tabs */}
        <div className="px-5 pt-3 flex gap-2 border-b border-stone-200 dark:border-stone-800 pb-3">
          {[
            { id: 'catalog', label: 'Search Catalog', icon: Search },
            { id: 'barcode', label: 'Scan ISBN Barcode', icon: Barcode },
            { id: 'manual', label: 'Manual Entry', icon: BookPlus },
          ].map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id as typeof tab)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition ${
                  tab === t.id
                    ? 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900'
                    : 'text-stone-600 dark:text-stone-400 hover:bg-stone-200/60 dark:hover:bg-ink-800'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>

        <div className="p-5 overflow-y-auto space-y-4">
          {tab === 'catalog' && (
            <div className="space-y-3">
              <div className="relative">
                <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-2.5" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search OpenLibrary / Google Books seed by title, author, genre, or ISBN…"
                  className="w-full pl-9 pr-4 py-2 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-ink-800 text-sm"
                />
              </div>

              <div className="space-y-2.5 max-h-[54vh] overflow-y-auto pr-1">
                {catalogMatches.map((seed) => (
                  <div
                    key={seed.catalogId}
                    className="rounded-xl border border-stone-200 dark:border-stone-800 p-3.5 bg-white/70 dark:bg-ink-800/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-serif font-semibold text-sm text-stone-900 dark:text-stone-100">
                          {seed.title}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-stone-200/80 dark:bg-ink-700 font-mono">
                          {seed.source}
                        </span>
                      </div>
                      <p className="text-xs text-stone-600 dark:text-stone-400">
                        {seed.author} · {seed.page_count} pages · ~
                        {Math.round(seed.word_count_estimate / 1000)}k words · Difficulty{' '}
                        {seed.difficulty_band}/5
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {seed.genre.map((g) => (
                          <span
                            key={g}
                            className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${GENRE_META[g].badgeColor}`}
                          >
                            {GENRE_META[g].label}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleQuickAddSeed(seed, 'tbr')}
                        className="px-3 py-1.5 rounded-lg border border-stone-300 dark:border-stone-700 text-xs font-medium hover:bg-stone-100 dark:hover:bg-ink-700"
                      >
                        + TBR
                      </button>
                      <button
                        type="button"
                        onClick={() => handleQuickAddSeed(seed, 'reading')}
                        className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-medium"
                      >
                        Start Reading
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'barcode' && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-dashed border-stone-300 dark:border-stone-700 p-5 text-center space-y-3 bg-paper-100/70 dark:bg-ink-800/40">
                <Barcode className="w-8 h-8 text-emerald-700 dark:text-emerald-300 mx-auto" />
                <p className="text-xs text-stone-600 dark:text-stone-300 max-w-md mx-auto">
                  Enter an ISBN-13 barcode from the back cover (or test one of the sample barcodes
                  below) to auto-populate pages, word density, and genre difficulty.
                </p>
                <input
                  type="text"
                  value={barcodeInput}
                  onChange={(e) => setBarcodeInput(e.target.value)}
                  placeholder="Enter ISBN-13 (e.g. 9780312424404)…"
                  className="max-w-xs w-full mx-auto rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-ink-900 px-3.5 py-2 font-mono text-sm text-center"
                />
                <div className="flex flex-wrap justify-center gap-1.5 pt-1">
                  {[
                    { isbn: '9780312424404', label: 'Gilead (Literary/Religious)' },
                    { isbn: '9780226458120', label: 'Kuhn (Academic)' },
                    { isbn: '9780394820378', label: 'Phantom Tollbooth (Children’s)' },
                    { isbn: '9780593135204', label: 'Project Hail Mary' },
                  ].map((sample) => (
                    <button
                      key={sample.isbn}
                      type="button"
                      onClick={() => setBarcodeInput(sample.isbn)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-700/10 text-emerald-800 dark:text-emerald-300 text-[11px] font-medium"
                    >
                      <Sparkles className="w-3 h-3" />
                      {sample.label}
                    </button>
                  ))}
                </div>
              </div>

              {barcodeMatch && (
                <div className="rounded-xl border border-emerald-600/35 bg-emerald-600/10 p-4 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-mono text-emerald-800 dark:text-emerald-300">
                      ISBN {barcodeMatch.isbn} Matched via {barcodeMatch.source}
                    </div>
                    <div className="font-serif font-semibold text-base text-stone-900 dark:text-white">
                      {barcodeMatch.title}
                    </div>
                    <div className="text-xs text-stone-600 dark:text-stone-300">
                      {barcodeMatch.author} · {barcodeMatch.page_count} pages · Difficulty{' '}
                      {barcodeMatch.difficulty_band}/5
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleQuickAddSeed(barcodeMatch, 'reading')}
                    className="px-4 py-2 rounded-xl bg-emerald-700 text-white text-xs font-semibold shrink-0"
                  >
                    Add Book
                  </button>
                </div>
              )}
            </div>
          )}

          {tab === 'manual' && (
            <form onSubmit={handleManualSubmit} className="space-y-4">
              {errorMsg && (
                <div className="rounded-lg bg-rose-500/10 text-rose-600 px-3 py-2 text-xs">
                  {errorMsg}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-stone-600 dark:text-stone-300 mb-1">
                    Title *
                  </label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Introduction to Algorithms"
                    className="w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-ink-800 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-600 dark:text-stone-300 mb-1">
                    Author (encouraged)
                  </label>
                  <input
                    type="text"
                    value={author}
                    onChange={(e) => setAuthor(e.target.value)}
                    placeholder="e.g. Cormen, Leiserson, Rivest, Stein"
                    className="w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-ink-800 px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-600 dark:text-stone-300 mb-1.5">
                  Genres * (supports Academic, Technical, Religious, Poetry, Reference, Children’s &
                  Fiction — sets baseline WPM priors)
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {BOOK_GENRES.map((g) => {
                    const active = selectedGenres.includes(g);
                    return (
                      <button
                        key={g}
                        type="button"
                        onClick={() => toggleGenre(g)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition ${
                          active
                            ? 'border-emerald-700 bg-emerald-700 text-white'
                            : 'border-stone-300 dark:border-stone-700 text-stone-600 dark:text-stone-300'
                        }`}
                      >
                        {active && <Check className="w-3 h-3" />}
                        {GENRE_META[g].label} (~{GENRE_META[g].priorWpm} wpm)
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-medium text-stone-600 dark:text-stone-300 mb-1">
                    Page Count *
                  </label>
                  <input
                    type="number"
                    min={5}
                    max={9999}
                    value={pageCount}
                    onChange={(e) => setPageCount(Number(e.target.value) || 200)}
                    className="w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-ink-800 px-3 py-2 font-mono text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-600 dark:text-stone-300 mb-1">
                    Word Estimate (opt)
                  </label>
                  <input
                    type="number"
                    value={wordCountEst}
                    onChange={(e) => setWordCountEst(e.target.value)}
                    placeholder={`~${
                      pageCount * GENRE_META[selectedGenres[0]].wordsPerPageDefault
                    }`}
                    className="w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-ink-800 px-3 py-2 font-mono text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-600 dark:text-stone-300 mb-1">
                    Difficulty (1–5)
                  </label>
                  <select
                    value={difficulty}
                    onChange={(e) =>
                      setDifficulty(Number(e.target.value) as 1 | 2 | 3 | 4 | 5)
                    }
                    className="w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-ink-800 px-3 py-2 text-sm"
                  >
                    <option value={1}>1 — Light / Accessible</option>
                    <option value={2}>2 — Brisk Narrative</option>
                    <option value={3}>3 — Standard</option>
                    <option value={4}>4 — Dense / Contemplative</option>
                    <option value={5}>5 — Technical / Academic</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-600 dark:text-stone-300 mb-1">
                    Medium
                  </label>
                  <select
                    value={medium}
                    onChange={(e) => setMedium(e.target.value as ReadingMedium)}
                    className="w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-ink-800 px-3 py-2 text-sm"
                  >
                    <option value="physical">Physical Book</option>
                    <option value="ebook">E-Book</option>
                    <option value="audio">Audiobook</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-stone-600 dark:text-stone-300 mb-1">
                    ISBN (optional)
                  </label>
                  <input
                    type="text"
                    value={isbn}
                    onChange={(e) => setIsbn(e.target.value)}
                    placeholder="978..."
                    className="w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-ink-800 px-3 py-2 font-mono text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-600 dark:text-stone-300 mb-1">
                    Shelf Destination
                  </label>
                  <select
                    value={destination}
                    onChange={(e) => setDestination(e.target.value as 'reading' | 'tbr')}
                    className="w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-ink-800 px-3 py-2 text-sm"
                  >
                    <option value="reading">Currently Reading</option>
                    <option value="tbr">To-Be-Read (TBR Queue)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-600 dark:text-stone-300 mb-1">
                  Notes / Description (optional)
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-ink-800 px-3 py-2 text-xs"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 rounded-2xl bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold"
              >
                Save Book to Library
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
