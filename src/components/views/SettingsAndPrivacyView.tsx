'use client';

import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CloudUpload,
  Database,
  Download,
  Lock,
  LogOut,
  ShieldCheck,
  Smartphone,
  Trash2,
  UserCheck,
} from 'lucide-react';
import { useBooklit } from '@/context/BooklitContext';
import { ReadingGoalType } from '@/lib/types';
import { ThemeToggle } from '@/components/ThemeToggle';
import { InstallAppButton, usePwaInstallState } from '@/components/InstallAppButton';

export function SettingsAndPrivacyView() {
  const {
    user,
    updateProfile,
    signOutAccount,
    exportUserData,
    deleteAccount,
    setSelectedReaderUsername,
    refreshSocialAndDuels,
  } = useBooklit();
  const [displayName, setDisplayName] = useState(user?.display_name ?? '');
  const [bio, setBio] = useState(user?.bio ?? '');
  const [profileVisibility, setProfileVisibility] = useState<'public' | 'private'>(
    user?.profile_visibility ?? 'public'
  );
  const [goalType, setGoalType] = useState<ReadingGoalType>(
    user?.reading_goal_type ?? 'minutes_day'
  );
  const [goalTarget, setGoalTarget] = useState<number>(user?.reading_goal_target ?? 30);
  const [savedToast, setSavedToast] = useState(false);
  const installState = usePwaInstallState();
  const [storageHealth, setStorageHealth] = useState<{
    backend?: string;
    durable?: boolean;
    remoteConfigured?: boolean;
    lastSavedAt?: string | null;
    lastSaveError?: string | null;
    lastRemoteError?: string | null;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/health')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.storage) setStorageHealth(data.storage);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  const [confirmDeleteText, setConfirmDeleteText] = useState('');

  useEffect(() => {
    if (!user) return;
    setDisplayName(user.display_name);
    setBio(user.bio ?? '');
    setProfileVisibility(user.profile_visibility ?? 'public');
    setGoalType(user.reading_goal_type);
    setGoalTarget(user.reading_goal_target);
  }, [user]);

  if (!user) return null;

  const saveAccountGoals = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateProfile({
      display_name: displayName.trim() || user.display_name,
      bio: bio.trim().slice(0, 120),
      profile_visibility: profileVisibility,
      reading_goal_type: goalType,
      reading_goal_target: Math.max(1, Math.min(2000, goalTarget)),
    });
    await refreshSocialAndDuels();
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 2000);
  };

  return (
    <div className="w-full max-w-3xl mx-auto space-y-5 pb-20 min-w-0 overflow-x-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 min-w-0">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Profile & Settings</h1>
          <p className="text-xs text-zinc-500">Account, verification rules, and data controls.</p>
        </div>

        <button
          type="button"
          onClick={() => signOutAccount()}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs font-semibold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 shrink-0"
        >
          <LogOut className="w-3.5 h-3.5" />
          Sign Out
        </button>
      </div>

      {/* Account & Reading Goal */}
      <form
        onSubmit={saveAccountGoals}
        className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 sm:p-5 space-y-4 min-w-0"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 min-w-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <UserCheck className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate">{user.display_name}</div>
              <div className="text-xs text-zinc-500 truncate">
                @{user.username} · {user.email}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setSelectedReaderUsername(user.username)}
            className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-[11px] font-semibold shrink-0 hover:bg-emerald-500/20 transition"
          >
            View Public Card →
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
          <div className="sm:col-span-2 min-w-0">
            <label className="block text-xs font-medium text-zinc-500 mb-1">
              Short Bio (optional, max 120 chars)
            </label>
            <input
              type="text"
              maxLength={120}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="e.g. Sci-fi & history reader · Nightly 30m sprints"
              className="w-full min-w-0 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-xs"
            />
          </div>

          <div className="min-w-0">
            <label className="block text-xs font-medium text-zinc-500 mb-1">
              Profile Visibility
            </label>
            <select
              value={profileVisibility}
              onChange={(e) => setProfileVisibility(e.target.value as 'public' | 'private')}
              className="w-full min-w-0 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-xs"
            >
              <option value="public">Public (@{user.username})</option>
              <option value="private">Tetherers Only</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
          <div className="min-w-0">
            <label className="block text-xs font-medium text-zinc-500 mb-1">Display Name</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full min-w-0 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-xs font-medium"
            />
          </div>

          <div className="min-w-0">
            <label className="block text-xs font-medium text-zinc-500 mb-1">Goal Type</label>
            <select
              value={goalType}
              onChange={(e) => setGoalType(e.target.value as ReadingGoalType)}
              className="w-full min-w-0 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-xs"
            >
              <option value="minutes_day">Minutes / Day</option>
              <option value="pages_day">Pages / Day</option>
              <option value="books_year">Books / Year</option>
            </select>
          </div>

          <div className="min-w-0">
            <label className="block text-xs font-medium text-zinc-500 mb-1">Target</label>
            <input
              type="number"
              min={1}
              max={2000}
              value={goalTarget}
              onChange={(e) => setGoalTarget(Number(e.target.value) || 25)}
              className="w-full min-w-0 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 font-mono text-xs"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-zinc-500">Theme:</span>
            {(['system', 'light', 'dark'] as const).map((th) => (
              <button
                key={th}
                type="button"
                onClick={() => updateProfile({ settingsPatch: { themePreference: th } })}
                className={`px-2.5 py-1 rounded-lg text-[11px] capitalize font-medium ${
                  user.settings_json.themePreference === th
                    ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'
                }`}
              >
                {th}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 ml-auto">
            {savedToast && (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                <Check className="w-3.5 h-3.5" /> Saved
              </span>
            )}
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-semibold"
            >
              Save Changes
            </button>
          </div>
        </div>
      </form>

      {/* App & Appearance */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 sm:p-5 space-y-3 min-w-0">
        <div className="flex items-center gap-2 text-xs font-semibold">
          <Smartphone className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>App & Appearance</span>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xs font-medium">Theme</div>
            <p className="text-[11px] text-zinc-500">Light, dark, or follow your device.</p>
          </div>
          <ThemeToggle />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-zinc-100 dark:border-zinc-800">
          <div className="min-w-0">
            <div className="text-xs font-medium">Install the app</div>
            <p className="text-[11px] text-zinc-500">
              {installState.isInstalled
                ? 'Booklit is installed on this device.'
                : 'Home-screen icon, full-screen reading, offline drafts.'}
            </p>
          </div>
          <InstallAppButton />
        </div>
      </div>

      {/* Verification & Privacy Toggles */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 sm:p-5 space-y-4 min-w-0">
        <div className="flex items-center gap-2 text-xs font-semibold text-zinc-900 dark:text-zinc-100">
          <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>Verification & Privacy</span>
        </div>

        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {[
            {
              key: 'challengeMode' as const,
              title: 'Always-On Challenge Seal',
              desc: 'Require live camera start/end scans and voice checks on every session.',
              val: user.settings_json.challengeMode,
            },
            {
              key: 'whisperModeDefault' as const,
              title: 'Whisper Mode Default',
              desc: 'Use quiet cadence tolerances for late-night or library voice checks.',
              val: user.settings_json.whisperModeDefault,
            },
            {
              key: 'comprehensionOptIn' as const,
              title: 'Comprehension Checkpoints',
              desc: 'Include a 1-question passage check at the end of verified sessions.',
              val: user.settings_json.comprehensionOptIn,
            },
            {
              key: 'retainAudioForDebug' as const,
              title: 'Keep Voice Clip Metadata',
              desc: 'Off by default—live audio clips are discarded immediately after scoring.',
              val: user.settings_json.retainAudioForDebug,
            },
          ].map((item) => (
            <div
              key={item.key}
              className="py-3 first:pt-1 last:pb-0 flex items-center justify-between gap-4 min-w-0"
            >
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                  {item.title}
                </div>
                <p className="text-[11px] text-zinc-500 mt-0.5 leading-snug">{item.desc}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={item.val}
                onClick={() => updateProfile({ settingsPatch: { [item.key]: !item.val } })}
                className={`w-11 h-6 rounded-full transition relative shrink-0 ${
                  item.val ? 'bg-emerald-600' : 'bg-zinc-300 dark:bg-zinc-700'
                }`}
              >
                <span
                  className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${
                    item.val ? 'left-[22px]' : 'left-0.5'
                  }`}
                />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Data durability */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 sm:p-5 space-y-2 min-w-0">
        <div className="flex items-center gap-2 text-xs font-semibold">
          <Database className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>Account & Data Storage</span>
          {storageHealth?.durable ? (
            <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
              <CloudUpload className="w-3 h-3" /> Durable
            </span>
          ) : (
            <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300">
              <AlertTriangle className="w-3 h-3" /> Temporary
            </span>
          )}
        </div>

        <p className="text-[11px] text-zinc-500 leading-relaxed">
          {storageHealth?.durable
            ? `Sign-in, tethers, sparks, duels and reading history are written to ${
                storageHealth.backend === 'supabase' ? 'your Supabase database' : 'a persistent server disk'
              } and survive app updates and restarts.`
            : storageHealth
            ? 'This deployment is using instance-local storage: data survives restarts but can be erased when the app is redeployed or the instance is replaced. Add SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (or attach a persistent disk) so accounts, tethers and history are never lost.'
            : 'Checking where your data is stored…'}
        </p>

        {storageHealth?.lastSavedAt && (
          <p className="text-[10px] text-zinc-400 font-mono break-words">
            Last durable write: {new Date(storageHealth.lastSavedAt).toLocaleString()}
          </p>
        )}
        {(storageHealth?.lastSaveError || storageHealth?.lastRemoteError) && (
          <p className="text-[10px] text-rose-600 dark:text-rose-400 break-words">
            {storageHealth.lastRemoteError || storageHealth.lastSaveError}
          </p>
        )}
      </div>

      {/* Data Export */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 min-w-0">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-semibold">
            <Lock className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Export Reading Archive</span>
          </div>
          <p className="text-[11px] text-zinc-500 mt-0.5">
            Download your books, sessions, and TBR history at any time.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 shrink-0">
          <button
            type="button"
            onClick={() => exportUserData('json')}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-semibold"
          >
            <Download className="w-3.5 h-3.5" />
            JSON
          </button>
          <button
            type="button"
            onClick={() => exportUserData('csv')}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-semibold"
          >
            <Download className="w-3.5 h-3.5" />
            CSV
          </button>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="rounded-2xl border border-rose-500/25 bg-rose-500/5 p-4 sm:p-5 space-y-3 min-w-0">
        <div className="text-xs font-semibold text-rose-700 dark:text-rose-300 flex items-center gap-1.5">
          <Trash2 className="w-4 h-4 shrink-0" />
          <span>Delete Account & Data</span>
        </div>
        <p className="text-[11px] text-zinc-600 dark:text-zinc-400">
          Permanently erases your account, synced sessions, challenge entries, and local storage.
        </p>
        <div className="flex flex-col sm:flex-row gap-2 min-w-0">
          <input
            type="text"
            value={confirmDeleteText}
            onChange={(e) => setConfirmDeleteText(e.target.value)}
            placeholder="Type DELETE to confirm"
            className="flex-1 min-w-0 rounded-xl border border-rose-300 dark:border-rose-800 bg-white dark:bg-zinc-900 px-3 py-2 text-xs font-mono"
          />
          <button
            type="button"
            disabled={confirmDeleteText !== 'DELETE'}
            onClick={async () => {
              await deleteAccount();
              setConfirmDeleteText('');
            }}
            className="px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-semibold disabled:opacity-40 shrink-0"
          >
            Delete Forever
          </button>
        </div>
      </div>
    </div>
  );
}
