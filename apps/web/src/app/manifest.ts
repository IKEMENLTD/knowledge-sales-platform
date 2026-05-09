import type { MetadataRoute } from 'next';

/**
 * PWA manifest - 17_offline_mobile / 19_onboarding_initial
 * iOS Safari への「ホーム画面に追加」と Android Chrome の installable PWA に対応。
 * アイコンは Phase1 W1 ではプレースホルダー、本番デザイン確定後に差し替え。
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Knowledge Sales Platform',
    short_name: 'KSP',
    description: '営業ナレッジ&商談アーカイブ・プラットフォーム',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#ffffff',
    theme_color: '#0b1220',
    lang: 'ja',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    categories: ['business', 'productivity'],
  };
}
