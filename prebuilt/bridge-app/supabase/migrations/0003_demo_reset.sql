begin;

create or replace function public.reset_demo_run(p_run_id uuid)
returns setof public.migration_runs
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_run_id::text, 0));

  delete from public.approvals where run_id = p_run_id;
  delete from public.comments where run_id = p_run_id;
  delete from public.run_events where run_id = p_run_id;
  delete from public.impacts where run_id = p_run_id;
  delete from public.migration_plans where run_id = p_run_id;

  return query
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
    returning run.*;
end;
$$;

revoke all on function public.reset_demo_run(uuid)
  from public, anon, authenticated;
grant execute on function public.reset_demo_run(uuid)
  to service_role;

commit;
