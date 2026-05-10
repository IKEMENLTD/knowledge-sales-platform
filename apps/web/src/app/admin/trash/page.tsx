import { PagePlaceholder } from '@/components/layout/placeholder';

export const metadata = { title: 'ゴミ箱' };

export default function AdminTrashPage() {
  return (
    <PagePlaceholder
      scCode="SC-55"
      kicker="管理 / 復元"
      title="消したものを、戻す。"
      description="削除した商談・連絡先・録画は30日間ここに残ります。期間中なら、いつでも元に戻せます。"
      helpText={`削除日時・誰が消したか・関連する資料が一覧で見られます。
復元すると、関連する商談・通知・引き継ぎ書も自動で復元されます。
30日を過ぎると完全に消去されます (バックアップから戻すには管理者経由の手続きが必要)。`}
    />
  );
}
