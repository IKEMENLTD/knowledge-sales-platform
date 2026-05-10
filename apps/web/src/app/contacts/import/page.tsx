import { PagePlaceholder } from '@/components/layout/placeholder';

export const metadata = { title: '名刺の取り込み' };

export default function ContactsImportPage() {
  return (
    <PagePlaceholder
      scCode="SC-06"
      taskCode="T-007"
      kicker="営業 / 取り込み"
      title="名刺をまとめて取り込む。"
      description="読み取った内容は自動で社内データベースに登録され、商談相手と紐づきます。"
      helpText={`複数枚をまとめてアップロードできます。
画像から自動で会社名・氏名・連絡先を読み取り、内容に自信のないところはあとで「名刺レビュー」画面で確認できます。
重複している連絡先は知らせるので、同じ人を二重に登録することはありません。`}
      comingSoonNote="モバイル端末ならカメラで連射撮影できる「名刺スキャン」も利用できます (近日)。"
    />
  );
}
