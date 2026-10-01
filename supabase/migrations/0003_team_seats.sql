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
