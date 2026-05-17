'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Pause, Play, Volume2, VolumeX } from 'lucide-react';
import {
  type ReactNode,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';

/**
 * 録画再生コンポーネント。
 *
 * - `<video>` をラップしつつ、外部 (transcript-pane / sentiment-chart) から
 *   `seekTo()` / `play()` で時刻ジャンプできるよう `forwardRef` で controller を露出
 * - `timeupdate` event から `onTimeUpdate(currentSec)` を 200ms 単位で間引いて発火
 * - キーボードショートカット (`J` -5s / `L` +5s / `K` `Space` toggle / `0-9` chapter)
 * - 再生速度プリセット (0.75 / 1 / 1.25 / 1.5 / 2x)
 * - signed URL が無い場合は poster + 「サンプル映像」プレースホルダ表示
 *
 * a11y:
 *  - <video controls> は使わず、Lucide icon + ARIA-labelled buttons で揃える
 *    (controls の見た目を国際化できず、トーンが崩れるため)
 *  - 進捗 slider は `<input type="range">` + aria-valuemin/max/now
 *  - 再生中/停止中は `aria-pressed` で読み上げ
 */

export type SpeakerColorMap = Record<string, { bg: string; fg: string; ring: string }>;

/**
 * 話者カラーパレット — Phase 1 で確立した編集的 5-color palette のみで構成。
 *
 * 朱 (cinnabar) → 千歳緑 (chitose) → 藍 (info) → 落款濃朱 (cinnabar deep tint) →
 * 黄土 (ochre muted) → 墨グレー の順で巡回。generic Tailwind カラーは禁則。
 * すべて hsl(var(--token)) ベースで dark mode も自動で追従する。
 */
export const SPEAKER_PALETTE: { bg: string; fg: string; ring: string }[] = [
  // 1) 朱 — 主話者 (営業担当 etc.)
  { bg: 'bg-cinnabar/12', fg: 'text-cinnabar', ring: 'ring-cinnabar/40' },
  // 2) 千歳緑 — 2nd 話者 (お客様 etc.)
  { bg: 'bg-chitose/15', fg: 'text-chitose', ring: 'ring-chitose/40' },
  // 3) 藍 — 3rd 話者
  { bg: 'bg-info/12', fg: 'text-info', ring: 'ring-info/40' },
  // 4) 黄土 — 4th 話者
  { bg: 'bg-ochre/12', fg: 'text-ochre', ring: 'ring-ochre/40' },
  // 5) 落款 (deep cinnabar) — 5th 話者
  { bg: 'bg-cinnabar/20', fg: 'text-cinnabar', ring: 'ring-cinnabar/50' },
  // 6) 墨 muted — 6th 以降 fallback
  { bg: 'bg-foreground/8', fg: 'text-foreground/75', ring: 'ring-border' },
];

export function buildSpeakerColorMap(speakers: (string | null | undefined)[]): SpeakerColorMap {
  const map: SpeakerColorMap = {};
  let idx = 0;
  for (const raw of speakers) {
    const key = (raw ?? '').toString().trim();
    if (!key || map[key]) continue;
    const fallback = {
      bg: 'bg-card/60',
      fg: 'text-foreground/80',
      ring: 'ring-border/70',
    };
    map[key] = SPEAKER_PALETTE[idx % SPEAKER_PALETTE.length] ?? SPEAKER_PALETTE[0] ?? fallback;
    idx += 1;
  }
  return map;
}

export interface PlayerController {
  /** 指定秒に動画位置を移動。再生中/停止中どちらでも安全に呼べる。 */
  seekTo: (sec: number) => void;
  /** 再生開始 (autoplay は user gesture が必要) */
  play: () => void;
  pause: () => void;
  /** ボタン単一クリックで再生/停止トグル */
  toggle: () => void;
  /** 現在秒数 (1度だけ読みたい場合) */
  getCurrentTime: () => number;
}

export interface RecordingPlayerProps {
  /** signed URL (HLS / MP4)。null の場合はプレースホルダ表示。 */
  videoUrl: string | null;
  /** ポスター画像 (任意) */
  posterUrl?: string | null;
  /** 動画全体長 (秒)。url が null でも UI に「総尺」を見せたいので必須。 */
  durationSec: number;
  /** チャプター / ハイライト (時刻ジャンプの 0-9 ホットキー対象) */
  chapters?: { atSec: number; label: string }[];
  /** 現在時刻が変わるたびに発火 (200ms 間引き済み) */
  onTimeUpdate?: (currentSec: number) => void;
}

const RATE_OPTIONS = [0.75, 1, 1.25, 1.5, 2] as const;

function formatHMS(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export const RecordingPlayer = forwardRef<PlayerController, RecordingPlayerProps>(
  function RecordingPlayer({ videoUrl, posterUrl, durationSec, chapters, onTimeUpdate }, ref) {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentSec, setCurrentSec] = useState(0);
    const [rate, setRate] = useState<(typeof RATE_OPTIONS)[number]>(1);
    const [muted, setMuted] = useState(false);
    /** placeholder mode 用に「擬似再生時刻」をローカルで進めるためのタイマー */
    const fakeTimerRef = useRef<number | null>(null);
    /** onTimeUpdate を 200ms 間引きするための前回送信時刻 */
    const lastEmitRef = useRef<number>(0);

    const isPlaceholder = !videoUrl;

    // --- controller (外部 ref 公開) -------------------------------------------
    const emitTime = useCallback(
      (t: number, force = false) => {
        const now = performance.now();
        if (!force && now - lastEmitRef.current < 200) return;
        lastEmitRef.current = now;
        onTimeUpdate?.(t);
      },
      [onTimeUpdate],
    );

    const seekTo = useCallback(
      (sec: number) => {
        const clamped = Math.max(0, Math.min(sec, durationSec || sec));
        setCurrentSec(clamped);
        emitTime(clamped, true);
        const v = videoRef.current;
        if (v) {
          try {
            v.currentTime = clamped;
          } catch {
            /* readyState 不足時は無視 */
          }
        }
      },
      [durationSec, emitTime],
    );

    const playInternal = useCallback(() => {
      const v = videoRef.current;
      if (v) {
        v.play().catch(() => {
          /* user gesture 制約 / fetch error は静かに無視 */
        });
      }
      setIsPlaying(true);
    }, []);

    const pauseInternal = useCallback(() => {
      const v = videoRef.current;
      if (v) v.pause();
      setIsPlaying(false);
    }, []);

    const toggleInternal = useCallback(() => {
      setIsPlaying((prev) => {
        const next = !prev;
        const v = videoRef.current;
        if (v) {
          if (next) v.play().catch(() => undefined);
          else v.pause();
        }
        return next;
      });
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        seekTo,
        play: playInternal,
        pause: pauseInternal,
        toggle: toggleInternal,
        getCurrentTime: () => currentSec,
      }),
      [seekTo, playInternal, pauseInternal, toggleInternal, currentSec],
    );

    // --- placeholder 擬似タイマー --------------------------------------------
    useEffect(() => {
      if (!isPlaceholder) return;
      if (!isPlaying) {
        if (fakeTimerRef.current) {
          window.clearInterval(fakeTimerRef.current);
          fakeTimerRef.current = null;
        }
        return;
      }
      // 250ms ごとに rate に応じて進める
      fakeTimerRef.current = window.setInterval(() => {
        setCurrentSec((prev) => {
          const next = prev + 0.25 * rate;
          if (next >= durationSec) {
            setIsPlaying(false);
            return durationSec;
          }
          emitTime(next);
          return next;
        });
      }, 250);
      return () => {
        if (fakeTimerRef.current) {
          window.clearInterval(fakeTimerRef.current);
          fakeTimerRef.current = null;
        }
      };
    }, [isPlaceholder, isPlaying, rate, durationSec, emitTime]);

    // --- <video> 同期 ---------------------------------------------------------
    useEffect(() => {
      const v = videoRef.current;
      if (!v) return;
      v.playbackRate = rate;
    }, [rate]);

    useEffect(() => {
      const v = videoRef.current;
      if (!v) return;
      v.muted = muted;
    }, [muted]);

    // --- キーボードショートカット --------------------------------------------
    useEffect(() => {
      const handler = (e: KeyboardEvent) => {
        // input/textarea にフォーカスがある時は素通し (検索ボックス等)
        const target = e.target as HTMLElement | null;
        if (
          target &&
          (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
        ) {
          return;
        }
        if (e.key === 'j' || e.key === 'J') {
          seekTo(currentSec - 5);
          e.preventDefault();
        } else if (e.key === 'l' || e.key === 'L') {
          seekTo(currentSec + 5);
          e.preventDefault();
        } else if (e.key === 'k' || e.key === 'K' || e.key === ' ') {
          toggleInternal();
          e.preventDefault();
        } else if (/^[0-9]$/.test(e.key) && chapters && chapters.length > 0) {
          const idx = Number.parseInt(e.key, 10);
          const ch = chapters[idx];
          if (ch) {
            seekTo(ch.atSec);
            e.preventDefault();
          }
        }
      };
      window.addEventListener('keydown', handler);
      return () => window.removeEventListener('keydown', handler);
    }, [currentSec, seekTo, toggleInternal, chapters]);

    const progressPct = durationSec > 0 ? (currentSec / durationSec) * 100 : 0;

    return (
      <div className="space-y-3" data-testid="recording-player">
        <div
          className={cn(
            'relative w-full overflow-hidden rounded-lg border border-border/70 bg-foreground/90',
            'aspect-video shadow-sumi',
          )}
        >
          {isPlaceholder ? (
            <PlaceholderStage posterUrl={posterUrl ?? null} />
          ) : (
            // biome-ignore lint/a11y/useMediaCaption: caption track は worker 出力後に別途付与 (T-013 後続)
            <video
              ref={videoRef}
              src={videoUrl ?? undefined}
              poster={posterUrl ?? undefined}
              className="w-full h-full object-contain bg-black"
              preload="metadata"
              playsInline
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onEnded={() => setIsPlaying(false)}
              onTimeUpdate={(e) => {
                const t = (e.currentTarget as HTMLVideoElement).currentTime;
                setCurrentSec(t);
                emitTime(t);
              }}
              onLoadedMetadata={(e) => {
                const v = e.currentTarget as HTMLVideoElement;
                v.playbackRate = rate;
                v.muted = muted;
              }}
            />
          )}

          {/* 中央プレイボタン (停止中のみ) */}
          {!isPlaying ? (
            <button
              type="button"
              aria-label="再生"
              onClick={toggleInternal}
              className={cn(
                'absolute inset-0 flex items-center justify-center',
                'bg-foreground/15 hover:bg-foreground/25 transition-colors duration-fast',
                'focus-visible:outline-none focus-visible:shadow-focus-ring',
              )}
            >
              <span
                aria-hidden
                className={cn(
                  'inline-flex items-center justify-center size-16 rounded-full',
                  'bg-cinnabar text-cinnabar-foreground shadow-cinnabar-glow',
                )}
              >
                <Play strokeWidth={1.6} className="size-7 ml-1" />
              </span>
            </button>
          ) : null}
        </div>

        {/* 進捗 + ボタン群 */}
        {/* biome-ignore lint/a11y/useSemanticElements: fieldset/legend だと余分な余白が編集トーンに合わないため group role を採用 */}
        <div className="flex flex-col gap-2" role="group" aria-label="再生コントロール">
          <input
            type="range"
            min={0}
            max={durationSec || 0}
            step={1}
            value={Math.min(currentSec, durationSec || 0)}
            onChange={(e) => seekTo(Number.parseInt(e.currentTarget.value, 10))}
            aria-label="再生位置"
            aria-valuemin={0}
            aria-valuemax={durationSec || 0}
            aria-valuenow={Math.floor(currentSec)}
            className={cn(
              'w-full h-2 appearance-none rounded-full bg-border/70 cursor-pointer',
              'accent-cinnabar',
            )}
            style={{
              background: `linear-gradient(to right, hsl(var(--cinnabar)) ${progressPct}%, hsl(var(--border)) ${progressPct}%)`,
            }}
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="cinnabar"
                size="default"
                onClick={toggleInternal}
                aria-pressed={isPlaying}
                aria-label={isPlaying ? '一時停止' : '再生'}
              >
                {isPlaying ? (
                  <Pause strokeWidth={1.6} className="size-4" />
                ) : (
                  <Play strokeWidth={1.6} className="size-4" />
                )}
                <span>{isPlaying ? '停止' : '再生'}</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="default"
                onClick={() => seekTo(currentSec - 5)}
                aria-label="5秒戻る (J)"
              >
                <span className="tabular text-xs">−5s</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="default"
                onClick={() => seekTo(currentSec + 5)}
                aria-label="5秒進める (L)"
              >
                <span className="tabular text-xs">+5s</span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => setMuted((m) => !m)}
                aria-label={muted ? 'ミュート解除' : 'ミュート'}
                aria-pressed={muted}
              >
                {muted ? (
                  <VolumeX strokeWidth={1.6} className="size-4" />
                ) : (
                  <Volume2 strokeWidth={1.6} className="size-4" />
                )}
              </Button>
            </div>

            <div className="flex items-center gap-3">
              <RateSelector value={rate} onChange={setRate} />
              <p
                className="tabular text-xs text-muted-foreground min-w-[88px] text-right"
                aria-live="off"
              >
                {formatHMS(currentSec)} / {formatHMS(durationSec)}
              </p>
            </div>
          </div>
        </div>

        {/* チャプター (ホットキー対応) */}
        {chapters && chapters.length > 0 ? (
          <nav aria-label="チャプター" className="flex flex-wrap gap-2 pt-1">
            {chapters.slice(0, 10).map((ch, i) => (
              <button
                key={`${ch.atSec}-${i}`}
                type="button"
                onClick={() => seekTo(ch.atSec)}
                className={cn(
                  'inline-flex items-center gap-2 rounded-full border border-border/70',
                  'bg-card/60 px-2.5 h-7 text-[11px] hover:border-foreground/30',
                  'transition-[border-color,background-color] duration-fast',
                  'focus-visible:outline-none focus-visible:shadow-focus-ring',
                )}
                aria-label={`${formatHMS(ch.atSec)} ${ch.label} へジャンプ (${i})`}
              >
                <span className="tabular text-muted-foreground">{i}</span>
                <span className="font-medium tracking-crisp">{ch.label}</span>
                <span className="tabular text-[10px] text-muted-foreground">
                  {formatHMS(ch.atSec)}
                </span>
              </button>
            ))}
          </nav>
        ) : null}

        <p className="text-[11px] text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1">
          <span>キー操作:</span>
          <Kbd>J</Kbd>
          <span>5秒戻る</span>
          <span aria-hidden>・</span>
          <Kbd>K</Kbd>
          <span>/</span>
          <Kbd>Space</Kbd>
          <span>再生/停止</span>
          <span aria-hidden>・</span>
          <Kbd>L</Kbd>
          <span>5秒進める</span>
          <span aria-hidden>・</span>
          <Kbd>0-9</Kbd>
          <span>チャプター</span>
        </p>
      </div>
    );
  },
);

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd
      className={cn(
        'inline-flex items-center justify-center min-w-[1.75rem] h-5 px-1.5',
        'rounded border border-border/80 bg-card/80 text-foreground/85',
        'tabular text-[10px] font-medium tracking-wide',
        'shadow-[inset_0_-1px_0_hsl(var(--border)/0.8)]',
      )}
    >
      {children}
    </kbd>
  );
}

function RateSelector({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: (typeof RATE_OPTIONS)[number]) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="再生速度"
      className="inline-flex items-center rounded-md border border-border/70 bg-card/60 overflow-hidden"
    >
      {RATE_OPTIONS.map((opt) => {
        const selected = opt === value;
        return (
          <button
            key={opt}
            type="button"
            // biome-ignore lint/a11y/useSemanticElements: ピル型セグメントコントロールは radio group ARIA で実装 (見た目要件で input type=radio は不可)
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(opt)}
            className={cn(
              'tabular px-2.5 h-8 text-[11px] transition-colors duration-fast',
              selected
                ? 'bg-foreground text-background'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent',
              'focus-visible:outline-none focus-visible:shadow-focus-ring',
            )}
          >
            {opt}x
          </button>
        );
      })}
    </div>
  );
}

function PlaceholderStage({ posterUrl }: { posterUrl: string | null }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center text-background/90 gap-3 p-6">
      {posterUrl ? (
        // poster があれば下に敷く
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={posterUrl}
          alt=""
          aria-hidden
          className="absolute inset-0 w-full h-full object-cover opacity-40"
        />
      ) : null}
      <div className="relative z-10 flex flex-col items-center gap-2 text-center">
        <p className="kicker text-background/75">サンプル映像</p>
        <p className="text-xs text-background/70 max-w-xs leading-relaxed">
          本番接続後、Zoom 録画と signed URL がここに自動で並びます。
          下のコントロールで擬似再生をお試しいただけます。
        </p>
      </div>
    </div>
  );
}
