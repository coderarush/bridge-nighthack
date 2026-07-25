begin;

create or replace function public.prepare_demo_run(p_run_id uuid)
returns table (
  id uuid,
  status text,
  prepared boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_run public.migration_runs%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_run_id::text, 0));

  select run.*
    into current_run
  from public.migration_runs run
  where run.id = p_run_id
  for update;

  if not found then
    return;
  end if;

  if current_run.status in (
    'analyzing_change',
    'scanning_repo',
    'planning',
    'patching',
    'validating'
  ) and (
    current_run.lock_expires_at > now()
    or current_run.updated_at > now() - interval '30 seconds'
  ) then
    id := current_run.id;
    status := current_run.status;
    prepared := false;
    return next;
    return;
  end if;

  delete from public.approvals where run_id = p_run_id;
  delete from public.comments where run_id = p_run_id;
  delete from public.run_events where run_id = p_run_id;
  delete from public.impacts where run_id = p_run_id;
  delete from public.migration_plans where run_id = p_run_id;

  update public.migration_runs run
  set
    status = 'analyzing_change',
    current_stage = 'analyzing_change',
    plan_version = 1,
    branch_name = null,
    commit_sha = null,
    pull_request_number = null,
    pull_request_url = null,
    validation_url = null,
    validation_status = null,
    validation_conclusion = null,
    error_code = null,
    error_message = null,
    lock_owner = null,
    lock_expires_at = null,
    updated_at = now()
  where run.id = p_run_id
  returning run.* into current_run;

  id := current_run.id;
  status := current_run.status;
  prepared := true;
  return next;
end;
$$;

revoke all on function public.prepare_demo_run(uuid)
  from public, anon, authenticated;
grant execute on function public.prepare_demo_run(uuid)
  to service_role;

commit;
