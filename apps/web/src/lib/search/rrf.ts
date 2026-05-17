/**
 * Reciprocal Rank Fusion (RRF) — vector / BM25 のように尺度が異なる
 * ランキング結果を 1 本に統合するシンプルかつ堅牢なアルゴリズム。
 *
 * 参考:
 *   Cormack et al. 2009, "Reciprocal Rank Fusion outperforms Condorcet and
 *   individual rank learning methods" (SIGIR'09). k=60 が経験的にロバスト
 *   (k が小さすぎると上位だけが効きすぎ、大きすぎると全部フラットになる)。
 *
 * 仕様:
 *   - 入力: ランキング配列の配列 (各 ranking は id と rank=1..N の昇順)
 *   - 出力: id -> 合算スコア (大きいほど上位)。score = Σ 1/(k + rank)
 *   - rank は 1-based。0 は invalid (caller の責務)。
 *   - id が複数のランキングに登場した場合は単純合算される (これが RRF の利点)。
 *
 * 純粋関数 (副作用なし)。テストしやすいよう Date/Math.random 等は触らない。
 */

export const RRF_K_DEFAULT = 60 as const;

export interface RrfEntry {
  id: string;
  rank: number;
}

/**
 * 複数ランキングを RRF で統合する。
 *
 * @param rankings 各 source からの 1-based ランキング配列。空配列許容。
 * @param k        Reciprocal の bias 定数。default 60 (Cormack 2009)。
 * @returns        id -> 合算 RRF score。降順ソートは呼び出し側で実施。
 */
export function rrf(rankings: RrfEntry[][], k: number = RRF_K_DEFAULT): Map<string, number> {
  const result = new Map<string, number>();
  if (!Number.isFinite(k) || k < 0) {
    throw new RangeError(`rrf: k must be a non-negative finite number, got ${k}`);
  }

  for (const ranking of rankings) {
    if (!Array.isArray(ranking)) continue;
    for (const entry of ranking) {
      if (!entry || typeof entry.id !== 'string' || entry.id.length === 0) continue;
      if (!Number.isFinite(entry.rank) || entry.rank < 1) continue;
      const inc = 1 / (k + entry.rank);
      const prev = result.get(entry.id);
      result.set(entry.id, (prev ?? 0) + inc);
    }
  }
  return result;
}

/**
 * RRF Map を score 降順に変換するヘルパ。同 score は id 昇順で安定化。
 */
export function rrfSorted(scores: Map<string, number>): Array<{ id: string; score: number }> {
  const arr = Array.from(scores, ([id, score]) => ({ id, score }));
  arr.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return arr;
}

/**
 * RRF の理論的最大スコア (id が全ランキングの 1 位だった場合)。
 * 結果スコアを [0,1] に正規化したい時の分母として使う。
 */
export function rrfMaxScore(sources: number, k: number = RRF_K_DEFAULT): number {
  if (sources <= 0) return 0;
  return sources / (k + 1);
}
