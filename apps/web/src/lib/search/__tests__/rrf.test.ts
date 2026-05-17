/**
 * RRF (Reciprocal Rank Fusion) の決定的ユニットテスト。
 *
 * 設計判断:
 *   - apps/web には vitest が直接導入されていない (contacts.test.ts と同設計)。
 *   - node:assert/strict で自己完結。vitest からは globalThis.it/describe 経由で
 *     自動収集されるよう、両 API に互換する describe/it shim を提供する。
 *
 * テストケース (合計 8):
 *   1) 空入力 → 空 Map
 *   2) 1 ranking, 1 entry → 1/(60+1)
 *   3) 同じ id が 2 ranking 両方で 1 位 → 2/(60+1)
 *   4) 異なる id が複数 ranking に分散 → 個別合算
 *   5) k=10 にすると分子が変わる
 *   6) k=0 でも 1/rank (分母 = rank) で計算される
 *   7) invalid rank (0 / -1 / NaN) は skip
 *   8) rrfSorted は score 降順 / 同点は id 昇順で stable
 */
import assert from 'node:assert/strict';
import { RRF_K_DEFAULT, rrf, rrfMaxScore, rrfSorted } from '../rrf.js';

type Case = { name: string; fn: () => void };
const cases: Case[] = [];
const add = (name: string, fn: () => void) => cases.push({ name, fn });

add('1) empty input returns empty map', () => {
  const out = rrf([]);
  assert.equal(out.size, 0);
});

add('2) single ranking 1 entry rank=1 → 1/(60+1)', () => {
  const out = rrf([[{ id: 'a', rank: 1 }]]);
  assert.equal(out.size, 1);
  const v = out.get('a');
  assert.ok(v !== undefined);
  assert.equal(v, 1 / (60 + 1));
});

add('3) duplicate id top in 2 rankings → 2/(60+1)', () => {
  const out = rrf([[{ id: 'a', rank: 1 }], [{ id: 'a', rank: 1 }]]);
  assert.equal(out.get('a'), 2 / (60 + 1));
});

add('4) mixed rankings produce per-id sum', () => {
  const out = rrf([
    [
      { id: 'a', rank: 1 },
      { id: 'b', rank: 2 },
    ],
    [
      { id: 'b', rank: 1 },
      { id: 'c', rank: 3 },
    ],
  ]);
  // a: 1/(60+1)
  // b: 1/(60+2) + 1/(60+1)
  // c: 1/(60+3)
  const expectA = 1 / 61;
  const expectB = 1 / 62 + 1 / 61;
  const expectC = 1 / 63;
  assert.ok(Math.abs((out.get('a') ?? 0) - expectA) < 1e-12);
  assert.ok(Math.abs((out.get('b') ?? 0) - expectB) < 1e-12);
  assert.ok(Math.abs((out.get('c') ?? 0) - expectC) < 1e-12);
});

add('5) k=10 changes denominator', () => {
  const out = rrf([[{ id: 'a', rank: 1 }]], 10);
  assert.equal(out.get('a'), 1 / 11);
});

add('6) k=0 → 1/rank', () => {
  const out = rrf(
    [
      [
        { id: 'a', rank: 1 },
        { id: 'b', rank: 2 },
      ],
    ],
    0,
  );
  assert.equal(out.get('a'), 1);
  assert.equal(out.get('b'), 0.5);
});

add('7) invalid entries are skipped', () => {
  const out = rrf([
    [
      { id: '', rank: 1 },
      { id: 'a', rank: 0 },
      { id: 'a', rank: -1 },
      { id: 'a', rank: Number.NaN },
      { id: 'a', rank: 2 },
    ],
  ]);
  assert.equal(out.size, 1);
  assert.equal(out.get('a'), 1 / (60 + 2));
});

add('8) rrfSorted: desc score, ties broken by ascending id', () => {
  const scores = new Map<string, number>([
    ['z', 0.5],
    ['a', 0.5],
    ['m', 0.9],
  ]);
  const sorted = rrfSorted(scores);
  assert.deepEqual(
    sorted.map((s) => s.id),
    ['m', 'a', 'z'],
  );

  const max = rrfMaxScore(2, RRF_K_DEFAULT);
  assert.equal(max, 2 / 61);
});

/** 全テスト実行 (vitest / node:test / 直接呼び出し すべてに対応)。 */
export function runRrfTests(): void {
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

// vitest 自動収集 — `it` がグローバルにあれば登録する (型は any 扱い)。
const g = globalThis as unknown as {
  describe?: (label: string, body: () => void) => void;
  it?: (label: string, fn: () => void) => void;
};
if (typeof g.describe === 'function' && typeof g.it === 'function') {
  g.describe('rrf', () => {
    for (const c of cases) {
      g.it!(c.name, c.fn);
    }
  });
}

// 直接実行 (`tsx rrf.test.ts` 等) は呼び出し側で `runRrfTests()` を import して
// 起動する想定。ESM では require.main の判定ができないため自動起動は行わない。
