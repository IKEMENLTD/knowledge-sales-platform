import { PagePlaceholder } from '@/components/layout/placeholder';

export const metadata = { title: 'メンバー' };

export default function AdminUsersPage() {
  return (
    <PagePlaceholder
      scCode="SC-27"
      taskCode="T-017"
      kicker="管理 / メンバー"
      title="使う人を、管理する。"
      description="招待・役割の変更・退職時の引き継ぎまでを一つの画面で。"
      helpText={`新しいメンバーは Google アカウント宛に招待を送り、本人が承諾するとログインできるようになります。
退職した人を停止扱いにすると、保有していた連絡先や商談は指定した次の担当者へ移行されます。
重要操作は記録されるので、いつ誰が何をしたかが後から確認できます。`}
    />
  );
}
