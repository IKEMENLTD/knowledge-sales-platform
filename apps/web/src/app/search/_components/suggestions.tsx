import { cn } from '@/lib/utils';
import { Sparkles } from 'lucide-react';
import Link from 'next/link';

/**
 * 検索サジェスト — Server Component。
 *
 * - 「よく聞かれる質問」は server から固定 5 件を受ける。
 *   (本番では別 agent が `popular_searches_view` から伸ばす想定)
 * - 「あなたの直近の検索」は `search_queries` から server で取得した履歴を受ける。
 * - 0件時にだけ render される (page.tsx 側で出し分け)。
 */

export const DEFAULT_SUGGESTED_QUERIES = [
  '価格交渉で押し返された商談',
  '導入時に詰まりやすい論点',
  '受注に至った理由が明確な案件',
  'POC 評価後に失注した理由',
  'CTO が同席した商談',
] as const;

export type RecentQuery = {
  id: string;
  query: string;
  /** ISO datetime */
  createdAt: string;
  resultCount: number;
};

export function Suggestions({
  popular,
  recent,
  currentQuery,
}: {
  popular: readonly string[];
  recent: readonly RecentQuery[];
  currentQuery: string;
}) {
  return (
    <aside
      className="rounded-xl border border-dashed border-cinnabar/35 bg-cinnabar/5 p-5 space-y-4"
      aria-label="検索のヒント"
    >
      <div className="flex items-start gap-3">
        <Sparkles aria-hidden strokeWidth={1.6} className="size-5 shrink-0 text-cinnabar mt-0.5" />
        <div className="space-y-1 text-sm">
          <p className="font-medium">クエリのヒント</p>
          <p className="text-muted-foreground leading-relaxed">
            社の知見は「目的・場面・反応」を 1
            文に入れると当たりやすくなります。固有名詞より、起きた事象を入れると意味検索が効きます。
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <p className="kicker">よく聞かれる質問</p>
        <ul className="flex flex-wrap gap-2">
          {popular.map((p) => {
            const active = p === currentQuery;
            return (
              <li key={p}>
                <Link
                  href={`/search?q=${encodeURIComponent(p)}` as never}
                  aria-current={active ? 'true' : undefined}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full border',
                    'px-3 h-8 text-xs',
                    'transition-colors duration-fast ease-sumi',
                    active
                      ? 'border-cinnabar/55 text-cinnabar bg-cinnabar/10'
                      : 'border-border/70 bg-card/60 text-foreground hover:border-cinnabar/45 hover:text-cinnabar hover:bg-cinnabar/8',
                  )}
                >
                  {p}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>

      {recent.length > 0 ? (
        <div className="space-y-2">
          <p className="kicker">あなたの直近の検索</p>
          <ul className="space-y-1">
            {recent.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/search?q=${encodeURIComponent(r.query)}` as never}
                  className={cn(
                    'inline-flex items-center justify-between gap-3 w-full rounded-md',
                    'px-2 h-8 text-xs',
                    'text-foreground/80 hover:text-cinnabar hover:bg-cinnabar/6',
                    'transition-colors duration-fast ease-sumi',
                  )}
                >
                  <span className="truncate">{r.query}</span>
                  <span className="kicker tabular shrink-0">
                    {r.resultCount} 件 ・ {relativeJa(r.createdAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </aside>
  );
}

function relativeJa(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const diffMin = Math.round((Date.now() - d.getTime()) / (1000 * 60));
  if (diffMin < 1) return 'たった今';
  if (diffMin < 60) return `${diffMin} 分前`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH} 時間前`;
  const diffD = Math.round(diffH / 24);
  if (diffD < 7) return `${diffD} 日前`;
  return d.toISOString().slice(0, 10);
}
