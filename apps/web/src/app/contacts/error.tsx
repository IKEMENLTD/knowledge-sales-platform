'use client';

import { SectionErrorBoundary } from '@/components/layout/section-error';

export default function ContactsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <SectionErrorBoundary
      boundary="contacts"
      title="名刺データを表示できませんでした"
      error={error}
      reset={reset}
    />
  );
}
