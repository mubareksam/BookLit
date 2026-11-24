'use client';

import React, { useState } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import {
  Activity,
  Award,
  Camera,
  Check,
  Copy,
  Crown,
  KeyRound,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Swords,
  Trophy,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { useBooklit } from '@/context/BooklitContext';

type ArenaSubTab = 'leaderboards' | 'duels' | 'community';

export function ChallengesView() {
  const {
    user,
    challenges,
    duels,
    readers,
    activityFeed,
    mySocialProfile,
    createChallenge,
    joinChallenge,
    createDuel,
    acceptDuel,
    declineDuel,
    toggleFollowReader,
    toggleSparkEvent,
    refreshSocialAndDuels,
    setSelectedReaderUsername,
    openSessionFlow,
  } = useBooklit();

  const [subTab, setSubTab] = useState<ArenaSubTab>('leaderboards');

  // Create Challenge modal
  const [createChallengeOpen, setCreateChallengeOpen] = useState(false);
  const [chTitle, setChTitle] = useState('');
  const [chDesc, setChDesc] = useState('');
  const [chMetric, setChMetric] = useState<'verified_minutes' | 'verified_pages'>(
    'verified_minutes'
  );
  const [chTarget, setChTarget] = useState<number>(180);
  const [chDays, setChDays] = useState<number>(7);
  const [chVisibility, setChVisibility] = useState<'public' | 'private'>('public');

  // Create 1v1 Duel modal
  const [createDuelOpen, setCreateDuelOpen] = useState(false);
  const [duelTitle, setDuelTitle] = useState('');
  const [duelInvitedUsername, setDuelInvitedUsername] = useState('');
  const [duelMetric, setDuelMetric] = useState<'verified_minutes' | 'verified_pages'>(
    'verified_minutes'
  );
  const [duelTarget, setDuelTarget] = useState<number>(90);
  const [duelHours, setDuelHours] = useState<number>(72);

  // Invite codes & search
  const [inviteInput, setInviteInput] = useState('');
  const [duelCodeInput, setDuelCodeInput] = useState('');
  const [readerSearch, setReaderSearch] = useState('');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  if (!user) return null;

  const incomingDuelInvites = duels.filter(
    (d) =>
      d.status === 'open' &&
      d.invited_username &&
      d.invited_username.toLowerCase() === user.username.toLowerCase()
  );

  const handleCreateChallenge = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg(null);
    const res = await createChallenge({
      title: chTitle,
      description: chDesc,
      metric: chMetric,
      targetValue: chTarget,
      durationDays: chDays,
      visibility: chVisibility,
      strictVerification: true,
    });
    if (res.ok) {
      setChTitle('');
      setChDesc('');
      setCreateChallengeOpen(false);
    } else {
      setStatusMsg(res.error || 'Could not create challenge');
    }
  };

  const handleCreateDuel = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg(null);
    const res = await createDuel({
      title: duelTitle,
      metric: duelMetric,
      targetValue: duelTarget,
      durationHours: duelHours,
      invitedUsername: duelInvitedUsername.trim() || null,
    });
    if (res.ok) {
      setDuelTitle('');
      setDuelInvitedUsername('');
      setCreateDuelOpen(false);
    } else {
      setStatusMsg(res.error || 'Could not create 1v1 duel');
    }
  };

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    } catch {}
  };

  return (
    <div className="space-y-5 pb-20 min-w-0">
      {/* Header + My Profile Shortcut */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
            Competitive Arena
          </h1>
          <p className="text-xs text-zinc-500">
            Live camera scans & voice seals required—zero image uploads.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setSelectedReaderUsername(user.username)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs font-semibold"
          >
            <Award className="w-3.5 h-3.5 text-emerald-600" />
            <span>
              {mySocialProfile?.rankTitle ?? 'Profile'} · @
              {user.username}
            </span>
          </button>

          {subTab === 'duels' ? (
            <button
              type="button"
              onClick={() => setCreateDuelOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
            >
              <Swords className="w-3.5 h-3.5" />
              New 1v1 Duel
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setCreateChallengeOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
            >
              <Plus className="w-4 h-4" />
              New Challenge
            </button>
          )}
        </div>
      </div>

      {/* Sub-Navigation Pills */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-xl bg-zinc-200/70 dark:bg-zinc-900 p-1 gap-1 border border-zinc-200/80 dark:border-zinc-800">
          <button
            type="button"
            onClick={() => setSubTab('leaderboards')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition ${
              subTab === 'leaderboards'
                ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm'
                : 'text-zinc-500'
            }`}
          >
            <Trophy className="w-3.5 h-3.5" />
            Challenges ({challenges.length})
          </button>

          <button
            type="button"
            onClick={() => setSubTab('duels')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition ${
              subTab === 'duels'
                ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm'
                : 'text-zinc-500'
            }`}
          >
            <Swords className="w-3.5 h-3.5" />
            1v1 Duels ({duels.length})
            {incomingDuelInvites.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-rose-500 text-white text-[10px]">
                {incomingDuelInvites.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setSubTab('community')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition ${
              subTab === 'community'
                ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm'
                : 'text-zinc-500'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            Readers & Feed
          </button>
        </div>

        <div className="inline-flex items-center gap-1.5 text-[11px] text-emerald-700 dark:text-emerald-400 font-medium">
          <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
          <span>Strict Live-Camera Anti-Cheat</span>
        </div>
      </div>

      {/* Incoming 1v1 Duel Invitations Banner */}
      {incomingDuelInvites.map((inv) => (
        <div
          key={inv.id}
          className="rounded-2xl border border-emerald-500/35 bg-emerald-500/10 p-4 flex flex-wrap items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <Swords className="w-4 h-4 text-emerald-600 shrink-0" />
            <div className="text-xs min-w-0">
              <button
                type="button"
                onClick={() => setSelectedReaderUsername(inv.challenger.username)}
                className="font-bold hover:underline"
              >
                @{inv.challenger.username}
              </button>{' '}
              challenged you to <strong>{inv.title}</strong> ({inv.target_value}
              {inv.metric === 'verified_pages' ? 'p' : 'm'} · {inv.duration_hours}h)
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              onClick={() => declineDuel(inv.id)}
              className="px-3 py-1.5 rounded-xl border border-zinc-300 dark:border-zinc-700 text-xs font-medium"
            >
              Decline
            </button>
            <button
              type="button"
              onClick={() => acceptDuel({ duelId: inv.id })}
              className="px-3.5 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-semibold"
            >
              Accept 1v1
            </button>
          </div>
        </div>
      ))}

      {statusMsg && (
        <div className="rounded-xl bg-rose-500/10 border border-rose-500/25 px-3.5 py-2.5 text-xs text-rose-600 dark:text-rose-400">
          {statusMsg}
        </div>
      )}

      {/* ==================== TAB 1: CHALLENGES ==================== */}
      {subTab === 'leaderboards' && (
        <div className="space-y-4">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!inviteInput.trim()) return;
              setStatusMsg(null);
              const res = await joinChallenge({ inviteCode: inviteInput.trim() });
              if (res.ok) setInviteInput('');
              else setStatusMsg(res.error || 'Invite code not found');
            }}
            className="max-w-md rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3.5 py-2 flex items-center gap-2"
          >
            <KeyRound className="w-4 h-4 text-zinc-400 shrink-0" />
            <input
              type="text"
              value={inviteInput}
              onChange={(e) => setInviteInput(e.target.value.toUpperCase())}
              placeholder="Challenge code (e.g. A7K92B)"
              className="flex-1 min-w-0 bg-transparent text-xs font-mono uppercase focus:outline-none"
            />
            <button
              type="submit"
              className="px-3 py-1.5 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-semibold shrink-0"
            >
              Join
            </button>
          </form>

          {challenges.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-zinc-200 dark:border-zinc-800 p-10 text-center space-y-3">
              <Trophy className="w-7 h-7 text-emerald-600 mx-auto" />
              <div className="space-y-1">
                <h3 className="text-sm font-semibold">No active challenges yet</h3>
                <p className="text-xs text-zinc-500 max-w-xs mx-auto">
                  Create a group challenge and share the invite code with friends or book clubs.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCreateChallengeOpen(true)}
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
                              ? `${ch.target_value}p`
                              : `${ch.target_value}m`}
                          </span>
                        </div>
                        {ch.description && (
                          <p className="text-xs text-zinc-500 mt-0.5 line-clamp-1">
                            {ch.description}
                          </p>
                        )}
                        <p className="text-[11px] text-zinc-400 mt-1">
                          Ends {format(new Date(ch.ends_at), 'MMM d')} · {ch.participants.length}{' '}
                          reader(s)
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => copyCode(ch.invite_code)}
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

                    <div className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
                      {ch.participants.slice(0, 6).map((p, idx) => {
                        const val =
                          ch.metric === 'verified_pages' ? p.verifiedPages : p.verifiedMinutes;
                        const pct = Math.min(100, Math.round((val / ch.target_value) * 100));
                        return (
                          <div key={p.userId} className="py-2 space-y-1">
                            <div className="flex items-center justify-between gap-2 text-xs min-w-0">
                              <button
                                type="button"
                                onClick={() => setSelectedReaderUsername(p.username)}
                                className="flex items-center gap-2 min-w-0 text-left hover:text-emerald-600 transition"
                              >
                                <span className="font-mono text-[11px] text-zinc-400 w-4">
                                  {idx + 1}.
                                </span>
                                <span className="font-semibold truncate">{p.displayName}</span>
                                <span className="text-[11px] text-zinc-400 font-mono truncate">
                                  @{p.username}
                                </span>
                              </button>
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

                    <div className="pt-1 flex justify-end">
                      {joined ? (
                        <button
                          type="button"
                          onClick={() => openSessionFlow(undefined, null, ch.id, null)}
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
      )}

      {/* ==================== TAB 2: 1v1 DUELS ==================== */}
      {subTab === 'duels' && (
        <div className="space-y-4">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!duelCodeInput.trim()) return;
              setStatusMsg(null);
              const res = await acceptDuel({ inviteCode: duelCodeInput.trim() });
              if (res.ok) setDuelCodeInput('');
              else setStatusMsg(res.error || 'Duel code not found');
            }}
            className="max-w-md rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3.5 py-2 flex items-center gap-2"
          >
            <KeyRound className="w-4 h-4 text-zinc-400 shrink-0" />
            <input
              type="text"
              value={duelCodeInput}
              onChange={(e) => setDuelCodeInput(e.target.value.toUpperCase())}
              placeholder="Duel code (e.g. DL4K9P)"
              className="flex-1 min-w-0 bg-transparent text-xs font-mono uppercase focus:outline-none"
            />
            <button
              type="submit"
              className="px-3 py-1.5 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-semibold shrink-0"
            >
              Accept Duel
            </button>
          </form>

          {duels.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-zinc-200 dark:border-zinc-800 p-10 text-center space-y-3">
              <Swords className="w-7 h-7 text-emerald-600 mx-auto" />
              <div className="space-y-1">
                <h3 className="text-sm font-semibold">No 1v1 Duels active</h3>
                <p className="text-xs text-zinc-500 max-w-xs mx-auto">
                  Challenge a specific @username or open a public 1v1 sprint—first to hit the
                  verified target wins.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCreateDuelOpen(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold"
              >
                <Swords className="w-3.5 h-3.5" />
                Create 1v1 Duel
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {duels.map((d) => {
                const cVal =
                  d.metric === 'verified_pages'
                    ? d.challenger.verifiedPages
                    : d.challenger.verifiedMinutes;
                const oVal = d.opponent
                  ? d.metric === 'verified_pages'
                    ? d.opponent.verifiedPages
                    : d.opponent.verifiedMinutes
                  : 0;
                const unit = d.metric === 'verified_pages' ? 'p' : 'm';
                const cPct = Math.min(100, Math.round((cVal / d.target_value) * 100));
                const oPct = Math.min(100, Math.round((oVal / d.target_value) * 100));
                const isContender =
                  d.challenger.userId === user.id || d.opponent?.userId === user.id;

                return (
                  <div
                    key={d.id}
                    className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 space-y-4 min-w-0"
                  >
                    <div className="flex items-start justify-between gap-2 min-w-0">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <h3 className="text-sm font-bold truncate">{d.title}</h3>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase ${
                              d.status === 'active'
                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                : d.status === 'completed'
                                ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'
                            }`}
                          >
                            {d.status}
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-500 mt-0.5">
                          Race to {d.target_value}
                          {unit} · {d.duration_hours}h window
                          {d.ends_at && d.status === 'active'
                            ? ` · Ends ${format(new Date(d.ends_at), 'MMM d, h:mm a')}`
                            : ''}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => copyCode(d.invite_code)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-[11px] font-mono shrink-0"
                      >
                        {copiedCode === d.invite_code ? (
                          <Check className="w-3 h-3 text-emerald-600" />
                        ) : (
                          <Copy className="w-3 h-3 text-zinc-400" />
                        )}
                        {d.invite_code}
                      </button>
                    </div>

                    {/* Head-to-Head Contenders */}
                    <div className="space-y-2.5">
                      {/* Challenger */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs min-w-0">
                          <button
                            type="button"
                            onClick={() => setSelectedReaderUsername(d.challenger.username)}
                            className="font-semibold truncate hover:text-emerald-600 inline-flex items-center gap-1"
                          >
                            {d.winner_user_id === d.challenger.userId && (
                              <Crown className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                            )}
                            <span>@{d.challenger.username}</span>
                          </button>
                          <span className="font-mono font-semibold text-emerald-600">
                            {cVal}
                            {unit}
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                          <div
                            className="h-full bg-emerald-600 rounded-full"
                            style={{ width: `${cPct}%` }}
                          />
                        </div>
                      </div>

                      {/* Opponent */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs min-w-0">
                          {d.opponent ? (
                            <button
                              type="button"
                              onClick={() => setSelectedReaderUsername(d.opponent!.username)}
                              className="font-semibold truncate hover:text-indigo-500 inline-flex items-center gap-1"
                            >
                              {d.winner_user_id === d.opponent.userId && (
                                <Crown className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                              )}
                              <span>@{d.opponent.username}</span>
                            </button>
                          ) : (
                            <span className="text-zinc-400 italic">
                              {d.invited_username
                                ? `Awaiting @${d.invited_username}…`
                                : 'Open slot — awaiting challenger'}
                            </span>
                          )}
                          <span className="font-mono font-semibold text-indigo-500">
                            {oVal}
                            {unit}
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                          <div
                            className="h-full bg-indigo-500 rounded-full"
                            style={{ width: `${oPct}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="pt-1 flex justify-end">
                      {d.status === 'active' && isContender && (
                        <button
                          type="button"
                          onClick={() => openSessionFlow(undefined, null, null, d.id)}
                          className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
                        >
                          <Camera className="w-3.5 h-3.5" />
                          Scan & Duel
                        </button>
                      )}
                      {d.status === 'open' && d.challenger.userId !== user.id && (
                        <button
                          type="button"
                          onClick={() => acceptDuel({ duelId: d.id })}
                          className="w-full sm:w-auto px-4 py-2 rounded-xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-semibold"
                        >
                          Accept 1v1 Duel
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ==================== TAB 3: READERS & LIVE FEED ==================== */}
      {subTab === 'community' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 min-w-0">
          {/* Readers Directory */}
          <div className="lg:col-span-7 space-y-3 min-w-0">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                refreshSocialAndDuels(readerSearch);
              }}
              className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3.5 py-2 flex items-center gap-2"
            >
              <Search className="w-4 h-4 text-zinc-400 shrink-0" />
              <input
                type="text"
                value={readerSearch}
                onChange={(e) => {
                  setReaderSearch(e.target.value);
                  refreshSocialAndDuels(e.target.value);
                }}
                placeholder="Find readers by @username, name, or rank…"
                className="flex-1 min-w-0 bg-transparent text-xs focus:outline-none"
              />
            </form>

            {readers.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800 p-8 text-center text-xs text-zinc-500">
                {readerSearch.trim()
                  ? `No reader matches “${readerSearch.trim()}”. Try fewer letters or their exact @username.`
                  : 'No other public readers yet—tether a friend once they join Booklit.'}
              </div>
            ) : (
              <div className="space-y-2.5">
                {readers.map((r) => (
                  <div
                    key={r.userId}
                    className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 flex flex-wrap items-center justify-between gap-3 min-w-0"
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedReaderUsername(r.username)}
                      className="flex items-center gap-3 min-w-0 text-left flex-1"
                    >
                      <div className="w-10 h-10 rounded-xl bg-emerald-600/15 text-emerald-700 dark:text-emerald-300 font-bold text-sm flex items-center justify-center shrink-0">
                        {r.displayName.slice(0, 1).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold truncate">{r.displayName}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-medium shrink-0">
                            {r.rankTitle}
                          </span>
                        </div>
                        <div className="text-[11px] text-zinc-500 truncate">
                          @{r.username} · {r.verifiedMinutesTotal}m verified · {r.duelWins}W–
                          {r.duelLosses}L
                          {typeof r.sparkCount === 'number' && r.sparkCount > 0
                            ? ` · ${r.sparkCount} sparks`
                            : ''}
                        </div>
                      </div>
                    </button>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setDuelInvitedUsername(r.username);
                          setCreateDuelOpen(true);
                        }}
                        title="Challenge to 1v1 Duel"
                        className="p-2 rounded-xl border border-zinc-200 dark:border-zinc-700 text-emerald-600 hover:bg-emerald-500/10"
                      >
                        <Swords className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleFollowReader(r.userId)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1 ${
                          r.isFollowing
                            ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
                            : 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
                        }`}
                      >
                        {r.isFollowing ? (
                          <>
                            <UserCheck className="w-3 h-3" />
                            {r.isTethered ? 'Tethered' : 'Tethering'}
                          </>
                        ) : (
                          <>
                            <UserPlus className="w-3 h-3" /> Tether
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Live Verified Activity Feed */}
          <div className="lg:col-span-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 space-y-3 min-w-0 h-fit">
            <div className="flex items-center gap-1.5 text-xs font-semibold">
              <Activity className="w-3.5 h-3.5 text-emerald-600" />
              <span>Live Arena Feed</span>
              <span className="ml-auto text-[10px] font-normal text-zinc-400">
                Sparks = verified likes
              </span>
            </div>

            {activityFeed.length === 0 ? (
              <p className="text-xs text-zinc-500 py-6 text-center">
                Verified sessions, challenge launches, and 1v1 duel results appear here live.
              </p>
            ) : (
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {activityFeed.slice(0, 14).map((ev) => (
                  <div key={ev.id} className="py-2.5 text-xs space-y-1.5 min-w-0">
                    <div className="leading-snug break-words">
                      <button
                        type="button"
                        onClick={() => setSelectedReaderUsername(ev.actorUsername)}
                        className="font-semibold text-emerald-700 dark:text-emerald-400 hover:underline"
                      >
                        @{ev.actorUsername}
                      </button>{' '}
                      <span className="text-zinc-700 dark:text-zinc-300">{ev.summary}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-zinc-400">
                      <span>
                        {formatDistanceToNow(new Date(ev.createdAt), { addSuffix: true })}
                      </span>
                      {typeof ev.trustScore === 'number' && (
                        <span className="font-mono text-emerald-600">
                          Honest {ev.trustScore}/1000
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => toggleSparkEvent(ev.id)}
                        aria-pressed={Boolean(ev.sparkedByMe)}
                        aria-label={ev.sparkedByMe ? 'Remove spark' : 'Spark this activity'}
                        className={`ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold transition ${
                          ev.sparkedByMe
                            ? 'border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-300'
                            : 'border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                        }`}
                      >
                        <Sparkles className="w-3 h-3" />
                        {ev.sparkCount ?? 0}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create Multi-User Challenge Modal */}
      {createChallengeOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateChallenge}
            className="w-full max-w-md rounded-3xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Create Verified Challenge</h2>
              <button
                type="button"
                onClick={() => setCreateChallengeOpen(false)}
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
                value={chTitle}
                onChange={(e) => setChTitle(e.target.value)}
                placeholder="e.g. 7-Day Deep Reading Sprint"
                className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-500 mb-1">
                Goal Note (optional)
              </label>
              <input
                type="text"
                value={chDesc}
                onChange={(e) => setChDesc(e.target.value)}
                placeholder="e.g. Minimum 25 verified minutes daily"
                className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">Metric</label>
                <select
                  value={chMetric}
                  onChange={(e) => {
                    const m = e.target.value as 'verified_minutes' | 'verified_pages';
                    setChMetric(m);
                    setChTarget(m === 'verified_pages' ? 150 : 180);
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
                  value={chTarget}
                  onChange={(e) => setChTarget(Number(e.target.value) || 100)}
                  className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 font-mono text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">Duration</label>
                <select
                  value={chDays}
                  onChange={(e) => setChDays(Number(e.target.value))}
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
                  value={chVisibility}
                  onChange={(e) => setChVisibility(e.target.value as 'public' | 'private')}
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

      {/* Create 1v1 Duel Modal */}
      {createDuelOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateDuel}
            className="w-full max-w-md rounded-3xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold flex items-center gap-1.5">
                <Swords className="w-4 h-4 text-emerald-600" />
                Create 1v1 Reading Duel
              </h2>
              <button
                type="button"
                onClick={() => setCreateDuelOpen(false)}
                className="p-1.5 rounded-lg text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-500 mb-1">
                Opponent @username (leave blank for Open 1v1)
              </label>
              <input
                type="text"
                value={duelInvitedUsername}
                onChange={(e) => setDuelInvitedUsername(e.target.value)}
                placeholder="e.g. @sami_reads"
                className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 font-mono text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-500 mb-1">
                Duel Title (optional)
              </label>
              <input
                type="text"
                value={duelTitle}
                onChange={(e) => setDuelTitle(e.target.value)}
                placeholder="e.g. Weekend 90-Minute Showdown"
                className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-xs"
              />
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">Metric</label>
                <select
                  value={duelMetric}
                  onChange={(e) => {
                    const m = e.target.value as 'verified_minutes' | 'verified_pages';
                    setDuelMetric(m);
                    setDuelTarget(m === 'verified_pages' ? 80 : 90);
                  }}
                  className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-2.5 py-2 text-xs"
                >
                  <option value="verified_minutes">Minutes</option>
                  <option value="verified_pages">Pages</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">Race Target</label>
                <input
                  type="number"
                  min={15}
                  max={5000}
                  value={duelTarget}
                  onChange={(e) => setDuelTarget(Number(e.target.value) || 60)}
                  className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-2.5 py-2 font-mono text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">Window</label>
                <select
                  value={duelHours}
                  onChange={(e) => setDuelHours(Number(e.target.value))}
                  className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-2.5 py-2 text-xs"
                >
                  <option value={24}>24 Hours</option>
                  <option value={72}>3 Days</option>
                  <option value={168}>7 Days</option>
                </select>
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
            >
              Send 1v1 Duel
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
