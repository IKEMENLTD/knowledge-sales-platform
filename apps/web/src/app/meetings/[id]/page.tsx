import { PagePlaceholder } from '@/components/layout/placeholder';

export const metadata = { title: '商談の詳細' };

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
      kicker="営業 / 商談"
      title="一回の商談を、深く読む。"
      description="録画・要約・約束事項・次のアクションを一画面に。検索したいキーワードから、その台詞の場面までジャンプできます。"
      helpText={`商談 ID: ${id}
録画は完了次第、自動でこの画面に並びます。
営業マン本人は要点や次のアクションをここで編集して残せます。編集した結果は引き継ぎ書・議事録にも反映されます。`}
    />
  );
}
