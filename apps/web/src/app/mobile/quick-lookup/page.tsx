import { PagePlaceholder } from '@/components/layout/placeholder';

export const metadata = { title: 'クイック検索' };

export default function MobileQuickLookupPage() {
  return (
    <PagePlaceholder
      scCode="SC-35"
      kicker="モバイル / 検索"
      title="商談中に、こっそり調べる。"
      description="商談相手の前で画面共有を切らずに、過去の議事録や約束事項を引き当てます。"
      helpText={`発音入力で「先月の田中商事との打合せの結論」のように尋ねられます。
画面に映してもまずいものは表示せず、必要な部分だけ短く要点で返します。
検索した履歴は端末内にのみ残り、社外から覗かれることはありません。`}
    />
  );
}
