import { PagePlaceholder } from '@/components/layout/placeholder';

export const metadata = { title: '名刺の確認' };

export default async function ContactReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <PagePlaceholder
      scCode="SC-08"
      taskCode="T-010"
      kicker="営業 / 名刺"
      title="読み取った内容を、確認する。"
      description="自動入力された会社名・氏名・連絡先を確認し、修正してから保存します。"
      helpText={`連絡先 ID: ${id}
画像から読み取れない箇所は薄く表示されます。
同じ人がすでに登録されている可能性があれば、候補としてここで知らせます。
保存すると、その人との商談履歴やメールが自動で紐づくようになります。`}
    />
  );
}
