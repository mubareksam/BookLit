'use client';

import React from 'react';

export function BooklitLogo({
  size = 'md',
  showWordmark = true,
}: {
  size?: 'sm' | 'md' | 'lg';
  showWordmark?: boolean;
}) {
  const iconDims =
    size === 'sm' ? 'w-7 h-7' : size === 'lg' ? 'w-12 h-12' : 'w-9 h-9';
  const textClass =
    size === 'sm'
      ? 'text-base'
      : size === 'lg'
      ? 'text-2xl'
      : 'text-lg';

  return (
    <div className="inline-flex items-center gap-2.5 select-none shrink-0">
      <svg
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`${iconDims} shrink-0 drop-shadow-sm`}
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="booklitBg" x1="6" y1="4" x2="58" y2="60" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#0D261D" />
            <stop offset="100%" stopColor="#091210" />
          </linearGradient>
          <linearGradient id="booklitFlame" x1="32" y1="11" x2="32" y2="38" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#6EE7B7" />
            <stop offset="55%" stopColor="#10B981" />
            <stop offset="100%" stopColor="#047857" />
          </linearGradient>
        </defs>

        {/* Rounded squircle emblem */}
        <rect x="2" y="2" width="60" height="60" rx="16" fill="url(#booklitBg)" />
        <rect
          x="3"
          y="3"
          width="58"
          height="58"
          rx="15"
          stroke="#34D399"
          strokeOpacity="0.28"
          strokeWidth="1.5"
        />

        {/* Open architectural book wings */}
        <path
          d="M14 25.5C14 23.8 15.4 22.5 17.1 22.8C22.4 23.6 27.2 25.8 31 29.2V47.5C27.2 44.3 22.3 42.3 16.8 41.7C15.2 41.5 14 40.2 14 38.6V25.5Z"
          fill="#F8FAFC"
          fillOpacity="0.95"
        />
        <path
          d="M50 25.5C50 23.8 48.6 22.5 46.9 22.8C41.6 23.6 36.8 25.8 33 29.2V47.5C36.8 44.3 41.7 42.3 47.2 41.7C48.8 41.5 50 40.2 50 38.6V25.5Z"
          fill="#CBD5E1"
          fillOpacity="0.92"
        />

        {/* Rising luminous reading flame / bookmark nib from the spine */}
        <path
          d="M32 11C32 11 24.5 18.4 24.5 24.8C24.5 29.1 27.8 32.5 32 33.4C36.2 32.5 39.5 29.1 39.5 24.8C39.5 18.4 32 11 32 11Z"
          fill="url(#booklitFlame)"
        />
        <path
          d="M32 17.5C32 17.5 28.8 21.3 28.8 24.4C28.8 26.4 30.2 28 32 28.5C33.8 28 35.2 26.4 35.2 24.4C35.2 21.3 32 17.5 32 17.5Z"
          fill="#ECFDF5"
        />

        {/* Crisp base cradle arc */}
        <path
          d="M17 47.5C22.2 47.5 27.4 49 32 51.5C36.6 49 41.8 47.5 47 47.5"
          stroke="#34D399"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      </svg>

      {showWordmark && (
        <span
          className={`font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 ${textClass}`}
        >
          Book<span className="text-emerald-600 dark:text-emerald-400">lit</span>
        </span>
      )}
    </div>
  );
}
