import { describe, expect, it } from 'vitest';
import {
  buildNameCompanyKey,
  normalizeCompany,
  normalizeEmail,
  normalizeName,
  normalizePhone,
} from '../lib/normalize.js';

/**
 * 名刺正規化の純関数テスト。
 *
 * 入力テーブルは「実運用で OCR が返してくる代表的なノイズ」を網羅する:
 *   - 全角英数 / 全角空白 / 改行 / タブ
 *   - 絵文字 / 不可視文字
 *   - 日本語の法人 prefix / suffix
 *   - 長文 / 空文字 / null / undefined
 */

describe('normalizeName', () => {
  const cases: Array<[unknown, string | null]> = [
    ['山田 太郎', '山田 太郎'],
    ['山田　太郎', '山田 太郎'], // 全角空白 -> 半角
    ['  山田  太郎  ', '山田 太郎'],
    ['Yamada Taro', 'Yamada Taro'],
    ['Ｙａｍａｄａ　Ｔａｒｏ', 'Yamada Taro'], // 全角英字 -> 半角
    ['山田\n太郎', '山田 太郎'],
    ['山田\t太郎', '山田 太郎'],
    ['山田太郎🎉', '山田太郎🎉'], // 絵文字保持
    ['', null],
    ['   ', null],
    ['\n\t\r', null],
    [null, null],
    [undefined, null],
    [123 as unknown as string, null], // 非文字列入力
    ['John   Smith', 'John Smith'],
    ['佐藤  花子', '佐藤 花子'],
    ['李  小龍', '李 小龍'],
    ['ＡＢＣ１２３', 'ABC123'], // 全角英数 NFKC 正規化
    ['山田', '山田'],
    ['A', 'A'],
    ['A'.repeat(120), 'A'.repeat(120)], // 長文
  ];

  for (const [input, expected] of cases) {
    it(`normalizeName(${JSON.stringify(input)}) -> ${JSON.stringify(expected)}`, () => {
      expect(normalizeName(input as string | null | undefined)).toBe(expected);
    });
  }
});

describe('normalizeEmail', () => {
  const cases: Array<[unknown, string | null]> = [
    ['foo@example.com', 'foo@example.com'],
    ['FOO@EXAMPLE.COM', 'foo@example.com'],
    ['  foo@example.com  ', 'foo@example.com'],
    ['Foo@Example.Co.JP', 'foo@example.co.jp'],
    ['ｆｏｏ＠ｅｘａｍｐｌｅ．ｃｏｍ', 'foo@example.com'], // 全角英字
    ['foo @example.com', 'foo@example.com'], // 内部空白除去
    ['foo\t@example.com', 'foo@example.com'],
    ['', null],
    [null, null],
    [undefined, null],
    ['   ', null],
    ['User+tag@Example.com', 'user+tag@example.com'],
    ['user.name@sub.example.co.jp', 'user.name@sub.example.co.jp'],
    [123 as unknown as string, null],
    ['no-at-sign', 'no-at-sign'], // 形式チェックはここではしない
    ['Ｕｓｅｒ@Example.com', 'user@example.com'],
  ];

  for (const [input, expected] of cases) {
    it(`normalizeEmail(${JSON.stringify(input)}) -> ${JSON.stringify(expected)}`, () => {
      expect(normalizeEmail(input as string | null | undefined)).toBe(expected);
    });
  }
});

describe('normalizePhone', () => {
  const cases: Array<[unknown, string | null]> = [
    ['03-1234-5678', '+81312345678'],
    ['0312345678', '+81312345678'],
    ['+81 3 1234 5678', '+81312345678'],
    ['+81-3-1234-5678', '+81312345678'],
    ['０３-１２３４-５６７８', '+81312345678'], // 全角数字
    ['(03) 1234-5678', '+81312345678'],
    ['+1 (415) 555-1234', '+14155551234'],
    ['090-1234-5678', '+819012345678'],
    ['', null],
    [null, null],
    [undefined, null],
    ['1', null], // 短すぎる
    ['ab', null],
    ['abc', null],
    [123 as unknown as string, null],
    ['81 3 1234 5678', '+81312345678'], // 0 でも + でもない → + を付与
    ['+44 20 7946 0958', '+442079460958'],
    ['+81(0)3-1234-5678', '+810312345678'], // 括弧内 0 も数字として保持 (簡易実装)
  ];

  for (const [input, expected] of cases) {
    it(`normalizePhone(${JSON.stringify(input)}) -> ${JSON.stringify(expected)}`, () => {
      expect(normalizePhone(input as string | null | undefined)).toBe(expected);
    });
  }
});

describe('normalizeCompany', () => {
  const cases: Array<[unknown, string | null]> = [
    ['株式会社ナレッジさん', 'ナレッジさん'],
    ['ナレッジさん株式会社', 'ナレッジさん'],
    ['ナレッジさん(株)', 'ナレッジさん'],
    ['ナレッジさん（株）', 'ナレッジさん'],
    ['有限会社ABC', 'ABC'],
    ['ABC Inc.', 'ABC'],
    ['ABC Inc', 'ABC'],
    ['ABC Ltd.', 'ABC'],
    ['ABC Co., Ltd.', 'ABC'],
    ['Acme Corporation', 'Acme'],
    ['  株式会社  Foo  ', 'Foo'],
    ['', null],
    [null, null],
    [undefined, null],
    [123 as unknown as string, null],
    ['合同会社ABC', 'ABC'],
    ['Bar LLC', 'Bar'],
    ['Bar K.K.', 'Bar'],
    ['NPO法人 さくら', 'さくら'],
    ['普通の会社名', '普通の会社名'], // suffix なし
    ['Plain Co', 'Plain Co'], // 'Co' だけは suffix 扱いしない
  ];

  for (const [input, expected] of cases) {
    it(`normalizeCompany(${JSON.stringify(input)}) -> ${JSON.stringify(expected)}`, () => {
      expect(normalizeCompany(input as string | null | undefined)).toBe(expected);
    });
  }
});

describe('buildNameCompanyKey', () => {
  it('returns null when both null', () => {
    expect(buildNameCompanyKey(null, null)).toBeNull();
  });

  it('handles name only', () => {
    expect(buildNameCompanyKey('山田 太郎', null)).toBe('山田 太郎|');
  });

  it('handles company only', () => {
    expect(buildNameCompanyKey(null, '株式会社Foo')).toBe('|foo');
  });

  it('uses lower-cased company', () => {
    expect(buildNameCompanyKey('Yamada', 'ABC Inc.')).toBe('yamada|abc');
  });

  it('treats 株式会社X and X as same key', () => {
    const a = buildNameCompanyKey('山田 太郎', '株式会社ABC');
    const b = buildNameCompanyKey('山田 太郎', 'ABC');
    expect(a).toBe(b);
  });
});
