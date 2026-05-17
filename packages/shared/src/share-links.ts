import { z } from 'zod';

/**
 * 共有リンク (S-M-06 / L-6 / SC-46) の API I/O。
 *
 * - URL に乗る token は 7 文字の short code (`crypto.randomBytes(5).toString('base64url').slice(0,7)`)。
 *   DB には sha256 ハッシュ (`token_sha256`) のみ保存。
 * - パスワードは bcrypt 互換 (web 側で SubtleCrypto sha256 → base64 で保存し、
 *   公開検証 API で同一ハッシュ比較。Phase1 は argon2id 未導入)。
 * - start_sec / end_sec / view_count_cap は 0041_share_links_clip_columns.sql で追加。
 */

export const shareLinkCreateRequest = z.object({
  recordingId: z.string().uuid(),
  startSec: z.number().int().nonnegative(),
  endSec: z.number().int().positive(),
  password: z.string().trim().min(1).max(32).optional(),
  expiresInDays: z.number().int().min(1).max(30),
  viewCountCap: z.number().int().min(1).max(100).optional(),
  audience: z.string().trim().max(200).optional(),
});
export type ShareLinkCreateRequest = z.infer<typeof shareLinkCreateRequest>;

export const shareLinkResponse = z.object({
  id: z.string().uuid(),
  shortCode: z.string().regex(/^[A-Za-z0-9_-]{7}$/),
  fullUrl: z.string().url(),
  expiresAt: z.string().datetime(),
  viewCountCap: z.number().int().nullable(),
  startSec: z.number().int().nonnegative(),
  endSec: z.number().int().positive(),
});
export type ShareLinkResponse = z.infer<typeof shareLinkResponse>;

export const shareLinkListItem = z.object({
  id: z.string().uuid(),
  recordingId: z.string().uuid(),
  startSec: z.number().int().nonnegative(),
  endSec: z.number().int().positive(),
  expiresAt: z.string().datetime(),
  viewCount: z.number().int().nonnegative(),
  viewCountCap: z.number().int().nullable(),
  audience: z.string().nullable(),
  passwordProtected: z.boolean(),
  createdAt: z.string().datetime(),
  expired: z.boolean(),
});
export type ShareLinkListItem = z.infer<typeof shareLinkListItem>;

export const shareLinkListResponse = z.object({
  items: z.array(shareLinkListItem),
});
export type ShareLinkListResponse = z.infer<typeof shareLinkListResponse>;

/** /api/share-links/[code] 公開 GET の resolve 結果 */
export const sharePublicResolveResponse = z.object({
  videoUrl: z.string().url(),
  startSec: z.number().int().nonnegative(),
  endSec: z.number().int().positive(),
  expiresAt: z.string().datetime(),
  videoExpiresAt: z.string().datetime(),
  audience: z.string().nullable(),
});
export type SharePublicResolveResponse = z.infer<typeof sharePublicResolveResponse>;
