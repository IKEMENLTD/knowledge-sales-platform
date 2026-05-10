import { PagePlaceholder } from '@/components/layout/placeholder';

export const metadata = { title: 'オフラインキュー' };

export default function MobileQueuePage() {
  return (
    <PagePlaceholder
      scCode="SC-34"
      kicker="モバイル / キュー"
      title="まだ送れていないものを、確認する。"
      description="圏外で記録した名刺・メモが、ここに一時的に貯まります。回線が戻り次第、自動で送信されます。"
      helpText={`通信が回復すると、上から順番に送信を試みます。
失敗が続いたものはお知らせするので、再撮影や手動で内容を直してから再送できます。`}
    />
  );
}
