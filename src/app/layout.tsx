import type { Metadata, Viewport } from 'next';
import './globals.css';
import { BooklitProvider } from '@/context/BooklitContext';
import { THEME_BOOTSTRAP_SCRIPT } from '@/lib/theme';

export const metadata: Metadata = {
  title: 'Booklit — Verified Cross-Platform Reading Habit System',
  description:
    'Offline-first verified reading coach supporting physical book scan boundaries, e-reader progress, probabilistic voice checks, Bayesian finish-time prediction, and privacy-first accountability.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Booklit',
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { url: '/icons/icon-192.svg', sizes: '192x192', type: 'image/svg+xml' },
    ],
    apple: '/icons/icon-192.png',
  },
  applicationName: 'Booklit',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F5F7F4' },
    { media: '(prefers-color-scheme: dark)', color: '#090A0D' },
  ],
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Paint the saved light/dark theme before hydration (no white flash). */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
      </head>
      <body>
        <BooklitProvider>{children}</BooklitProvider>
      </body>
    </html>
  );
}
