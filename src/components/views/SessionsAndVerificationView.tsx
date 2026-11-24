'use client';

import React, { useMemo, useState } from 'react';
import { format, differenceInDays } from 'date-fns';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  HeartHandshake,
  Shield,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { useBooklit } from '@/context/BooklitContext';
import { formatMinutesHuman } from '@/lib/domain/speedModel';

export function SessionsAndVerificationView({
  initialTab = 'sessions',
}: {
  initialTab?: 'sessions' | 'verification';
}) {
  const {
    user,
    books,
    sessions,
    verificationEvents,
    openSessionFlow,
    applyStreakInsurance,
    setActiveView,
  } = useBooklit();

  const [tab, setTab] = useState<'sessions' | 'verification'>(initialTab);
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(
    sessions[0]?.id ?? null
  );
  const [insuranceToast, setInsuranceToast] = useState<string | null>(null);

  const booksById = useMemo(() => new Map(books.map((b) => [b.id, b])), [books]);

  const rollingTrust = useMemo(() => {
    if (sessions.length === 0) return 90;
    const recent = sessions.slice(0, 8);
    return Math.round(recent.reduce((acc, s) => acc + s.trust_score, 0) / recent.length);
  }, [sessions]);

  const activeStrikes = useMemo(
    () =>
      sessions.filter(
        (s) =>
          s.strike_issued &&
          !s.cure_session_id &&
          Date.now() - new Date(s.ended_at).getTime() <= 7 * 24 * 60 * 60 * 1000
      ),
    [sessions]
  );

  const curedStrikes = useMemo(
    () => sessions.filter((s) => s.strike_issued && Boolean(s.cure_session_id)),
    [sessions]
  );

  const allFlaggedSessions = useMemo(
    () => sessions.filter((s) => s.flags_json.length > 0),
    [sessions]
  );

  if (!user) return null;

  const currentMonth = format(new Date(), 'yyyy-MM');
  const graceUsedThisMonth = user.settings_json.streakInsuranceLastUsedMonth === currentMonth;

  const handleUseGraceDay = async () => {
    const ok = await applyStreakInsurance();
    setInsuranceToast(
      ok
        ? 'Monthly Streak Insurance applied! Today is protected as a grace day.'
        : 'Monthly grace day was already applied this calendar month.'
    );
    setTimeout(() => setInsuranceToast(null), 3500);
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold text-stone-900 dark:text-stone-100">
            {tab === 'verification'
              ? 'Verification Transparency & Strike Cure'
              : 'Reading Session History'}
          </h1>
          <p className="text-xs text-stone-500 dark:text-stone-400">
            Every trust signal is visible to you—no shadow-banning, no opaque gates, and a 7-day
            cure path for any strike.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="rounded-xl bg-stone-200/70 dark:bg-ink-800 p-1 flex gap-1">
            <button
              onClick={() => setTab('sessions')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                tab === 'sessions'
                  ? 'bg-white dark:bg-ink-700 text-stone-900 dark:text-white shadow-sm'
                  : 'text-stone-600 dark:text-stone-400'
              }`}
            >
              Session Log ({sessions.length})
            </button>
            <button
              onClick={() => setTab('verification')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                tab === 'verification'
                  ? 'bg-white dark:bg-ink-700 text-stone-900 dark:text-white shadow-sm'
                  : 'text-stone-600 dark:text-stone-400'
              }`}
            >
              Trust & Cure Center
            </button>
          </div>
          <button
            onClick={() => setActiveView('how_it_works')}
            className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-stone-300 dark:border-stone-700 text-xs font-medium hover:bg-white dark:hover:bg-ink-800"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            How It Works
          </button>
        </div>
      </div>

      {tab === 'verification' && (
        <div className="space-y-5">
          {/* Trust Overview Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white/85 dark:bg-ink-900 p-5 space-y-2">
              <div className="flex items-center justify-between text-xs text-stone-500">
                <span>Rolling Trust Score</span>
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="font-mono text-3xl font-bold text-stone-900 dark:text-white">
                {rollingTrust}
                <span className="text-sm font-normal text-stone-400"> / 100</span>
              </div>
              <p className="text-xs text-stone-600 dark:text-stone-400">
                High trust keeps random Tier 2 voice checks infrequent (~14% session probability).
              </p>
            </div>

            <div className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white/85 dark:bg-ink-900 p-5 space-y-2">
              <div className="flex items-center justify-between text-xs text-stone-500">
                <span>Active Strikes (7-Day Cure Window)</span>
                <HeartHandshake className="w-4 h-4 text-amber-600" />
              </div>
              <div className="font-mono text-3xl font-bold text-stone-900 dark:text-white">
                {activeStrikes.length}
                <span className="text-xs font-normal text-stone-500 ml-2">
                  ({curedStrikes.length} cured historically)
                </span>
              </div>
              <p className="text-xs text-stone-600 dark:text-stone-400">
                Strikes require ≥2 independent signals and never erase past verified minutes.
              </p>
            </div>

            <div className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white/85 dark:bg-ink-900 p-5 flex flex-col justify-between gap-3">
              <div>
                <div className="flex items-center justify-between text-xs text-stone-500">
                  <span>Streak Insurance (1 Grace Day / Mo)</span>
                  <Shield className="w-4 h-4 text-indigo-500" />
                </div>
                <p className="text-xs text-stone-600 dark:text-stone-300 mt-1.5">
                  Travelling or unwell? Protect your {user.streak_count}-day streak once per month
                  without faking a session.
                </p>
              </div>
              <button
                type="button"
                disabled={graceUsedThisMonth}
                onClick={handleUseGraceDay}
                className="w-full py-2 rounded-xl border border-indigo-500/40 bg-indigo-500/10 text-indigo-800 dark:text-indigo-300 text-xs font-semibold disabled:opacity-45"
              >
                {graceUsedThisMonth
                  ? 'Grace Day Used This Month'
                  : 'Apply Monthly Streak Grace Day'}
              </button>
              {insuranceToast && (
                <p className="text-[11px] text-emerald-700 dark:text-emerald-300 font-medium">
                  {insuranceToast}
                </p>
              )}
            </div>
          </div>

          {/* Active Curable Strikes Section */}
          <div className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white/85 dark:bg-ink-900 p-5 space-y-3">
            <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-100">
              Active Strikes & 7-Day Cure Recovery
            </h2>
            {activeStrikes.length === 0 ? (
              <div className="rounded-xl bg-emerald-500/10 border border-emerald-600/25 p-4 text-xs text-emerald-900 dark:text-emerald-200 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                Zero active strikes! Your verification standing is clean.
              </div>
            ) : (
              activeStrikes.map((s) => {
                const daysElapsed = differenceInDays(new Date(), new Date(s.ended_at));
                const daysLeft = Math.max(1, 7 - daysElapsed);
                const b = booksById.get(s.book_id);
                return (
                  <div
                    key={s.id}
                    className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-4 space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="text-xs font-semibold text-rose-700 dark:text-rose-300">
                          Curable Strike · {daysLeft} days remaining to cure
                        </span>
                        <h3 className="font-serif font-bold text-base text-stone-900 dark:text-white mt-0.5">
                          {b?.title ?? 'Reading Session'} ({format(new Date(s.ended_at), 'MMM d')})
                        </h3>
                      </div>
                      <button
                        onClick={() => openSessionFlow(s.book_id, s.id)}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        Run ≥10m Cure Session Now
                      </button>
                    </div>

                    <div className="space-y-2">
                      {s.flags_json.map((f, idx) => (
                        <div
                          key={idx}
                          className="rounded-xl bg-white/80 dark:bg-ink-800 p-3 text-xs space-y-1"
                        >
                          <div className="font-semibold text-stone-900 dark:text-stone-100">
                            Signal #{idx + 1}: {f.label}
                          </div>
                          <p className="text-stone-600 dark:text-stone-300">{f.explanation}</p>
                          <p className="text-emerald-700 dark:text-emerald-300 font-medium">
                            Cure step: {f.cureHint}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Transparent Flag Log */}
          <div className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white/85 dark:bg-ink-900 p-5 space-y-3">
            <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-100">
              Complete Signal & Flag Transparency Log
            </h2>
            {allFlaggedSessions.length === 0 ? (
              <p className="text-xs text-stone-500">No soft or escalated flags recorded.</p>
            ) : (
              <div className="space-y-2.5">
                {allFlaggedSessions.map((s) => (
                  <div
                    key={s.id}
                    className="rounded-xl border border-stone-200 dark:border-stone-800 p-3.5 text-xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-stone-900 dark:text-white">
                        {booksById.get(s.book_id)?.title} ·{' '}
                        {format(new Date(s.ended_at), 'MMM d, h:mm a')}
                      </span>
                      <span className="font-mono">
                        Trust {s.trust_score}/100{' '}
                        {s.cure_session_id && (
                          <span className="ml-1.5 px-2 py-0.5 rounded bg-emerald-600/15 text-emerald-700 dark:text-emerald-300">
                            Cured ✓
                          </span>
                        )}
                      </span>
                    </div>
                    {s.flags_json.map((f, idx) => (
                      <div key={idx} className="text-stone-600 dark:text-stone-400">
                        • <strong>{f.label}:</strong> {f.explanation}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'sessions' && (
        <div className="space-y-3">
          {sessions.map((s) => {
            const book = booksById.get(s.book_id);
            const isOpen = expandedSessionId === s.id;
            const sEvents = verificationEvents.filter((ev) => ev.session_id === s.id);

            return (
              <div
                key={s.id}
                className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white/85 dark:bg-ink-900 overflow-hidden"
              >
                <div
                  onClick={() => setExpandedSessionId(isOpen ? null : s.id)}
                  className="p-4 flex flex-wrap items-center justify-between gap-3 cursor-pointer hover:bg-paper-100/60 dark:hover:bg-ink-800/50 transition"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                        s.strike_issued && !s.cure_session_id
                          ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                          : s.verified
                          ? 'bg-emerald-600/15 text-emerald-800 dark:text-emerald-300'
                          : 'bg-amber-500/15 text-amber-800 dark:text-amber-300'
                      }`}
                    >
                      {s.strike_issued && !s.cure_session_id
                        ? 'Strike (Curable)'
                        : s.cure_session_id
                        ? 'Strike Cured'
                        : s.verified
                        ? 'Verified'
                        : 'Inconclusive'}
                    </span>

                    <div className="min-w-0">
                      <div className="font-serif font-bold text-sm text-stone-900 dark:text-stone-100 truncate">
                        {book?.title ?? 'Unknown Book'}
                      </div>
                      <div className="text-xs text-stone-500">
                        {format(new Date(s.ended_at), 'MMM d, yyyy · h:mm a')} · Medium:{' '}
                        <span className="capitalize">{s.medium}</span> · Pages {s.start_page}→
                        {s.end_page} ({Math.max(0, s.end_page - s.start_page)}p)
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-xs font-mono">
                    <div>
                      <span className="text-stone-400">Actual: </span>
                      <strong className="text-stone-900 dark:text-white">
                        {formatMinutesHuman(s.actual_minutes)}
                      </strong>
                      <span className="text-stone-400 ml-1.5">
                        (pred {formatMinutesHuman(s.predicted_minutes)})
                      </span>
                    </div>
                    <div
                      title={`Expected Genre Comfort Band: ${s.wpm_expected_range_low}–${s.wpm_expected_range_high} WPM`}
                    >
                      {s.wpm_observed} wpm
                    </div>
                    <div className="px-2.5 py-1 rounded-lg bg-paper-100 dark:bg-ink-800">
                      Trust {s.trust_score}
                    </div>
                    {isOpen ? (
                      <ChevronUp className="w-4 h-4 text-stone-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-stone-400" />
                    )}
                  </div>
                </div>

                {isOpen && (
                  <div className="px-4 pb-4 pt-3 border-t border-stone-200/70 dark:border-stone-800 bg-paper-50/70 dark:bg-ink-950/40 space-y-3 text-xs">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      <div className="p-2.5 rounded-xl bg-white dark:bg-ink-900 border border-stone-200/70 dark:border-stone-800">
                        <div className="text-[10px] uppercase text-stone-400">
                          Verification Tier
                        </div>
                        <div className="font-semibold capitalize mt-0.5">{s.verification_tier}</div>
                      </div>
                      <div className="p-2.5 rounded-xl bg-white dark:bg-ink-900 border border-stone-200/70 dark:border-stone-800">
                        <div className="text-[10px] uppercase text-stone-400">Expected Band</div>
                        <div className="font-mono font-semibold mt-0.5">
                          {s.wpm_expected_range_low}–{s.wpm_expected_range_high} WPM
                        </div>
                      </div>
                      <div className="p-2.5 rounded-xl bg-white dark:bg-ink-900 border border-stone-200/70 dark:border-stone-800">
                        <div className="text-[10px] uppercase text-stone-400">
                          Predicted vs Actual
                        </div>
                        <div className="font-mono font-semibold mt-0.5">
                          {s.predicted_minutes.toFixed(1)}m vs {s.actual_minutes.toFixed(1)}m
                        </div>
                      </div>
                      <div className="p-2.5 rounded-xl bg-white dark:bg-ink-900 border border-stone-200/70 dark:border-stone-800">
                        <div className="text-[10px] uppercase text-stone-400">Sync Status</div>
                        <div className="font-semibold mt-0.5">
                          {s.synced !== false ? 'Synced to Cloud' : 'Queued Offline'}
                        </div>
                      </div>
                    </div>

                    {sEvents.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
                          Verification Events ({sEvents.length})
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {sEvents.map((ev) => (
                            <span
                              key={ev.id}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-ink-900 border border-stone-200 dark:border-stone-800 font-mono text-[11px]"
                            >
                              <span className="font-sans font-medium">{ev.type}</span>: {ev.result}{' '}
                              ({Math.round(ev.confidence * 100)}%)
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {s.flags_json.length > 0 && (
                      <div className="space-y-1.5">
                        {s.flags_json.map((f, i) => (
                          <div
                            key={i}
                            className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                          >
                            <div>
                              <div className="font-semibold flex items-center gap-1.5">
                                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                                {f.label}
                              </div>
                              <p className="text-stone-600 dark:text-stone-300 mt-0.5">
                                {f.explanation}
                              </p>
                            </div>
                            {s.strike_issued && !s.cure_session_id && (
                              <button
                                onClick={() => openSessionFlow(s.book_id, s.id)}
                                className="px-3 py-1.5 rounded-lg bg-emerald-700 text-white text-xs font-semibold shrink-0"
                              >
                                Cure Strike
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
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
