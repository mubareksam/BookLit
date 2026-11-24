'use client';

import React, { useEffect, useState } from 'react';
import { Bell, Download, Share, Smartphone, X } from 'lucide-react';
import { useBooklit } from '@/context/BooklitContext';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function InstallPwaAndNotificationBanners() {
  const {
    showFirstSessionNotificationBanner,
    dismissFirstSessionNotificationBanner,
    updateProfile,
    isStandalonePwa,
  } = useBooklit();

  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosBanner, setShowIosBanner] = useState(false);
  const [installDismissed, setInstallDismissed] = useState(false);
  const [notifStatusMsg, setNotifStatusMsg] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || isStandalonePwa) return;
    if (window.sessionStorage.getItem('booklit_install_dismissed') === '1') {
      setInstallDismissed(true);
      return;
    }

    const ua = window.navigator.userAgent.toLowerCase();
    const isIos = /iphone|ipad|ipod/.test(ua);
    const isSafari = /safari/.test(ua) && !/crios|fxios|edgios|chrome/.test(ua);

    if (isIos && isSafari) {
      setShowIosBanner(true);
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, [isStandalonePwa]);

  const dismissInstall = () => {
    setInstallDismissed(true);
    setShowIosBanner(false);
    setDeferredPrompt(null);
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem('booklit_install_dismissed', '1');
    }
  };

  const handleChromiumInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
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

  return (
    <div className="space-y-2.5 mb-4">
      {/* Chromium Native Install Banner */}
      {!installDismissed && deferredPrompt && (
        <div className="rounded-xl border border-emerald-700/25 bg-emerald-950/5 dark:bg-emerald-900/20 px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-lg bg-emerald-700/15 text-emerald-700 dark:text-emerald-300 shrink-0">
              <Smartphone className="w-4 h-4" />
            </div>
            <div className="text-sm">
              <p className="font-medium text-stone-900 dark:text-stone-100">
                Install Booklit as an Offline Reading App
              </p>
              <p className="text-xs text-stone-600 dark:text-stone-400">
                Unlocks thumb-zone scan flow, instant offline session drafts, and OLED dark mode.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleChromiumInstall}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-medium transition"
            >
              <Download className="w-3.5 h-3.5" />
              Install App
            </button>
            <button
              onClick={dismissInstall}
              aria-label="Dismiss install banner"
              className="p-1.5 rounded-lg text-stone-500 hover:bg-stone-200/60 dark:hover:bg-stone-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* iOS Safari Manual Instructions Banner (never a dead-end auto-prompt!) */}
      {!installDismissed && showIosBanner && (
        <div className="rounded-xl border border-stone-300 dark:border-stone-700 bg-paper-100 dark:bg-ink-800 px-4 py-3 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-emerald-700/15 text-emerald-700 dark:text-emerald-300 mt-0.5">
              <Share className="w-4 h-4" />
            </div>
            <div className="text-xs leading-relaxed text-stone-700 dark:text-stone-300">
              <p className="font-semibold text-stone-900 dark:text-stone-100">
                Add Booklit to your iPhone Home Screen
              </p>
              <p className="mt-0.5">
                Tap Safari’s <span className="font-semibold">Share</span> button below, then choose{' '}
                <span className="font-semibold">“Add to Home Screen”</span> for full-screen page
                scanning and offline reading drafts.
              </p>
            </div>
          </div>
          <button
            onClick={dismissInstall}
            aria-label="Dismiss iOS instructions"
            className="p-1 rounded-lg text-stone-500 hover:bg-stone-200/60 dark:hover:bg-stone-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Post-First-Session Gentle Notification Explainer (never shown on first visit!) */}
      {showFirstSessionNotificationBanner && (
        <div className="rounded-xl border border-amber-600/30 bg-amber-500/10 px-4 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-amber-600/20 text-amber-800 dark:text-amber-300 shrink-0">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-medium text-stone-900 dark:text-stone-100">
                Nice session! Want gentle reminders for your scheduled reading windows?
              </p>
              <p className="text-xs text-stone-600 dark:text-stone-300 mt-0.5">
                We only nudge during windows you choose (with automatic email fallback if push isn’t
                supported). Never spammy.
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
              onClick={dismissFirstSessionNotificationBanner}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-200/60 dark:hover:bg-stone-800"
            >
              Not now
            </button>
            <button
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
