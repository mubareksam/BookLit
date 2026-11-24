'use client';

import React, { useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Bell,
  Calendar,
  CheckCircle2,
  GripVertical,
  Play,
  Plus,
  Trash2,
} from 'lucide-react';
import { useBooklit } from '@/context/BooklitContext';
import { BOOK_GENRES, BookGenre, GENRE_META } from '@/lib/types';
import { predictBookFinish } from '@/lib/domain/speedModel';

export function TbrView() {
  const {
    books,
    sessions,
    tbrItems,
    addTbrItem,
    reorderTbrItems,
    updateTbrItem,
    promoteTbrToReading,
    deleteTbrItem,
    setAddBookModalOpen,
  } = useBooklit();

  const [freeTitle, setFreeTitle] = useState('');
  const [freeAuthor, setFreeAuthor] = useState('');
  const [freeGenre, setFreeGenre] = useState<BookGenre>('literary_fiction');
  const [plannedDate, setPlannedDate] = useState('');
  const [notes, setNotes] = useState('');
  const [draggedId, setDraggedId] = useState<string | null>(null);

  const booksById = useMemo(() => new Map(books.map((b) => [b.id, b])), [books]);
  const verifiedSessions = useMemo(
    () => sessions.filter((s) => s.verified && !s.strike_issued),
    [sessions]
  );

  const activeItems = useMemo(
    () => tbrItems.filter((t) => !t.completed_at).sort((a, b) => a.priority - b.priority),
    [tbrItems]
  );
  const completedItems = useMemo(
    () => tbrItems.filter((t) => Boolean(t.completed_at)),
    [tbrItems]
  );

  const handleAddFreeText = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!freeTitle.trim()) return;
    await addTbrItem({
      freeTextTitle: freeTitle,
      freeTextAuthor: freeAuthor,
      freeTextGenre: freeGenre,
      plannedStartDate: plannedDate || null,
      reminderEnabled: Boolean(plannedDate),
      notes,
    });
    setFreeTitle('');
    setFreeAuthor('');
    setPlannedDate('');
    setNotes('');
  };

  const moveItem = async (index: number, direction: -1 | 1) => {
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= activeItems.length) return;
    const ids = activeItems.map((i) => i.id);
    const [removed] = ids.splice(index, 1);
    ids.splice(targetIdx, 0, removed);
    await reorderTbrItems(ids);
  };

  const handleDropOn = async (targetId: string) => {
    if (!draggedId || draggedId === targetId) return;
    const ids = activeItems.map((i) => i.id);
    const fromIdx = ids.indexOf(draggedId);
    const toIdx = ids.indexOf(targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    ids.splice(fromIdx, 1);
    ids.splice(toIdx, 0, draggedId);
    setDraggedId(null);
    await reorderTbrItems(ids);
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold text-stone-900 dark:text-stone-100">
            To-Be-Read (TBR) Planner
          </h1>
          <p className="text-xs text-stone-500 dark:text-stone-400">
            Drag to prioritize, schedule start dates, and see predicted finish times before you
            commit.
          </p>
        </div>
        <button
          onClick={() => setAddBookModalOpen(true)}
          className="px-4 py-2 rounded-xl border border-stone-300 dark:border-stone-700 text-xs font-semibold hover:bg-white dark:hover:bg-ink-800"
        >
          + Add from Catalog / ISBN
        </button>
      </div>

      {/* Quick Free-Text TBR Entry */}
      <form
        onSubmit={handleAddFreeText}
        className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white/85 dark:bg-ink-900 p-4 space-y-3"
      >
        <div className="text-xs font-semibold uppercase tracking-wider text-stone-500">
          Quick-Jot Any Book Idea (Free-Text or Uncatalogued)
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
          <input
            type="text"
            value={freeTitle}
            onChange={(e) => setFreeTitle(e.target.value)}
            placeholder="Book title *"
            className="sm:col-span-2 rounded-xl border border-stone-300 dark:border-stone-700 bg-paper-50 dark:bg-ink-800 px-3 py-2 text-sm"
          />
          <input
            type="text"
            value={freeAuthor}
            onChange={(e) => setFreeAuthor(e.target.value)}
            placeholder="Author"
            className="rounded-xl border border-stone-300 dark:border-stone-700 bg-paper-50 dark:bg-ink-800 px-3 py-2 text-sm"
          />
          <select
            value={freeGenre}
            onChange={(e) => setFreeGenre(e.target.value as BookGenre)}
            className="rounded-xl border border-stone-300 dark:border-stone-700 bg-paper-50 dark:bg-ink-800 px-3 py-2 text-xs"
          >
            {BOOK_GENRES.map((g) => (
              <option key={g} value={g}>
                {GENRE_META[g].label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1.5 text-xs text-stone-600 dark:text-stone-400">
            <Calendar className="w-3.5 h-3.5" />
            <span>Planned start:</span>
            <input
              type="date"
              value={plannedDate}
              onChange={(e) => setPlannedDate(e.target.value)}
              className="rounded-lg border border-stone-300 dark:border-stone-700 bg-paper-50 dark:bg-ink-800 px-2.5 py-1 text-xs"
            />
          </div>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional reading note (e.g. 'Read for autumn seminar')"
            className="flex-1 min-w-[200px] rounded-xl border border-stone-300 dark:border-stone-700 bg-paper-50 dark:bg-ink-800 px-3 py-1.5 text-xs"
          />
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold"
          >
            <Plus className="w-3.5 h-3.5" />
            Add to TBR
          </button>
        </div>
      </form>

      {/* Active Draggable TBR Queue */}
      <div className="space-y-2.5">
        {activeItems.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-stone-300 dark:border-stone-700 p-8 text-center text-xs text-stone-500">
            Your TBR checklist is empty—add a book above or from Recommendations.
          </div>
        ) : (
          activeItems.map((item, idx) => {
            const linkedBook = item.book_id ? booksById.get(item.book_id) : null;
            const title = linkedBook?.title ?? item.free_text_title ?? 'Untitled';
            const author = linkedBook?.author ?? item.free_text_author ?? 'Unknown Author';
            const genre = linkedBook?.genre[0] ?? item.free_text_genre ?? 'general_nonfiction';
            const pred = linkedBook
              ? predictBookFinish(linkedBook, verifiedSessions, booksById)
              : null;

            return (
              <div
                key={item.id}
                draggable
                onDragStart={() => setDraggedId(item.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDropOn(item.id)}
                className={`rounded-2xl border bg-white/90 dark:bg-ink-900 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition ${
                  draggedId === item.id
                    ? 'border-emerald-600 opacity-60'
                    : 'border-stone-200 dark:border-stone-800 hover:border-stone-300 dark:hover:border-stone-700'
                }`}
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className="flex flex-col items-center gap-1 pt-0.5 text-stone-400">
                    <GripVertical className="w-4 h-4 cursor-grab" />
                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-paper-100 dark:bg-ink-800 text-stone-600 dark:text-stone-300">
                      #{idx + 1}
                    </span>
                  </div>

                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-serif font-bold text-base text-stone-900 dark:text-stone-100">
                        {title}
                      </h3>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${GENRE_META[genre].badgeColor}`}
                      >
                        {GENRE_META[genre].label}
                      </span>
                      {pred && (
                        <span className="text-[11px] font-mono text-emerald-700 dark:text-emerald-300">
                          Est. {pred.formattedExpected}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-stone-500">{author}</p>
                    {item.notes && (
                      <p className="text-xs text-stone-600 dark:text-stone-400 italic">
                        “{item.notes}”
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-3 pt-1 text-xs">
                      <label className="inline-flex items-center gap-1.5 text-stone-500">
                        <Calendar className="w-3.5 h-3.5" />
                        <input
                          type="date"
                          value={item.planned_start_date ?? ''}
                          onChange={(e) =>
                            updateTbrItem(item.id, {
                              planned_start_date: e.target.value || null,
                            })
                          }
                          className="bg-transparent border-b border-stone-300 dark:border-stone-700 text-xs font-mono py-0.5"
                        />
                      </label>

                      <button
                        type="button"
                        onClick={() =>
                          updateTbrItem(item.id, {
                            reminder_enabled: !item.reminder_enabled,
                          })
                        }
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] ${
                          item.reminder_enabled
                            ? 'bg-emerald-700/15 text-emerald-800 dark:text-emerald-300 font-medium'
                            : 'text-stone-400 hover:text-stone-600'
                        }`}
                      >
                        <Bell className="w-3 h-3" />
                        {item.reminder_enabled ? 'Reminder ON' : 'Remind me'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Reorder + Mark as Reading Actions */}
                <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
                  <button
                    type="button"
                    disabled={idx === 0}
                    onClick={() => moveItem(idx, -1)}
                    aria-label="Move higher"
                    className="p-2 rounded-lg border border-stone-200 dark:border-stone-700 disabled:opacity-30"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={idx === activeItems.length - 1}
                    onClick={() => moveItem(idx, 1)}
                    aria-label="Move lower"
                    className="p-2 rounded-lg border border-stone-200 dark:border-stone-700 disabled:opacity-30"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => promoteTbrToReading(item.id)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold"
                  >
                    <Play className="w-3.5 h-3.5" />
                    Mark as Reading
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteTbrItem(item.id)}
                    aria-label="Remove from TBR"
                    className="p-2 rounded-lg text-stone-400 hover:text-rose-600"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {completedItems.length > 0 && (
        <div className="pt-4 space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-500">
            Promoted to Active Shelf ({completedItems.length})
          </h3>
          {completedItems.map((c) => {
            const b = c.book_id ? booksById.get(c.book_id) : null;
            return (
              <div
                key={c.id}
                className="text-xs text-stone-500 flex items-center gap-2 py-1"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span className="line-through">{b?.title ?? c.free_text_title}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
