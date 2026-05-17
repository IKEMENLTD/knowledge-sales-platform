import type { MeetingStage } from '@ksp/shared';

/**
 * 商談 (T-014) のステージ・勝率に関する純粋関数。
 *
 * 設計判断:
 *   - 副作用 0 (DB / Date.now / Math.random 不使用)。テストで境界値を網羅できる。
 *   - ここで決めるのは「営業マネジメント上の既定値」であり、UI / API から上書き可能。
 *     例: API の PATCH で win_probability が指定されればその値を尊重し、本関数は
 *     呼ばない。ステージだけ更新された時に「次の既定勝率」を埋めるための補助。
 *   - validateStageTransition は「禁止」ではなく「warning」を返す方針。
 *     0036 の migration では DB レベルの不可逆制約を入れていないため、API 側で
 *     ハードに弾くと運用上の例外 (誤クリック後の戻し) ができなくなる。
 *     ただし closed → 営業初期段階 へ戻す等は明確に異常なので呼び出し側で記録する。
 */

export type DealStatus = 'open' | 'won' | 'lost' | 'on_hold';

/** ステージ別の既定勝率テーブル。営業ファネルの平均的な進捗確率を入れた値。 */
const STAGE_BASE_WIN_PROBABILITY: Record<MeetingStage, number> = {
  first: 0.1,
  second: 0.2,
  demo: 0.3,
  proposal: 0.45,
  negotiation: 0.6,
  closing: 0.8,
  // CS フェーズは「契約済み = 既に勝った」前提。
  kickoff: 1.0,
  cs_regular: 1.0,
  // 課題対応中は解約懸念を 10% 織り込む。
  cs_issue: 0.9,
};

/**
 * `(stage, dealStatus, lostReason)` から勝率の既定値を導出する。
 *
 * 優先順位:
 *   1. dealStatus が確定 (won / lost) → 1.0 / 0.0 を即返す。
 *   2. dealStatus が on_hold → stage 既定の半分 (保留中はパイプライン外扱い)。
 *   3. それ以外 (open / undefined) → STAGE_BASE_WIN_PROBABILITY[stage]。
 *   4. stage 未指定 → 0.05 (リード相当)。
 *
 * lostReason は将来の重み付け用 (例: "予算" は再アプローチ余地あり、"競合" は低い)。
 * 現状は警告ロガー用の判定にのみ使うため、確定 lost なら 0 を返す。
 */
export function computeWinProbability(
  stage: MeetingStage | null | undefined,
  dealStatus: DealStatus | null | undefined,
  lostReason?: string | null,
): number {
  if (dealStatus === 'won') return 1;
  if (dealStatus === 'lost') {
    // lostReason の有無に関わらず 0。lostReason が無い "lost" は呼び出し側で警告。
    void lostReason;
    return 0;
  }

  const base = stage ? STAGE_BASE_WIN_PROBABILITY[stage] : 0.05;

  if (dealStatus === 'on_hold') {
    return roundTwo(base * 0.5);
  }

  return roundTwo(base);
}

/** 0.00..1.00 の 2 桁丸め。numeric(3,2) に直接 INSERT できる形に整える。 */
function roundTwo(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * ステージ遷移の妥当性検証。
 *
 * 返り値:
 *   - kind: 'ok' — 通常遷移
 *   - kind: 'noop' — from === to
 *   - kind: 'warning' — 不可逆方向への逆走 (例: kickoff → first)
 *
 * 設計判断:
 *   - DB 制約ではなく soft warning なのは、運用上「誤クリック後の戻し」が必須だから。
 *   - 警告は audit (meeting_stage_transitions.reason) に書き残し、UI で確認モーダルを出す。
 *   - 「禁止」ではなく「警告」止まりにする方針は 25_v2 リソリューションの「商談ライフ
 *     サイクルの逆走は audit + 警告で十分」の合意に従う。
 */
export type StageTransitionVerdict =
  | { kind: 'ok' }
  | { kind: 'noop' }
  | { kind: 'warning'; reason: string };

/** CS フェーズ (契約後)。ここからセールスフェーズへの逆走を warning 化する。 */
const POST_CONTRACT_STAGES: ReadonlySet<MeetingStage> = new Set([
  'kickoff',
  'cs_regular',
  'cs_issue',
]);

/** セールスフェーズ (契約前)。 */
const PRE_CONTRACT_STAGES: ReadonlySet<MeetingStage> = new Set([
  'first',
  'second',
  'demo',
  'proposal',
  'negotiation',
  'closing',
]);

/**
 * セールスファネルの一方向順序。逆走 (例: negotiation → demo) は warning。
 * 同一ステージへの遷移は noop で返す。
 */
const SALES_ORDER: ReadonlyArray<MeetingStage> = [
  'first',
  'second',
  'demo',
  'proposal',
  'negotiation',
  'closing',
];

export function validateStageTransition(
  from: MeetingStage | null | undefined,
  to: MeetingStage,
): StageTransitionVerdict {
  if (from === to) {
    return { kind: 'noop' };
  }
  if (!from) {
    // 初回 stage 設定はどこからでも OK。
    return { kind: 'ok' };
  }

  // 契約後 → 契約前は明確に異常。
  if (POST_CONTRACT_STAGES.has(from) && PRE_CONTRACT_STAGES.has(to)) {
    return {
      kind: 'warning',
      reason: `post_contract_to_pre_contract:${from}->${to}`,
    };
  }

  // セールス内の逆走 (e.g. negotiation -> demo) を検知。
  const fromIdx = SALES_ORDER.indexOf(from);
  const toIdx = SALES_ORDER.indexOf(to);
  if (fromIdx >= 0 && toIdx >= 0 && toIdx < fromIdx) {
    return {
      kind: 'warning',
      reason: `sales_stage_regression:${from}->${to}`,
    };
  }

  return { kind: 'ok' };
}
