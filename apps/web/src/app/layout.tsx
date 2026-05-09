import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Toaster } from 'sonner';
import { ThemeProvider } from '@/components/layout/theme-provider';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Knowledge Sales Platform',
    template: '%s | KSP',
  },
  description: '営業ナレッジ&商談アーカイブ・プラットフォーム',
  applicationName: 'Knowledge Sales Platform',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/favicon.ico',
    apple: '/icon-192.png',
  },
  formatDetection: {
    telephone: false,
    email: false,
    address: false,
  },
};

// 21_a11y_i18n / 17_offline_mobile - 片手操作と viewport-fit=cover で iPhone notch 対応
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0b1220' },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <body className="font-sans antialiased min-h-dvh bg-background text-foreground">
        {/* a11y: skip link - 21_a11y_i18n */}
        <a href="#main-content" className="sr-only sr-only-focusable">
          本文へスキップ
        </a>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
          <Toaster richColors position="top-right" closeButton />
        </ThemeProvider>
      </body>
    </html>
  );
}
