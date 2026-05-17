import { env } from '../env.js';
import { logger } from './logger.js';

/**
 * Zoom Server-to-Server OAuth client.
 *
 * 設計書 06_external_integrations / T-012:
 *   - account_credentials grant で `access_token` (TTL 1h) を取得
 *   - download_url を fetch する際に `Authorization: Bearer <token>` を付与
 *   - rotation 90日 + token cache 55min (有効期限の手前 5min で破棄して再取得)
 *
 * P1 scaffold ではキー不在時 throw NotConfigured。
 * jobs/recording-download.ts 側で catch して mock fallback に分岐する。
 */

export class ZoomNotConfiguredError extends Error {
  override readonly name = 'ZoomNotConfiguredError';
  constructor(missing: string) {
    super(`Zoom OAuth not configured: ${missing}`);
  }
}

export interface ZoomToken {
  accessToken: string;
  /** epoch ms */
  expiresAtMs: number;
  scope?: string | undefined;
}

interface TokenCache {
  token: ZoomToken | null;
  fetchingPromise: Promise<ZoomToken> | null;
}

const tokenCache: TokenCache = {
  token: null,
  fetchingPromise: null,
};

/** cache を内部的にリセット (tests から使う) */
export function _resetZoomTokenCache(): void {
  tokenCache.token = null;
  tokenCache.fetchingPromise = null;
}

/**
 * Zoom OAuth2 token endpoint.
 *  https://zoom.us/oauth/token?grant_type=account_credentials&account_id=...
 *
 * @param fetchImpl テスト時に差し替え可能 (default = global fetch)
 */
/** Round2 SRE P1-SRE-13: token endpoint も timeout 必須。10s で諦めて caller に上げる。 */
const TOKEN_FETCH_TIMEOUT_MS = 10_000;

async function fetchNewToken(
  fetchImpl: typeof fetch = fetch,
): Promise<ZoomToken> {
  const accountId = env.ZOOM_ACCOUNT_ID;
  const clientId = env.ZOOM_CLIENT_ID;
  const clientSecret = env.ZOOM_CLIENT_SECRET;
  if (!accountId) throw new ZoomNotConfiguredError('ZOOM_ACCOUNT_ID');
  if (!clientId) throw new ZoomNotConfiguredError('ZOOM_CLIENT_ID');
  if (!clientSecret) throw new ZoomNotConfiguredError('ZOOM_CLIENT_SECRET');

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const url = `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(
    accountId,
  )}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TOKEN_FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        Accept: 'application/json',
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(
      `zoom oauth failed: status=${res.status} body=${body.slice(0, 200)}`,
    );
  }

  const json = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    scope?: string;
  };
  if (!json.access_token) {
    throw new Error('zoom oauth response missing access_token');
  }
  // expires_in は通常 3600 (1h)。安全マージン 5min を引いて cache する。
  const expiresInSec = Math.max(60, (json.expires_in ?? 3600) - 5 * 60);
  const expiresAtMs = Date.now() + expiresInSec * 1000;

  return {
    accessToken: json.access_token,
    expiresAtMs,
    scope: json.scope,
  };
}

/**
 * cached token を返す。期限切れ / cache 不在なら fetch 新規発行。
 * 並行コール時は in-flight Promise を共有 (thundering herd 防止)。
 */
export async function getZoomToken(opts?: {
  fetchImpl?: typeof fetch;
}): Promise<ZoomToken> {
  const fetchImpl = opts?.fetchImpl ?? fetch;
  const now = Date.now();
  const cached = tokenCache.token;
  if (cached && cached.expiresAtMs > now) {
    return cached;
  }
  if (tokenCache.fetchingPromise) {
    return tokenCache.fetchingPromise;
  }
  const log = logger.child({ op: 'zoom.getToken' });
  log.debug('fetching new zoom oauth token');
  tokenCache.fetchingPromise = fetchNewToken(fetchImpl)
    .then((tok) => {
      tokenCache.token = tok;
      return tok;
    })
    .finally(() => {
      tokenCache.fetchingPromise = null;
    });
  return tokenCache.fetchingPromise;
}

/**
 * Round1 Security CRITICAL-S-04 fix: SSRF 防御。
 *
 * pgmq の `processRecordingPayload.downloadUrl` は webhook → enqueue 経由で
 * 来るが、payload schema が validated でも値が「Zoom 由来の安全な URL」である
 * 保証はない。攻撃者が webhook 偽装 / pgmq 直挿入できれば
 *   http://169.254.169.254/latest/meta-data (AWS IMDSv1)
 *   http://10.x.x.x:8080 (internal services)
 *   file:///etc/passwd
 * 等を fetch でき、しかも Zoom OAuth Bearer token が漏洩する。
 *
 * 対策: host allowlist (`*.zoom.us` / `zoom.us`) + RFC1918 / link-local /
 * loopback / IPv6 ULA を block。scheme は https のみ。
 */
const ZOOM_HOST_ALLOWLIST = [
  'zoom.us',
  '.zoom.us', // suffix match で *.zoom.us
] as const;

const PRIVATE_IPV4_PREFIXES = [
  '10.',
  '127.',
  '169.254.',
  '192.168.',
  '0.',
];

function isRfc1918Or172(host: string): boolean {
  // 172.16.0.0/12
  const m = /^172\.(\d{1,3})\./.exec(host);
  if (m) {
    const second = Number(m[1]);
    if (second >= 16 && second <= 31) return true;
  }
  return false;
}

export function assertZoomDownloadHost(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('invalid download_url: not a URL');
  }
  if (url.protocol !== 'https:') {
    throw new Error(`invalid download_url: protocol ${url.protocol}`);
  }
  if (url.username || url.password) {
    throw new Error('invalid download_url: credentials in URL');
  }
  const host = url.hostname.toLowerCase();

  // hostname がそのまま IP リテラルの場合は block
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(host)) {
    if (PRIVATE_IPV4_PREFIXES.some((p) => host.startsWith(p)) || isRfc1918Or172(host)) {
      throw new Error(`SSRF blocked: private ipv4 ${host}`);
    }
    // 公開 IPv4 でも Zoom domain ではないので reject
    throw new Error(`download_url not on zoom allowlist: ${host}`);
  }
  // IPv6 リテラル ([::1] / [fc00::]) は一律 block
  if (host.startsWith('[')) {
    throw new Error('SSRF blocked: IPv6 literal not allowed');
  }

  const ok = ZOOM_HOST_ALLOWLIST.some((allow) =>
    allow.startsWith('.') ? host.endsWith(allow) : host === allow,
  );
  if (!ok) {
    throw new Error(`download_url not on zoom allowlist: ${host}`);
  }
  return url;
}

/**
 * Zoom download_url から audio/video バイト列を取得する。
 * 公式: https://developers.zoom.us/docs/api/rest/reference/zoom-api/methods/#operation/recordingGet
 */
export async function downloadZoomRecording(
  downloadUrl: string,
  opts?: { fetchImpl?: typeof fetch; timeoutMs?: number },
): Promise<{ bytes: Uint8Array; contentType: string }> {
  const fetchImpl = opts?.fetchImpl ?? fetch;
  const timeoutMs = opts?.timeoutMs ?? 60_000; // 60s
  const url = assertZoomDownloadHost(downloadUrl);
  const token = await getZoomToken({ fetchImpl });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url.toString(), {
      headers: { Authorization: `Bearer ${token.accessToken}` },
      signal: controller.signal,
      // 自動 redirect を許可するが、redirect 先も再度 host check したいので manual で受ける
      redirect: 'manual',
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) throw new Error(`zoom redirect without location: ${res.status}`);
      // 再帰呼出で再 host check
      return downloadZoomRecording(loc, { fetchImpl, timeoutMs });
    }
    if (!res.ok) {
      // PII / token を漏らさないよう body は記録しない (status だけ)
      throw new Error(`zoom download failed: status=${res.status}`);
    }
    const contentType = res.headers.get('content-type') ?? 'application/octet-stream';
    const buf = new Uint8Array(await res.arrayBuffer());
    return { bytes: buf, contentType };
  } finally {
    clearTimeout(timer);
  }
}
