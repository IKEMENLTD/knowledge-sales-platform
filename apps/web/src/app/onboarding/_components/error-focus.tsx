'use client';

import { useEffect, useRef } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

/**
 * `?error=` 付き遷移時に Alert へ自動で focus を移し、SR が確実にメッセージを読み上げるよう保証。
 * (UX Critical-3 対応)
 */
export function ErrorFocusAlert({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <Alert
      ref={ref}
      tabIndex={-1}
      variant="warning"
      role="alert"
      aria-live="assertive"
      className="mb-6 animate-fade-up"
    >
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{description}</AlertDescription>
    </Alert>
  );
}
