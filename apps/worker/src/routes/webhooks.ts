import { DEFAULT_ORG_ID } from '@ksp/shared';
import { Hono } from 'hono';
import type { Logger } from 'pino';
import { z } from 'zod';
import { appendAudit } from '../lib/audit.js';
import { logger } from '../lib/logger.js';
import { pgmqSend } from '../lib/pgmq.js';
import { rateLimitPerIp } from '../lib/rate-limit.js';
import { captureException } from '../lib/sentry.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { computeUrlValidationToken, verifyZoomSignature } from '../lib/zoom-webhook.js';

/**
 * jobs_inflight TTL — Zoom recording.completed の処理が完了する想定上限。
 * 30 分以内にどの worker も pickup できなかったら expire させ、再 enqueue を許す。
 */
const JOBS_INFLIGHT_TTL_MS = 30 * 60 * 1000;

type RouteVariables = {
  reqId: string;
  log: Logger;
};

export const webhooks = new Hono<{ Variables: RouteVariables }>();

const MAX_BODY_BYTES = 64 * 1024; // 64KB

/**
 * Zoom recording.completed payload (関連部分のみ抜粋)。
 * 公式: https://developers.zoom.us/docs/api/rest/reference/zoom-api/events/#operation/recording-completed
 */
const RecordingCompletedSchema = z.object({
  event: z.literal('recording.completed'),
  payload: z.object({
    account_id: z.string().optional(),
    object: z.object({
      id: z.union([z.string(), z.number()]).transform((v) => String(v)),
      uuid: z.string(),
      host_id: z.string().optional(),
      topic: z.string().optional(),
      start_time: z.string().optional(),
      duration: z.number().optional(),
      recording_files: z
        .array(
          z.object({
            id: z.string(),
            file_type: z.string().optional(),
            file_size: z.number().optional(),
            download_url: z.string().optional(),
            recording_start: z.string().optional(),
            recording_end: z.string().optional(),
          }),
        )
        .optional(),
    }),
  }),
  event_ts: z.number().optional(),
  download_token: z.string().optional(),
});

const UrlValidationSchema = z.object({
  event: z.literal('endpoint.url_validation'),
  payload: z.object({ plainToken: z.string() }),
});

/**
 * POST /webhooks/zoom
 *
 * 設計書 06_external_integrations:
 *   - 3秒以内に200を返す (本処理は pgmq へ enqueue)
 *   - URL Validation 応答対応
 *   - 署名検証 + timestamp ±5min + secret rotation 90日 dual-window
 *   - body サイズ上限 64KB (S-N-02 / Architect A-H-04)
 *   - per-IP rate limit (Architect A-H-04)
 *   - 全レスポンスに x-request-id (SRE H4-2)
 *   - meetings/recordings UPSERT ON CONFLICT DO NOTHING + pgmq.send (Architect A-H-05)
 */
webhooks.post('/webhooks/zoom', async (c) => {
  const reqLog = c.get('log') ?? logger;

  // 1) per-IP rate limit (in-memory token bucket)
  const ip =
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
    c.req.header('x-real-ip') ??
    'unknown';
  const rl = rateLimitPerIp(`zoom:${ip}`);
  if (!rl.ok) {
    reqLog.warn({ ip, retryAfter: rl.retryAfter }, 'zoom webhook rate limited');
    c.header('Retry-After', String(rl.retryAfter));
    return c.json({ error: 'rate_limited' }, 429);
  }

  // 2) body size guard (DoS 余地を切る)
  const contentLength = Number(c.req.header('content-length') ?? '0');
  if (contentLength > MAX_BODY_BYTES) {
    return c.json({ error: 'too_large' }, 413);
  }
  const rawBody = await c.req.text();
  if (rawBody.length > MAX_BODY_BYTES) {
    return c.json({ error: 'too_large' }, 413);
  }

  // 3) JSON parse (URL Validation 分岐用に先に展開)
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return c.json({ error: 'invalid_json' }, 400);
  }

  // 4) URL Validation チャレンジは署名なしで来る (Zoom 仕様)
  if (payload.event === 'endpoint.url_validation') {
    const parsed = UrlValidationSchema.safeParse(payload);
    if (!parsed.success) return c.json({ error: 'missing_plainToken' }, 400);
    const plain = parsed.data.payload.plainToken;
    return c.json({ plainToken: plain, encryptedToken: computeUrlValidationToken(plain) });
  }

  // 5) 署名検証 (current/previous の両 secret で OR 評価)
  const sig = c.req.header('x-zm-signature') ?? null;
  const ts = c.req.header('x-zm-request-timestamp') ?? null;
  if (!verifyZoomSignature({ signatureHeader: sig, timestampHeader: ts, rawBody })) {
    reqLog.warn({ event: payload.event }, 'zoom webhook signature mismatch');
    return c.json({ error: 'invalid_signature' }, 401);
  }

  // 6) recording.completed 以外は 200 noop (将来 meeting.started 等を追加する余地)
  if (payload.event !== 'recording.completed') {
    reqLog.info({ event: payload.event }, 'zoom webhook event ignored (not yet handled)');
    return c.json({ received: true, handled: false });
  }

  // 7) recording.completed: payload validate → meetings/recordings upsert → pgmq enqueue
  const parsed = RecordingCompletedSchema.safeParse(payload);
  if (!parsed.success) {
    reqLog.warn({ issues: parsed.error.issues }, 'zoom recording.completed payload invalid');
    return c.json({ error: 'invalid_payload', issues: parsed.error.issues }, 400);
  }
  const obj = parsed.data.payload.object;
  const zoomMeetingId = obj.id;
  const zoomRecordingUuid = obj.uuid;

  try {
    // 7-a) jobs_inflight idempotency guard (S-N-01)
    //   - (queue_name, idempotency_key) PK をユニークキーとして INSERT を試みる
    //   - 23505 (unique violation) なら「同じ zoom_event を別のリクエストが既に
    //     処理済 / 処理中」とみなし、重複として 200 no-op で返す
    //   - DB アクセス自体に失敗した場合は throw 経路に流して 5xx で Zoom retry
    const idemKey = `zoom:${zoomMeetingId}:${zoomRecordingUuid}`;
    const inflightExpiresAt = new Date(Date.now() + JOBS_INFLIGHT_TTL_MS).toISOString();
    const { error: inflightErr } = await supabaseAdmin
      .from('jobs_inflight')
      .insert({
        org_id: DEFAULT_ORG_ID,
        queue_name: 'process_recording',
        idempotency_key: idemKey,
        acquired_by: 'webhook:zoom',
        expires_at: inflightExpiresAt,
      });
    if (inflightErr) {
      if (inflightErr.code === '23505') {
        reqLog.info(
          { zoomMeetingId, zoomRecordingUuid },
          'duplicate zoom recording.completed — already inflight, returning 200 no-op',
        );
        return c.json({ received: true, deduplicated: true });
      }
      // テーブル不在 (relation does not exist) などは soft-fail して enqueue は継続
      reqLog.warn(
        { err: inflightErr.message, code: inflightErr.code },
        'jobs_inflight insert failed (continuing as best-effort)',
      );
    }

    // 7-b) meetings: zoom_meeting_id を unique key として ON CONFLICT DO NOTHING。
    // NOTE: meetings.contact_id / owner_user_id は NOT NULL のため、本来は
    //       既に scheduling 済みの meeting レコードがある前提。無い場合は
    //       別途 reconcile job で contact/owner を後付けする (T-021 系)。
    //       ここでは「あれば返す、無ければ enqueue だけ実行」のソフトフロー。
    const { data: existing } = await supabaseAdmin
      .from('meetings')
      .select('id, zoom_meeting_id')
      .eq('zoom_meeting_id', zoomMeetingId)
      .maybeSingle();

    let meetingDbId: string | null = (existing as { id?: string } | null)?.id ?? null;
    if (!meetingDbId) {
      reqLog.warn(
        { zoomMeetingId },
        'meetings row missing for zoom recording — enqueueing reconcile via worker',
      );
    }

    // recordings: zoom_recording_id を unique key として ON CONFLICT DO NOTHING。
    // meetingDbId が無いと FK violation するので、その場合は recordings 行を作らずに
    // payload だけ enqueue → worker 側 reconcile に委譲する。
    if (meetingDbId) {
      const { error: insertErr } = await supabaseAdmin.from('recordings').insert({
        meeting_id: meetingDbId,
        zoom_recording_id: zoomRecordingUuid,
        processing_status: 'pending',
      });
      if (insertErr && insertErr.code !== '23505') {
        // 23505 = unique_violation (ON CONFLICT DO NOTHING 相当)
        reqLog.warn({ err: insertErr.message }, 'recordings insert failed (non-unique error)');
      }
    }

    // 7-c) pgmq enqueue: 本処理 (download → transcribe → embed) は worker consumer に委譲。
    const reqId = c.get('reqId');
    await pgmqSend('process_recording', {
      zoomMeetingId,
      zoomRecordingUuid,
      meetingDbId,
      eventTs: parsed.data.event_ts ?? Date.now(),
      downloadToken: parsed.data.download_token,
      reqId,
    });

    // 7-d) audit_logs: webhook 受信成功を記録 (fire-and-forget)
    void appendAudit({
      orgId: DEFAULT_ORG_ID,
      actorUserId: null,
      action: 'create',
      resourceType: 'meeting',
      resourceId: meetingDbId,
      payload: {
        webhook: 'zoom.recording_completed',
        zoomMeetingId,
        zoomRecordingUuid,
        eventTs: parsed.data.event_ts ?? null,
        reqId,
      },
      ipAddress: ip === 'unknown' ? null : ip,
      userAgent: c.req.header('user-agent') ?? null,
    });
  } catch (err) {
    captureException(err, { event: 'recording.completed', zoomMeetingId });
    reqLog.error({ err: (err as Error).message }, 'zoom recording.completed handling failed');
    // Zoom はリトライしてくるため 5xx を返す。
    return c.json({ error: 'enqueue_failed' }, 500);
  }

  reqLog.info({ event: payload.event, zoomMeetingId }, 'zoom recording.completed enqueued');
  return c.json({ received: true });
});
