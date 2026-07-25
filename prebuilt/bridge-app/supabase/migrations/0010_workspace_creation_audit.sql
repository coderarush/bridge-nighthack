begin;

create or replace function public.service_create_workspace_with_audit(
  p_name text,
  p_slug text,
  p_owner_user_id uuid
)
returns public.workspaces
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_workspace public.workspaces;
begin
  select *
  into created_workspace
  from public.service_create_workspace(
    p_name,
    p_slug,
    p_owner_user_id
  );

  perform public.service_append_workspace_audit_log(
    created_workspace.id,
    'user',
    'workspace.created',
    'workspace',
    p_owner_user_id,
    null,
    created_workspace.id::text,
    null,
    jsonb_build_object('slug', created_workspace.slug)
  );

  return created_workspace;
end;
$$;

revoke all on function public.service_create_workspace_with_audit(text, text, uuid)
  from public, anon, authenticated;

revoke execute on function public.service_create_workspace(text, text, uuid)
  from service_role;

grant execute on function public.service_create_workspace_with_audit(text, text, uuid)
  to service_role;

commit;
