import { PagePlaceholder } from '@/components/layout/placeholder';

export const metadata = { title: '録画一覧' };

export default function RecordingsPage() {
  return (
    <PagePlaceholder
      scCode="SC-15"
      title="録画一覧"
      description="Zoom から取り込み済みの商談録画と、その処理ステータスを一覧表示します。"
      helpText={[
        'ステータス: 取込中 / 文字起こし中 / 要約中 / 完了 / 失敗。',
        '失敗 (20_failure_recovery) は再試行ボタン付きで表示し、Sentry に紐付くエラーIDを確認できます。',
        '録画行をクリックすると SC-16「録画詳細」へ遷移します。',
      ].join('\n\n')}
    />
  );
}
