-- 1. Photo OCR is a paid AI call per page. Cap it for non-Pro users, per day, durably.
-- 2. Data minimisation: stop keeping the first 120 characters of each contract (usually
--    the parties' names and addresses). Dropping the column deletes what's already stored.

create table public.ocr_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  pages integer not null default 0 check (pages >= 0),
  primary key (user_id, day)
);
create index ocr_usage_day_idx on public.ocr_usage (day);

alter table public.ocr_usage enable row level security;
revoke all on public.ocr_usage from anon, authenticated;
grant select, insert, update, delete on public.ocr_usage to service_role;

-- Returns 'ok' | 'user_limit' | 'global_limit'. Serialised like claim_free_review.
create or replace function public.claim_ocr_page(
  p_user_id uuid,
  p_day date,
  p_user_daily_limit integer,
  p_global_daily_limit integer
)
returns text
language plpgsql security definer
set search_path = public
as $$
declare
  v_mine integer;
  v_all integer;
begin
  perform pg_advisory_xact_lock(hashtext('gc_ocr_claim'));
  delete from public.ocr_usage where day < p_day - 7;

  select coalesce((select pages from public.ocr_usage where user_id = p_user_id and day = p_day), 0) into v_mine;
  if v_mine >= p_user_daily_limit then return 'user_limit'; end if;

  select coalesce(sum(pages), 0) into v_all from public.ocr_usage where day = p_day;
  if v_all >= p_global_daily_limit then return 'global_limit'; end if;

  insert into public.ocr_usage as u (user_id, day, pages) values (p_user_id, p_day, 1)
  on conflict (user_id, day) do update set pages = u.pages + 1;
  return 'ok';
end;
$$;

-- Give a page back when reading it failed.
create or replace function public.refund_ocr_page(p_user_id uuid, p_day date)
returns void
language sql security definer
set search_path = public
as $$
  update public.ocr_usage set pages = greatest(pages - 1, 0) where user_id = p_user_id and day = p_day;
$$;

revoke all on function public.claim_ocr_page(uuid, date, integer, integer) from public, anon, authenticated;
revoke all on function public.refund_ocr_page(uuid, date) from public, anon, authenticated;
grant execute on function public.claim_ocr_page(uuid, date, integer, integer) to service_role;
grant execute on function public.refund_ocr_page(uuid, date) to service_role;

alter table public.reviews drop column contract_preview;
