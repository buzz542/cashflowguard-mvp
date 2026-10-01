\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'ASSERTION FAILED: %', msg; end if;
end $$;

insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000e6', 'boss@x.co.uk', now()),
  ('00000000-0000-0000-0000-0000000000f6', 'next@x.co.uk', now()),
  ('00000000-0000-0000-0000-0000000000a6', 'outsider6@x.co.uk', now());
insert into public.workspaces (id, name, owner_id, personal) values ('b0000000-0000-0000-0000-0000000000e6', 'X Ltd', '00000000-0000-0000-0000-0000000000e6', false);
insert into public.workspace_members (workspace_id, user_id, role) values
  ('b0000000-0000-0000-0000-0000000000e6', '00000000-0000-0000-0000-0000000000e6', 'owner'),
  ('b0000000-0000-0000-0000-0000000000e6', '00000000-0000-0000-0000-0000000000f6', 'member');
select id as personal_e6 from public.workspaces where owner_id = '00000000-0000-0000-0000-0000000000e6' and personal \gset

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e6', false);
do $$ begin
  begin perform public.transfer_workspace('b0000000-0000-0000-0000-0000000000e6', '00000000-0000-0000-0000-0000000000e6', '00000000-0000-0000-0000-0000000000f6');
        raise exception 'LEAK: user can call transfer directly';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

set role service_role;
select pg_temp.assert(public.transfer_workspace('b0000000-0000-0000-0000-0000000000e6', '00000000-0000-0000-0000-0000000000f6', '00000000-0000-0000-0000-0000000000e6') = 'not_owner', 'only the owner can transfer');
select pg_temp.assert(public.transfer_workspace('b0000000-0000-0000-0000-0000000000e6', '00000000-0000-0000-0000-0000000000e6', '00000000-0000-0000-0000-0000000000a6') = 'not_member', 'only to a member');
select pg_temp.assert(public.transfer_workspace(:'personal_e6', '00000000-0000-0000-0000-0000000000e6', '00000000-0000-0000-0000-0000000000f6') = 'personal', 'personal workspaces cannot be transferred');
select pg_temp.assert(public.transfer_workspace('b0000000-0000-0000-0000-0000000000e6', '00000000-0000-0000-0000-0000000000e6', '00000000-0000-0000-0000-0000000000f6') = 'ok', 'transfer ok');
reset role;
select pg_temp.assert((select owner_id from public.workspaces where id = 'b0000000-0000-0000-0000-0000000000e6') = '00000000-0000-0000-0000-0000000000f6', 'owner changed');
select pg_temp.assert((select role from public.workspace_members where workspace_id = 'b0000000-0000-0000-0000-0000000000e6' and user_id = '00000000-0000-0000-0000-0000000000f6') = 'owner', 'new owner role');
select pg_temp.assert((select role from public.workspace_members where workspace_id = 'b0000000-0000-0000-0000-0000000000e6' and user_id = '00000000-0000-0000-0000-0000000000e6') = 'member', 'old owner now member');
select pg_temp.assert((select count(*) from public.workspace_members where workspace_id = 'b0000000-0000-0000-0000-0000000000e6' and role = 'owner') = 1, 'exactly one owner');

\o
\echo '0006 team transfer tests passed'
