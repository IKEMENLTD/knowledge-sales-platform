'use client';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { AlertTriangle, CheckCircle2, FileImage, RotateCw, X } from 'lucide-react';
import { useState } from 'react';
import type { UploadStage } from '../_lib/upload-pipeline';

/**
 * キュー上の 1 件の状態 + UI ハンドラ。
 * 親 (page.tsx の Client 側 controller) が管理する正本データ。
 */
export interface QueueItem {
  /** UI 用の安定 ID (uuid) */
  id: string;
  file: File;
  /** stripExif/resize 後ではなく、元 file の object URL (サムネ用) */
  previewUrl: string;
  stage: UploadStage;
  percent: number;
  message?: string;
  /** done のとき: 重複時の master contact id */
  duplicateOf?: string | null;
  /** done のとき: 新規 contact_id */
  contactId?: string;
  enqueuedForOcr?: boolean;
  /** failed のとき */
  errorMessage?: string;
  /** API 未準備フラグ (赤ではなく cinnabar/15 で表示) */
  endpointUnavailable?: boolean;
}

export interface UploadQueueProps {
  items: QueueItem[];
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
}

export function UploadQueue({ items, onRemove, onRetry }: UploadQueueProps) {
  if (items.length === 0) return null;

  const totals = summarize(items);

  return (
    <div className="space-y-4">
      <header className="flex items-baseline justify-between gap-4 flex-wrap">
        <div className="flex items-baseline gap-3">
          <span className="section-no text-base">№ 02</span>
          <h2 className="display text-lg font-semibold tracking-crisp">取り込みキュー</h2>
          <span className="kicker tabular">{items.length} 件</span>
        </div>
        <KpiSummary {...totals} />
      </header>

      <ul className="space-y-2.5" aria-label="アップロードキュー">
        {items.map((item) => (
          <li key={item.id}>
            <QueueRow item={item} onRemove={onRemove} onRetry={onRetry} />
          </li>
        ))}
      </ul>

      {/* aria-live で進行を読み上げる (screen reader 用) */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        合計 {items.length} 件のうち {totals.done} 件が完了、{totals.failed} 件が失敗、
        {totals.inflight} 件が処理中です。
      </div>
    </div>
  );
}

function summarize(items: QueueItem[]) {
  let done = 0;
  let failed = 0;
  let inflight = 0;
  let duplicates = 0;
  for (const i of items) {
    if (i.stage === 'done') {
      done++;
      if (i.duplicateOf) duplicates++;
    } else if (i.stage === 'failed') failed++;
    else inflight++;
  }
  return { done, failed, inflight, duplicates };
}

function KpiSummary({
  done,
  failed,
  duplicates,
}: {
  done: number;
  failed: number;
  inflight: number;
  duplicates: number;
}) {
  return (
    <div className="flex items-baseline gap-4 text-xs">
      <span className="tabular text-foreground/80">
        完了 <span className="font-semibold tabular">{done}</span>
      </span>
      <span className="tabular text-cinnabar">
        重複 <span className="font-semibold tabular">{duplicates}</span>
      </span>
      <span className={cn('tabular', failed > 0 ? 'text-destructive' : 'text-muted-foreground')}>
        失敗 <span className="font-semibold tabular">{failed}</span>
      </span>
    </div>
  );
}

function QueueRow({
  item,
  onRemove,
  onRetry,
}: {
  item: QueueItem;
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
}) {
  const stage = item.stage;
  const isInflight =
    stage === 'preparing' ||
    stage === 'requesting' ||
    stage === 'uploading' ||
    stage === 'registering';
  const isDone = stage === 'done';
  const isFailed = stage === 'failed';

  return (
    <Card
      className={cn(
        'flex items-center gap-3 md:gap-4 p-3 md:p-4',
        'border-border/60 animate-fade-up',
        isDone && item.duplicateOf && 'border-cinnabar/40 bg-cinnabar-muted/15',
        isDone && !item.duplicateOf && 'border-chitose/35 bg-chitose-muted/15',
        isFailed && item.endpointUnavailable && 'border-cinnabar/30 bg-cinnabar-muted/15',
        isFailed && !item.endpointUnavailable && 'border-destructive/30 bg-destructive/5',
      )}
    >
      <Thumb url={item.previewUrl} alt={item.file.name} />

      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-baseline justify-between gap-2 flex-wrap">
          <p className="font-medium tracking-crisp truncate text-sm md:text-[0.95rem]">
            {item.file.name}
          </p>
          <p className="text-xs text-muted-foreground tabular shrink-0">
            {formatSize(item.file.size)}
          </p>
        </div>

        <StageLabel item={item} />

        {/* progress bar */}
        <ProgressBar percent={item.percent} stage={stage} />
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {isFailed ? (
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={() => onRetry(item.id)}
            aria-label={`${item.file.name} を再試行`}
            disabled={item.endpointUnavailable}
          >
            <RotateCw aria-hidden className="size-4" />
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => onRemove(item.id)}
          aria-label={`${item.file.name} をキューから外す`}
          disabled={isInflight}
        >
          <X aria-hidden className="size-4" />
        </Button>
      </div>
    </Card>
  );
}

function Thumb({ url, alt }: { url: string; alt: string }) {
  // next/image の object URL は外部 loader 不要だが、HEIC は描画できないので
  // <img> fallback も持たせる。HEIC で onError → アイコン表示。
  const [errored, setErrored] = useState(false);

  // object URL は親で revoke するので、unmount 時 revoke は親に任せる。
  if (errored) {
    return (
      <div
        aria-hidden
        className="flex items-center justify-center size-14 md:size-16 rounded-md border border-border/60 bg-muted/40 text-muted-foreground shrink-0"
      >
        <FileImage strokeWidth={1.6} className="size-6" />
      </div>
    );
  }

  return (
    <div className="relative size-14 md:size-16 rounded-md overflow-hidden border border-border/60 bg-muted/40 shrink-0">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={alt}
        className="size-full object-cover"
        onError={() => setErrored(true)}
        loading="lazy"
        decoding="async"
      />
    </div>
  );
}

function StageLabel({ item }: { item: QueueItem }) {
  const { stage, message, duplicateOf, endpointUnavailable, errorMessage } = item;
  if (stage === 'done') {
    if (duplicateOf) {
      return (
        <p className="text-xs text-cinnabar flex items-center gap-1.5">
          <AlertTriangle aria-hidden strokeWidth={1.8} className="size-3.5" />
          <span>同じ名刺がすでに登録されています</span>
        </p>
      );
    }
    return (
      <p className="text-xs text-chitose flex items-center gap-1.5">
        <CheckCircle2 aria-hidden strokeWidth={1.8} className="size-3.5" />
        <span>取り込み完了 — レビュー待ち</span>
      </p>
    );
  }
  if (stage === 'failed') {
    if (endpointUnavailable) {
      return (
        <p className="text-xs text-cinnabar/90 flex items-center gap-1.5">
          <AlertTriangle aria-hidden strokeWidth={1.8} className="size-3.5" />
          <span>アップロード先がまだ準備中です</span>
        </p>
      );
    }
    return (
      <p className="text-xs text-destructive flex items-center gap-1.5">
        <AlertTriangle aria-hidden strokeWidth={1.8} className="size-3.5" />
        <span>{errorMessage ?? '取り込めませんでした'}</span>
      </p>
    );
  }
  return (
    <p className="text-xs text-muted-foreground">
      {STAGE_TEXT[stage]}
      {message ? <span className="text-foreground/60"> ・ {message}</span> : null}
    </p>
  );
}

const STAGE_TEXT: Record<UploadStage, string> = {
  preparing: '前処理中',
  requesting: '送信準備',
  uploading: '送信中',
  registering: '登録中',
  done: '完了',
  failed: '失敗',
};

function ProgressBar({ percent, stage }: { percent: number; stage: UploadStage }) {
  const isFailed = stage === 'failed';
  const isDone = stage === 'done';
  return (
    <div
      className="relative h-1 w-full rounded-full overflow-hidden bg-border/60"
      role="progressbar"
      tabIndex={-1}
      aria-valuenow={Math.round(percent)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuetext={`${Math.round(percent)} パーセント`}
    >
      <div
        className={cn(
          'h-full transition-[width,background-color] duration-fast ease-sumi',
          isDone ? 'bg-chitose' : isFailed ? 'bg-destructive/70' : 'bg-cinnabar',
        )}
        style={{ width: `${isDone ? 100 : Math.min(100, Math.max(0, percent))}%` }}
      />
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
