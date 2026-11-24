'use client';

import React from 'react';
import { Bell, Download, Smartphone, X } from 'lucide-react';
import { useBooklit } from '@/context/BooklitContext';
import { usePwaInstallState } from './InstallAppButton';
import { promptPwaInstall } from '@/lib/pwaInstall';

/**
 * Home-screen install card for mobile visitors. It no longer depends on the
 * browser firing `beforeinstallprompt` (which never happens on iOS Safari);
 * when the native prompt is unavailable it offers the guided steps instead.
 */
export function InstallPwaAndNotificationBanners() {
  const {
    showFirstSessionNotificationBanner,
    dismissFirstSessionNotificationBanner,
    updateProfile,
  } = useBooklit();
  const install = usePwaInstallState();
  const [installDismissed, setInstallDismissed] = React.useState(false);
  const [notifStatusMsg, setNotifStatusMsg] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.localStorage.getItem('booklit_install_dismissed') === '1') {
      setInstallDismissed(true);
    }
  }, []);

  const dismissInstall = () => {
    setInstallDismissed(true);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('booklit_install_dismissed', '1');
    }
  };

  const handleInstall = async () => {
    const outcome = await promptPwaInstall();
    if (outcome === 'accepted' || outcome === 'installed') dismissInstall();
  };

  const handleEnableNotifications = async () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      try {
        const perm = await Notification.requestPermission();
        if (perm === 'granted') {
          await updateProfile({
            settingsPatch: {
              notificationsEnabled: true,
              notificationsPromptedAfterFirstSession: true,
            },
          });
          setNotifStatusMsg('Reading window reminders enabled.');
          setTimeout(() => {
            dismissFirstSessionNotificationBanner();
            setNotifStatusMsg(null);
          }, 1400);
          return;
        }
      } catch {
        // Fallback to email reminder schedule
      }
    }
    await updateProfile({
      settingsPatch: {
        notificationsEnabled: true,
        notificationsPromptedAfterFirstSession: true,
      },
    });
    setNotifStatusMsg('Scheduled quiet email fallback reminders.');
    setTimeout(() => {
      dismissFirstSessionNotificationBanner();
      setNotifStatusMsg(null);
    }, 1400);
  };

  const showInstallCard =
    !installDismissed && !install.isInstalled && install.platform !== 'desktop';

  return (
    <div className="space-y-2.5 mb-4">
      {showInstallCard && (
        <div className="rounded-xl border border-emerald-700/25 bg-emerald-500/5 dark:bg-emerald-900/20 px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-lg bg-emerald-700/15 text-emerald-700 dark:text-emerald-300 shrink-0">
              <Smartphone className="w-4 h-4" />
            </div>
            <div className="text-xs min-w-0">
              <p className="font-semibold text-zinc-900 dark:text-zinc-100">Add Booklit to Home Screen</p>
              <p className="text-[11px] text-zinc-600 dark:text-zinc-400">
                Full-screen reading, offline drafts, no browser bars.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleInstall}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-[11px] font-semibold transition"
            >
              <Download className="w-3.5 h-3.5" />
              Install
            </button>
            <button
              type="button"
              onClick={dismissInstall}
              aria-label="Dismiss install card"
              className="p-1.5 rounded-lg text-zinc-500 hover:bg-zinc-200/60 dark:hover:bg-zinc-800"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {showFirstSessionNotificationBanner && (
        <div className="rounded-xl border border-amber-600/30 bg-amber-500/10 px-4 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-amber-600/20 text-amber-800 dark:text-amber-300 shrink-0">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                Nice session! Want gentle reminders for your reading windows?
              </p>
              <p className="text-xs text-zinc-600 dark:text-zinc-300 mt-0.5">
                Only during windows you choose, with email fallback if push isn’t supported.
              </p>
              {notifStatusMsg && (
                <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300 mt-1">
                  {notifStatusMsg}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
            <button
              type="button"
              onClick={dismissFirstSessionNotificationBanner}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200/60 dark:hover:bg-zinc-800"
            >
              Not now
            </button>
            <button
              type="button"
              onClick={handleEnableNotifications}
              className="px-3.5 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-medium transition"
            >
              Enable Quiet Reminders
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
