'use client';

import { SectionErrorBoundary } from '@/components/layout/section-error';

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <SectionErrorBoundary
      boundary="admin"
      title="管理画面を表示できませんでした"
      error={error}
      reset={reset}
    />
  );
}
