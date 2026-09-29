-- Deleting an account (auth user) removes everything it owns and nothing it doesn't.
\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'ASSERTION FAILED: %', msg; end if;
end $$;

insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000c5', 'leaver@firm.co.uk', '{}', now()),
  ('00000000-0000-0000-0000-0000000000d5', 'stayer@firm.co.uk', '{}', now());
select id as ws_leaver from public.workspaces where owner_id = '00000000-0000-0000-0000-0000000000c5' and personal \gset

-- A team owned by the stayer, which the leaver belongs to and wrote a review in.
insert into public.workspaces (id, name, owner_id, personal) values ('70000000-0000-0000-0000-0000000000d5', 'Stayer Ltd', '00000000-0000-0000-0000-0000000000d5', false);
insert into public.workspace_members (workspace_id, user_id, role) values
  ('70000000-0000-0000-0000-0000000000d5', '00000000-0000-0000-0000-0000000000d5', 'owner'),
  ('70000000-0000-0000-0000-0000000000d5', '00000000-0000-0000-0000-0000000000c5', 'member');
insert into public.reviews (id, workspace_id, author_id, result_md, model, prompt_version) values
  ('80000000-0000-0000-0000-0000000000c5', :'ws_leaver', '00000000-0000-0000-0000-0000000000c5', 'mine', 'm', 'v'),
  ('80000000-0000-0000-0000-0000000000d5', '70000000-0000-0000-0000-0000000000d5', '00000000-0000-0000-0000-0000000000c5', 'team work', 'm', 'v');
insert into public.jobs (id, workspace_id, created_by, name) values
  ('90000000-0000-0000-0000-0000000000d5', '70000000-0000-0000-0000-0000000000d5', '00000000-0000-0000-0000-0000000000c5', 'Team job');
insert into public.obligations (id, workspace_id, review_id, job_id, kind, title, source_quote, trigger, fixed_date, status, due_date, due_basis, extraction_version, assignee_id) values
  ('a0000000-0000-0000-0000-0000000000d5', '70000000-0000-0000-0000-0000000000d5', '80000000-0000-0000-0000-0000000000d5', '90000000-0000-0000-0000-0000000000d5', 'other', 'T', 'q', 'fixed_date', '2026-12-01', 'confirmed', '2026-12-01', 'fixed', 'x', '00000000-0000-0000-0000-0000000000c5');
insert into public.reminders (obligation_id, user_id, send_on, kind) values ('a0000000-0000-0000-0000-0000000000d5', '00000000-0000-0000-0000-0000000000c5', '2026-11-27', 'lead');
insert into public.free_allowance (canonical_email, used) values ('leaver@firm.co.uk', 1);

delete from auth.users where id = '00000000-0000-0000-0000-0000000000c5';

select pg_temp.assert((select count(*) from public.profiles where id = '00000000-0000-0000-0000-0000000000c5') = 0, 'profile gone');
select pg_temp.assert((select count(*) from public.workspaces where id = :'ws_leaver') = 0, 'personal workspace gone');
select pg_temp.assert((select count(*) from public.reviews where id = '80000000-0000-0000-0000-0000000000c5') = 0, 'personal review gone');
select pg_temp.assert((select count(*) from public.workspace_members where user_id = '00000000-0000-0000-0000-0000000000c5') = 0, 'memberships gone');
select pg_temp.assert((select count(*) from public.reminders where user_id = '00000000-0000-0000-0000-0000000000c5') = 0, 'their reminders gone');
-- The team keeps its work; links to the leaver are cleared.
select pg_temp.assert((select author_id is null from public.reviews where id = '80000000-0000-0000-0000-0000000000d5'), 'team review kept, author cleared');
select pg_temp.assert((select created_by is null from public.jobs where id = '90000000-0000-0000-0000-0000000000d5'), 'team job kept, creator cleared');
select pg_temp.assert((select assignee_id is null from public.obligations where id = 'a0000000-0000-0000-0000-0000000000d5'), 'team deadline kept, unassigned');
select pg_temp.assert((select count(*) from public.workspaces where id = '70000000-0000-0000-0000-0000000000d5') = 1, 'team kept');
-- The free-tier ledger survives (by design: re-registering doesn't reset the free check).
select pg_temp.assert((select used from public.free_allowance where canonical_email = 'leaver@firm.co.uk') = 1, 'free ledger kept');

\o
\echo '0005 account deletion tests passed'
