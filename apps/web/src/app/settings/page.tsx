import { PagePlaceholder } from '@/components/layout/placeholder';

export const metadata = { title: '設定' };

export default function SettingsPage() {
  return (
    <PagePlaceholder
      scCode="SC-32"
      kicker="個人設定"
      title="自分の使い心地を、整える。"
      description="連携サービス・通知・利き手・タイムゾーンを、自分の動き方に合わせて。"
      helpText={`Google カレンダー・Gmail との連携状態をいつでも確認・解除できます。
スマートフォンでの片手操作 (右利き / 左利き) を切り替えると、主な操作ボタンが手元側に寄ります。
通知の鳴らし方は「通知設定」から細かく調整できます。`}
    />
  );
}
