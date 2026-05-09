'use client';

import { SectionErrorBoundary } from '@/components/layout/section-error';

export default function MobileError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <SectionErrorBoundary
      boundary="mobile"
      title="モバイル機能を表示できませんでした"
      error={error}
      reset={reset}
    />
  );
}
