'use client';

import { SectionErrorBoundary } from '@/components/layout/section-error';

export default function SearchError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <SectionErrorBoundary
      boundary="search"
      title="検索結果を表示できませんでした"
      error={error}
      reset={reset}
    />
  );
}
