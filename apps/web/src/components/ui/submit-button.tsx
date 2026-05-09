'use client';

import { Loader2 } from 'lucide-react';
import { forwardRef, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import { Button, type ButtonProps } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Server Action 用 submit ボタン。useFormStatus() の pending で
 * disabled + spinner 表示 (20_failure_recovery / 21_a11y_i18n)。
 *
 * - disabled 中は aria-busy="true" + aria-live で読み上げ
 * - prefers-reduced-motion 時は globals.css 側でアニメ抑制
 */
export interface SubmitButtonProps extends ButtonProps {
  /** spinner 表示中に併記するラベル (例: "サインイン中…") */
  pendingLabel?: string;
  children: ReactNode;
}

export const SubmitButton = forwardRef<HTMLButtonElement, SubmitButtonProps>(
  ({ className, children, pendingLabel, disabled, ...props }, ref) => {
    const { pending } = useFormStatus();
    const isDisabled = pending || disabled;

    return (
      <Button
        ref={ref}
        type="submit"
        aria-busy={pending || undefined}
        aria-live="polite"
        disabled={isDisabled}
        className={cn(className)}
        {...props}
      >
        {pending ? (
          <>
            <Loader2
              aria-hidden
              className="mr-2 h-4 w-4 animate-spin"
            />
            <span>{pendingLabel ?? '処理中…'}</span>
          </>
        ) : (
          children
        )}
      </Button>
    );
  },
);
SubmitButton.displayName = 'SubmitButton';
