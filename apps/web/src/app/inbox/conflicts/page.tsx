import { PagePlaceholder } from '@/components/layout/placeholder';

export const metadata = { title: '名寄せ衝突' };

/**
 * SC-74 (P2 UI placeholder)。
 * 16_dedup_merge の自動マージ閾値 (>0.92) を下回る候補ペアを担当者がレビュー・統合判断する画面。
 */
export default function InboxConflictsPage() {
  return (
    <PagePlaceholder
      scCode="SC-74"
      title="名寄せ衝突 (Inbox)"
      description="自動マージ閾値を下回った会社・連絡先の重複候補を担当者がレビュー / マージ / 別人判定。"
      helpText={[
        '候補一覧: 類似度 (0.70-0.92) でソート、左右カラムに二件の差分ハイライト。',
        'アクション: 「同一」「別人」「保留」。判断は dedup_decisions に記録され将来の自動マージ閾値学習に使用。',
        'バルク: 同一ドメイン・同一電話番号で束ねた候補を一括承認。',
        'ロール: 自身が担当する案件の候補のみ表示 (RLS により workspace_members 経由でフィルタ)。',
      ].join('\n\n')}
    />
  );
}
