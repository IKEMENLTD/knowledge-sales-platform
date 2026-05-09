import { PagePlaceholder } from '@/components/layout/placeholder';

export const metadata = { title: '商談詳細' };

export default async function MeetingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <PagePlaceholder
      scCode="SC-11"
      taskCode="T-014"
      title="商談詳細"
      description="単一商談の録画・文字起こし・要約・アクションアイテムを統合表示します。"
      helpText={[
        `Meeting ID: ${id}`,
        'タブ構成: サマリー / 文字起こし / アクションアイテム / 関連ナレッジ。',
        '録画は Zoom 連携 (T-013) が完了すると自動で Recording に紐付き、worker 側で文字起こし・要約処理が走ります。',
        '完了通知は dashboard 上部の通知バナーで案内します。',
      ].join('\n\n')}
    />
  );
}
