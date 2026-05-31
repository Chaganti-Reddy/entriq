// apps/web/app/layout.tsx
// Root layout: fonts, metadata, global styles, providers.

import type { Metadata, Viewport } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { Providers } from './providers';
import { ErrorBoundary } from '@/components/error-boundary';
import './globals.css';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#09090b',
};

export const metadata: Metadata = {
  title: {
    default: 'Entriq — Event Check-in, Reimagined',
    template: '%s | Entriq',
  },
  description:
    'QR-based entry verification for any event. Set up in 2 minutes. Works on any phone. Free forever.',
  keywords: ['event check-in', 'QR code', 'entry verification', 'event management'],
  authors: [{ name: 'Entriq' }],
  creator: 'Entriq',
  openGraph: {
    type: 'website',
    locale: 'en_IN',
    title: 'Entriq — Event Check-in, Reimagined',
    description: 'QR-based entry verification for any event. Free forever.',
    siteName: 'Entriq',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Entriq — Event Check-in, Reimagined',
    description: 'QR-based entry verification for any event. Free forever.',
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="min-h-screen bg-zinc-950 text-zinc-100 font-sans antialiased">
        <Providers>
          <ErrorBoundary>{children}</ErrorBoundary>
        </Providers>
      </body>
    </html>
  );
}
