'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  BookOpen,
  ChevronRight,
  Compass,
  Home,
  Layers,
  ListTodo,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Settings,
  ShieldCheck,
  Trophy,
  WifiOff,
  X,
} from 'lucide-react';
import { ActiveNavView, useBooklit } from '@/context/BooklitContext';
import { BooklitLogo } from '@/components/BooklitLogo';
import { AuthLandingScreen } from '@/components/AuthLandingScreen';
import { ThemeToggle } from '@/components/ThemeToggle';
import { InstallAppButton } from '@/components/InstallAppButton';
import { DashboardView } from '@/components/views/DashboardView';
import { ChallengesView } from '@/components/views/ChallengesView';
import { LibraryView } from '@/components/views/LibraryView';
import { TbrView } from '@/components/views/TbrView';
import { SessionsAndVerificationView } from '@/components/views/SessionsAndVerificationView';
import { StatsView } from '@/components/views/StatsView';
import { RecommendationsAndRecapView } from '@/components/views/RecommendationsAndRecapView';
import { LiveWatchView } from '@/components/views/LiveWatchView';
import { SettingsAndPrivacyView } from '@/components/views/SettingsAndPrivacyView';
import { SessionRunnerModal } from '@/components/SessionRunnerModal';
import { AddBookModal } from '@/components/AddBookModal';
import { BookDetailDrawer } from '@/components/BookDetailDrawer';
import { ReaderProfileDrawer } from '@/components/ReaderProfileDrawer';
import { InstallPwaAndNotificationBanners } from '@/components/InstallPwaBanner';

interface NavItem {
  id: ActiveNavView;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  hint: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Today', shortLabel: 'Today', icon: Home, hint: 'Goals & next action' },
  {
    id: 'challenges',
    label: 'Arena',
    shortLabel: 'Arena',
    icon: Trophy,
    hint: 'Challenges, duels, sparks',
  },
  { id: 'library', label: 'Library', shortLabel: 'Library', icon: BookOpen, hint: 'Your books' },
  { id: 'tbr', label: 'TBR Queue', shortLabel: 'TBR', icon: ListTodo, hint: 'Up next' },
  {
    id: 'sessions',
    label: 'Sessions & Honesty',
    shortLabel: 'Verify',
    icon: ShieldCheck,
    hint: 'Verified history',
  },
  { id: 'stats', label: 'Analytics', shortLabel: 'Stats', icon: BarChart3, hint: 'Trends' },
  {
    id: 'recommendations',
    label: 'Discover & Recaps',
    shortLabel: 'Discover',
    icon: Compass,
    hint: 'Next reads',
  },
  { id: 'live_watch', label: 'Live Rooms', shortLabel: 'Live', icon: Radio, hint: 'Read together' },
  {
    id: 'settings',
    label: 'Profile & Settings',
    shortLabel: 'Profile',
    icon: Settings,
    hint: 'Bio, theme, privacy',
  },
];

/** Bottom navigation: exactly four thumb-reachable tabs. */
const BOTTOM_TABS: Array<{ id: ActiveNavView | 'more'; label: string; icon: NavItem['icon'] }> = [
  { id: 'dashboard', label: 'Today', icon: Home },
  { id: 'library', label: 'Library', icon: BookOpen },
  { id: 'challenges', label: 'Arena', icon: Trophy },
  { id: 'more', label: 'More', icon: Layers },
];

/** Grouped overflow so similar destinations stack instead of sprawling. */
const MORE_GROUPS: Array<{ title: string; ids: ActiveNavView[] }> = [
  { title: 'Reading', ids: ['tbr', 'sessions'] },
  { title: 'Insights', ids: ['stats', 'recommendations', 'live_watch'] },
  { title: 'Account', ids: ['settings'] },
];

const SIDEBAR_GROUPS: Array<{ title: string; ids: ActiveNavView[] }> = [
  { title: 'Read', ids: ['dashboard', 'library', 'tbr'] },
  { title: 'Compete', ids: ['challenges', 'sessions'] },
  { title: 'Insights', ids: ['stats', 'recommendations', 'live_watch'] },
  { title: 'Account', ids: ['settings'] },
];

function navMeta(id: ActiveNavView): NavItem {
  return NAV_ITEMS.find((item) => item.id === id) ?? NAV_ITEMS[0];
}

export function BooklitShell() {
  const {
    ready,
    user,
    activeView,
    setActiveView,
    isOnline,
    pendingSyncCount,
    triggerManualSync,
    activeDraft,
    openSessionFlow,
    setAddBookModalOpen,
    interactionProfile,
  } = useBooklit();

  const [moreOpen, setMoreOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const isPwa = interactionProfile === 'pwa';
  const activeMeta = useMemo(() => navMeta(activeView), [activeView]);

  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMoreOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [moreOpen]);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div className="flex flex-col items-center gap-3">
          <BooklitLogo size="lg" showWordmark={false} />
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Loading Booklit…</p>
        </div>
      </div>
    );
  }

  // Real account gate: guests cannot enter or compete without signing in.
  if (!user) {
    return <AuthLandingScreen />;
  }

  const go = (view: ActiveNavView) => {
    setActiveView(view);
    setMoreOpen(false);
  };

  const bottomTabsActive = (id: ActiveNavView | 'more') =>
    id === 'more'
      ? !['dashboard', 'library', 'challenges'].includes(activeView)
      : activeView === id;

  return (
    <div className="min-h-screen w-full max-w-[100vw] overflow-x-hidden flex flex-col lg:flex-row bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      {/* WEB MODE: grouped left sidebar (desktop only) */}
      {!isPwa && (
        <aside className="hidden lg:flex lg:w-60 xl:w-64 shrink-0 flex-col border-r border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/60 px-3.5 py-5 sticky top-0 h-screen">
          <div className="flex items-center justify-between px-2 mb-4">
            <button
              type="button"
              onClick={() => go('dashboard')}
              className="flex items-center gap-2.5 text-left min-w-0"
            >
              <BooklitLogo size="sm" showWordmark={false} />
              <div className="min-w-0">
                <div className="font-bold text-base tracking-tight leading-none">
                  Book<span className="text-emerald-600 dark:text-emerald-400">lit</span>
                </div>
                <div className="text-[10px] text-zinc-500 mt-0.5 truncate">@{user.username}</div>
              </div>
            </button>
          </div>

          <button
            type="button"
            onClick={() => openSessionFlow()}
            className="w-full mb-4 py-2.5 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center justify-center gap-2 shadow-sm transition"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            {activeDraft ? 'Resume Timer' : 'Start Session'}
          </button>

          <nav className="flex-1 overflow-y-auto space-y-3.5">
            {SIDEBAR_GROUPS.map((group) => (
              <div key={group.title} className="space-y-0.5">
                <div className="px-3 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  {group.title}
                </div>
                {group.ids.map((id) => {
                  const item = navMeta(id);
                  const Icon = item.icon;
                  const active = activeView === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => go(id)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition ${
                        active
                          ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 font-semibold'
                          : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/70'
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>

          <div className="pt-3 mt-3 border-t border-zinc-200 dark:border-zinc-800 space-y-1.5">
            <div className="flex items-center gap-1.5">
              <ThemeToggle compact />
              <InstallAppButton variant="icon" />
              <span className="ml-auto text-[10px] text-zinc-400">
                {isOnline ? 'Online' : 'Offline'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => go('settings')}
              className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 text-left min-w-0"
            >
              <div className="min-w-0">
                <div className="text-xs font-semibold truncate">{user.display_name}</div>
                <div className="text-[11px] text-zinc-500 truncate">{user.email}</div>
              </div>
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  isOnline ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
              />
            </button>
          </div>
        </aside>
      )}

      {/* Main column */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 backdrop-blur-md bg-zinc-50/92 dark:bg-zinc-950/92 border-b border-zinc-200/80 dark:border-zinc-800/80 px-3 sm:px-6 py-2.5">
          <div className="max-w-5xl mx-auto flex items-center justify-between gap-2 min-w-0">
            <button
              type="button"
              onClick={() => go('dashboard')}
              className={`flex items-center gap-2 min-w-0 ${!isPwa ? 'lg:hidden' : ''}`}
            >
              <BooklitLogo size="sm" />
            </button>

            {!isPwa && (
              <div className="hidden lg:flex items-center gap-1.5 text-xs text-zinc-500 min-w-0">
                <span className="font-medium text-zinc-800 dark:text-zinc-200">
                  {activeMeta.label}
                </span>
                <span className="text-zinc-300 dark:text-zinc-600">·</span>
                <span className="truncate">{activeMeta.hint}</span>
              </div>
            )}

            <div className="flex items-center gap-1.5 ml-auto shrink-0">
              {!isOnline && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[11px] font-medium">
                  <WifiOff className="w-3 h-3" />
                  <span className="hidden sm:inline">Offline</span> ({pendingSyncCount})
                </span>
              )}

              {isOnline && pendingSyncCount > 0 && (
                <button
                  type="button"
                  onClick={async () => {
                    setSyncing(true);
                    try {
                      await triggerManualSync();
                    } finally {
                      setSyncing(false);
                    }
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-[11px] font-medium"
                >
                  <RefreshCw className={`w-3 h-3 ${syncing ? 'animate-spin' : ''}`} />
                  Sync
                </button>
              )}

              <ThemeToggle compact />
              <InstallAppButton variant="icon" />

              <button
                type="button"
                onClick={() => setAddBookModalOpen(true)}
                aria-label="Add a book"
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs font-semibold hover:bg-zinc-50 dark:hover:bg-zinc-800"
              >
                <Plus className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Add Book</span>
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 w-full max-w-5xl mx-auto px-3.5 sm:px-6 py-5 pb-28 lg:pb-10 min-w-0 overflow-x-hidden">
          <InstallPwaAndNotificationBanners />
          {activeView === 'dashboard' && <DashboardView />}
          {activeView === 'challenges' && <ChallengesView />}
          {activeView === 'library' && <LibraryView />}
          {activeView === 'tbr' && <TbrView />}
          {(activeView === 'sessions' || activeView === 'verification') && (
            <SessionsAndVerificationView />
          )}
          {activeView === 'stats' && <StatsView />}
          {activeView === 'recommendations' && <RecommendationsAndRecapView />}
          {activeView === 'live_watch' && <LiveWatchView />}
          {activeView === 'settings' && <SettingsAndPrivacyView />}
        </main>
      </div>

      {/* Floating session action (both PWA and web on touch layouts) */}
      {isPwa && (
        <button
          type="button"
          onClick={() => openSessionFlow()}
          aria-label="Start reading session"
          className="fixed bottom-24 right-4 z-30 h-12 px-4 rounded-full bg-emerald-600 text-white shadow-xl flex items-center gap-2 font-semibold text-xs active:scale-95 transition"
        >
          <Play className="w-4 h-4 fill-current" />
          {activeDraft ? 'Resume' : 'Read'}
        </button>
      )}

      {/* Four-tab bottom navigation: installed PWA always, web on small screens */}
      <nav
        className={`${
          isPwa ? 'fixed' : 'fixed lg:hidden'
        } bottom-0 inset-x-0 z-40 pb-[env(safe-area-inset-bottom)] bg-white/96 dark:bg-zinc-900/96 backdrop-blur-md border-t border-zinc-200 dark:border-zinc-800`}
      >
        <div className="max-w-md mx-auto grid grid-cols-4">
          {BOTTOM_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = bottomTabsActive(tab.id);
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  if (tab.id === 'more') setMoreOpen((prev) => !prev);
                  else go(tab.id);
                }}
                aria-current={active ? 'page' : undefined}
                className={`flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition ${
                  active ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-zinc-500'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Grouped "More" sheet */}
      {moreOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end justify-center"
          role="dialog"
          aria-modal="true"
          aria-label="More destinations"
          onClick={() => setMoreOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-t-3xl bg-white dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 shadow-2xl max-h-[80vh] overflow-y-auto pb-[env(safe-area-inset-bottom)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sticky top-0 bg-white/95 dark:bg-zinc-900/95 backdrop-blur px-4 pt-3 pb-2 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
              <span className="text-xs font-semibold">More</span>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                aria-label="Close menu"
                className="p-1.5 rounded-lg text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-3 py-2 space-y-3">
              <button
                type="button"
                onClick={() => {
                  setMoreOpen(false);
                  openSessionFlow();
                }}
                className="w-full py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-semibold flex items-center justify-center gap-2"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                {activeDraft ? 'Resume reading timer' : 'Start reading session'}
              </button>

              {MORE_GROUPS.map((group) => (
                <div key={group.title}>
                  <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                    {group.title}
                  </div>
                  <div className="rounded-2xl border border-zinc-100 dark:border-zinc-800 overflow-hidden divide-y divide-zinc-100 dark:divide-zinc-800">
                    {group.ids.map((id) => {
                      const item = navMeta(id);
                      const Icon = item.icon;
                      const active = activeView === id;
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => go(id)}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 text-left text-xs ${
                            active
                              ? 'bg-zinc-50 dark:bg-zinc-800/70 font-semibold'
                              : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                          }`}
                        >
                          <Icon className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          <span className="min-w-0 flex-1 truncate">
                            {item.label}
                            <span className="block text-[10px] font-normal text-zinc-500 truncate">
                              {item.hint}
                            </span>
                          </span>
                          <ChevronRight className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

              <div>
                <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                  App
                </div>
                <div className="rounded-2xl border border-zinc-100 dark:border-zinc-800 overflow-hidden divide-y divide-zinc-100 dark:divide-zinc-800">
                  <InstallAppButton variant="row" />
                  <div className="flex items-center justify-between px-3 py-2.5">
                    <span className="text-xs font-medium">Appearance</span>
                    <ThemeToggle />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setMoreOpen(false);
                      setAddBookModalOpen(true);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-left text-xs font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                  >
                    <Plus className="w-4 h-4 text-emerald-600 shrink-0" />
                    Add a book
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <SessionRunnerModal />
      <AddBookModal />
      <BookDetailDrawer />
      <ReaderProfileDrawer />
    </div>
  );
}
