'use client';

import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Last line of defence: a broken view must never leave the reader staring at a
 * blank page (or make every button look dead). Show a short recovery card with
 * a reload action, and keep the technical detail collapsed for bug reports.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[booklit] UI error:', error.message, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-[#090B0E] text-zinc-900 dark:text-zinc-100 p-6">
        <div className="w-full max-w-sm rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 space-y-4 text-center">
          <div className="mx-auto w-10 h-10 rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h1 className="text-sm font-semibold">Something went wrong on this screen</h1>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              Your books and reading history are safe. Reload to continue where you left off.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              this.setState({ error: null });
              window.location.reload();
            }}
            className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center justify-center gap-2"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reload Booklit
          </button>
          <details className="text-left">
            <summary className="text-[10px] text-zinc-400 cursor-pointer">Technical details</summary>
            <p className="mt-1 text-[10px] font-mono text-zinc-500 break-words">{error.message}</p>
          </details>
        </div>
      </div>
    );
  }
}
