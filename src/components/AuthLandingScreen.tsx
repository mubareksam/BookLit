'use client';

import React, { useState } from 'react';
import { ArrowRight, Camera, Lock, ShieldCheck, Trophy } from 'lucide-react';
import { useBooklit } from '@/context/BooklitContext';
import { BooklitLogo } from './BooklitLogo';
import { BOOK_GENRES, BookGenre, GENRE_META, ReadingGoalType } from '@/lib/types';

export function AuthLandingScreen() {
  const { signInAccount, registerAccount } = useBooklit();

  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Sign in fields
  const [identifier, setIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Sign up fields
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [goalType, setGoalType] = useState<ReadingGoalType>('minutes_day');
  const [goalTarget, setGoalTarget] = useState<number>(30);
  const [selectedGenres, setSelectedGenres] = useState<BookGenre[]>([
    'general_nonfiction',
    'literary_fiction',
  ]);

  const toggleGenre = (g: BookGenre) => {
    setSelectedGenres((prev) =>
      prev.includes(g) ? (prev.length > 1 ? prev.filter((x) => x !== g) : prev) : [...prev, g]
    );
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setBusy(true);
    const res = await signInAccount({ identifier, password: loginPassword });
    setBusy(false);
    if (!res.ok) setErrorMsg(res.error || 'Unable to sign in');
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setBusy(true);
    const res = await registerAccount({
      email,
      username,
      displayName,
      password,
      goalType,
      goalTarget,
      preferredGenres: selectedGenres,
    });
    setBusy(false);
    if (!res.ok) setErrorMsg(res.error || 'Unable to create account');
  };

  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-zinc-50 dark:bg-[#090B0E] text-zinc-900 dark:text-zinc-100 flex flex-col justify-between">
      {/* Clean Top Bar */}
      <header className="w-full max-w-6xl mx-auto px-5 py-5 flex items-center justify-between">
        <BooklitLogo size="md" />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setErrorMsg(null);
              setMode(mode === 'signin' ? 'signup' : 'signin');
            }}
            className="px-3.5 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs font-medium hover:bg-zinc-100 dark:hover:bg-zinc-900 transition"
          >
            {mode === 'signin' ? 'Create Account' : 'Sign In'}
          </button>
        </div>
      </header>

      {/* Main Split Grid */}
      <main className="w-full max-w-6xl mx-auto px-5 py-6 lg:py-12 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
        {/* Left: Crisp Value Proposition */}
        <div className="lg:col-span-6 space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-xs font-medium">
            <ShieldCheck className="w-3.5 h-3.5" />
            Verified Reading & Live Challenges
          </div>

          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight leading-[1.12]">
            Read for real.{' '}
            <span className="text-emerald-600 dark:text-emerald-400">
              Compete with proof.
            </span>
          </h1>

          <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-400 max-w-lg leading-relaxed">
            Track physical books and e-readers with live camera page scans, brief voice checks,
            accurate finish-time forecasts, and anti-cheat reading challenges.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
            <div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/60 p-4 space-y-1.5">
              <Camera className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <div className="text-xs font-semibold">Live Scan Only</div>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                Direct camera capture—no gallery uploads.
              </p>
            </div>

            <div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/60 p-4 space-y-1.5">
              <Trophy className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <div className="text-xs font-semibold">Real Challenges</div>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                Verified leaderboards for registered readers.
              </p>
            </div>

            <div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/60 p-4 space-y-1.5">
              <Lock className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <div className="text-xs font-semibold">Private by Design</div>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                Offline-first storage & full CSV/JSON export.
              </p>
            </div>
          </div>
        </div>

        {/* Right: Auth Card */}
        <div className="lg:col-span-6 w-full max-w-md mx-auto">
          <div className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/90 p-6 sm:p-7 shadow-xl space-y-5">
            {/* Mode Switcher */}
            <div className="grid grid-cols-2 rounded-xl bg-zinc-100 dark:bg-zinc-800/80 p-1">
              <button
                type="button"
                onClick={() => {
                  setErrorMsg(null);
                  setMode('signin');
                }}
                className={`py-2 rounded-lg text-xs font-semibold transition ${
                  mode === 'signin'
                    ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-sm'
                    : 'text-zinc-500 dark:text-zinc-400'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setErrorMsg(null);
                  setMode('signup');
                }}
                className={`py-2 rounded-lg text-xs font-semibold transition ${
                  mode === 'signup'
                    ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-sm'
                    : 'text-zinc-500 dark:text-zinc-400'
                }`}
              >
                Create Account
              </button>
            </div>

            {errorMsg && (
              <div className="rounded-xl bg-rose-500/10 border border-rose-500/25 px-3.5 py-2.5 text-xs font-medium text-rose-600 dark:text-rose-400">
                {errorMsg}
              </div>
            )}

            {mode === 'signin' ? (
              <form onSubmit={handleSignIn} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1.5">
                    Email or Username
                  </label>
                  <input
                    type="text"
                    required
                    autoComplete="username"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="you@example.com or @username"
                    className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/70 px-3.5 py-2.5 text-sm focus:outline-none focus:border-emerald-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1.5">
                    Password
                  </label>
                  <input
                    type="password"
                    required
                    autoComplete="current-password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/70 px-3.5 py-2.5 text-sm focus:outline-none focus:border-emerald-600"
                  />
                </div>

                <button
                  type="submit"
                  disabled={busy}
                  className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition disabled:opacity-50"
                >
                  {busy ? 'Signing in…' : 'Sign In'}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            ) : (
              <form onSubmit={handleSignUp} className="space-y-3.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                      Full Name
                    </label>
                    <input
                      type="text"
                      required
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="e.g. Samuel T."
                      className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/70 px-3 py-2 text-sm focus:outline-none focus:border-emerald-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                      Username
                    </label>
                    <input
                      type="text"
                      required
                      value={username}
                      onChange={(e) =>
                        setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase())
                      }
                      placeholder="e.g. sam_reads"
                      className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/70 px-3 py-2 text-sm font-mono focus:outline-none focus:border-emerald-600"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/70 px-3 py-2 text-sm focus:outline-none focus:border-emerald-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                    Password (min 8 characters)
                  </label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/70 px-3 py-2 text-sm focus:outline-none focus:border-emerald-600"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                      Daily Goal Type
                    </label>
                    <select
                      value={goalType}
                      onChange={(e) => {
                        const gt = e.target.value as ReadingGoalType;
                        setGoalType(gt);
                        setGoalTarget(gt === 'books_year' ? 24 : gt === 'pages_day' ? 20 : 30);
                      }}
                      className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/70 px-3 py-2 text-xs"
                    >
                      <option value="minutes_day">Minutes / Day</option>
                      <option value="pages_day">Pages / Day</option>
                      <option value="books_year">Books / Year</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                      Target
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={1000}
                      value={goalTarget}
                      onChange={(e) => setGoalTarget(Number(e.target.value) || 20)}
                      className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/70 px-3 py-2 text-sm font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1.5">
                    Favorite Genres
                  </label>
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                    {BOOK_GENRES.slice(0, 8).map((g) => {
                      const active = selectedGenres.includes(g);
                      return (
                        <button
                          key={g}
                          type="button"
                          onClick={() => toggleGenre(g)}
                          className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition ${
                            active
                              ? 'border-emerald-600 bg-emerald-600 text-white'
                              : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400'
                          }`}
                        >
                          {GENRE_META[g].label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={busy}
                  className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition disabled:opacity-50"
                >
                  {busy ? 'Creating Account…' : 'Create Account & Start'}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            )}
          </div>
        </div>
      </main>

      <footer className="w-full max-w-6xl mx-auto px-5 py-4 text-[11px] text-zinc-400 flex flex-wrap items-center justify-between gap-2">
        <span>Booklit · Verified Reading Platform</span>
        <span>Account required for challenges & live rooms</span>
      </footer>
    </div>
  );
}
