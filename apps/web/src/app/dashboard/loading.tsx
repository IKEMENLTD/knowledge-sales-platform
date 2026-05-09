export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse" role="status" aria-label="読み込み中">
      <div className="h-8 w-1/3 rounded bg-muted" />
      <div className="h-4 w-1/2 rounded bg-muted" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholder
          <div key={i} className="h-32 rounded-lg border border-border bg-card" />
        ))}
      </div>
      <span className="sr-only">読み込み中です…</span>
    </div>
  );
}
