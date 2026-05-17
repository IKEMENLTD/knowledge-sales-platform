import {
  CHUNK_OVERLAP,
  CHUNK_TOKENS,
  COST_CAPS,
  DEFAULT_ORG_ID,
  generateEmbeddingsPayload,
  type GenerateEmbeddingsPayload,
} from '@ksp/shared';
import { supabaseAdmin } from '../lib/supabase.js';
import { logger } from '../lib/logger.js';
import { embedTexts, isEmbeddingMocked } from '../lib/embed.js';
import { CostCapExceededError, assertMeetingCap } from '../lib/cost-guard.js';
import {
  jobDurationSeconds,
  jobsProcessedTotal,
  llmCostUsdTotal,
  llmTokensTotal,
} from '../lib/metrics.js';
import { pgmqDelete, pgmqRead, type PgmqRow } from '../lib/pgmq.js';

/**
 * pgmq `generate_embeddings` consumer (T-013 / T-015 検索の前提)。
 *
 * パイプライン:
 *   1. pgmq.read('generate_embeddings', vt=120, qty=N) で 1 バッチ取得
 *   2. payload を generateEmbeddingsPayload で zod 検証
 *   3. (sourceType, sourceId) から org_id / sensitivity / visibility / owner を解決
 *   4. chunks が無い (text only fallback) なら 800-token chunker + 100 overlap で分割
 *   5. embedTexts() で 50 件ずつ batch embedding
 *   6. knowledge_embeddings に bulk INSERT (metadata: { sensitivity, visibility,
 *      owner_user_id, source_id, recording_id?, meeting_id?, start_sec? })
 *   7. cost-guard: spendUsd > COST_CAPS.perMeetingUsd で MEETING_COST_CAP_EXCEEDED throw
 *   8. pgmq.delete で ack。失敗時は visibility timeout で自動 retry を待つ。
 *
 * OPENAI_API_KEY 不在時:
 *   embedTexts() が mock vector を返す。warn ログを出して動作は継続。
 *
 * NOTE: pgmq.read/delete RPC が DB に無いため、ocr.ts と同様 postgres-js direct
 *       SQL fallback で実装する。本ファイルは Phase2E の最小限であり、parallel
 *       consumer 数は 1 のままで OK (T-015 後で multi-worker 化)。
 */

const QUEUE_NAME = 'generate_embeddings';
/** chunk 単位 でも一応 cost-guard を回すため、推定 USD のローカル和を保持。 */
const EMBED_SPEND_BUDGET_USD = COST_CAPS.perMeetingUsd;

// Round 2 Architect HIGH-A-03: pgmq.read / pgmq.delete は lib/pgmq.ts の
// singleton client 経由で呼ぶ (旧実装は毎 tick で接続を new + close していた)。

/**
 * 簡易 tokenizer (whitespace + 日本語想定の文字単位 1tok=2char 概算)。
 *
 * 設計判断:
 *   - GPT-3.5/4 用 BPE は worker 内に持ち込むと依存が膨らむ。
 *   - text-embedding-3-small の max は 8192 token = 約 12k 文字 (日本語) なので、
 *     CHUNK_TOKENS=800 (~ 1.2k 文字) で十分余裕がある。
 *   - 厳密 token 数は知らなくても安全側 (under-estimate なら chunk が小さくなるだけ)。
 */
function estimateTokens(text: string): number {
  // 半角は 1tok ≈ 4 char, 日本語は 1tok ≈ 2 char。混在を平均で 3 char/tok とする。
  return Math.ceil(text.length / 3);
}

function tokenWindow(text: string, targetTokens: number): { start: number; end: number } {
  const targetChars = targetTokens * 3;
  return { start: 0, end: Math.min(text.length, targetChars) };
}

/**
 * 800-token (overlap 100) chunker。改行 / 句読点 / 空白の優先順位で boundary を選ぶ。
 */
export function chunkText(text: string, tokens = CHUNK_TOKENS, overlap = CHUNK_OVERLAP): string[] {
  if (!text || text.length === 0) return [];
  const targetChars = tokens * 3;
  const overlapChars = overlap * 3;
  if (text.length <= targetChars) return [text];

  const chunks: string[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    let end = Math.min(text.length, cursor + targetChars);
    if (end < text.length) {
      // boundary を見つける (改行 > 「。」「.」「!」「?」 > 空白)
      const slice = text.slice(cursor, end);
      const nl = slice.lastIndexOf('\n');
      const sent = Math.max(
        slice.lastIndexOf('。'),
        slice.lastIndexOf('.'),
        slice.lastIndexOf('?'),
        slice.lastIndexOf('!'),
      );
      const sp = slice.lastIndexOf(' ');
      const cut = [nl, sent, sp].filter((i) => i >= targetChars * 0.5).sort((a, b) => b - a)[0];
      if (cut && cut > 0) end = cursor + cut + 1;
    }
    chunks.push(text.slice(cursor, end));
    if (end >= text.length) break;
    cursor = Math.max(end - overlapChars, cursor + 1);
  }
  return chunks;
}

interface SourceResolved {
  orgId: string;
  sensitivity: 'public' | 'internal' | 'sensitive' | 'restricted';
  visibility: 'org_internal' | 'private_owner' | null;
  ownerUserId: string | null;
  /** 付随 metadata (RPC 側 prefilter には影響しないが UI 用)。 */
  extra: Record<string, unknown>;
}

async function resolveSource(
  sourceType: GenerateEmbeddingsPayload['sourceType'],
  sourceId: string,
): Promise<SourceResolved> {
  const fallback: SourceResolved = {
    orgId: DEFAULT_ORG_ID,
    sensitivity: 'internal',
    visibility: 'org_internal',
    ownerUserId: null,
    extra: {},
  };
  try {
    switch (sourceType) {
      case 'recording_segment': {
        const { data } = (await supabaseAdmin
          .from('recordings')
          .select('id, org_id, sensitivity, meeting_id, meeting:meetings(id, owner_user_id)')
          .eq('id', sourceId)
          .maybeSingle()) as unknown as {
          data:
            | {
                id: string;
                org_id: string;
                sensitivity: string | null;
                meeting_id: string | null;
                meeting?: { id: string; owner_user_id: string | null } | null;
              }
            | null;
        };
        if (!data) return fallback;
        return {
          orgId: data.org_id ?? DEFAULT_ORG_ID,
          sensitivity: (data.sensitivity as SourceResolved['sensitivity']) ?? 'internal',
          visibility: 'org_internal',
          ownerUserId: data.meeting?.owner_user_id ?? null,
          extra: {
            recording_id: data.id,
            meeting_id: data.meeting_id ?? data.meeting?.id ?? null,
          },
        };
      }
      case 'meeting_notes': {
        const { data } = (await supabaseAdmin
          .from('meetings')
          .select('id, org_id, owner_user_id')
          .eq('id', sourceId)
          .maybeSingle()) as unknown as {
          data: { id: string; org_id: string; owner_user_id: string | null } | null;
        };
        if (!data) return fallback;
        return {
          orgId: data.org_id ?? DEFAULT_ORG_ID,
          sensitivity: 'internal',
          visibility: 'org_internal',
          ownerUserId: data.owner_user_id,
          extra: { meeting_id: data.id },
        };
      }
      case 'knowledge_item': {
        // P2 後段で knowledge_items table が増えたら追加。今はデフォルト処理。
        return fallback;
      }
      case 'email':
      case 'handoff': {
        // P2 後段。フォールバックで internal/owner=null。
        return fallback;
      }
      default:
        return fallback;
    }
  } catch (err) {
    logger.warn(
      { err: (err as Error).message, sourceType, sourceId },
      'resolveSource failed; using fallback',
    );
    return fallback;
  }
}

interface PreparedChunk {
  index: number;
  text: string;
  metadata: Record<string, unknown>;
}

function prepareChunks(
  payload: GenerateEmbeddingsPayload,
  source: SourceResolved,
): PreparedChunk[] {
  if (payload.chunks && payload.chunks.length > 0) {
    return payload.chunks.map((c) => ({
      index: c.index,
      text: c.text,
      metadata: {
        ...source.extra,
        ...(c.metadata ?? {}),
        sensitivity: source.sensitivity,
        visibility: source.visibility,
        owner_user_id: source.ownerUserId,
        source_id: payload.sourceId,
        source_type: payload.sourceType,
        org_id: source.orgId,
      },
    }));
  }
  return [];
}

export async function processEmbedJob(payload: GenerateEmbeddingsPayload): Promise<{
  ok: boolean;
  inserted: number;
  mocked: boolean;
  spendUsd: number;
  reason?: string;
}> {
  const log = logger.child({ job: 'embed', sourceType: payload.sourceType, sourceId: payload.sourceId });
  if (!payload.chunks || payload.chunks.length === 0) {
    log.warn('embed payload has no chunks; nothing to do');
    return { ok: true, inserted: 0, mocked: isEmbeddingMocked(), spendUsd: 0 };
  }

  const source = await resolveSource(payload.sourceType, payload.sourceId);

  // チャンク再分割 (chunks がすでに 800tok 以下のはずだが念のため再 chunking)
  const expanded: PreparedChunk[] = [];
  let runningIndex = 0;
  for (const c of prepareChunks(payload, source)) {
    const sub = chunkText(c.text);
    if (sub.length === 0) continue;
    for (const part of sub) {
      expanded.push({
        index: runningIndex++,
        text: part,
        metadata: { ...c.metadata, chunk_parent_index: c.index },
      });
    }
  }
  if (expanded.length === 0) {
    log.warn('after chunking, no chunks remained');
    return { ok: true, inserted: 0, mocked: isEmbeddingMocked(), spendUsd: 0 };
  }

  const tokens = expanded.reduce((sum, c) => sum + estimateTokens(c.text), 0);
  log.info(
    {
      orgId: source.orgId,
      sensitivity: source.sensitivity,
      chunks: expanded.length,
      tokensEstimated: tokens,
      mocked: isEmbeddingMocked(),
    },
    'embed: starting',
  );

  // 1) embed (batch 50)
  const embed = await embedTexts(expanded.map((c) => c.text));

  // 2) cost-guard — generate_embeddings は 1 source = 1 meeting 単位なので
  //    perMeetingUsd を流用。token-based 概算 spendUsd 。
  try {
    assertMeetingCap({ meetingId: payload.sourceId, spendUsd: embed.spendUsd });
  } catch (err) {
    if (err instanceof CostCapExceededError) {
      log.error(
        { spendUsd: embed.spendUsd, cap: EMBED_SPEND_BUDGET_USD },
        'embed: cost cap exceeded; aborting',
      );
      return { ok: false, inserted: 0, mocked: embed.mocked, spendUsd: embed.spendUsd, reason: 'cost_cap' };
    }
    throw err;
  }

  // 3) bulk INSERT
  const rows = expanded.map((c, i) => ({
    org_id: source.orgId,
    source_type: payload.sourceType,
    source_id: payload.sourceId,
    chunk_text: c.text.slice(0, 8000), // DDL 上は text だが暴走防止
    chunk_index: c.index,
    embedding: embed.vectors[i],
    metadata: c.metadata,
  }));

  const { error: insertErr } = await supabaseAdmin.from('knowledge_embeddings').insert(rows);
  if (insertErr) {
    log.error(
      { err: insertErr.message, code: (insertErr as { code?: string }).code },
      'knowledge_embeddings insert failed',
    );
    return {
      ok: false,
      inserted: 0,
      mocked: embed.mocked,
      spendUsd: embed.spendUsd,
      reason: 'insert_failed',
    };
  }

  // 4) metrics: token usage + cost (mocked=true なら token=0 / spend=0 のはず)
  if (!embed.mocked && embed.totalTokens > 0) {
    llmTokensTotal.inc(
      { vendor: 'openai', model: 'text-embedding-3-small', kind: 'input' },
      embed.totalTokens,
    );
    llmCostUsdTotal.inc(
      { vendor: 'openai', model: 'text-embedding-3-small' },
      embed.spendUsd,
    );
  }

  log.info(
    { inserted: rows.length, tokensTotal: embed.totalTokens, spendUsd: embed.spendUsd },
    'embed: done',
  );
  return { ok: true, inserted: rows.length, mocked: embed.mocked, spendUsd: embed.spendUsd };
}

let inFlightTick = false;
export async function tickEmbed(opts?: {
  batchSize?: number;
  visibilitySec?: number;
}): Promise<{ processed: number; acked: number; failed: number }> {
  const batchSize = opts?.batchSize ?? 3;
  const visibilitySec = opts?.visibilitySec ?? 120;
  if (inFlightTick) return { processed: 0, acked: 0, failed: 0 };
  inFlightTick = true;
  const log = logger.child({ tick: 'embed' });
  try {
    const rows: PgmqRow<unknown>[] = await pgmqRead<unknown>(QUEUE_NAME, {
      visibilityTimeoutSeconds: visibilitySec,
      batch: batchSize,
    });
    if (rows.length === 0) return { processed: 0, acked: 0, failed: 0 };

    let acked = 0;
    let failed = 0;
    for (const row of rows) {
      jobsProcessedTotal.inc({ queue: QUEUE_NAME, status: 'started' });
      const jobStart = process.hrtime.bigint();

      const parsed = generateEmbeddingsPayload.safeParse(row.message);
      if (!parsed.success) {
        log.warn(
          { msgId: row.msg_id, err: parsed.error.message },
          'payload schema invalid; dropping',
        );
        await pgmqDelete(QUEUE_NAME, row.msg_id);
        acked++;
        jobsProcessedTotal.inc({ queue: QUEUE_NAME, status: 'invalid' });
        jobDurationSeconds.observe(
          { queue: QUEUE_NAME, status: 'invalid' },
          Number(process.hrtime.bigint() - jobStart) / 1e9,
        );
        continue;
      }
      try {
        const res = await processEmbedJob(parsed.data);
        const durationSec = Number(process.hrtime.bigint() - jobStart) / 1e9;
        if (res.ok) {
          await pgmqDelete(QUEUE_NAME, row.msg_id);
          acked++;
          jobsProcessedTotal.inc({ queue: QUEUE_NAME, status: 'done' });
          jobDurationSeconds.observe({ queue: QUEUE_NAME, status: 'done' }, durationSec);
        } else {
          failed++;
          jobsProcessedTotal.inc({ queue: QUEUE_NAME, status: 'failed' });
          jobDurationSeconds.observe({ queue: QUEUE_NAME, status: 'failed' }, durationSec);
          if (res.reason === 'cost_cap') {
            // cost_cap は再試行しても直らないので ack して落とす
            await pgmqDelete(QUEUE_NAME, row.msg_id);
            acked++;
          }
          // それ以外 (insert_failed 等) は visibility timeout で自動 retry
        }
      } catch (err) {
        failed++;
        const durationSec = Number(process.hrtime.bigint() - jobStart) / 1e9;
        jobsProcessedTotal.inc({ queue: QUEUE_NAME, status: 'failed' });
        jobDurationSeconds.observe({ queue: QUEUE_NAME, status: 'failed' }, durationSec);
        log.error({ err: (err as Error).message, msgId: row.msg_id }, 'embed job threw');
      }
    }
    return { processed: rows.length, acked, failed };
  } finally {
    inFlightTick = false;
  }
}
