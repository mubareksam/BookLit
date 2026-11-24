'use client';

import React, { useState } from 'react';
import { Check, Mail, Sparkles, UserCheck, X } from 'lucide-react';
import { useBooklit } from '@/context/BooklitContext';
import { BOOK_GENRES, BookGenre, GENRE_META, ReadingGoalType } from '@/lib/types';

export function AuthProfileModal() {
  const {
    authModalOpen,
    setAuthModalOpen,
    user,
    allUsers,
    switchActiveUser,
    signInOrCreateAccount,
    updateProfile,
  } = useBooklit();

  const [mode, setMode] = useState<'profile' | 'signin'>('profile');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [goalType, setGoalType] = useState<ReadingGoalType>(
    user?.reading_goal_type ?? 'minutes_day'
  );
  const [goalTarget, setGoalTarget] = useState<number>(user?.reading_goal_target ?? 35);
  const [selectedGenres, setSelectedGenres] = useState<BookGenre[]>(
    user?.preferred_genres ?? ['literary_fiction', 'general_nonfiction']
  );
  const [magicLinkSentMsg, setMagicLinkSentMsg] = useState<string | null>(null);

  if (!authModalOpen || !user) return null;

  const togglePrefGenre = (g: BookGenre) => {
    setSelectedGenres((prev) =>
      prev.includes(g) ? prev.filter((item) => item !== g) : [...prev, g]
    );
  };

  const handleSaveCurrentGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateProfile({
      reading_goal_type: goalType,
      reading_goal_target: Math.max(1, goalTarget),
      preferred_genres: selectedGenres,
    });
    setAuthModalOpen(false);
  };

  const handleAuthSubmit = async (
    provider: 'magic_link' | 'google' | 'apple',
    customEmail?: string,
    customName?: string
  ) => {
    const targetEmail = (customEmail || email || 'reader@booklit.app').trim();
    const targetName = (customName || displayName || targetEmail.split('@')[0]).trim();
    setMagicLinkSentMsg(
      provider === 'magic_link'
        ? `Authenticated via Magic Link (${targetEmail})`
        : `Authenticated via ${provider === 'google' ? 'Google' : 'Apple'} OAuth`
    );
    await signInOrCreateAccount({
      email: targetEmail,
      displayName: targetName,
      provider,
      goalType,
      goalTarget,
      preferredGenres: selectedGenres,
    });
    setTimeout(() => {
      setMagicLinkSentMsg(null);
      setAuthModalOpen(false);
    }, 800);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full max-w-lg bg-paper-50 dark:bg-ink-900 rounded-t-3xl sm:rounded-2xl border border-stone-200 dark:border-stone-800 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="px-5 py-4 border-b border-stone-200 dark:border-stone-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-emerald-700 dark:text-emerald-300" />
            <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-100">
              Account, Auth & Reading Goal Setup
            </h2>
          </div>
          <button
            onClick={() => setAuthModalOpen(false)}
            aria-label="Close auth modal"
            className="p-1.5 rounded-lg text-stone-500 hover:bg-stone-200/70 dark:hover:bg-ink-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 pt-3 flex gap-2 border-b border-stone-200 dark:border-stone-800 pb-3">
          <button
            type="button"
            onClick={() => setMode('profile')}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium ${
              mode === 'profile'
                ? 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900'
                : 'text-stone-600 dark:text-stone-400'
            }`}
          >
            Reading Goal & Profile
          </button>
          <button
            type="button"
            onClick={() => setMode('signin')}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium ${
              mode === 'signin'
                ? 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900'
                : 'text-stone-600 dark:text-stone-400'
            }`}
          >
            Sign In / Switch Reader
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4">
          {mode === 'profile' ? (
            <form onSubmit={handleSaveCurrentGoal} className="space-y-4">
              <div className="rounded-xl bg-paper-100 dark:bg-ink-800 p-3.5 text-xs flex items-center justify-between">
                <div>
                  <div className="font-semibold text-stone-900 dark:text-stone-100">
                    {user.display_name}
                  </div>
                  <div className="text-stone-500">
                    {user.email} · Timezone: {user.timezone}
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-emerald-700/15 text-emerald-800 dark:text-emerald-300 font-mono text-[11px]">
                  {user.auth_provider}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-stone-600 dark:text-stone-300 mb-1">
                    Goal Cadence
                  </label>
                  <select
                    value={goalType}
                    onChange={(e) => {
                      const gt = e.target.value as ReadingGoalType;
                      setGoalType(gt);
                      setGoalTarget(gt === 'books_year' ? 24 : gt === 'pages_day' ? 20 : 35);
                    }}
                    className="w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-ink-800 px-3 py-2 text-sm"
                  >
                    <option value="minutes_day">Verified Minutes / Day</option>
                    <option value="pages_day">Pages / Day</option>
                    <option value="books_year">Books / Year</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-600 dark:text-stone-300 mb-1">
                    Target
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={1000}
                    value={goalTarget}
                    onChange={(e) => setGoalTarget(Number(e.target.value) || 20)}
                    className="w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-ink-800 px-3 py-2 font-mono text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-600 dark:text-stone-300 mb-1.5">
                  Preferred Genres (powers Recommendations & Priors)
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {BOOK_GENRES.map((g) => {
                    const active = selectedGenres.includes(g);
                    return (
                      <button
                        key={g}
                        type="button"
                        onClick={() => togglePrefGenre(g)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border transition ${
                          active
                            ? 'border-emerald-700 bg-emerald-700 text-white'
                            : 'border-stone-300 dark:border-stone-700 text-stone-600 dark:text-stone-300'
                        }`}
                      >
                        {active && <Check className="w-3 h-3" />}
                        {GENRE_META[g].label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold"
              >
                Save Goal & Genre Preferences
              </button>
            </form>
          ) : (
            <div className="space-y-4">
              {magicLinkSentMsg && (
                <div className="rounded-xl bg-emerald-600/15 text-emerald-800 dark:text-emerald-200 p-3 text-xs font-medium">
                  {magicLinkSentMsg}
                </div>
              )}

              <div className="space-y-2.5">
                <label className="block text-xs font-medium text-stone-600 dark:text-stone-300">
                  Email Magic Link Sign-In (RLS User-Scoped Store)
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="reader@domain.com"
                  className="w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-ink-800 px-3 py-2 text-sm"
                />
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Display Name (for new accounts)"
                  className="w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-ink-800 px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={() => handleAuthSubmit('magic_link')}
                  className="w-full py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5"
                >
                  <Mail className="w-3.5 h-3.5" />
                  Continue with Email Magic Link
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-stone-200 dark:border-stone-800">
                <button
                  type="button"
                  onClick={() =>
                    handleAuthSubmit('google', 'dawit.google@booklit.app', 'Dawit Alemu')
                  }
                  className="py-2.5 rounded-xl border border-stone-300 dark:border-stone-700 text-xs font-medium hover:bg-stone-100 dark:hover:bg-ink-800"
                >
                  Continue with Google
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleAuthSubmit('apple', 'mira.icloud@booklit.app', 'Mira Kebede')
                  }
                  className="py-2.5 rounded-xl border border-stone-300 dark:border-stone-700 text-xs font-medium hover:bg-stone-100 dark:hover:bg-ink-800"
                >
                  Continue with Apple
                </button>
              </div>

              {allUsers.length > 1 && (
                <div className="pt-2 border-t border-stone-200 dark:border-stone-800 space-y-1.5">
                  <div className="text-[11px] uppercase tracking-wider text-stone-500 font-semibold">
                    Local Cached Profiles (RLS Isolated)
                  </div>
                  {allUsers.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={async () => {
                        await switchActiveUser(u.id);
                        setAuthModalOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 rounded-xl text-xs flex items-center justify-between ${
                        u.id === user.id
                          ? 'bg-emerald-700/15 text-emerald-800 dark:text-emerald-200 font-semibold'
                          : 'hover:bg-stone-100 dark:hover:bg-ink-800'
                      }`}
                    >
                      <span>
                        {u.display_name} ({u.email})
                      </span>
                      <Sparkles className="w-3.5 h-3.5 opacity-60" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
