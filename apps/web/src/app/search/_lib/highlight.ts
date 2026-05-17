/**
 * 検索クエリのハイライト用 — 純関数ユーティリティ。
 *
 * 既存 page.tsx の inline 実装を抽出して再利用可能にしたもの。
 * Server / Client 双方から呼べる (React に依存しない)。
 *
 * Phase 2 メモ:
 *  - tokenize は kuromoji 等の形態素解析を入れず、簡易区切り + 表記揺れ吸収のみ。
 *  - 1文字クエリ ("A", "等") も拾うため min length は 1 に下げてある。
 *  - 全角空白 (U+3000) を含むセパレータ群で分割。
 */

/**
 * 入力クエリを検索ハイライト用語のリストに分解する。
 *
 * 区切り: 半角/全角空白、句読点、引用符、括弧、スラッシュ、感嘆符、疑問符 等。
 * 重複除去 (大文字小文字は区別せず 1 度だけ保持)。
 */
export function tokenizeQuery(q: string): string[] {
  if (!q) return [];
  const raw = q
    .split(/[\s　、。「」『』"'?!？！,.\\/()（）【】［］\[\]:：;；]+/u)
    .map((t) => t.trim())
    .filter((t) => t.length >= 1);
  // 同じ語 (小文字基準) を 1 度だけ採用。先勝ち。
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of raw) {
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

/**
 * tokenize 済み terms から RegExp を構築。`null` は「ハイライト対象なし」。
 *
 * - 各 term を正規表現メタ文字エスケープ
 * - case-insensitive (Unicode 化)
 * - 長い term を先に並べる (前方マッチ優先)
 */
export function buildHighlightRegex(terms: string[]): RegExp | null {
  if (terms.length === 0) return null;
  const escaped = terms
    .slice()
    .sort((a, b) => b.length - a.length)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`(${escaped.join('|')})`, 'giu');
}

/**
 * tokenize 結果から「マッチ判定用の小文字 Set」を作るヘルパ。
 * React 側の split + key 判定で使う。
 */
export function buildTermSet(terms: string[]): Set<string> {
  return new Set(terms.map((t) => t.toLowerCase()));
}

export type HighlightSegment = { kind: 'plain'; text: string } | { kind: 'match'; text: string };

/**
 * フレームワーク非依存のセグメント分割。
 * React で使う側は `match` を `<mark>` に、`plain` を素のテキストに描画する。
 */
export function splitHighlight(
  text: string,
  re: RegExp | null,
  termSet: Set<string>,
): HighlightSegment[] {
  if (!re || termSet.size === 0 || !text) {
    return [{ kind: 'plain', text }];
  }
  const parts = text.split(re);
  return parts
    .filter((p) => p !== '')
    .map((p) =>
      termSet.has(p.toLowerCase())
        ? ({ kind: 'match', text: p } as const)
        : ({ kind: 'plain', text: p } as const),
    );
}
