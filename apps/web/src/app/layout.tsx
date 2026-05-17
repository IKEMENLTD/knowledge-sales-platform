import { ThemeProvider } from '@/components/layout/theme-provider';
import type { Metadata, Viewport } from 'next';
import {
  Bricolage_Grotesque,
  JetBrains_Mono,
  Noto_Sans_JP,
  Plus_Jakarta_Sans,
} from 'next/font/google';
import type { ReactNode } from 'react';
import { Toaster } from 'sonner';
import './globals.css';

/* ----------------------------------------------------------------------------
 * Typography stack — "Sumi & Cinnabar Editorial"
 *  - Display: Bricolage Grotesque (variable opsz, distinctive editorial)
 *  - Body:    Plus Jakarta Sans (refined, warm)
 *  - JP:      Noto Sans JP (text=400, headline=500/700)
 *  - Mono:    JetBrains Mono (tabular numerics, code spans)
 *
 * subset='latin' で初期 bundle を抑えつつ、Noto Sans JP は subset 制限せず
 * fallback chain を `var(--font-jp)` で繋ぐ。
 * -------------------------------------------------------------------------- */
const display = Bricolage_Grotesque({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
  weight: ['400', '500', '600', '700'],
});

const body = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
  weight: ['400', '500', '600', '700'],
});

const jp = Noto_Sans_JP({
  subsets: ['latin'],
  variable: '--font-jp',
  display: 'swap',
  weight: ['400', '500', '700'],
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
  weight: ['400', '500'],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? 'http://localhost:3000'),
  title: {
    default: 'ksp / Knowledge Sales Platform',
    template: '%s — ksp',
  },
  description:
    '営業ナレッジ × 商談アーカイブ。Zoom録画・名刺・メールを構造化し、組織の営業知見に変える。',
  applicationName: 'Knowledge Sales Platform',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico', sizes: '32x32' },
    ],
    apple: [{ url: '/apple-touch-icon.svg', sizes: '180x180', type: 'image/svg+xml' }],
    other: [{ rel: 'mask-icon', url: '/favicon.svg', color: '#cf3a2d' }],
  },
  formatDetection: {
    telephone: false,
    email: false,
    address: false,
  },
  openGraph: {
    title: 'ksp / Knowledge Sales Platform',
    description: '営業ナレッジ × 商談アーカイブ。',
    type: 'website',
    locale: 'ja_JP',
    siteName: 'Knowledge Sales Platform',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fafaf6' },
    { media: '(prefers-color-scheme: dark)', color: '#0d1015' },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="ja"
      suppressHydrationWarning
      className={`${display.variable} ${body.variable} ${jp.variable} ${mono.variable}`}
    >
      <body className="font-sans antialiased min-h-dvh bg-background text-foreground">
        <a href="#main-content" className="sr-only sr-only-focusable">
          本文へスキップ
        </a>
        <a href="#site-nav" className="sr-only sr-only-focusable">
          ナビゲーションへスキップ
        </a>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
          <Toaster
            richColors
            position="top-right"
            closeButton
            toastOptions={{
              classNames: {
                toast:
                  'group rounded-lg border border-border bg-card text-card-foreground shadow-sumi-lg',
              },
            }}
          />
        </ThemeProvider>
      </body>
    </html>
  );
}
