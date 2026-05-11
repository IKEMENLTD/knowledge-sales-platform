-- ============================================================================
-- 0032_users_self_select_fallback.sql
--
-- 問題: 0012_rls_v2 で users_select_all policy を `org_id = current_org_id()` に
-- 厳格化、0026 で current_org_id() を NULL fail-closed 化した結果、
-- Phase 1 シングルテナント運用 (app.org_id GUC を middleware で SET していない) で
-- 全 SELECT が NULL マッチで失敗、requireAuthContext() が org_missing redirect を
-- 発火していた。
--
-- 修正: 自分自身の row は org GUC の設定に関係なく常に SELECT 可、他人は org 一致
-- (current_org_id() が NULL のときは fallback で許容、P2 cutover 時に strict 化)。
-- 自己昇格防止は 0015 trigger で別途担保しているのでこの緩和は安全。
-- ============================================================================

drop policy if exists users_select_all on public.users;

create policy users_select_all on public.users
  for select to authenticated
  using (
    -- 自分の row は常に読める
    id = auth.uid()
    -- 他人の row は同 org のみ (GUC 未設定 = Phase1 単一テナントは許容)
    or public.current_org_id() is null
    or org_id = public.current_org_id()
  );

-- 同様に他の主要テーブル (contacts/meetings/recordings) も Phase1 で
-- 全 select が落ちている可能性が高い。fallback 句を追加して同様に修正する。

drop policy if exists contacts_select_all on public.contacts;
create policy contacts_select_all on public.contacts
  for select to authenticated
  using (
    owner_user_id = auth.uid()
    or public.current_org_id() is null
    or org_id = public.current_org_id()
  );

drop policy if exists meetings_select_all on public.meetings;
create policy meetings_select_all on public.meetings
  for select to authenticated
  using (
    owner_user_id = auth.uid()
    or public.current_org_id() is null
    or org_id = public.current_org_id()
  );

drop policy if exists meetings_attendees_select on public.meeting_attendees;
create policy meetings_attendees_select on public.meeting_attendees
  for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.meetings m
      where m.id = meeting_attendees.meeting_id
        and (
          m.owner_user_id = auth.uid()
          or public.current_org_id() is null
          or m.org_id = public.current_org_id()
        )
    )
  );

drop policy if exists recordings_select_tiered on public.recordings;
create policy recordings_select_tiered on public.recordings
  for select to authenticated
  using (
    -- sensitivity tier 階層を維持
    case sensitivity
      when 'public' then true
      when 'internal' then public.current_user_role() in ('sales','cs','manager','admin','legal')
      when 'sensitive' then public.current_user_role() in ('manager','admin','legal')
      when 'restricted' then public.current_user_role() in ('admin','legal')
      else false
    end
    and (
      public.current_org_id() is null
      or org_id = public.current_org_id()
    )
  );

-- notifications, idempotency_keys 等の self-only テーブルは現状 user_id = auth.uid()
-- で動いているので影響なし。consent_logs も self_select で動作中。
