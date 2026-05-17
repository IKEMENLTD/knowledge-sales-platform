/**
 * オフラインキュー用 IndexedDB ラッパ (17_offline_mobile)。
 *
 * Phase1 W3 で T-007 と連動して本実装。本ファイルはインターフェイス定義のみ提供。
 *
 * 設計方針:
 * - 暗号化: libsodium-wrappers の crypto_secretstream で AEAD。鍵はサインイン時に
 *   サーバから受け取った per-user wrap key を IndexedDB の `meta` ストアに保存。
 * - サインアウト時に meta ストアを wipe → 残ったキュー項目は復号不能。
 * - 同期: Service Worker の Background Sync で `process_business_card` 等のキューを送出。
 */

import { type DBSchema, type IDBPDatabase, openDB } from 'idb';

export const DB_NAME = 'ksp-offline';
/**
 * v=1 → v=2: cross-cutting P0-1 で `kv` ストアを追加。
 *
 * 同じ DB (`ksp-offline`) を `db.ts` と `indexeddb.ts` の双方が openDB するため、
 * version を分けると VersionError が出る。共通 version + 共通 upgrade hook で
 * queue/meta/kv の 3 store を idempotent に作る。
 */
export const DB_VERSION = 2;

export type QueueKind = 'business_card' | 'note' | 'recording_chunk';

export type QueueRecord = {
  id: string;
  kind: QueueKind;
  /** AEAD 暗号文 (libsodium crypto_secretstream chunks) */
  ciphertext: ArrayBuffer;
  /** secretstream header */
  header: ArrayBuffer;
  createdAt: number;
  retries: number;
  /** 最後のエラーメッセージ (Sentry に紐付くID含む) */
  lastError?: string | null;
};

/**
 * KV ストアのエントリ型。`indexeddb.ts` の `OfflineStore` API がこの shape を扱う。
 * cross-cutting P0-1 で導入。
 */
export type KvRecord = {
  id: string;
  data: unknown;
  expiresAt: number | null;
  updatedAt: number;
};

interface KspDB extends DBSchema {
  queue: {
    key: string;
    value: QueueRecord;
    indexes: { 'by-kind': QueueKind; 'by-createdAt': number };
  };
  meta: {
    key: string;
    value: { id: string; wrappedKey: ArrayBuffer; updatedAt: number };
  };
  kv: {
    key: string;
    value: KvRecord;
  };
}

let _db: Promise<IDBPDatabase<KspDB>> | null = null;

export function getOfflineDB(): Promise<IDBPDatabase<KspDB>> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is not available in this environment'));
  }
  if (!_db) {
    _db = openDB<KspDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        // v=1: queue + meta を作成 (既存ユーザでは作成済)。
        if (oldVersion < 1) {
          if (!db.objectStoreNames.contains('queue')) {
            const queue = db.createObjectStore('queue', { keyPath: 'id' });
            queue.createIndex('by-kind', 'kind');
            queue.createIndex('by-createdAt', 'createdAt');
          }
          if (!db.objectStoreNames.contains('meta')) {
            db.createObjectStore('meta', { keyPath: 'id' });
          }
        }
        // v=2: kv ストアを追加 (cross-cutting P0-1)。
        if (oldVersion < 2) {
          if (!db.objectStoreNames.contains('kv')) {
            db.createObjectStore('kv', { keyPath: 'id' });
          }
        }
      },
    });
  }
  return _db;
}

/**
 * サインアウト時に呼び出し、暗号鍵を wipe する。
 * Phase1 W3 で実装。
 */
export async function wipeOfflineKeys(): Promise<void> {
  const db = await getOfflineDB();
  await db.clear('meta');
  // TODO: queue 自体は残す案 / 全削除案を CTO レビューで決定
}
