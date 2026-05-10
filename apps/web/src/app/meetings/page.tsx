import { PagePlaceholder } from '@/components/layout/placeholder';

export const metadata = { title: '商談一覧' };

export default function MeetingsPage() {
  return (
    <PagePlaceholder
      scCode="SC-09"
      taskCode="T-014"
      kicker="営業 / 商談"
      title="商談を、流れで見渡す。"
      description="ステージ別のカンバンと一覧をワンタップで切り替え。直近の予定・要点・次の一手まで一画面で。"
      helpText={`Google カレンダーと Zoom 録画を自動で取り込みます。
それぞれの商談には、AI が要約した要点・お客さまのニーズ・反論・次のアクション・約束事項が並びます。
言った言わないが起きないように、約束事項は録画の該当時刻まで遡れます。`}
    />
  );
}
