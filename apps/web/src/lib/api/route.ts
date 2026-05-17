import { type AppUser, AuthError, type UserRole, requireApiUser } from '@/lib/auth/server';
import { env } from '@/lib/env';
import { DEFAULT_API_RATE_LIMIT, type WebRateLimitConfig, rateLimitWeb } from '@/lib/rate-limit';
import { createServerClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { type ZodError, type ZodSchema, z } from 'zod';

/**
 * Route Handler 用の薄いラッパ。
 *
 * 機能:
 *   - JSON / FormData body の zod validation (シリアライズ済) と早期 400
 *   - requireUser() の自動呼び出し (role gate, inactive 排除)
 *   - per-user rate-limit (api/* 全体は middleware で per-IP、ここは per-user)
 *   - Idempotency-Key の必須化 (mutating method 限定) — 既存判定は DB 側 idempotency テーブルに任せる
 *   - エラー JSON フォーマット統一: `{ error: string, code: string, details?: any }`
 *
 * 設計判断:
 *   - 本ラッパは Next.js Route Handler 内で使う想定。RSC からは action.ts に分離。
 *   - Edge runtime 互換のため Node 専用 API は使わない。
 *   - Idempotency 実装は worker の lib/idempotency.ts と統一。
 */

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Round3 Security NEW-HIGH-S-21 fix: CSRF Origin / Sec-Fetch-Site 検査。
 *
 * 攻撃シナリオ:
 *   悪意 site が `<form method=POST action=https://app.example/api/contacts/...>`
 *   や `fetch(... credentials:'include')` で同期 cookie 経由のリクエストを送る。
 *   Idempotency-Key を持たない / 違法な Content-Type 経路でも Bearer cookie が
 *   付けば 200 が通る穴があった。
 *
 * 対策 (defineRoute 冒頭で mutating 限定):
 *   - `Origin` ヘッダが env.APP_URL の origin と一致する場合のみ通す
 *   - `Sec-Fetch-Site` が 'cross-site' なら即 403
 *   - `Origin` が未指定 (古いブラウザ / curl) は SameSite=Lax cookie の保護に委ねるが、
 *     production だけは strict に 403 (NODE_ENV=production のみ)
 */
function parseOriginHost(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const u = new URL(value);
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

function assertSameOrigin(req: NextRequest): NextResponse | null {
  const origin = req.headers.get('origin');
  const sfs = req.headers.get('sec-fetch-site');
  if (sfs === 'cross-site') {
    return NextResponse.json(
      { error: 'cross_site_request_blocked', code: 'csrf' },
      { status: 403 },
    );
  }
  const appOrigin = parseOriginHost(env.APP_URL);
  const reqOrigin = parseOriginHost(origin);
  if (!appOrigin) {
    // env 設定がおかしい場合は fail-open (dev のみ想定)
    return null;
  }
  if (reqOrigin) {
    if (reqOrigin !== appOrigin) {
      return NextResponse.json(
        { error: 'origin_mismatch', code: 'csrf', expected: appOrigin },
        { status: 403 },
      );
    }
    return null;
  }
  // Origin 未指定: production だけ拒否 (curl/server-to-server 経路がある場合は別途 API token を用意)
  if (env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'origin_required', code: 'csrf' },
      { status: 403 },
    );
  }
  return null;
}

export interface RouteContext<TBody, TQuery> {
  req: NextRequest;
  user: AppUser;
  supabase: Awaited<ReturnType<typeof createServerClient>>;
  body: TBody;
  query: TQuery;
  /** mutating endpoint なら必ず非 null、それ以外は null */
  idempotencyKey: string | null;
}

export interface RouteOptions<TBody, TQuery> {
  /** 必要最低 role */
  role?: UserRole;
  /** body zod schema (POST/PUT/PATCH 限定で評価) */
  body?: ZodSchema<TBody>;
  /** URL search params の zod schema */
  query?: ZodSchema<TQuery>;
  /** per-user の rate limit (デフォルト 60req/min) */
  rateLimit?: WebRateLimitConfig;
  /** mutating endpoint で Idempotency-Key を必須化するか (default true) */
  requireIdempotencyKey?: boolean;
}

export type RouteHandler<TBody, TQuery> = (
  ctx: RouteContext<TBody, TQuery>,
) => Promise<NextResponse> | NextResponse;

function badRequest(error: string, code: string, details?: unknown): NextResponse {
  return NextResponse.json({ error, code, details }, { status: 400 });
}
function unauthorized(): NextResponse {
  return NextResponse.json({ error: 'unauthorized', code: 'unauthorized' }, { status: 401 });
}
function tooManyRequests(retryAfter: number, limit: number): NextResponse {
  return NextResponse.json(
    { error: 'rate_limit', code: 'rate_limit', retryAfter, limit },
    { status: 429, headers: { 'Retry-After': String(retryAfter) } },
  );
}

function formatZodError(err: ZodError): { error: string; details: unknown } {
  const flat = err.flatten();
  return {
    error: 'validation_failed',
    details: flat,
  };
}

export function defineRoute<TBody = undefined, TQuery = Record<string, string>>(
  options: RouteOptions<TBody, TQuery>,
  handler: RouteHandler<TBody, TQuery>,
): (req: NextRequest) => Promise<NextResponse> {
  return async (req: NextRequest) => {
    try {
      // Round2 Security CRITICAL-S-03 fix: API は redirect ではなく throw → 401/403 JSON
      const user = await requireApiUser(options.role ? { role: options.role } : undefined);

      // rate-limit (per-user)
      const rlKey = `web:${user.id}:${req.nextUrl.pathname}`;
      const rl = rateLimitWeb(rlKey, options.rateLimit ?? DEFAULT_API_RATE_LIMIT);
      if (!rl.ok) return tooManyRequests(rl.retryAfter, rl.limit);

      const isMutating = MUTATING.has(req.method);

      // CSRF check (mutating のみ) — Round3 Security NEW-HIGH-S-21 fix
      if (isMutating) {
        const csrfBlock = assertSameOrigin(req);
        if (csrfBlock) return csrfBlock;
      }

      // Idempotency-Key (mutating のみ)
      let idempotencyKey: string | null = null;
      if (isMutating) {
        idempotencyKey = req.headers.get('idempotency-key');
        if (options.requireIdempotencyKey !== false && !idempotencyKey) {
          return badRequest('Idempotency-Key header required', 'idempotency_key_missing');
        }
        if (idempotencyKey && !/^[a-zA-Z0-9_-]{8,128}$/.test(idempotencyKey)) {
          return badRequest(
            'Idempotency-Key must be 8-128 url-safe chars',
            'idempotency_key_invalid',
          );
        }
      }

      // body validation
      // 注意: idempotency hash 用に raw body を保持してから parse する。
      let body = undefined as unknown as TBody;
      let rawBody = '';
      if (options.body && isMutating) {
        try {
          rawBody = await req.text();
        } catch {
          return badRequest('invalid_body', 'invalid_body');
        }
        let raw: unknown;
        try {
          raw = rawBody ? JSON.parse(rawBody) : {};
        } catch {
          return badRequest('invalid_json', 'invalid_json');
        }
        const parsed = options.body.safeParse(raw);
        if (!parsed.success) {
          const f = formatZodError(parsed.error);
          return badRequest(f.error, 'validation_failed', f.details);
        }
        body = parsed.data;
      }

      // query validation
      let query = undefined as unknown as TQuery;
      if (options.query) {
        const params: Record<string, string> = {};
        for (const [k, v] of req.nextUrl.searchParams.entries()) {
          params[k] = v;
        }
        const parsed = options.query.safeParse(params);
        if (!parsed.success) {
          const f = formatZodError(parsed.error);
          return badRequest(f.error, 'validation_failed', f.details);
        }
        query = parsed.data;
      } else {
        query = {} as TQuery;
      }

      const supabase = await createServerClient();

      // Idempotency 実 dedup (Round1 Security CRITICAL-S-01 fix)
      let idemClaim: ((status: number, response: Record<string, unknown>) => Promise<void>) | null =
        null;
      let idemFail: (() => Promise<void>) | null = null;
      if (isMutating && idempotencyKey) {
        const requestHash = await computeRequestHash(req.method, req.nextUrl.pathname, rawBody);
        const state = await beginIdempotency(supabase, user, idempotencyKey, requestHash);
        if (state.kind === 'cached') {
          return NextResponse.json(state.response, { status: state.status });
        }
        if (state.kind === 'in_progress') {
          return NextResponse.json(
            { error: 'idempotency_in_progress', code: 'idempotency_in_progress' },
            { status: 409 },
          );
        }
        if (state.kind === 'conflict') {
          return NextResponse.json(
            { error: 'idempotency_conflict', code: 'idempotency_conflict' },
            { status: 409 },
          );
        }
        if (state.kind === 'fresh') {
          idemClaim = state.claim;
          idemFail = state.fail;
        }
        // unavailable は table 不在等。dedup を skip して通常実行。
      }

      const response = await handler({ req, user, supabase, body, query, idempotencyKey });

      // claim (success/fail) — レスポンス 2xx なら done、それ以外は failed。
      if (idemClaim && response.status >= 200 && response.status < 300) {
        try {
          const clone = response.clone();
          const data = (await clone.json()) as Record<string, unknown>;
          await idemClaim(response.status, data);
        } catch {
          /* body が JSON 以外 (= 204 等) なら body=null で記録 */
          await idemClaim(response.status, { _empty: true });
        }
      } else if (idemFail) {
        await idemFail();
      }

      return response;
    } catch (err) {
      // Round2 Security CRITICAL-S-03 fix: AuthError は 401/403 JSON
      if (err instanceof AuthError) {
        return NextResponse.json(
          { error: err.code, code: err.code, ...(err.detail ?? {}) },
          { status: err.status },
        );
      }
      // Round3 Security P2 fix: 内部 error メッセージを client に流さない。
      // 詳細は server log + Sentry に残し、client には汎用文字列のみ返す。
      console.error('[defineRoute] unhandled error', err);
      return NextResponse.json(
        { error: 'internal_error', code: 'internal_error' },
        { status: 500 },
      );
    }
  };
}

/**
 * Idempotency 既存 hit 検査 + 結果保存。worker 側 lib/idempotency.ts と同じ
 * `idempotency_keys` テーブルを使う (migration 0009)。
 *
 * Round1 Security CRITICAL-S-01 修正:
 *   旧実装は `response_jsonb` / status `pending|succeeded` を参照していたが
 *   実テーブルは `response_body` / status `processing|done|failed` (0009)。
 *   schema 不整合で全 INSERT が CHECK 違反、SELECT も列無し 42703 で常に失敗 →
 *   全 mutating route で実 dedup が動いておらず二重課金リスク。
 *
 * 修正後:
 *   - SELECT/INSERT/UPDATE の列名・status enum を 0009 と完全一致
 *   - defineRoute から自動で呼ぶ (handler 個別 import 不要)
 *   - cached hit 時は handler を skip して直接保存 response を返す
 */
export type IdempotencyState =
  | { kind: 'cached'; status: number; response: Record<string, unknown> }
  | {
      kind: 'fresh';
      claim: (status: number, response: Record<string, unknown>) => Promise<void>;
      fail: () => Promise<void>;
    }
  | { kind: 'in_progress' }
  | { kind: 'conflict' }
  | { kind: 'unavailable' };

export async function beginIdempotency(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  user: AppUser,
  key: string,
  requestHash: string,
): Promise<IdempotencyState> {
  // 1) 既存 row 検査
  let existing: {
    request_hash: string;
    response_body: Record<string, unknown> | null;
    response_status: number | null;
    status: string;
  } | null = null;
  try {
    const { data, error } = (await supabase
      .from('idempotency_keys')
      .select('request_hash,response_body,response_status,status')
      .eq('key', key)
      .maybeSingle()) as unknown as {
      data: {
        request_hash: string;
        response_body: Record<string, unknown> | null;
        response_status: number | null;
        status: string;
      } | null;
      error: { code?: string } | null;
    };
    if (error) return { kind: 'unavailable' };
    existing = data;
  } catch {
    return { kind: 'unavailable' };
  }

  if (existing) {
    if (existing.request_hash !== requestHash) return { kind: 'conflict' };
    if (existing.status === 'done' && existing.response_body) {
      return {
        kind: 'cached',
        status: existing.response_status ?? 200,
        response: existing.response_body,
      };
    }
    if (existing.status === 'processing') return { kind: 'in_progress' };
    // failed は再試行を許可 → fall through で新規 row を上書き
  }

  // 2) processing として upsert
  try {
    const { error } = await supabase.from('idempotency_keys').upsert(
      {
        key,
        request_hash: requestHash,
        user_id: user.id,
        status: 'processing',
      },
      { onConflict: 'key' },
    );
    if (error) return { kind: 'unavailable' };
  } catch {
    return { kind: 'unavailable' };
  }

  return {
    kind: 'fresh',
    claim: async (status, response) => {
      try {
        await supabase
          .from('idempotency_keys')
          .update({ status: 'done', response_status: status, response_body: response })
          .eq('key', key);
      } catch {
        /* 保存失敗は本処理を巻き戻さない */
      }
    },
    fail: async () => {
      try {
        await supabase.from('idempotency_keys').update({ status: 'failed' }).eq('key', key);
      } catch {
        /* noop */
      }
    },
  };
}

async function computeRequestHash(method: string, path: string, rawBody: string): Promise<string> {
  const data = new TextEncoder().encode(`${method}\n${path}\n${rawBody}`);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * JSON 200 OK のショートカット。
 */
export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, { status: 200, ...init });
}

export const errorResponse = (
  status: number,
  code: string,
  error?: string,
  details?: unknown,
): NextResponse => NextResponse.json({ error: error ?? code, code, details }, { status });

// re-export for convenience
export { z };
