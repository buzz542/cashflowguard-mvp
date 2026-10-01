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
