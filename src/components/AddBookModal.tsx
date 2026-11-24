'use client';

import React, { useRef, useState } from 'react';
import { Barcode, BookPlus, Camera, Plus, Search, X } from 'lucide-react';
import { useBooklit } from '@/context/BooklitContext';
import { CatalogBookSeed } from '@/lib/domain/catalog';
import { Book, BookGenre, GENRE_META, ReadingMedium } from '@/lib/types';

export function AddBookModal() {
  const { addBookModalOpen, setAddBookModalOpen, addBook, addTbrItem, books } = useBooklit();
  const [tab, setTab] = useState<'search' | 'barcode' | 'manual'>('search');

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CatalogBookSeed[]>([]);
  const [searching, setSearching] = useState(false);

  const [isbnInput, setIsbnInput] = useState('');
  const [barcodeCameraOpen, setBarcodeCameraOpen] = useState(false);
  const [barcodeMsg, setBarcodeMsg] = useState('');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [pageCount, setPageCount] = useState(300);
  const [genre, setGenre] = useState<BookGenre>('literary_fiction');
  const [status, setStatus] = useState<Book['status']>('reading');
  const [medium, setMedium] = useState<ReadingMedium>('physical');

  if (!addBookModalOpen) return null;

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setBarcodeCameraOpen(false);
  };

  const closeModal = () => {
    stopCamera();
    setAddBookModalOpen(false);
  };

  const runSearch = async (q: string) => {
    setQuery(q);
    if (!q.trim()) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(`/api/books/search?q=${encodeURIComponent(q.trim())}`);
      if (res.ok) {
        const data = await res.json();
        setResults(data.results ?? []);
      }
    } finally {
      setSearching(false);
    }
  };

  const lookupIsbn = async (isbn: string) => {
    const clean = isbn.replace(/[^0-9Xx]/g, '');
    if (clean.length < 10) {
      setBarcodeMsg('Enter a valid 10- or 13-digit ISBN.');
      return;
    }
    setBarcodeMsg('Searching ISBN…');
    const res = await fetch(`/api/books/search?q=${encodeURIComponent(clean)}`);
    if (res.ok) {
      const data = await res.json();
      if (data.results && data.results.length > 0) {
        setResults(data.results);
        stopCamera();
        setTab('search');
        setBarcodeMsg('');
        return;
      }
    }
    setBarcodeMsg(`No match found for ${clean}—use Manual Entry.`);
  };

  const startLiveBarcodeScan = async () => {
    setBarcodeMsg('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
      });
      streamRef.current = stream;
      setBarcodeCameraOpen(true);
      setTimeout(() => {
        if (videoRef.current) videoRef.current.srcObject = stream;
      }, 80);

      const BarcodeDetectorCtor = (
        window as unknown as {
          BarcodeDetector?: new (opts: { formats: string[] }) => {
            detect: (el: HTMLVideoElement) => Promise<Array<{ rawValue: string }>>;
          };
        }
      ).BarcodeDetector;

      if (BarcodeDetectorCtor) {
        const detector = new BarcodeDetectorCtor({ formats: ['ean_13', 'ean_8'] });
        const poll = window.setInterval(async () => {
          if (!videoRef.current || !streamRef.current) {
            window.clearInterval(poll);
            return;
          }
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes.length > 0 && codes[0].rawValue) {
              window.clearInterval(poll);
              setIsbnInput(codes[0].rawValue);
              await lookupIsbn(codes[0].rawValue);
            }
          } catch {}
        }, 500);
      } else {
        setBarcodeMsg('Type the ISBN printed above the barcode if auto-scan is unavailable.');
      }
    } catch {
      setBarcodeMsg('Camera permission denied—enter ISBN manually below.');
    }
  };

  const handleAddSeed = async (item: CatalogBookSeed, targetStatus: 'reading' | 'tbr') => {
    const created = await addBook({
      title: item.title,
      author: item.author,
      isbn: item.isbn || null,
      genre: item.genre,
      subgenre: item.subgenre,
      page_count: item.page_count,
      word_count_estimate: item.word_count_estimate,
      difficulty_band: item.difficulty_band,
      medium_default: 'physical',
      description: item.description,
      source: item.source,
      status: targetStatus,
      sample_passages: item.sample_passages,
    });
    if (targetStatus === 'tbr') {
      await addTbrItem({ bookId: created.id });
    }
    closeModal();
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !author.trim()) return;
    const pages = Math.max(20, pageCount);
    const created = await addBook({
      title: title.trim(),
      author: author.trim(),
      page_count: pages,
      word_count_estimate: pages * 280,
      genre: [genre],
      difficulty_band: 3,
      description: '',
      status,
      medium_default: medium,
    });
    if (status === 'tbr') {
      await addTbrItem({ bookId: created.id });
    }
    setTitle('');
    setAuthor('');
    closeModal();
  };

  const existingTitles = new Set(books.map((b) => b.title.toLowerCase()));

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full max-w-lg rounded-t-3xl sm:rounded-3xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl max-h-[88vh] flex flex-col overflow-hidden">
        <div className="px-5 py-3.5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookPlus className="w-4 h-4 text-emerald-600" />
            <h2 className="text-sm font-semibold">Add Book</h2>
          </div>
          <button
            onClick={closeModal}
            className="p-1.5 rounded-xl text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 pt-3">
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-zinc-100 dark:bg-zinc-800 p-1 text-xs font-medium">
            <button
              type="button"
              onClick={() => {
                stopCamera();
                setTab('search');
              }}
              className={`py-1.5 rounded-lg ${
                tab === 'search' ? 'bg-white dark:bg-zinc-700 shadow-sm' : 'text-zinc-500'
              }`}
            >
              Search
            </button>
            <button
              type="button"
              onClick={() => setTab('barcode')}
              className={`py-1.5 rounded-lg ${
                tab === 'barcode' ? 'bg-white dark:bg-zinc-700 shadow-sm' : 'text-zinc-500'
              }`}
            >
              ISBN Scan
            </button>
            <button
              type="button"
              onClick={() => {
                stopCamera();
                setTab('manual');
              }}
              className={`py-1.5 rounded-lg ${
                tab === 'manual' ? 'bg-white dark:bg-zinc-700 shadow-sm' : 'text-zinc-500'
              }`}
            >
              Manual
            </button>
          </div>
        </div>

        <div className="p-5 overflow-y-auto space-y-4">
          {tab === 'search' && (
            <div className="space-y-3">
              <div className="relative">
                <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => runSearch(e.target.value)}
                  placeholder="Search title or author (e.g. Dune, Atomic Habits)…"
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-xs"
                />
              </div>

              {searching && <p className="text-xs text-zinc-500">Searching catalog…</p>}

              {!query.trim() && results.length === 0 && (
                <p className="text-xs text-zinc-500 text-center py-6">
                  Search by title, author, or ISBN to add books to your library.
                </p>
              )}

              <div className="space-y-2">
                {results.map((item, idx) => {
                  const alreadyInLib = existingTitles.has(item.title.toLowerCase());
                  return (
                    <div
                      key={`${item.catalogId}-${idx}`}
                      className="flex items-center justify-between gap-3 p-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 min-w-0"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className="w-9 h-12 rounded-lg shrink-0"
                          style={{ backgroundColor: item.cover_color || '#065f46' }}
                        />
                        <div className="min-w-0">
                          <h3 className="text-xs font-semibold truncate">{item.title}</h3>
                          <p className="text-[11px] text-zinc-500 truncate">
                            {item.author} · {item.page_count}p
                          </p>
                        </div>
                      </div>

                      {alreadyInLib ? (
                        <span className="text-[11px] px-2.5 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-500 shrink-0">
                          Added
                        </span>
                      ) : (
                        <div className="flex gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleAddSeed(item, 'tbr')}
                            className="px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-[11px] font-medium"
                          >
                            + TBR
                          </button>
                          <button
                            type="button"
                            onClick={() => handleAddSeed(item, 'reading')}
                            className="px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-[11px] font-semibold"
                          >
                            Read
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {tab === 'barcode' && (
            <div className="space-y-3">
              {!barcodeCameraOpen ? (
                <button
                  type="button"
                  onClick={startLiveBarcodeScan}
                  className="w-full py-3 rounded-2xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-semibold flex items-center justify-center gap-2"
                >
                  <Camera className="w-4 h-4" />
                  Scan ISBN Barcode with Camera
                </button>
              ) : (
                <div className="rounded-2xl overflow-hidden border border-zinc-300 dark:border-zinc-700 bg-black">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-48 object-cover"
                  />
                  <div className="p-2.5 flex justify-between items-center text-xs text-zinc-300">
                    <span>Point at back-cover ISBN barcode</span>
                    <button
                      type="button"
                      onClick={stopCamera}
                      className="px-2.5 py-1 rounded bg-white/10"
                    >
                      Close
                    </button>
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <div className="relative flex-1 min-w-0">
                  <Barcode className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={isbnInput}
                    onChange={(e) => setIsbnInput(e.target.value)}
                    placeholder="e.g. 9780441172719"
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 font-mono text-xs"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => lookupIsbn(isbnInput)}
                  className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold shrink-0"
                >
                  Lookup
                </button>
              </div>

              {barcodeMsg && <p className="text-xs text-zinc-500">{barcodeMsg}</p>}
            </div>
          )}

          {tab === 'manual' && (
            <form onSubmit={handleManualSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">Title *</label>
                <input
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. The Brothers Karamazov"
                  className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-xs"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-500 mb-1">Author *</label>
                  <input
                    required
                    value={author}
                    onChange={(e) => setAuthor(e.target.value)}
                    placeholder="e.g. Fyodor Dostoevsky"
                    className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-500 mb-1">Pages *</label>
                  <input
                    type="number"
                    min={20}
                    max={5000}
                    value={pageCount}
                    onChange={(e) => setPageCount(Number(e.target.value) || 250)}
                    className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 font-mono text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-xs font-medium text-zinc-500 mb-1">Genre</label>
                  <select
                    value={genre}
                    onChange={(e) => setGenre(e.target.value as BookGenre)}
                    className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-2.5 py-2 text-xs"
                  >
                    {(Object.keys(GENRE_META) as BookGenre[]).map((g) => (
                      <option key={g} value={g}>
                        {GENRE_META[g].label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-500 mb-1">Shelf</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as Book['status'])}
                    className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-2.5 py-2 text-xs"
                  >
                    <option value="reading">Reading</option>
                    <option value="tbr">TBR Queue</option>
                    <option value="finished">Finished</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-500 mb-1">Medium</label>
                  <select
                    value={medium}
                    onChange={(e) => setMedium(e.target.value as ReadingMedium)}
                    className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-2.5 py-2 text-xs"
                  >
                    <option value="physical">Physical</option>
                    <option value="ebook">E-Reader</option>
                    <option value="audio">Audiobook</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                Save Book
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
