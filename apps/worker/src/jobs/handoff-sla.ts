import { logger } from '../lib/logger.js';
import { supabaseAdmin } from '../lib/supabase.js';

/**
 * Handoff SLA escalate job (Round2 P1 cross-cutting G-P0-2 partial)。
 *
 * 仕様 (reviews/design_gap_round1/cross-cutting.md G-P0-2 + F-S9-1):
 *   - 営業 → CS のハンドオフ通知 (`notifications.type = 'handoff_pending'`) が
 *     48 時間以内に既読化されない場合、本人と上長 (manager) に再通知する。
 *   - 72 時間で admin にも escalate する。
 *   - 同じ通知を二度 escalate しないよう metadata.escalated_at_48h / 72h を立てる。
 *
 * 実装方針:
 *   - tickHandoffSla() を 5 分間隔の tickAll に組み込む。
 *   - supabaseAdmin (service_role) で SELECT/UPDATE/INSERT を直接実行する。
 *     RLS は service_role bypass。worker は user_id を明示しているため
 *     "auth.uid()=NULL trap" (memory: feedback_security_definer_auth_uid_service_role) は
 *     踏まない。
 *   - manager / admin は同じ org の users から SELECT する。
 *     Phase1 は単一 org なので全 manager / admin を escalate 対象とする
 *     (Phase2 で direct_manager_user_id 列が入ったら個別に絞り込む)。
 *
 * 失敗時: ログだけ出して次の tick に任せる (再試行は次 tick で自然に発生)。
 */

const HANDOFF_TYPE = 'handoff_pending';
const ESCALATE_48H_MS = 48 * 60 * 60 * 1000;
const ESCALATE_72H_MS = 72 * 60 * 60 * 1000;

interface HandoffNotificationRow {
  id: string;
  org_id: string;
  user_id: string;
  title: string;
  body: string | null;
  link_url: string | null;
  read_at: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

interface UserMiniRow {
  id: string;
  role: 'sales' | 'cs' | 'manager' | 'admin' | 'legal';
  is_active: boolean | null;
}

/**
 * 1 tick で実行する。tickAll から呼ばれる。
 *
 * @returns processed = 走査対象通知数 / acked = escalate 完了数 / failed = エラー数
 */
export async function tickHandoffSla(): Promise<{
  processed: number;
  acked: number;
  failed: number;
}> {
  const log = logger.child({ op: 'tickHandoffSla' });
  const now = Date.now();
  const cutoff48Iso = new Date(now - ESCALATE_48H_MS).toISOString();

  // 48h 以上経過した未読 handoff_pending 通知を最大 100 件取得。
  // 72h 判定は metadata.escalated_at_48h の有無 + created_at で個別に行う。
  let rows: HandoffNotificationRow[] = [];
  try {
    const { data, error } = await supabaseAdmin
      .from('notifications')
      .select('id,org_id,user_id,title,body,link_url,read_at,created_at,metadata')
      .eq('type', HANDOFF_TYPE)
      .is('read_at', null)
      .lte('created_at', cutoff48Iso)
      .order('created_at', { ascending: true })
      .limit(100);
    if (error) {
      log.warn({ err: error.message }, 'select handoff_pending failed');
      return { processed: 0, acked: 0, failed: 1 };
    }
    rows = (data ?? []) as HandoffNotificationRow[];
  } catch (err) {
    log.warn({ err: (err as Error).message }, 'select handoff_pending threw');
    return { processed: 0, acked: 0, failed: 1 };
  }

  if (rows.length === 0) {
    return { processed: 0, acked: 0, failed: 0 };
  }

  let acked = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const result = await escalateOne(row, now);
      if (result === 'escalated') acked += 1;
      // result === 'skipped' (既に両 escalate 済 / cooldown 中) は acked 加算しない。
    } catch (err) {
      failed += 1;
      log.warn(
        { err: (err as Error).message, notificationId: row.id },
        'escalateOne threw',
      );
    }
  }

  return { processed: rows.length, acked, failed };
}

/**
 * テスト容易性のため export。1 件の handoff 通知に対する escalate 判定 + 実行。
 *
 * @returns 'escalated' (1 件以上の追加通知を出した) / 'skipped' (cooldown 中など no-op)
 */
export async function escalateOne(
  row: HandoffNotificationRow,
  now: number,
): Promise<'escalated' | 'skipped'> {
  const createdAt = new Date(row.created_at).getTime();
  if (Number.isNaN(createdAt)) return 'skipped';
  const ageMs = now - createdAt;
  const metadata: Record<string, unknown> = { ...(row.metadata ?? {}) };

  const has48 = typeof metadata.escalated_at_48h === 'string';
  const has72 = typeof metadata.escalated_at_72h === 'string';

  // 既に両方 escalate 済なら何もしない。
  if (has72) return 'skipped';

  const nowIso = new Date(now).toISOString();
  const linkUrl = row.link_url ?? null;
  const baseTitle = row.title.replace(/^商談ハンドオフ:\s*/, '');

  let didEscalate = false;

  // ---- 48h escalate (未実施 & ageMs >= 48h) ----
  if (!has48 && ageMs >= ESCALATE_48H_MS) {
    // 本人にも再通知 (mention で「未読 48h」を明示)。
    await insertEscalationNotification({
      orgId: row.org_id,
      userId: row.user_id,
      type: 'handoff_pending',
      title: `ハンドオフ未確認 (48h): ${baseTitle}`,
      body: row.body,
      linkUrl,
      originalId: row.id,
      tier: '48h',
    });

    // manager に escalate。
    const managers = await fetchEscalationTargets(row.org_id, ['manager']);
    for (const m of managers) {
      await insertEscalationNotification({
        orgId: row.org_id,
        userId: m.id,
        type: 'admin_action',
        title: `部下のハンドオフが 48 時間未確認です: ${baseTitle}`,
        body: row.body,
        linkUrl,
        originalId: row.id,
        tier: '48h',
      });
    }

    metadata.escalated_at_48h = nowIso;
    metadata.escalated_to_48h = managers.map((m) => m.id);
    didEscalate = true;
  }

  // ---- 72h escalate (未実施 & ageMs >= 72h) ----
  if (!has72 && ageMs >= ESCALATE_72H_MS) {
    const admins = await fetchEscalationTargets(row.org_id, ['admin']);
    for (const a of admins) {
      await insertEscalationNotification({
        orgId: row.org_id,
        userId: a.id,
        type: 'admin_action',
        title: `ハンドオフが 72 時間未確認です: ${baseTitle}`,
        body: row.body,
        linkUrl,
        originalId: row.id,
        tier: '72h',
      });
    }

    metadata.escalated_at_72h = nowIso;
    metadata.escalated_to_72h = admins.map((a) => a.id);
    didEscalate = true;
  }

  // metadata に escalate 印を残す。read_at は触らない (本人がまだ未読のため)。
  if (didEscalate) {
    const { error } = await supabaseAdmin
      .from('notifications')
      .update({ metadata })
      .eq('id', row.id);
    if (error) {
      // metadata 更新失敗は致命傷 — 次 tick で多重 escalate される可能性があるので throw して log に残す。
      throw new Error(`metadata update failed: ${error.message}`);
    }
    return 'escalated';
  }

  return 'skipped';
}

interface InsertEscalationInput {
  orgId: string;
  userId: string;
  type: 'handoff_pending' | 'admin_action';
  title: string;
  body: string | null;
  linkUrl: string | null;
  originalId: string;
  tier: '48h' | '72h';
}

async function insertEscalationNotification(input: InsertEscalationInput): Promise<void> {
  const { error } = await supabaseAdmin.from('notifications').insert({
    org_id: input.orgId,
    user_id: input.userId,
    type: input.type,
    title: input.title,
    body: input.body,
    link_url: input.linkUrl,
    is_read: false,
    metadata: {
      escalationOfNotificationId: input.originalId,
      escalationTier: input.tier,
    },
  });
  if (error) {
    throw new Error(`escalation notification insert failed: ${error.message}`);
  }
}

/**
 * 指定 org 内の指定 role を持つアクティブユーザを返す。
 * Phase1 は単一 org なので org_id フィルタはあるが実質全件取得に近い。
 */
async function fetchEscalationTargets(
  orgId: string,
  roles: Array<UserMiniRow['role']>,
): Promise<UserMiniRow[]> {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('id,role,is_active')
    .eq('org_id', orgId)
    .in('role', roles)
    .eq('is_active', true);
  if (error) {
    // users.is_active 等が無い古い環境では fallback で空配列を返す。
    logger.debug({ err: error.message }, 'fetchEscalationTargets failed (soft-fail)');
    return [];
  }
  return (data ?? []) as UserMiniRow[];
}
