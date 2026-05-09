import { PagePlaceholder } from '@/components/layout/placeholder';

export const metadata = { title: 'ゴミ箱 (admin)' };

/**
 * SC-55 ゴミ箱 placeholder (P2 UI / P1 API 予告)。
 *
 * P1: 削除フローは soft-delete (`deleted_at`) のみ。復元 API (`/api/admin/trash/restore`) は P1 W4 で実装予定。
 * P2: この画面で復元・完全削除・期限切れ自動 purge の UI を提供。
 */
export default function AdminTrashPage() {
  return (
    <PagePlaceholder
      scCode="SC-55"
      title="ゴミ箱 (admin)"
      description="削除された名刺・商談・ナレッジを 30 日間保管し、復元または完全削除を管理。"
      helpText={[
        'P1 (W4): API のみ実装 — POST /api/admin/trash/restore, DELETE /api/admin/trash/{id}。',
        'P2 (W6+): この管理 UI で削除日時 / 削除者 / 種別の一覧フィルタを提供。',
        '保管期間: 30 日 (audit_logs 設定値)。期限切れは worker の cron で物理削除し、削除ログを保持。',
        'ロール: admin のみアクセス可 (この画面)。一般ユーザは自分が削除したアイテムを設定画面から確認可能 (Phase2)。',
      ].join('\n\n')}
    />
  );
}
