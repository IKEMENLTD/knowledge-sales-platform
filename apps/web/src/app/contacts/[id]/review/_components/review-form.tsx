'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { zodResolver } from '@hookform/resolvers/zod';
import { type ContactUpdateRequest, contactUpdateRequestSchema } from '@ksp/shared';
import { AlertCircle, CheckCircle2, Clock, Save } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { ConfidenceBadge, tierOf } from './confidence-badge';

/**
 * 名刺レビュー — 右ペイン (フォーム)。
 *
 * UX 判断:
 *   - 信頼度低 (<70%) は input の border を amber に固定、label 横に chip 表示。
 *     ユーザは「赤チップ + 黄枠」のフィールドだけ集中して読み直せばよい。
 *   - 楽観的更新: PATCH 投げる前に submitted 状態へ。失敗時は previous 値に巻き戻し。
 *   - Idempotency-Key は submit 毎に新規 UUID (再 submit はサーバ側で別操作扱い)。
 *   - 3 アクションは全て disabled while pending を共有 (誤連打防止)。
 *
 * API 未デプロイ (404 / network error) では「準備中」 toast でフォーム値は保持。
 */

export interface ReviewFormInitialValues {
  id: string;
  name: string;
  nameKana: string;
  title: string;
  companyName: string;
  email: string;
  phone: string;
  linkedinUrl: string;
  tags: string[];
  reviewStatus: string;
}

export interface FieldConfidence {
  name?: number | null;
  nameKana?: number | null;
  title?: number | null;
  email?: number | null;
  phone?: number | null;
  companyName?: number | null;
}

interface ReviewFormProps {
  initial: ReviewFormInitialValues;
  fieldConfidence: FieldConfidence;
  /** 重複候補が 1 件以上あるか (「重複として扱う」ボタンの enable 判定) */
  hasDuplicates: boolean;
}

type ActionKind = 'verify' | 'duplicate' | 'later';

const TAG_SEP = /[,、\s]+/;

function tagsFromInput(raw: string): string[] {
  return raw
    .split(TAG_SEP)
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .slice(0, 20);
}

export function ReviewForm({ initial, fieldConfidence, hasDuplicates }: ReviewFormProps) {
  const router = useRouter();
  const [pendingAction, setPendingAction] = useState<ActionKind | null>(null);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
    getValues,
    reset,
  } = useForm<ContactUpdateRequest & { tagsRaw: string }>({
    resolver: zodResolver(contactUpdateRequestSchema),
    defaultValues: {
      name: initial.name,
      nameKana: initial.nameKana || undefined,
      title: initial.title || undefined,
      companyName: initial.companyName || undefined,
      email: initial.email || undefined,
      phone: initial.phone || undefined,
      linkedinUrl: initial.linkedinUrl || undefined,
      tags: initial.tags,
    },
  });

  const submit = async (action: ActionKind) => {
    const values = getValues();
    const tagsRawValue = (values as ContactUpdateRequest & { tagsRaw?: string }).tagsRaw;
    const tags = typeof tagsRawValue === 'string' ? tagsFromInput(tagsRawValue) : initial.tags;

    const reviewStatus: ContactUpdateRequest['reviewStatus'] =
      action === 'verify' ? 'verified' : action === 'duplicate' ? 'duplicate_suspect' : undefined;

    const payload: ContactUpdateRequest = {
      ...values,
      tags,
      reviewStatus,
    };

    // 空文字を undefined に正規化 (zod の optional().nullable() 通過のため)
    for (const key of Object.keys(payload) as (keyof ContactUpdateRequest)[]) {
      const v = payload[key];
      if (typeof v === 'string' && v.trim() === '') {
        (payload as Record<string, unknown>)[key] = undefined;
      }
    }

    setPendingAction(action);
    const idempotencyKey = crypto.randomUUID();
    const snapshotForRollback = { ...initial };

    try {
      const res = await fetch(`/api/contacts/${initial.id}`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': idempotencyKey,
        },
        body: JSON.stringify(payload),
      });

      if (res.status === 404) {
        toast.info('保存先 API がまだ準備中です', {
          description: '入力内容はそのまま保持されています。',
        });
        return;
      }
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        reset({
          name: snapshotForRollback.name,
          nameKana: snapshotForRollback.nameKana || undefined,
          title: snapshotForRollback.title || undefined,
          companyName: snapshotForRollback.companyName || undefined,
          email: snapshotForRollback.email || undefined,
          phone: snapshotForRollback.phone || undefined,
          linkedinUrl: snapshotForRollback.linkedinUrl || undefined,
          tags: snapshotForRollback.tags,
        });
        toast.error(`保存に失敗しました (${res.status})`, {
          description: text ? text.slice(0, 160) : undefined,
        });
        return;
      }

      toast.success(
        action === 'verify'
          ? '確認済みに保存しました'
          : action === 'duplicate'
            ? '重複候補としてマークしました'
            : '後で確認する保留中に保存しました',
      );
      startTransition(() => {
        if (action === 'verify' || action === 'duplicate') {
          router.refresh();
        } else {
          router.refresh();
        }
      });
    } catch (err) {
      if (err instanceof TypeError) {
        toast.info('ネットワークに接続できませんでした', {
          description: '入力内容はそのまま保持されています。',
        });
        return;
      }
      toast.error('予期しないエラーが発生しました');
    } finally {
      setPendingAction(null);
    }
  };

  const onValid = () => submit('verify');

  const busy = pendingAction !== null || isPending;

  return (
    <form onSubmit={handleSubmit(onValid)} className="space-y-6" aria-busy={busy} noValidate>
      <FormField
        id="name"
        label="氏名"
        required
        confidence={fieldConfidence.name}
        error={errors.name?.message}
        {...register('name')}
      />
      <FormField
        id="nameKana"
        label="ふりがな"
        confidence={fieldConfidence.nameKana}
        error={errors.nameKana?.message}
        autoComplete="off"
        {...register('nameKana')}
      />
      <FormField
        id="title"
        label="役職 / 部署"
        confidence={fieldConfidence.title}
        error={errors.title?.message}
        {...register('title')}
      />
      <FormField
        id="companyName"
        label="会社名"
        confidence={fieldConfidence.companyName}
        error={errors.companyName?.message}
        {...register('companyName')}
      />
      <FormField
        id="email"
        label="メール"
        type="email"
        inputMode="email"
        autoComplete="email"
        confidence={fieldConfidence.email}
        error={errors.email?.message}
        {...register('email')}
      />
      <FormField
        id="phone"
        label="電話"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        confidence={fieldConfidence.phone}
        error={errors.phone?.message}
        {...register('phone')}
      />
      <FormField
        id="linkedinUrl"
        label="LinkedIn URL"
        type="url"
        inputMode="url"
        autoComplete="url"
        error={errors.linkedinUrl?.message}
        {...register('linkedinUrl')}
      />
      <div className="space-y-1.5">
        <Label htmlFor="tagsRaw" className="flex items-center gap-2">
          タグ
          <span className="text-[10px] text-muted-foreground">カンマ・スペース・読点で区切り</span>
        </Label>
        <Input
          id="tagsRaw"
          defaultValue={initial.tags.join(', ')}
          placeholder="例: 重要顧客, 決裁者"
          {...register('tagsRaw' as never)}
        />
      </div>

      <div className="hairline" aria-hidden />

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Button
          type="button"
          variant="ghost"
          size="default"
          disabled={busy}
          onClick={() => submit('later')}
        >
          <Clock aria-hidden className="size-4" />
          後で確認する
        </Button>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
          <Button
            type="button"
            variant="outline"
            size="default"
            disabled={busy || !hasDuplicates}
            onClick={() => submit('duplicate')}
            title={
              hasDuplicates
                ? '重複候補としてマーク'
                : '重複候補がないため、このアクションは使えません'
            }
            className={cn(
              'border-cinnabar/40 text-cinnabar',
              'hover:bg-cinnabar/8 hover:border-cinnabar/55',
            )}
          >
            <AlertCircle aria-hidden className="size-4" />
            重複として扱う
          </Button>
          <Button
            type="submit"
            variant="cinnabar"
            size="default"
            disabled={busy || (!isDirty && initial.reviewStatus === 'verified')}
          >
            {pendingAction === 'verify' ? (
              <Save aria-hidden className="size-4 animate-pulse" />
            ) : initial.reviewStatus === 'verified' ? (
              <CheckCircle2 aria-hidden className="size-4" />
            ) : (
              <Save aria-hidden className="size-4" />
            )}
            保存して確認済みにする
          </Button>
        </div>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// FormField — label + chip + input + error の一塊
// ---------------------------------------------------------------------------

type FormFieldProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> & {
  id: string;
  label: string;
  confidence?: number | null;
  required?: boolean;
  error?: string;
};

const FormField = (() => {
  // forwardRef は不要 (react-hook-form の register は ref を spread で渡す)
  const Component = (props: FormFieldProps) => {
    const { id, label, confidence, required, error, className, ...rest } = props;
    const tier = tierOf(confidence);
    const lowOrMid = tier === 'low' || tier === 'mid';
    const errorId = error ? `${id}-error` : undefined;
    const hintId = lowOrMid ? `${id}-hint` : undefined;
    const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;

    return (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor={id} className="flex items-center gap-1.5">
            {label}
            {required ? (
              <span aria-label="必須" className="text-cinnabar text-xs">
                *
              </span>
            ) : null}
          </Label>
          <ConfidenceBadge confidence={confidence} />
        </div>
        <Input
          id={id}
          aria-required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            lowOrMid && 'border-amber-500/40 bg-amber-500/5',
            error && 'border-cinnabar/60',
            className,
          )}
          {...rest}
        />
        {hintId ? (
          <p id={hintId} className="text-[11px] text-amber-700 dark:text-amber-300">
            読み取りに自信がありません。画像と見比べて修正してください。
          </p>
        ) : null}
        {errorId ? (
          <p id={errorId} className="text-[11px] text-cinnabar">
            {error}
          </p>
        ) : null}
      </div>
    );
  };
  Component.displayName = 'FormField';
  return Component;
})();
