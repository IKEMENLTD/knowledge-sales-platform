-- ============================================================================
-- 0019_fk_on_delete_policies.sql
-- 主要 FK の on delete を明示的に restrict 化 (A2-M-01)
--
-- 0011_recordings_sensitivity.sql ではコメントブロックで「no action」「restrict」
-- と書き分けていたが、実 SQL DDL は 0001 由来の references のみで no action
-- 相当のまま。退職 user / archived contact 削除時に黙って FK error になるため、
-- 明示的に restrict 化して「アプリ層で archive を強制する」運用契約を SQL に
-- 落とし込む。
--
-- 対象 FK:
--   meetings.contact_id            -> contacts.id            on delete restrict
--   meetings.owner_user_id         -> users.id               on delete restrict
--   contacts.owner_user_id         -> users.id               on delete restrict
--   contacts.company_id            -> companies.id           on delete restrict
--   contact_duplicates.resolved_by -> users.id               on delete restrict
--   meeting_attendees.user_id      -> users.id               on delete restrict
--   meeting_attendees.contact_id   -> contacts.id            on delete restrict
--   audit_logs.actor_user_id       -> users.id               on delete restrict
--
-- 既存制約名は pg_constraint から column 名で逆引き → drop → 再作成。冪等。
-- ============================================================================

create or replace function pg_temp.fix_fk_restrict(
  p_table text,
  p_col text,
  p_ref_table text,
  p_ref_col text
)
returns void
language plpgsql
as $fn$
declare
  v_conname text;
  v_attnum smallint;
  v_relid oid;
  v_new_name text;
begin
  v_relid := format('public.%I', p_table)::regclass;

  -- 対象列の attnum を取得
  select attnum into v_attnum
  from pg_attribute
  where attrelid = v_relid and attname = p_col and not attisdropped;
  if v_attnum is null then
    raise notice '0019 skip: column %.% not found', p_table, p_col;
    return;
  end if;

  -- conkey に対象列だけが含まれている FK を取得 (single-column FK 限定)
  select conname into v_conname
  from pg_constraint
  where conrelid = v_relid
    and contype = 'f'
    and conkey = array[v_attnum]
  limit 1;

  if v_conname is not null then
    execute format('alter table public.%I drop constraint if exists %I', p_table, v_conname);
  end if;

  v_new_name := format('%s_%s_fkey', p_table, p_col);
  execute format('alter table public.%I drop constraint if exists %I', p_table, v_new_name);
  execute format(
    'alter table public.%I add constraint %I foreign key (%I) references public.%I(%I) on delete restrict',
    p_table, v_new_name, p_col, p_ref_table, p_ref_col
  );
exception when others then
  raise notice '0019 fix_fk_restrict %.% -> %.% skipped: % (%)',
    p_table, p_col, p_ref_table, p_ref_col, sqlerrm, sqlstate;
end;
$fn$;

do $$
begin
  perform pg_temp.fix_fk_restrict('meetings',           'contact_id',     'contacts',  'id');
  perform pg_temp.fix_fk_restrict('meetings',           'owner_user_id',  'users',     'id');
  perform pg_temp.fix_fk_restrict('contacts',           'owner_user_id',  'users',     'id');
  perform pg_temp.fix_fk_restrict('contacts',           'company_id',     'companies', 'id');
  perform pg_temp.fix_fk_restrict('contact_duplicates', 'resolved_by',    'users',     'id');
  perform pg_temp.fix_fk_restrict('meeting_attendees',  'user_id',        'users',     'id');
  perform pg_temp.fix_fk_restrict('meeting_attendees',  'contact_id',     'contacts',  'id');
  perform pg_temp.fix_fk_restrict('audit_logs',         'actor_user_id',  'users',     'id');
end$$;
