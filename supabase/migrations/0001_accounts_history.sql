-- Phase 1: server-side accounts, workspaces, subscriptions, cloud review history,
-- and a free-tier ledger that can't be reset by clearing the browser.
--
-- Access model:
--   * The browser (anon / authenticated JWT) can only SELECT, and only through RLS.
--   * Every write goes through a Next.js API route using the service-role key,
--     after the route has checked the caller's session and membership.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  name text check (name is null or char_length(name) <= 120),
  terms_version text check (terms_version is null or char_length(terms_version) <= 40),
  terms_accepted_at timestamptz,
  created_at timestamptz not null default now()
);

-- Every user gets a personal workspace. Team workspaces (Phase 3) reuse these tables,
-- so reviews and billing hang off a workspace, never directly off a user.
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  owner_id uuid not null references auth.users (id) on delete cascade,
  personal boolean not null default true,
  -- Complimentary Pro (founder, testers). Set by hand in SQL; never writable from the app.
  comp_pro boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index workspaces_one_personal_per_owner on public.workspaces (owner_id) where personal;

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index workspace_members_user_idx on public.workspace_members (user_id);

-- One row per workspace, kept in sync from Stripe by the webhook.
create table public.subscriptions (
  workspace_id uuid primary key references public.workspaces (id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  status text,
  price_id text,
  seat_count integer not null default 1 check (seat_count >= 1),
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);

-- Review history. Deliberately does NOT store the full contract text: only the
-- AI result and a short preview. See privacy policy.
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  author_id uuid references auth.users (id) on delete set null,
  trade text check (trade is null or char_length(trade) <= 120),
  role text check (role is null or char_length(role) <= 80),
  project_size text check (project_size is null or char_length(project_size) <= 80),
  duration text check (duration is null or char_length(duration) <= 80),
  contract_preview text check (contract_preview is null or char_length(contract_preview) <= 200),
  result_md text not null check (char_length(result_md) <= 200000),
  model text not null,
  prompt_version text not null,
  created_at timestamptz not null default now()
);
create index reviews_workspace_created_idx on public.reviews (workspace_id, created_at desc);

-- Free-tier ledger, keyed by *canonical* email (lowercased, +tags stripped, Gmail dots
-- removed) so aliases of one inbox share one allowance.
create table public.free_allowance (
  canonical_email text primary key,
  used integer not null default 0 check (used >= 0),
  updated_at timestamptz not null default now()
);

-- Short-lived log used for per-IP and global daily caps. IPs are stored hashed.
create table public.free_review_events (
  id uuid primary key default gen_random_uuid(),
  canonical_email text not null,
  ip_hash text not null,
  created_at timestamptz not null default now()
);
create index free_review_events_created_idx on public.free_review_events (created_at);
create index free_review_events_ip_idx on public.free_review_events (ip_hash, created_at);

-- ---------------------------------------------------------------------------
-- Helpers used by RLS policies
-- ---------------------------------------------------------------------------

create or replace function public.is_workspace_member(ws uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = ws and user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- New user bootstrap: profile + personal workspace + owner membership
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  ws uuid;
  tv text := nullif(btrim(left(new.raw_user_meta_data ->> 'terms_version', 40)), '');
begin
  insert into public.profiles (id, email, name, terms_version, terms_accepted_at)
  values (
    new.id,
    lower(new.email),
    nullif(left(new.raw_user_meta_data ->> 'name', 120), ''),
    tv,
    case when tv is not null then now() end
  );

  insert into public.workspaces (name, owner_id, personal)
  values ('Personal', new.id, true)
  returning id into ws;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (ws, new.id, 'owner');

  return new;
end;
$$;

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
