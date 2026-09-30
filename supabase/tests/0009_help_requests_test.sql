-- 0008_help_requests. Run via scripts/test-db.sh.
\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'ASSERTION FAILED: %', msg; end if;
end $$;

insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000a9', 'owed@example.com', '{}', now()),
  ('00000000-0000-0000-0000-0000000000b9', 'nosy@example.com', '{}', now());

insert into public.help_requests (user_id, amount_pence, debtor, days_overdue, pay_less_notice, contact_name, contact_email, consent, consent_text)
values ('00000000-0000-0000-0000-0000000000a9', 1440000, 'Northgate Build Ltd', 21, 'no', 'Sam', 'owed@example.com', true, 'I agree');

do $$ begin
  begin
    insert into public.help_requests (user_id, amount_pence, debtor, days_overdue, pay_less_notice, contact_name, contact_email, consent, consent_text)
    values ('00000000-0000-0000-0000-0000000000a9', 100, 'X', 1, 'no', 'Sam', 'owed@example.com', false, 'x');
    raise exception 'LEAK: request saved without consent';
  exception when check_violation then null; end;
  begin
    insert into public.help_requests (user_id, amount_pence, debtor, days_overdue, pay_less_notice, contact_name, contact_email, consent, consent_text)
    values ('00000000-0000-0000-0000-0000000000a9', 0, 'X', 1, 'no', 'Sam', 'owed@example.com', true, 'x');
    raise exception 'LEAK: zero amount accepted';
  exception when check_violation then null; end;
end $$;

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a9', false);
select pg_temp.assert((select count(*) from public.help_requests) = 1, 'owner sees own request');
do $$ begin
  begin
    insert into public.help_requests (user_id, amount_pence, debtor, days_overdue, pay_less_notice, contact_name, contact_email, consent, consent_text)
    values ('00000000-0000-0000-0000-0000000000a9', 100, 'X', 1, 'no', 'Sam', 'o@example.com', true, 'x');
    raise exception 'LEAK: direct insert by user allowed';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b9', false);
select pg_temp.assert((select count(*) from public.help_requests) = 0, 'others see nothing');
reset role;
set role anon;
do $$ begin
  begin perform count(*) from public.help_requests; raise exception 'LEAK: anon can read help requests';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Deleting the account deletes their requests.
delete from auth.users where id = '00000000-0000-0000-0000-0000000000a9';
select pg_temp.assert((select count(*) from public.help_requests) = 0, 'cascade on account deletion');
delete from auth.users where id = '00000000-0000-0000-0000-0000000000b9';
\o
\echo '0009 help request tests passed'
