'use client';

import React, { useEffect, useState } from 'react';
import {
  BarChart3,
  BookOpen,
  Compass,
  Download,
  Home,
  ListTodo,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Settings,
  ShieldCheck,
  Trophy,
  WifiOff,
} from 'lucide-react';
import { ActiveNavView, useBooklit } from '@/context/BooklitContext';
import { BooklitLogo } from '@/components/BooklitLogo';
import { AuthLandingScreen } from '@/components/AuthLandingScreen';
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

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const NAV_ITEMS: Array<{
  id: ActiveNavView;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'dashboard', label: 'Today', shortLabel: 'Today', icon: Home },
  { id: 'challenges', label: 'Challenges', shortLabel: 'Compete', icon: Trophy },
  { id: 'library', label: 'Library', shortLabel: 'Library', icon: BookOpen },
  { id: 'tbr', label: 'TBR Queue', shortLabel: 'TBR', icon: ListTodo },
  { id: 'sessions', label: 'Sessions & Trust', shortLabel: 'Verify', icon: ShieldCheck },
  { id: 'stats', label: 'Analytics', shortLabel: 'Stats', icon: BarChart3 },
  { id: 'recommendations', label: 'Recs & Recaps', shortLabel: 'Discover', icon: Compass },
  { id: 'live_watch', label: 'Live Rooms', shortLabel: 'Live', icon: Radio },
  { id: 'settings', label: 'Profile & Settings', shortLabel: 'Profile', icon: Settings },
];

const PWA_BOTTOM_TABS: ActiveNavView[] = [
  'dashboard',
  'challenges',
  'library',
  'sessions',
  'settings',
];

export function BooklitShell() {
  const {
    ready,
    user,
    activeView,
    setActiveView,
    interactionProfile,
    isOnline,
    pendingSyncCount,
    triggerManualSync,
    activeDraft,
    openSessionFlow,
    setAddBookModalOpen,
  } = useBooklit();

  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
  }, []);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-white">
        <div className="flex flex-col items-center gap-3">
          <BooklitLogo size="lg" showWordmark={false} />
          <p className="text-xs text-zinc-400">Loading Booklit…</p>
        </div>
      </div>
    );
  }

  // Real Account Gate: Guests cannot enter or participate without signing in
  if (!user) {
    return <AuthLandingScreen />;
  }

  const isPwa = interactionProfile === 'pwa';

  return (
    <div className="min-h-screen w-full max-w-[100vw] overflow-x-hidden flex flex-col lg:flex-row bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      {/* WEB MODE ONLY: Left Sidebar */}
      {!isPwa && (
        <aside className="hidden lg:flex lg:w-60 xl:w-64 shrink-0 flex-col border-r border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/60 px-3.5 py-5 sticky top-0 h-screen">
          <div className="flex items-center justify-between px-2 mb-5">
            <button
              type="button"
              onClick={() => setActiveView('dashboard')}
              className="flex items-center gap-2.5 text-left min-w-0"
            >
              <BooklitLogo size="sm" showWordmark={false} />
              <div className="min-w-0">
                <div className="font-bold text-base tracking-tight leading-none">
                  Book<span className="text-emerald-600 dark:text-emerald-400">lit</span>
                </div>
                <div className="text-[10px] text-zinc-400 mt-0.5 truncate">@{user.username}</div>
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

          <nav className="flex-1 space-y-0.5 overflow-y-auto">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = activeView === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveView(item.id)}
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
          </nav>

          <div className="pt-3 mt-3 border-t border-zinc-200 dark:border-zinc-800 space-y-2">
            {installPrompt && (
              <button
                type="button"
                onClick={async () => {
                  await installPrompt.prompt();
                  setInstallPrompt(null);
                }}
                className="w-full py-2 px-3 rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-xs font-semibold flex items-center justify-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                Install App
              </button>
            )}

            <button
              type="button"
              onClick={() => setActiveView('settings')}
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

      {/* Main Content */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 backdrop-blur-md bg-zinc-50/90 dark:bg-zinc-950/90 border-b border-zinc-200/80 dark:border-zinc-800/80 px-4 sm:px-6 py-2.5">
          <div className="max-w-5xl mx-auto flex items-center justify-between gap-2 min-w-0">
            <div className={`flex items-center gap-2 min-w-0 ${!isPwa ? 'lg:hidden' : ''}`}>
              <BooklitLogo size="sm" />
            </div>

            {!isPwa && (
              <div className="hidden lg:flex items-center gap-2 text-xs text-zinc-500 min-w-0">
                <span className="font-medium text-zinc-800 dark:text-zinc-200">
                  {NAV_ITEMS.find((i) => i.id === activeView)?.label}
                </span>
              </div>
            )}

            <div className="flex items-center gap-2 ml-auto shrink-0">
              {!isOnline && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[11px] font-medium">
                  <WifiOff className="w-3 h-3" />
                  Offline ({pendingSyncCount})
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
                  Sync ({pendingSyncCount})
                </button>
              )}

              <button
                type="button"
                onClick={() => setAddBookModalOpen(true)}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs font-semibold hover:bg-zinc-50 dark:hover:bg-zinc-800"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Book</span>
              </button>

              {!isPwa && (
                <button
                  type="button"
                  onClick={() => openSessionFlow()}
                  className="lg:hidden inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-semibold"
                >
                  <Play className="w-3 h-3 fill-current" />
                  {activeDraft ? 'Resume' : 'Read'}
                </button>
              )}
            </div>
          </div>

          {/* Responsive Web Nav Pills (only in Web mode on narrow viewports) */}
          {!isPwa && (
            <div className="lg:hidden flex items-center gap-1 overflow-x-auto pt-2.5 pb-0.5">
              {NAV_ITEMS.map((item) => {
                const active = activeView === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveView(item.id)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition ${
                      active
                        ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                        : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                    }`}
                  >
                    {item.shortLabel}
                  </button>
                );
              })}
            </div>
          )}
        </header>

        <main className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 py-5 min-w-0 overflow-x-hidden">
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

      {/* PWA STANDALONE MODE ONLY */}
      {isPwa && (
        <>
          <button
            type="button"
            onClick={() => openSessionFlow()}
            aria-label="Start reading session"
            className="fixed bottom-20 right-4 z-30 h-12 px-4 rounded-full bg-emerald-600 text-white shadow-xl flex items-center gap-2 font-semibold text-xs active:scale-95 transition"
          >
            <Play className="w-4 h-4 fill-current" />
            {activeDraft ? 'Resume' : 'Read'}
          </button>

          <nav className="fixed bottom-0 inset-x-0 z-30 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border-t border-zinc-200 dark:border-zinc-800 px-2 py-1.5">
            <div className="max-w-md mx-auto grid grid-cols-5 gap-1">
              {PWA_BOTTOM_TABS.map((tabId) => {
                const meta = NAV_ITEMS.find((n) => n.id === tabId)!;
                const Icon = meta.icon;
                const active = activeView === tabId;
                return (
                  <button
                    key={tabId}
                    type="button"
                    onClick={() => setActiveView(tabId)}
                    className={`flex flex-col items-center py-1 rounded-xl text-[10px] font-medium ${
                      active
                        ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                        : 'text-zinc-500'
                    }`}
                  >
                    <Icon className="w-4 h-4 mb-0.5" />
                    <span className="truncate max-w-full">{meta.shortLabel}</span>
                  </button>
                );
              })}
            </div>
          </nav>
        </>
      )}

      <SessionRunnerModal />
      <AddBookModal />
      <BookDetailDrawer />
    </div>
  );
}
