import { PagePlaceholder } from '@/components/layout/placeholder';

export const metadata = { title: '商談一覧' };

export default function MeetingsPage() {
  return (
    <PagePlaceholder
      scCode="SC-09"
      taskCode="T-014"
      title="商談一覧"
      description="Google Calendar から取り込んだ商談をタイムライン表示し、録画状況・要約状態を一覧化します。"
      helpText={[
        'フィルタ: 期間 / 参加者 / 商談種別 / 録画有無。',
        '商談行をクリックすると SC-11「商談詳細」へ遷移し、録画 (Zoom) / 議事録 / アクションアイテムを統合表示します。',
        '初回利用時は Google Calendar 連携を促す導線が表示されます (SC-61 オンボーディングと連動)。',
      ].join('\n\n')}
    />
  );
}
