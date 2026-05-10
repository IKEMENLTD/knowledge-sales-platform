import type { MetadataRoute } from 'next';

/**
 * PWA manifest — KSP "Sumi & Cinnabar" ブランディング。
 * SVG icon は modern browser/Android Chrome の両方でサポート。
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Knowledge Sales Platform',
    short_name: 'ksp',
    description: '営業ナレッジ × 商談アーカイブ。',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    display_override: ['standalone', 'minimal-ui'],
    orientation: 'portrait-primary',
    background_color: '#fafaf6',
    theme_color: '#cf3a2d',
    lang: 'ja',
    icons: [
      { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/apple-touch-icon.svg', sizes: '180x180', type: 'image/svg+xml', purpose: 'maskable' },
    ],
    categories: ['business', 'productivity'],
    shortcuts: [
      {
        name: '名刺をスキャン',
        short_name: '名刺',
        description: 'カメラで名刺を取り込みます。',
        url: '/mobile/scan',
        icons: [{ src: '/favicon.svg', sizes: '96x96', type: 'image/svg+xml' }],
      },
      {
        name: 'クイック検索',
        short_name: '検索',
        description: '商談ナレッジを横断検索します。',
        url: '/mobile/quick-lookup',
        icons: [{ src: '/favicon.svg', sizes: '96x96', type: 'image/svg+xml' }],
      },
    ],
  };
}
