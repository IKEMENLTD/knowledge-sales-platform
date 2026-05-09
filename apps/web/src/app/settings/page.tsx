import { PagePlaceholder } from '@/components/layout/placeholder';

export const metadata = { title: '設定' };

export default function SettingsPage() {
  return (
    <PagePlaceholder
      scCode="SC-32"
      title="設定"
      description="個人設定 (通知 / 表示言語 / テーマ) と外部サービス連携 (Google / Zoom) の状態確認。"
      helpText={[
        'プロフィール: 表示名 / 連絡先 / アバター。',
        '連携: Google Calendar / Gmail / Zoom の接続状態と再接続。Gmail スコープは初回連携時に追加同意 (incremental authorization)。',
        '表示: テーマ (light/dark/system) / フォントサイズ / 言語 (ja / en, 21_a11y_i18n)。',
        '通知: 商談リマインド / 録画処理完了 / 失敗通知のオン/オフ。',
      ].join('\n\n')}
    />
  );
}
