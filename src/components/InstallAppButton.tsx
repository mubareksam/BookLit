'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Download, Share, Smartphone, X } from 'lucide-react';
import {
  getInstallSteps,
  promptPwaInstall,
  PwaInstallState,
  subscribePwaInstall,
} from '@/lib/pwaInstall';

export function usePwaInstallState(): PwaInstallState {
  const [state, setState] = useState<PwaInstallState>({
    canPrompt: false,
    isInstalled: false,
    platform: 'other',
    isSafari: false,
  });

  useEffect(() => subscribePwaInstall(setState), []);

  return state;
}

/**
 * Explicit "Install app" entry point. Always works: Chromium gets the native
 * prompt, while iOS Safari / Android get step-by-step instructions so the
 * button is never a dead end (which is what happened on phones before).
 */
export function InstallAppButton({
  variant = 'button',
  className = '',
}: {
  variant?: 'button' | 'icon' | 'row';
  className?: string;
}) {
  const state = usePwaInstallState();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (state.isInstalled && variant !== 'row') return null;

  const startInstall = async () => {
    const outcome = await promptPwaInstall();
    if (outcome === 'accepted') {
      setMessage('Installing Booklit…');
      return;
    }
    if (outcome === 'installed') {
      setMessage('Booklit is already installed.');
      return;
    }
    // No native prompt available → show the exact steps for this device.
    setSheetOpen(true);
  };

  const steps = getInstallSteps(state);

  return (
    <>
      {variant === 'icon' && (
        <button
          type="button"
          onClick={startInstall}
          aria-label="Install Booklit app"
          title="Install Booklit app"
          className={
            className ||
            'p-2 rounded-xl border border-emerald-600/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20 transition'
          }
        >
          <Download className="w-4 h-4" />
        </button>
      )}

      {variant === 'button' && (
        <button
          type="button"
          onClick={startInstall}
          className={
            className ||
            'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition'
          }
        >
          <Download className="w-3.5 h-3.5" />
          Install App
        </button>
      )}

      {variant === 'row' && (
        <button
          type="button"
          onClick={startInstall}
          className={
            className ||
            'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-left'
          }
        >
          <Download className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="min-w-0 flex-1 truncate">
            {state.isInstalled ? 'Booklit app installed' : 'Install Booklit app'}
          </span>
          {state.isInstalled && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
        </button>
      )}

      {message && !sheetOpen && (
        <span className="sr-only" role="status">
          {message}
        </span>
      )}

      {sheetOpen && (
        <div
          className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Install Booklit"
        >
          <div className="w-full max-w-md rounded-t-3xl sm:rounded-3xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl p-5 space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
                  <Smartphone className="w-4 h-4" />
                </span>
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold">Install Booklit</h2>
                  <p className="text-[11px] text-zinc-500">
                    Full-screen app · offline drafts · no browser bars
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSheetOpen(false)}
                aria-label="Close install instructions"
                className="p-1.5 rounded-lg text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {state.canPrompt && (
              <button
                type="button"
                onClick={async () => {
                  const outcome = await promptPwaInstall();
                  if (outcome === 'accepted' || outcome === 'installed') setSheetOpen(false);
                }}
                className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                Install now
              </button>
            )}

            <ol className="space-y-2.5">
              {steps.map((step, idx) => (
                <li key={step.title} className="flex items-start gap-2.5 min-w-0">
                  <span className="w-5 h-5 rounded-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                    {idx + 1}
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold">{step.title}</div>
                    <p className="text-[11px] text-zinc-500 break-words">{step.detail}</p>
                  </div>
                </li>
              ))}
            </ol>

            {state.platform === 'ios' && (
              <div className="rounded-xl bg-zinc-50 dark:bg-zinc-800/60 px-3 py-2.5 flex items-start gap-2 text-[11px] text-zinc-600 dark:text-zinc-300">
                <Share className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  iOS only allows installing from Safari. If you’re in another browser, open this page
                  in Safari first.
                </span>
              </div>
            )}

            <button
              type="button"
              onClick={() => setSheetOpen(false)}
              className="w-full py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-medium"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}
