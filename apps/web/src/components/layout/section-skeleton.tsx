/**
 * 認証済みセクション (settings / contacts / meetings / recordings / search / admin /
 * mobile / onboarding) で共通利用する loading skeleton。
 *
 * 設計書 20_failure_recovery / 21_a11y_i18n に基づき:
 * - role="status" + aria-live="polite" でスクリーンリーダ通知
 * - prefers-reduced-motion 時は globals.css 側で animation を抑制
 *
 * 既存 dashboard/loading.tsx は KPI 専用 skeleton を持つので個別維持する。
 */
export function SectionSkeleton({
  title = '読み込み中',
  rows = 4,
}: {
  title?: string;
  rows?: number;
}) {
  return (
    <div
      className="space-y-6 animate-pulse"
      role="status"
      aria-live="polite"
      aria-label={title}
    >
      <div className="space-y-3">
        <div className="h-8 w-1/3 rounded bg-muted" />
        <div className="h-4 w-1/2 rounded bg-muted" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholder
          <div key={i} className="h-16 rounded-lg border border-border bg-card" />
        ))}
      </div>
      <span className="sr-only">{title}…</span>
    </div>
  );
}
