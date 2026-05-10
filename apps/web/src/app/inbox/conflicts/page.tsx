import { PagePlaceholder } from '@/components/layout/placeholder';

export const metadata = { title: '同時編集の確認' };

export default function InboxConflictsPage() {
  return (
    <PagePlaceholder
      scCode="SC-74"
      kicker="受信箱 / 衝突"
      title="同じ場所を、二人で編集していたとき。"
      description="複数の端末・人が同じ商談メモを直していた場合、ここで両方の版を見比べて取捨選択できます。"
      helpText={`どちらかを採用するか、両方をマージするかを選べます。
判断履歴は記録されるので、あとから「どっちが残ったか」を辿れます。`}
    />
  );
}
