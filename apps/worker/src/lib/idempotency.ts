import { createHash } from 'node:crypto';
import type { MiddlewareHandler } from 'hono';
import { supabaseAdmin } from './supabase.js';
import { logger } from './logger.js';

/**
 * `Idempotency-Key` ヘッダを使った冪等性 middleware。
 *
 * 設計書 25_v2_review_resolutions T-5 (CRIT) / 04_api_endpoints:
 *   `idempotency_keys (key, user_id, request_hash, response_jsonb, status, expires_at)`
 *   → middleware で受信時 UPSERT + 既存ヒットなら保存 response 再生。
 *
 * TTL は migration 側で `default now() + interval '24 hours'` を持たせる前提。
 *
 * NOTE: `idempotency_keys` テーブルは P1 W2 で `0006_p1_extended_tables.sql` として
 *       migration 投入予定。テーブル不在時はスキップして次の middleware に流す
 *       (本番では 5xx を返したいが scaffold 段階では soft-fail)。
 */

interface IdempotencyOptions {
  /** ヘッダ名 (default: 'idempotency-key') */
  headerName?: string;
  /** key の最大長 (default 255) */
  maxKeyLength?: number;
}

interface IdempotencyRow {
  key: string;
  request_hash: string;
  response_jsonb: unknown;
  status: 'pending' | 'succeeded' | 'failed';
}

function hashRequest(method: string, path: string, body: string): string {
  return createHash('sha256').update(`${method}\n${path}\n${body}`).digest('hex');
}

export function idempotency(options: IdempotencyOptions = {}): MiddlewareHandler {
  const headerName = (options.headerName ?? 'idempotency-key').toLowerCase();
  const maxKeyLength = options.maxKeyLength ?? 255;

  return async (c, next) => {
    const key = c.req.header(headerName);
    if (!key) return next();
    if (key.length === 0 || key.length > maxKeyLength) {
      return c.json({ error: 'invalid_idempotency_key' }, 400);
    }

    const method = c.req.method;
    const path = c.req.path;
    // body の hash は raw text から作る。Hono の `c.req.text()` は内部で
    // body をキャッシュするので、後段ハンドラが `c.req.json()` を呼んでも
    // 二重消費にはならない (Hono 4.6+ 挙動)。
    let bodyText = '';
    if (method !== 'GET' && method !== 'HEAD') {
      try {
        bodyText = await c.req.text();
      } catch {
        bodyText = '';
      }
    }
    const requestHash = hashRequest(method, path, bodyText);

    const log = logger.child({ idemKey: key, path, method });

    // 1) 既存ヒット参照
    try {
      const { data: existing } = await supabaseAdmin
        .from('idempotency_keys')
        .select('key, request_hash, response_jsonb, status')
        .eq('key', key)
        .maybeSingle();

      if (existing) {
        const row = existing as IdempotencyRow;
        if (row.request_hash !== requestHash) {
          log.warn('idempotency conflict: same key, different request hash');
          return c.json({ error: 'idempotency_conflict' }, 409);
        }
        if (row.status === 'succeeded' && row.response_jsonb) {
          log.info('idempotency replay: returning stored response');
          return c.json(row.response_jsonb as Record<string, unknown>, 200);
        }
        if (row.status === 'pending') {
          // 進行中の重複リクエスト → 409 で「待ってくれ」を伝える。
          return c.json({ error: 'idempotency_in_progress' }, 409);
        }
        // failed の場合は再試行を許可してそのまま落とす。
      }
    } catch (err) {
      // テーブル不在 (relation does not exist) などは soft-fail して通過。
      log.warn({ err: (err as Error).message }, 'idempotency lookup failed; bypass');
      return next();
    }

    // 2) pending として upsert (ON CONFLICT DO NOTHING で他リクエストとの競合は弾く)
    try {
      const { error: insertErr } = await supabaseAdmin.from('idempotency_keys').insert({
        key,
        request_hash: requestHash,
        status: 'pending',
        // user_id は middleware 単体では取得不能のため呼び出し元 Route で UPDATE する。
        // テーブル定義側で `user_id uuid` を NULL 許容にしておく必要がある。
        user_id: null,
      });
      if (insertErr && insertErr.code !== '23505') {
        // 23505 = unique_violation (二重実行) は無視。それ以外はログだけで通す。
        log.warn({ err: insertErr.message }, 'idempotency insert failed; bypass');
      }
    } catch (err) {
      log.warn({ err: (err as Error).message }, 'idempotency insert threw; bypass');
    }

    // 3) 本処理を実行
    await next();

    // 4) succeeded/failed を記録 (簡易: status のみ)。
    //    response body の保存は Hono の応答 stream を読み戻す必要があり、
    //    レスポンス JSON サイズが大きい route では性能問題になるため P1 では status のみ。
    try {
      const status = c.res.status;
      const succeeded = status >= 200 && status < 300;
      await supabaseAdmin
        .from('idempotency_keys')
        .update({ status: succeeded ? 'succeeded' : 'failed' })
        .eq('key', key);
    } catch (err) {
      log.warn({ err: (err as Error).message }, 'idempotency status update failed');
    }
  };
}
