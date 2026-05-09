'use client';

import { SectionErrorBoundary } from '@/components/layout/section-error';

export default function MeetingsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <SectionErrorBoundary
      boundary="meetings"
      title="商談一覧を表示できませんでした"
      error={error}
      reset={reset}
    />
  );
}
