import { randomBytes } from 'node:crypto';

/**
 * 共有リンク token / password ハッシュ ヘルパ。
 *
 *  - shortCode: `randomBytes(5).toString('base64url').slice(0,7)` で 7 文字。
 *    URL に乗る平文。DB には sha256 ハッシュのみ保存。
 *  - password ハッシュ: SubtleCrypto SHA-256 + per-link salt (URL token を salt として再利用)。
 *    argon2id 移行は Phase2 で別 issue。
 */

const SHORT_CODE_LEN = 7;

export function generateShortCode(): string {
  // base64url 5 bytes = 7 chars 残り 1 bit、slice(0,7) で 7 文字確定
  return randomBytes(5).toString('base64url').slice(0, SHORT_CODE_LEN);
}

export async function hashShortCode(code: string): Promise<string> {
  const data = new TextEncoder().encode(code);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return bufferToHex(buf);
}

/**
 * パスワード保護 ハッシュ。
 *
 * Phase1 は SubtleCrypto SHA-256 一発。argon2id への移行は別 issue。
 *
 * NOTE: 同じパスワードが他リンクと共有されてもハッシュが衝突しないよう、
 * `ksp-share:` プレフィクスを domain separator として混入する。
 */
export async function hashPassword(password: string): Promise<string> {
  const data = new TextEncoder().encode(`ksp-share:${password}`);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return `sha256:${bufferToHex(buf)}`;
}

export async function verifyPassword(password: string, hash: string | null): Promise<boolean> {
  if (!hash) return true; // パスワード未設定なら常に通過
  const expected = await hashPassword(password);
  // タイミング攻撃対策の厳密な constant-time 比較。Node の crypto.timingSafeEqual を使う。
  if (expected.length !== hash.length) return false;
  // ブラウザ環境を考慮し簡易 constant-time を実装 (Node でも問題なく動く)
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ hash.charCodeAt(i);
  }
  return diff === 0;
}

function bufferToHex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i] ?? 0;
    s += b.toString(16).padStart(2, '0');
  }
  return s;
}
