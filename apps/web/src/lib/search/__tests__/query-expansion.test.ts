/**
 * query-expansion の決定的ユニットテスト。
 *
 * 設計判断:
 *   - apps/web には vitest が直接導入されていない (rrf.test.ts と同設計)。
 *   - node:assert/strict で自己完結。vitest からは globalThis.it/describe 経由で
 *     自動収集されるよう、両 API に互換する describe/it shim を提供する。
 *   - LLM (Anthropic API) は実呼出せず、ANTHROPIC_API_KEY を一時的に削って
 *     no-op 経路をテストする。parse 関数は pure function なので直接叩く。
 *
 * テストケース (合計 7):
 *   1) ANTHROPIC_API_KEY 不在 → no-op (canonical=元クエリ, aliases=[], intent='all')
 *   2) cache: 2 回目の同一クエリは cached=true で返る
 *   3) cache: 大文字小文字 / 連続空白は同一キー扱い
 *   4) parseExpansionJson: 正常 JSON
 *   5) parseExpansionJson: ```json``` フェンス除去
 *   6) parseExpansionJson: intent 不正値 → 'all' fallback
 *   7) parseExpansionJson: aliases に canonical 自身が混ざっていれば除去
 */
import assert from 'node:assert/strict';
import {
  _clearQueryExpansionCache,
  _queryExpansionCacheSize,
  expandQuery,
  parseExpansionJson,
} from '../query-expansion.js';

type Case = { name: string; fn: () => Promise<void> | void };
const cases: Case[] = [];
const add = (name: string, fn: () => Promise<void> | void) => cases.push({ name, fn });

add('1) no API key → no-op (canonical=q, aliases=[], intent=all)', async () => {
  _clearQueryExpansionCache();
  const prev = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    const r = await expandQuery('価格交渉');
    assert.equal(r.canonical, '価格交渉');
    assert.deepEqual(r.aliases, []);
    assert.equal(r.intent, 'all');
    assert.equal(r.llmUsed, false);
    assert.equal(r.estimatedCostUsd, 0);
  } finally {
    if (prev !== undefined) process.env.ANTHROPIC_API_KEY = prev;
  }
});

add('2) cache hit: 2nd call returns cached=true', async () => {
  _clearQueryExpansionCache();
  const prev = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    const a = await expandQuery('値引き');
    assert.equal(a.cached, false);
    const b = await expandQuery('値引き');
    assert.equal(b.cached, true);
    assert.equal(b.canonical, '値引き');
  } finally {
    if (prev !== undefined) process.env.ANTHROPIC_API_KEY = prev;
  }
});

add('3) cache key: case/whitespace normalized', async () => {
  _clearQueryExpansionCache();
  const prev = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    await expandQuery('Pricing  Discount');
    const sz1 = _queryExpansionCacheSize();
    await expandQuery('pricing discount');
    const sz2 = _queryExpansionCacheSize();
    // 同一キーになるはず → サイズ不変
    assert.equal(sz1, sz2);
  } finally {
    if (prev !== undefined) process.env.ANTHROPIC_API_KEY = prev;
  }
});

add('4) parseExpansionJson: well-formed JSON', () => {
  const out = parseExpansionJson(
    '{"canonical":"価格交渉","aliases":["値引き","ディスカウント","コストダウン"],"intent":"meeting"}',
  );
  assert.ok(out !== null);
  assert.equal(out?.canonical, '価格交渉');
  assert.deepEqual(out?.aliases, ['値引き', 'ディスカウント', 'コストダウン']);
  assert.equal(out?.intent, 'meeting');
});

add('5) parseExpansionJson: strip ```json fence```', () => {
  const out = parseExpansionJson(
    '```json\n{"canonical":"価格交渉","aliases":["値引き"],"intent":"all"}\n```',
  );
  assert.ok(out !== null);
  assert.equal(out?.canonical, '価格交渉');
  assert.deepEqual(out?.aliases, ['値引き']);
  assert.equal(out?.intent, 'all');
});

add('6) parseExpansionJson: invalid intent → all', () => {
  const out = parseExpansionJson('{"canonical":"X","aliases":[],"intent":"random_invalid_value"}');
  assert.equal(out?.intent, 'all');
});

add('7) parseExpansionJson: aliases dedupe and remove canonical', () => {
  const out = parseExpansionJson(
    JSON.stringify({
      canonical: '価格交渉',
      aliases: ['値引き', '価格交渉', '値引き', 'ディスカウント'],
      intent: 'meeting',
    }),
  );
  // canonical 自身 / 重複は除去される
  assert.deepEqual(out?.aliases, ['値引き', 'ディスカウント']);
});

/** 全テスト実行 (vitest / node:test / 直接呼び出し すべてに対応)。 */
export async function runQueryExpansionTests(): Promise<void> {
  let failed = 0;
  for (const c of cases) {
    try {
      await c.fn();
      // eslint-disable-next-line no-console
      console.log(`PASS  ${c.name}`);
    } catch (e) {
      failed++;
      // eslint-disable-next-line no-console
      console.error(`FAIL  ${c.name}\n      ${(e as Error).message}`);
    }
  }
  if (failed > 0) {
    throw new Error(`${failed} test(s) failed`);
  }
}

const g = globalThis as unknown as {
  describe?: (label: string, body: () => void) => void;
  it?: (label: string, fn: () => Promise<void> | void) => void;
};
if (typeof g.describe === 'function' && typeof g.it === 'function') {
  g.describe('query-expansion', () => {
    for (const c of cases) {
      g.it!(c.name, c.fn);
    }
  });
}
