'use client';

import { useEffect, useRef } from 'react';

/**
 * 共有クリップ専用の最小プレーヤー。
 *
 * - 動画 src には #t=start,end fragment を付与してブラウザ標準のクリップ表示
 * - `timeupdate` で endSec を超えたら自動 pause (ブラウザ実装による差異の保険)
 * - download / picture-in-picture を controlsList で抑止
 * - キーボード操作はネイティブ <video controls> に委ねる (a11y)
 */
export function ShareVideoPlayer({
  videoUrl,
  startSec,
  endSec,
}: {
  videoUrl: string;
  startSec: number;
  endSec: number;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // 初回マウントで startSec へシーク
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onLoaded = () => {
      try {
        v.currentTime = startSec;
      } catch {
        /* noop */
      }
    };
    v.addEventListener('loadedmetadata', onLoaded);
    return () => v.removeEventListener('loadedmetadata', onLoaded);
  }, [startSec]);

  // endSec で自動停止
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => {
      if (v.currentTime >= endSec) {
        v.pause();
        v.currentTime = endSec;
      }
    };
    v.addEventListener('timeupdate', onTime);
    return () => v.removeEventListener('timeupdate', onTime);
  }, [endSec]);

  // #t=start,end fragment 付き URL
  const fragmentUrl = (() => {
    const u = videoUrl;
    const hash = `#t=${Math.max(0, Math.floor(startSec))},${Math.max(startSec + 1, Math.floor(endSec))}`;
    if (u.includes('#')) return u; // 既に fragment 付き
    return `${u}${hash}`;
  })();

  return (
    // biome-ignore lint/a11y/useMediaCaption: 字幕トラックは Phase2 で worker 側 VTT 出力後に追加
    <video
      ref={videoRef}
      src={fragmentUrl}
      controls
      preload="metadata"
      controlsList="nodownload noremoteplayback noplaybackrate"
      disablePictureInPicture
      className="w-full max-h-[70vh] rounded-md bg-foreground/4"
      playsInline
    />
  );
}
