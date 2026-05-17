'use client';

import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { AlertTriangle, ArrowUpRight, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import type { QueueItem } from './upload-queue';

/**
 * キュー全体の結果サマリー。
 *   - 完了 (新規) の contact について「レビュー画面へ」リンク
 *   - 重複検出 (duplicateOf 有り) の contact について master へのリンクを cinnabar 帯で
 *
 * 件数が 0 のときは何も描画しない。
 */
export function UploadResult({ items }: { items: QueueItem[] }) {
  const done = items.filter((i) => i.stage === 'done' && i.contactId);
  if (done.length === 0) return null;

  const duplicates = done.filter((i) => i.duplicateOf);
  const fresh = done.filter((i) => !i.duplicateOf);

  return (
    <section aria-label="取り込み結果" className="space-y-4 animate-fade-up [animation-delay:60ms]">
      <header className="flex items-baseline gap-3">
        <span className="section-no text-base">№ 03</span>
        <h2 className="display text-lg font-semibold tracking-crisp">取り込み結果</h2>
        <span className="kicker tabular">{done.length} 件</span>
      </header>

      {duplicates.length > 0 ? (
        <output
          className={cn(
            'rounded-lg border border-cinnabar/35 bg-cinnabar-muted/30 p-4',
            'flex items-start gap-3',
          )}
        >
          <AlertTriangle
            aria-hidden
            strokeWidth={1.6}
            className="size-5 text-cinnabar mt-0.5 shrink-0"
          />
          <div className="space-y-2 min-w-0 flex-1">
            <p className="text-sm leading-relaxed text-cinnabar">
              <span className="font-semibold">{duplicates.length} 件</span>
              が、すでに登録済みの名刺と一致しました。重ねて登録せず、既存の人物に紐づけてあります。
            </p>
            <ul className="space-y-1">
              {duplicates.map((item) => (
                <li key={item.id} className="flex items-center gap-2 text-sm">
                  <span className="truncate text-foreground/80 max-w-[16rem]">
                    {item.file.name}
                  </span>
                  <span aria-hidden className="text-muted-foreground">
                    ·
                  </span>
                  {item.duplicateOf ? (
                    <Link
                      href={`/contacts/${item.duplicateOf}/review` as never}
                      className="inline-flex items-center gap-1 text-cinnabar hover:underline underline-offset-[6px] decoration-cinnabar"
                    >
                      既存の名刺を見る
                      <ArrowUpRight aria-hidden className="size-3.5" />
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        </output>
      ) : null}

      {fresh.length > 0 ? (
        <Card className="p-4 space-y-3">
          <div className="flex items-start gap-3">
            <CheckCircle2
              aria-hidden
              strokeWidth={1.6}
              className="size-5 text-chitose mt-0.5 shrink-0"
            />
            <div className="space-y-2 min-w-0 flex-1">
              <p className="text-sm leading-relaxed">
                <span className="font-semibold">{fresh.length} 件</span>{' '}
                を新しく取り込みました。読み取り精度に自信のないものはレビュー画面で確認してください。
              </p>
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1.5">
                {fresh.map((item) => {
                  // fresh = items.filter(i => i.stage==='done' && i.contactId) なので
                  // ここで contactId は必ず存在する。型は string|undefined だが、
                  // フォールバックの空文字も書かず明示 guard する。
                  const contactId = item.contactId;
                  if (!contactId) return null;
                  return (
                    <li key={item.id} className="text-sm">
                      <Link
                        href={`/contacts/${contactId}/review` as never}
                        className="inline-flex items-center gap-1.5 max-w-full"
                      >
                        <span className="truncate max-w-[16rem]">{item.file.name}</span>
                        <ArrowUpRight
                          aria-hidden
                          className="size-3.5 text-muted-foreground shrink-0 transition-colors group-hover:text-cinnabar"
                        />
                        <span className="text-xs text-muted-foreground shrink-0">
                          レビュー画面へ
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </Card>
      ) : null}
    </section>
  );
}
