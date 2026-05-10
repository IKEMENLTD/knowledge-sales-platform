/** Editorial loading skeleton — shimmer + content shape hint。 */
export function SectionSkeleton({
  title = '読み込み中',
  rows = 4,
}: {
  title?: string;
  rows?: number;
}) {
  return (
    <div
      className="space-y-8 max-w-3xl mx-auto"
      role="status"
      aria-live="polite"
      aria-label={title}
    >
      <div className="space-y-3">
        <div className="skeleton h-3 w-20 rounded-sm" />
        <div className="skeleton h-9 w-2/3 rounded-md" />
        <div className="skeleton h-4 w-1/2 rounded-sm" />
      </div>
      <div className="hairline" aria-hidden />
      <div className="grid gap-3">
        {Array.from({ length: rows }).map((_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholder
          <div
            key={i}
            className="rounded-xl border border-border/60 bg-card/60 shadow-sumi-sm overflow-hidden"
          >
            <div className="p-5 flex items-start gap-4">
              <div className="skeleton h-10 w-10 rounded-lg shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="skeleton h-3.5 w-1/3 rounded-sm" />
                <div className="skeleton h-3 w-3/4 rounded-sm" />
                <div className="skeleton h-3 w-2/4 rounded-sm" />
              </div>
            </div>
          </div>
        ))}
      </div>
      <span className="sr-only">{title}…</span>
    </div>
  );
}
