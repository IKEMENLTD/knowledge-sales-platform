'use client';

import { SectionErrorBoundary } from '@/components/layout/section-error';

export default function OnboardingError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <SectionErrorBoundary
      boundary="onboarding"
      title="オンボーディングを表示できませんでした"
      error={error}
      reset={reset}
    />
  );
}
