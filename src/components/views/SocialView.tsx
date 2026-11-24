'use client';

import React, { useMemo, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import {
  Activity,
  ChevronRight,
  Radio,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  UserPlus,
  UserCheck,
  Users,
} from 'lucide-react';
import { useBooklit } from '@/context/BooklitContext';

type SocialTab = 'feed' | 'readers';

/**
 * Social home: the live verified feed and the reader directory in one thumb-first
 * surface, the way people expect an app with a feed to behave. Everything here is
 * one tap from the bottom bar.
 */
export function SocialView() {
  const {
    user,
    readers,
    activityFeed,
    mySocialProfile,
    toggleFollowReader,
    toggleSparkEvent,
    refreshSocialAndDuels,
    setSelectedReaderUsername,
    openSessionFlow,
    setActiveView,
  } = useBooklit();

  const [tab, setTab] = useState<SocialTab>('feed');
  const [readerSearch, setReaderSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const tetheredCount = useMemo(
    () => readers.filter((r) => r.isFollowing).length,
    [readers]
  );
  const suggested = useMemo(
    () => readers.filter((r) => !r.isFollowing).slice(0, 8),
    [readers]
  );

  const refresh = async () => {
    setRefreshing(true);
    await refreshSocialAndDuels(readerSearch).catch(() => {});
    setRefreshing(false);
  };

  const openReader = (username: string) => setSelectedReaderUsername(username);

  const timeAgo = (iso: string) => {
    try {
      return formatDistanceToNow(new Date(iso), { addSuffix: false })
        .replace('about ', '')
        .replace(' minutes', 'm')
        .replace(' minute', 'm')
        .replace(' hours', 'h')
        .replace(' hour', 'h')
        .replace(' days', 'd')
        .replace(' day', 'd')
        .replace(' seconds', 's')
        .replace(' second', 's');
    } catch {
      return '';
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto space-y-4 min-w-0">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg sm:text-xl font-bold tracking-tight leading-tight">Feed</h1>
          <p className="text-[11px] text-zinc-500 truncate">
            Verified reading from readers you tether
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          className="p-2 rounded-xl border border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition shrink-0"
          aria-label="Refresh feed"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Nested social tabs: feed + reader directory in one destination */}
      <div className="grid grid-cols-2 rounded-full bg-zinc-200/70 dark:bg-zinc-900 p-1 border border-zinc-200/80 dark:border-zinc-800">
        {(
          [
            { id: 'feed' as SocialTab, label: 'Activity', icon: Activity },
            { id: 'readers' as SocialTab, label: 'Readers', icon: Users },
          ] satisfies { id: SocialTab; label: string; icon: React.ComponentType<{ className?: string }> }[]
        ).map((item) => {
          const Icon = item.icon;
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`py-2 rounded-full text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition ${
                active
                  ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm'
                  : 'text-zinc-500'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {item.label}
            </button>
          );
        })}
      </div>

      {tab === 'feed' ? (
        <>
          {/* Story-style reader rail */}
          <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1 snap-x snap-mandatory">
            <button
              type="button"
              onClick={() => user && openReader(user.username)}
              className="snap-start shrink-0 w-[62px] flex flex-col items-center gap-1.5"
            >
              <span className="w-14 h-14 rounded-full bg-emerald-600 text-white text-base font-bold flex items-center justify-center ring-2 ring-emerald-600/30">
                {(mySocialProfile?.displayName ?? user?.display_name ?? 'You').slice(0, 1).toUpperCase()}
              </span>
              <span className="text-[10px] text-zinc-500 truncate max-w-[62px]">You</span>
            </button>

            {readers.slice(0, 12).map((r) => (
              <button
                key={r.userId}
                type="button"
                onClick={() => openReader(r.username)}
                className="snap-start shrink-0 w-[62px] flex flex-col items-center gap-1.5"
              >
                <span
                  className={`w-14 h-14 rounded-full bg-emerald-600/15 text-emerald-700 dark:text-emerald-300 text-sm font-bold flex items-center justify-center ${
                    r.isTethered ? 'ring-2 ring-emerald-500' : 'ring-1 ring-zinc-200 dark:ring-zinc-700'
                  }`}
                >
                  {r.displayName.slice(0, 1).toUpperCase()}
                </span>
                <span className="text-[10px] text-zinc-500 truncate max-w-[62px]">@{r.username}</span>
              </button>
            ))}

            <button
              type="button"
              onClick={() => setTab('readers')}
              className="snap-start shrink-0 w-[62px] flex flex-col items-center gap-1.5"
            >
              <span className="w-14 h-14 rounded-full border border-dashed border-zinc-300 dark:border-zinc-700 text-zinc-400 flex items-center justify-center">
                <UserPlus className="w-5 h-5" />
              </span>
              <span className="text-[10px] text-zinc-500">Find</span>
            </button>
          </div>

          {/* Feed */}
          {activityFeed.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800 p-8 text-center space-y-3">
              <p className="text-xs text-zinc-500">
                Verified sessions, challenge launches and duel results land here the moment they
                happen.
              </p>
              <button
                type="button"
                onClick={() => openSessionFlow()}
                className="px-3.5 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold"
              >
                Start a verified session
              </button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {activityFeed.slice(0, 25).map((ev) => {
                const trusted = typeof ev.trustScore === 'number' && ev.trustScore >= 900;
                return (
                  <article
                    key={ev.id}
                    className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3.5 min-w-0"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <button
                        type="button"
                        onClick={() => openReader(ev.actorUsername)}
                        className="w-9 h-9 rounded-full bg-emerald-600/15 text-emerald-700 dark:text-emerald-300 text-xs font-bold flex items-center justify-center shrink-0"
                      >
                        {ev.actorUsername.slice(0, 1).toUpperCase()}
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <button
                            type="button"
                            onClick={() => openReader(ev.actorUsername)}
                            className="text-xs font-bold truncate hover:underline"
                          >
                            @{ev.actorUsername}
                          </button>
                          {trusted && (
                            <ShieldCheck className="w-3 h-3 text-emerald-600 shrink-0" />
                          )}
                        </div>
                        <div className="text-[10px] text-zinc-400">
                          {timeAgo(ev.createdAt)} ago
                          {typeof ev.trustScore === 'number' ? ` · Honest ${ev.trustScore}/1000` : ''}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleSparkEvent(ev.id)}
                        aria-pressed={Boolean(ev.sparkedByMe)}
                        aria-label={ev.sparkedByMe ? 'Remove spark' : 'Spark this activity'}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[11px] font-semibold shrink-0 transition ${
                          ev.sparkedByMe
                            ? 'border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-300'
                            : 'border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                        }`}
                      >
                        <Sparkles className="w-3 h-3" />
                        {ev.sparkCount ?? 0}
                      </button>
                    </div>

                    <p className="mt-2 text-sm leading-snug text-zinc-700 dark:text-zinc-300 break-words">
                      {ev.summary}
                    </p>
                  </article>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              refreshSocialAndDuels(readerSearch);
            }}
            className="rounded-full border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-2.5 flex items-center gap-2"
          >
            <Search className="w-4 h-4 text-zinc-400 shrink-0" />
            <input
              type="text"
              value={readerSearch}
              onChange={(e) => {
                setReaderSearch(e.target.value);
                refreshSocialAndDuels(e.target.value);
              }}
              placeholder="Find readers by @username or name…"
              className="flex-1 min-w-0 bg-transparent text-xs focus:outline-none"
            />
          </form>

          <div className="flex items-center gap-1.5 text-[11px] text-zinc-500 px-1">
            <Users className="w-3.5 h-3.5" />
            {readers.length} reader{readers.length === 1 ? '' : 's'}
            {tetheredCount > 0 ? ` · ${tetheredCount} tethered` : ''}
          </div>

          {suggested.length > 0 && !readerSearch.trim() && (
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3 space-y-2">
              <p className="text-[11px] font-semibold text-zinc-500">Suggested to tether</p>
              <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                {suggested.map((r) => (
                  <div
                    key={`sug-${r.userId}`}
                    className="shrink-0 w-[132px] rounded-xl border border-zinc-200 dark:border-zinc-800 p-2.5 text-center space-y-1.5"
                  >
                    <button
                      type="button"
                      onClick={() => openReader(r.username)}
                      className="mx-auto w-10 h-10 rounded-full bg-emerald-600/15 text-emerald-700 dark:text-emerald-300 text-xs font-bold flex items-center justify-center"
                    >
                      {r.displayName.slice(0, 1).toUpperCase()}
                    </button>
                    <div className="text-[11px] font-semibold truncate">@{r.username}</div>
                    <div className="text-[10px] text-zinc-500 truncate">{r.rankTitle}</div>
                    <button
                      type="button"
                      onClick={() => toggleFollowReader(r.userId)}
                      className="w-full py-1 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[10px] font-semibold inline-flex items-center justify-center gap-1"
                    >
                      <UserPlus className="w-3 h-3" /> Tether
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {readers.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800 p-8 text-center text-xs text-zinc-500">
              {readerSearch.trim()
                ? `No reader matches “${readerSearch.trim()}”. Try fewer letters.`
                : 'No public readers yet — invite a friend and tether them here.'}
            </div>
          ) : (
            <div className="space-y-2">
              {readers.map((r) => (
                <div
                  key={r.userId}
                  className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3 flex items-center gap-2.5 min-w-0"
                >
                  <button
                    type="button"
                    onClick={() => openReader(r.username)}
                    className="flex items-center gap-2.5 min-w-0 flex-1 text-left"
                  >
                    <span className="w-10 h-10 rounded-full bg-emerald-600/15 text-emerald-700 dark:text-emerald-300 text-sm font-bold flex items-center justify-center shrink-0">
                      {r.displayName.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5">
                        <span className="text-xs font-bold truncate">{r.displayName}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-medium shrink-0">
                          {r.rankTitle}
                        </span>
                      </span>
                      <span className="block text-[11px] text-zinc-500 truncate">
                        @{r.username} · {r.verifiedMinutesTotal}m · {r.duelWins}W–{r.duelLosses}L
                        {typeof r.sparkCount === 'number' && r.sparkCount > 0
                          ? ` · ${r.sparkCount} sparks`
                          : ''}
                      </span>
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleFollowReader(r.userId)}
                    className={`px-2.5 py-1.5 rounded-xl text-[11px] font-semibold inline-flex items-center gap-1 shrink-0 ${
                      r.isFollowing
                        ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300'
                        : 'bg-emerald-600 text-white'
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
                  <ChevronRight className="w-4 h-4 text-zinc-300 dark:text-zinc-600 shrink-0" />
                </div>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={() => setActiveView('live_watch')}
            className="w-full text-left rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 flex items-center gap-3"
          >
            <div className="w-9 h-9 rounded-full bg-emerald-600/10 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0">
              <Radio className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold">Read together, live</p>
              <p className="text-[11px] text-zinc-500">Join a verified reading room with your tethers.</p>
            </div>
            <ChevronRight className="w-4 h-4 text-zinc-300" />
          </button>
        </>
      )}
    </div>
  );
}
