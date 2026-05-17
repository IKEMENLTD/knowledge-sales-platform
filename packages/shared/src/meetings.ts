import { z } from 'zod';

/**
 * 商談機能 (T-014) の API I/O。
 */

export const meetingStatusValues = [
  'scheduling',
  'scheduled',
  'completed',
  'cancelled',
  'no_show',
] as const;
export const meetingStatusSchema = z.enum(meetingStatusValues);

export const meetingStageValues = [
  'first',
  'second',
  'demo',
  'proposal',
  'negotiation',
  'closing',
  'kickoff',
  'cs_regular',
  'cs_issue',
] as const;
export const meetingStageSchema = z.enum(meetingStageValues);
export type MeetingStage = z.infer<typeof meetingStageSchema>;

export const dealStatusValues = ['open', 'won', 'lost', 'on_hold'] as const;
export const dealStatusSchema = z.enum(dealStatusValues);

// ----- 一覧 query -----
export const meetingListQuerySchema = z.object({
  stage: meetingStageSchema.optional(),
  dealStatus: dealStatusSchema.optional(),
  ownerUserId: z.string().uuid().optional(),
  q: z.string().trim().max(200).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.number().int().min(1).max(100).optional().default(50),
  offset: z.number().int().min(0).max(5000).optional().default(0),
});
export type MeetingListQuery = z.infer<typeof meetingListQuerySchema>;

// ----- CRUD -----
export const meetingCreateRequestSchema = z.object({
  contactId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  scheduledAt: z.string().datetime().optional(),
  durationMinutes: z.number().int().positive().max(24 * 60).optional().default(60),
  status: meetingStatusSchema.optional().default('scheduling'),
  stage: meetingStageSchema.optional(),
  zoomMeetingId: z.string().trim().max(100).optional(),
  zoomJoinUrl: z.string().trim().url().max(500).optional(),
  manualNotes: z.string().trim().max(20000).optional(),
});
export type MeetingCreateRequest = z.infer<typeof meetingCreateRequestSchema>;

export const meetingUpdateRequestSchema = meetingCreateRequestSchema.partial().extend({
  dealStatus: dealStatusSchema.optional(),
  dealAmount: z.number().int().nonnegative().max(10_000_000_000).optional(),
  dealCloseDate: z.string().date().optional(),
  lostReason: z.string().trim().max(2000).optional(),
  nextAction: z.string().trim().max(500).optional(),
  winProbability: z.number().min(0).max(1).optional(),
});
export type MeetingUpdateRequest = z.infer<typeof meetingUpdateRequestSchema>;

// ----- ステージ遷移 (audit を伴う専用エンドポイント) -----
export const meetingStageTransitionRequestSchema = z.object({
  toStage: meetingStageSchema,
  toDealStatus: dealStatusSchema.optional(),
  reason: z.string().trim().max(500).optional(),
});
export type MeetingStageTransitionRequest = z.infer<typeof meetingStageTransitionRequestSchema>;

// ----- ハンドオフ (営業 → CS) -----
export const meetingHandoffRequestSchema = z.object({
  /** CS 側担当者 user_id */
  toUserId: z.string().uuid(),
  /** LLM で生成する場合 false にして server 側生成 */
  draftNotes: z.string().trim().max(20000).optional(),
});
export type MeetingHandoffRequest = z.infer<typeof meetingHandoffRequestSchema>;
