/**
 * libsodium ベース AES-GCM 暗号化付き IndexedDB ラッパのスタブ (17_offline_mobile)。
 *
 * 既存 `db.ts` は idb の薄いラッパで queue/meta スキーマを定義済み。
 * 本ファイルは「アプリ層から使う最小 API」を抽象化し、Phase1 W3 で libsodium
 * 暗号化と key derivation を本実装する受け皿。
 *
 * TODO(P1 W3 T-007): libsodium-based AES-GCM。鍵はサインイン時にサーバから受け取った
 *   wrap key (per-user) を `meta` ストアに保管し、サインアウト時に wipe()。
 *   key derivation は HKDF-SHA-256 (info=`ksp/offline/v1`)。
 */

export interface OfflineStore {
  /** DB 接続初期化。idempotent。 */
  init(): Promise<void>;
  /** 暗号化して保存。 */
  put(key: string, value: unknown): Promise<void>;
  /** 復号して取得。未存在は null。 */
  get<T = unknown>(key: string): Promise<T | null>;
  /** 単一キーを削除。 */
  delete(key: string): Promise<void>;
  /** 全データ削除 (サインアウト時に呼ぶ)。 */
  wipe(): Promise<void>;
}

/**
 * Phase1 W2 placeholder 実装。
 * 暗号化なしで動作するため本番投入は不可 (P1 W3 で AES-GCM 実装)。
 */
export function createOfflineStore(): OfflineStore {
  // TODO(P1 W3 T-007): libsodium-wrappers を import し、crypto_secretbox_easy で
  //   value を AEAD 暗号化。nonce は per-record にランダム生成し、ciphertext と共に保存。
  return {
    async init() {
      // TODO(P1 W3 T-007): libsodium.ready 待機 + meta ストアから wrappedKey 取り出し
    },
    async put(_key, _value) {
      // TODO(P1 W3 T-007): JSON.stringify → encrypt → idb put
      throw new Error('OfflineStore.put: not implemented (P1 W3 T-007)');
    },
    async get<T = unknown>(_key: string): Promise<T | null> {
      // TODO(P1 W3 T-007): idb get → decrypt → JSON.parse
      return null;
    },
    async delete(_key) {
      // TODO(P1 W3 T-007): idb delete
    },
    async wipe() {
      // TODO(P1 W3 T-007): db.clear('queue') + db.clear('meta')
    },
  };
}
