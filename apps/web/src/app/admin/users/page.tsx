import { Card } from '@/components/ui/card';
import { requireUser } from '@/lib/auth/server';
import { createServerClient } from '@/lib/supabase/server';
import { AdminUsersClient, type AdminUserRow } from './_components/admin-users-client';

/**
 * /admin/users (Round2 P1 G-P1-1) — メンバー管理。
 *
 * 機能:
 *   - 招待 (modal → /api/admin/invite)
 *   - role inline edit (PATCH /api/admin/users/[id])
 *   - 退職処理 (confirm modal → DELETE /api/admin/users/[id])
 *
 * 認可:
 *   - requireUser({ role: 'admin' }) — admin 以外は /403 へ。
 *   - SELECT は anon (cookie) 経由で実行。RLS は users_self_select_fallback (0032) で
 *     authenticated は同 org の users を読めるため、admin から見ても同じ。
 */
export const metadata = { title: 'メンバー' };

const ROLE_LABEL: Record<AdminUserRow['role'], string> = {
  sales: '営業',
  cs: 'CS',
  manager: 'マネージャ',
  admin: '管理者',
  legal: '法務',
};

const ROLE_TONE: Record<AdminUserRow['role'], string> = {
  admin: 'border-cinnabar/45 bg-cinnabar/8 text-cinnabar',
  manager: 'border-chitose/45 bg-chitose-muted/30 text-chitose',
  legal: 'border-foreground/30 bg-card text-foreground',
  sales: 'border-foreground/20 bg-card text-foreground',
  cs: 'border-foreground/20 bg-card text-foreground',
};

interface RawUserRow {
  id: string;
  email: string;
  name: string | null;
  role: AdminUserRow['role'];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export default async function AdminUsersPage() {
  const me = await requireUser({ role: 'admin' });
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from('users')
    .select('id,email,name,role,is_active,created_at,updated_at')
    .order('created_at', { ascending: false })
    .limit(500);

  const rows: AdminUserRow[] = error
    ? []
    : (data ?? []).map((r) => {
        const u = r as RawUserRow;
        return {
          id: u.id,
          email: u.email,
          name: u.name ?? u.email,
          role: u.role,
          isActive: u.is_active,
          isSelf: u.id === me.id,
        };
      });

  const total = rows.length;
  const active = rows.filter((r) => r.isActive).length;
  const suspended = total - active;

  return (
    <div className="space-y-10 max-w-6xl mx-auto">
      <div className="flex items-baseline justify-between border-t-2 border-foreground pt-3 animate-fade-in">
        <p className="kicker">№ 01 — メンバー</p>
        <span className="kicker tabular">
          全 {total} 名 ・ 稼働 {active} 名 ・ 停止 {suspended} 名
        </span>
      </div>

      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between animate-fade-up">
        <div className="space-y-2 max-w-2xl">
          <h1 className="display text-3xl md:text-[2.5rem] font-semibold tracking-crisp text-balance">
            使う人を、管理する。
          </h1>
          <p className="text-base leading-relaxed text-muted-foreground">
            招待・役割の変更・退職時の引き継ぎまでを一つの画面で。停止すると本人はログインできなくなり、重要操作はすべて監査ログに記録されます。
          </p>
        </div>
      </header>

      <div className="hairline" aria-hidden />

      {error ? (
        <Card className="p-6 border-cinnabar/30">
          <p className="text-sm leading-relaxed text-cinnabar">
            メンバー一覧の取得に失敗しました ({error.message})。
          </p>
        </Card>
      ) : null}

      <AdminUsersClient rows={rows} roleLabel={ROLE_LABEL} roleTone={ROLE_TONE} />

      <section
        aria-label="引き継ぎポリシー"
        className="rounded-xl border border-dashed border-border/60 bg-card/50 p-5 animate-fade-up [animation-delay:120ms]"
      >
        <p className="kicker mb-2">引き継ぎポリシー</p>
        <p className="text-sm leading-relaxed text-foreground/85 max-w-prose">
          停止扱いにすると、本人がログインを試みた場合は 403 を返します。保有データ
          (商談・名刺・録画) の所有権移管は引き継ぎチェックリスト (SC-79) に従って手動で行ってください。最後の操作から
          60 日後にアカウントを自動削除する予定キューは Phase 2 で稼働します。
        </p>
      </section>
    </div>
  );
}
