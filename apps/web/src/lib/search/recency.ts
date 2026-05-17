/**
 * Recency 重み — 18_search_knowledge_quality.md `BM25+vector+recency 重み 0.4/0.4/0.2`。
 *
 * 役割:
 *   - 各 hit に紐づく createdAt / scheduledAt から age (days) を出し、半減期 90 日の
 *     指数減衰で重みを乗算する: `weight = 0.5 ** (ageDays / halfLifeDays)`
 *   - score を boost した SearchHit[] を返す (元配列は変更しない pure function)
 *
 * 設計判断:
 *   - SearchHit zod schema は触らない (packages/shared/src/search.ts は確定 — 編集禁止)
 *   - 代わりに「dateMs」を別チャネル (parallel input) で受け取れる API にする。
 *     呼出元 (api/search/route.ts) は recording.meeting.scheduled_at / meeting.scheduled_at /
 *     contact.created_at などを ms にして渡す。
 *   - dateMs が無い hit は **boost なし** (score は元のまま) で通す。
 *   - 純関数のため Date.now() を直接呼ばず、現在時刻も引数で受け取れるオプションを用意
 *     (テスト容易性 — rrf.ts と同じ規約)。
 *
 * しきい値:
 *   - halfLifeDays=90 (3 ヶ月) — 商談 / 録画の鮮度の目安として spec が示唆。
 *   - 0.5 ** (ageDays/90) = 1.0 (今日), 0.5 (90日), 0.25 (180日), 0.0625 (360日)
 *   - **未来日 (ageDays<0) は重み 1.0 にクランプ** (録画なのに先付け日付 ≠ 鮮度上昇)
 *
 * spec の重み 0.4/0.4/0.2 とは ratio が違うが、ここで掛けるのは "boost 係数" であり
 * 線形 weighted sum ではないため意味が違う。score へのインパクトは:
 *   score_new = score * (1 - recencyWeight) + score * recencyWeight * recencyFactor
 *             = score * (1 - recencyWeight * (1 - recencyFactor))
 * のように "mix" するのが正しい。これを `mixWeight` (default 0.2) で実装する。
 */

import type { SearchHit } from '@ksp/shared';

export const DEFAULT_HALF_LIFE_DAYS = 90 as const;
/** spec の recency 重み 0.2 (BM25 0.4 / vector 0.4 / recency 0.2)。 */
export const DEFAULT_RECENCY_MIX_WEIGHT = 0.2 as const;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface RecencyOptions {
  /** 半減期 (日)。default 90。 */
  halfLifeDays?: number;
  /** spec 18 の recency 重み (0..1)。default 0.2。 */
  mixWeight?: number;
  /** "今" の epoch ms。テスト容易性のため注入可能。 */
  now?: number;
  /**
   * 各 hit に対応する dateMs 配列 (hits と同じ長さ・順序)。
   * dateMs[i] が undefined / null / 不正値なら i 番目 hit は boost されない。
   */
  dateMs: Array<number | null | undefined>;
}

/**
 * recency boost を適用した SearchHit[] を返す (元 hits は不変)。
 *
 * **副作用なし**。dateMs の数が hits の数と合わない場合は短い側に合わせる
 * (足りない hit は dateMs=undefined 扱いで boost なし)。
 *
 * @param hits SearchHit[] (RRF 直後 を想定)
 * @param options halfLifeDays / mixWeight / now / dateMs
 */
export function applyRecencyWeight(hits: SearchHit[], options: RecencyOptions): SearchHit[] {
  const halfLifeDays =
    typeof options.halfLifeDays === 'number' && options.halfLifeDays > 0
      ? options.halfLifeDays
      : DEFAULT_HALF_LIFE_DAYS;
  const mixWeight = clamp01(
    typeof options.mixWeight === 'number' ? options.mixWeight : DEFAULT_RECENCY_MIX_WEIGHT,
  );
  const now =
    typeof options.now === 'number' && Number.isFinite(options.now) ? options.now : Date.now();
  const dateMsArr = options.dateMs ?? [];

  return hits.map((h, i) => {
    const d = dateMsArr[i];
    const factor = recencyFactor(d, now, halfLifeDays);
    if (factor === null) return h; // dateMs 無し → そのまま
    // score を mix: score_new = score * (1 - mixWeight * (1 - factor))
    //   factor=1 (今日) なら score 不変
    //   factor=0 (∞遠) なら score * (1 - mixWeight)
    const newScore = clamp01(h.score * (1 - mixWeight * (1 - factor)));
    if (newScore === h.score) return h;
    return { ...h, score: newScore };
  });
}

/**
 * date と now から recency factor を算出。範囲 [0, 1]。
 * dateMs が不正なら null (= boost 適用なし)。
 *
 * 未来日 (now < dateMs) は 1.0 でクランプ (録画より先の日付は "新しい" 扱いしない、
 * 既に新しいのは確かなので 1.0 = 減衰なし)。
 */
export function recencyFactor(
  dateMs: number | null | undefined,
  now: number,
  halfLifeDays: number,
): number | null {
  if (dateMs === null || dateMs === undefined) return null;
  if (!Number.isFinite(dateMs)) return null;
  const ageDays = (now - dateMs) / DAY_MS;
  if (ageDays <= 0) return 1; // 未来 / 今日
  if (!Number.isFinite(ageDays)) return null;
  const raw = 0.5 ** (ageDays / halfLifeDays);
  // 数値ノイズで 1 を超えた場合 / 負になった場合のクランプ
  return clamp01(raw);
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}
