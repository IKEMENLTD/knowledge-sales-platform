'use client';

import { SectionErrorBoundary } from '@/components/layout/section-error';

export default function SettingsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <SectionErrorBoundary
      boundary="settings"
      title="設定を表示できませんでした"
      error={error}
      reset={reset}
    />
  );
}
