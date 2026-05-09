import { PagePlaceholder } from '@/components/layout/placeholder';

export const metadata = { title: 'クイック検索' };

export default function MobileQuickLookupPage() {
  return (
    <PagePlaceholder
      scCode="SC-35"
      title="クイック検索 (モバイル)"
      description="商談直前にスマホで「相手の名前」「会社名」を即引きするための軽量検索画面。"
      helpText={[
        '入力 1 文字目から prefix 検索を発火。直近の商談 / 名刺 / 関連ナレッジを統合表示。',
        '結果カードはスワイプで「メモを残す」「商談に紐付け」のクイックアクション。',
        'オフライン時はキャッシュ済みデータのみ検索 (キャッシュ更新は SC-32 から制御)。',
      ].join('\n\n')}
    />
  );
}
