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
export const DB_VERSION = 1;

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
}

let _db: Promise<IDBPDatabase<KspDB>> | null = null;

export function getOfflineDB(): Promise<IDBPDatabase<KspDB>> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is not available in this environment'));
  }
  if (!_db) {
    _db = openDB<KspDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('queue')) {
          const queue = db.createObjectStore('queue', { keyPath: 'id' });
          queue.createIndex('by-kind', 'kind');
          queue.createIndex('by-createdAt', 'createdAt');
        }
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta', { keyPath: 'id' });
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
