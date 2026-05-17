-- ============================================================================
-- 0039_round3_storage_select_strict.sql
--
-- Round 2 Security CRITICAL-S-02 (PARTIAL) の完全 fix:
--   0038 で business_cards_select に追加した `or public.current_org_id() is null`
--   fallback が「Phase1 GUC 未 SET 環境では全認証済 user が他人の名刺画像を SELECT
--   可能」になっていた。owner = auth.uid() / path 先頭 = auth.uid() の 2 経路だけで
--   Phase1 単一テナントは充分に動くため、wide-open fallback を撤去する。
-- ============================================================================

drop policy if exists business_cards_select on storage.objects;
create policy business_cards_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'business-cards'
    and (
      -- 自分が owner ならOK (storage.objects.owner は INSERT 時 auth.uid() で fix される)
      owner = auth.uid()
      -- もしくは path 先頭が自分の user_id (signed download URL 経由でも安全に絞れる)
      or public.storage_object_user_id(name) = auth.uid()
      -- Phase2 multi-tenant cutover で org_id GUC を SET LOCAL する運用に入った後は
      -- 下記 2 行で同 org メンバーにも見せる。GUC 未 SET で current_org_id() が NULL を
      -- 返す経路は除外 (= wide-open fallback 撤去)。
      or (
        public.current_org_id() is not null
        and public.storage_object_org_id(name) = public.current_org_id()
      )
    )
  );
