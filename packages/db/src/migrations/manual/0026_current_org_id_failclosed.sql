-- ============================================================================
-- 0026_current_org_id_failclosed.sql
-- current_org_id() を fail-closed 化 (S2-M-02)
--
-- 旧 0012_rls_v2.sql の current_org_id() は app.org_id GUC 未設定時に
-- DEFAULT_ORG_ID を返していたため、Phase2 マルチテナント期に
-- 「設定し忘れ → default org に書き込まれる」事故リスクが残る。
--
-- 本 migration では関数のみ「未設定なら NULL を返す」へ書き替える。
--
-- ただし Phase1 シングルテナント運用では既存テーブルの DEFAULT 値や、
-- INSERT ON CONFLICT DO NOTHING 経路で org_id が省略されるケースが残るため、
-- policy 句側の `and current_org_id() is not null` 二段ガード化は別 migration
-- (0027_*) で段階的に当てる方針 (本 migration では関数のみ更新する)。
--
-- 移行影響:
--   - GUC `app.org_id` を session/role で確実にセットする SOP を `docs/SECURITY.md`
--     に追記する。Supabase Auth 経由の認証セッションでは PreToolUse hook 等で
--     `select set_config('app.org_id', auth.jwt()->>'app_metadata.org_id', true)`
--     を毎回流す必要がある (P2 W1)。
-- ============================================================================

create or replace function public.current_org_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v text;
begin
  v := current_setting('app.org_id', true);
  if v is null or v = '' then
    -- fail-closed: 未設定なら NULL を返す
    return null;
  end if;
  return v::uuid;
exception when others then
  -- 不正値 (cast 失敗等) も fail-closed
  return null;
end;
$$;

comment on function public.current_org_id() is
  'S2-M-02 fail-closed v2: app.org_id GUC が未設定 / 不正値なら NULL を返す。'
  ' Policy 句側の二段ガードは 0027 以降で段階適用。';
