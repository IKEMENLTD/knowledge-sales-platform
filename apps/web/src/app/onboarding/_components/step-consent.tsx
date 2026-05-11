'use client';

import { ChevronDown, FileText, ShieldCheck } from 'lucide-react';
import { useId, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { SubmitButton } from '@/components/ui/submit-button';
import { acceptTerms } from '@/lib/auth/onboarding';
import { cn } from '@/lib/utils';

type Props = {
  termsBody: string;
  privacyBody: string;
  termsVersion: string;
  privacyVersion: string;
  termsHash: string;
  privacyHash: string;
  /** error 復帰時に checkbox 状態を保持 (UX Critical-1) */
  prevAgreeTerms?: boolean;
  prevAgreePrivacy?: boolean;
  showError?: boolean;
};

export function StepConsent({
  termsBody,
  privacyBody,
  termsVersion,
  privacyVersion,
  termsHash,
  privacyHash,
  prevAgreeTerms = false,
  prevAgreePrivacy = false,
  showError = false,
}: Props) {
  const [agreeTerms, setAgreeTerms] = useState(prevAgreeTerms || showError);
  const [agreePrivacy, setAgreePrivacy] = useState(prevAgreePrivacy || showError);
  const canSubmit = agreeTerms && agreePrivacy;
  const recordInfoId = useId();

  return (
    <form action={acceptTerms} className="space-y-6">
      <header className="space-y-2">
        <p className="kicker">Step 01 — 同意事項の確認</p>
        <h2 className="display text-2xl md:text-3xl font-semibold tracking-crisp">
          利用規約と個人情報の取り扱いを、ご確認ください。
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground max-w-prose">
          同意の記録は安全に保管されます。あとから「設定 → プライバシー」画面で内容と同意日時を確認できます。
        </p>
      </header>

      {/* 取得情報・利用目的・委託先・保管期間のサマリーを常時表示 (Compliance H-4) */}
      <div className="rounded-lg border border-border/60 bg-surface-inset/40 p-4 text-xs leading-relaxed text-foreground/85 space-y-2">
        <p className="kicker">事前にご確認ください</p>
        <dl className="grid gap-1.5 [grid-template-columns:auto_1fr] gap-x-3">
          <dt className="font-medium text-foreground">取得情報</dt>
          <dd>商談予定 / 名刺画像 / 録画 / 連絡先 / Google プロフィール</dd>
          <dt className="font-medium text-foreground">利用目的</dt>
          <dd>営業活動の記録・社内ナレッジ蓄積・組織パフォーマンス分析</dd>
          <dt className="font-medium text-foreground">委託先</dt>
          <dd>Anthropic・OpenAI・Cloudflare・Render (米国) / Supabase (シンガポール)</dd>
          <dt className="font-medium text-foreground">保管期間</dt>
          <dd>最終利用から 3 年 または 退職後 60 日 のいずれか早い日</dd>
          <dt className="font-medium text-foreground">同意の撤回</dt>
          <dd>いつでも「設定 → プライバシー」から同じ手数で撤回できます</dd>
        </dl>
      </div>

      {showError ? (
        <Alert variant="warning" role="alert" aria-live="assertive">
          <AlertTitle>両方への同意が必要です</AlertTitle>
          <AlertDescription>
            次へ進むには、利用規約とプライバシーポリシーの両方にチェックを入れてください。
          </AlertDescription>
        </Alert>
      ) : null}

      <DocumentDetail
        Icon={FileText}
        title="利用規約"
        version={termsVersion}
        hash={termsHash}
        body={termsBody}
        defaultOpen
      />
      <DocumentDetail
        Icon={ShieldCheck}
        title="プライバシーポリシー"
        version={privacyVersion}
        hash={privacyHash}
        body={privacyBody}
        defaultOpen
      />

      <fieldset className="space-y-3 rounded-lg border border-border/60 bg-card/60 p-4 shadow-sumi-sm">
        <legend className="sr-only">同意確認</legend>
        <Checkbox
          name="agree_terms"
          label="利用規約に同意します。"
          checked={agreeTerms}
          onChange={setAgreeTerms}
          describedById={recordInfoId}
        />
        <Checkbox
          name="agree_privacy"
          label="プライバシーポリシーを確認し、内容に同意します。"
          checked={agreePrivacy}
          onChange={setAgreePrivacy}
          describedById={recordInfoId}
        />
        <p id={recordInfoId} className="text-xs text-muted-foreground pt-1">
          同意の記録には、版数・本文の sha256 ハッシュ・同意日時・接続元情報が含まれます。
        </p>
      </fieldset>

      <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-3 pt-2">
        <SubmitButton
          variant="cinnabar"
          size="lg"
          disabled={!canSubmit}
          pendingLabel="記録中…"
        >
          同意して次へ
        </SubmitButton>
      </div>
    </form>
  );
}

function DocumentDetail({
  Icon,
  title,
  version,
  hash,
  body,
  defaultOpen = false,
}: {
  Icon: typeof FileText;
  title: string;
  version: string;
  hash: string;
  body: string;
  defaultOpen?: boolean;
}) {
  return (
    <details
      open={defaultOpen}
      className="group rounded-lg border border-border/60 bg-card/40 overflow-hidden"
    >
      <summary
        className={cn(
          'cursor-pointer list-none flex flex-wrap items-center gap-3 p-4',
          'transition-colors duration-fast ease-sumi hover:bg-accent/40',
        )}
      >
        <Icon aria-hidden strokeWidth={1.6} className="size-4 shrink-0 text-cinnabar" />
        <span className="display text-sm font-semibold tracking-crisp">{title}</span>
        <span className="kicker">v{version} · sha256:{hash.slice(0, 8)}</span>
        <ChevronDown
          aria-hidden
          className="ml-auto size-4 text-muted-foreground transition-transform duration-fast ease-sumi group-open:rotate-180"
        />
      </summary>
      <div
        className="border-t border-border/60 px-4 py-4 max-h-72 overflow-y-auto [overscroll-behavior:contain]"
        tabIndex={0}
        aria-label={`${title}の本文`}
      >
        <pre className="whitespace-pre-wrap font-sans text-xs leading-6 text-foreground/85">
          {body}
        </pre>
      </div>
    </details>
  );
}

function Checkbox({
  name,
  label,
  checked,
  onChange,
  describedById,
}: {
  name: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  describedById?: string;
}) {
  const id = useId();
  const inputId = `${id}-${name}`;
  return (
    <label htmlFor={inputId} className="flex items-start gap-3 cursor-pointer text-sm">
      <input
        type="checkbox"
        id={inputId}
        name={name}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-describedby={describedById}
        style={{ accentColor: 'hsl(var(--cinnabar))' }}
        className={cn(
          'mt-0.5 size-5 shrink-0 rounded-sm cursor-pointer',
          'transition-[outline-color] duration-fast ease-sumi',
          'focus-visible:outline-none focus-visible:shadow-focus-ring-cinnabar',
        )}
      />
      <span className="leading-relaxed">{label}</span>
    </label>
  );
}
