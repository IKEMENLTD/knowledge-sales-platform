'use client';

import { ChevronDown, FileText, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { SubmitButton } from '@/components/ui/submit-button';
import { acceptTerms } from '@/lib/auth/onboarding';
import { cn } from '@/lib/utils';

type Props = {
  termsBody: string;
  privacyBody: string;
  termsVersion: string;
  privacyVersion: string;
  showError?: boolean;
};

export function StepConsent({
  termsBody,
  privacyBody,
  termsVersion,
  privacyVersion,
  showError,
}: Props) {
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const canSubmit = agreeTerms && agreePrivacy;

  return (
    <form action={acceptTerms} className="space-y-6">
      <header className="space-y-2">
        <p className="kicker">Step 01 — 同意事項の確認</p>
        <h2 className="display text-2xl md:text-3xl font-semibold tracking-crisp">
          利用規約と個人情報の取り扱いを、ご確認ください。
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground max-w-prose">
          同意の記録は安全に保管されます。あとから「設定」画面で内容と同意日時を確認できます。
        </p>
      </header>

      {showError ? (
        <Alert variant="warning" aria-live="polite">
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
        body={termsBody}
      />
      <DocumentDetail
        Icon={ShieldCheck}
        title="プライバシーポリシー"
        version={privacyVersion}
        body={privacyBody}
      />

      <fieldset className="space-y-3 rounded-lg border border-border/60 bg-card/60 p-4 shadow-sumi-sm">
        <legend className="sr-only">同意確認</legend>
        <Checkbox
          name="agree_terms"
          label="利用規約に同意します。"
          checked={agreeTerms}
          onChange={setAgreeTerms}
        />
        <Checkbox
          name="agree_privacy"
          label="プライバシーポリシーを確認し、内容に同意します。"
          checked={agreePrivacy}
          onChange={setAgreePrivacy}
        />
      </fieldset>

      <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
        <p className="text-xs text-muted-foreground">
          同意の記録には、版数 ({termsVersion} / {privacyVersion}) と内容のハッシュ・同意日時・接続元情報が
          含まれます。
        </p>
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
  body,
}: {
  Icon: typeof FileText;
  title: string;
  version: string;
  body: string;
}) {
  return (
    <details className="group rounded-lg border border-border/60 bg-card/40 overflow-hidden">
      <summary
        className={cn(
          'cursor-pointer list-none flex items-center justify-between gap-3 p-4',
          'transition-colors duration-fast ease-sumi hover:bg-accent/40',
        )}
      >
        <span className="flex items-center gap-3">
          <Icon
            aria-hidden
            strokeWidth={1.6}
            className="size-4 shrink-0 text-cinnabar"
          />
          <span className="display text-sm font-semibold tracking-crisp">{title}</span>
          <span className="kicker">v{version}</span>
        </span>
        <ChevronDown
          aria-hidden
          className="size-4 text-muted-foreground transition-transform duration-fast ease-sumi group-open:rotate-180"
        />
      </summary>
      <div className="border-t border-border/60 px-4 py-4 max-h-72 overflow-y-auto [overscroll-behavior:contain]">
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
}: {
  name: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer text-sm">
      <input
        type="checkbox"
        name={name}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className={cn(
          'mt-0.5 size-5 shrink-0 rounded-sm border border-border bg-card cursor-pointer',
          'transition-[border-color,background-color] duration-fast ease-sumi',
          'checked:bg-cinnabar checked:border-cinnabar',
          'focus-visible:outline-none focus-visible:shadow-focus-ring-cinnabar',
          'accent-cinnabar',
        )}
      />
      <span className="leading-relaxed">{label}</span>
    </label>
  );
}
