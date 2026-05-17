import { describe, expect, it } from 'vitest';
import {
  type DedupeCandidate,
  MATCH_WEIGHTS,
  findDuplicates,
  scoreCandidate,
} from '../lib/dedupe.js';

/**
 * dedupe スコアリングの境界値テスト。
 *
 * 設計確認:
 *   - max ベースで score を取る (相加平均ではない)
 *   - 一致フィールド 0 件なら score=0 / matchFields=[]
 *   - image_hash の有無で大小関係が正しく動く
 *   - 正規化前の email/phone でも一致を取れる (内部で再正規化)
 */

function base(): DedupeCandidate {
  return {
    contactId: 'c-new',
    name: null,
    companyName: null,
    email: null,
    phone: null,
    linkedinUrl: null,
    businessCardImageHash: null,
  };
}

describe('scoreCandidate (15 boundary cases)', () => {
  it('1) no fields → score 0', () => {
    const r = scoreCandidate(base(), { ...base(), contactId: 'c-old' });
    expect(r.score).toBe(0);
    expect(r.matchFields).toEqual([]);
  });

  it('2) same image_hash → score 1.0', () => {
    const a: DedupeCandidate = { ...base(), businessCardImageHash: 'h1' };
    const b: DedupeCandidate = {
      ...base(),
      contactId: 'c-old',
      businessCardImageHash: 'h1',
    };
    const r = scoreCandidate(a, b);
    expect(r.matchFields).toContain('image_hash');
    expect(r.score).toBe(MATCH_WEIGHTS.image_hash);
  });

  it('3) different image_hash → score 0', () => {
    const r = scoreCandidate(
      { ...base(), businessCardImageHash: 'h1' },
      { ...base(), contactId: 'c-old', businessCardImageHash: 'h2' },
    );
    expect(r.score).toBe(0);
  });

  it('4) same email different case → matches', () => {
    const r = scoreCandidate(
      { ...base(), email: 'Foo@Example.COM' },
      { ...base(), contactId: 'c-old', email: 'foo@example.com' },
    );
    expect(r.matchFields).toContain('email');
    expect(r.score).toBe(MATCH_WEIGHTS.email);
  });

  it('5) same phone with hyphen vs without → matches', () => {
    const r = scoreCandidate(
      { ...base(), phone: '03-1234-5678' },
      { ...base(), contactId: 'c-old', phone: '0312345678' },
    );
    expect(r.matchFields).toContain('phone');
    expect(r.score).toBe(MATCH_WEIGHTS.phone);
  });

  it('6) email + phone both match → max = email weight (not sum)', () => {
    const r = scoreCandidate(
      { ...base(), email: 'a@b.com', phone: '0311112222' },
      {
        ...base(),
        contactId: 'c-old',
        email: 'a@b.com',
        phone: '0311112222',
      },
    );
    expect(r.matchFields.sort()).toEqual(['email', 'phone']);
    // 加算ではない: 0.9 + 0.8 != score
    expect(r.score).toBe(MATCH_WEIGHTS.email);
    expect(r.score).toBeLessThan(MATCH_WEIGHTS.email + MATCH_WEIGHTS.phone);
  });

  it('7) image_hash + email + phone → image_hash dominates (1.0)', () => {
    const r = scoreCandidate(
      {
        ...base(),
        businessCardImageHash: 'h',
        email: 'a@b.com',
        phone: '0311112222',
      },
      {
        ...base(),
        contactId: 'c-old',
        businessCardImageHash: 'h',
        email: 'a@b.com',
        phone: '0311112222',
      },
    );
    expect(r.score).toBe(1.0);
    expect(r.matchFields).toContain('image_hash');
  });

  it('8) linkedin url normalization (trailing slash, www, case)', () => {
    const r = scoreCandidate(
      { ...base(), linkedinUrl: 'https://www.linkedin.com/in/Foo/' },
      {
        ...base(),
        contactId: 'c-old',
        linkedinUrl: 'http://linkedin.com/in/foo',
      },
    );
    expect(r.matchFields).toContain('linkedin');
    expect(r.score).toBe(MATCH_WEIGHTS.linkedin);
  });

  it('9) name+company match → 0.7', () => {
    const r = scoreCandidate(
      { ...base(), name: '山田 太郎', companyName: '株式会社ABC' },
      {
        ...base(),
        contactId: 'c-old',
        name: '山田 太郎',
        companyName: 'ABC',
      },
    );
    expect(r.matchFields).toContain('name_company');
    expect(r.score).toBe(MATCH_WEIGHTS.name_company);
  });

  it('10) only name matches but company differs → not matched', () => {
    const r = scoreCandidate(
      { ...base(), name: '山田 太郎', companyName: 'X' },
      {
        ...base(),
        contactId: 'c-old',
        name: '山田 太郎',
        companyName: 'Y',
      },
    );
    // key は "山田 太郎|x" vs "山田 太郎|y" で異なるのでマッチしない
    expect(r.matchFields).not.toContain('name_company');
  });

  it('11) both name/company null → no name_company match', () => {
    const r = scoreCandidate(base(), { ...base(), contactId: 'c-old' });
    expect(r.matchFields).toEqual([]);
  });

  it('12) phone with full-width digits matches half-width', () => {
    const r = scoreCandidate(
      { ...base(), phone: '０３-１２３４-５６７８' },
      { ...base(), contactId: 'c-old', phone: '03-1234-5678' },
    );
    expect(r.matchFields).toContain('phone');
  });

  it('13) self-match excluded by findDuplicates contactId guard', () => {
    const newC: DedupeCandidate = { ...base(), email: 'a@b.com' };
    const results = findDuplicates(newC, [
      { ...newC }, // 同じ contactId
    ]);
    expect(results.length).toBe(0);
  });

  it('14) findDuplicates returns sorted by score desc', () => {
    const newC: DedupeCandidate = {
      ...base(),
      email: 'a@b.com',
      phone: '0311112222',
      businessCardImageHash: 'h',
    };
    const results = findDuplicates(newC, [
      {
        ...base(),
        contactId: 'low',
        phone: '0311112222', // 0.8
      },
      {
        ...base(),
        contactId: 'mid',
        email: 'a@b.com', // 0.9
      },
      {
        ...base(),
        contactId: 'high',
        businessCardImageHash: 'h', // 1.0
      },
    ]);
    expect(results.length).toBe(3);
    expect(results[0]?.contactId).toBe('high');
    expect(results[1]?.contactId).toBe('mid');
    expect(results[2]?.contactId).toBe('low');
  });

  it('15) threshold filters out weak (linkedin-only on different urls)', () => {
    const newC: DedupeCandidate = {
      ...base(),
      linkedinUrl: 'https://linkedin.com/in/a',
    };
    // 違う linkedin url → 一致なし → そもそも候補にならない
    const results = findDuplicates(newC, [
      {
        ...base(),
        contactId: 'c-old',
        linkedinUrl: 'https://linkedin.com/in/b',
      },
    ]);
    expect(results.length).toBe(0);
  });
});
