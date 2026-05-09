import { PagePlaceholder } from '@/components/layout/placeholder';

export const metadata = { title: 'オフラインキュー' };

export default function MobileQueuePage() {
  return (
    <PagePlaceholder
      scCode="SC-34"
      title="オフラインキュー"
      description="オフライン中に取り込んだ名刺・メモ・録音の同期待ちアイテムを表示します。"
      helpText={[
        '17_offline_mobile / 20_failure_recovery: アイテム別ステータス (同期待ち / アップロード中 / 完了 / 失敗+再試行)。',
        '失敗時はリトライボタンと、Sentry に送られるエラーIDを表示。',
        'IndexedDB 暗号化キーは libsodium で派生され、サインアウトで失効。サインアウト中はキュー内容も復号できない設計です。',
      ].join('\n\n')}
    />
  );
}
