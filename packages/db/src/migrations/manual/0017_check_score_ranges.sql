-- ============================================================================
-- 0017_check_score_ranges.sql
-- 0..1 範囲の CHECK 制約を既存テーブルに追加 (A-M-03)
--
-- 既に CHECK が存在する場合は ALTER TABLE が冪等でないため、
-- pg_constraint を見て if not exists 相当を do$$ で実装する。
-- ============================================================================

-- contacts.ocr_confidence ∈ [0,1]
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'contacts_ocr_confidence_range'
      and conrelid = 'public.contacts'::regclass
  ) then
    alter table public.contacts
      add constraint contacts_ocr_confidence_range
      check (ocr_confidence is null or (ocr_confidence >= 0 and ocr_confidence <= 1));
  end if;
end$$;

-- contact_duplicates.match_score ∈ [0,1]
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'contact_duplicates_match_score_range'
      and conrelid = 'public.contact_duplicates'::regclass
  ) then
    alter table public.contact_duplicates
      add constraint contact_duplicates_match_score_range
      check (match_score >= 0 and match_score <= 1);
  end if;
end$$;
