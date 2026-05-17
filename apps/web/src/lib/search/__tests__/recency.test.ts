/**
 * recency の決定的ユニットテスト。
 *
 * 設計判断:
 *   - rrf.test.ts と同様、node:assert/strict + vitest shim で自己完結。
 *   - 純粋関数 (副作用なし、now は引数で注入可能)。
 *
 * テストケース (合計 6):
 *   1) dateMs 未指定 → score 不変
 *   2) ageDays=0 (今日) → score 不変
 *   3) ageDays=90 (半減期) → score * (1 - 0.2 * (1 - 0.5)) = score * 0.9
 *   4) ageDays=180 → score * (1 - 0.2 * (1 - 0.25)) = score * 0.85
 *   5) 未来日 (negative age) → score 不変 (factor=1)
 *   6) recencyFactor: 不正値 (NaN/Infinity/null) → null
 *
 * 補助:
 *   7) mixWeight=0 → 常に score 不変
 *   8) mixWeight=1 → factor がそのまま掛かる
 */
import assert from 'node:assert/strict';
import type { SearchHit } from '@ksp/shared';
import { applyRecencyWeight, recencyFactor } from '../recency.js';

type Case = { name: string; fn: () => void };
const cases: Case[] = [];
const add = (name: string, fn: () => void) => cases.push({ name, fn });

function makeHit(id: string, score = 0.8): SearchHit {
  return {
    id: `00000000-0000-0000-0000-${id.padStart(12, '0')}`,
    kind: 'recording',
    title: 't',
    context: 'c',
    snippet: 's',
    score,
    href: `/x/${id}`,
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 4, 17); // 2026-05-17 UTC

add('1) dateMs undefined → unchanged', () => {
  const hits = [makeHit('1', 0.8), makeHit('2', 0.6)];
  const out = applyRecencyWeight(hits, { dateMs: [undefined, null], now: NOW });
  assert.equal(out[0]?.score, 0.8);
  assert.equal(out[1]?.score, 0.6);
});

add('2) ageDays=0 → unchanged', () => {
  const hits = [makeHit('1', 0.8)];
  const out = applyRecencyWeight(hits, { dateMs: [NOW], now: NOW });
  assert.equal(out[0]?.score, 0.8);
});

add('3) ageDays=90 → score * 0.9 (mixWeight 0.2, factor 0.5)', () => {
  const hits = [makeHit('1', 0.8)];
  const out = applyRecencyWeight(hits, {
    dateMs: [NOW - 90 * DAY_MS],
    now: NOW,
  });
  // score_new = 0.8 * (1 - 0.2 * (1 - 0.5)) = 0.8 * 0.9 = 0.72
  assert.ok(Math.abs((out[0]?.score ?? 0) - 0.72) < 1e-9);
});

add('4) ageDays=180 → score * 0.85 (factor 0.25)', () => {
  const hits = [makeHit('1', 0.8)];
  const out = applyRecencyWeight(hits, {
    dateMs: [NOW - 180 * DAY_MS],
    now: NOW,
  });
  // 0.8 * (1 - 0.2 * (1 - 0.25)) = 0.8 * (1 - 0.15) = 0.8 * 0.85 = 0.68
  assert.ok(Math.abs((out[0]?.score ?? 0) - 0.68) < 1e-9);
});

add('5) future date (negative age) → unchanged', () => {
  const hits = [makeHit('1', 0.8)];
  const out = applyRecencyWeight(hits, {
    dateMs: [NOW + 30 * DAY_MS],
    now: NOW,
  });
  assert.equal(out[0]?.score, 0.8);
});

add('6) recencyFactor: invalid inputs → null', () => {
  assert.equal(recencyFactor(null, NOW, 90), null);
  assert.equal(recencyFactor(undefined, NOW, 90), null);
  assert.equal(recencyFactor(Number.NaN, NOW, 90), null);
  assert.equal(recencyFactor(Number.POSITIVE_INFINITY, NOW, 90), null);
});

add('7) mixWeight=0 → always unchanged', () => {
  const hits = [makeHit('1', 0.8)];
  const out = applyRecencyWeight(hits, {
    dateMs: [NOW - 365 * DAY_MS],
    now: NOW,
    mixWeight: 0,
  });
  assert.equal(out[0]?.score, 0.8);
});

add('8) mixWeight=1 → factor 直接適用', () => {
  const hits = [makeHit('1', 0.8)];
  // ageDays=90, factor=0.5, mixWeight=1
  // score_new = 0.8 * (1 - 1 * (1 - 0.5)) = 0.8 * 0.5 = 0.4
  const out = applyRecencyWeight(hits, {
    dateMs: [NOW - 90 * DAY_MS],
    now: NOW,
    mixWeight: 1,
  });
  assert.ok(Math.abs((out[0]?.score ?? 0) - 0.4) < 1e-9);
});

/** 全テスト実行 (vitest / node:test / 直接呼び出し すべてに対応)。 */
export function runRecencyTests(): void {
  let failed = 0;
  for (const c of cases) {
    try {
      c.fn();
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
  it?: (label: string, fn: () => void) => void;
};
if (typeof g.describe === 'function' && typeof g.it === 'function') {
  g.describe('recency', () => {
    for (const c of cases) {
      g.it!(c.name, c.fn);
    }
  });
}
