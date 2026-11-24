'use client';

import React, { useState } from 'react';
import { format } from 'date-fns';
import {
  Camera,
  Check,
  Copy,
  KeyRound,
  Plus,
  ShieldCheck,
  Trophy,
  Users,
  X,
} from 'lucide-react';
import { useBooklit } from '@/context/BooklitContext';

export function ChallengesView() {
  const { user, challenges, createChallenge, joinChallenge, openSessionFlow } = useBooklit();

  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [metric, setMetric] = useState<'verified_minutes' | 'verified_pages'>('verified_minutes');
  const [targetValue, setTargetValue] = useState<number>(180);
  const [durationDays, setDurationDays] = useState<number>(7);
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');

  const [inviteInput, setInviteInput] = useState('');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  if (!user) return null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg(null);
    const res = await createChallenge({
      title,
      description,
      metric,
      targetValue,
      durationDays,
      visibility,
      strictVerification: true,
    });
    if (res.ok) {
      setTitle('');
      setDescription('');
      setCreateOpen(false);
    } else {
      setStatusMsg(res.error || 'Could not create challenge');
    }
  };

  const handleJoinCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteInput.trim()) return;
    setStatusMsg(null);
    const res = await joinChallenge({ inviteCode: inviteInput.trim() });
    if (res.ok) {
      setInviteInput('');
    } else {
      setStatusMsg(res.error || 'Invite code not found');
    }
  };

  const copyInvite = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    } catch {}
  };

  return (
    <div className="space-y-5 pb-20 min-w-0">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            Verified Challenges
          </h1>
          <p className="text-xs text-zinc-500">
            Live camera page scans & voice seals required—zero unverified entries.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shrink-0"
        >
          <Plus className="w-4 h-4" />
          New Challenge
        </button>
      </div>

      {/* Anti-Cheat Rules Bar + Join by Invite Code */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
        <div className="md:col-span-7 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-3 flex items-center gap-3 min-w-0">
          <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div className="min-w-0 text-xs">
            <div className="font-semibold text-zinc-900 dark:text-zinc-100">
              Strict Anti-Cheat Seal Active
            </div>
            <p className="text-zinc-500 truncate">
              Requires live camera start/end scans, distinct page frames, monotonic timer & voice
              liveness.
            </p>
          </div>
        </div>

        <form
          onSubmit={handleJoinCode}
          className="md:col-span-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3.5 py-2.5 flex items-center gap-2 min-w-0"
        >
          <KeyRound className="w-4 h-4 text-zinc-400 shrink-0" />
          <input
            type="text"
            value={inviteInput}
            onChange={(e) => setInviteInput(e.target.value.toUpperCase())}
            placeholder="Invite code (e.g. A7K92B)"
            className="flex-1 min-w-0 bg-transparent text-xs font-mono uppercase focus:outline-none"
          />
          <button
            type="submit"
            className="px-3 py-1.5 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-semibold shrink-0"
          >
            Join
          </button>
        </form>
      </div>

      {statusMsg && (
        <div className="rounded-xl bg-rose-500/10 border border-rose-500/25 px-3.5 py-2.5 text-xs text-rose-600 dark:text-rose-400">
          {statusMsg}
        </div>
      )}

      {/* Create Challenge Modal */}
      {createOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleCreate}
            className="w-full max-w-md rounded-3xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Create Verified Challenge</h2>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="p-1.5 rounded-lg text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-500 mb-1">Title *</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. 7-Day Deep Reading Sprint"
                className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-500 mb-1">
                Goal Note (optional)
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Minimum 25 verified minutes daily"
                className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">Metric</label>
                <select
                  value={metric}
                  onChange={(e) => {
                    const m = e.target.value as 'verified_minutes' | 'verified_pages';
                    setMetric(m);
                    setTargetValue(m === 'verified_pages' ? 150 : 180);
                  }}
                  className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-xs"
                >
                  <option value="verified_minutes">Verified Minutes</option>
                  <option value="verified_pages">Verified Pages</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">Target</label>
                <input
                  type="number"
                  min={10}
                  max={10000}
                  value={targetValue}
                  onChange={(e) => setTargetValue(Number(e.target.value) || 100)}
                  className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 font-mono text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">Duration</label>
                <select
                  value={durationDays}
                  onChange={(e) => setDurationDays(Number(e.target.value))}
                  className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-xs"
                >
                  <option value={3}>3 Days</option>
                  <option value={7}>7 Days</option>
                  <option value={14}>14 Days</option>
                  <option value={30}>30 Days</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">Access</label>
                <select
                  value={visibility}
                  onChange={(e) => setVisibility(e.target.value as 'public' | 'private')}
                  className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-xs"
                >
                  <option value="public">Public Board</option>
                  <option value="private">Invite Code Only</option>
                </select>
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
            >
              Launch Challenge
            </button>
          </form>
        </div>
      )}

      {/* Challenge Cards & Real User Leaderboards */}
      {challenges.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-zinc-200 dark:border-zinc-800 p-10 text-center space-y-3">
          <div className="w-11 h-11 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
            <Trophy className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-semibold">No active challenges yet</h3>
            <p className="text-xs text-zinc-500 max-w-xs mx-auto">
              Create the first reading challenge and share the invite code with friends or book club
              members.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold"
          >
            <Plus className="w-3.5 h-3.5" />
            Create Challenge
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {challenges.map((ch) => {
            const joined = ch.participants.some((p) => p.userId === user.id);
            return (
              <div
                key={ch.id}
                className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 space-y-4 min-w-0"
              >
                <div className="flex items-start justify-between gap-2 min-w-0">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <h3 className="text-base font-bold truncate">{ch.title}</h3>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-medium">
                        {ch.metric === 'verified_pages'
                          ? `${ch.target_value} pages`
                          : `${ch.target_value} mins`}
                      </span>
                    </div>
                    {ch.description && (
                      <p className="text-xs text-zinc-500 mt-0.5 line-clamp-1">{ch.description}</p>
                    )}
                    <p className="text-[11px] text-zinc-400 mt-1">
                      Ends {format(new Date(ch.ends_at), 'MMM d')} · {ch.participants.length}{' '}
                      reader(s)
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => copyInvite(ch.invite_code)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-[11px] font-mono shrink-0"
                  >
                    {copiedCode === ch.invite_code ? (
                      <Check className="w-3 h-3 text-emerald-600" />
                    ) : (
                      <Copy className="w-3 h-3 text-zinc-400" />
                    )}
                    {ch.invite_code}
                  </button>
                </div>

                {/* Leaderboard */}
                <div className="space-y-1.5">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 flex items-center justify-between">
                    <span className="inline-flex items-center gap-1">
                      <Users className="w-3 h-3" /> Leaderboard
                    </span>
                    <span>Verified Score</span>
                  </div>

                  <div className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
                    {ch.participants.slice(0, 6).map((p, idx) => {
                      const val =
                        ch.metric === 'verified_pages' ? p.verifiedPages : p.verifiedMinutes;
                      const pct = Math.min(100, Math.round((val / ch.target_value) * 100));
                      return (
                        <div key={p.userId} className="py-2 space-y-1">
                          <div className="flex items-center justify-between gap-2 text-xs min-w-0">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="font-mono text-[11px] text-zinc-400 w-4">
                                {idx + 1}.
                              </span>
                              <span className="font-semibold truncate">{p.displayName}</span>
                              <span className="text-[11px] text-zinc-400 font-mono truncate">
                                @{p.username}
                              </span>
                            </div>
                            <div className="font-mono text-xs font-semibold text-emerald-600 dark:text-emerald-400 shrink-0">
                              {val}
                              {ch.metric === 'verified_pages' ? 'p' : 'm'}
                            </div>
                          </div>
                          <div className="h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                            <div
                              className="h-full bg-emerald-600 rounded-full"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="pt-1 flex justify-end">
                  {joined ? (
                    <button
                      type="button"
                      onClick={() => openSessionFlow(undefined, null, ch.id)}
                      className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      Scan & Compete
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => joinChallenge({ challengeId: ch.id })}
                      className="w-full sm:w-auto px-4 py-2 rounded-xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-semibold"
                    >
                      Join Challenge
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
