import { z } from 'zod';

/**
 * 名刺機能 (T-007 / T-009 / T-010) で web ↔ worker / web ↔ web API 間を行き来する
 * payload / response の zod schema 群。
 *
 * 設計原則:
 *   - DB enum と single source of truth を共有 (constants と相互参照)
 *   - 全 mutating endpoint は Idempotency-Key を要求 (ヘッダで受け取り)
 *   - schema は 100% serializable (Date は ISO string で授受)
 */

// ----- enum 同期 -----
export const reviewStatusValues = [
  'pending_ocr',
  'pending_review',
  'duplicate_suspect',
  'verified',
  'merged',
] as const;
export const reviewStatusSchema = z.enum(reviewStatusValues);
export type ReviewStatus = z.infer<typeof reviewStatusSchema>;

export const contactSalesStatusValues = [
  'new',
  'contacted',
  'scheduled',
  'met',
  'in_progress',
  'closed_won',
  'closed_lost',
  'archived',
] as const;
export const contactSalesStatusSchema = z.enum(contactSalesStatusValues);

// ----- アップロード前 metadata -----
export const businessCardUploadRequestSchema = z.object({
  fileName: z.string().min(1).max(256),
  /** SHA-256 hex (重複検知 + Storage object 命名のため) */
  contentSha256: z.string().regex(/^[a-f0-9]{64}$/, 'sha256 lowercase hex required'),
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/heic']),
  contentLength: z.number().int().positive().max(10 * 1024 * 1024),
  capturedAt: z.string().datetime().optional(),
});
export type BusinessCardUploadRequest = z.infer<typeof businessCardUploadRequestSchema>;

export const businessCardUploadResponseSchema = z.object({
  storageKey: z.string(),
  /** Supabase Storage signed URL (TTL 5 min) */
  uploadUrl: z.string().url(),
  /** クライアントが PUT 時にこれを 'Authorization: Bearer ...' で投げる */
  uploadToken: z.string(),
  /** すでに同一 hash の contact がある場合のヒント (UI で重複警告) */
  duplicateOf: z.string().uuid().nullable(),
  expiresAt: z.string().datetime(),
});
export type BusinessCardUploadResponse = z.infer<typeof businessCardUploadResponseSchema>;

// ----- アップロード完了通知 → contacts INSERT + pgmq enqueue -----
export const contactRegisterRequestSchema = z.object({
  storageKey: z.string().min(1),
  contentSha256: z.string().regex(/^[a-f0-9]{64}$/),
  capturedAt: z.string().datetime().optional(),
});
export type ContactRegisterRequest = z.infer<typeof contactRegisterRequestSchema>;

export const contactRegisterResponseSchema = z.object({
  contactId: z.string().uuid(),
  /** すでにレビュー中で OCR を skip した場合は false */
  enqueuedForOcr: z.boolean(),
  duplicateOf: z.string().uuid().nullable(),
});
export type ContactRegisterResponse = z.infer<typeof contactRegisterResponseSchema>;

// ----- レビュー画面の保存 -----
const trimmedString = (max: number) => z.string().trim().min(1).max(max);

export const contactUpdateRequestSchema = z.object({
  name: trimmedString(120).optional(),
  nameKana: z.string().trim().max(200).optional().nullable(),
  title: z.string().trim().max(200).optional().nullable(),
  email: z.string().trim().email().max(320).optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  companyId: z.string().uuid().optional().nullable(),
  /** 新規会社作成パス: companyId が無いとき、文字列で受け取り server が upsert */
  companyName: z.string().trim().min(1).max(200).optional().nullable(),
  linkedinUrl: z.string().trim().url().max(500).optional().nullable(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  reviewStatus: reviewStatusSchema.optional(),
  status: contactSalesStatusSchema.optional(),
});
export type ContactUpdateRequest = z.infer<typeof contactUpdateRequestSchema>;

// ----- 重複候補 -----
export const matchFieldValues = [
  'email',
  'phone',
  'name_company',
  'image_hash',
  'linkedin',
] as const;
export const matchFieldSchema = z.enum(matchFieldValues);
export type MatchField = z.infer<typeof matchFieldSchema>;

export const duplicateCandidateSchema = z.object({
  /** マッチ相手 contact_id (新規側ではなく既存側) */
  contactId: z.string().uuid(),
  name: z.string(),
  companyName: z.string().nullable(),
  email: z.string().nullable(),
  matchScore: z.number().min(0).max(1),
  matchFields: z.array(matchFieldSchema).min(1),
  capturedAt: z.string().datetime().nullable(),
});
export type DuplicateCandidate = z.infer<typeof duplicateCandidateSchema>;

export const duplicateListResponseSchema = z.object({
  newContactId: z.string().uuid(),
  candidates: z.array(duplicateCandidateSchema),
});
export type DuplicateListResponse = z.infer<typeof duplicateListResponseSchema>;

// ----- マージ操作 -----
export const mergeResolutionSchema = z.enum(['merged', 'kept_separate']);
export type MergeResolution = z.infer<typeof mergeResolutionSchema>;

export const contactMergeRequestSchema = z.object({
  resolution: mergeResolutionSchema,
  /** merged の場合: master 側 contact_id (こちらを残す)、もう一方は merged 状態へ */
  masterContactId: z.string().uuid().optional(),
  /** kept_separate の場合: 不要。pending_review → verified に遷移するだけ。 */
});
export type ContactMergeRequest = z.infer<typeof contactMergeRequestSchema>;

// ----- OCR worker payload (process_business_card queue) -----
// types.ts の processBusinessCardPayload は既存。互換のため再 export しない。

// ----- OCR 結果の構造化 (worker → DB) -----
export const ocrFieldConfidenceSchema = z.object({
  name: z.number().min(0).max(1).optional(),
  nameKana: z.number().min(0).max(1).optional(),
  title: z.number().min(0).max(1).optional(),
  email: z.number().min(0).max(1).optional(),
  phone: z.number().min(0).max(1).optional(),
  companyName: z.number().min(0).max(1).optional(),
  address: z.number().min(0).max(1).optional(),
});

export const ocrResultSchema = z.object({
  rawText: z.string(),
  fields: z.object({
    name: z.string().optional(),
    nameKana: z.string().optional(),
    title: z.string().optional(),
    email: z.string().optional(),
    phone: z.string().optional(),
    companyName: z.string().optional(),
    address: z.string().optional(),
  }),
  fieldConfidence: ocrFieldConfidenceSchema,
  overallConfidence: z.number().min(0).max(1),
  language: z.string().optional(),
  /** provider 識別子 ('mock' | 'gcv' | 'claude' | 'gcv+claude') */
  provider: z.string(),
  /** USD コスト推定 */
  estimatedCostUsd: z.number().min(0).optional(),
});
export type OcrResult = z.infer<typeof ocrResultSchema>;
