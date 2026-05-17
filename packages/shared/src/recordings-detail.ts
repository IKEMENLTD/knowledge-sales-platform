import { z } from 'zod';

/**
 * 録画機能 (T-012/T-013) の API I/O。
 */

export const recordingProcessingStatusValues = [
  'pending',
  'downloading',
  'transcribing',
  'analyzing',
  'embedding',
  'completed',
  'failed',
] as const;
export const recordingProcessingStatusSchema = z.enum(recordingProcessingStatusValues);

export const recordingSensitivityValues = [
  'public',
  'internal',
  'sensitive',
  'restricted',
] as const;
export const recordingSensitivitySchema = z.enum(recordingSensitivityValues);

export const transcriptSegmentSchema = z.object({
  index: z.number().int().nonnegative(),
  startSec: z.number().nonnegative(),
  endSec: z.number().positive(),
  speakerLabel: z.string().nullable(),
  text: z.string(),
  confidence: z.number().min(0).max(1).optional(),
});
export type TranscriptSegment = z.infer<typeof transcriptSegmentSchema>;

export const sentimentSampleSchema = z.object({
  atSec: z.number().nonnegative(),
  value: z.number().min(-1).max(1),
  speakerLabel: z.string().nullable().optional(),
});
export type SentimentSample = z.infer<typeof sentimentSampleSchema>;

export const recordingHighlightSchema = z.object({
  atSec: z.number().nonnegative(),
  durationSec: z.number().positive().optional(),
  kind: z.enum(['key_point', 'objection', 'commitment', 'next_action']),
  label: z.string(),
});
export type RecordingHighlight = z.infer<typeof recordingHighlightSchema>;

export const commitmentSchema = z.object({
  who: z.string(),
  what: z.string(),
  byWhen: z.string().date().nullable().optional(),
  atSec: z.number().nonnegative().optional(),
});

export const nextActionSchema = z.object({
  what: z.string(),
  owner: z.string().nullable().optional(),
  dueDate: z.string().date().nullable().optional(),
});

export const recordingListQuerySchema = z.object({
  ownerUserId: z.string().uuid().optional(),
  status: recordingProcessingStatusSchema.optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.number().int().min(1).max(50).optional().default(20),
  offset: z.number().int().min(0).max(5000).optional().default(0),
});
export type RecordingListQuery = z.infer<typeof recordingListQuerySchema>;
