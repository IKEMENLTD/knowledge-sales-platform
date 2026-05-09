import { PagePlaceholder } from '@/components/layout/placeholder';

export const metadata = { title: 'ナレッジ検索' };

export default function SearchPage() {
  return (
    <PagePlaceholder
      scCode="SC-17"
      taskCode="T-016"
      title="ナレッジ横断検索"
      description="商談録画・名刺・議事録・ナレッジアイテムを横断するハイブリッド検索 (BM25 + ベクトル)。"
      helpText={[
        '検索バー (⌘K) からキーワードと自然文クエリの両方を受け付けます。',
        'フィルタ: 期間 / 種別 (録画 / 議事録 / ナレッジ / 名刺) / 担当者 / アカウント。',
        '結果はハイライト + 周辺コンテキスト (15_field_ux_supplement) 付きで表示し、原文ソースに 1 クリックで遷移します。',
      ].join('\n\n')}
    />
  );
}
