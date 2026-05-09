import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Knowledge Sales Platform',
  description: '営業ナレッジ&商談アーカイブ・プラットフォーム',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
