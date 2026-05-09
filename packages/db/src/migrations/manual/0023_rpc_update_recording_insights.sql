-- ============================================================================
-- 0023_rpc_update_recording_insights.sql
-- update_recording_insights RPC (S-M-02)
--
-- 担当営業 / manager / admin / legal がインライン編集する経路。
-- recordings テーブルは authenticated に対して INSERT/UPDATE/DELETE が REVOKE
-- されているため、RPC (SECURITY DEFINER) を通して限定的に UPDATE を許可する。
--
-- 権限ロジック:
--   - auth.uid() == recording → meeting.owner_user_id            (担当営業本人)
--   - or current_user_role() in ('manager','admin','legal')      (上位ロール)
--   - 上記いずれにも合致しなければ RAISE EXCEPTION (insufficient_privilege)
--
-- 引数は jsonb 互換にしておき、null を渡された場合は当該列を更新しない
-- (COALESCE で温存)。
-- ============================================================================

create or replace function public.update_recording_insights(
  rec_id uuid,
  new_summary text default null,
  new_key_points jsonb default null,
  new_customer_needs jsonb default null,
  new_objections jsonb default null,
  new_next_actions jsonb default null,
  new_commitments jsonb default null
)
returns public.recordings
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_owner uuid;
  v_role text;
  v_row public.recordings;
begin
  if v_actor is null then
    raise exception 'unauthenticated' using errcode = 'insufficient_privilege';
  end if;

  select m.owner_user_id into v_owner
  from public.recordings r
  join public.meetings m on m.id = r.meeting_id
  where r.id = rec_id;

  if v_owner is null then
    raise exception 'recording not found: %', rec_id using errcode = 'no_data_found';
  end if;

  v_role := public.current_user_role();
  if v_owner <> v_actor and v_role not in ('manager','admin','legal') then
    raise exception 'forbidden (actor=% owner=% role=%)', v_actor, v_owner, v_role
      using errcode = 'insufficient_privilege';
  end if;

  update public.recordings
  set
    summary        = coalesce(new_summary,        summary),
    key_points     = coalesce(new_key_points,     key_points),
    customer_needs = coalesce(new_customer_needs, customer_needs),
    objections     = coalesce(new_objections,     objections),
    next_actions   = coalesce(new_next_actions,   next_actions),
    commitments    = coalesce(new_commitments,    commitments)
  where id = rec_id
  returning * into v_row;

  -- 監査証跡: audit_logs に行を追記 (hash chain trigger が prev_hash を補完)
  insert into public.audit_logs (
    org_id, actor_user_id, action, resource_type, resource_id, payload
  ) values (
    coalesce(v_row.org_id, '00000000-0000-0000-0000-000000000001'::uuid),
    v_actor,
    'update',
    'recording',
    rec_id,
    jsonb_build_object(
      'summary',         (new_summary        is not null),
      'key_points',      (new_key_points     is not null),
      'customer_needs',  (new_customer_needs is not null),
      'objections',      (new_objections     is not null),
      'next_actions',    (new_next_actions   is not null),
      'commitments',     (new_commitments    is not null)
    )
  );

  -- row_hash は trigger 経由で計算済 (audit_logs_compute_hash)
  return v_row;
end;
$$;

revoke all on function public.update_recording_insights(
  uuid, text, jsonb, jsonb, jsonb, jsonb, jsonb
) from public;
grant execute on function public.update_recording_insights(
  uuid, text, jsonb, jsonb, jsonb, jsonb, jsonb
) to authenticated;

comment on function public.update_recording_insights(
  uuid, text, jsonb, jsonb, jsonb, jsonb, jsonb
) is
  'S-M-02: 担当営業 (owner) / manager / admin / legal による recording.insights 列の'
  ' インライン編集 RPC。SECURITY DEFINER + audit_logs 自動追記。';
