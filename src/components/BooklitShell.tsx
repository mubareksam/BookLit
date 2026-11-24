'use client';

import React from 'react';
import {
  Award,
  BarChart3,
  BookOpen,
  Camera,
  CheckSquare,
  Clock,
  HelpCircle,
  Home,
  Laptop,
  LayoutDashboard,
  Radio,
  Search,
  Settings,
  ShieldCheck,
  Smartphone,
  Sparkles,
  User,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { ActiveNavView, useBooklit } from '@/context/BooklitContext';
import { InstallPwaAndNotificationBanners } from './InstallPwaBanner';
import { SessionRunnerModal } from './SessionRunnerModal';
import { AddBookModal } from './AddBookModal';
import { BookDetailDrawer } from './BookDetailDrawer';
import { AuthProfileModal } from './AuthProfileModal';
import { DashboardView } from './views/DashboardView';
import { LibraryView } from './views/LibraryView';
import { TbrView } from './views/TbrView';
import { SessionsAndVerificationView } from './views/SessionsAndVerificationView';
import { StatsView } from './views/StatsView';
import { RecommendationsAndRecapView } from './views/RecommendationsAndRecapView';
import { LiveWatchView } from './views/LiveWatchView';
import { SettingsAndPrivacyView } from './views/SettingsAndPrivacyView';

const DESKTOP_NAV: { id: ActiveNavView; label: string; icon: React.ElementType }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'library', label: 'Library', icon: BookOpen },
  { id: 'tbr', label: 'TBR Queue', icon: CheckSquare },
  { id: 'sessions', label: 'Sessions', icon: Clock },
  { id: 'verification', label: 'Verification & Cure', icon: ShieldCheck },
  { id: 'stats', label: 'Stats', icon: BarChart3 },
  { id: 'recommendations', label: 'Recommendations', icon: Sparkles },
  { id: 'live_watch', label: 'Live Watch', icon: Radio },
  { id: 'year_in_books', label: 'Year in Books', icon: Award },
  { id: 'how_it_works', label: 'How It Works', icon: HelpCircle },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export function BooklitShell() {
  const {
    ready,
    user,
    activeView,
    setActiveView,
    interactionProfile,
    globalSearchQuery,
    setGlobalSearchQuery,
    searchInputRef,
    isOnline,
    simulateOffline,
    setSimulateOffline,
    pendingSyncCount,
    activeDraft,
    openSessionFlow,
    setAuthModalOpen,
    updateProfile,
  } = useBooklit();

  if (!ready || !user) {
    return (
      <div className="min-h-screen bg-paper-50 dark:bg-ink-950 flex items-center justify-center p-6">
        <div className="text-center space-y-2">
          <div className="w-10 h-10 rounded-2xl bg-emerald-700 text-white font-serif font-bold text-lg flex items-center justify-center mx-auto animate-pulse">
            B
          </div>
          <p className="text-xs font-medium text-stone-500">
            Opening offline-first reading workspace…
          </p>
        </div>
      </div>
    );
  }

  const renderMainView = () => {
    switch (activeView) {
      case 'dashboard':
        return <DashboardView />;
      case 'library':
        return <LibraryView />;
      case 'tbr':
        return <TbrView />;
      case 'sessions':
        return <SessionsAndVerificationView key="sessions" initialTab="sessions" />;
      case 'verification':
        return <SessionsAndVerificationView key="verification" initialTab="verification" />;
      case 'stats':
        return <StatsView />;
      case 'recommendations':
        return (
          <RecommendationsAndRecapView
            key="recommendations"
            initialSection="recommendations"
          />
        );
      case 'year_in_books':
        return (
          <RecommendationsAndRecapView key="year_in_books" initialSection="year_in_books" />
        );
      case 'live_watch':
        return <LiveWatchView />;
      case 'how_it_works':
        return <SettingsAndPrivacyView key="how_it_works" initialSection="how_it_works" />;
      case 'settings':
        return <SettingsAndPrivacyView key="settings" initialSection="settings" />;
      default:
        return <DashboardView />;
    }
  };

  // ============================================================================
  // TOUCH-FIRST / INSTALLED PWA SHELL (Bottom Thumb-Zone Navigation)
  // ============================================================================
  if (interactionProfile === 'pwa') {
    return (
      <div className="min-h-screen bg-paper-50 dark:bg-ink-950 text-stone-900 dark:text-stone-100 flex flex-col">
        {/* Safe-area compact top bar */}
        <header className="sticky top-0 z-30 bg-paper-50/90 dark:bg-ink-950/90 backdrop-blur-md border-b border-stone-200/80 dark:border-stone-800 px-4 py-3 flex items-center justify-between gap-2">
          <div
            onClick={() => setActiveView('dashboard')}
            className="flex items-center gap-2 cursor-pointer"
          >
            <div className="w-7 h-7 rounded-lg bg-emerald-700 text-white font-serif font-bold text-sm flex items-center justify-center">
              B
            </div>
            <div>
              <span className="font-serif font-bold text-base tracking-tight">Booklit</span>
              <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-emerald-700/15 text-emerald-800 dark:text-emerald-300 font-mono">
                PWA
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() =>
                updateProfile({ settingsPatch: { interactionProfileOverride: 'desktop' } })
              }
              title="Switch to Desktop Web UI profile"
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-stone-300 dark:border-stone-700 text-[11px] font-medium"
            >
              <Laptop className="w-3 h-3" />
              Web UI
            </button>
            <button
              type="button"
              onClick={() => setActiveView('library')}
              className="p-2 rounded-xl hover:bg-stone-200/60 dark:hover:bg-ink-800"
              aria-label="Library"
            >
              <BookOpen className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setActiveView('live_watch')}
              className="p-2 rounded-xl hover:bg-stone-200/60 dark:hover:bg-ink-800"
              aria-label="Live Watch"
            >
              <Radio className="w-4 h-4 text-emerald-600" />
            </button>
            <button
              type="button"
              onClick={() => setActiveView('verification')}
              className="p-2 rounded-xl hover:bg-stone-200/60 dark:hover:bg-ink-800"
              aria-label="Trust & Verification"
            >
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
            </button>
          </div>
        </header>

        <main className="flex-1 px-4 pt-4 pb-28 max-w-2xl w-full mx-auto">
          <InstallPwaAndNotificationBanners />
          {renderMainView()}
        </main>

        {/* Bottom Thumb-Zone Navigation: Home · TBR · [Center Large Scan] · Stats · Profile */}
        <nav
          aria-label="Mobile bottom navigation"
          className="fixed bottom-0 inset-x-0 z-40 bg-paper-50/95 dark:bg-ink-950/95 backdrop-blur-lg border-t border-stone-200 dark:border-stone-800 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5"
        >
          <div className="max-w-md mx-auto grid grid-cols-5 items-end gap-1">
            <button
              type="button"
              onClick={() => setActiveView('dashboard')}
              className={`flex flex-col items-center py-1.5 text-[11px] font-medium ${
                activeView === 'dashboard'
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : 'text-stone-500'
              }`}
            >
              <Home className="w-5 h-5 mb-0.5" />
              Home
            </button>

            <button
              type="button"
              onClick={() => setActiveView('tbr')}
              className={`flex flex-col items-center py-1.5 text-[11px] font-medium ${
                activeView === 'tbr'
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : 'text-stone-500'
              }`}
            >
              <CheckSquare className="w-5 h-5 mb-0.5" />
              TBR
            </button>

            {/* Center Largest Target: Scan */}
            <div className="flex flex-col items-center -mt-5">
              <button
                type="button"
                onClick={() => openSessionFlow(activeDraft?.book_id)}
                className="w-14 h-14 rounded-2xl bg-emerald-700 hover:bg-emerald-600 active:scale-95 text-white shadow-lg shadow-emerald-950/40 flex flex-col items-center justify-center transition"
              >
                <Camera className="w-6 h-6" />
              </button>
              <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 mt-1">
                {activeDraft ? 'Live' : 'Scan'}
              </span>
            </div>

            <button
              type="button"
              onClick={() => setActiveView('stats')}
              className={`flex flex-col items-center py-1.5 text-[11px] font-medium ${
                activeView === 'stats'
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : 'text-stone-500'
              }`}
            >
              <BarChart3 className="w-5 h-5 mb-0.5" />
              Stats
            </button>

            <button
              type="button"
              onClick={() => setActiveView('settings')}
              className={`flex flex-col items-center py-1.5 text-[11px] font-medium ${
                activeView === 'settings'
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : 'text-stone-500'
              }`}
            >
              <User className="w-5 h-5 mb-0.5" />
              Profile
            </button>
          </div>
        </nav>

        <SessionRunnerModal />
        <AddBookModal />
        <BookDetailDrawer />
        <AuthProfileModal />
      </div>
    );
  }

  // ============================================================================
  // DESKTOP / TABLET WEB SHELL (Persistent Left Sidebar + Keyboard Search Header)
  // ============================================================================
  return (
    <div className="min-h-screen bg-paper-50 dark:bg-ink-950 text-stone-900 dark:text-stone-100 flex">
      {/* Persistent Left Sidebar */}
      <aside className="w-64 shrink-0 border-r border-stone-200 dark:border-stone-800 bg-paper-100/70 dark:bg-ink-900/70 hidden md:flex flex-col justify-between p-4 sticky top-0 h-screen">
        <div className="space-y-5">
          <div
            onClick={() => setActiveView('dashboard')}
            className="flex items-center gap-2.5 px-2 cursor-pointer"
          >
            <div className="w-8 h-8 rounded-xl bg-emerald-700 text-white font-serif font-bold text-base flex items-center justify-center shadow-sm">
              B
            </div>
            <div>
              <div className="font-serif font-bold text-lg leading-none">Booklit</div>
              <div className="text-[10px] text-stone-500 mt-0.5">Verified Reading Coach</div>
            </div>
          </div>

          <nav className="space-y-0.5">
            {DESKTOP_NAV.map((item) => {
              const Icon = item.icon;
              const isActive = activeView === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveView(item.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition ${
                    isActive
                      ? 'bg-emerald-700 text-white shadow-sm'
                      : 'text-stone-700 dark:text-stone-300 hover:bg-stone-200/70 dark:hover:bg-ink-800'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <Icon className="w-4 h-4" />
                    {item.label}
                  </span>
                  {item.id === 'verification' && user.strike_count > 0 && (
                    <span
                      className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${
                        isActive ? 'bg-white/20 text-white' : 'bg-rose-500/15 text-rose-600'
                      }`}
                    >
                      {user.strike_count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom User Profile & Sync Indicator */}
        <div className="space-y-2.5 pt-4 border-t border-stone-200 dark:border-stone-800">
          <button
            type="button"
            onClick={() => setSimulateOffline(!simulateOffline)}
            className={`w-full px-3 py-2 rounded-xl text-xs flex items-center justify-between border transition ${
              isOnline
                ? 'border-stone-200 dark:border-stone-800 text-stone-600 dark:text-stone-400 hover:bg-white dark:hover:bg-ink-800'
                : 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300 font-medium'
            }`}
          >
            <span className="inline-flex items-center gap-1.5">
              {isOnline ? (
                <Wifi className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <WifiOff className="w-3.5 h-3.5 text-amber-600" />
              )}
              {isOnline ? 'Online · IndexedDB Synced' : 'Offline Mode (Local Queue)'}
            </span>
            {pendingSyncCount > 0 && (
              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20">
                {pendingSyncCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setAuthModalOpen(true)}
            className="w-full p-2.5 rounded-xl bg-white dark:bg-ink-800 border border-stone-200 dark:border-stone-700 flex items-center justify-between text-left hover:border-emerald-700/40 transition"
          >
            <div className="min-w-0">
              <div className="text-xs font-semibold truncate">{user.display_name}</div>
              <div className="text-[10px] text-stone-500 truncate">
                Goal: {user.reading_goal_target}{' '}
                {user.reading_goal_type.replace('_', ' / ')}
              </div>
            </div>
            <User className="w-4 h-4 text-stone-400 shrink-0" />
          </button>
        </div>
      </aside>

      {/* Main Content Column */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Desktop Header Bar */}
        <header className="sticky top-0 z-30 bg-paper-50/90 dark:bg-ink-950/90 backdrop-blur-md border-b border-stone-200/80 dark:border-stone-800 px-6 py-3 flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-2.5" />
            <input
              ref={searchInputRef}
              type="text"
              value={globalSearchQuery}
              onChange={(e) => {
                setGlobalSearchQuery(e.target.value);
                if (activeView !== 'library') setActiveView('library');
              }}
              placeholder="Press / to search books, authors, genres, or sessions…"
              className="w-full pl-9 pr-10 py-1.5 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-ink-900 text-xs focus:outline-none focus:border-emerald-700"
            />
            <kbd className="absolute right-2.5 top-1.5 px-1.5 py-0.5 rounded bg-paper-100 dark:bg-ink-800 border border-stone-200 dark:border-stone-700 text-[10px] font-mono text-stone-400">
              /
            </kbd>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Quick Interaction Profile Switcher so reviewers can preview Installed Touch PWA UX anytime */}
            <button
              type="button"
              onClick={() =>
                updateProfile({ settingsPatch: { interactionProfileOverride: 'pwa' } })
              }
              title="Preview Touch-First Installed PWA navigation & swipe deck"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-stone-300 dark:border-stone-700 text-xs font-medium text-stone-600 dark:text-stone-300 hover:bg-white dark:hover:bg-ink-800"
            >
              <Smartphone className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-300" />
              Switch to Touch PWA UI
            </button>

            <button
              type="button"
              onClick={() => openSessionFlow(activeDraft?.book_id)}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold shadow-sm"
            >
              <Camera className="w-3.5 h-3.5" />
              {activeDraft ? 'Resume Live Session (E)' : 'Start Session (S)'}
            </button>
          </div>
        </header>

        <main className="flex-1 p-6 max-w-6xl w-full mx-auto">
          <InstallPwaAndNotificationBanners />
          {renderMainView()}
        </main>
      </div>

      <SessionRunnerModal />
      <AddBookModal />
      <BookDetailDrawer />
      <AuthProfileModal />
    </div>
  );
}
