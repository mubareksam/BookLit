'use client';

import React, { useMemo } from 'react';
import { addDays, format } from 'date-fns';
import { AlertTriangle, CheckCircle2, Play, ShieldCheck } from 'lucide-react';
import { useBooklit } from '@/context/BooklitContext';
import { formatMinutesHuman } from '@/lib/domain/speedModel';
import { normalizeTrustScore } from '@/lib/domain/trust';

export function SessionsAndVerificationView() {
  const { books, sessions, openSessionFlow } = useBooklit();
  const booksById = useMemo(() => new Map(books.map((b) => [b.id, b])), [books]);

  const activeStrikes = useMemo(
    () => sessions.filter((s) => s.strike_issued && !s.strike_cured_at),
    [sessions]
  );

  const avgTrust = useMemo(() => {
    if (sessions.length === 0) return 1000;
    return Math.round(
      sessions.reduce((acc, s) => acc + normalizeTrustScore(s.trust_score, s.trust_scale), 0) /
        sessions.length
    );
  }, [sessions]);

  const verifiedCount = useMemo(() => sessions.filter((s) => s.verified).length, [sessions]);

  return (
    <div className="space-y-5 pb-20 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Sessions & Trust</h1>
          <p className="text-xs text-zinc-500">Live page scans, pace matching, and voice seals.</p>
        </div>

        <button
          type="button"
          onClick={() => openSessionFlow()}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold shrink-0"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          New Session
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
          <div className="text-[11px] text-zinc-500">Honest Rate</div>
          <div className="font-mono text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
            {avgTrust}
            <span className="text-[10px] font-normal text-zinc-400">/1000</span>
          </div>
        </div>
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
          <div className="text-[11px] text-zinc-500">Verified</div>
          <div className="font-mono text-xl font-bold mt-0.5">
            {verifiedCount}/{sessions.length}
          </div>
        </div>
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
          <div className="text-[11px] text-zinc-500">Open Strikes</div>
          <div className="font-mono text-xl font-bold mt-0.5">{activeStrikes.length}</div>
        </div>
      </div>

      {activeStrikes.map((st) => {
        const bk = booksById.get(st.book_id);
        const deadline = addDays(new Date(st.ended_at), 7);
        return (
          <div
            key={st.id}
            className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 flex flex-wrap items-center justify-between gap-3"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <div className="text-xs min-w-0">
                <div className="font-semibold truncate">
                  Curable Strike · {bk?.title ?? 'Book'}
                </div>
                <p className="text-zinc-600 dark:text-zinc-400">
                  Complete a ≥10m live-scanned session before {format(deadline, 'MMM d')}.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => openSessionFlow(st.book_id, st.id)}
              className="px-3.5 py-1.5 rounded-xl bg-amber-600 text-white text-xs font-semibold shrink-0"
            >
              Cure Now
            </button>
          </div>
        );
      })}

      {sessions.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-zinc-200 dark:border-zinc-800 p-10 text-center space-y-2">
          <ShieldCheck className="w-7 h-7 text-zinc-400 mx-auto" />
          <p className="text-xs text-zinc-500">
            Completed sessions appear here with pace telemetry and verification badges.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {sessions.map((s) => {
            const bk = booksById.get(s.book_id);
            const pagesRead = Math.max(0, s.end_page - s.start_page);
            return (
              <div
                key={s.id}
                className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 space-y-2 min-w-0"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 min-w-0">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-sm font-bold truncate">{bk?.title ?? 'Book'}</span>
                      {s.challenge_eligible && (
                        <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-[10px] font-semibold shrink-0">
                          Challenge Seal
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-zinc-500">
                      {format(new Date(s.ended_at), 'MMM d, h:mm a')} · p.{s.start_page}→
                      {s.end_page} ({pagesRead}p)
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-mono text-xs text-zinc-500">
                      {formatMinutesHuman(s.actual_minutes)} · {s.wpm_observed} wpm
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-mono font-semibold ${
                        s.verified
                          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                          : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'
                      }`}
                    >
                      {s.verified && <CheckCircle2 className="w-3 h-3" />}
                      {normalizeTrustScore(s.trust_score, s.trust_scale)}
                    </span>
                  </div>
                </div>

                {s.flags_json.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {s.flags_json.map((f, idx) => (
                      <span
                        key={idx}
                        className="text-[11px] px-2 py-0.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300"
                      >
                        {f.label}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
