'use client';

import { SectionErrorBoundary } from '@/components/layout/section-error';

export default function RecordingsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <SectionErrorBoundary
      boundary="recordings"
      title="録画一覧を表示できませんでした"
      error={error}
      reset={reset}
    />
  );
}
