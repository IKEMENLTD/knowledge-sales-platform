'use client';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { AlertTriangle, Crown, MailPlus, ShieldCheck, UserCheck, UserX } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

export type AdminRole = 'sales' | 'cs' | 'manager' | 'admin' | 'legal';

export interface AdminUserRow {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  isActive: boolean;
  /** 自分自身 (admin) かどうか — UI で role 変更 / 退職を抑止する */
  isSelf: boolean;
}

interface AdminUsersClientProps {
  rows: AdminUserRow[];
  roleLabel: Record<AdminRole, string>;
  roleTone: Record<AdminRole, string>;
}

/** admin が選択可能な role (legal は CHECK 未追加のため Phase2 まで除外)。 */
const SELECTABLE_ROLES: AdminRole[] = ['sales', 'cs', 'manager', 'admin'];

function generateIdempotencyKey(prefix: string): string {
  // 8-128 url-safe で defineRoute 側 regex `^[a-zA-Z0-9_-]{8,128}$` を満たす
  const r = crypto.randomUUID().replace(/-/g, '');
  return `${prefix}-${r.slice(0, 24)}`;
}

export function AdminUsersClient({ rows, roleLabel, roleTone }: AdminUsersClientProps) {
  const router = useRouter();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [offboardTarget, setOffboardTarget] = useState<AdminUserRow | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [pendingRowId, setPendingRowId] = useState<string | null>(null);

  function refresh() {
    router.refresh();
  }

  async function handleRoleChange(row: AdminUserRow, nextRole: AdminRole) {
    if (row.isSelf) {
      setErrorMsg('自分自身の役割は変更できません。');
      return;
    }
    if (row.role === nextRole) return;
    setErrorMsg(null);
    setPendingRowId(row.id);
    try {
      const res = await fetch(`/api/admin/users/${row.id}`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': generateIdempotencyKey('role'),
        },
        body: JSON.stringify({ role: nextRole }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
        setErrorMsg(`役割の変更に失敗しました: ${data.error ?? res.statusText}`);
        return;
      }
      startTransition(() => refresh());
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setPendingRowId(null);
    }
  }

  async function handleOffboard(row: AdminUserRow) {
    setErrorMsg(null);
    setPendingRowId(row.id);
    try {
      const res = await fetch(`/api/admin/users/${row.id}`, {
        method: 'DELETE',
        headers: { 'idempotency-key': generateIdempotencyKey('off') },
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setErrorMsg(`退職処理に失敗しました: ${data.error ?? res.statusText}`);
        return;
      }
      setOffboardTarget(null);
      startTransition(() => refresh());
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setPendingRowId(null);
    }
  }

  return (
    <>
      <div className="flex items-center justify-end gap-2 animate-fade-up">
        <Button variant="cinnabar" size="default" onClick={() => setInviteOpen(true)}>
          <MailPlus aria-hidden className="size-4" />
          メンバーを招待
        </Button>
      </div>

      {errorMsg ? (
        <Card className="p-4 border-cinnabar/40">
          <p className="inline-flex items-start gap-2 text-sm text-cinnabar">
            <AlertTriangle aria-hidden className="size-4 mt-0.5 shrink-0" />
            <span>{errorMsg}</span>
          </p>
        </Card>
      ) : null}

      <section
        aria-label="メンバー一覧"
        className="animate-fade-up [animation-delay:60ms]"
      >
        <Card className="overflow-hidden p-0">
          <table className="hidden md:table w-full text-sm">
            <caption className="sr-only">組織メンバーの一覧と役割・稼働状態</caption>
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-kicker text-muted-foreground border-b border-border/60">
                <th scope="col" className="py-3 pl-5 pr-3 font-medium">
                  メンバー
                </th>
                <th scope="col" className="py-3 px-3 font-medium">
                  役割
                </th>
                <th scope="col" className="py-3 px-3 font-medium">
                  状態
                </th>
                <th scope="col" className="py-3 pr-5 pl-3 font-medium text-right">
                  操作
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-border/40 last:border-b-0 focus-within:bg-accent/40"
                >
                  <td className="py-3 pl-5 pr-3">
                    <div className="min-w-0">
                      <p className="display text-sm font-semibold tracking-crisp truncate inline-flex items-center gap-2">
                        {row.name}
                        {row.isSelf ? (
                          <span className="text-[10px] kicker text-muted-foreground">あなた</span>
                        ) : null}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">{row.email}</p>
                    </div>
                  </td>
                  <td className="py-3 px-3">
                    {row.isSelf ? (
                      <RoleBadge role={row.role} label={roleLabel[row.role]} tone={roleTone[row.role]} />
                    ) : (
                      <label className="sr-only" htmlFor={`role-${row.id}`}>
                        {row.name} の役割
                      </label>
                    )}
                    {!row.isSelf ? (
                      <select
                        id={`role-${row.id}`}
                        aria-label={`${row.name} の役割を変更`}
                        value={row.role}
                        disabled={isPending && pendingRowId === row.id}
                        onChange={(e) =>
                          void handleRoleChange(row, e.target.value as AdminRole)
                        }
                        className={cn(
                          'rounded-md border border-border bg-card px-2.5 h-9 text-xs',
                          'focus-visible:outline-none focus-visible:shadow-focus-ring',
                          'disabled:opacity-50',
                        )}
                      >
                        {SELECTABLE_ROLES.map((r) => (
                          <option key={r} value={r}>
                            {roleLabel[r]}
                          </option>
                        ))}
                      </select>
                    ) : null}
                  </td>
                  <td className="py-3 px-3">
                    <StatusBadge active={row.isActive} />
                  </td>
                  <td className="py-3 pr-5 pl-3 text-right">
                    {row.isSelf || !row.isActive ? (
                      <span className="text-[11px] text-muted-foreground">—</span>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setOffboardTarget(row)}
                        disabled={isPending && pendingRowId === row.id}
                      >
                        退職処理
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <ul className="md:hidden divide-y divide-border/40">
            {rows.map((row) => (
              <li key={row.id} className="p-4 space-y-3">
                <div className="min-w-0">
                  <p className="display text-sm font-semibold tracking-crisp truncate inline-flex items-center gap-2">
                    {row.name}
                    {row.isSelf ? (
                      <span className="text-[10px] kicker text-muted-foreground">あなた</span>
                    ) : null}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{row.email}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {row.isSelf ? (
                    <RoleBadge role={row.role} label={roleLabel[row.role]} tone={roleTone[row.role]} />
                  ) : (
                    <select
                      aria-label={`${row.name} の役割を変更`}
                      value={row.role}
                      disabled={isPending && pendingRowId === row.id}
                      onChange={(e) =>
                        void handleRoleChange(row, e.target.value as AdminRole)
                      }
                      className="rounded-md border border-border bg-card px-2 h-8 text-xs"
                    >
                      {SELECTABLE_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {roleLabel[r]}
                        </option>
                      ))}
                    </select>
                  )}
                  <StatusBadge active={row.isActive} />
                </div>
                {!row.isSelf && row.isActive ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setOffboardTarget(row)}
                    disabled={isPending && pendingRowId === row.id}
                  >
                    退職処理
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      </section>

      <InviteDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        onError={setErrorMsg}
        onSuccess={refresh}
        roleLabel={roleLabel}
      />
      <OffboardDialog
        target={offboardTarget}
        onCancel={() => setOffboardTarget(null)}
        onConfirm={handleOffboard}
        pending={isPending}
      />
    </>
  );
}

function RoleBadge({ role, label, tone }: { role: AdminRole; label: string; tone: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 h-6 text-[10px] font-medium tracking-wide',
        tone,
      )}
    >
      {role === 'admin' ? (
        <Crown aria-hidden strokeWidth={1.6} className="size-3" />
      ) : role === 'manager' ? (
        <ShieldCheck aria-hidden strokeWidth={1.6} className="size-3" />
      ) : null}
      {label}
    </span>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  if (active) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-chitose/45 bg-chitose-muted/30 text-chitose px-2 h-6 text-[10px] font-medium">
        <UserCheck aria-hidden strokeWidth={1.6} className="size-3" />
        稼働中
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-foreground/20 bg-muted text-muted-foreground px-2 h-6 text-[10px] font-medium">
      <UserX aria-hidden strokeWidth={1.6} className="size-3" />
      停止
    </span>
  );
}

interface InviteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onError: (msg: string | null) => void;
  onSuccess: () => void;
  roleLabel: Record<AdminRole, string>;
}

function InviteDialog({ open, onOpenChange, onError, onSuccess, roleLabel }: InviteDialogProps) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<AdminRole>('sales');
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    onError(null);
    if (!email.trim()) {
      onError('メールアドレスを入力してください。');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/invite', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': generateIdempotencyKey('inv'),
        },
        body: JSON.stringify({
          email: email.trim(),
          role,
          name: name.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        onError(`招待に失敗しました: ${data.error ?? res.statusText}`);
        return;
      }
      // success
      setEmail('');
      setName('');
      setRole('sales');
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>メンバーを招待</DialogTitle>
          <DialogDescription>
            指定したメールアドレスに招待リンクを送信します。受け取った人はメール内のリンクからオンボーディングを開始できます。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="invite-email">メールアドレス</Label>
            <Input
              id="invite-email"
              type="email"
              placeholder="member@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="invite-name">表示名 (任意)</Label>
            <Input
              id="invite-name"
              type="text"
              placeholder="山田 太郎"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="invite-role">役割</Label>
            <select
              id="invite-role"
              value={role}
              onChange={(e) => setRole(e.target.value as AdminRole)}
              className={cn(
                'w-full rounded-md border border-border bg-card px-3 h-10 text-sm',
                'focus-visible:outline-none focus-visible:shadow-focus-ring',
              )}
            >
              {SELECTABLE_ROLES.map((r) => (
                <option key={r} value={r}>
                  {roleLabel[r]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            キャンセル
          </Button>
          <Button
            type="button"
            variant="cinnabar"
            onClick={() => void submit()}
            disabled={submitting || !email.trim()}
          >
            {submitting ? '送信中…' : '招待を送る'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OffboardDialog({
  target,
  onCancel,
  onConfirm,
  pending,
}: {
  target: AdminUserRow | null;
  onCancel: () => void;
  onConfirm: (row: AdminUserRow) => Promise<void>;
  pending: boolean;
}) {
  const open = target !== null;
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>退職処理を行いますか？</DialogTitle>
          <DialogDescription>
            {target ? (
              <>
                <strong className="font-semibold">{target.name}</strong> ({target.email}) を停止します。本人はログインできなくなり、保有データの引き継ぎは別途チェックリストに従って手動で行ってください。
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
            キャンセル
          </Button>
          <Button
            type="button"
            variant="cinnabar"
            onClick={() => target && void onConfirm(target)}
            disabled={pending || target === null}
          >
            {pending ? '処理中…' : '退職として記録する'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
