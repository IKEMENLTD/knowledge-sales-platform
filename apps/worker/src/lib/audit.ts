import type { AuditAction } from '@ksp/shared';
import { supabaseAdmin } from './supabase.js';
import { logger } from './logger.js';

/**
 * audit_logs append helper.
 *
 * 設計書 25_v2_review_resolutions C-5 / S-H-03:
 *   audit_logs テーブルは BEFORE INSERT trigger (audit_logs_compute_hash) で
 *   prev_hash / row_hash を補完する。worker からは `actor_user_id, action,
 *   resource_type, resource_id, payload, ip_address, user_agent` のみを渡せば
 *   良い。
 *
 * このヘルパは `supabaseAdmin` (service_role) を経由するため RLS をバイパスする。
 * 呼び出し側は `await appendAudit({...})` を fire-and-forget で OK。失敗時は
 * logger.warn に倒し、業務ロジックはブロックしない (監査追加で本処理を落とすと
 * UX 悪化のため)。
 *
 * NOTE: 0008_audit_logs.sql の trigger が `prev_hash = 同 org の直前 row_hash` を
 *       引くため、orgId は必ず指定すること。Phase1 では `00000000-...-001`
 *       (DEFAULT_ORG_ID) を渡すケースが大半。
 */

export interface AppendAuditInput {
  /** 監査対象 org. Phase1 は DEFAULT_ORG_ID 固定で OK */
  orgId: string;
  /** 操作主体 (auth.uid). 不在なら null = system context */
  actorUserId: string | null;
  /** auditAction enum 値 (shared/types.ts) */
  action: AuditAction;
  /** リソース種別 (例: 'recording', 'meeting', 'contact', 'share_link', 'webhook') */
  resourceType: string;
  /** リソース ID (UUID 文字列). string 以外は呼び出し側で正規化 */
  resourceId?: string | null;
  /** 追加情報 jsonb. PII を含めないこと */
  payload?: Record<string, unknown> | undefined;
  /** 端末 IP (inet 互換 string). null 可 */
  ipAddress?: string | null;
  /** User-Agent (raw). 短いほうが望ましい */
  userAgent?: string | null;
}

export interface AppendAuditResult {
  /** 追記された audit_logs.id (失敗時は null) */
  id: string | null;
  /** 失敗時に格納される短いエラー文字列 */
  error: string | null;
}

export async function appendAudit(input: AppendAuditInput): Promise<AppendAuditResult> {
  const log = logger.child({ op: 'audit.append', action: input.action });

  try {
    const row: Record<string, unknown> = {
      org_id: input.orgId,
      action: input.action,
      resource_type: input.resourceType,
      // row_hash は trigger 側で計算する。空文字を渡すと NOT NULL violation に
      // なるため、placeholder として固定文字列を入れる。trigger が上書きする。
      row_hash: 'pending',
    };
    if (input.actorUserId !== null && input.actorUserId !== undefined) {
      row.actor_user_id = input.actorUserId;
    }
    if (input.resourceId) row.resource_id = input.resourceId;
    if (input.payload !== undefined) row.payload = input.payload;
    if (input.ipAddress) row.ip_address = input.ipAddress;
    if (input.userAgent) row.user_agent = input.userAgent;

    const { data, error } = await supabaseAdmin
      .from('audit_logs')
      .insert(row)
      .select('id')
      .maybeSingle();

    if (error) {
      log.warn({ err: error.message, code: error.code }, 'audit_logs insert failed');
      return { id: null, error: error.message };
    }
    const id = (data as { id?: string } | null)?.id ?? null;
    return { id, error: null };
  } catch (err) {
    const msg = (err as Error).message;
    log.warn({ err: msg }, 'audit_logs insert threw');
    return { id: null, error: msg };
  }
}
