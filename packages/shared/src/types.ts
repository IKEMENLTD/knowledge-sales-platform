import { z } from 'zod';
import { embeddingSourceType, notificationType } from './constants.js';

/**
 * Worker job payloads. Add new payload schemas here so both web (enqueue side)
 * and worker (consume side) share validation.
 */
export const processBusinessCardPayload = z.object({
  contactId: z.string().uuid(),
  imageStorageKey: z.string().min(1),
  uploadedBy: z.string().uuid(),
});
export type ProcessBusinessCardPayload = z.infer<typeof processBusinessCardPayload>;

export const processRecordingPayload = z.object({
  zoomRecordingId: z.string().min(1),
  meetingId: z.string().uuid(),
  downloadUrl: z.string().url(),
  expiresAt: z.string().datetime(),
});
export type ProcessRecordingPayload = z.infer<typeof processRecordingPayload>;

/**
 * embedding source type の single source of truth は constants.ts。
 * z.enum は mutable tuple `[T, ...T[]]` を要求するため、cast で形を整える。
 * 値そのものは constants 側の const tuple と同一。
 */
type EmbeddingSourceTuple = [
  (typeof embeddingSourceType)[number],
  ...(typeof embeddingSourceType)[number][],
];
export const embeddingSourceTypeSchema = z.enum(
  embeddingSourceType as unknown as EmbeddingSourceTuple,
);

export const generateEmbeddingsPayload = z.object({
  sourceType: embeddingSourceTypeSchema,
  sourceId: z.string().uuid(),
  chunks: z.array(
    z.object({
      index: z.number().int().nonnegative(),
      text: z.string().min(1),
      metadata: z.record(z.unknown()).optional(),
    }),
  ),
});
export type GenerateEmbeddingsPayload = z.infer<typeof generateEmbeddingsPayload>;

/**
 * notifications.type の zod schema (constants.ts と一致)。
 */
type NotificationTuple = [
  (typeof notificationType)[number],
  ...(typeof notificationType)[number][],
];
export const notificationTypeSchema = z.enum(
  notificationType as unknown as NotificationTuple,
);

/**
 * audit_logs.action enum.
 * 08_security_rls 「audit_logs append-only / hash chain」設計に対応する操作カテゴリ。
 * Round1 security レビュー (S-M-02) で audit chain 雛形を要求されたため scaffold。
 */
export const auditAction = z.enum([
  'view',
  'create',
  'update',
  'delete',
  'share',
  'export',
  'login',
  'admin_action',
]);
export type AuditAction = z.infer<typeof auditAction>;

/**
 * IANA timezone validator (A2-Mi-04).
 *
 * `Intl.supportedValuesOf('timeZone')` は Node 18+ / 主要ブラウザでサポート。
 * 環境により未実装の場合は fail-open (= 構文チェックだけパス) で運用し、
 * その代わり users.timezone DB 列の default 'Asia/Tokyo' で安全側に倒す。
 */
function isValidTimezone(tz: string): boolean {
  try {
    const intlAny = Intl as unknown as { supportedValuesOf?: (k: string) => string[] };
    if (typeof intlAny.supportedValuesOf === 'function') {
      const list = intlAny.supportedValuesOf('timeZone');
      return list.includes(tz);
    }
    // fallback: DateTimeFormat が throw しなければ有効とみなす
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const userTimezoneSchema = z
  .string()
  .min(1)
  .refine(isValidTimezone, { message: 'invalid IANA timezone' });

/**
 * users 関連 self-update 可能なプロファイル設定 schema。
 * /api/auth/profile (PATCH) などで使う想定。
 */
export const handednessSchema = z.enum(['left', 'right', 'auto']);
export type Handedness = z.infer<typeof handednessSchema>;

export const userPreferencesSchema = z.object({
  timezone: userTimezoneSchema.optional(),
  handedness: handednessSchema.optional(),
  name: z.string().min(1).max(120).optional(),
});
export type UserPreferences = z.infer<typeof userPreferencesSchema>;
