import { PagePlaceholder } from '@/components/layout/placeholder';

export const metadata = { title: '録画の詳細' };

export default async function RecordingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <PagePlaceholder
      scCode="SC-16"
      kicker="営業 / 録画"
      title="商談の中身を、再生しながら掴む。"
      description="動画と文字起こしを同期再生。気になる発言から、その場面までジャンプできます。"
      helpText={`録画 ID: ${id}
発言者ごとの色分けと感情カーブで、商談の山場が一目で分かります。
社内向け / 社外向けで「ここからここまで」を切り出して、安全に共有できます (公開リンクは時限・閲覧制限つき)。`}
    />
  );
}
