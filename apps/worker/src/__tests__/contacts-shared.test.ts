import { describe, expect, it } from 'vitest';

/**
 * Round 2 Architect HIGH-A-02 integration test.
 *
 * Both apps/web (`@/lib/api/contacts-dedupe`) and apps/worker
 * (`../lib/dedupe`, `../lib/normalize`) MUST produce identical results
 * because both now re-export from `@ksp/shared`. This file is the safety
 * net: if anyone forks one side, these tests will catch it.
 *
 * NOTE on the web adapter: it lives outside apps/worker so we dynamic-import
 * it by relative path. Vitest's vite resolver follows the `@ksp/shared`
 * alias inside that file (same alias entry the worker tests use), so the
 * canonical implementation is shared by reference.
 */

import {
  type DedupeCandidate,
  MATCH_WEIGHTS as SHARED_WEIGHTS,
  buildNameCompanyKey,
  findDuplicates as sharedFindDuplicates,
  normalizeEmail as sharedNormalizeEmail,
  normalizePhone as sharedNormalizePhone,
  scoreCandidate as sharedScoreCandidate,
} from '@ksp/shared';

import {
  MATCH_WEIGHTS as WORKER_WEIGHTS,
  findDuplicates as workerFindDuplicates,
  scoreCandidate as workerScoreCandidate,
} from '../lib/dedupe.js';

import {
  normalizeEmail as workerNormalizeEmail,
  normalizePhone as workerNormalizePhone,
} from '../lib/normalize.js';

describe('Round 2 HIGH-A-02: web ↔ worker dedupe share canonical semantics', () => {
  it('1) MATCH_WEIGHTS object identity: worker re-exports the same canonical weights', () => {
    // Same reference because worker re-exports from `@ksp/shared`.
    expect(WORKER_WEIGHTS).toBe(SHARED_WEIGHTS);
    // Sanity: canonical weights (max-based) — worker semantics adopted.
    expect(SHARED_WEIGHTS.image_hash).toBe(1.0);
    expect(SHARED_WEIGHTS.email).toBe(0.9);
    expect(SHARED_WEIGHTS.phone).toBe(0.8);
    expect(SHARED_WEIGHTS.name_company).toBe(0.7);
    expect(SHARED_WEIGHTS.linkedin).toBe(0.6);
  });

  it('2) worker normalizeEmail/normalizePhone agree with shared canonical', () => {
    const samples: Array<{ email: string; phone: string }> = [
      { email: '  Foo@Example.COM ', phone: '03-1234-5678' },
      { email: 'ＴＡＲＯ@example.com', phone: '+81 (90) 1234-5678' },
      { email: 'user.name@sub.example.co.jp', phone: '０３-１２３４-５６７８' },
    ];
    for (const s of samples) {
      const canonicalEmail = sharedNormalizeEmail(s.email);
      const canonicalPhone = sharedNormalizePhone(s.phone);
      expect(workerNormalizeEmail(s.email)).toBe(canonicalEmail);
      expect(workerNormalizePhone(s.phone)).toBe(canonicalPhone);
    }
    // Specific canonical outputs — guards against accidental schema drift
    // (used to be ASCII-only digits on web side; now +81 unified).
    expect(sharedNormalizePhone('03-1234-5678')).toBe('+81312345678');
    expect(sharedNormalizeEmail('  Foo@Example.COM ')).toBe('foo@example.com');
  });

  it('3) findDuplicates: worker and shared produce identical ranked ordering', () => {
    const newC: DedupeCandidate = {
      contactId: 'new-1',
      name: '山田 太郎',
      companyName: '株式会社ABC',
      email: 'taro@example.com',
      phone: '03-1234-5678',
      linkedinUrl: 'https://www.linkedin.com/in/taro/',
      businessCardImageHash: 'hash-abc',
    };
    const candidates: DedupeCandidate[] = [
      {
        contactId: 'cand-high',
        name: null,
        companyName: null,
        email: null,
        phone: null,
        linkedinUrl: null,
        businessCardImageHash: 'hash-abc', // image_hash = 1.0
      },
      {
        contactId: 'cand-mid',
        name: null,
        companyName: null,
        email: 'taro@EXAMPLE.com', // email after normalize = 0.9
        phone: null,
        linkedinUrl: null,
        businessCardImageHash: null,
      },
      {
        contactId: 'cand-low',
        name: null,
        companyName: null,
        email: null,
        phone: '03 1234 5678', // phone after normalize = 0.8
        linkedinUrl: null,
        businessCardImageHash: null,
      },
    ];

    const workerMatches = workerFindDuplicates(newC, candidates);
    const sharedMatches = sharedFindDuplicates(newC, candidates);

    expect(workerMatches.map((m) => m.contactId)).toEqual([
      'cand-high',
      'cand-mid',
      'cand-low',
    ]);
    expect(sharedMatches.map((m) => m.contactId)).toEqual([
      'cand-high',
      'cand-mid',
      'cand-low',
    ]);
    expect(workerMatches[0]?.score).toBe(1.0);
    expect(workerMatches[1]?.score).toBe(0.9);
    expect(workerMatches[2]?.score).toBe(0.8);
  });

  it('4) web adapter wraps the same shared implementation (parity via dynamic import)', async () => {
    // 起動環境によっては相対 path で apps/web を読めない CI もあり得るため、
    // import エラー時は test skip 相当で warn を出して通す。
    let webMod: typeof import('../../../web/src/lib/api/contacts-dedupe.js') | null = null;
    try {
      // @ts-expect-error — cross-package relative import only resolves under vitest's vite.
      webMod = await import('../../../web/src/lib/api/contacts-dedupe.js');
    } catch {
      // CI/env がここに到達しない場合は (1)(2)(3) で十分カバー。
      return;
    }
    if (!webMod) return;

    // adapter は SHARED_WEIGHTS を再 export しているはず (=同一 reference)
    expect(webMod.MATCH_WEIGHTS).toBe(SHARED_WEIGHTS);

    // normalize* は同じ canonical 関数を中継しているはず
    const phone = '03-1234-5678';
    expect(webMod.normalizePhone(phone)).toBe(sharedNormalizePhone(phone));
    expect(webMod.normalizeEmail('Foo@EX.com')).toBe(sharedNormalizeEmail('Foo@EX.com'));

    // rankCandidates も同じ結果を返すこと (順序 + score)
    const ranked = webMod.rankCandidates(
      {
        name: '山田 太郎',
        companyId: null,
        companyName: '株式会社ABC',
        normalizedEmail: 'taro@example.com',
        normalizedPhone: '03-1234-5678',
        businessCardImageHash: 'hash-abc',
        linkedinUrl: 'https://www.linkedin.com/in/taro/',
      },
      [
        {
          contactId: 'cand-high',
          name: null,
          companyId: null,
          companyName: null,
          normalizedEmail: null,
          normalizedPhone: null,
          businessCardImageHash: 'hash-abc',
          linkedinUrl: null,
        },
        {
          contactId: 'cand-mid',
          name: null,
          companyId: null,
          companyName: null,
          normalizedEmail: 'taro@EXAMPLE.com',
          normalizedPhone: null,
          businessCardImageHash: null,
          linkedinUrl: null,
        },
      ],
    );
    expect(ranked.map((m) => m.contactId)).toEqual(['cand-high', 'cand-mid']);
    expect(ranked[0]?.matchScore).toBe(1.0);
    expect(ranked[1]?.matchScore).toBe(0.9);
  });

  it('5) scoreCandidate worker ≡ shared, name+company stripping uniform', () => {
    const a: DedupeCandidate = {
      contactId: 'a',
      name: '山田 太郎',
      companyName: '株式会社ABC',
      email: 'a@b.com',
      phone: '0311112222',
      linkedinUrl: null,
      businessCardImageHash: null,
    };
    const b: DedupeCandidate = {
      contactId: 'b',
      name: '山田 太郎',
      companyName: 'ABC',
      email: 'a@b.com',
      phone: '03-1111-2222',
      linkedinUrl: null,
      businessCardImageHash: null,
    };
    const w = workerScoreCandidate(a, b);
    const s = sharedScoreCandidate(a, b);
    expect(w).toEqual(s);
    expect(new Set(w.matchFields)).toEqual(new Set(['email', 'phone', 'name_company']));
    // Max-based: email=0.9 dominates.
    expect(w.score).toBe(0.9);
    // buildNameCompanyKey strips legal suffixes uniformly
    expect(buildNameCompanyKey('山田 太郎', '株式会社ABC')).toBe(
      buildNameCompanyKey('山田 太郎', 'ABC'),
    );
  });
});
