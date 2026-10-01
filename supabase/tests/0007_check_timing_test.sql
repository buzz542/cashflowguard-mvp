-- 0006_check_timing: reviews.duration_ms. Run via scripts/test-db.sh.
\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'ASSERTION FAILED: %', msg; end if;
end $$;

insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000f7', 'timing@example.com', '{"terms_version":"t1"}', now());
select id as ws from public.workspaces where owner_id = '00000000-0000-0000-0000-0000000000f7' \gset

insert into public.reviews (workspace_id, author_id, result_md, model, prompt_version, duration_ms)
  values (:'ws', '00000000-0000-0000-0000-0000000000f7', 'x', 'claude-sonnet-5-5', 'p', 8123);
select pg_temp.assert((select duration_ms from public.reviews where workspace_id = :'ws') = 8123, 'duration stored');
insert into public.reviews (workspace_id, author_id, result_md, model, prompt_version)
  values (:'ws', '00000000-0000-0000-0000-0000000000f7', 'old', 'claude-sonnet-4-5', 'p');
select pg_temp.assert((select count(*) from public.reviews where workspace_id = :'ws' and duration_ms is null) = 1, 'nullable for old rows');
do $$ begin
  begin
    insert into public.reviews (workspace_id, author_id, result_md, model, prompt_version, duration_ms)
      select id, owner_id, 'x', 'm', 'p', -1 from public.workspaces where owner_id = '00000000-0000-0000-0000-0000000000f7';
    raise exception 'negative duration accepted';
  exception when check_violation then null;
  end;
end $$;

delete from auth.users where id = '00000000-0000-0000-0000-0000000000f7';
\o
\echo '0007 check timing tests passed'
