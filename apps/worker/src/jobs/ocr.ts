import {
  COST_CAPS,
  DEFAULT_ORG_ID,
  STORAGE_BUCKETS,
  processBusinessCardPayload,
} from '@ksp/shared';
import type { ProcessBusinessCardPayload } from '@ksp/shared';
import { appendAudit } from '../lib/audit.js';
import { findDuplicates, type DedupeCandidate } from '../lib/dedupe.js';
import { logger } from '../lib/logger.js';
import {
  jobDurationSeconds,
  jobsProcessedTotal,
} from '../lib/metrics.js';
import { normalizeEmail, normalizeName, normalizePhone } from '../lib/normalize.js';
import { pickProvider, type OcrProvider } from '../lib/ocr/providers.js';
import { pgmqDelete, pgmqRead, type PgmqRow } from '../lib/pgmq.js';
import { supabaseAdmin } from '../lib/supabase.js';

/**
 * 名刺 OCR の pgmq consumer (Phase2B T-009)。
 *
 * パイプライン:
 *   1. pgmq.read('process_business_card', vt=60, qty=N) で 1 バッチ取得
 *   2. payload を zod 検証
 *   3. jobs_inflight でジョブ冪等性ガード (既に処理中ならスキップ)
 *   4. Storage 'business-cards' bucket から imageBytes を download
 *   5. OcrProvider.recognize() を実行 → OcrResult
 *   6. cost-guard で COST_CAPS.perConversationUsd 超過判定
 *   7. contacts UPDATE: name/email/phone/title + normalized_* + ocr_raw_json + ocr_confidence
 *   8. 既存 contacts から dedupe 候補を引いて findDuplicates() を回す
 *   9. 重複あり: review_status='duplicate_suspect' + contact_duplicates INSERT
 *      重複なし: review_status='pending_review'
 *   10. pgmq.delete で ack。失敗時は visibility timeout で自動 retry を待つ。
 *
 * 外部副作用は本ファイルに局所化。dedupe / normalize / providers は純粋。
 *
 * NOTE: pgmq.read / pgmq.delete を実行する RPC が DB 側にまだ無いため、
 *       postgres-js direct SQL fallback 経路で実装する。
 */

// Round4: DEFAULT_ORG_ID は packages/shared の単一定義 (drift 防止)
const QUEUE_NAME = 'process_business_card';

// Round 2 Architect HIGH-A-03: pgmq.read / pgmq.delete は lib/pgmq.ts の
// singleton client 経由で呼ぶ。旧実装は毎 tick で postgres() を new + close
// していて接続が暴走していた。

/**
 * jobs_inflight に (queue, idempotency_key) で行を入れる。
 * 既に存在する (= unique_violation 23505) なら false を返し、呼び出し側に
 * 「他 worker が処理中なので skip しろ」と伝える。
 */
async function acquireInflight(
  idempotencyKey: string,
  expiresAt: Date,
  acquiredBy: string,
): Promise<boolean> {
  const { error } = await supabaseAdmin.from('jobs_inflight').insert({
    org_id: DEFAULT_ORG_ID,
    queue_name: QUEUE_NAME,
    idempotency_key: idempotencyKey,
    acquired_by: acquiredBy,
    expires_at: expiresAt.toISOString(),
  });
  if (!error) return true;
  // 23505 = unique_violation = 他 worker が先に取った
  if ((error as { code?: string }).code === '23505') return false;
  // テーブル不在 (relation does not exist) などは soft-fail (true 扱い)。
  // 本番では migration が当たっている前提だが、CI/dev は通過させる。
  logger.warn(
    { err: error.message, code: (error as { code?: string }).code },
    'jobs_inflight insert failed; proceeding (soft-fail)',
  );
  return true;
}

async function releaseInflight(idempotencyKey: string): Promise<void> {
  try {
    await supabaseAdmin
      .from('jobs_inflight')
      .delete()
      .eq('queue_name', QUEUE_NAME)
      .eq('idempotency_key', idempotencyKey);
  } catch (err) {
    logger.warn(
      { err: (err as Error).message, idempotencyKey },
      'jobs_inflight release failed',
    );
  }
}

/**
 * Storage から名刺画像 bytes を取得する。
 * supabase-js の download() は Blob を返すので arrayBuffer に変換する。
 */
async function downloadImage(storageKey: string): Promise<{
  bytes: Uint8Array;
  mime: string;
} | null> {
  const { data, error } = await supabaseAdmin.storage
    .from(STORAGE_BUCKETS.businessCards)
    .download(storageKey);
  if (error || !data) {
    logger.warn(
      { storageKey, err: error?.message },
      'business-card download failed',
    );
    return null;
  }
  const arrayBuf = await data.arrayBuffer();
  const mime = data.type || 'application/octet-stream';
  return { bytes: new Uint8Array(arrayBuf), mime };
}

/**
 * 同一 org の dedupe 候補 contacts を引く。
 *   - business_card_image_hash 完全一致
 *   - normalized_email / normalized_phone 一致
 *   - review_status != 'merged' (merged 済は dedupe 対象外)
 *
 * 1 クエリで OR を組むより 3 クエリ並行の方が index hit 率が良い。
 */
async function fetchDedupeCandidates(
  orgId: string,
  newContactId: string,
  imageHash: string | null,
  normEmail: string | null,
  normPhone: string | null,
): Promise<DedupeCandidate[]> {
  const baseSelect =
    'id, name, email, phone, linkedin_url, business_card_image_hash, captured_at, company_id, companies(name)';

  const queries: Promise<{
    data:
      | Array<{
          id: string;
          name: string | null;
          email: string | null;
          phone: string | null;
          linkedin_url: string | null;
          business_card_image_hash: string | null;
          captured_at: string | null;
          companies: { name: string | null } | { name: string | null }[] | null;
        }>
      | null;
    error: { message: string } | null;
  }>[] = [];

  if (imageHash) {
    queries.push(
      supabaseAdmin
        .from('contacts')
        .select(baseSelect)
        .eq('org_id', orgId)
        .eq('business_card_image_hash', imageHash)
        .neq('id', newContactId)
        .is('deleted_at', null)
        .limit(10) as unknown as Promise<{
        data: never;
        error: never;
      }>,
    );
  }
  if (normEmail) {
    queries.push(
      supabaseAdmin
        .from('contacts')
        .select(baseSelect)
        .eq('org_id', orgId)
        .eq('normalized_email', normEmail)
        .neq('id', newContactId)
        .is('deleted_at', null)
        .limit(10) as unknown as Promise<{ data: never; error: never }>,
    );
  }
  if (normPhone) {
    queries.push(
      supabaseAdmin
        .from('contacts')
        .select(baseSelect)
        .eq('org_id', orgId)
        .eq('normalized_phone', normPhone)
        .neq('id', newContactId)
        .is('deleted_at', null)
        .limit(10) as unknown as Promise<{ data: never; error: never }>,
    );
  }

  if (queries.length === 0) return [];

  const results = await Promise.all(queries);
  const seen = new Map<string, DedupeCandidate>();
  for (const r of results) {
    if (r.error || !r.data) continue;
    for (const row of r.data) {
      if (seen.has(row.id)) continue;
      const companies = row.companies;
      const companyName = Array.isArray(companies)
        ? (companies[0]?.name ?? null)
        : (companies?.name ?? null);
      seen.set(row.id, {
        contactId: row.id,
        name: row.name ?? null,
        companyName,
        email: row.email ?? null,
        phone: row.phone ?? null,
        linkedinUrl: row.linkedin_url ?? null,
        businessCardImageHash: row.business_card_image_hash ?? null,
        capturedAt: row.captured_at ?? null,
      });
    }
  }
  return Array.from(seen.values());
}

/**
 * 1 件の名刺ジョブを処理する。例外を投げない (caller は ack するかどうかで挙動分岐)。
 *
 * @return  ok: true なら ack (pgmq.delete)、false なら visibility expire で retry。
 */
export async function processOcrJob(
  payload: ProcessBusinessCardPayload,
  msgId: number,
  provider: OcrProvider,
): Promise<{ ok: boolean; reason?: string }> {
  const log = logger.child({
    job: 'ocr',
    msgId,
    contactId: payload.contactId,
    provider: provider.name,
  });

  // idempotency_key = contactId (1 contact につき 1 OCR で十分)
  const idemKey = `ocr:${payload.contactId}`;
  // visibility timeout より少し短い TTL で行を作る
  const expiresAt = new Date(Date.now() + 2 * 60_000);
  const acquired = await acquireInflight(idemKey, expiresAt, `worker:${process.pid}`);
  if (!acquired) {
    log.info('job already in-flight by another worker; skip');
    return { ok: false, reason: 'in_flight' };
  }

  try {
    // 1) 画像取得
    const image = await downloadImage(payload.imageStorageKey);
    if (!image) {
      log.warn('image not found in storage; leaving contact in pending_review');
      await markPendingReview(payload.contactId);
      return { ok: true, reason: 'image_missing' };
    }

    // 2) OCR
    const ocr = await provider.recognize(image.bytes, image.mime);

    // 3) Cost guard (provider が見積コストを estimatedCostUsd で返す)
    const spend = ocr.estimatedCostUsd ?? 0;
    if (spend > COST_CAPS.perConversationUsd) {
      log.warn(
        { spend, cap: COST_CAPS.perConversationUsd },
        'ocr cost cap exceeded; failing job',
      );
      await markPendingReview(payload.contactId);
      return { ok: false, reason: 'cost_cap_exceeded' };
    }

    // 4) 正規化
    const name = normalizeName(ocr.fields.name ?? null);
    const email = normalizeEmail(ocr.fields.email ?? null);
    const phone = normalizePhone(ocr.fields.phone ?? null);

    // 5) contact UPDATE (基本フィールド + normalized + raw json)
    const update: Record<string, unknown> = {
      ocr_raw_json: ocr,
      ocr_confidence: Number(ocr.overallConfidence.toFixed(2)),
      updated_at: new Date().toISOString(),
    };
    if (name) update.name = name;
    if (ocr.fields.nameKana) update.name_kana = ocr.fields.nameKana;
    if (ocr.fields.title) update.title = ocr.fields.title;
    if (ocr.fields.email) update.email = ocr.fields.email;
    if (ocr.fields.phone) update.phone = ocr.fields.phone;
    if (email) update.normalized_email = email;
    if (phone) update.normalized_phone = phone;

    const { error: updErr } = await supabaseAdmin
      .from('contacts')
      .update(update)
      .eq('id', payload.contactId);

    if (updErr) {
      log.warn({ err: updErr.message }, 'contacts update failed');
      return { ok: false, reason: 'db_update_failed' };
    }

    // 6) 現 contact の image_hash も拾って dedupe 候補をひく
    const { data: meRow } = await supabaseAdmin
      .from('contacts')
      .select('id, business_card_image_hash, linkedin_url, company_id, companies(name)')
      .eq('id', payload.contactId)
      .maybeSingle();

    const meCompanies = (meRow as { companies?: unknown } | null)?.companies;
    const meCompanyName = Array.isArray(meCompanies)
      ? ((meCompanies[0] as { name?: string } | undefined)?.name ?? null)
      : ((meCompanies as { name?: string } | null)?.name ?? null);

    const newCandidate: DedupeCandidate = {
      contactId: payload.contactId,
      name,
      companyName: meCompanyName ?? ocr.fields.companyName ?? null,
      email,
      phone,
      linkedinUrl: (meRow as { linkedin_url?: string | null } | null)?.linkedin_url ?? null,
      businessCardImageHash:
        (meRow as { business_card_image_hash?: string | null } | null)
          ?.business_card_image_hash ?? null,
    };

    const candidates = await fetchDedupeCandidates(
      DEFAULT_ORG_ID,
      payload.contactId,
      newCandidate.businessCardImageHash,
      email,
      phone,
    );
    const dupes = findDuplicates(newCandidate, candidates);

    // 7) review_status 遷移 + contact_duplicates INSERT
    if (dupes.length > 0) {
      await supabaseAdmin
        .from('contacts')
        .update({ review_status: 'duplicate_suspect' })
        .eq('id', payload.contactId);

      const rows = dupes.map((d) => ({
        org_id: DEFAULT_ORG_ID,
        new_contact_id: payload.contactId,
        existing_contact_id: d.contactId,
        match_score: Number(d.score.toFixed(2)),
        match_fields: d.matchFields,
        resolution: 'pending',
      }));
      const { error: dupErr } = await supabaseAdmin.from('contact_duplicates').insert(rows);
      if (dupErr) {
        log.warn(
          { err: dupErr.message, dupes: dupes.length },
          'contact_duplicates insert failed (continuing)',
        );
      }
    } else {
      await supabaseAdmin
        .from('contacts')
        .update({ review_status: 'pending_review' })
        .eq('id', payload.contactId);
    }

    // 8) 監査ログ (失敗してもブロックしない)
    await appendAudit({
      orgId: DEFAULT_ORG_ID,
      actorUserId: payload.uploadedBy,
      action: 'update',
      resourceType: 'contact',
      resourceId: payload.contactId,
      payload: {
        op: 'ocr_completed',
        provider: provider.name,
        overall_confidence: ocr.overallConfidence,
        estimated_cost_usd: spend,
        duplicates_found: dupes.length,
      },
    });

    log.info(
      {
        confidence: ocr.overallConfidence,
        dupes: dupes.length,
        provider: provider.name,
      },
      'ocr job completed',
    );
    return { ok: true };
  } catch (err) {
    log.error({ err: (err as Error).message }, 'ocr job threw');
    await markPendingReview(payload.contactId);
    return { ok: false, reason: 'exception' };
  } finally {
    await releaseInflight(idemKey);
  }
}

async function markPendingReview(contactId: string): Promise<void> {
  try {
    await supabaseAdmin
      .from('contacts')
      .update({
        review_status: 'pending_review',
        updated_at: new Date().toISOString(),
      })
      .eq('id', contactId);
  } catch (err) {
    logger.warn(
      { err: (err as Error).message, contactId },
      'markPendingReview failed',
    );
  }
}

/**
 * 1 tick: キューから最大 N 件読んで順次処理する。
 * setInterval から起動。多重起動防止は in-process boolean で十分。
 */
let inFlightTick = false;
export async function tickOcr(opts?: { batchSize?: number; visibilitySec?: number }): Promise<{
  processed: number;
  acked: number;
  failed: number;
}> {
  const batchSize = opts?.batchSize ?? 5;
  const visibilitySec = opts?.visibilitySec ?? 60;

  if (inFlightTick) {
    return { processed: 0, acked: 0, failed: 0 };
  }
  inFlightTick = true;
  const log = logger.child({ tick: 'ocr' });

  try {
    const rows: PgmqRow<unknown>[] = await pgmqRead<unknown>(QUEUE_NAME, {
      visibilityTimeoutSeconds: visibilitySec,
      batch: batchSize,
    });

    if (rows.length === 0) {
      return { processed: 0, acked: 0, failed: 0 };
    }

    const provider = pickProvider();
    let acked = 0;
    let failed = 0;

    for (const row of rows) {
      jobsProcessedTotal.inc({ queue: QUEUE_NAME, status: 'started' });
      const jobStart = process.hrtime.bigint();

      const parsed = processBusinessCardPayload.safeParse(row.message);
      if (!parsed.success) {
        log.warn(
          { msgId: row.msg_id, err: parsed.error.message },
          'payload schema invalid; dropping',
        );
        // schema 不正は ack して queue から落とす (再試行しても直らない)
        await pgmqDelete(QUEUE_NAME, row.msg_id);
        acked += 1;
        jobsProcessedTotal.inc({ queue: QUEUE_NAME, status: 'invalid' });
        jobDurationSeconds.observe(
          { queue: QUEUE_NAME, status: 'invalid' },
          Number(process.hrtime.bigint() - jobStart) / 1e9,
        );
        continue;
      }
      const result = await processOcrJob(parsed.data, row.msg_id, provider);
      const durationSec = Number(process.hrtime.bigint() - jobStart) / 1e9;
      if (result.ok) {
        await pgmqDelete(QUEUE_NAME, row.msg_id);
        acked += 1;
        jobsProcessedTotal.inc({ queue: QUEUE_NAME, status: 'done' });
        jobDurationSeconds.observe({ queue: QUEUE_NAME, status: 'done' }, durationSec);
      } else {
        failed += 1;
        jobsProcessedTotal.inc({ queue: QUEUE_NAME, status: 'failed' });
        jobDurationSeconds.observe({ queue: QUEUE_NAME, status: 'failed' }, durationSec);
        // ack しない → visibility timeout 後 pgmq が再配信
      }
    }

    return { processed: rows.length, acked, failed };
  } finally {
    inFlightTick = false;
  }
}
