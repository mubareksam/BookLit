'use client';

import React, { useId } from 'react';

/**
 * Booklit brand mark: an open book cradling a rising flame.
 *
 * The emblem is a saturated emerald squircle with light book pages and an amber
 * flame tip, so it stays fully legible on BOTH the light paper theme and the
 * near-black dark theme (the previous dark-on-dark emblem vanished on white).
 */
export function BooklitLogo({
  size = 'md',
  showWordmark = true,
}: {
  size?: 'sm' | 'md' | 'lg';
  showWordmark?: boolean;
}) {
  const uid = useId().replace(/[:]/g, '');
  const emblem = `bl-emblem-${uid}`;
  const flame = `bl-flame-${uid}`;

  const iconDims = size === 'sm' ? 'w-7 h-7' : size === 'lg' ? 'w-12 h-12' : 'w-9 h-9';
  const textClass = size === 'sm' ? 'text-base' : size === 'lg' ? 'text-2xl' : 'text-lg';

  return (
    <div className="inline-flex items-center gap-2.5 select-none shrink-0">
      <svg
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`${iconDims} shrink-0`}
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={emblem} x1="4" y1="4" x2="60" y2="60" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#34D399" />
            <stop offset="42%" stopColor="#10B981" />
            <stop offset="100%" stopColor="#047857" />
          </linearGradient>
          <linearGradient id={flame} x1="32" y1="12" x2="32" y2="36" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FEF3C7" />
            <stop offset="55%" stopColor="#FBBF24" />
            <stop offset="100%" stopColor="#F59E0B" />
          </linearGradient>
        </defs>

        {/* Emerald squircle — high contrast against paper and OLED backgrounds */}
        <rect x="2" y="2" width="60" height="60" rx="17" fill={`url(#${emblem})`} />
        <rect
          x="3.2"
          y="3.2"
          width="57.6"
          height="57.6"
          rx="16"
          stroke="#FFFFFF"
          strokeOpacity="0.28"
          strokeWidth="1.4"
        />

        {/* Open book pages */}
        <path
          d="M14 25.5C14 23.8 15.4 22.5 17.1 22.8C22.4 23.6 27.2 25.8 31 29.2V47.5C27.2 44.3 22.3 42.3 16.8 41.7C15.2 41.5 14 40.2 14 38.6V25.5Z"
          fill="#FFFFFF"
        />
        <path
          d="M50 25.5C50 23.8 48.6 22.5 46.9 22.8C41.6 23.6 36.8 25.8 33 29.2V47.5C36.8 44.3 41.7 42.3 47.2 41.7C48.8 41.5 50 40.2 50 38.6V25.5Z"
          fill="#D1FAE5"
        />

        {/* Rising reading flame from the spine */}
        <path
          d="M32 11C32 11 24.5 18.4 24.5 24.8C24.5 29.1 27.8 32.5 32 33.4C36.2 32.5 39.5 29.1 39.5 24.8C39.5 18.4 32 11 32 11Z"
          fill={`url(#${flame})`}
        />
        <path
          d="M32 17.5C32 17.5 28.8 21.3 28.8 24.4C28.8 26.4 30.2 28 32 28.5C33.8 28 35.2 26.4 35.2 24.4C35.2 21.3 32 17.5 32 17.5Z"
          fill="#FFFBEB"
        />

        {/* Base cradle arc */}
        <path
          d="M17 47.5C22.2 47.5 27.4 49 32 51.5C36.6 49 41.8 47.5 47 47.5"
          stroke="#ECFDF5"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      </svg>

      {showWordmark && (
        <span className={`font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 ${textClass}`}>
          Book<span className="text-emerald-700 dark:text-emerald-400">lit</span>
        </span>
      )}
    </div>
  );
}
