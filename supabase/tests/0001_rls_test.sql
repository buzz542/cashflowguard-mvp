-- RLS + free-tier tests for 0001. Run via scripts/test-db.sh (plain Postgres + auth shim).
\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'ASSERTION FAILED: %', msg; end if;
end $$;

-- Two users. A accepted terms at signup; B did not.
insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values
  ('00000000-0000-0000-0000-00000000000a', 'Alice@Example.com', '{"terms_version":"t1","name":"Alice"}', now()),
  ('00000000-0000-0000-0000-00000000000b', 'bob@example.com', '{}', now());

-- Signup trigger created profile + personal workspace + owner membership.
select pg_temp.assert((select count(*) from public.profiles) = 2, 'two profiles');
select pg_temp.assert((select email from public.profiles where id = '00000000-0000-0000-0000-00000000000a') = 'alice@example.com', 'email lowercased');
select pg_temp.assert((select terms_version from public.profiles where id = '00000000-0000-0000-0000-00000000000a') = 't1', 'terms copied');
select pg_temp.assert((select terms_accepted_at from public.profiles where id = '00000000-0000-0000-0000-00000000000b') is null, 'no terms for B');
-- An empty terms_version (e.g. form sent before it knew the version) is not an acceptance.
insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-0000-0000-00000000000c', 'c@example.com', '{"terms_version":"  "}');
select pg_temp.assert((select terms_version is null and terms_accepted_at is null from public.profiles where id = '00000000-0000-0000-0000-00000000000c'), 'blank terms is not acceptance');
delete from auth.users where id = '00000000-0000-0000-0000-00000000000c';
select pg_temp.assert((select count(*) from public.workspaces where personal) = 2, 'two personal workspaces');
select pg_temp.assert((select count(*) from public.workspace_members where role = 'owner') = 2, 'two owners');

select id as ws_a from public.workspaces where owner_id = '00000000-0000-0000-0000-00000000000a' \gset
select id as ws_b from public.workspaces where owner_id = '00000000-0000-0000-0000-00000000000b' \gset

insert into public.reviews (workspace_id, author_id, result_md, model, prompt_version)
values (:'ws_a', '00000000-0000-0000-0000-00000000000a', 'A review', 'm', 'v'),
       (:'ws_b', '00000000-0000-0000-0000-00000000000b', 'B review', 'm', 'v');

-- ---- As Alice ----
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);

select pg_temp.assert((select count(*) from public.profiles) = 1, 'A sees only own profile');
select pg_temp.assert((select count(*) from public.workspaces) = 1, 'A sees only own workspace');
select pg_temp.assert((select count(*) from public.workspace_members) = 1, 'A sees only own memberships');
select pg_temp.assert((select count(*) from public.reviews) = 1, 'A sees only own reviews');
select pg_temp.assert((select result_md from public.reviews) = 'A review', 'A sees A review');

-- Writes must all be refused, including giving yourself Pro.
do $$ begin
  begin update public.workspaces set comp_pro = true; raise exception 'LEAK: update workspaces allowed';
  exception when insufficient_privilege then null; end;
  begin insert into public.reviews (workspace_id, result_md, model, prompt_version)
        select id, 'x', 'm', 'v' from public.workspaces limit 1;
        raise exception 'LEAK: insert reviews allowed';
  exception when insufficient_privilege then null; end;
  begin delete from public.reviews; raise exception 'LEAK: delete reviews allowed';
  exception when insufficient_privilege then null; end;
  begin insert into public.subscriptions (workspace_id, status) select id, 'active' from public.workspaces limit 1;
        raise exception 'LEAK: insert subscriptions allowed';
  exception when insufficient_privilege then null; end;
  begin update public.profiles set terms_version = 'forged'; raise exception 'LEAK: update profiles allowed';
  exception when insufficient_privilege then null; end;
  begin perform count(*) from public.free_allowance; raise exception 'LEAK: read free_allowance allowed';
  exception when insufficient_privilege then null; end;
  begin perform * from public.claim_free_review('a', 'b', 99, 99, 99); raise exception 'LEAK: claim_free_review callable';
  exception when insufficient_privilege then null; end;
end $$;

-- ---- As Bob ----
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
select pg_temp.assert((select count(*) from public.reviews) = 1, 'B sees only own reviews');
select pg_temp.assert((select result_md from public.reviews) = 'B review', 'B sees B review');
select pg_temp.assert((select count(*) from public.workspaces where id = :'ws_a') = 0, 'B cannot see A workspace');

-- ---- Anonymous ----
reset role;
set role anon;
select set_config('request.jwt.claim.sub', '', false);
do $$ begin
  begin perform count(*) from public.reviews; raise exception 'LEAK: anon can read reviews';
  exception when insufficient_privilege then null; end;
end $$;

-- ---- Free-tier ledger (service role) ----
reset role;
set role service_role;

-- user limit 1, ip limit 2/day, global 3/day
select pg_temp.assert((select status from public.claim_free_review('alice@example.com', 'ip1', 1, 2, 3)) = 'ok', 'first free ok');
select pg_temp.assert((select status from public.claim_free_review('alice@example.com', 'ip9', 1, 2, 3)) = 'user_limit', 'second free for same canonical email refused');
select pg_temp.assert((select status from public.claim_free_review('carol@example.com', 'ip1', 1, 2, 3)) = 'ok', 'other email same ip ok');
select pg_temp.assert((select status from public.claim_free_review('dave@example.com', 'ip1', 1, 2, 3)) = 'ip_limit', 'third from same ip refused');
select pg_temp.assert((select status from public.claim_free_review('erin@example.com', 'ip2', 1, 2, 3)) = 'ok', 'third globally ok');
select pg_temp.assert((select status from public.claim_free_review('fred@example.com', 'ip3', 1, 2, 3)) = 'global_limit', 'global cap enforced');

-- Refund gives the check back and frees the ip/global slot.
select event_id as ev from public.claim_free_review('zed@example.com', 'ip7', 1, 5, 99) \gset
select pg_temp.assert((select used from public.free_allowance where canonical_email = 'zed@example.com') = 1, 'zed used 1');
select public.refund_free_review(:'ev');
select pg_temp.assert((select used from public.free_allowance where canonical_email = 'zed@example.com') = 0, 'refund restores allowance');
select pg_temp.assert((select count(*) from public.free_review_events where ip_hash = 'ip7') = 0, 'refund removes event');
select pg_temp.assert((select status from public.claim_free_review('zed@example.com', 'ip7', 1, 5, 99)) = 'ok', 'can claim again after refund');

-- Deleting a user cascades their personal workspace and reviews.
reset role;
delete from auth.users where id = '00000000-0000-0000-0000-00000000000b';
select pg_temp.assert((select count(*) from public.reviews where workspace_id = :'ws_b') = 0, 'cascade deletes B reviews');
select pg_temp.assert((select count(*) from public.workspaces where id = :'ws_b') = 0, 'cascade deletes B workspace');

\echo '0001 RLS tests passed'
