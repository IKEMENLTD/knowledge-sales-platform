import { PagePlaceholder } from '@/components/layout/placeholder';

export const metadata = { title: '通知設定' };

/**
 * SC-66 (P1) 通知設定 placeholder。
 * 19_onboarding_initial の通知デフォルト ON 設定をユーザが個別に切替えるための専用ページ。
 * 実装は Phase1 W3 (T-018 通知配信基盤) で接続。
 */
export default function NotificationsSettingsPage() {
  return (
    <PagePlaceholder
      scCode="SC-66"
      title="通知設定"
      description="商談リマインド・録画完了・処理失敗通知のチャネル (アプリ内 / メール / Slack) を個別にカスタマイズ。"
      helpText={[
        'チャネル: アプリ内通知 (デフォルト ON) / メール / Slack 連携 (組織管理者が承認した場合のみ)。',
        '種別: 商談 30 分前リマインド / 録画処理完了 / 文字起こし失敗 / 名刺取込結果 / ナレッジ共有依頼。',
        'Quiet Hours: 業務時間外 (デフォルト 21:00-08:00 JST) は緊急通知のみ受領。',
        '同意記録: 通知 ON/OFF 変更は audit_logs に記録 (19_onboarding_initial / 21_a11y_i18n)。',
      ].join('\n\n')}
    />
  );
}
