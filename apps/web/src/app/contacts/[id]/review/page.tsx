import { PagePlaceholder } from '@/components/layout/placeholder';

export const metadata = { title: '名刺レビュー' };

export default async function ContactReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <PagePlaceholder
      scCode="SC-08"
      taskCode="T-010"
      title="名刺レビュー"
      description="OCR で抽出した連絡先情報を確認・修正して保存します。"
      helpText={[
        `Contact ID: ${id}`,
        '左側に名刺画像、右側に抽出フィールド (氏名 / 会社 / 役職 / Email / 電話) を表示します。',
        '低信頼度フィールドはハイライトされ、原文照合 (15_field_ux_supplement) で目視確認しやすくなります。',
        '保存すると connections テーブルへ登録され、商談紐付け候補に使われます。',
      ].join('\n\n')}
    />
  );
}
