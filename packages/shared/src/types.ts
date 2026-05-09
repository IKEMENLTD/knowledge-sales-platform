import { z } from 'zod';

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

export const generateEmbeddingsPayload = z.object({
  sourceType: z.enum([
    'knowledge_item',
    'recording_segment',
    'meeting_notes',
    'email',
    'handoff',
  ]),
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
