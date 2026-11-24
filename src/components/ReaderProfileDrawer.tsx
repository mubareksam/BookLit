'use client';

import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import {
  Award,
  BookOpen,
  Flame,
  Lock,
  ShieldCheck,
  Swords,
  UserCheck,
  UserPlus,
  X,
} from 'lucide-react';
import { useBooklit } from '@/context/BooklitContext';
import { PublicReaderProfile } from '@/lib/types';

const TIER_STYLES: Record<string, string> = {
  emerald:
    'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  gold: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  silver: 'border-sky-500/35 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  bronze: 'border-orange-500/35 bg-orange-500/10 text-orange-700 dark:text-orange-300',
};

export function ReaderProfileDrawer() {
  const {
    user,
    selectedReaderUsername,
    setSelectedReaderUsername,
    toggleFollowReader,
    createDuel,
    setActiveView,
  } = useBooklit();

  const [profile, setProfile] = useState<PublicReaderProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [duelSentToast, setDuelSentToast] = useState(false);

  useEffect(() => {
    if (!selectedReaderUsername) {
      setProfile(null);
      setErrorMsg(null);
      return;
    }

    let active = true;
    setLoading(true);
    setErrorMsg(null);

    fetch(`/api/social?username=${encodeURIComponent(selectedReaderUsername)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!active) return;
        if (!res.ok) {
          setErrorMsg(data.error || 'Profile unavailable');
          setProfile(null);
        } else {
          setProfile(data.profile ?? null);
        }
      })
      .catch(() => {
        if (active) setErrorMsg('Could not load reader profile');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedReaderUsername]);

  if (!selectedReaderUsername) return null;

  const isSelf = profile && user && profile.userId === user.id;

  const handleToggleFollow = async () => {
    if (!profile || isSelf) return;
    await toggleFollowReader(profile.userId);
    setProfile((prev) =>
      prev
        ? {
            ...prev,
            isFollowing: !prev.isFollowing,
            followersCount: prev.followersCount + (prev.isFollowing ? -1 : 1),
          }
        : null
    );
  };

  const handleQuickChallenge1v1 = async () => {
    if (!profile || isSelf) return;
    const res = await createDuel({
      title: `1v1 Duel: @${user?.username} vs @${profile.username}`,
      metric: 'verified_minutes',
      targetValue: 90,
      durationHours: 72,
      invitedUsername: profile.username,
    });
    if (res.ok) {
      setDuelSentToast(true);
      setTimeout(() => {
        setDuelSentToast(false);
        setSelectedReaderUsername(null);
        setActiveView('challenges');
      }, 1100);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex justify-end">
      <div className="w-full max-w-md bg-white dark:bg-zinc-900 h-full overflow-y-auto overflow-x-hidden border-l border-zinc-200 dark:border-zinc-800 p-5 space-y-5 shadow-2xl">
        {/* Top Bar */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Reader Profile
          </span>
          <button
            type="button"
            onClick={() => setSelectedReaderUsername(null)}
            className="p-1.5 rounded-xl text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {loading && (
          <div className="py-12 text-center text-xs text-zinc-500">Loading profile…</div>
        )}

        {errorMsg && !loading && (
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 p-8 text-center space-y-2">
            <Lock className="w-6 h-6 text-zinc-400 mx-auto" />
            <p className="text-xs text-zinc-500">{errorMsg}</p>
          </div>
        )}

        {profile && !loading && (
          <div className="space-y-5 min-w-0">
            {/* Identity Header */}
            <div className="space-y-3 min-w-0">
              <div className="flex items-start justify-between gap-3 min-w-0">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-800 text-white font-bold text-base flex items-center justify-center shrink-0 shadow">
                    {profile.displayName.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <h2 className="text-base font-bold truncate">{profile.displayName}</h2>
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-[10px] font-semibold">
                        {profile.rankTitle}
                      </span>
                    </div>
                    <p className="text-xs font-mono text-zinc-500 truncate">
                      @{profile.username}
                    </p>
                  </div>
                </div>
              </div>

              {profile.bio && (
                <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed break-words">
                  {profile.bio}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-3 text-[11px] text-zinc-500">
                <span>
                  <strong className="text-zinc-900 dark:text-zinc-100">
                    {profile.followersCount}
                  </strong>{' '}
                  tethers
                </span>
                <span>
                  <strong className="text-zinc-900 dark:text-zinc-100">
                    {profile.followingCount}
                  </strong>{' '}
                  tethering
                </span>
                {typeof profile.sparkCount === 'number' && (
                  <span className="inline-flex items-center gap-1">
                    ✦ <strong className="text-zinc-900 dark:text-zinc-100">{profile.sparkCount}</strong>{' '}
                    sparks
                  </span>
                )}
                <span>Joined {format(new Date(profile.joinedAt), 'MMM yyyy')}</span>
              </div>

              {!isSelf && (
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleToggleFollow}
                    className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition ${
                      profile.isFollowing
                        ? 'border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200'
                        : 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
                    }`}
                  >
                    {profile.isFollowing ? (
                      <>
                        <UserCheck className="w-3.5 h-3.5" />
                        {profile.isTethered ? 'Tethered' : 'Tethering'}
                      </>
                    ) : (
                      <>
                        <UserPlus className="w-3.5 h-3.5" /> Tether
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleQuickChallenge1v1}
                    className="flex-1 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition"
                  >
                    <Swords className="w-3.5 h-3.5" />
                    {duelSentToast ? '1v1 Sent!' : '1v1 Duel'}
                  </button>
                </div>
              )}
            </div>

            {/* Verified Stats Grid */}
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="rounded-xl bg-zinc-50 dark:bg-zinc-800/70 p-2.5">
                <div className="text-[10px] text-zinc-500">Verified</div>
                <div className="font-mono text-xs font-bold mt-0.5">
                  {Math.round((profile.verifiedMinutesTotal / 60) * 10) / 10}h
                </div>
              </div>
              <div className="rounded-xl bg-zinc-50 dark:bg-zinc-800/70 p-2.5">
                <div className="text-[10px] text-zinc-500">Pages</div>
                <div className="font-mono text-xs font-bold mt-0.5">
                  {profile.verifiedPagesTotal}
                </div>
              </div>
              <div className="rounded-xl bg-zinc-50 dark:bg-zinc-800/70 p-2.5">
                <div className="text-[10px] text-zinc-500 flex items-center justify-center gap-0.5">
                  <ShieldCheck className="w-3 h-3 text-emerald-600" /> Honest
                </div>
                <div className="font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                  {profile.avgTrustScore}
                  <span className="text-[9px] font-normal text-zinc-400">/1000</span>
                </div>
              </div>
              <div className="rounded-xl bg-zinc-50 dark:bg-zinc-800/70 p-2.5">
                <div className="text-[10px] text-zinc-500 flex items-center justify-center gap-0.5">
                  <Flame className="w-3 h-3 text-amber-500" /> Duels
                </div>
                <div className="font-mono text-xs font-bold mt-0.5">
                  {profile.duelWins}W–{profile.duelLosses}L
                </div>
              </div>
            </div>

            {/* Currently Reading */}
            {profile.currentlyReading && (
              <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 p-3.5 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-600 dark:text-emerald-400">
                    <BookOpen className="w-3.5 h-3.5" /> Reading Now
                  </span>
                  <span className="font-mono text-[11px] text-zinc-500">
                    {profile.currentlyReading.progressPct}%
                  </span>
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold truncate">
                    {profile.currentlyReading.title}
                  </div>
                  <div className="text-[11px] text-zinc-500 truncate">
                    {profile.currentlyReading.author}
                  </div>
                </div>
                <div className="h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                  <div
                    className="h-full bg-emerald-600 rounded-full"
                    style={{ width: `${profile.currentlyReading.progressPct}%` }}
                  />
                </div>
              </div>
            )}

            {/* Earned & Progress Achievement Badges */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold flex items-center gap-1.5">
                  <Award className="w-3.5 h-3.5 text-emerald-600" />
                  Verified Badges (
                  {profile.badges.filter((b) => b.unlocked).length}/{profile.badges.length})
                </h3>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {profile.badges.map((badge) => (
                  <div
                    key={badge.id}
                    className={`rounded-xl border p-2.5 space-y-1 transition ${
                      badge.unlocked
                        ? TIER_STYLES[badge.tier]
                        : 'border-zinc-200 dark:border-zinc-800 opacity-55'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 min-w-0">
                      <span className="text-xs font-bold truncate">{badge.label}</span>
                      <span className="text-[10px] font-mono shrink-0">
                        {badge.unlocked ? '✓' : badge.progressLabel}
                      </span>
                    </div>
                    <p className="text-[10px] leading-snug opacity-85 line-clamp-2">
                      {badge.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
