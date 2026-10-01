-- OCR cap + preview removal tests for 0004.
\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'ASSERTION FAILED: %', msg; end if;
end $$;

insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000a4', 'ocr1@example.com', now()),
  ('00000000-0000-0000-0000-0000000000b4', 'ocr2@example.com', now());

-- Users can't touch the counter or the claim function.
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a4', false);
do $$ begin
  begin perform count(*) from public.ocr_usage; raise exception 'LEAK: user can read ocr_usage';
  exception when insufficient_privilege then null; end;
  begin perform public.claim_ocr_page('00000000-0000-0000-0000-0000000000a4', '2026-09-30', 99, 99); raise exception 'LEAK: user can claim';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

set role service_role;
-- per-user cap 2/day, global cap 3/day
select pg_temp.assert(public.claim_ocr_page('00000000-0000-0000-0000-0000000000a4', '2026-09-30', 2, 3) = 'ok', 'page 1');
select pg_temp.assert(public.claim_ocr_page('00000000-0000-0000-0000-0000000000a4', '2026-09-30', 2, 3) = 'ok', 'page 2');
select pg_temp.assert(public.claim_ocr_page('00000000-0000-0000-0000-0000000000a4', '2026-09-30', 2, 3) = 'user_limit', 'user cap');
select pg_temp.assert(public.claim_ocr_page('00000000-0000-0000-0000-0000000000b4', '2026-09-30', 2, 3) = 'ok', 'other user ok');
select pg_temp.assert(public.claim_ocr_page('00000000-0000-0000-0000-0000000000b4', '2026-09-30', 2, 3) = 'global_limit', 'global cap');
select pg_temp.assert(public.claim_ocr_page('00000000-0000-0000-0000-0000000000a4', '2026-10-01', 2, 3) = 'ok', 'new day resets');
select public.refund_ocr_page('00000000-0000-0000-0000-0000000000a4', '2026-09-30');
select pg_temp.assert(public.claim_ocr_page('00000000-0000-0000-0000-0000000000a4', '2026-09-30', 2, 99) = 'ok', 'refund frees a page');
reset role;

select pg_temp.assert(
  (select count(*) from information_schema.columns where table_name = 'reviews' and column_name = 'contract_preview') = 0,
  'contract preview column is gone');

\o
\echo '0004 OCR cap tests passed'
