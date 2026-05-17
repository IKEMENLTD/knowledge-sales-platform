'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { UploadPipelineError, type UploadProgress, uploadOne } from '../_lib/upload-pipeline';
import { UploadDropZone } from './upload-drop-zone';
import { type QueueItem, UploadQueue } from './upload-queue';
import { UploadResult } from './upload-result';

/**
 * ページ全体の client controller。
 *  - キューの正本 (QueueItem[]) を保持
 *  - drop された file を 1 件ずつ uploadOne に流す (同時実行は 3)
 *  - 進捗を percent/stage で更新
 *  - 削除 / リトライ / object URL revoke を担当
 */

const CONCURRENCY = 3;

export function ImportController() {
  const [items, setItems] = useState<QueueItem[]>([]);
  // mount 解放時の URL.revokeObjectURL のため、生成した URL を覚えておく
  const objectUrlsRef = useRef<Set<string>>(new Set());
  // 進行中タスクの AbortController (リトライ・キャンセル用)
  const controllersRef = useRef<Map<string, AbortController>>(new Map());
  // 同時実行スロット数
  const inflightCountRef = useRef<number>(0);
  // pending queue (id だけ持つ)
  const pendingRef = useRef<string[]>([]);

  // ----- queue 操作 -----

  const updateItem = useCallback((id: string, patch: Partial<QueueItem>) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }, []);

  const startTask = useCallback(
    async (id: string) => {
      // 最新の state を取り出す
      let target: QueueItem | undefined;
      setItems((prev) => {
        target = prev.find((i) => i.id === id);
        return prev;
      });
      if (!target) return;
      const item = target;

      const ac = new AbortController();
      controllersRef.current.set(id, ac);
      inflightCountRef.current += 1;

      try {
        const result = await uploadOne(item.file, {
          signal: ac.signal,
          onProgress: (p: UploadProgress) => {
            updateItem(id, {
              stage: p.stage,
              percent: p.percent,
              message: p.message,
            });
          },
        });
        updateItem(id, {
          stage: 'done',
          percent: 100,
          contactId: result.contactId,
          duplicateOf: result.duplicateOf,
          enqueuedForOcr: result.enqueuedForOcr,
          message: undefined,
        });
      } catch (err) {
        const isAbort = err instanceof DOMException && err.name === 'AbortError';
        if (isAbort) {
          // 削除中なら state は親が処理済み (item が消えている)
          return;
        }
        const endpointUnavailable = err instanceof UploadPipelineError && err.endpointUnavailable;
        const errorMessage = err instanceof Error ? err.message : '取り込みに失敗しました';
        updateItem(id, {
          stage: 'failed',
          percent: 0,
          errorMessage,
          endpointUnavailable,
          message: undefined,
        });
      } finally {
        controllersRef.current.delete(id);
        inflightCountRef.current -= 1;
        drainPending();
      }
    },
    [updateItem],
  );

  const drainPending = useCallback(() => {
    while (inflightCountRef.current < CONCURRENCY && pendingRef.current.length > 0) {
      const next = pendingRef.current.shift();
      if (!next) break;
      // setItems の更新後に確実に拾うため microtask に逃がす
      queueMicrotask(() => {
        startTask(next);
      });
    }
  }, [startTask]);

  // ----- D&D 受け取り -----

  const handleAccept = useCallback(
    (files: File[]) => {
      const newItems: QueueItem[] = files.map((file) => {
        const previewUrl = URL.createObjectURL(file);
        objectUrlsRef.current.add(previewUrl);
        return {
          id: cryptoRandomId(),
          file,
          previewUrl,
          stage: 'preparing',
          percent: 0,
        };
      });
      setItems((prev) => [...newItems, ...prev]);
      for (const it of newItems) {
        pendingRef.current.push(it.id);
      }
      drainPending();
    },
    [drainPending],
  );

  // ----- 削除 / リトライ -----

  const handleRemove = useCallback((id: string) => {
    // 進行中なら abort してから取り除く
    const ac = controllersRef.current.get(id);
    ac?.abort();
    controllersRef.current.delete(id);
    setItems((prev) => {
      const target = prev.find((i) => i.id === id);
      if (target) {
        URL.revokeObjectURL(target.previewUrl);
        objectUrlsRef.current.delete(target.previewUrl);
      }
      return prev.filter((i) => i.id !== id);
    });
    // pending からも除去
    pendingRef.current = pendingRef.current.filter((pid) => pid !== id);
  }, []);

  const handleRetry = useCallback(
    (id: string) => {
      updateItem(id, {
        stage: 'preparing',
        percent: 0,
        errorMessage: undefined,
        endpointUnavailable: false,
        message: undefined,
      });
      pendingRef.current.push(id);
      drainPending();
    },
    [drainPending, updateItem],
  );

  // ----- cleanup (page leave) -----

  useEffect(() => {
    const urls = objectUrlsRef.current;
    const controllers = controllersRef.current;
    return () => {
      for (const url of urls) {
        URL.revokeObjectURL(url);
      }
      urls.clear();
      for (const ac of controllers.values()) {
        ac.abort();
      }
      controllers.clear();
    };
  }, []);

  return (
    <div className="space-y-10">
      <UploadDropZone onAccept={handleAccept} hasItems={items.length > 0} />
      <UploadQueue items={items} onRemove={handleRemove} onRetry={handleRetry} />
      <UploadResult items={items} />
    </div>
  );
}

function cryptoRandomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `i_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
}
