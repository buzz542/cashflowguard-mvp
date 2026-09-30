-- 0007_project_tracking: manual items, done status, overdue reminders. Run via scripts/test-db.sh.
\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'ASSERTION FAILED: %', msg; end if;
end $$;

insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000f8', 'pat@example.com', '{}', now()),
  ('00000000-0000-0000-0000-0000000000f9', 'other@example.com', '{}', now());
select id as ws from public.workspaces where owner_id = '00000000-0000-0000-0000-0000000000f8' \gset
insert into public.jobs (id, workspace_id, created_by, name)
values ('20000000-0000-0000-0000-0000000000f8', :'ws', '00000000-0000-0000-0000-0000000000f8', 'Riverside');

-- A manual item needs no contract check, but must belong to a project.
insert into public.obligations (id, workspace_id, review_id, job_id, source, kind, title, source_quote, trigger, fixed_date,
  day_basis, status, due_date, due_basis, extraction_version) values
  ('30000000-0000-0000-0000-0000000000f1', :'ws', null, '20000000-0000-0000-0000-0000000000f8', 'manual', 'payment_due',
   'Payment from Northgate', '', 'fixed_date', '2026-10-20', 'calendar', 'confirmed', '2026-10-20', 'fixed', 'manual'),
  ('30000000-0000-0000-0000-0000000000f2', :'ws', null, '20000000-0000-0000-0000-0000000000f8', 'manual', 'retention_release',
   'Retention', '', 'fixed_date', '2026-10-20', 'calendar', 'done', '2026-10-20', 'fixed', 'manual');
do $$ begin
  begin
    insert into public.obligations (workspace_id, review_id, job_id, kind, title, source_quote, trigger, fixed_date, extraction_version)
    select id, null, null, 'other', 't', '', 'fixed_date', '2026-10-01', 'manual' from public.workspaces where owner_id = '00000000-0000-0000-0000-0000000000f8';
    raise exception 'LEAK: item with neither contract nor project accepted';
  exception when check_violation then null; end;
  begin
    update public.obligations set status = 'bogus' where id = '30000000-0000-0000-0000-0000000000f1';
    raise exception 'LEAK: unknown status accepted';
  exception when check_violation then null; end;
  begin
    insert into public.reminders (obligation_id, user_id, send_on, kind)
    values ('30000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f8', '2026-10-01', 'weekly');
    raise exception 'LEAK: unknown reminder kind accepted';
  exception when check_violation then null; end;
end $$;

insert into public.reminders (id, obligation_id, user_id, send_on, kind) values
  ('40000000-0000-0000-0000-0000000000f1', '30000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f8', '2026-10-13', 'lead7'),
  ('40000000-0000-0000-0000-0000000000f2', '30000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f8', '2026-10-21', 'overdue'),
  ('40000000-0000-0000-0000-0000000000f3', '30000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000f8', '2026-10-21', 'overdue');

-- RLS: someone else sees none of it.
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f9', false);
select pg_temp.assert((select count(*) from public.obligations where workspace_id = :'ws') = 0, 'other user sees no items');
select pg_temp.assert((select count(*) from public.jobs where workspace_id = :'ws') = 0, 'other user sees no projects');
reset role;

-- 13 Oct: the 7-day heads-up is claimed.
create temp table c1 as select * from public.claim_due_reminders('2026-10-13', 100);
select pg_temp.assert((select count(*) from c1 where reminder_id = '40000000-0000-0000-0000-0000000000f1') = 1, 'lead7 claimed');
update public.reminders set status = 'sent' where id in (select reminder_id from c1);

-- 21 Oct, the day after: the overdue notice is claimed even though the date has passed;
-- the done item's overdue notice is skipped.
create temp table c2 as select * from public.claim_due_reminders('2026-10-21', 100);
select pg_temp.assert((select count(*) from c2 where reminder_id = '40000000-0000-0000-0000-0000000000f2' and reminder_kind = 'overdue') = 1, 'overdue claimed after the due date');
select pg_temp.assert((select count(*) from c2 where reminder_id = '40000000-0000-0000-0000-0000000000f3') = 0, 'done item not claimed');
select pg_temp.assert((select status from public.reminders where id = '40000000-0000-0000-0000-0000000000f3') = 'skipped', 'done item reminder skipped');
update public.reminders set status = 'sent' where id in (select reminder_id from c2);

-- Re-running the same day claims nothing more (idempotent).
select pg_temp.assert((select count(*) from public.claim_due_reminders('2026-10-21', 100)) = 0, 'no duplicates on re-run');

-- A late (non-overdue) heads-up for a past date is still skipped, as before.
insert into public.reminders (id, obligation_id, user_id, send_on, kind) values
  ('40000000-0000-0000-0000-0000000000f4', '30000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f8', '2026-10-18', 'lead2');
select pg_temp.assert((select count(*) from public.claim_due_reminders('2026-10-22', 100)) = 0, 'stale heads-up not sent');
select pg_temp.assert((select status from public.reminders where id = '40000000-0000-0000-0000-0000000000f4') = 'skipped', 'stale heads-up skipped');

delete from auth.users where id in ('00000000-0000-0000-0000-0000000000f8', '00000000-0000-0000-0000-0000000000f9');
\o
\echo '0008 project tracking tests passed'
