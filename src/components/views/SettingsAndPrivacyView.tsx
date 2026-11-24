'use client';

import React, { useState } from 'react';
import {
  Bell,
  CheckCircle2,
  Download,
  FileJson,
  FileSpreadsheet,
  HelpCircle,
  Laptop,
  Lock,
  Plus,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Trash2,
  WifiOff,
} from 'lucide-react';
import { useBooklit } from '@/context/BooklitContext';
import { ReminderWindow } from '@/lib/types';

export function SettingsAndPrivacyView({
  initialSection = 'settings',
}: {
  initialSection?: 'settings' | 'how_it_works';
}) {
  const {
    user,
    updateProfile,
    interactionProfile,
    isCoarsePointerDetected,
    simulateOffline,
    setSimulateOffline,
    pendingSyncCount,
    triggerManualSync,
    exportUserData,
    deleteAccount,
    resetDemoWorkspace,
  } = useBooklit();

  const [section, setSection] = useState<'settings' | 'how_it_works'>(initialSection);
  const [newWinLabel, setNewWinLabel] = useState('');
  const [newWinTime, setNewWinTime] = useState('21:00');
  const [confirmDeleteText, setConfirmDeleteText] = useState('');
  const [testReminderSent, setTestReminderSent] = useState<string | null>(null);

  if (!user) return null;

  const settings = user.settings_json;

  const handleAddReminderWindow = async (e: React.FormEvent) => {
    e.preventDefault();
    const win: ReminderWindow = {
      id: `rem-${Date.now()}`,
      label: newWinLabel.trim() || 'Quiet Reading Window',
      startTime: newWinTime,
      durationMinutes: 30,
      days: [1, 2, 3, 4, 5],
      enabled: true,
      channel: 'local_push',
    };
    await updateProfile({
      settingsPatch: {
        reminderWindows: [...settings.reminderWindows, win],
      },
    });
    setNewWinLabel('');
  };

  const toggleWindow = async (id: string) => {
    await updateProfile({
      settingsPatch: {
        reminderWindows: settings.reminderWindows.map((w) =>
          w.id === id ? { ...w, enabled: !w.enabled } : w
        ),
      },
    });
  };

  const handleTestReminder = async () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted') {
        new Notification('Booklit Reading Window', {
          body: 'Your scheduled calm reading window is open. Ready for 15 pages?',
        });
        setTestReminderSent('Delivered local browser notification!');
        return;
      }
    }
    setTestReminderSent(
      `Simulated scheduled reminder (Email fallback queued for ${user.email}).`
    );
    setTimeout(() => setTestReminderSent(null), 3500);
  };

  return (
    <div className="space-y-6 pb-24">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold text-stone-900 dark:text-stone-100">
            {section === 'how_it_works'
              ? 'How Verification Works — The Reader Trust Contract'
              : 'Settings, Reminders & Data Ownership'}
          </h1>
          <p className="text-xs text-stone-500 dark:text-stone-400">
            {section === 'how_it_works'
              ? 'Transparency is the anti-cheat feature that keeps honest readers comfortable.'
              : 'Customize interaction profile, offline sync, scheduled windows, privacy, and full CSV/JSON data export.'}
          </p>
        </div>

        <div className="rounded-xl bg-stone-200/70 dark:bg-ink-800 p-1 flex gap-1">
          <button
            onClick={() => setSection('settings')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
              section === 'settings'
                ? 'bg-white dark:bg-ink-700 text-stone-900 dark:text-white shadow-sm'
                : 'text-stone-600 dark:text-stone-400'
            }`}
          >
            Settings & Export
          </button>
          <button
            onClick={() => setSection('how_it_works')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium inline-flex items-center gap-1 ${
              section === 'how_it_works'
                ? 'bg-white dark:bg-ink-700 text-stone-900 dark:text-white shadow-sm'
                : 'text-stone-600 dark:text-stone-400'
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5" />
            How Verification Works
          </button>
        </div>
      </div>

      {section === 'how_it_works' ? (
        <div className="space-y-4 max-w-3xl">
          <div className="rounded-2xl border border-emerald-700/25 bg-emerald-950/5 dark:bg-emerald-950/25 p-5 space-y-2">
            <h2 className="font-serif text-lg font-bold text-stone-900 dark:text-white flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-600" />
              Coach, Never Proctor
            </h2>
            <p className="text-xs leading-relaxed text-stone-700 dark:text-stone-300">
              Booklit is built around a simple promise: honest readers have busy lives, dim bedside
              lamps, quiet trains, and dense books. Verification is probabilistic and tiered—never a
              single hard gate—and you never photograph every page or speak for more than 10
              seconds.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white/90 dark:bg-ink-900 p-5 space-y-2">
              <div className="text-xs font-mono uppercase text-emerald-700 dark:text-emerald-300">
                Tier 0 · Passive Signals (Always On)
              </div>
              <h3 className="font-semibold text-sm">Plausible Pace & Clock Integrity</h3>
              <p className="text-xs text-stone-600 dark:text-stone-400 leading-relaxed">
                We compare observed WPM against your personal Bayesian genre envelope (adjusted for
                academic, technical, religious, poetry, or fiction difficulty). Locking your phone
                screen while reading a paperback or Kindle is expected and never disqualifies a
                session.
              </p>
            </div>

            <div className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white/90 dark:bg-ink-900 p-5 space-y-2">
              <div className="text-xs font-mono uppercase text-emerald-700 dark:text-emerald-300">
                Tier 1 · Scan Boundaries (±35% Tolerance)
              </div>
              <h3 className="font-semibold text-sm">Start & End Page Density</h3>
              <p className="text-xs text-stone-600 dark:text-stone-400 leading-relaxed">
                Scanning only the start and end page estimates word density via local Tesseract.js
                OCR. If your duration falls within a generous ±35% window, Tier 1 passes
                immediately. Falling outside tolerance never auto-fails—it simply nudges Tier 2
                probability.
              </p>
            </div>

            <div className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white/90 dark:bg-ink-900 p-5 space-y-2">
              <div className="text-xs font-mono uppercase text-emerald-700 dark:text-emerald-300">
                Tier 2 · 5–10s Passage Check & Whisper Mode
              </div>
              <h3 className="font-semibold text-sm">Short Voice or Passage Micro-Check</h3>
              <p className="text-xs text-stone-600 dark:text-stone-400 leading-relaxed">
                Occasionally, Booklit asks for a 5–10 second sentence read. Standard mode checks for
                ≥60% normalized token match; quiet Whisper Mode lowers the token threshold and
                verifies natural pause fluency. Raw audio is discarded immediately after scoring.
              </p>
            </div>

            <div className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white/90 dark:bg-ink-900 p-5 space-y-2">
              <div className="text-xs font-mono uppercase text-emerald-700 dark:text-emerald-300">
                Tier 3 · Two-Signal Rule & 7-Day Cure
              </div>
              <h3 className="font-semibold text-sm">No Single-Failure Strikes · Always Curable</h3>
              <p className="text-xs text-stone-600 dark:text-stone-400 leading-relaxed">
                A single noisy voice check is marked <em>inconclusive</em>, never a strike. Strikes
                require ≥2 independent adverse signals, never erase past verified minutes, and can
                be completely cured within 7 days by completing a ≥10-minute verified session.
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-paper-100 dark:bg-ink-900 p-5 space-y-1.5 text-xs">
            <div className="font-semibold text-stone-900 dark:text-white flex items-center gap-1.5">
              <Lock className="w-4 h-4 text-emerald-700" />
              What Booklit Explicitly Refuses to Do
            </div>
            <p className="text-stone-600 dark:text-stone-400">
              Booklit will never implement continuous camera monitoring, keystroke logging,
              continuous microphone listening, or background screen reading. Your reading data
              belongs to you, with 1-click CSV/JSON export and permanent account deletion.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Interaction Profile & Offline Controls */}
          <div className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white/90 dark:bg-ink-900 p-5 space-y-4">
            <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-100 flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-emerald-700 dark:text-emerald-300" />
              Interaction Profile & Theme
            </h2>
            <p className="text-xs text-stone-500">
              Booklit branches UX via <code>(pointer: coarse)</code> & standalone PWA state
              (currently detected:{' '}
              <strong>{isCoarsePointerDetected ? 'Coarse/Touch' : 'Fine/Desktop'}</strong>, active
              profile: <strong className="uppercase">{interactionProfile}</strong>). Override below
              to test both layouts!
            </p>

            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: 'auto', label: 'Auto Detect', icon: CheckCircle2 },
                  { id: 'desktop', label: 'Desktop Web', icon: Laptop },
                  { id: 'pwa', label: 'Touch PWA', icon: Smartphone },
                ] as const
              ).map((opt) => {
                const Icon = opt.icon;
                const active = settings.interactionProfileOverride === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() =>
                      updateProfile({
                        settingsPatch: { interactionProfileOverride: opt.id },
                      })
                    }
                    className={`p-3 rounded-xl border text-xs font-medium flex flex-col items-center gap-1.5 transition ${
                      active
                        ? 'border-emerald-700 bg-emerald-700/10 text-emerald-800 dark:text-emerald-300'
                        : 'border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-400'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {opt.label}
                  </button>
                );
              })}
            </div>

            <div className="pt-2 border-t border-stone-200 dark:border-stone-800 flex items-center justify-between">
              <span className="text-xs font-medium">Color Theme (OLED Dark Ready)</span>
              <select
                value={settings.themePreference}
                onChange={(e) =>
                  updateProfile({
                    settingsPatch: {
                      themePreference: e.target.value as 'system' | 'light' | 'dark',
                    },
                  })
                }
                className="rounded-xl border border-stone-300 dark:border-stone-700 bg-paper-50 dark:bg-ink-800 px-3 py-1.5 text-xs"
              >
                <option value="system">System Preference</option>
                <option value="light">Archival Paper (Light)</option>
                <option value="dark">OLED Ink (Dark)</option>
              </select>
            </div>

            <div className="pt-2 border-t border-stone-200 dark:border-stone-800 flex flex-wrap items-center justify-between gap-2">
              <label className="inline-flex items-center gap-2 text-xs font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={simulateOffline}
                  onChange={(e) => setSimulateOffline(e.target.checked)}
                  className="accent-amber-600"
                />
                <WifiOff className="w-3.5 h-3.5 text-amber-600" />
                Simulate Offline Mode (Queue: {pendingSyncCount})
              </label>

              <button
                type="button"
                onClick={triggerManualSync}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-stone-300 dark:border-stone-700 text-xs hover:bg-stone-100 dark:hover:bg-ink-800"
              >
                <RefreshCw className="w-3 h-3" /> Sync Queue Now
              </button>
            </div>
          </div>

          {/* Reading Reminders / Scheduler */}
          <div className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white/90 dark:bg-ink-900 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                <Bell className="w-4 h-4 text-emerald-700 dark:text-emerald-300" />
                Scheduled Reading Windows
              </h2>
              <button
                type="button"
                onClick={handleTestReminder}
                className="text-xs font-medium text-emerald-700 dark:text-emerald-300 hover:underline"
              >
                Send Test Reminder
              </button>
            </div>

            {testReminderSent && (
              <div className="rounded-xl bg-emerald-600/15 text-emerald-800 dark:text-emerald-200 px-3 py-2 text-xs">
                {testReminderSent}
              </div>
            )}

            <div className="space-y-2">
              {settings.reminderWindows.map((win) => (
                <div
                  key={win.id}
                  className="rounded-xl bg-paper-100 dark:bg-ink-800 p-3 flex items-center justify-between text-xs"
                >
                  <div>
                    <div className="font-semibold text-stone-900 dark:text-stone-100">
                      {win.label} · <span className="font-mono">{win.startTime}</span>
                    </div>
                    <div className="text-[11px] text-stone-500">
                      {win.durationMinutes}m target ·{' '}
                      {win.channel === 'local_push'
                        ? 'Web Push (Email fallback)'
                        : 'Email Digest'}
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={win.enabled}
                    onChange={() => toggleWindow(win.id)}
                    className="accent-emerald-700 w-4 h-4"
                  />
                </div>
              ))}
            </div>

            <form onSubmit={handleAddReminderWindow} className="flex gap-2 pt-1">
              <input
                type="text"
                value={newWinLabel}
                onChange={(e) => setNewWinLabel(e.target.value)}
                placeholder="Window name (e.g. Lunch Read)"
                className="flex-1 rounded-xl border border-stone-300 dark:border-stone-700 bg-paper-50 dark:bg-ink-800 px-3 py-1.5 text-xs"
              />
              <input
                type="time"
                value={newWinTime}
                onChange={(e) => setNewWinTime(e.target.value)}
                className="rounded-xl border border-stone-300 dark:border-stone-700 bg-paper-50 dark:bg-ink-800 px-2.5 py-1.5 text-xs font-mono"
              />
              <button
                type="submit"
                className="px-3 py-1.5 rounded-xl bg-emerald-700 text-white text-xs font-semibold inline-flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Add
              </button>
            </form>
          </div>

          {/* Verification & Privacy Preferences */}
          <div className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white/90 dark:bg-ink-900 p-5 space-y-3">
            <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-100 flex items-center gap-2">
              <Lock className="w-4 h-4 text-emerald-700 dark:text-emerald-300" />
              Verification & Privacy Consent (GDPR / CCPA)
            </h2>

            {[
              {
                key: 'comprehensionOptIn' as const,
                title: 'Opt-in Passage Comprehension Micro-Checks',
                desc: 'Present one factual passage-grounded question after active sessions (great for book clubs & retention).',
              },
              {
                key: 'challengeMode' as const,
                title: 'Classroom / Book Club Challenge Mode',
                desc: 'Makes passage micro-checks mandatory for challenge runs.',
              },
              {
                key: 'whisperModeDefault' as const,
                title: 'Default to Quiet Whisper Mode for Voice Checks',
                desc: 'Uses lower token-match threshold (46%) + pause-distribution fluency heuristics.',
              },
              {
                key: 'retainAudioForDebug' as const,
                title: 'Retain Raw Voice Check Audio for Debugging (Default OFF)',
                desc: 'When OFF, raw audio is deleted immediately in memory after Whisper transcription.',
              },
              {
                key: 'analyticsConsent' as const,
                title: 'Optional Anonymous Product Analytics Consent',
                desc: 'Strictly opt-in under GDPR/CCPA.',
              },
            ].map((item) => (
              <label
                key={item.key}
                className="flex items-start justify-between gap-3 py-2 border-b last:border-b-0 border-stone-200/70 dark:border-stone-800 cursor-pointer"
              >
                <div className="text-xs">
                  <div className="font-medium text-stone-900 dark:text-stone-100">{item.title}</div>
                  <div className="text-[11px] text-stone-500 mt-0.5">{item.desc}</div>
                </div>
                <input
                  type="checkbox"
                  checked={Boolean(settings[item.key])}
                  onChange={(e) =>
                    updateProfile({
                      settingsPatch: { [item.key]: e.target.checked },
                    })
                  }
                  className="accent-emerald-700 mt-1 w-4 h-4 shrink-0"
                />
              </label>
            ))}
          </div>

          {/* Data Ownership: Export CSV/JSON & Delete Account */}
          <div className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white/90 dark:bg-ink-900 p-5 space-y-4">
            <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-100 flex items-center gap-2">
              <Download className="w-4 h-4 text-emerald-700 dark:text-emerald-300" />
              Your Reading Data Belongs to You
            </h2>
            <p className="text-xs text-stone-600 dark:text-stone-400">
              Export every book, session, verification event, WPM observation, and daily summary
              anytime, or permanently delete your account.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => exportUserData('csv')}
                className="py-2.5 px-3 rounded-xl border border-stone-300 dark:border-stone-700 hover:bg-paper-100 dark:hover:bg-ink-800 text-xs font-semibold inline-flex items-center justify-center gap-2"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
                Export Full CSV
              </button>
              <button
                type="button"
                onClick={() => exportUserData('json')}
                className="py-2.5 px-3 rounded-xl border border-stone-300 dark:border-stone-700 hover:bg-paper-100 dark:hover:bg-ink-800 text-xs font-semibold inline-flex items-center justify-center gap-2"
              >
                <FileJson className="w-4 h-4 text-indigo-600" />
                Export Full JSON
              </button>
            </div>

            <div className="pt-2 border-t border-stone-200 dark:border-stone-800 flex items-center justify-between">
              <span className="text-xs text-stone-500">Reset demo seed data</span>
              <button
                type="button"
                onClick={resetDemoWorkspace}
                className="text-xs font-medium text-stone-700 dark:text-stone-300 hover:underline"
              >
                Restore Initial Seed Workspace
              </button>
            </div>

            <div className="pt-3 border-t border-rose-500/25 space-y-2">
              <div className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                Delete Account & Purge Local + Synced Records
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={confirmDeleteText}
                  onChange={(e) => setConfirmDeleteText(e.target.value)}
                  placeholder='Type "DELETE" to confirm'
                  className="flex-1 rounded-xl border border-rose-300 dark:border-rose-800 bg-paper-50 dark:bg-ink-800 px-3 py-1.5 text-xs"
                />
                <button
                  type="button"
                  disabled={confirmDeleteText !== 'DELETE'}
                  onClick={async () => {
                    await deleteAccount();
                    setConfirmDeleteText('');
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-rose-600 text-white text-xs font-semibold disabled:opacity-35"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete Account
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
