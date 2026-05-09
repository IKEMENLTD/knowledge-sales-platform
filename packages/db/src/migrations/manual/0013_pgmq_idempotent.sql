-- ============================================================================
-- 0013_pgmq_idempotent.sql
-- pgmq.create() を冪等版で実行する。0000_setup.sql から移譲。
--
-- pgmq 1.4 系では create() がキュー既存時に duplicate_table を投げる。
-- do$$ exception 形にラップして再実行耐性を確保する (A-C-02 / H3-2)。
-- ============================================================================

do $$
begin
  perform pgmq.create('process_business_card');
exception
  when duplicate_table then null;
  when others then
    -- pgmq 1.5+ の create_if_not_exists が利用可能ならフォールバック
    begin
      perform pgmq.create_if_not_exists('process_business_card');
    exception when undefined_function then
      raise notice 'pgmq.create(process_business_card) failed but queue may exist: %', sqlerrm;
    end;
end$$;

do $$
begin
  perform pgmq.create('process_recording');
exception
  when duplicate_table then null;
  when others then
    begin
      perform pgmq.create_if_not_exists('process_recording');
    exception when undefined_function then
      raise notice 'pgmq.create(process_recording) failed but queue may exist: %', sqlerrm;
    end;
end$$;

do $$
begin
  perform pgmq.create('generate_embeddings');
exception
  when duplicate_table then null;
  when others then
    begin
      perform pgmq.create_if_not_exists('generate_embeddings');
    exception when undefined_function then
      raise notice 'pgmq.create(generate_embeddings) failed but queue may exist: %', sqlerrm;
    end;
end$$;
