import type { Metadata, Viewport } from 'next';
import './globals.css';
import { BooklitProvider } from '@/context/BooklitContext';

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
    icon: '/icons/icon-192.svg',
    apple: '/icons/icon-192.svg',
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FCFBF8' },
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
      <body>
        <BooklitProvider>{children}</BooklitProvider>
      </body>
    </html>
  );
}
