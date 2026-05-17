// CSP は Supabase / R2 / Sentry を許可しつつ、initial scaffold は Report-Only で運用。
// 本番運用時に違反レポートを `/api/csp-report` で集計後、Enforce に切替予定 (security/round1)。
const ContentSecurityPolicyReportOnly = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.supabase.co https://*.r2.cloudflarestorage.com",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co https://*.ingest.sentry.io https://*.ingest.us.sentry.io https://*.ingest.de.sentry.io wss://*.supabase.co",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "report-uri /api/csp-report",
].join('; ');

const securityHeaders = [
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    // 名刺スキャン (T-008) と将来の音声録画で camera/microphone は self のみ許可
    value: 'camera=(self), microphone=(self), geolocation=(), payment=(), usb=()',
  },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Content-Security-Policy-Report-Only', value: ContentSecurityPolicyReportOnly },
];

/**
 * Security/Round2 S-N-03: CORS allowlist を本番 URL のみに制限する。
 * APP_URL (例: https://app.example.com) を allow し、それ以外は CORS を返さない。
 * dev / preview ビルドでは APP_URL=http://localhost:3000 が設定される前提。
 */
const APP_URL = process.env.APP_URL ?? 'http://localhost:3000';

const corsHeaders = [
  { key: 'Access-Control-Allow-Origin', value: APP_URL },
  { key: 'Vary', value: 'Origin' },
  { key: 'Access-Control-Allow-Credentials', value: 'true' },
  {
    key: 'Access-Control-Allow-Methods',
    value: 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  },
  {
    key: 'Access-Control-Allow-Headers',
    value: 'Content-Type, Authorization, X-Requested-With',
  },
  { key: 'Access-Control-Max-Age', value: '600' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    typedRoutes: true,
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  transpilePackages: ['@ksp/db', '@ksp/shared'],
  // Round4 Phase 4 fix: packages/shared が NodeNext で `.js` extension import を使う
  // (TS の ESM 規約)。Next.js webpack で `.js` を `.ts` に alias する必要がある。
  webpack: (config) => {
    config.resolve = config.resolve ?? {};
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
    };
    return config;
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.supabase.co' },
      { protocol: 'https', hostname: '**.r2.cloudflarestorage.com' },
    ],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
      {
        // /api/* に CORS allowlist を明示。Allow-Origin はワイルドカード禁止。
        // /api/csp-report と /api/health は同 origin から呼ぶので影響しない。
        source: '/api/:path*',
        headers: corsHeaders,
      },
    ];
  },
};

export default nextConfig;
