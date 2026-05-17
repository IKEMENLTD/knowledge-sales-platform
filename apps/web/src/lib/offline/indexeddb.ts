/**
 * Offline 用 Key-Value IndexedDB ラッパ (17_offline_mobile / cross-cutting P0-1)。
 *
 * 既存 `db.ts` は queue/meta スキーマ (idb 経由) を v=1 で定義しており、Background
 * Sync 用の暗号化キューはそちらを使う (DB 名 `ksp-offline`)。本ファイルは「アプリ層から
 * プレーンに使う key-value 永続化」を提供するシンプル wrapper で、design_gap_round1/
 * cross-cutting.md G-P0-5 / X-5 で指摘された `OfflineStore.put` の throw 実装を解消する。
 *
 * v=2 で `kv` ストアを追加 (db.ts と共通の DB / version を共有)。openDB は同 DB を
 * 別 version で開くと VersionError を投げるため、db.ts の DB_VERSION とこの module が
 * 開く版は必ず一致させる。upgrade hook は `db.ts` の applyUpgrade に集約済。
 *
 * 暗号化方針:
 *   - 本ストアは「個人特定情報を含まないキャッシュ / UI 状態」を想定した平文 KV。
 *   - 名刺画像 / 録音 chunk 等の機微情報は `db.ts` の queue (libsodium AEAD) 経由で扱う。
 *     その本実装は Phase1 W3 T-007 で完成予定。
 *   - 本ファイルが取り扱うのは「最近見た検索結果のサマリ」「未送信下書き本文」のような
 *     ローカル UX 向けデータ。暗号化なしだが TTL/expiry をデフォで持たせる。
 */

import { type KvRecord, getOfflineDB } from './db';

const STORE = 'kv' as const;

export type OfflineEntry<T = unknown> = {
  /** JSON-serializable 値。 */
  data: T;
  /** 失効 UNIX ms。null は無期限。 */
  expiresAt: number | null;
  /** 書き込み時刻 (UNIX ms)。デバッグ + LRU 候補選定用。 */
  updatedAt: number;
};

export type PutOptions = {
  /**
   * TTL (ms)。指定があれば `expiresAt = now + ttlMs` を記録。
   * 省略時は無期限。
   */
  ttlMs?: number;
  /** 明示的な expiresAt (UNIX ms) を直接渡す場合。 */
  expiresAt?: number;
};

export interface OfflineStore {
  /** DB 接続初期化 (idempotent)。明示呼び出しは任意。 */
  init(): Promise<void>;
  /** key-value を保存。 */
  put<T = unknown>(key: string, value: T, options?: PutOptions): Promise<void>;
  /** 取得。未存在 / 期限切れは null。期限切れは副作用として削除される。 */
  get<T = unknown>(key: string): Promise<T | null>;
  /** 全 entry を返す (期限切れは自動 prune)。 */
  list<T = unknown>(): Promise<Array<{ key: string; value: T; expiresAt: number | null }>>;
  /** 単一 key 削除。 */
  remove(key: string): Promise<void>;
  /**
   * 単一 key 削除 (`delete` は予約語のため `remove` を正式 API とする)。
   * 後方互換のため残す — 既存の `OfflineStore.delete` 呼び出しも動く。
   */
  delete(key: string): Promise<void>;
  /** 全 entry 削除 (signout 等)。 */
  clear(): Promise<void>;
  /** 全 entry 削除 (旧名)。 */
  wipe(): Promise<void>;
}

function resolveExpiresAt(options: PutOptions | undefined, now: number): number | null {
  if (options?.expiresAt !== undefined) return options.expiresAt;
  if (options?.ttlMs !== undefined && options.ttlMs > 0) return now + options.ttlMs;
  return null;
}

export function createOfflineStore(): OfflineStore {
  const removeKey = async (key: string): Promise<void> => {
    const db = await getOfflineDB();
    await db.delete(STORE, key);
  };

  const clearAll = async (): Promise<void> => {
    const db = await getOfflineDB();
    await db.clear(STORE);
  };

  return {
    async init() {
      await getOfflineDB();
    },
    async put<T = unknown>(key: string, value: T, options?: PutOptions) {
      const db = await getOfflineDB();
      const now = Date.now();
      const entry: KvRecord = {
        id: key,
        data: value as unknown,
        expiresAt: resolveExpiresAt(options, now),
        updatedAt: now,
      };
      await db.put(STORE, entry);
    },
    async get<T = unknown>(key: string): Promise<T | null> {
      const db = await getOfflineDB();
      const row = (await db.get(STORE, key)) as KvRecord | undefined;
      if (!row) return null;
      if (row.expiresAt !== null && row.expiresAt <= Date.now()) {
        try {
          await db.delete(STORE, key);
        } catch {
          /* noop */
        }
        return null;
      }
      return row.data as T;
    },
    async list<T = unknown>() {
      const db = await getOfflineDB();
      const rows = (await db.getAll(STORE)) as KvRecord[];
      const now = Date.now();
      const live: Array<{ key: string; value: T; expiresAt: number | null }> = [];
      const expiredIds: string[] = [];
      for (const row of rows) {
        if (row.expiresAt !== null && row.expiresAt <= now) {
          expiredIds.push(row.id);
          continue;
        }
        live.push({ key: row.id, value: row.data as T, expiresAt: row.expiresAt });
      }
      if (expiredIds.length > 0) {
        const tx = db.transaction(STORE, 'readwrite');
        await Promise.all(expiredIds.map((id) => tx.store.delete(id)));
        await tx.done;
      }
      return live;
    },
    remove: removeKey,
    delete: removeKey,
    clear: clearAll,
    wipe: clearAll,
  };
}

/**
 * default singleton。SSR (Node) 環境では IndexedDB が無いので
 * すべての呼び出しが reject される。呼び出し側で `typeof window !== 'undefined'`
 * かどうか、もしくは Service Worker / `'use client'` 経由か確認すること。
 */
let _singleton: OfflineStore | null = null;
export function getOfflineStore(): OfflineStore {
  if (!_singleton) _singleton = createOfflineStore();
  return _singleton;
}
