-- RLS + reminder-claim tests for 0002.
\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'ASSERTION FAILED: %', msg; end if;
end $$;

insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000d1', 'dee@example.com', '{}', now()),
  ('00000000-0000-0000-0000-0000000000e1', 'eve@example.com', '{}', now());
select id as ws_d from public.workspaces where owner_id = '00000000-0000-0000-0000-0000000000d1' \gset
select id as ws_e from public.workspaces where owner_id = '00000000-0000-0000-0000-0000000000e1' \gset

insert into public.reviews (id, workspace_id, author_id, result_md, model, prompt_version)
values ('10000000-0000-0000-0000-0000000000d1', :'ws_d', '00000000-0000-0000-0000-0000000000d1', 'r', 'm', 'v'),
       ('10000000-0000-0000-0000-0000000000e1', :'ws_e', '00000000-0000-0000-0000-0000000000e1', 'r', 'm', 'v');
insert into public.jobs (id, workspace_id, created_by, name)
values ('20000000-0000-0000-0000-0000000000d1', :'ws_d', '00000000-0000-0000-0000-0000000000d1', 'Dee job'),
       ('20000000-0000-0000-0000-0000000000e1', :'ws_e', '00000000-0000-0000-0000-0000000000e1', 'Eve job');

-- Shape constraints.
do $$ begin
  begin
    insert into public.obligations (workspace_id, review_id, kind, title, source_quote, trigger, extraction_version)
    select workspace_id, id, 'other', 't', 'q', 'event', 'x' from public.reviews where id = '10000000-0000-0000-0000-0000000000d1';
    raise exception 'LEAK: event obligation without offset accepted';
  exception when check_violation then null; end;
  begin
    insert into public.obligations (workspace_id, review_id, kind, title, source_quote, trigger, fixed_date, status, extraction_version)
    select workspace_id, id, 'other', 't', 'q', 'fixed_date', '2026-10-01', 'confirmed', 'x' from public.reviews where id = '10000000-0000-0000-0000-0000000000d1';
    raise exception 'LEAK: confirmed obligation without job accepted';
  exception when check_violation then null; end;
end $$;

-- Obligations: A confirmed+due today, B confirmed+past, C suggested, D confirmed+future, E (Eve) confirmed due today.
insert into public.obligations (id, workspace_id, review_id, job_id, kind, title, source_quote, trigger, fixed_date, status, due_date, due_basis, extraction_version) values
  ('30000000-0000-0000-0000-00000000000a', :'ws_d', '10000000-0000-0000-0000-0000000000d1', '20000000-0000-0000-0000-0000000000d1', 'payment_application', 'A', 'q', 'fixed_date', '2026-10-09', 'confirmed', '2026-10-09', 'fixed', 'x'),
  ('30000000-0000-0000-0000-00000000000b', :'ws_d', '10000000-0000-0000-0000-0000000000d1', '20000000-0000-0000-0000-0000000000d1', 'other', 'B', 'q', 'fixed_date', '2026-10-01', 'confirmed', '2026-10-01', 'fixed', 'x'),
  ('30000000-0000-0000-0000-00000000000c', :'ws_d', '10000000-0000-0000-0000-0000000000d1', '20000000-0000-0000-0000-0000000000d1', 'other', 'C', 'q', 'fixed_date', '2026-10-09', 'suggested', '2026-10-09', 'fixed', 'x'),
  ('30000000-0000-0000-0000-00000000000d', :'ws_d', '10000000-0000-0000-0000-0000000000d1', '20000000-0000-0000-0000-0000000000d1', 'other', 'D', 'q', 'fixed_date', '2026-12-01', 'confirmed', '2026-12-01', 'fixed', 'x'),
  ('30000000-0000-0000-0000-00000000000e', :'ws_e', '10000000-0000-0000-0000-0000000000e1', '20000000-0000-0000-0000-0000000000e1', 'other', 'E', 'q', 'fixed_date', '2026-10-09', 'confirmed', '2026-10-09', 'fixed', 'x');

insert into public.reminders (id, obligation_id, user_id, send_on, kind) values
  ('40000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000d1', '2026-10-09', 'due'),
  ('40000000-0000-0000-0000-00000000000b', '30000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000d1', '2026-09-30', 'lead'),
  ('40000000-0000-0000-0000-00000000000c', '30000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-0000000000d1', '2026-10-09', 'due'),
  ('40000000-0000-0000-0000-00000000000d', '30000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-0000000000d1', '2026-11-27', 'lead'),
  ('40000000-0000-0000-0000-00000000000e', '30000000-0000-0000-0000-00000000000e', '00000000-0000-0000-0000-0000000000e1', '2026-10-09', 'due');

-- Eve has turned reminders off.
update public.profiles set reminder_emails = false where id = '00000000-0000-0000-0000-0000000000e1';

-- ---- RLS as Dee ----
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d1', false);
select pg_temp.assert((select count(*) from public.jobs) = 1, 'Dee sees own job only');
select pg_temp.assert((select count(*) from public.obligations) = 4, 'Dee sees own obligations only');
select pg_temp.assert((select count(*) from public.reminders) = 4, 'Dee sees own reminders only');
do $$ begin
  begin update public.obligations set status = 'confirmed'; raise exception 'LEAK: user can update obligations';
  exception when insufficient_privilege then null; end;
  begin update public.profiles set reminder_emails = false; raise exception 'LEAK: user can update profile';
  exception when insufficient_privilege then null; end;
  begin perform * from public.claim_due_reminders('2026-10-09', 10); raise exception 'LEAK: user can claim reminders';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- ---- Claim as service role on 9 Oct 2026 ----
set role service_role;
create temp table claimed as select * from public.claim_due_reminders('2026-10-09', 50);
select pg_temp.assert((select count(*) from claimed) = 1, 'exactly one reminder claimed');
select pg_temp.assert((select title from claimed) = 'A', 'the confirmed, due, opted-in one');
select pg_temp.assert((select email from claimed) = 'dee@example.com', 'claim returns recipient email');
select pg_temp.assert((select job_name from claimed) = 'Dee job', 'claim returns job name');
select pg_temp.assert((select status from public.reminders where id = '40000000-0000-0000-0000-00000000000a') = 'sending', 'A marked sending');
select pg_temp.assert((select status from public.reminders where id = '40000000-0000-0000-0000-00000000000b') = 'skipped', 'past-due B skipped');
select pg_temp.assert((select status from public.reminders where id = '40000000-0000-0000-0000-00000000000c') = 'skipped', 'unconfirmed C skipped');
select pg_temp.assert((select status from public.reminders where id = '40000000-0000-0000-0000-00000000000d') = 'pending', 'future D untouched');
select pg_temp.assert((select status from public.reminders where id = '40000000-0000-0000-0000-00000000000e') = 'skipped', 'opted-out E skipped');

-- A second run straight away claims nothing (no double send).
select pg_temp.assert((select count(*) from public.claim_due_reminders('2026-10-09', 50)) = 0, 'second run claims nothing');

-- A run that died mid-send is retried after 30 minutes.
update public.reminders set claimed_at = now() - interval '31 minutes' where id = '40000000-0000-0000-0000-00000000000a';
select pg_temp.assert((select count(*) from public.claim_due_reminders('2026-10-09', 50)) = 1, 'stale sending reclaimed');
select pg_temp.assert((select attempts from public.reminders where id = '40000000-0000-0000-0000-00000000000a') = 2, 'attempts counted');
update public.reminders set claimed_at = now() - interval '31 minutes', attempts = 3 where id = '40000000-0000-0000-0000-00000000000a';
select pg_temp.assert((select count(*) from public.claim_due_reminders('2026-10-09', 50)) = 0, 'gives up after 3 attempts');
select pg_temp.assert((select status from public.reminders where id = '40000000-0000-0000-0000-00000000000a') = 'failed', 'exhausted retries marked failed');

-- A failed send is not retried once the deadline has passed (no "due today" email for yesterday).
update public.reminders set status = 'sending', attempts = 1, claimed_at = now() - interval '1 day' where id = '40000000-0000-0000-0000-00000000000a';
select pg_temp.assert((select count(*) from public.claim_due_reminders('2026-10-10', 50)) = 0, 'no retry after due date');
select pg_temp.assert((select status from public.reminders where id = '40000000-0000-0000-0000-00000000000a') = 'failed', 'stale past-due send marked failed');
reset role;

-- Deleting a review removes its obligations and their reminders.
delete from public.reviews where id = '10000000-0000-0000-0000-0000000000d1';
select pg_temp.assert((select count(*) from public.obligations where workspace_id = :'ws_d') = 0, 'obligations cascade');
select pg_temp.assert((select count(*) from public.reminders where user_id = '00000000-0000-0000-0000-0000000000d1') = 0, 'reminders cascade');

\o
\echo '0002 reminder tests passed'
