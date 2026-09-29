-- Team workspace + invite tests for 0003.
\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'ASSERTION FAILED: %', msg; end if;
end $$;

insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000f1', 'owner@firm.co.uk', '{"name":"Olive"}', now()),
  ('00000000-0000-0000-0000-0000000000f2', 'mate@firm.co.uk', '{"name":"Matt"}', now()),
  ('00000000-0000-0000-0000-0000000000f3', 'outsider@else.com', '{}', now());

insert into public.workspaces (id, name, owner_id, personal)
values ('50000000-0000-0000-0000-0000000000f1', 'Olive Electrical Ltd', '00000000-0000-0000-0000-0000000000f1', false);
insert into public.workspace_members (workspace_id, user_id, role)
values ('50000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f1', 'owner');

select id as personal_f1 from public.workspaces where owner_id = '00000000-0000-0000-0000-0000000000f1' and personal \gset

-- Personal workspaces can't take other members.
do $$ begin
  begin
    insert into public.workspace_members (workspace_id, user_id, role)
    select id, '00000000-0000-0000-0000-0000000000f2', 'member' from public.workspaces
     where owner_id = '00000000-0000-0000-0000-0000000000f1' and personal;
    raise exception 'LEAK: personal workspace accepted a member';
  exception when check_violation then null; end;
end $$;

insert into public.workspace_invites (id, workspace_id, email, token_hash, invited_by, expires_at) values
  ('60000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-0000000000f1', 'mate@firm.co.uk', 'hash-good', '00000000-0000-0000-0000-0000000000f1', now() + interval '7 days'),
  ('60000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-0000000000f1', 'late@firm.co.uk', 'hash-expired', '00000000-0000-0000-0000-0000000000f1', now() - interval '1 minute'),
  ('60000000-0000-0000-0000-000000000003', :'personal_f1', 'mate@firm.co.uk', 'hash-personal', '00000000-0000-0000-0000-0000000000f1', now() + interval '7 days');

-- ---- RLS: invites visible to the owner only; profiles to teammates ----
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f2', false);
select pg_temp.assert((select count(*) from public.workspace_invites) = 0, 'non-member sees no invites');
select pg_temp.assert((select count(*) from public.profiles) = 1, 'before joining, only own profile');
reset role;

-- ---- Accepting ----
set role service_role;
select pg_temp.assert((select status from public.accept_workspace_invite('nope', '00000000-0000-0000-0000-0000000000f2', 'mate@firm.co.uk', 25)) = 'invalid', 'unknown token');
select pg_temp.assert((select status from public.accept_workspace_invite('hash-good', '00000000-0000-0000-0000-0000000000f3', 'outsider@else.com', 25)) = 'email_mismatch', 'forwarded link refused');
select pg_temp.assert((select status from public.accept_workspace_invite('hash-expired', '00000000-0000-0000-0000-0000000000f2', 'late@firm.co.uk', 25)) = 'expired', 'expired invite refused');
select pg_temp.assert((select status from public.accept_workspace_invite('hash-personal', '00000000-0000-0000-0000-0000000000f2', 'mate@firm.co.uk', 25)) = 'not_a_team', 'personal workspace invite refused');
select pg_temp.assert((select status from public.accept_workspace_invite('hash-good', '00000000-0000-0000-0000-0000000000f2', 'MATE@firm.co.uk', 1)) = 'full', 'member cap enforced');
select pg_temp.assert((select status from public.accept_workspace_invite('hash-good', '00000000-0000-0000-0000-0000000000f2', 'MATE@firm.co.uk', 25)) = 'ok', 'valid invite accepted (case-insensitive email)');
select pg_temp.assert((select status from public.accept_workspace_invite('hash-good', '00000000-0000-0000-0000-0000000000f2', 'mate@firm.co.uk', 25)) = 'invalid', 'invite is single-use');
select pg_temp.assert((select role from public.workspace_members where workspace_id = '50000000-0000-0000-0000-0000000000f1' and user_id = '00000000-0000-0000-0000-0000000000f2') = 'member', 'joined as member');
reset role;

-- ---- After joining ----
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f2', false);
select pg_temp.assert((select count(*) from public.workspaces) = 2, 'member sees personal + team workspace');
select pg_temp.assert((select count(*) from public.profiles) = 2, 'member sees own + teammate profile');
select pg_temp.assert((select count(*) from public.profiles where email = 'outsider@else.com') = 0, 'outsider profile hidden');
select pg_temp.assert((select count(*) from public.workspace_invites) = 0, 'members (non-owners) do not see invites');
do $$ begin
  begin insert into public.workspace_members (workspace_id, user_id, role)
        values ('50000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f3', 'member');
        raise exception 'LEAK: member can add members';
  exception when insufficient_privilege then null; end;
  begin update public.workspace_members set role = 'owner'; raise exception 'LEAK: member can promote self';
  exception when insufficient_privilege then null; end;
end $$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f1', false);
select pg_temp.assert((select count(*) from public.workspace_invites where workspace_id = '50000000-0000-0000-0000-0000000000f1') = 2, 'owner sees team invites');
reset role;
select pg_temp.assert(
  (select count(*) from information_schema.columns where table_name = 'workspace_invites' and column_name = 'token') = 0,
  'invite tokens are only stored hashed');
-- The API embeds profiles(email, name) from workspace_members; PostgREST needs this FK.
select pg_temp.assert(
  (select count(*) from pg_constraint where conname = 'workspace_members_user_profile_fk' and confrelid = 'public.profiles'::regclass) = 1,
  'workspace_members → profiles FK exists for embedding');

\o
\echo '0003 team tests passed'
