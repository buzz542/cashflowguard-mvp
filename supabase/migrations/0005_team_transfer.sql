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
