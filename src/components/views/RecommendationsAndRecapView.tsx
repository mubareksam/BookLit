'use client';

import React, { useMemo, useState } from 'react';
import { subDays } from 'date-fns';
import { Check, Copy, Plus, Sparkles } from 'lucide-react';
import { useBooklit } from '@/context/BooklitContext';
import { generateBookRecommendations } from '@/lib/domain/recommendationEngine';

export function RecommendationsAndRecapView() {
  const { user, books, sessions, addBook, addTbrItem } = useBooklit();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const recs = useMemo(() => {
    if (!user) return [];
    return generateBookRecommendations({ user, userBooks: books, sessions });
  }, [user, books, sessions]);

  const recapCards = useMemo(() => {
    const buildRecap = (days: number, label: string, id: string) => {
      const cutoff = subDays(new Date(), days).getTime();
      const recent = sessions.filter((s) => new Date(s.ended_at).getTime() >= cutoff);
      const mins = Math.round(recent.reduce((acc, s) => acc + s.actual_minutes, 0));
      const pages = recent.reduce((acc, s) => acc + Math.max(0, s.end_page - s.start_page), 0);
      const verified = recent.filter((s) => s.verified).length;
      const ratio = recent.length > 0 ? Math.round((verified / recent.length) * 100) : 100;
      return { id, label, mins, pages, ratio, sessionsCount: recent.length };
    };
    return [buildRecap(7, 'Weekly Recap', 'weekly'), buildRecap(30, 'Monthly Recap', 'monthly')];
  }, [sessions]);

  if (!user) return null;

  const copySummary = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {}
  };

  return (
    <div className="space-y-6 pb-20 min-w-0">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Recs & Recaps</h1>
        <p className="text-xs text-zinc-500">
          Shareable reading cards and books matched to your verified pace.
        </p>
      </div>

      {/* Shareable Recap Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {recapCards.map((rc) => {
          const shareText = `${user.display_name}’s ${rc.label} on Booklit — ${rc.mins} mins · ${rc.pages} pages (${rc.ratio}% verified).`;
          return (
            <div
              key={rc.id}
              className="rounded-2xl bg-gradient-to-br from-zinc-900 via-emerald-950 to-zinc-900 text-white p-5 space-y-3 border border-emerald-500/20"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold">
                  {rc.label}
                </span>
                <button
                  type="button"
                  onClick={() => copySummary(rc.id, shareText)}
                  className="inline-flex items-center gap-1 text-xs text-zinc-300 hover:text-white"
                >
                  {copiedId === rc.id ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  Share Text
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                <div className="rounded-xl bg-white/5 p-2.5">
                  <div className="font-mono text-sm font-bold">{rc.mins}m</div>
                  <div className="text-[10px] text-zinc-400">Minutes</div>
                </div>
                <div className="rounded-xl bg-white/5 p-2.5">
                  <div className="font-mono text-sm font-bold">{rc.pages}</div>
                  <div className="text-[10px] text-zinc-400">Pages</div>
                </div>
                <div className="rounded-xl bg-white/5 p-2.5">
                  <div className="font-mono text-sm font-bold text-emerald-400">{rc.ratio}%</div>
                  <div className="text-[10px] text-zinc-400">Verified</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Recommendations */}
      <div className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
          Recommended Next Reads
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {recs.slice(0, 6).map((rec) => (
            <div
              key={rec.seed.catalogId}
              className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 flex flex-col justify-between gap-3 min-w-0"
            >
              <div className="flex gap-3 min-w-0">
                <div
                  className="w-11 h-14 rounded-xl shrink-0"
                  style={{ backgroundColor: rec.seed.cover_color || '#065f46' }}
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold truncate">{rec.seed.title}</h3>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
                      {rec.score}%
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500 truncate">
                    {rec.seed.author} · {rec.seed.page_count}p
                  </p>
                  <p className="text-[11px] text-zinc-600 dark:text-zinc-400 mt-1 line-clamp-2">
                    {rec.rationale}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] font-mono text-zinc-400">
                  ~{rec.formattedFinish} read
                </span>
                <button
                  type="button"
                  onClick={async () => {
                    const created = await addBook({
                      title: rec.seed.title,
                      author: rec.seed.author,
                      isbn: rec.seed.isbn || null,
                      genre: rec.seed.genre,
                      subgenre: rec.seed.subgenre,
                      page_count: rec.seed.page_count,
                      word_count_estimate: rec.seed.word_count_estimate,
                      difficulty_band: rec.seed.difficulty_band,
                      medium_default: 'physical',
                      description: rec.seed.description,
                      source: rec.seed.source,
                      status: 'tbr',
                      sample_passages: rec.seed.sample_passages,
                    });
                    await addTbrItem({ bookId: created.id });
                  }}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-semibold"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add to TBR
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
