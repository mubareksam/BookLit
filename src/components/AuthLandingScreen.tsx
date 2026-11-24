'use client';

import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  Camera,
  CheckCircle2,
  ChevronLeft,
  Lock,
  Mail,
  ShieldCheck,
  Trophy,
} from 'lucide-react';
import { useBooklit } from '@/context/BooklitContext';
import { findLocalUserByIdentifier } from '@/lib/db/dexie';
import { BooklitLogo } from './BooklitLogo';
import { ThemeToggle } from './ThemeToggle';
import { InstallAppButton } from './InstallAppButton';
import { BOOK_GENRES, BookGenre, GENRE_META, ReadingGoalType } from '@/lib/types';

function googleErrorMessage(code: string): string {
  switch (code) {
    case 'google_unconfigured':
      return 'Google sign-in is not switched on for this deployment yet. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET on the server, then try again.';
    case 'google_cancelled':
      return 'Google sign-in was cancelled.';
    case 'google_state_mismatch':
      return 'That Google sign-in attempt timed out. Please try again.';
    case 'too_many_attempts':
      return 'Too many attempts from this address. Try again in a few minutes.';
    case 'storage_unwritable':
      return 'Google verified you, but Booklit could not save the account durably. Configure a database (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY) or a persistent disk, then try again.';
    default:
      return 'Google sign-in could not be completed. Please try again.';
  }
}

function GoogleIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

export function AuthLandingScreen() {
  const { signInAccount, registerAccount, recoverAccount, requestPasswordReset, resetPassword } =
    useBooklit();

  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot' | 'reset'>('signin');
  const [providers, setProviders] = useState<{
    google: boolean;
    emailDelivery: boolean;
  }>({ google: true, emailDelivery: true });
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [needsAccount, setNeedsAccount] = useState(false);
  const [recoverable, setRecoverable] = useState<{
    userId: string;
    username: string;
    email: string;
    displayName: string;
  } | null>(null);
  const [recovering, setRecovering] = useState(false);
  const [recoverMsg, setRecoverMsg] = useState<string | null>(null);

  // Sign in fields
  const [identifier, setIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Sign up fields
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // Forgot / reset password
  const [resetEmail, setResetEmail] = useState('');
  const [resetNotice, setResetNotice] = useState<string | null>(null);
  const [resetDevLink, setResetDevLink] = useState<string | null>(null);
  const [resetToken, setResetToken] = useState('');
  const [resetTarget, setResetTarget] = useState<{ username: string; email: string } | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [goalType, setGoalType] = useState<ReadingGoalType>('minutes_day');
  const [goalTarget, setGoalTarget] = useState<number>(30);
  const [selectedGenres, setSelectedGenres] = useState<BookGenre[]>([
    'general_nonfiction',
    'literary_fiction',
  ]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/providers')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setProviders({
          google: Boolean(data.google?.configured),
          emailDelivery: Boolean(data.passwordReset?.emailDelivery),
        });
      })
      .catch(() => {});

    // Google sends readers back to "/?auth_error=…"; reset links land on "/?reset=…".
    const params = new URLSearchParams(window.location.search);
    const authError = params.get('auth_error');
    if (authError) {
      setErrorMsg(googleErrorMessage(authError));
      setErrorCode(authError);
      window.history.replaceState({}, '', window.location.pathname);
    }

    const token = params.get('reset');
    if (token) {
      setMode('reset');
      setResetToken(token);
      fetch(`/api/auth/password/verify?token=${encodeURIComponent(token)}`)
        .then(async (res) => {
          const data = await res.json().catch(() => ({}));
          if (cancelled) return;
          if (!res.ok) {
            setErrorMsg(data.error || 'This reset link is invalid or has expired.');
          } else {
            setResetTarget({ username: data.username, email: data.email });
          }
        })
        .catch(() => {
          if (!cancelled) setErrorMsg('Could not check this reset link. Try again.');
        });
    }

    return () => {
      cancelled = true;
    };
  }, []);

  const toggleGenre = (g: BookGenre) => {
    setSelectedGenres((prev) =>
      prev.includes(g) ? (prev.length > 1 ? prev.filter((x) => x !== g) : prev) : [...prev, g]
    );
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setErrorCode(null);
    setNeedsAccount(false);
    setBusy(true);
    const res = await signInAccount({ identifier, password: loginPassword });
    setBusy(false);
    if (!res.ok) {
      setErrorMsg(res.error || 'Unable to sign in');
      setErrorCode(res.code ?? null);
      setNeedsAccount(res.code === 'ACCOUNT_NOT_FOUND');

      // This browser may still hold the reader's library from an earlier
      // session on a server that lost its data — offer a one-tap recovery.
      if (res.code === 'ACCOUNT_NOT_FOUND') {
        const local = await findLocalUserByIdentifier(identifier).catch(() => null);
        setRecoverable(
          local
            ? {
                userId: local.id,
                username: local.username,
                email: local.email,
                displayName: local.display_name,
              }
            : null
        );
      } else {
        setRecoverable(null);
      }
    } else {
      setRecoverable(null);
    }
  };

  const handleRecover = async () => {
    if (!recoverable) return;
    setRecovering(true);
    setRecoverMsg(null);
    const res = await recoverAccount({
      userId: recoverable.userId,
      email: recoverable.email,
      username: recoverable.username,
      displayName: recoverable.displayName,
      password: loginPassword,
    });
    setRecovering(false);
    if (!res.ok) setRecoverMsg(res.error || 'Could not recover this account.');
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

  const handleGoogle = () => {
    setErrorMsg(null);
    const next = window.location.pathname || '/';
    window.location.href = `/api/auth/google/start?next=${encodeURIComponent(next)}`;
  };

  const handleSendReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setResetNotice(null);
    setResetDevLink(null);
    setBusy(true);
    const res = await requestPasswordReset(resetEmail);
    setBusy(false);
    if (!res.ok) {
      setErrorMsg(res.error || 'Could not send the reset link.');
      return;
    }
    if (res.delivery === 'email') {
      setResetNotice(res.message ?? 'Check your inbox for the reset link.');
    } else {
      setResetNotice(
        res.delivery === 'failed'
          ? 'The reset link could not be delivered by the server’s email provider. Try again in a moment.'
          : 'The server has no email provider configured yet (RESEND_API_KEY), so the link could not be delivered.'
      );
    }
    if (res.devLink) setResetDevLink(res.devLink);
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (newPassword !== confirmPassword) {
      setErrorMsg('Those passwords do not match.');
      return;
    }
    setBusy(true);
    const res = await resetPassword({ token: resetToken, password: newPassword });
    setBusy(false);
    if (!res.ok) {
      setErrorMsg(res.error || 'Could not reset the password.');
      return;
    }
    window.history.replaceState({}, '', window.location.pathname);
  };

  const backToSignIn = () => {
    setMode('signin');
    setErrorMsg(null);
    setResetNotice(null);
    setResetDevLink(null);
    setNewPassword('');
    setConfirmPassword('');
    if (window.location.search.includes('reset=')) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  };

  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-zinc-50 dark:bg-[#090B0E] text-zinc-900 dark:text-zinc-100 flex flex-col justify-between">
      {/* Clean Top Bar */}
      <header className="w-full max-w-6xl mx-auto px-5 py-5 flex items-center justify-between">
        <BooklitLogo size="md" />
        <div className="flex items-center gap-2">
          <ThemeToggle compact />
          <InstallAppButton variant="icon" />
          <button
            type="button"
            onClick={() => {
              setErrorMsg(null);
              setMode(mode === 'signup' || mode === 'signin' ? (mode === 'signin' ? 'signup' : 'signin') : 'signin');
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
            {(mode === 'forgot' || mode === 'reset') && (
              <div className="space-y-1.5">
                <button
                  type="button"
                  onClick={backToSignIn}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 transition"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Back to sign in
                </button>
                <h2 className="text-lg font-semibold tracking-tight">
                  {mode === 'forgot' ? 'Forgot your password?' : 'Choose a new password'}
                </h2>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  {mode === 'forgot'
                    ? 'Enter the email you registered with and we will send a one-time reset link.'
                    : resetTarget
                    ? `For @${resetTarget.username} · ${resetTarget.email}`
                    : 'Checking this link…'}
                </p>
              </div>
            )}

            {(mode === 'signin' || mode === 'signup') && (
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
            )}

            {(mode === 'signin' || mode === 'signup') && (
              <div className="space-y-4">
                <button
                  type="button"
                  onClick={handleGoogle}
                  className="w-full py-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm font-semibold text-zinc-800 dark:text-zinc-100 inline-flex items-center justify-center gap-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/80 transition"
                >
                  <GoogleIcon className="w-4 h-4" />
                  {mode === 'signup' ? 'Sign up with Google' : 'Continue with Google'}
                </button>
                <div className="flex items-center gap-3">
                  <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
                  <span className="text-[10px] uppercase tracking-wider text-zinc-400">
                    or use email
                  </span>
                  <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
                </div>
              </div>
            )}

            {errorMsg && (
              <div className="rounded-xl bg-rose-500/10 border border-rose-500/25 px-3.5 py-2.5 text-xs font-medium text-rose-600 dark:text-rose-400 space-y-2">
                <p>{errorMsg}</p>
                {needsAccount && (
                  <button
                    type="button"
                    onClick={() => {
                      setEmail(identifier.includes('@') ? identifier.trim() : '');
                      setUsername(identifier.includes('@') ? '' : identifier.replace(/^@+/, ''));
                      setErrorMsg(null);
                      setNeedsAccount(false);
                      setMode('signup');
                    }}
                    className="px-2.5 py-1 rounded-lg bg-rose-600 text-white text-[11px] font-semibold"
                  >
                    Create that account →
                  </button>
                )}
                {recoverable && (
                  <div className="space-y-1.5 pt-1">
                    <p className="text-[11px] font-normal">
                      This device still has your library saved for{' '}
                      <span className="font-mono">@{recoverable.username}</span>. Re-create the
                      account with the password above to keep all of it.
                    </p>
                    <button
                      type="button"
                      onClick={handleRecover}
                      disabled={recovering || loginPassword.length < 8}
                      className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-[11px] font-semibold disabled:opacity-40"
                    >
                      {recovering ? 'Restoring…' : `Restore @${recoverable.username} & keep my data`}
                    </button>
                    {recoverMsg && <p className="text-[11px] font-normal">{recoverMsg}</p>}
                  </div>
                )}
                {errorCode === 'USE_GOOGLE' && (
                  <button
                    type="button"
                    onClick={handleGoogle}
                    className="px-2.5 py-1 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-[11px] font-semibold inline-flex items-center gap-1.5"
                  >
                    <GoogleIcon className="w-3 h-3" /> Continue with Google
                  </button>
                )}
                {errorCode === 'WRONG_PASSWORD' && (
                  <p className="text-[11px] font-normal">
                    Tip: passwords are case-sensitive. If you signed up on another device, use the
                    same email or @username you registered with.
                  </p>
                )}
              </div>
            )}

            {mode === 'forgot' ? (
              <form onSubmit={handleSendReset} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1.5">
                    Email
                  </label>
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/70 px-3.5 py-2.5 text-sm focus:outline-none focus:border-emerald-600"
                  />
                </div>

                {resetNotice && (
                  <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/25 px-3.5 py-2.5 text-[11px] text-emerald-700 dark:text-emerald-400 space-y-2">
                    <p className="flex items-start gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>{resetNotice}</span>
                    </p>
                    {resetDevLink && (
                      <a
                        href={resetDevLink}
                        className="inline-block px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-[11px] font-semibold"
                      >
                        Open reset link (dev)
                      </a>
                    )}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={busy}
                  className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition disabled:opacity-50"
                >
                  <Mail className="w-4 h-4" />
                  {busy ? 'Sending link…' : 'Email me a reset link'}
                </button>

                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 text-center">
                  Signed up with Google? Use “Continue with Google” — no password needed.
                </p>
                {!providers.emailDelivery && (
                  <p className="text-[10px] text-amber-600 dark:text-amber-400 text-center">
                    Server email delivery is not configured yet, so the link cannot be sent by email.
                  </p>
                )}
              </form>
            ) : mode === 'reset' ? (
              <form onSubmit={handleResetPassword} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1.5">
                    New password (min 8 characters)
                  </label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/70 px-3.5 py-2.5 text-sm focus:outline-none focus:border-emerald-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1.5">
                    Confirm password
                  </label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat your new password"
                    className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/70 px-3.5 py-2.5 text-sm focus:outline-none focus:border-emerald-600"
                  />
                </div>
                <button
                  type="submit"
                  disabled={busy || !resetTarget}
                  className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition disabled:opacity-50"
                >
                  {busy ? 'Saving…' : 'Save password & sign in'}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            ) : mode === 'signin' ? (
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

                <div className="flex justify-end -mt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setMode('forgot');
                      setErrorMsg(null);
                      setResetEmail(identifier.includes('@') ? identifier.trim() : '');
                    }}
                    className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400 hover:underline"
                  >
                    Forgot password?
                  </button>
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
