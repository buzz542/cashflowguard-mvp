-- GuardConstruct database setup, part 2 of 2. Paste all of this into Supabase → SQL Editor → New query → Run.
-- Generated from migrations 0001 (from the auth trigger on) to 0008, for a project where 0001's tables and the
-- is_workspace_member / handle_new_user functions were already applied via the Supabase connector.
-- Part 1 (tables + two functions) is already applied. Runs as one transaction: all or nothing.
begin;

-- ===== rest of 0001_accounts_history =====
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Free-tier claim / refund (service role only)
-- ---------------------------------------------------------------------------

-- Returns one of: 'ok', 'user_limit', 'ip_limit', 'global_limit'.
-- On 'ok' also returns the event id so a failed AI call can be refunded.
create or replace function public.claim_free_review(
  p_canonical_email text,
  p_ip_hash text,
  p_user_limit integer,
  p_ip_daily_limit integer,
  p_global_daily_limit integer
)
returns table (status text, event_id uuid, used integer)
language plpgsql security definer
set search_path = public
as $$
declare
  v_used integer;
  v_ip_count integer;
  v_global_count integer;
  v_event uuid;
begin
  -- Serialise free claims so the daily counts can't be raced. Free traffic is low volume.
  perform pg_advisory_xact_lock(hashtext('gc_free_review_claim'));

  delete from public.free_review_events where created_at < now() - interval '2 days';

  select coalesce((select fa.used from public.free_allowance fa where fa.canonical_email = p_canonical_email), 0)
    into v_used;
  if v_used >= p_user_limit then
    return query select 'user_limit'::text, null::uuid, v_used;
    return;
  end if;

  select count(*) into v_ip_count from public.free_review_events
   where ip_hash = p_ip_hash and created_at > now() - interval '24 hours';
  if v_ip_count >= p_ip_daily_limit then
    return query select 'ip_limit'::text, null::uuid, v_used;
    return;
  end if;

  select count(*) into v_global_count from public.free_review_events
   where created_at >= date_trunc('day', now());
  if v_global_count >= p_global_daily_limit then
    return query select 'global_limit'::text, null::uuid, v_used;
    return;
  end if;

  insert into public.free_allowance as fa (canonical_email, used, updated_at)
  values (p_canonical_email, 1, now())
  on conflict (canonical_email) do update set used = fa.used + 1, updated_at = now()
  returning fa.used into v_used;

  insert into public.free_review_events (canonical_email, ip_hash)
  values (p_canonical_email, p_ip_hash)
  returning id into v_event;

  return query select 'ok'::text, v_event, v_used;
end;
$$;

-- Give a free check back when the AI call fails after a successful claim.
create or replace function public.refund_free_review(p_event_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_email text;
begin
  delete from public.free_review_events where id = p_event_id returning canonical_email into v_email;
  if v_email is not null then
    update public.free_allowance
       set used = greatest(used - 1, 0), updated_at = now()
     where canonical_email = v_email;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges + RLS
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.subscriptions enable row level security;
alter table public.reviews enable row level security;
alter table public.free_allowance enable row level security;
alter table public.free_review_events enable row level security;

-- Supabase grants broad table privileges to anon/authenticated by default. Take them
-- back and grant only SELECT where a policy allows it.
revoke all on public.profiles, public.workspaces, public.workspace_members,
  public.subscriptions, public.reviews, public.free_allowance, public.free_review_events
  from anon, authenticated;

grant select on public.profiles, public.workspaces, public.workspace_members,
  public.subscriptions, public.reviews
  to authenticated;

-- Don't rely on platform defaults for the server's own access.
grant select, insert, update, delete on public.profiles, public.workspaces, public.workspace_members,
  public.subscriptions, public.reviews, public.free_allowance, public.free_review_events
  to service_role;

create policy profiles_select_own on public.profiles
  for select to authenticated using (id = auth.uid());

create policy workspaces_select_member on public.workspaces
  for select to authenticated using (public.is_workspace_member(id));

create policy workspace_members_select_member on public.workspace_members
  for select to authenticated using (public.is_workspace_member(workspace_id));

create policy subscriptions_select_member on public.subscriptions
  for select to authenticated using (public.is_workspace_member(workspace_id));

create policy reviews_select_member on public.reviews
  for select to authenticated using (public.is_workspace_member(workspace_id));

-- free_allowance / free_review_events: no policies, no grants. Service role only.

revoke all on function public.claim_free_review(text, text, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.refund_free_review(uuid) from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.is_workspace_member(uuid) to authenticated;
grant execute on function public.claim_free_review(text, text, integer, integer, integer) to service_role;
grant execute on function public.refund_free_review(uuid) to service_role;

-- ===== 0002_deadline_reminders =====
-- Phase 2: notice deadline reminders.
--
-- reviews ─┬─ obligations (AI-extracted, status suggested → confirmed/dismissed)
--          └─ job (name, jurisdiction for bank holidays)
-- obligations ── reminders (one row per user per send date per kind)
--
-- Same access model as 0001: users SELECT through RLS; writes go through API routes.

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,
  name text not null check (char_length(name) between 1 and 120),
  jurisdiction text not null default 'england-and-wales'
    check (jurisdiction in ('england-and-wales', 'scotland', 'northern-ireland')),
  created_at timestamptz not null default now()
);
create index jobs_workspace_idx on public.jobs (workspace_id, created_at desc);

alter table public.reviews add column job_id uuid references public.jobs (id) on delete set null;
alter table public.reviews add column extraction_status text
  check (extraction_status in ('not_run', 'ok', 'failed'));

create table public.obligations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  review_id uuid not null references public.reviews (id) on delete cascade,
  job_id uuid references public.jobs (id) on delete cascade,
  kind text not null check (kind in ('payment_application', 'payment_notice', 'pay_less_notice',
    'variation_notice', 'eot_notice', 'retention_release', 'final_account', 'other')),
  title text not null check (char_length(title) between 1 and 200),
  clause_ref text check (clause_ref is null or char_length(clause_ref) <= 120),
  source_quote text not null check (char_length(source_quote) <= 600),
  trigger text not null check (trigger in ('fixed_date', 'monthly', 'event')),
  fixed_date date,
  day_of_month smallint check (day_of_month between 1 and 31),
  event_description text check (event_description is null or char_length(event_description) <= 200),
  offset_days integer check (offset_days between 0 and 3650),
  direction text check (direction in ('after', 'before')),
  day_basis text not null default 'unspecified' check (day_basis in ('calendar', 'working', 'unspecified')),
  status text not null default 'suggested' check (status in ('suggested', 'confirmed', 'dismissed')),
  event_date date,
  due_date date,
  -- How due_date was worked out, shown to the user and in emails.
  due_basis text check (due_basis in ('fixed', 'monthly', 'calendar', 'working', 'manual')),
  extraction_version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint obligation_trigger_shape check (
    (trigger = 'fixed_date' and fixed_date is not null)
    or (trigger = 'monthly' and day_of_month is not null)
    or (trigger = 'event' and offset_days is not null and direction is not null and event_description is not null)
  ),
  -- Can't confirm something we can't date (event not logged yet is fine: it stays confirmed, undated).
  constraint obligation_confirm_needs_job check (status <> 'confirmed' or job_id is not null)
);
create index obligations_workspace_idx on public.obligations (workspace_id);
create index obligations_review_idx on public.obligations (review_id);
create index obligations_job_idx on public.obligations (job_id);
create index obligations_due_idx on public.obligations (status, due_date);

create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  obligation_id uuid not null references public.obligations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  send_on date not null,
  kind text not null check (kind in ('lead', 'due')),
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'skipped', 'failed')),
  attempts integer not null default 0,
  claimed_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (obligation_id, user_id, send_on, kind)
);
create index reminders_status_send_idx on public.reminders (status, send_on);

alter table public.profiles add column reminder_emails boolean not null default true;

-- ---------------------------------------------------------------------------
-- Daily sender: skip what's no longer valid, then claim what's due.
-- ---------------------------------------------------------------------------

create or replace function public.claim_due_reminders(p_today date, p_limit integer)
returns table (
  reminder_id uuid,
  user_id uuid,
  email text,
  reminder_kind text,
  obligation_id uuid,
  obligation_kind text,
  title text,
  clause_ref text,
  due_date date,
  due_basis text,
  job_id uuid,
  job_name text,
  workspace_id uuid
)
language plpgsql security definer
set search_path = public
as $$
begin
  -- Anything due that no longer applies: unconfirmed/dismissed, undated, already past, or opted out.
  update public.reminders r
     set status = 'skipped'
    from public.obligations o, public.profiles p
   where r.obligation_id = o.id
     and p.id = r.user_id
     and r.status = 'pending'
     and r.send_on <= p_today
     and (o.status <> 'confirmed' or o.due_date is null or o.due_date < p_today or not p.reminder_emails);

  -- Sends that failed or died mid-run and can no longer usefully be retried.
  update public.reminders r
     set status = 'failed'
    from public.obligations o
   where r.obligation_id = o.id
     and r.status = 'sending'
     and r.claimed_at < now() - interval '30 minutes'
     and (r.attempts >= 3 or o.status <> 'confirmed' or o.due_date is null or o.due_date < p_today);

  return query
  with claimable as (
    select r.id
      from public.reminders r
      join public.obligations o on o.id = r.obligation_id
     where o.status = 'confirmed'
       and o.due_date >= p_today
       and (
         (r.status = 'pending' and r.send_on <= p_today)
         -- A send that failed or died mid-run: retry after 30 minutes, at most 3 attempts.
         or (r.status = 'sending' and r.claimed_at < now() - interval '30 minutes' and r.attempts < 3)
       )
     order by r.send_on
     limit p_limit
     for update of r skip locked
  ),
  claimed as (
    update public.reminders r
       set status = 'sending', claimed_at = now(), attempts = r.attempts + 1
      from claimable c
     where r.id = c.id
    returning r.id, r.user_id, r.kind, r.obligation_id
  )
  select c.id, c.user_id, p.email, c.kind, o.id, o.kind, o.title, o.clause_ref, o.due_date, o.due_basis,
         j.id, j.name, o.workspace_id
    from claimed c
    join public.obligations o on o.id = c.obligation_id
    join public.profiles p on p.id = c.user_id
    left join public.jobs j on j.id = o.job_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges + RLS
-- ---------------------------------------------------------------------------

alter table public.jobs enable row level security;
alter table public.obligations enable row level security;
alter table public.reminders enable row level security;

revoke all on public.jobs, public.obligations, public.reminders from anon, authenticated;
grant select on public.jobs, public.obligations, public.reminders to authenticated;
grant select, insert, update, delete on public.jobs, public.obligations, public.reminders to service_role;

create policy jobs_select_member on public.jobs
  for select to authenticated using (public.is_workspace_member(workspace_id));

create policy obligations_select_member on public.obligations
  for select to authenticated using (public.is_workspace_member(workspace_id));

create policy reminders_select_own on public.reminders
  for select to authenticated using (user_id = auth.uid());

revoke all on function public.claim_due_reminders(date, integer) from public, anon, authenticated;
grant execute on function public.claim_due_reminders(date, integer) to service_role;

-- ===== 0003_team_seats =====
-- Phase 3: team workspaces, invites, and deadline assignees.
--
-- Personal workspaces stay single-member. A user can also own team workspaces
-- (personal = false) and invite people by email. Pro inside a team is per seat:
-- owner first, then members by join date, up to subscriptions.seat_count
-- (see isProInWorkspace in src/lib/entitlements.ts).

create table public.workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  email text not null check (email = lower(email) and char_length(email) <= 254),
  -- sha256 of the token in the invite link. The token itself is never stored.
  token_hash text not null unique,
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null
);
create unique index workspace_invites_one_pending
  on public.workspace_invites (workspace_id, email) where accepted_at is null;

alter table public.obligations add column assignee_id uuid references auth.users (id) on delete set null;

-- Lets the API embed a member's profile (name, email) in one query. Every user has a
-- profile (signup trigger), so this can't orphan existing rows.
alter table public.workspace_members
  add constraint workspace_members_user_profile_fk foreign key (user_id) references public.profiles (id) on delete cascade;

-- ---------------------------------------------------------------------------
-- Accept an invite atomically. Returns one of:
--   ok | invalid | expired | email_mismatch | already_member | not_a_team | full
-- ---------------------------------------------------------------------------
create or replace function public.accept_workspace_invite(
  p_token_hash text,
  p_user_id uuid,
  p_email text,
  p_max_members integer
)
returns table (status text, workspace_id uuid)
language plpgsql security definer
set search_path = public
as $$
declare
  inv public.workspace_invites%rowtype;
  ws public.workspaces%rowtype;
  n integer;
begin
  select * into inv from public.workspace_invites where token_hash = p_token_hash for update;
  if not found or inv.accepted_at is not null then
    return query select 'invalid'::text, null::uuid; return;
  end if;
  if inv.expires_at < now() then
    return query select 'expired'::text, inv.workspace_id; return;
  end if;
  if inv.email <> lower(p_email) then
    return query select 'email_mismatch'::text, inv.workspace_id; return;
  end if;

  select * into ws from public.workspaces where id = inv.workspace_id for update;
  if ws.personal then
    return query select 'not_a_team'::text, inv.workspace_id; return;
  end if;
  if exists (select 1 from public.workspace_members m where m.workspace_id = inv.workspace_id and m.user_id = p_user_id) then
    update public.workspace_invites set accepted_at = now(), accepted_by = p_user_id where id = inv.id;
    return query select 'already_member'::text, inv.workspace_id; return;
  end if;
  select count(*) into n from public.workspace_members m where m.workspace_id = inv.workspace_id;
  if n >= p_max_members then
    return query select 'full'::text, inv.workspace_id; return;
  end if;

  insert into public.workspace_members (workspace_id, user_id, role) values (inv.workspace_id, p_user_id, 'member');
  update public.workspace_invites set accepted_at = now(), accepted_by = p_user_id where id = inv.id;
  return query select 'ok'::text, inv.workspace_id;
end;
$$;

-- Personal workspaces can only ever hold their owner.
create or replace function public.guard_personal_workspace_members()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.workspaces w where w.id = new.workspace_id and w.personal and w.owner_id <> new.user_id) then
    raise exception 'personal workspaces cannot have other members' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger workspace_members_personal_guard
  before insert or update on public.workspace_members
  for each row execute function public.guard_personal_workspace_members();

-- Teammates can see each other's name and email (needed for the member list and assignees).
create or replace function public.shares_workspace_with(other uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.workspace_members a
      join public.workspace_members b on b.workspace_id = a.workspace_id
     where a.user_id = auth.uid() and b.user_id = other
  );
$$;

create or replace function public.is_workspace_owner(ws uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members
     where workspace_id = ws and user_id = auth.uid() and role = 'owner'
  );
$$;

-- ---------------------------------------------------------------------------
-- Privileges + RLS
-- ---------------------------------------------------------------------------

alter table public.workspace_invites enable row level security;
revoke all on public.workspace_invites from anon, authenticated;
grant select on public.workspace_invites to authenticated;
grant select, insert, update, delete on public.workspace_invites to service_role;

-- Only owners see pending invites (and never the token, which isn't stored).
create policy workspace_invites_select_owner on public.workspace_invites
  for select to authenticated using (public.is_workspace_owner(workspace_id));

create policy profiles_select_teammates on public.profiles
  for select to authenticated using (public.shares_workspace_with(id));

revoke all on function public.accept_workspace_invite(text, uuid, text, integer) from public, anon, authenticated;
grant execute on function public.accept_workspace_invite(text, uuid, text, integer) to service_role;
revoke all on function public.guard_personal_workspace_members() from public, anon, authenticated;
grant execute on function public.shares_workspace_with(uuid) to authenticated;
grant execute on function public.is_workspace_owner(uuid) to authenticated;

-- ===== 0004_ocr_cap_and_minimisation =====
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

-- ===== 0005_team_transfer =====
-- Hand a team workspace to another member, atomically.
-- Returns 'ok' | 'not_found' | 'not_owner' | 'personal' | 'not_member'.
create or replace function public.transfer_workspace(p_workspace_id uuid, p_from uuid, p_to uuid)
returns text
language plpgsql security definer
set search_path = public
as $$
declare
  ws public.workspaces%rowtype;
begin
  select * into ws from public.workspaces where id = p_workspace_id for update;
  if not found then return 'not_found'; end if;
  if ws.owner_id <> p_from then return 'not_owner'; end if;
  if ws.personal then return 'personal'; end if;
  if not exists (select 1 from public.workspace_members where workspace_id = p_workspace_id and user_id = p_to) then
    return 'not_member';
  end if;

  update public.workspaces set owner_id = p_to where id = p_workspace_id;
  update public.workspace_members set role = 'owner' where workspace_id = p_workspace_id and user_id = p_to;
  update public.workspace_members set role = 'member' where workspace_id = p_workspace_id and user_id = p_from;
  return 'ok';
end;
$$;

revoke all on function public.transfer_workspace(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.transfer_workspace(uuid, uuid, uuid) to service_role;

-- ===== 0006_check_timing =====
-- How long each check took (model call start to result), for speed tracking.
-- Additive only: nullable column, existing rows untouched.
alter table public.reviews add column if not exists duration_ms integer check (duration_ms is null or duration_ms >= 0);

-- ===== 0007_project_tracking =====
-- Round 3: project tracking.
--   * Users add their own dated items to a project (no contract check needed).
--   * Items can be marked done. Monthly items record the cycle that was done instead.
--   * "Payment due" kind for manual items.
--   * Reminders at 7 days, 2 days, on the day, and once when overdue.
-- Additive only: no rows are changed or removed; constraints are only widened.

alter table public.obligations alter column review_id drop not null;
alter table public.obligations
  add column source text not null default 'contract' check (source in ('contract', 'manual')),
  add column completed_at timestamptz,
  -- Monthly items: the latest due date the user marked done. The next one is after it.
  add column done_through date,
  add constraint obligation_needs_review_or_job check (review_id is not null or job_id is not null);

alter table public.obligations drop constraint obligations_status_check;
alter table public.obligations add constraint obligations_status_check
  check (status in ('suggested', 'confirmed', 'dismissed', 'done'));

alter table public.obligations drop constraint obligations_kind_check;
alter table public.obligations add constraint obligations_kind_check
  check (kind in ('payment_application', 'payment_notice', 'pay_less_notice', 'variation_notice', 'eot_notice',
    'retention_release', 'final_account', 'payment_due', 'other'));

-- 'lead' (2 working days before) stays valid for rows created before this migration.
alter table public.reminders drop constraint reminders_kind_check;
alter table public.reminders add constraint reminders_kind_check
  check (kind in ('lead', 'lead7', 'lead2', 'due', 'overdue'));

-- Same as 0002, except an 'overdue' reminder is sent after the due date has passed.
create or replace function public.claim_due_reminders(p_today date, p_limit integer)
returns table (
  reminder_id uuid,
  user_id uuid,
  email text,
  reminder_kind text,
  obligation_id uuid,
  obligation_kind text,
  title text,
  clause_ref text,
  due_date date,
  due_basis text,
  job_id uuid,
  job_name text,
  workspace_id uuid
)
language plpgsql security definer
set search_path = public
as $$
begin
  -- Anything due that no longer applies: not being tracked (incl. done), undated, past (except
  -- the overdue notice), or opted out.
  update public.reminders r
     set status = 'skipped'
    from public.obligations o, public.profiles p
   where r.obligation_id = o.id
     and p.id = r.user_id
     and r.status = 'pending'
     and r.send_on <= p_today
     and (o.status <> 'confirmed' or o.due_date is null
          or (o.due_date < p_today and r.kind <> 'overdue') or not p.reminder_emails);

  -- Sends that failed or died mid-run and can no longer usefully be retried.
  update public.reminders r
     set status = 'failed'
    from public.obligations o
   where r.obligation_id = o.id
     and r.status = 'sending'
     and r.claimed_at < now() - interval '30 minutes'
     and (r.attempts >= 3 or o.status <> 'confirmed' or o.due_date is null
          or (o.due_date < p_today and r.kind <> 'overdue'));

  return query
  with claimable as (
    select r.id
      from public.reminders r
      join public.obligations o on o.id = r.obligation_id
     where o.status = 'confirmed'
       and o.due_date is not null
       and (o.due_date >= p_today or r.kind = 'overdue')
       and (
         (r.status = 'pending' and r.send_on <= p_today)
         -- A send that failed or died mid-run: retry after 30 minutes, at most 3 attempts.
         or (r.status = 'sending' and r.claimed_at < now() - interval '30 minutes' and r.attempts < 3)
       )
     order by r.send_on
     limit p_limit
     for update of r skip locked
  ),
  claimed as (
    update public.reminders r
       set status = 'sending', claimed_at = now(), attempts = r.attempts + 1
      from claimable c
     where r.id = c.id
    returning r.id, r.user_id, r.kind, r.obligation_id
  )
  select c.id, c.user_id, p.email, c.kind, o.id, o.kind, o.title, o.clause_ref, o.due_date, o.due_basis,
         j.id, j.name, o.workspace_id
    from claimed c
    join public.obligations o on o.id = c.obligation_id
    join public.profiles p on p.id = c.user_id
    left join public.jobs j on j.id = o.job_id;
end;
$$;

revoke all on function public.claim_due_reminders(date, integer) from public, anon, authenticated;
grant execute on function public.claim_due_reminders(date, integer) to service_role;

-- ===== 0008_help_requests =====
-- Round 3: "Need help getting paid?" requests.
-- Saved for the owner to follow up by hand. Nothing is shared with a third party
-- automatically; `consent` records the user's agreement that it may be.

create table public.help_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete set null,
  obligation_id uuid references public.obligations (id) on delete set null,
  review_id uuid references public.reviews (id) on delete set null,
  amount_pence bigint not null check (amount_pence > 0 and amount_pence <= 100000000000),
  debtor text not null check (char_length(debtor) between 1 and 200),
  days_overdue integer not null check (days_overdue between 0 and 3650),
  pay_less_notice text not null check (pay_less_notice in ('yes', 'no', 'unsure')),
  contact_name text not null check (char_length(contact_name) between 1 and 120),
  contact_email text not null check (char_length(contact_email) between 3 and 254),
  contact_phone text check (contact_phone is null or char_length(contact_phone) <= 40),
  notes text check (notes is null or char_length(notes) <= 2000),
  consent boolean not null check (consent),
  consent_text text not null,
  emailed_at timestamptz,
  created_at timestamptz not null default now()
);
create index help_requests_user_idx on public.help_requests (user_id, created_at desc);

alter table public.help_requests enable row level security;
revoke all on public.help_requests from anon, authenticated;
grant select on public.help_requests to authenticated;
grant select, insert, update, delete on public.help_requests to service_role;

-- People can see what they sent. Writes go through /api/help only.
create policy help_requests_select_own on public.help_requests
  for select to authenticated using (user_id = auth.uid());

commit;
select 'GuardConstruct setup complete' as result;
