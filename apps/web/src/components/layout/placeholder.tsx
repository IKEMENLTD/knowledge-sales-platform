import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ReactNode } from 'react';

/**
 * Editorial placeholder for未実装画面。
 *  - 内部仕様コード (scCode/taskCode) は採番ロジック用にだけ受け取り、DOM には出さない
 *  - "もうすぐ使えます" コピーで brand voice 統一
 *  - kicker (№ + 部門) + display title + hairline で editorial feel
 *  - children で個別 CTA を追加可能
 */
export function PagePlaceholder({
  scCode,
  taskCode: _taskCode,
  title,
  kicker,
  description,
  helpText,
  comingSoonNote,
  children,
}: {
  /** 採番ロジックのためだけに受け取る (UI へは番号としてのみ反映、コード文字列は露出させない) */
  scCode: string;
  /** 互換のため受け取るが UI には出さない (Phase 1 placeholder の呼び出し互換性のため残置) */
  taskCode?: string;
  title: string;
  /** "営業 / 名刺" のような editorial kicker */
  kicker: string;
  description: string;
  helpText: string;
  /** "もうすぐ使えます" の代わりに使いたい場合 */
  comingSoonNote?: string;
  children?: ReactNode;
}) {
  const sectionNo = scCode.replace(/^SC-?/, '').padStart(2, '0');
  return (
    <div className="space-y-8 max-w-3xl mx-auto">
      <header className="space-y-3 animate-fade-up">
        <p className="kicker">
          № {sectionNo} — {kicker}
        </p>
        <h1 className="display text-3xl md:text-4xl font-semibold tracking-crisp text-balance">
          {title}
        </h1>
        <p className="text-base leading-relaxed text-muted-foreground max-w-prose">{description}</p>
      </header>

      <div className="hairline" aria-hidden />

      <Card className="animate-fade-up [animation-delay:60ms]">
        <CardHeader className="flex-row items-baseline justify-between gap-3">
          <CardTitle>もうすぐ使えます</CardTitle>
          <span className="kicker shrink-0">準備中</span>
        </CardHeader>
        <CardContent>
          <p className="text-sm md:text-[0.95rem] leading-7 text-foreground/80 whitespace-pre-line">
            {helpText}
          </p>
          {comingSoonNote ? (
            <p className="mt-4 text-xs text-muted-foreground border-l-2 border-cinnabar/60 pl-3 py-1">
              {comingSoonNote}
            </p>
          ) : null}
          {children}
        </CardContent>
      </Card>
    </div>
  );
}
