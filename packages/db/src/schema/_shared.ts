import { sql } from 'drizzle-orm';
import { uuid } from 'drizzle-orm/pg-core';

/**
 * シングルテナント運用 (Phase 1) における既定 org_id。
 * v2.1 (T-1) で「全テーブルに org_id NOT NULL」が CRIT で確定したため、
 * P1 では DEFAULT 値を埋めて将来のマルチテナント化に備える。
 *
 * RLS の基本句は (org_id = current_setting('app.org_id', true)::uuid) に統一する。
 * ただし current_setting が未設定の場合 (single-tenant 環境) は
 * 0012_rls_v2.sql の current_org_id() ヘルパーがこの DEFAULT_ORG_ID を返す。
 */
export const DEFAULT_ORG_ID = '00000000-0000-0000-0000-000000000001';

/**
 * 全テーブル共通の orgId カラム。
 * Phase 1 はシングルテナント運用なので DEFAULT を入れて NOT NULL を満たす。
 * Phase 2 以降で auth.users.raw_app_meta_data->>'org_id' から動的に解決する。
 */
export const orgIdColumn = () =>
  uuid('org_id')
    .notNull()
    .default(sql.raw(`'${DEFAULT_ORG_ID}'::uuid`));
