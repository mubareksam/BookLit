'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { useBooklit } from '@/context/BooklitContext';
import {
  applyThemePreference,
  nextThemePreference,
  readStoredTheme,
  resolveTheme,
  storeThemePreference,
  ThemePreference,
} from '@/lib/theme';

/**
 * Global quick theme switch: Light → Dark → System, applied instantly and
 * persisted to the reader's profile so every device keeps the same theme.
 */
export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { user, updateProfile } = useBooklit();
  const profilePref = (user?.settings_json.themePreference ?? null) as ThemePreference | null;
  const [pref, setPref] = useState<ThemePreference>(profilePref ?? 'system');
  const [resolved, setResolved] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const stored = readStoredTheme();
    const next = profilePref ?? stored;
    setPref(next);
    setResolved(resolveTheme(next));
  }, [profilePref]);

  useEffect(() => {
    if (pref === 'system') {
      const media = window.matchMedia('(prefers-color-scheme: dark)');
      const onChange = () => setResolved(resolveTheme('system'));
      media.addEventListener('change', onChange);
      return () => media.removeEventListener('change', onChange);
    }
    setResolved(pref);
    return undefined;
  }, [pref]);

  const cycle = async () => {
    const next = nextThemePreference(pref);
    setPref(next);
    setResolved(resolveTheme(next));
    applyThemePreference(next);
    storeThemePreference(next);
    if (user) {
      await updateProfile({ settingsPatch: { themePreference: next } });
    }
  };

  const Icon = resolved === 'dark' ? Moon : Sun;
  const label = pref === 'system' ? 'System theme' : pref === 'dark' ? 'Dark theme' : 'Light theme';

  if (compact) {
    return (
      <button
        type="button"
        onClick={cycle}
        aria-label={`${label}. Tap to switch theme.`}
        title={label}
        className="p-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
      >
        <Icon className="w-4 h-4" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={cycle}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  );
}
