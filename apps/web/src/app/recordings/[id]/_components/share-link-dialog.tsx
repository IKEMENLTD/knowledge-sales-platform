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
import type { ShareLinkListItem } from '@ksp/shared';
import { Share2, Copy, X, AlertTriangle } from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useId, useState } from 'react';
import { toast } from 'sonner';

/**
 * 切り出し共有 (share_links / SC-46) ダイアログ。
 *
 *  - 開始/終了秒 (HH:MM:SS / mm:ss どちらでも受ける)、パスワード、有効期限、閲覧回数上限、宛先メモ
 *  - 有効期限プリセット 24時間 / 7日 / 30日。最大 30 日 (API zod `expiresInDays` max=30)
 *  - 送信時 POST /api/share-links → { shortCode, fullUrl, expiresAt, viewCountCap }
 *  - 既存共有リンク一覧表示 + DELETE /api/share-links/[id] による失効
 *  - URL コピー (clipboard) ボタン
 *
 * a11y:
 *  - Dialog の Title/Description 必須
 *  - 各 input は Label と紐付け、エラーは aria-describedby で読み上げ
 *  - status 領域は role="status" / aria-live="polite"
 */

export interface ShareLinkDialogProps {
  recordingId: string;
  /** 動画全長 (秒) — 0 を渡すと start/end の上限 validation を行わない */
  durationSec: number;
  /** 開始時刻のデフォルト (現在再生秒数等を渡す) */
  initialStartSec?: number;
}

const EXPIRES_PRESETS = [
  { key: '24h', label: '24時間', days: 1 },
  { key: '7d', label: '7日', days: 7 },
  { key: '30d', label: '30日', days: 30 },
] as const;

function parseTimeInput(raw: string): number | null {
  if (!raw) return 0;
  const trimmed = raw.trim();
  if (!trimmed) return 0;
  if (/^\d+$/.test(trimmed)) return Number.parseInt(trimmed, 10);
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

function genIdemKey(): string {
  // 12 文字の url-safe ランダム (defineRoute の `^[a-zA-Z0-9_-]{8,128}$` 要件を満たす)
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(36).padStart(2, '0'))
    .join('')
    .slice(0, 16);
}

export function ShareLinkDialog({
  recordingId,
  durationSec,
  initialStartSec = 0,
}: ShareLinkDialogProps) {
  const [open, setOpen] = useState(false);
  const [startInput, setStartInput] = useState(formatTime(initialStartSec));
  const [endInput, setEndInput] = useState(
    formatTime(Math.min(initialStartSec + 60, durationSec || initialStartSec + 60)),
  );
  const [password, setPassword] = useState('');
  const [viewCap, setViewCap] = useState<string>('');
  const [audience, setAudience] = useState('');
  const [expiresKey, setExpiresKey] = useState<(typeof EXPIRES_PRESETS)[number]['key']>('7d');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ url: string; shortCode: string } | null>(null);

  const [existing, setExisting] = useState<ShareLinkListItem[]>([]);
  const [existingLoading, setExistingLoading] = useState(false);

  const startId = useId();
  const endId = useId();
  const passId = useId();
  const audId = useId();
  const capId = useId();
  const errId = useId();

  // 開いたとき initialStartSec が変わったら同期 + 既存リンク一覧取得
  useEffect(() => {
    if (!open) return;
    setStartInput(formatTime(initialStartSec));
    setEndInput(formatTime(Math.min(initialStartSec + 60, durationSec || initialStartSec + 60)));
    setError(null);
    setResult(null);
    void loadExisting();
    // loadExisting は recordingId / setExisting 依存だが、open でしか呼ばないので
    // 関数を closure 化したまま deps から外す。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialStartSec, durationSec]);

  const loadExisting = useCallback(async () => {
    setExistingLoading(true);
    try {
      const res = await fetch(
        `/api/share-links?recordingId=${encodeURIComponent(recordingId)}`,
        { credentials: 'same-origin', cache: 'no-store' },
      );
      if (!res.ok) {
        setExisting([]);
        return;
      }
      const json = (await res.json()) as { items?: ShareLinkListItem[] };
      setExisting(json.items ?? []);
    } catch {
      setExisting([]);
    } finally {
      setExistingLoading(false);
    }
  }, [recordingId]);

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
      const days = EXPIRES_PRESETS.find((p) => p.key === expiresKey)?.days ?? 7;
      const capNum = viewCap.trim() ? Number.parseInt(viewCap, 10) : undefined;
      if (capNum !== undefined && (!Number.isFinite(capNum) || capNum < 1 || capNum > 100)) {
        setError('閲覧回数は 1〜100 の整数で指定してください。');
        return;
      }

      setSubmitting(true);
      try {
        const res = await fetch('/api/share-links', {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': genIdemKey(),
          },
          body: JSON.stringify({
            recordingId,
            startSec,
            endSec,
            password: password.trim() ? password : undefined,
            expiresInDays: days,
            viewCountCap: capNum,
            audience: audience.trim() ? audience : undefined,
          }),
        });
        if (!res.ok) {
          let detail = '';
          try {
            const j = (await res.json()) as { error?: string; code?: string };
            detail = j.code ?? j.error ?? '';
          } catch {
            /* noop */
          }
          if (res.status === 403) {
            setError('共有権限がありません。録画オーナーまたは manager 以上のみ可能です。');
          } else if (res.status === 400) {
            setError(`入力エラー (${detail}) を確認してください。`);
          } else {
            setError(`共有リンクの作成に失敗しました (${res.status}${detail ? ` ${detail}` : ''})。`);
          }
          return;
        }
        const data = (await res.json()) as { shortCode: string; fullUrl: string };
        setResult({ url: data.fullUrl, shortCode: data.shortCode });
        void loadExisting();
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : '共有リンクの作成に失敗しました。時間をおいて再度お試しください。',
        );
      } finally {
        setSubmitting(false);
      }
    },
    [
      startInput,
      endInput,
      password,
      audience,
      viewCap,
      expiresKey,
      durationSec,
      recordingId,
      loadExisting,
    ],
  );

  const onCopy = useCallback((url: string) => {
    void navigator.clipboard?.writeText(url).then(
      () => toast.success('URL をコピーしました'),
      () => toast.error('クリップボードへのコピーに失敗しました'),
    );
  }, []);

  const onRevoke = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/share-links/${id}`, {
          method: 'DELETE',
          credentials: 'same-origin',
          headers: { 'Idempotency-Key': genIdemKey() },
        });
        if (!res.ok) {
          toast.error('リンクの失効に失敗しました');
          return;
        }
        toast.success('リンクを失効させました');
        await loadExisting();
      } catch {
        toast.error('リンクの失効に失敗しました');
      }
    },
    [loadExisting],
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Share2 strokeWidth={1.6} className="size-4" />
          <span>切り出して共有</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>切り出して共有する</DialogTitle>
          <DialogDescription>
            開始 ・ 終了の時刻、パスワード、有効期限を指定して、社外にも安全に共有できる
            リンクを作ります。URL は 1 度きりの表示です (再表示できません)。
          </DialogDescription>
        </DialogHeader>

        {result ? (
          // biome-ignore lint/a11y/useSemanticElements: 結果領域は <output> だと内部の Input/Button が flex 配置で崩れるため div + role=status を採用
          <div className="space-y-3" role="status">
            <p className="text-sm leading-relaxed text-foreground/90">
              共有リンクを作成しました。URL は今回限りの表示です。
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
                onClick={() => onCopy(result.url)}
              >
                <Copy strokeWidth={1.6} className="size-3.5" />
                コピー
              </Button>
            </div>
            <p className="text-xs text-muted-foreground font-mono">/{result.shortCode}</p>
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
              <Label htmlFor={passId}>パスワード (任意, 最大 32 文字)</Label>
              <Input
                id={passId}
                preset="password"
                autoComplete="new-password"
                maxLength={32}
                value={password}
                onChange={(e) => setPassword(e.currentTarget.value)}
                placeholder="未入力ならパスワードなし"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={capId}>閲覧回数の上限 (任意, 1〜100)</Label>
              <Input
                id={capId}
                inputMode="numeric"
                maxLength={3}
                value={viewCap}
                onChange={(e) => setViewCap(e.currentTarget.value.replace(/[^0-9]/g, ''))}
                placeholder="未入力なら無制限"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={audId}>宛先メモ (任意)</Label>
              <Input
                id={audId}
                maxLength={200}
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
                className="text-xs text-destructive border-l-2 border-destructive pl-2 py-1 flex items-start gap-1.5"
              >
                <AlertTriangle strokeWidth={1.6} className="size-3.5 shrink-0 mt-0.5" />
                <span>{error}</span>
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

        {/* 既存共有リンク一覧 */}
        <section className="pt-4 mt-2 border-t border-border/60 space-y-2">
          <div className="flex items-baseline justify-between">
            <p className="kicker">既存の共有リンク</p>
            {existingLoading ? (
              <span className="text-[10px] text-muted-foreground font-mono">読み込み中…</span>
            ) : null}
          </div>
          {existing.length === 0 && !existingLoading ? (
            <p className="text-xs text-muted-foreground">この録画にはまだリンクがありません。</p>
          ) : (
            <ul className="space-y-1.5">
              {existing.map((item) => (
                <li
                  key={item.id}
                  className={cn(
                    'flex items-center justify-between gap-2 text-xs border border-border/50 rounded-md px-2.5 py-1.5',
                    item.expired ? 'opacity-60' : '',
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-[11px] truncate">
                      {formatTime(item.startSec)} → {formatTime(item.endSec)}
                      {item.passwordProtected ? ' / pw' : ''}
                      {item.viewCountCap !== null
                        ? ` / ${item.viewCount}/${item.viewCountCap}`
                        : ` / ${item.viewCount} 回`}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      期限 {new Date(item.expiresAt).toLocaleString('ja-JP')}
                      {item.expired ? ' (失効)' : ''}
                      {item.audience ? ` ・ ${item.audience}` : ''}
                    </p>
                  </div>
                  {!item.expired ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => onRevoke(item.id)}
                      aria-label="このリンクを失効させる"
                    >
                      <X strokeWidth={1.6} className="size-3.5" />
                      失効
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </DialogContent>
    </Dialog>
  );
}
