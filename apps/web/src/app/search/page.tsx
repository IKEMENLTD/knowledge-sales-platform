import { PagePlaceholder } from '@/components/layout/placeholder';

export const metadata = { title: '検索' };

export default function SearchPage() {
  return (
    <PagePlaceholder
      scCode="SC-17"
      taskCode="T-016"
      kicker="ナレッジ / 検索"
      title="社の知見を、横断する。"
      description="商談・録画・メール・社内資料を意味で検索。キーワードと文脈の両方で当てます。"
      helpText={`「価格交渉でうまくいったケース」「導入時に詰まりやすい論点」のような問いかけにも答えます。
過去の商談台詞・社内ドキュメントから、関連箇所を引用形式で提示します。
権限のないコンテンツは、検索結果の段階で自動的に除外されます。`}
      comingSoonNote="モバイルなら ⌘K に相当するクイック検索を画面下から呼び出せます (近日)。"
    />
  );
}
