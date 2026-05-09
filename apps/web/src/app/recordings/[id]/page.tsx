import { PagePlaceholder } from '@/components/layout/placeholder';

export const metadata = { title: '録画詳細' };

export default async function RecordingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <PagePlaceholder
      scCode="SC-16"
      title="録画詳細"
      description="録画動画のプレビューと、タイムスタンプ付きの文字起こしを並列表示します。"
      helpText={[
        `Recording ID: ${id}`,
        '左ペイン: 動画プレイヤー (チャプター対応)。右ペイン: 文字起こし (話者分離 / クリックで該当時間にシーク)。',
        '下部: AI 要約・アクションアイテム・関連ナレッジ候補。',
        '権限: 同一 organization の admin / manager と参加者本人のみ閲覧可。',
      ].join('\n\n')}
    />
  );
}
