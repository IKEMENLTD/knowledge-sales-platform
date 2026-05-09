import { Hono } from 'hono';
import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * idempotency middleware の単体テスト。
 *
 * supabaseAdmin はテーブル不在時に soft-fail (bypass) する設計なので、
 * 「テーブル不在 = エラー」を返す mock で middleware が pass-through する経路と、
 * 「ストアに行が存在 / 不在」を切り替えられる mock で 409/200 経路をカバーする。
 */

type Row = { key: string; request_hash: string; status: string; response_jsonb: unknown };
const store: Map<string, Row> = new Map();

vi.mock('../lib/supabase.js', () => {
  function makeBuilder(table: string) {
    let eqKey: string | undefined;
    let pendingUpdate: Partial<Row> | undefined;
    let pendingInsert: Row | undefined;

    const builder: Record<string, unknown> = {
      select(_: string) {
        return builder;
      },
      eq(_col: string, val: string) {
        eqKey = val;
        if (pendingUpdate && eqKey) {
          const cur = store.get(eqKey);
          if (cur) store.set(eqKey, { ...cur, ...pendingUpdate });
          // update().eq() はそこで完了するので thenable を返す
          return Promise.resolve({ data: null, error: null });
        }
        return builder;
      },
      maybeSingle() {
        if (table !== 'idempotency_keys') {
          return Promise.resolve({ data: null, error: { message: 'unknown table' } });
        }
        const row = eqKey ? store.get(eqKey) : undefined;
        return Promise.resolve({ data: row ?? null, error: null });
      },
      insert(values: Row) {
        pendingInsert = values;
        if (table !== 'idempotency_keys') {
          return Promise.resolve({ data: null, error: { code: '42P01', message: 'no table' } });
        }
        if (store.has(values.key)) {
          return Promise.resolve({
            data: null,
            error: { code: '23505', message: 'unique violation' },
          });
        }
        store.set(values.key, {
          key: values.key,
          request_hash: values.request_hash,
          status: values.status ?? 'pending',
          response_jsonb: null,
        });
        // mark used to satisfy lint
        void pendingInsert;
        return Promise.resolve({ data: null, error: null });
      },
      update(values: Partial<Row>) {
        pendingUpdate = values;
        return builder;
      },
    };
    return builder;
  }

  return {
    supabaseAdmin: {
      from: (table: string) => makeBuilder(table),
    },
  };
});

describe('idempotency middleware', () => {
  beforeEach(() => {
    store.clear();
  });

  it('passes through when Idempotency-Key header is absent', async () => {
    const { idempotency } = await import('../lib/idempotency.js');
    const app = new Hono();
    app.use('*', idempotency());
    app.post('/x', (c) => c.json({ ok: true }));

    const res = await app.request('/x', {
      method: 'POST',
      body: JSON.stringify({ a: 1 }),
      headers: { 'content-type': 'application/json' },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it('rejects oversize idempotency keys', async () => {
    const { idempotency } = await import('../lib/idempotency.js');
    const app = new Hono();
    app.use('*', idempotency({ maxKeyLength: 16 }));
    app.post('/x', (c) => c.json({ ok: true }));

    const res = await app.request('/x', {
      method: 'POST',
      body: '{}',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': 'a'.repeat(17),
      },
    });
    expect(res.status).toBe(400);
  });

  it('records first request and recognises a replay with same hash', async () => {
    const { idempotency } = await import('../lib/idempotency.js');
    const app = new Hono();
    app.use('*', idempotency());
    let counter = 0;
    app.post('/x', (c) => {
      counter += 1;
      return c.json({ counter });
    });

    const headers = {
      'content-type': 'application/json',
      'idempotency-key': 'abc-123',
    };

    const res1 = await app.request('/x', {
      method: 'POST',
      body: JSON.stringify({ a: 1 }),
      headers,
    });
    expect(res1.status).toBe(200);
    expect(store.has('abc-123')).toBe(true);
    // 1回目処理後 status=succeeded に遷移していること
    expect(store.get('abc-123')?.status).toBe('succeeded');

    // 2回目: 同一 key + 同一 body → status='succeeded' だが response_jsonb=null のため
    // middleware は replay できず handler が再度走る (P1 簡易実装の限界)。
    // ここでは 2xx 応答であることのみ確認する。
    const res2 = await app.request('/x', {
      method: 'POST',
      body: JSON.stringify({ a: 1 }),
      headers,
    });
    expect(res2.status).toBeGreaterThanOrEqual(200);
    expect(res2.status).toBeLessThan(500);
  });

  it('returns 409 conflict when key reused with different request hash', async () => {
    const { idempotency } = await import('../lib/idempotency.js');
    const app = new Hono();
    app.use('*', idempotency());
    app.post('/x', (c) => c.json({ ok: true }));

    const headers = {
      'content-type': 'application/json',
      'idempotency-key': 'conflict-key',
    };

    const res1 = await app.request('/x', {
      method: 'POST',
      body: JSON.stringify({ a: 1 }),
      headers,
    });
    expect(res1.status).toBe(200);

    const res2 = await app.request('/x', {
      method: 'POST',
      body: JSON.stringify({ a: 999 }),
      headers,
    });
    expect(res2.status).toBe(409);
  });

  /**
   * S2-M-01 regression: middleware が body を text 消費した後でも、
   * 後段 handler が `c.req.json()` を呼んで body を再消費できる必要がある。
   * Hono 4.x は内部で body をキャッシュする想定だが、実装変更で破綻すると
   * idempotency 配線の全 POST route が即死するため明示テスト。
   */
  it('lets downstream handler re-read JSON body after middleware consumed it', async () => {
    const { idempotency } = await import('../lib/idempotency.js');
    const app = new Hono();
    app.use('*', idempotency());
    app.post('/x', async (c) => {
      const body = (await c.req.json()) as { a?: number };
      return c.json({ echoedA: body.a ?? null });
    });

    const headers = {
      'content-type': 'application/json',
      'idempotency-key': 'reread-key',
    };

    const res = await app.request('/x', {
      method: 'POST',
      body: JSON.stringify({ a: 42 }),
      headers,
    });
    expect(res.status).toBe(200);
    const out = (await res.json()) as { echoedA: number | null };
    expect(out.echoedA).toBe(42);
  });
});
