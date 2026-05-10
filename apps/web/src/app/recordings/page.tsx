import { PagePlaceholder } from '@/components/layout/placeholder';

export const metadata = { title: '録画' };

export default function RecordingsPage() {
  return (
    <PagePlaceholder
      scCode="SC-15"
      kicker="営業 / 録画"
      title="商談の録画を、ナレッジに変える。"
      description="Zoom の録画を自動で取り込み、文字起こし・要約・台詞検索まで一気に。"
      helpText={`Zoom と連携すると、録画完了後に自動でこの一覧に並びます。
発言者の識別と話者ごとの感情の流れも追跡できるので、商談の温度感が可視化されます。
社内の他メンバーと知見を共有するときは、必要な部分だけを切り出して安全に渡せます。`}
    />
  );
}
