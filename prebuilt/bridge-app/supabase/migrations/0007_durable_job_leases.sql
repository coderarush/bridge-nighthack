begin;

alter table public.orchestration_jobs
  add column lease_required boolean not null default false,
  add column retry_base_delay_ms integer not null default 1000
    check (retry_base_delay_ms > 0),
  add column retry_max_delay_ms integer not null default 60000
    check (retry_max_delay_ms > 0),
  add column terminal_failure jsonb
    check (
      terminal_failure is null
      or jsonb_typeof(terminal_failure) = 'object'
    ),
  add constraint orchestration_jobs_retry_delay_order
    check (retry_max_delay_ms >= retry_base_delay_ms);

alter table public.orchestration_attempts
  add column retryable boolean,
  add column failure_details jsonb not null default '{}'::jsonb
    check (jsonb_typeof(failure_details) = 'object'),
  add column lease_token uuid,
  add column lease_expires_at timestamptz;

create unique index orchestration_attempts_lease_token_uidx
  on public.orchestration_attempts(lease_token)
  where lease_token is not null;

create index orchestration_attempts_active_lease_expiry_idx
  on public.orchestration_attempts(lease_expires_at, job_id)
  where status = 'running';

create or replace function public.service_start_orchestration_attempt(
  p_job_id uuid,
  p_worker_id text
)
returns public.orchestration_attempts
language plpgsql
security definer
set search_path = ''
as $$
declare
  locked_job public.orchestration_jobs;
  next_attempt smallint;
  created_attempt public.orchestration_attempts;
begin
  select *
  into locked_job
  from public.orchestration_jobs job
  where job.id = p_job_id
  for update;

  if locked_job.id is null then
    raise exception 'orchestration job not found'
      using errcode = 'P0002';
  end if;

  if locked_job.lease_required
    or exists (
      select 1
      from public.orchestration_attempts attempt
      where attempt.job_id = locked_job.id
        and (
          attempt.lease_token is not null
          or attempt.lease_expires_at is not null
        )
    )
  then
    raise exception 'durable orchestration jobs require lease-aware RPCs'
      using errcode = '55000';
  end if;

  if locked_job.terminal_failure is not null then
    raise exception 'terminal orchestration job cannot start'
      using errcode = '55000';
  end if;

  if locked_job.status not in ('queued', 'failed') then
    raise exception 'orchestration job cannot start from current state'
      using errcode = '55000';
  end if;

  select (coalesce(max(attempt.attempt_number), 0) + 1)::smallint
  into next_attempt
  from public.orchestration_attempts attempt
  where attempt.job_id = p_job_id;

  if next_attempt > locked_job.max_attempts then
    raise exception 'orchestration job exhausted attempts'
      using errcode = '54000';
  end if;

  insert into public.orchestration_attempts(
    workspace_id,
    job_id,
    attempt_number,
    worker_id
  )
  values (
    locked_job.workspace_id,
    locked_job.id,
    next_attempt,
    btrim(p_worker_id)
  )
  returning * into created_attempt;

  update public.orchestration_jobs
  set
    status = 'running',
    started_at = coalesce(started_at, now()),
    finished_at = null,
    updated_at = now()
  where id = p_job_id;

  return created_attempt;
end;
$$;

create or replace function public.service_finish_orchestration_attempt(
  p_attempt_id uuid,
  p_status text,
  p_result_summary jsonb default '{}'::jsonb,
  p_error_code text default null,
  p_error_message text default null
)
returns public.orchestration_attempts
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_job_id uuid;
  locked_job public.orchestration_jobs;
  saved_attempt public.orchestration_attempts;
begin
  if p_status is null
    or p_status not in ('succeeded', 'failed', 'cancelled')
  then
    raise exception 'invalid terminal attempt status'
      using errcode = '22023';
  end if;

  select attempt.job_id
  into target_job_id
  from public.orchestration_attempts attempt
  where attempt.id = p_attempt_id;

  if target_job_id is null then
    raise exception 'running orchestration attempt not found'
      using errcode = 'P0002';
  end if;

  select *
  into locked_job
  from public.orchestration_jobs job
  where job.id = target_job_id
  for update;

  select *
  into saved_attempt
  from public.orchestration_attempts attempt
  where attempt.id = p_attempt_id
    and attempt.job_id = target_job_id
  for update;

  if locked_job.id is null
    or saved_attempt.id is null
    or saved_attempt.status <> 'running'
  then
    raise exception 'running orchestration attempt not found'
      using errcode = 'P0002';
  end if;

  if locked_job.lease_required
    or saved_attempt.lease_token is not null
    or saved_attempt.lease_expires_at is not null
  then
    raise exception 'durable orchestration attempts require lease-aware RPCs'
      using errcode = '55000';
  end if;

  if locked_job.terminal_failure is not null
    or locked_job.status <> 'running'
  then
    raise exception 'orchestration job cannot finish from current state'
      using errcode = '55000';
  end if;

  update public.orchestration_attempts
  set
    status = p_status,
    result_summary = coalesce(p_result_summary, '{}'::jsonb),
    error_code = p_error_code,
    error_message = p_error_message,
    finished_at = now()
  where id = saved_attempt.id
  returning * into saved_attempt;

  update public.orchestration_jobs
  set
    status = p_status,
    finished_at = now(),
    updated_at = now()
  where id = locked_job.id;

  return saved_attempt;
end;
$$;

create or replace function public.service_enqueue_durable_orchestration_job(
  p_job_id uuid,
  p_workspace_id uuid,
  p_repository_id uuid,
  p_recipe_id uuid,
  p_provider_connection_id uuid,
  p_source_delivery_id uuid,
  p_idempotency_key text,
  p_job_type text,
  p_request_summary jsonb,
  p_priority smallint,
  p_max_attempts smallint,
  p_retry_base_delay_ms integer,
  p_retry_max_delay_ms integer,
  p_now timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_job public.orchestration_jobs;
  was_created boolean := false;
begin
  insert into public.orchestration_jobs(
    id,
    workspace_id,
    repository_id,
    recipe_id,
    provider_connection_id,
    source_delivery_id,
    idempotency_key,
    job_type,
    request_summary,
    priority,
    max_attempts,
    lease_required,
    retry_base_delay_ms,
    retry_max_delay_ms,
    available_at,
    created_at,
    updated_at
  )
  values (
    p_job_id,
    p_workspace_id,
    p_repository_id,
    p_recipe_id,
    p_provider_connection_id,
    p_source_delivery_id,
    btrim(p_idempotency_key),
    btrim(p_job_type),
    coalesce(p_request_summary, '{}'::jsonb),
    p_priority,
    p_max_attempts,
    true,
    p_retry_base_delay_ms,
    p_retry_max_delay_ms,
    p_now,
    p_now,
    p_now
  )
  on conflict (workspace_id, idempotency_key) do nothing
  returning * into saved_job;

  if saved_job.id is null then
    select *
    into saved_job
    from public.orchestration_jobs job
    where job.workspace_id = p_workspace_id
      and job.idempotency_key = btrim(p_idempotency_key);
  else
    was_created := true;
  end if;

  if not saved_job.lease_required then
    raise exception 'durable enqueue conflicts with legacy orchestration job'
      using errcode = '55000';
  end if;

  return jsonb_build_object(
    'job', to_jsonb(saved_job),
    'created', was_created
  );
end;
$$;

create or replace function public.service_claim_orchestration_job(
  p_job_id uuid,
  p_worker_id text,
  p_attempt_id uuid,
  p_lease_token uuid,
  p_now timestamptz,
  p_lease_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  locked_job public.orchestration_jobs;
  active_attempt public.orchestration_attempts;
  created_attempt public.orchestration_attempts;
  next_attempt_number smallint;
  retry_delay_ms bigint;
begin
  select *
  into locked_job
  from public.orchestration_jobs job
  where job.id = p_job_id
  for update;

  if locked_job.id is null then
    raise exception 'orchestration job not found'
      using errcode = 'P0002';
  end if;

  if not locked_job.lease_required then
    raise exception 'orchestration job does not require durable leases'
      using errcode = '55000';
  end if;

  if locked_job.status = 'running' then
    select *
    into active_attempt
    from public.orchestration_attempts attempt
    where attempt.job_id = locked_job.id
      and attempt.status = 'running'
    order by attempt.attempt_number desc
    limit 1
    for update;

    if active_attempt.id is null then
      raise exception 'running orchestration job has no active attempt'
        using errcode = '55000';
    end if;

    if active_attempt.lease_expires_at is not null
      and active_attempt.lease_expires_at > p_now
    then
      return null;
    end if;

    update public.orchestration_attempts
    set
      status = 'failed',
      error_code = 'LEASE_EXPIRED',
      error_message = 'Lease expired before completion.',
      retryable = true,
      failure_details = '{}'::jsonb,
      finished_at = p_now
    where id = active_attempt.id;

    if active_attempt.attempt_number < locked_job.max_attempts then
      retry_delay_ms := least(
        locked_job.retry_max_delay_ms::numeric,
        locked_job.retry_base_delay_ms::numeric
          * power(2::numeric, active_attempt.attempt_number - 1)
      )::bigint;

      update public.orchestration_jobs
      set
        status = 'queued',
        available_at = p_now + retry_delay_ms * interval '1 millisecond',
        finished_at = null,
        updated_at = p_now
      where id = locked_job.id;
    else
      update public.orchestration_jobs
      set
        status = 'failed',
        finished_at = p_now,
        terminal_failure = jsonb_build_object(
          'code', 'LEASE_EXPIRED',
          'message', 'Lease expired before completion.',
          'retryable', false,
          'originalRetryable', true,
          'details', '{}'::jsonb,
          'occurredAt', p_now,
          'attemptNumber', active_attempt.attempt_number,
          'reason', 'attempts_exhausted'
        ),
        updated_at = p_now
      where id = locked_job.id;
    end if;

    return null;
  end if;

  if locked_job.status <> 'queued'
    or locked_job.available_at > p_now
  then
    return null;
  end if;

  if p_lease_expires_at <= p_now then
    raise exception 'lease expiration must be after claim time'
      using errcode = '22023';
  end if;

  select (coalesce(max(attempt.attempt_number), 0) + 1)::smallint
  into next_attempt_number
  from public.orchestration_attempts attempt
  where attempt.job_id = locked_job.id;

  if next_attempt_number > locked_job.max_attempts then
    raise exception 'orchestration job exhausted attempts'
      using errcode = '54000';
  end if;

  insert into public.orchestration_attempts(
    id,
    workspace_id,
    job_id,
    attempt_number,
    worker_id,
    lease_token,
    lease_expires_at,
    started_at,
    created_at
  )
  values (
    p_attempt_id,
    locked_job.workspace_id,
    locked_job.id,
    next_attempt_number,
    btrim(p_worker_id),
    p_lease_token,
    p_lease_expires_at,
    p_now,
    p_now
  )
  returning * into created_attempt;

  update public.orchestration_jobs
  set
    status = 'running',
    started_at = coalesce(started_at, p_now),
    finished_at = null,
    terminal_failure = null,
    updated_at = p_now
  where id = locked_job.id
  returning * into locked_job;

  return jsonb_build_object(
    'job', to_jsonb(locked_job),
    'attempt', to_jsonb(created_attempt)
  );
end;
$$;

create or replace function public.service_renew_orchestration_lease(
  p_job_id uuid,
  p_attempt_id uuid,
  p_lease_token uuid,
  p_now timestamptz,
  p_lease_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  locked_job public.orchestration_jobs;
  saved_attempt public.orchestration_attempts;
begin
  if p_lease_expires_at <= p_now then
    raise exception 'lease expiration must be after renewal time'
      using errcode = '22023';
  end if;

  select *
  into locked_job
  from public.orchestration_jobs job
  where job.id = p_job_id
  for update;

  update public.orchestration_attempts attempt
  set lease_expires_at = p_lease_expires_at
  where attempt.id = p_attempt_id
    and attempt.job_id = p_job_id
    and attempt.lease_token = p_lease_token
    and attempt.status = 'running'
    and attempt.lease_expires_at > p_now
    and locked_job.lease_required
    and locked_job.status = 'running'
  returning * into saved_attempt;

  if saved_attempt.id is null then
    raise exception 'stale or expired orchestration lease'
      using errcode = '55000';
  end if;

  update public.orchestration_jobs
  set updated_at = p_now
  where id = p_job_id
  returning * into locked_job;

  return jsonb_build_object(
    'job', to_jsonb(locked_job),
    'attempt', to_jsonb(saved_attempt)
  );
end;
$$;

create or replace function public.service_complete_orchestration_attempt(
  p_job_id uuid,
  p_attempt_id uuid,
  p_lease_token uuid,
  p_result_summary jsonb,
  p_now timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_job public.orchestration_jobs;
  saved_attempt public.orchestration_attempts;
begin
  select *
  into saved_job
  from public.orchestration_jobs job
  where job.id = p_job_id
  for update;

  update public.orchestration_attempts attempt
  set
    status = 'succeeded',
    result_summary = coalesce(p_result_summary, '{}'::jsonb),
    finished_at = p_now
  where attempt.id = p_attempt_id
    and attempt.job_id = p_job_id
    and attempt.lease_token = p_lease_token
    and attempt.status = 'running'
    and attempt.lease_expires_at > p_now
    and saved_job.lease_required
    and saved_job.status = 'running'
  returning * into saved_attempt;

  if saved_attempt.id is null then
    raise exception 'stale or expired orchestration lease'
      using errcode = '55000';
  end if;

  update public.orchestration_jobs
  set
    status = 'succeeded',
    finished_at = p_now,
    terminal_failure = null,
    updated_at = p_now
  where id = p_job_id
  returning * into saved_job;

  return jsonb_build_object(
    'job', to_jsonb(saved_job),
    'attempt', to_jsonb(saved_attempt)
  );
end;
$$;

create or replace function public.service_fail_orchestration_attempt(
  p_job_id uuid,
  p_attempt_id uuid,
  p_lease_token uuid,
  p_expected_attempt_number smallint,
  p_expected_max_attempts smallint,
  p_expected_retry_base_delay_ms integer,
  p_expected_retry_max_delay_ms integer,
  p_failure_code text,
  p_failure_message text,
  p_failure_retryable boolean,
  p_failure_details jsonb,
  p_next_available_at timestamptz,
  p_terminal_failure jsonb,
  p_now timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_job public.orchestration_jobs;
  saved_attempt public.orchestration_attempts;
  expected_terminal_reason text;
begin
  select *
  into saved_job
  from public.orchestration_jobs job
  where job.id = p_job_id
  for update;

  select *
  into saved_attempt
  from public.orchestration_attempts attempt
  where attempt.id = p_attempt_id
    and attempt.job_id = p_job_id
  for update;

  if saved_job.id is null
    or not saved_job.lease_required
    or saved_job.status <> 'running'
    or saved_attempt.id is null
    or saved_attempt.status <> 'running'
    or saved_attempt.lease_token is distinct from p_lease_token
    or saved_attempt.lease_expires_at is null
    or p_now is null
    or saved_attempt.lease_expires_at <= p_now
    or saved_attempt.attempt_number is distinct from p_expected_attempt_number
    or saved_job.max_attempts is distinct from p_expected_max_attempts
    or saved_job.retry_base_delay_ms
      is distinct from p_expected_retry_base_delay_ms
    or saved_job.retry_max_delay_ms
      is distinct from p_expected_retry_max_delay_ms
  then
    raise exception 'stale or expired orchestration lease'
      using errcode = '55000';
  end if;

  if p_failure_code is null
    or p_failure_code is distinct from btrim(p_failure_code)
    or length(p_failure_code) not between 1 and 160
  then
    raise exception 'failure code is invalid'
      using errcode = '22023';
  end if;

  if p_failure_message is null
    or p_failure_message is distinct from btrim(p_failure_message)
    or length(p_failure_message) not between 1 and 4000
  then
    raise exception 'failure message is invalid'
      using errcode = '22023';
  end if;

  if p_failure_retryable is null then
    raise exception 'failure retryability is required'
      using errcode = '22023';
  end if;

  if jsonb_typeof(p_failure_details) is distinct from 'object' then
    raise exception 'failure details must be a JSON object'
      using errcode = '22023';
  end if;

  if (p_next_available_at is null) = (p_terminal_failure is null) then
    raise exception 'failure must schedule a retry or include a terminal failure'
      using errcode = '22023';
  end if;

  if p_next_available_at is not null then
    if p_failure_retryable is distinct from true
      or p_next_available_at <= p_now
      or saved_attempt.attempt_number >= saved_job.max_attempts
    then
      raise exception 'retry scheduling is invalid'
        using errcode = '22023';
    end if;
  else
    if jsonb_typeof(p_terminal_failure) is distinct from 'object' then
      raise exception 'terminal failure must be a JSON object'
        using errcode = '22023';
    end if;

    if not (
      p_terminal_failure ?& array[
        'code',
        'message',
        'retryable',
        'originalRetryable',
        'details',
        'occurredAt',
        'attemptNumber',
        'reason'
      ]
    )
      or (
        select count(*)
        from jsonb_object_keys(p_terminal_failure)
      ) <> 8
    then
      raise exception 'terminal failure must contain exactly the required fields'
        using errcode = '22023';
    end if;

    if jsonb_typeof(p_terminal_failure -> 'code') is distinct from 'string'
      or jsonb_typeof(p_terminal_failure -> 'message') is distinct from 'string'
      or jsonb_typeof(p_terminal_failure -> 'retryable')
        is distinct from 'boolean'
      or jsonb_typeof(p_terminal_failure -> 'originalRetryable')
        is distinct from 'boolean'
      or jsonb_typeof(p_terminal_failure -> 'details')
        is distinct from 'object'
      or jsonb_typeof(p_terminal_failure -> 'occurredAt')
        is distinct from 'string'
      or jsonb_typeof(p_terminal_failure -> 'attemptNumber')
        is distinct from 'number'
      or jsonb_typeof(p_terminal_failure -> 'reason') is distinct from 'string'
    then
      raise exception 'terminal failure field types are invalid'
        using errcode = '22023';
    end if;

    expected_terminal_reason := case
      when p_failure_retryable then 'attempts_exhausted'
      else 'non_retryable'
    end;

    if p_failure_retryable
      and saved_attempt.attempt_number < saved_job.max_attempts
    then
      raise exception 'retryable failure is not exhausted'
        using errcode = '22023';
    end if;

    if p_terminal_failure ->> 'code' is distinct from p_failure_code
      or p_terminal_failure ->> 'message' is distinct from p_failure_message
      or p_terminal_failure -> 'retryable' is distinct from 'false'::jsonb
      or p_terminal_failure -> 'originalRetryable'
        is distinct from to_jsonb(p_failure_retryable)
      or p_terminal_failure -> 'details' is distinct from p_failure_details
      or (p_terminal_failure ->> 'occurredAt')::timestamptz
        is distinct from p_now
      or (p_terminal_failure ->> 'attemptNumber') !~ '^[1-9][0-9]*$'
      or (p_terminal_failure ->> 'attemptNumber')::integer
        is distinct from saved_attempt.attempt_number::integer
      or p_terminal_failure ->> 'reason'
        is distinct from expected_terminal_reason
    then
      raise exception 'terminal failure does not match the failed attempt'
        using errcode = '22023';
    end if;
  end if;

  update public.orchestration_attempts
  set
    status = 'failed',
    error_code = p_failure_code,
    error_message = p_failure_message,
    retryable = p_failure_retryable,
    failure_details = p_failure_details,
    finished_at = p_now
  where id = saved_attempt.id
  returning * into saved_attempt;

  if p_next_available_at is not null then
    update public.orchestration_jobs
    set
      status = 'queued',
      available_at = p_next_available_at,
      finished_at = null,
      terminal_failure = null,
      updated_at = p_now
    where id = p_job_id
    returning * into saved_job;
  else
    update public.orchestration_jobs
    set
      status = 'failed',
      finished_at = p_now,
      terminal_failure = p_terminal_failure,
      updated_at = p_now
    where id = p_job_id
    returning * into saved_job;
  end if;

  return jsonb_build_object(
    'job', to_jsonb(saved_job),
    'attempt', to_jsonb(saved_attempt)
  );
end;
$$;

revoke all on function public.service_enqueue_durable_orchestration_job(
  uuid, uuid, uuid, uuid, uuid, uuid, text, text, jsonb,
  smallint, smallint, integer, integer, timestamptz
) from public, anon, authenticated;
revoke all on function public.service_claim_orchestration_job(
  uuid, text, uuid, uuid, timestamptz, timestamptz
) from public, anon, authenticated;
revoke all on function public.service_renew_orchestration_lease(
  uuid, uuid, uuid, timestamptz, timestamptz
) from public, anon, authenticated;
revoke all on function public.service_complete_orchestration_attempt(
  uuid, uuid, uuid, jsonb, timestamptz
) from public, anon, authenticated;
revoke all on function public.service_fail_orchestration_attempt(
  uuid, uuid, uuid, smallint, smallint, integer, integer,
  text, text, boolean, jsonb, timestamptz, jsonb, timestamptz
) from public, anon, authenticated;

grant execute on function public.service_enqueue_durable_orchestration_job(
  uuid, uuid, uuid, uuid, uuid, uuid, text, text, jsonb,
  smallint, smallint, integer, integer, timestamptz
) to service_role;
grant execute on function public.service_claim_orchestration_job(
  uuid, text, uuid, uuid, timestamptz, timestamptz
) to service_role;
grant execute on function public.service_renew_orchestration_lease(
  uuid, uuid, uuid, timestamptz, timestamptz
) to service_role;
grant execute on function public.service_complete_orchestration_attempt(
  uuid, uuid, uuid, jsonb, timestamptz
) to service_role;
grant execute on function public.service_fail_orchestration_attempt(
  uuid, uuid, uuid, smallint, smallint, integer, integer,
  text, text, boolean, jsonb, timestamptz, jsonb, timestamptz
) to service_role;

commit;
