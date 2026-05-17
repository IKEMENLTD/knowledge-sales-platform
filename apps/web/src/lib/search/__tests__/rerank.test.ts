/**
 * rerank の決定的ユニットテスト。
 *
 * 設計判断:
 *   - rrf.test.ts と同様、node:assert/strict + vitest shim で自己完結。
 *   - LLM (Anthropic API) は実呼出しない (`ANTHROPIC_API_KEY` を削って no-op 経路)。
 *   - parseOrderArray / applyOrder / buildUserPrompt は pure function なので直接叩く。
 *
 * テストケース (合計 8):
 *   1) hits.length <= 1 → そのまま、reranked=false (too_few_hits)
 *   2) API key 不在 → そのまま、reranked=false (no_api_key)
 *   3) cost cap 超過 → そのまま、reranked=false (cost_cap)
 *   4) parseOrderArray: 正常 [3,1,2]
 *   5) parseOrderArray: ```json``` フェンス除去
 *   6) parseOrderArray: 範囲外 / 重複は除去 + 抜けは末尾補完
 *   7) applyOrder: hits.length > sliceLen の場合、超過分は元順で末尾に残す
 *   8) buildUserPrompt: snippet が SNIPPET_CLAMP で切れる
 */
import assert from 'node:assert/strict';
import type { SearchHit } from '@ksp/shared';
import { applyOrder, buildUserPrompt, parseOrderArray, rerankWithLLM } from '../rerank.js';

type Case = { name: string; fn: () => Promise<void> | void };
const cases: Case[] = [];
const add = (name: string, fn: () => Promise<void> | void) => cases.push({ name, fn });

function makeHit(id: string, title: string, snippet = 'sn'): SearchHit {
  return {
    id: `00000000-0000-0000-0000-${id.padStart(12, '0')}`,
    kind: 'recording',
    title,
    context: '',
    snippet,
    score: 0.5,
    href: `/x/${id}`,
  };
}

add('1) too few hits → unchanged + skipReason=too_few_hits', async () => {
  const out = await rerankWithLLM('q', [], { costCapUsd: 0.1 });
  assert.equal(out.reranked, false);
  assert.equal(out.skipReason, 'too_few_hits');
  assert.deepEqual(out.hits, []);
});

add('2) no API key → unchanged + skipReason=no_api_key', async () => {
  const prev = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    const input = [makeHit('1', 'A'), makeHit('2', 'B')];
    const out = await rerankWithLLM('q', input, { costCapUsd: 0.1 });
    assert.equal(out.reranked, false);
    assert.equal(out.skipReason, 'no_api_key');
    assert.deepEqual(
      out.hits.map((h) => h.title),
      ['A', 'B'],
    );
  } finally {
    if (prev !== undefined) process.env.ANTHROPIC_API_KEY = prev;
  }
});

add('3) cost cap exceeded → skipReason=cost_cap', async () => {
  // dummy API key (sk-ant-test 以外で formatted any string)
  const prev = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = 'sk-ant-dummy-not-test';
  try {
    const input = Array.from({ length: 10 }, (_, i) => makeHit(String(i + 1), `T${i + 1}`));
    // 極端に低い cap で必ず skip させる
    const out = await rerankWithLLM('q', input, { costCapUsd: 0.0000001 });
    assert.equal(out.reranked, false);
    assert.equal(out.skipReason, 'cost_cap');
  } finally {
    if (prev === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = prev;
  }
});

add('4) parseOrderArray: well-formed [3,1,2]', () => {
  const out = parseOrderArray('[3,1,2]', 3);
  assert.deepEqual(out, [3, 1, 2]);
});

add('5) parseOrderArray: strip ```json fence```', () => {
  const out = parseOrderArray('```json\n[2,1,3]\n```', 3);
  assert.deepEqual(out, [2, 1, 3]);
});

add('6) parseOrderArray: out-of-range/dup removed; missing appended', () => {
  // n=3, given [3, 99, 1, 1, -1, 2.7] → keep 3, 1, 2 (truncate). missing: none
  const out = parseOrderArray('[3,99,1,1,-1,2.7]', 3);
  assert.deepEqual(out, [3, 1, 2]);

  // 抜け補完: n=5, given [2] → output [2,1,3,4,5]
  const out2 = parseOrderArray('[2]', 5);
  assert.deepEqual(out2, [2, 1, 3, 4, 5]);
});

add('7) applyOrder: tail beyond sliceLen preserved in original order', () => {
  const hits = [
    makeHit('1', 'A'),
    makeHit('2', 'B'),
    makeHit('3', 'C'),
    makeHit('4', 'D'),
    makeHit('5', 'E'),
  ];
  // sliceLen=3, order reverses first 3 → [3,2,1] then tail [D, E] as-is
  const out = applyOrder(hits, 3, [3, 2, 1]);
  assert.deepEqual(
    out.map((h) => h.title),
    ['C', 'B', 'A', 'D', 'E'],
  );
});

add('8) buildUserPrompt: snippet truncated to ~SNIPPET_CLAMP', () => {
  const longSnippet = 'あ'.repeat(500);
  const hit = makeHit('1', 'T', longSnippet);
  const prompt = buildUserPrompt('q', [hit]);
  // Prompt 全体に snippet 500文字フル分は含まれてはならない
  assert.ok(prompt.includes('T'));
  // SNIPPET_CLAMP = 140 → 'あ' (3 bytes) × 140 = 文字長 140 が最大
  // 緩いチェック: 500文字未満
  const charCount = (prompt.match(/あ/g) ?? []).length;
  assert.ok(charCount <= 140, `expected <=140 got ${charCount}`);
});

/** 全テスト実行 (vitest / node:test / 直接呼び出し すべてに対応)。 */
export async function runRerankTests(): Promise<void> {
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
  g.describe('rerank', () => {
    for (const c of cases) {
      g.it!(c.name, c.fn);
    }
  });
}
