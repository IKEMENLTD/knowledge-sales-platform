/**
 * 加重パイプライン / 予測着地 / 滞留日数 の純粋関数群。
 *
 * 「DB 由来の meeting (deal_amount + win_probability)」と
 * 「demo fixture (amountJpy のみ)」の両方を一つの計算関数に通すため、
 * 入力は `ForecastMeeting` という最小共通型に正規化してから受け取る。
 *
 * 数式:
 *   weighted = Σ ( deal_amount × win_probability )
 *
 * win_probability の解釈ルール:
 *   - null / undefined のときは stage から既定値を引く (STAGE_DEFAULT_PROB)
 *   - 0..1 の小数も 0..100 の整数も受け付け、内部では 0..1 に正規化
 *   - 範囲外 (負値 / 100超) は clamp
 *
 * 着地予測 (`forecastCloseDate`) は scheduled_at から +stageOffset 日を当てて
 * 月ごとに加重金額を集計する。close_date が明示されていればそちらを優先。
 */

import type { DemoMeeting, DemoMeetingStage } from '@/lib/demo/fixtures';

/** 商談ステージ — kanban 5 列分の論理ステージ。DB 列 `deal_status` と整合。 */
export type StageKey = DemoMeetingStage;

/** 加重計算用の最小共通商談型。DB レコード / demo fixture どちらも変換可能。 */
export type ForecastMeeting = {
  id: string;
  stage: StageKey;
  /** 商談金額 (JPY 円単位 / 整数)。0 / 未定 のときは 0 扱い。 */
  amountJpy: number;
  /**
   * 受注確度 (0..1 もしくは 0..100)。null/undefined のときは
   * stage の既定値 (`STAGE_DEFAULT_PROB`) を採用する。
   */
  winProbability?: number | null;
  /** ISO datetime (商談日 or 着地日)。月別集計のキーになる。 */
  scheduledAt?: string | null;
  /** ISO date (deal_close_date)。あれば月別集計でこちらを優先。 */
  closeDate?: string | null;
};

/**
 * ステージごとの既定 win_probability (0..1)。
 * win_probability 列が null の DB 行 / demo fixture のフォールバック用。
 *
 * 値域は一般的な B2B SaaS の Sales Forecasting Bell-curve に従い、
 *   予定 25% / 進行中 50% / 受注 100% / 失注 0% / 保留 10%
 * を採用。プロダクトの実数値が判明次第差し替え可能なよう外出し。
 */
export const STAGE_DEFAULT_PROB: Record<StageKey, number> = {
  scheduled: 0.25,
  in_progress: 0.5,
  won: 1.0,
  lost: 0.0,
  on_hold: 0.1,
};

/** demo fixture を ForecastMeeting に正規化するユーティリティ。 */
export function fromDemo(m: DemoMeeting): ForecastMeeting {
  return {
    id: m.id,
    stage: m.stage,
    amountJpy: m.amountJpy,
    winProbability: null, // demo は確度を持たないので stage default に委ねる
    scheduledAt: m.scheduledAt,
    closeDate: null,
  };
}

/**
 * win_probability の入力 (null / 0..1 / 0..100 のいずれか) を
 * 内部正規化 0..1 にそろえる。範囲外は clamp。
 */
export function normalizeProbability(raw: number | null | undefined, stage: StageKey): number {
  if (raw === null || raw === undefined || Number.isNaN(raw)) {
    return STAGE_DEFAULT_PROB[stage];
  }
  // 1.0 を超えていれば「0..100 表記」と判断し /100。それ以外は 0..1 表記。
  const v = raw > 1 ? raw / 100 : raw;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

/**
 * Σ amount × win_probability — 加重パイプライン合計 (JPY 整数)。
 *
 * 「失注 (lost)」は確度 0 なので自動で計算外。「受注 (won)」は確度 1 で
 * そのまま amount 全額が加算される (= 受注金額の合計と一致)。
 */
export function weightedPipeline(meetings: ForecastMeeting[]): number {
  let total = 0;
  for (const m of meetings) {
    const prob = normalizeProbability(m.winProbability, m.stage);
    total += m.amountJpy * prob;
  }
  return Math.round(total);
}

/**
 * 商談単体の加重金額 (¥). 行内 tooltip 等で「確度 65% × ¥2,500,000」を出す用途。
 */
export function weightedAmount(meeting: ForecastMeeting): number {
  const prob = normalizeProbability(meeting.winProbability, meeting.stage);
  return Math.round(meeting.amountJpy * prob);
}

/** 0..1 を「65%」のような表示文字列に。 */
export function formatProbability(raw: number | null | undefined, stage: StageKey): string {
  const v = normalizeProbability(raw, stage);
  return `${Math.round(v * 100)}%`;
}

/** ISO datetime / date から "YYYY-MM" を取り出す。Invalid Date は null。 */
function toMonthKey(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/**
 * 月別予測着地。
 *
 * 出力は month (`YYYY-MM`) 昇順の配列で、各月の加重金額合計を返す。
 * closeDate が指定されていればそれを優先、なければ scheduledAt を採用。
 * どちらも無ければ集計対象外 (= "unscheduled" にも含めない、無視する)。
 *
 * 「予定/進行中/保留」は将来のパイプラインとして全て月別合計に加算され、
 * 「失注」は確度 0 のため自然に 0 加算。「受注」は確度 1 で計上される。
 */
export function forecastCloseDate(
  meetings: ForecastMeeting[],
): { month: string; weightedJpy: number; count: number }[] {
  const bucket = new Map<string, { weighted: number; count: number }>();
  for (const m of meetings) {
    const key = toMonthKey(m.closeDate) ?? toMonthKey(m.scheduledAt);
    if (!key) continue;
    const prob = normalizeProbability(m.winProbability, m.stage);
    const w = m.amountJpy * prob;
    const cur = bucket.get(key);
    if (cur) {
      cur.weighted += w;
      cur.count += 1;
    } else {
      bucket.set(key, { weighted: w, count: 1 });
    }
  }
  return [...bucket.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({
      month,
      weightedJpy: Math.round(v.weighted),
      count: v.count,
    }));
}

/**
 * 滞留日数 — scheduledAt から「いま」までの経過日。
 * 進行中 / 予定 / 保留 のみ意味があるので、won / lost のときは 0 を返す。
 *
 * @param now SSR で値が揺れない様、呼び出し側で固定 Date を渡す
 */
export function stageStuckDays(meeting: ForecastMeeting, now: Date): number {
  if (meeting.stage === 'won' || meeting.stage === 'lost') return 0;
  if (!meeting.scheduledAt) return 0;
  const d = new Date(meeting.scheduledAt);
  if (Number.isNaN(d.getTime())) return 0;
  const diffMs = now.getTime() - d.getTime();
  if (diffMs <= 0) return 0;
  return Math.floor(diffMs / 86_400_000);
}

/**
 * 集計サマリ — page.tsx の上部 KPI 用に一括で揃えて返す。
 *
 *   pipelineWeighted: 「進行中」+「予定」+「保留」 の加重合計
 *   wonTotal:        「受注」 の amount 単純合計 (確度 100% 確定)
 *   wonWeighted:     「受注」 の加重合計 (= wonTotal と一致するが、対称性のため別フィールドで返す)
 *   openCount:       won/lost 以外の件数
 */
export function summarizePipeline(meetings: ForecastMeeting[]): {
  pipelineWeighted: number;
  wonTotal: number;
  wonWeighted: number;
  openCount: number;
  totalCount: number;
} {
  let pipelineWeighted = 0;
  let wonTotal = 0;
  let wonWeighted = 0;
  let openCount = 0;
  for (const m of meetings) {
    const prob = normalizeProbability(m.winProbability, m.stage);
    if (m.stage === 'won') {
      wonTotal += m.amountJpy;
      wonWeighted += m.amountJpy * prob;
    } else if (m.stage !== 'lost') {
      pipelineWeighted += m.amountJpy * prob;
      openCount += 1;
    }
  }
  return {
    pipelineWeighted: Math.round(pipelineWeighted),
    wonTotal: Math.round(wonTotal),
    wonWeighted: Math.round(wonWeighted),
    openCount,
    totalCount: meetings.length,
  };
}
