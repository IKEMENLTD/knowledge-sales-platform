/**
 * contacts API 内部で使う純関数 (normalize / scoreMatch / rankCandidates) の
 * unit テスト。
 *
 * 設計判断:
 *   - apps/web には vitest 依存が無いため、本ファイルは vitest API に依存せず
 *     `assert` のみで自己完結させる。
 *   - export された `runContactsTests()` を呼べばどの実行系 (vitest, node --test,
 *     直接 import) でも全テストを起動できる。
 *   - vitest が将来 web に追加された際は、`if (import.meta.vitest)` 経由で
 *     `describe` / `it` を遅延 import するだけで体裁を整えられる。
 */
import assert from 'node:assert/strict';
import {
  type DedupeCandidateInput,
  type DedupeQueryInput,
  MATCH_WEIGHTS,
  evaluateMatch,
  normalizeEmail,
  normalizeName,
  normalizePhone,
  rankCandidates,
  scoreMatch,
} from '../contacts-dedupe.js';

type TestFn = () => void;
const tests: Array<{ name: string; fn: TestFn }> = [];
const test = (name: string, fn: TestFn) => tests.push({ name, fn });

// ----- normalize* -----

test('normalizeEmail trims and lowercases', () => {
  assert.equal(normalizeEmail('  Foo@Example.COM '), 'foo@example.com');
  assert.equal(normalizeEmail(''), null);
  assert.equal(normalizeEmail(null), null);
  assert.equal(normalizeEmail(undefined), null);
});

test('normalizePhone normalizes to +CC form (Round 2: canonical)', () => {
  // worker semantics: domestic JP → +81 prefix
  assert.equal(normalizePhone('+81 (90) 1234-5678'), '+819012345678');
  assert.equal(normalizePhone('03-1234-5678'), '+81312345678');
  assert.equal(normalizePhone('---'), null);
  assert.equal(normalizePhone(null), null);
});

test('normalizeName collapses whitespace + NFKC, preserves case', () => {
  assert.equal(normalizeName('  山田  太郎  '), '山田 太郎');
  // NFKC で全角→半角に。canonical 実装は case を維持する。
  assert.equal(normalizeName('ＴＡＲＯ'), 'TARO');
  assert.equal(normalizeName(''), null);
});

// ----- scoreMatch -----

test('scoreMatch returns 0 for empty fields', () => {
  assert.equal(scoreMatch([]), 0);
});

test('scoreMatch returns image_hash weight for hash-only match', () => {
  assert.equal(scoreMatch(['image_hash']), MATCH_WEIGHTS.image_hash);
});

test('scoreMatch is max-based (Round 2 canonical): multiple fields = max weight', () => {
  // canonical 実装は max ベース (additive ではない)。同点を許容。
  const single = scoreMatch(['email']);
  const dual = scoreMatch(['email', 'phone']);
  assert.ok(dual >= single, 'dual match must be >= single (max-based)');
  assert.equal(dual, MATCH_WEIGHTS.email);
  assert.ok(dual <= 1);
});

test('scoreMatch caps at 1', () => {
  const all = scoreMatch(['image_hash', 'email', 'phone', 'linkedin', 'name_company']);
  assert.equal(all, 1);
});

// ----- evaluateMatch -----

const baseQuery: DedupeQueryInput = {
  name: '山田 太郎',
  companyId: 'cmp-1',
  normalizedEmail: 'taro@example.com',
  normalizedPhone: '09012345678',
  businessCardImageHash: 'a'.repeat(64),
  linkedinUrl: 'https://linkedin.com/in/taro',
};

test('evaluateMatch returns null when no fields match', () => {
  const cand: DedupeCandidateInput = {
    contactId: 'c1',
    name: '別人',
    companyId: 'cmp-99',
    normalizedEmail: 'other@example.com',
    normalizedPhone: '08000000000',
    businessCardImageHash: 'b'.repeat(64),
    linkedinUrl: 'https://linkedin.com/in/other',
  };
  assert.equal(evaluateMatch(baseQuery, cand), null);
});

test('evaluateMatch detects image_hash hit', () => {
  const cand: DedupeCandidateInput = {
    contactId: 'c2',
    name: null,
    companyId: null,
    normalizedEmail: null,
    normalizedPhone: null,
    businessCardImageHash: 'a'.repeat(64),
    linkedinUrl: null,
  };
  const m = evaluateMatch(baseQuery, cand);
  assert.ok(m, 'must match');
  assert.deepEqual(m?.matchFields, ['image_hash']);
});

test('evaluateMatch detects email + phone hits', () => {
  const cand: DedupeCandidateInput = {
    contactId: 'c3',
    name: null,
    companyId: null,
    normalizedEmail: 'taro@example.com',
    normalizedPhone: '09012345678',
    businessCardImageHash: null,
    linkedinUrl: null,
  };
  const m = evaluateMatch(baseQuery, cand);
  assert.ok(m);
  assert.ok(m!.matchFields.includes('email'));
  assert.ok(m!.matchFields.includes('phone'));
});

test('evaluateMatch requires both companyId and name for name_company', () => {
  const sameCompanyOnly: DedupeCandidateInput = {
    contactId: 'c4',
    name: '別人',
    companyId: 'cmp-1',
    normalizedEmail: null,
    normalizedPhone: null,
    businessCardImageHash: null,
    linkedinUrl: null,
  };
  assert.equal(evaluateMatch(baseQuery, sameCompanyOnly), null);

  const sameBoth: DedupeCandidateInput = {
    ...sameCompanyOnly,
    name: '山田 太郎',
  };
  const m = evaluateMatch(baseQuery, sameBoth);
  assert.ok(m);
  assert.deepEqual(m?.matchFields, ['name_company']);
});

// ----- rankCandidates -----

test('rankCandidates orders by score descending', () => {
  const candidates: DedupeCandidateInput[] = [
    {
      contactId: 'weak',
      name: '山田 太郎',
      companyId: 'cmp-1',
      normalizedEmail: null,
      normalizedPhone: null,
      businessCardImageHash: null,
      linkedinUrl: null,
    },
    {
      contactId: 'strong',
      name: null,
      companyId: null,
      normalizedEmail: 'taro@example.com',
      normalizedPhone: '09012345678',
      businessCardImageHash: 'a'.repeat(64),
      linkedinUrl: null,
    },
    {
      contactId: 'noop',
      name: 'X',
      companyId: 'cmp-99',
      normalizedEmail: null,
      normalizedPhone: null,
      businessCardImageHash: null,
      linkedinUrl: null,
    },
  ];
  const ranked = rankCandidates(baseQuery, candidates);
  assert.equal(ranked.length, 2, 'noop is excluded');
  assert.equal(ranked[0]?.contactId, 'strong');
  assert.equal(ranked[1]?.contactId, 'weak');
});

/** すべての test を順に実行。失敗時は throw。 */
export function runContactsTests(): { passed: number; failed: number } {
  let passed = 0;
  let failed = 0;
  for (const t of tests) {
    try {
      t.fn();
      passed += 1;
    } catch (err) {
      failed += 1;
      // logger は web 側に無いので、テスト失敗時のみ標準エラーへ。
      // biome-ignore lint/suspicious/noConsole: テスト harness の最終出口。
      console.error(`[contacts.test] FAIL: ${t.name}\n`, err);
    }
  }
  return { passed, failed };
}

// `node --import tsx apps/web/src/lib/api/__tests__/contacts.test.ts` で直接実行可能。
// ESM の import.meta.url を main module 判定に使う。
if (
  typeof process !== 'undefined' &&
  process.argv[1] &&
  import.meta.url === new URL(process.argv[1], 'file:').href
) {
  const { passed, failed } = runContactsTests();
  // biome-ignore lint/suspicious/noConsole: CLI harness 出力。
  console.log(`contacts.test: ${passed} passed / ${failed} failed`);
  if (failed > 0) process.exit(1);
}
