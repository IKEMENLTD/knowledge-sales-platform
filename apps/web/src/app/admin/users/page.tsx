import { PagePlaceholder } from '@/components/layout/placeholder';

export const metadata = { title: 'ユーザ管理' };

export default function AdminUsersPage() {
  return (
    <PagePlaceholder
      scCode="SC-27"
      taskCode="T-017"
      title="ユーザ管理"
      description="組織内ユーザの role / is_active を管理します (admin 限定)。"
      helpText={[
        '一覧: メール / 氏名 / role (admin/manager/sales/viewer) / 最終ログイン / 状態。',
        '操作: role 変更 / 無効化 / 招待リンク再発行。',
        '監査ログ: 全操作は audit_logs テーブルに記録されます (security/round1)。',
      ].join('\n\n')}
    />
  );
}
