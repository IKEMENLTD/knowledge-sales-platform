'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { Share2 } from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useId, useState } from 'react';

/**
 * 切り出し共有 (share_links / S-M-06) ダイアログ。
 *
 *  - 開始/終了秒 (HH:MM:SS / mm:ss どちらでも受ける)、パスワード、有効期限、宛先メモ
 *  - パスワードと有効期限は「24時間」「7日」「30日」のプリセット + カスタム
 *  - POST /api/share-links は未実装。submit 時に onCreate コールバックを試行し、
 *    失敗時 (404 等) は「準備中」メッセージとデモトークンを表示
 *  - DB に保存されるのは sha256(token) のみ。URL は 1 度きり (再表示不可) を文言で明示
 *
 * a11y:
 *  - Dialog の Title/Description 必須
 *  - 各 input は Label と紐付け、エラーは aria-describedby で読み上げ
 */

export interface ShareLinkDialogProps {
  recordingId: string;
  /** 動画全長 (秒) — 0 を渡すと start/end の上限 validation を行わない */
  durationSec: number;
  /** 開始時刻のデフォルト (現在再生秒数等を渡す) */
  initialStartSec?: number;
  /** API 実装後はここから POST。未実装なら undefined or throw */
  onCreate?: (input: ShareLinkInput) => Promise<{ url: string } | null>;
}

export interface ShareLinkInput {
  recordingId: string;
  startSec: number;
  endSec: number;
  password?: string | null;
  expiresAt: string; // ISO
  audience?: string | null;
}

const EXPIRES_PRESETS = [
  { key: '24h', label: '24時間', hours: 24 },
  { key: '7d', label: '7日', hours: 24 * 7 },
  { key: '30d', label: '30日', hours: 24 * 30 },
] as const;

function parseTimeInput(raw: string): number | null {
  if (!raw) return 0;
  const trimmed = raw.trim();
  if (!trimmed) return 0;
  // 純数字 → 秒
  if (/^\d+$/.test(trimmed)) return Number.parseInt(trimmed, 10);
  // mm:ss / hh:mm:ss
  const parts = trimmed.split(':').map((p) => Number.parseInt(p, 10));
  if (parts.some((n) => Number.isNaN(n) || n < 0)) return null;
  if (parts.length === 2) {
    const [m, s] = parts as [number, number];
    return m * 60 + s;
  }
  if (parts.length === 3) {
    const [h, m, s] = parts as [number, number, number];
    return h * 3600 + m * 60 + s;
  }
  return null;
}

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function ShareLinkDialog({
  recordingId,
  durationSec,
  initialStartSec = 0,
  onCreate,
}: ShareLinkDialogProps) {
  const [open, setOpen] = useState(false);
  const [startInput, setStartInput] = useState(formatTime(initialStartSec));
  const [endInput, setEndInput] = useState(
    formatTime(Math.min(initialStartSec + 60, durationSec || initialStartSec + 60)),
  );
  const [password, setPassword] = useState('');
  const [audience, setAudience] = useState('');
  const [expiresKey, setExpiresKey] = useState<(typeof EXPIRES_PRESETS)[number]['key']>('7d');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ url: string; placeholder: boolean } | null>(null);

  const startId = useId();
  const endId = useId();
  const passId = useId();
  const audId = useId();
  const errId = useId();

  // 開いたとき initialStartSec が変わったら同期
  useEffect(() => {
    if (open) {
      setStartInput(formatTime(initialStartSec));
      setEndInput(formatTime(Math.min(initialStartSec + 60, durationSec || initialStartSec + 60)));
      setError(null);
      setResult(null);
    }
  }, [open, initialStartSec, durationSec]);

  const submit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setError(null);
      const startSec = parseTimeInput(startInput);
      const endSec = parseTimeInput(endInput);
      if (startSec === null || endSec === null) {
        setError('時刻は mm:ss または hh:mm:ss の形式で入力してください。');
        return;
      }
      if (endSec <= startSec) {
        setError('終了時刻は開始時刻より後にしてください。');
        return;
      }
      if (durationSec > 0 && endSec > durationSec) {
        setError(`終了時刻が動画の長さ (${formatTime(durationSec)}) を超えています。`);
        return;
      }
      const hours = EXPIRES_PRESETS.find((p) => p.key === expiresKey)?.hours ?? 24 * 7;
      const expiresAt = new Date(Date.now() + hours * 3600 * 1000).toISOString();

      setSubmitting(true);
      try {
        const res = await onCreate?.({
          recordingId,
          startSec,
          endSec,
          password: password.trim() ? password : null,
          expiresAt,
          audience: audience.trim() ? audience : null,
        });
        if (res?.url) {
          setResult({ url: res.url, placeholder: false });
        } else {
          // API 未実装 → 表示用 placeholder
          setResult({
            url: `https://share.example.invalid/recordings/${recordingId}?demo=1`,
            placeholder: true,
          });
        }
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : '共有リンクの作成に失敗しました。時間をおいて再度お試しください。',
        );
        setResult({
          url: `https://share.example.invalid/recordings/${recordingId}?demo=1`,
          placeholder: true,
        });
      } finally {
        setSubmitting(false);
      }
    },
    [startInput, endInput, password, audience, expiresKey, durationSec, recordingId, onCreate],
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Share2 strokeWidth={1.6} className="size-4" />
          <span>切り出して共有</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>切り出して共有する</DialogTitle>
          <DialogDescription>
            開始 ・
            終了の時刻、パスワード、有効期限を指定して、社外にも安全に共有できるリンクを作ります。リンクは
            1 度きりの表示です (再表示できません)。
          </DialogDescription>
        </DialogHeader>

        {result ? (
          // biome-ignore lint/a11y/useSemanticElements: 結果領域は <output> だと内部の Input/Button が flex 配置で崩れるため div + role=status を採用
          <div className="space-y-3" role="status">
            <p className="text-sm leading-relaxed text-foreground/90">
              {result.placeholder
                ? '共有 API はまだ準備中です。下記はサンプル URL です。'
                : '共有リンクを作成しました。表示は今回限りです。'}
            </p>
            <div className="flex items-center gap-2">
              <Input
                readOnly
                value={result.url}
                onFocus={(e) => e.currentTarget.select()}
                aria-label="共有 URL"
                className="font-mono text-xs"
              />
              <Button
                type="button"
                variant="cinnabar"
                size="sm"
                onClick={() => {
                  void navigator.clipboard?.writeText(result.url);
                }}
              >
                コピー
              </Button>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="ghost">
                  閉じる
                </Button>
              </DialogClose>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4" noValidate>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor={startId}>開始時刻</Label>
                <Input
                  id={startId}
                  value={startInput}
                  onChange={(e) => setStartInput(e.currentTarget.value)}
                  placeholder="0:00"
                  inputMode="numeric"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={endId}>終了時刻</Label>
                <Input
                  id={endId}
                  value={endInput}
                  onChange={(e) => setEndInput(e.currentTarget.value)}
                  placeholder="1:00"
                  inputMode="numeric"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={passId}>パスワード (任意)</Label>
              <Input
                id={passId}
                preset="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.currentTarget.value)}
                placeholder="未入力ならパスワードなし"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={audId}>宛先メモ (任意)</Label>
              <Input
                id={audId}
                value={audience}
                onChange={(e) => setAudience(e.currentTarget.value)}
                placeholder="例: 田中商事 中村部長宛"
              />
            </div>

            <div className="space-y-1.5">
              <p className="text-sm font-medium text-foreground/90">有効期限</p>
              <div
                role="radiogroup"
                aria-label="有効期限"
                className="inline-flex items-center rounded-md border border-border/70 bg-card/60 overflow-hidden"
              >
                {EXPIRES_PRESETS.map((p) => {
                  const selected = p.key === expiresKey;
                  return (
                    <button
                      key={p.key}
                      type="button"
                      // biome-ignore lint/a11y/useSemanticElements: ピル型セグメントコントロールは radio group ARIA 実装で統一
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setExpiresKey(p.key)}
                      className={cn(
                        'px-3 h-9 text-xs transition-colors duration-fast',
                        selected
                          ? 'bg-foreground text-background'
                          : 'text-muted-foreground hover:text-foreground hover:bg-accent',
                        'focus-visible:outline-none focus-visible:shadow-focus-ring',
                      )}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {error ? (
              <p
                id={errId}
                role="alert"
                className="text-xs text-destructive border-l-2 border-destructive pl-2 py-1"
              >
                {error}
              </p>
            ) : null}

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="ghost" disabled={submitting}>
                  キャンセル
                </Button>
              </DialogClose>
              <Button
                type="submit"
                variant="cinnabar"
                disabled={submitting}
                aria-describedby={error ? errId : undefined}
              >
                {submitting ? '作成中…' : 'リンクを作る'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
