'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { RotateCw, ScanSearch, ZoomIn } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

/**
 * 名刺画像プレビュー。
 *
 *  - クリックで拡大 modal (既存 Dialog)
 *  - 90deg 単位の回転 (CSS transform、保存はせず view のみ)
 *  - 撮影日時 / アップロード者 / OCR provider のメタデータ表示
 *  - "再 OCR" ボタンは UI のみ (API 未実装、disabled tooltip)
 */
export interface ImagePaneProps {
  imageUrl: string | null;
  capturedAt: string | null;
  uploaderName: string | null;
  ocrProvider: string | null;
  ocrConfidence: number | null;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

export function ImagePane({
  imageUrl,
  capturedAt,
  uploaderName,
  ocrProvider,
  ocrConfidence,
}: ImagePaneProps) {
  const [rotation, setRotation] = useState(0);

  const handleRotate = () => {
    setRotation((r) => (r + 90) % 360);
  };

  const handleReocr = () => {
    toast.info('再 OCR はベータ機能です', {
      description: '近日中に「読み直す」アクションを公開予定です。',
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="kicker">画像</p>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={handleRotate}
            aria-label="90度 回転"
            title="90度 回転"
          >
            <RotateCw aria-hidden strokeWidth={1.6} className="size-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleReocr}
            aria-label="再 OCR"
            title="再 OCR (ベータ機能)"
          >
            <ScanSearch aria-hidden strokeWidth={1.6} className="size-4" />再 OCR
          </Button>
        </div>
      </div>

      <Dialog>
        <DialogTrigger asChild>
          <button
            type="button"
            className={cn(
              'group relative block w-full overflow-hidden rounded-xl border border-border/70',
              'bg-surface-inset/40 shadow-sumi-sm',
              'transition-[box-shadow,border-color] duration-fast ease-sumi',
              'hover:border-foreground/25 hover:shadow-sumi',
              'focus-visible:outline-none focus-visible:shadow-focus-ring-cinnabar',
              'aspect-[1.618/1]',
            )}
            aria-label="名刺画像を拡大表示"
          >
            {imageUrl ? (
              <img
                src={imageUrl}
                alt="名刺の写真"
                className="absolute inset-0 h-full w-full object-contain transition-transform duration-med ease-sumi"
                style={{ transform: `rotate(${rotation}deg)` }}
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                <ScanSearch aria-hidden strokeWidth={1.4} className="size-8 opacity-50" />
                <p className="text-xs">画像がまだ用意されていません</p>
              </div>
            )}
            <span
              className={cn(
                'absolute right-2 top-2 inline-flex items-center gap-1 rounded-md border border-border/70 bg-card/90 px-2 py-1',
                'text-[10px] text-muted-foreground backdrop-blur-sm',
                'opacity-0 transition-opacity duration-fast ease-sumi group-hover:opacity-100',
              )}
            >
              <ZoomIn aria-hidden strokeWidth={1.6} className="size-3" />
              拡大
            </span>
          </button>
        </DialogTrigger>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>名刺画像 — 原寸プレビュー</DialogTitle>
            <DialogDescription>
              読み取り元の画像です。クリック外 / Esc で閉じます。
            </DialogDescription>
          </DialogHeader>
          {imageUrl ? (
            <div className="relative w-full overflow-hidden rounded-lg bg-surface-inset/40">
              <img
                src={imageUrl}
                alt="名刺の写真 (拡大)"
                className="max-h-[70vh] w-full object-contain"
                style={{ transform: `rotate(${rotation}deg)` }}
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">画像はまだ用意されていません。</p>
          )}
        </DialogContent>
      </Dialog>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <dt className="text-muted-foreground">撮影 / 取り込み</dt>
        <dd className="tabular text-right text-foreground/80">{formatDateTime(capturedAt)}</dd>

        <dt className="text-muted-foreground">アップロード者</dt>
        <dd className="text-right text-foreground/80 truncate">{uploaderName ?? '—'}</dd>

        <dt className="text-muted-foreground">OCR エンジン</dt>
        <dd className="text-right text-foreground/80">{ocrProvider ?? '—'}</dd>

        <dt className="text-muted-foreground">全体信頼度</dt>
        <dd className="tabular text-right text-foreground/80">
          {ocrConfidence != null ? `${Math.round(ocrConfidence * 100)}%` : '—'}
        </dd>
      </dl>
    </div>
  );
}
