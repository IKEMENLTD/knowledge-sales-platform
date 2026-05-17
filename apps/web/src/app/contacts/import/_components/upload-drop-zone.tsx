'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AlertTriangle, FileImage, UploadCloud } from 'lucide-react';
import { useCallback, useState } from 'react';
import { type FileRejection, useDropzone } from 'react-dropzone';

/**
 * 名刺アップロードのドロップ枠。
 *
 * - 一度に複数枚 OK
 * - キーボード: Enter / Space で <input type="file"> を開く
 * - 4MB 超は warning として収集、10MB 超は完全 reject
 * - drop した瞬間 cinnabar pulse (CSS animation utility は globals.css ではなく
 *   tailwind の animate-* + ring/shadow で表現)
 */

const ACCEPT = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'image/heic': ['.heic', '.heif'],
};

const SOFT_LIMIT = 4 * 1024 * 1024; // 4MB
const HARD_LIMIT = 10 * 1024 * 1024; // 10MB

export interface UploadDropZoneProps {
  onAccept: (files: File[]) => void;
  /** 既存キューが空かどうかで CTA コピーを変える */
  hasItems: boolean;
}

interface DropFeedback {
  warnings: string[];
  rejections: string[];
}

export function UploadDropZone({ onAccept, hasItems }: UploadDropZoneProps) {
  const [pulseKey, setPulseKey] = useState(0);
  const [feedback, setFeedback] = useState<DropFeedback>({ warnings: [], rejections: [] });

  const handleDrop = useCallback(
    (accepted: File[], rejected: FileRejection[]) => {
      const warnings: string[] = [];
      const rejections: string[] = [];

      // 4MB 超は通すが警告
      for (const f of accepted) {
        if (f.size > SOFT_LIMIT) {
          warnings.push(
            `${truncateName(f.name)} は ${formatSize(f.size)} です。読み取り前に自動で圧縮します。`,
          );
        }
      }

      for (const r of rejected) {
        const reason = r.errors[0];
        if (reason?.code === 'file-too-large') {
          rejections.push(`${truncateName(r.file.name)} は 10MB を超えるため受け付けません。`);
        } else if (reason?.code === 'file-invalid-type') {
          rejections.push(`${truncateName(r.file.name)} は対応していない形式です。`);
        } else {
          rejections.push(`${truncateName(r.file.name)} は読み込めませんでした。`);
        }
      }

      setFeedback({ warnings, rejections });

      if (accepted.length > 0) {
        // ring 残光を一瞬光らせるため key を更新して再 mount → fade-in を再発火
        setPulseKey((k) => k + 1);
        onAccept(accepted);
      }
    },
    [onAccept],
  );

  const { getRootProps, getInputProps, isDragActive, isFocused, open } = useDropzone({
    onDrop: handleDrop,
    accept: ACCEPT,
    maxSize: HARD_LIMIT,
    multiple: true,
    noClick: false,
    noKeyboard: false,
  });

  return (
    <div className="space-y-3">
      <div
        {...getRootProps({
          className: cn(
            'group relative rounded-xl border-2 border-dashed border-border/70',
            'bg-card/40 px-6 py-10 md:py-14',
            'transition-[border-color,background-color,box-shadow,transform]',
            'duration-fast ease-sumi cursor-pointer',
            'hover:border-cinnabar/55 hover:bg-card/70',
            'focus-visible:outline-none focus-visible:shadow-focus-ring-cinnabar',
            (isDragActive || isFocused) &&
              'border-cinnabar/70 bg-cinnabar-muted/30 shadow-cinnabar-glow',
          ),
          role: 'button',
          tabIndex: 0,
          'aria-label': hasItems ? '名刺をさらに追加する' : '名刺をアップロードする',
        })}
      >
        <input {...getInputProps()} aria-hidden tabIndex={-1} />

        {/* cinnabar pulse: drop された瞬間に key 更新 → 一回だけ fade-in する ring */}
        {pulseKey > 0 ? (
          <span
            key={pulseKey}
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-xl shadow-cinnabar-glow animate-fade-in"
            style={{ animationDuration: '480ms' }}
          />
        ) : null}

        <div className="flex flex-col items-center text-center gap-4">
          <div
            aria-hidden
            className={cn(
              'inline-flex items-center justify-center size-14 rounded-full',
              'bg-cinnabar/10 text-cinnabar transition-transform duration-fast ease-sumi',
              'group-hover:-translate-y-0.5',
              isDragActive && 'bg-cinnabar/20',
            )}
          >
            <UploadCloud strokeWidth={1.6} className="size-7" />
          </div>

          <div className="space-y-1.5 max-w-md">
            <p className="display text-lg font-semibold tracking-crisp">
              {isDragActive
                ? 'ここに離して取り込む'
                : hasItems
                  ? '別の名刺をここに追加'
                  : '名刺の画像をドラッグして取り込む'}
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              JPEG / PNG / WebP / HEIC・1 枚あたり 10MB まで・複数枚まとめて OK です。
            </p>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <Button
              type="button"
              variant="cinnabar"
              size="sm"
              onClick={(e) => {
                // ルートの click 経由でも開くが、ボタン強調のため明示
                e.stopPropagation();
                open();
              }}
              aria-label="ファイルを選択してアップロード"
            >
              <FileImage aria-hidden className="size-4" />
              ファイルを選択
            </Button>
            <span className="kicker tabular hidden sm:inline">又は Enter で開く</span>
          </div>
        </div>
      </div>

      {/* 警告と reject 通知 (aria-live 経由で読み上げ) */}
      <DropFeedbackList feedback={feedback} />

      {/* 補助的な仕様帯 */}
      <p className="text-xs text-muted-foreground border-l-2 border-border/60 pl-3">
        位置情報や撮影機材の情報は、社内に取り込む前に自動で取り除きます。
      </p>
    </div>
  );
}

function DropFeedbackList({ feedback }: { feedback: DropFeedback }) {
  if (feedback.warnings.length === 0 && feedback.rejections.length === 0) return null;
  return (
    <div className="space-y-2" aria-live="polite">
      {feedback.warnings.map((w) => (
        <output
          key={`w:${w}`}
          className={cn(
            'flex items-start gap-2 rounded-md border border-cinnabar/30',
            'bg-cinnabar-muted/40 px-3 py-2 text-sm text-cinnabar',
          )}
        >
          <AlertTriangle aria-hidden strokeWidth={1.6} className="size-4 mt-0.5 shrink-0" />
          <span className="leading-snug">{w}</span>
        </output>
      ))}
      {feedback.rejections.map((r) => (
        <div
          key={`r:${r}`}
          className={cn(
            'flex items-start gap-2 rounded-md border border-destructive/30',
            'bg-destructive/8 px-3 py-2 text-sm text-destructive',
          )}
          role="alert"
        >
          <AlertTriangle aria-hidden strokeWidth={1.6} className="size-4 mt-0.5 shrink-0" />
          <span className="leading-snug">{r}</span>
        </div>
      ))}
    </div>
  );
}

function truncateName(name: string, max = 36): string {
  if (name.length <= max) return name;
  return `${name.slice(0, max - 3)}…`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}
