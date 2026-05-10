import { PagePlaceholder } from '@/components/layout/placeholder';

export const metadata = { title: '通知設定' };

export default function SettingsNotificationsPage() {
  return (
    <PagePlaceholder
      scCode="SC-66"
      kicker="個人設定 / 通知"
      title="お知らせの届き方を、調整する。"
      description="商談録画の処理が終わったとき・返信が必要なメール・引き継ぎが回ってきたとき、それぞれを自分のリズムに合わせて。"
      helpText={`営業時間帯だけ通知する、休日は静かにする、といった切り替えができます。
重要な通知 (担当者変更・権限変更) は止められない代わりに、緊急度を抑えた表示で届きます。`}
    />
  );
}
