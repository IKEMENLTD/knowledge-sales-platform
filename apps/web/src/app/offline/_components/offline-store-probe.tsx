'use client';

/**
 * /offline ページ用の OfflineStore 動作確認プローブ。
 *
 * cross-cutting P0-1 で `OfflineStore.put` を throw → 実装に置換した。
 * その動作を実機で確認する手段として、本コンポーネントは:
 *
 *   1. マウント時に IndexedDB (`ksp-offline` DB / `kv` store) へ
 *      「最後にオフライン画面を開いた時刻」を put する。
 *   2. その後に get / list を呼んで「永続化された entry 数」と「最後の時刻」を表示。
 *   3. 1分の TTL を試験的に付与し、TTL 機能の動作も確認できるようにする。
 *
 * DevTools → Application → IndexedDB → `ksp-offline` → `kv` で
 * 実際に entry が作成されているか目視確認できる。
 *
 * UI は控えめにする (本番ユーザに見せる主目的ではない)。エラーは silently swallow し、
 * IndexedDB が無い環境 (古い iOS Safari / privacy mode 等) では何も表示しない。
 */

import { getOfflineStore } from '@/lib/offline/indexeddb';
import { useEffect, useState } from 'react';

const PROBE_KEY = 'offline-page:last-visit';
const TTL_MS = 60_000; // 1 分

type ProbeState =
  | { kind: 'idle' }
  | { kind: 'ok'; lastVisit: string; entryCount: number }
  | { kind: 'unavailable' };

export function OfflineStoreProbe() {
  const [state, setState] = useState<ProbeState>({ kind: 'idle' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (typeof window === 'undefined' || typeof indexedDB === 'undefined') {
        setState({ kind: 'unavailable' });
        return;
      }
      try {
        const store = getOfflineStore();
        await store.init();
        const now = new Date().toISOString();
        await store.put(PROBE_KEY, { visitedAt: now }, { ttlMs: TTL_MS });
        const got = await store.get<{ visitedAt: string }>(PROBE_KEY);
        const list = await store.list();
        if (cancelled) return;
        setState({
          kind: 'ok',
          lastVisit: got?.visitedAt ?? now,
          entryCount: list.length,
        });
      } catch {
        if (cancelled) return;
        setState({ kind: 'unavailable' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.kind === 'idle') return null;
  if (state.kind === 'unavailable') return null;

  return (
    <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60 text-center">
      OfflineStore OK — {state.entryCount} entry / last {state.lastVisit.slice(11, 19)}
    </p>
  );
}
