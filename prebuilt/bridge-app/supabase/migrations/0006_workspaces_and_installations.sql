begin;

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null
    check (slug = lower(slug) and slug ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$'),
  name text not null
    check (name = btrim(name) and length(name) between 1 and 120),
  status text not null default 'active'
    check (status in ('active', 'suspended', 'closed')),
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspace_memberships (
  workspace_id uuid not null
    references public.workspaces(id) on delete cascade,
  user_id uuid not null
    references auth.users(id) on delete cascade,
  role text not null
    check (role in ('owner', 'admin', 'engineer', 'viewer', 'auditor')),
  status text not null default 'active'
    check (status in ('active', 'invited', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table public.secret_references (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null
    references public.workspaces(id) on delete cascade,
  purpose text not null
    check (purpose = btrim(purpose) and length(purpose) between 1 and 80),
  secret_provider text not null
    check (
      secret_provider in (
        'supabase_vault',
        'aws_secrets_manager',
        'gcp_secret_manager',
        'azure_key_vault',
        'onepassword_connect',
        'external'
      )
    ),
  secret_locator text not null
    check (
      secret_locator = btrim(secret_locator)
      and length(secret_locator) between 1 and 500
    ),
  key_version text,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  last_rotated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  unique (workspace_id, purpose, secret_provider, secret_locator)
);

create table public.github_app_installations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null
    references public.workspaces(id) on delete cascade,
  installation_id bigint unique not null
    check (installation_id > 0),
  account_id bigint not null
    check (account_id > 0),
  account_login text not null,
  account_type text not null
    check (account_type in ('Organization', 'User')),
  repository_selection text not null
    check (repository_selection in ('all', 'selected')),
  permissions jsonb not null default '{}'::jsonb
    check (jsonb_typeof(permissions) = 'object'),
  events text[] not null default '{}'::text[],
  credential_reference_id uuid,
  status text not null default 'active'
    check (status in ('active', 'suspended', 'deleted')),
  installed_at timestamptz not null,
  suspended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  foreign key (workspace_id, credential_reference_id)
    references public.secret_references(workspace_id, id)
);

create table public.provider_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null
    references public.workspaces(id) on delete cascade,
  provider_key text not null
    check (provider_key = lower(provider_key) and length(provider_key) between 1 and 80),
  external_account_id text not null
    check (length(btrim(external_account_id)) between 1 and 200),
  display_name text not null
    check (length(btrim(display_name)) between 1 and 120),
  credential_reference_id uuid,
  configuration jsonb not null default '{}'::jsonb
    check (jsonb_typeof(configuration) = 'object'),
  status text not null default 'active'
    check (status in ('active', 'degraded', 'revoked')),
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  unique (workspace_id, provider_key, external_account_id),
  foreign key (workspace_id, credential_reference_id)
    references public.secret_references(workspace_id, id)
);

-- Existing demo repositories are isolated in an unowned workspace before the
-- tenant column becomes mandatory. No authenticated identity can read it.
insert into public.workspaces(id, slug, name, status)
values (
  '00000000-0000-4000-8000-000000000006',
  'legacy-quarantine',
  'Legacy quarantined data',
  'suspended'
)
on conflict (id) do nothing;

alter table public.repositories
  add column workspace_id uuid
    references public.workspaces(id) on delete restrict,
  add column github_installation_id uuid,
  add column github_repository_id bigint,
  add column full_name text,
  add column status text not null default 'active'
    check (status in ('active', 'archived', 'disabled')),
  add column updated_at timestamptz not null default now();

update public.repositories
set
  workspace_id = '00000000-0000-4000-8000-000000000006',
  full_name = owner || '/' || name
where workspace_id is null;

alter table public.repositories
  alter column workspace_id set not null,
  alter column full_name set not null,
  add constraint repositories_github_id_positive
    check (github_repository_id is null or github_repository_id > 0),
  add constraint repositories_workspace_identity_unique
    unique (workspace_id, owner, name),
  add constraint repositories_workspace_id_pair_unique
    unique (workspace_id, id),
  add constraint repositories_workspace_installation_fk
    foreign key (workspace_id, github_installation_id)
    references public.github_app_installations(workspace_id, id);

create table public.migration_recipes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null
    references public.workspaces(id) on delete cascade,
  recipe_key text not null
    check (recipe_key = lower(recipe_key) and length(recipe_key) between 1 and 120),
  version integer not null
    check (version > 0),
  provider_key text not null,
  change_kind text not null,
  language text not null,
  manifest jsonb not null
    check (jsonb_typeof(manifest) = 'object'),
  artifact_digest text not null
    check (artifact_digest ~ '^[0-9a-f]{64}$'),
  status text not null default 'draft'
    check (status in ('draft', 'active', 'retired')),
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  unique (workspace_id, recipe_key, version)
);

create table public.webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null
    references public.workspaces(id) on delete cascade,
  source text not null
    check (length(btrim(source)) between 1 and 80),
  delivery_id text not null
    check (length(btrim(delivery_id)) between 1 and 250),
  event_type text not null
    check (length(btrim(event_type)) between 1 and 120),
  github_installation_id uuid,
  provider_connection_id uuid,
  payload_digest text not null
    check (payload_digest ~ '^[0-9a-f]{64}$'),
  sanitized_payload jsonb not null default '{}'::jsonb
    check (jsonb_typeof(sanitized_payload) = 'object'),
  status text not null default 'accepted'
    check (status in ('accepted', 'processing', 'processed', 'failed', 'ignored')),
  attempt_count integer not null default 0
    check (attempt_count >= 0),
  error_code text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (workspace_id, id),
  unique (workspace_id, source, delivery_id),
  check (num_nonnulls(github_installation_id, provider_connection_id) <= 1),
  foreign key (workspace_id, github_installation_id)
    references public.github_app_installations(workspace_id, id),
  foreign key (workspace_id, provider_connection_id)
    references public.provider_connections(workspace_id, id)
);

create table public.orchestration_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null
    references public.workspaces(id) on delete cascade,
  repository_id uuid not null,
  recipe_id uuid,
  provider_connection_id uuid,
  source_delivery_id uuid,
  idempotency_key text not null
    check (length(btrim(idempotency_key)) between 8 and 250),
  job_type text not null
    check (length(btrim(job_type)) between 1 and 80),
  request_summary jsonb not null default '{}'::jsonb
    check (jsonb_typeof(request_summary) = 'object'),
  status text not null default 'queued'
    check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  priority smallint not null default 100
    check (priority between 0 and 1000),
  max_attempts smallint not null default 3
    check (max_attempts between 1 and 20),
  available_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  unique (workspace_id, idempotency_key),
  foreign key (workspace_id, repository_id)
    references public.repositories(workspace_id, id),
  foreign key (workspace_id, recipe_id)
    references public.migration_recipes(workspace_id, id),
  foreign key (workspace_id, provider_connection_id)
    references public.provider_connections(workspace_id, id),
  foreign key (workspace_id, source_delivery_id)
    references public.webhook_deliveries(workspace_id, id)
);

create table public.orchestration_attempts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null
    references public.workspaces(id) on delete cascade,
  job_id uuid not null,
  attempt_number smallint not null
    check (attempt_number > 0),
  worker_id text not null
    check (length(btrim(worker_id)) between 1 and 160),
  status text not null default 'running'
    check (status in ('running', 'succeeded', 'failed', 'cancelled')),
  result_summary jsonb not null default '{}'::jsonb
    check (jsonb_typeof(result_summary) = 'object'),
  error_code text,
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  unique (workspace_id, id),
  unique (job_id, attempt_number),
  foreign key (workspace_id, job_id)
    references public.orchestration_jobs(workspace_id, id)
    on delete cascade
);

create table public.workspace_audit_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null
    references public.workspaces(id) on delete cascade,
  actor_kind text not null
    check (actor_kind in ('user', 'service', 'github_app', 'provider', 'system')),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_external_id text,
  action text not null
    check (length(btrim(action)) between 1 and 160),
  target_type text not null
    check (length(btrim(target_type)) between 1 and 100),
  target_id text,
  request_id text,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index workspace_memberships_user_idx
  on public.workspace_memberships(user_id, workspace_id)
  where status = 'active';
create index repositories_workspace_idx
  on public.repositories(workspace_id, status);
create index webhook_deliveries_status_idx
  on public.webhook_deliveries(workspace_id, status, received_at);
create index orchestration_jobs_queue_idx
  on public.orchestration_jobs(status, available_at, priority, created_at)
  where status = 'queued';
create index orchestration_attempts_job_idx
  on public.orchestration_attempts(workspace_id, job_id, attempt_number);
create index workspace_audit_logs_timeline_idx
  on public.workspace_audit_logs(workspace_id, occurred_at desc);

create or replace function public.is_workspace_member(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_memberships membership
    where membership.workspace_id = p_workspace_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
  );
$$;

create or replace function public.has_workspace_role(
  p_workspace_id uuid,
  p_roles text[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_memberships membership
    where membership.workspace_id = p_workspace_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
      and membership.role = any(p_roles)
  );
$$;

create or replace function public.ensure_workspace_has_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_workspace_id uuid;
begin
  affected_workspace_id := coalesce(new.workspace_id, old.workspace_id);
  if not exists (
    select 1
    from public.workspace_memberships membership
    where membership.workspace_id = affected_workspace_id
      and membership.role = 'owner'
      and membership.status = 'active'
  ) then
    raise exception 'workspace requires an active owner'
      using errcode = '23514';
  end if;
  return coalesce(new, old);
end;
$$;

create constraint trigger workspace_requires_owner
after insert or update or delete on public.workspace_memberships
deferrable initially deferred
for each row execute function public.ensure_workspace_has_owner();

create or replace function public.service_create_workspace(
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
  insert into public.workspaces(name, slug, created_by_user_id)
  values (btrim(p_name), lower(btrim(p_slug)), p_owner_user_id)
  returning * into created_workspace;

  insert into public.workspace_memberships(workspace_id, user_id, role, status)
  values (created_workspace.id, p_owner_user_id, 'owner', 'active');

  return created_workspace;
end;
$$;

create or replace function public.service_set_workspace_membership(
  p_workspace_id uuid,
  p_user_id uuid,
  p_role text,
  p_status text
)
returns public.workspace_memberships
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_membership public.workspace_memberships;
begin
  insert into public.workspace_memberships(
    workspace_id,
    user_id,
    role,
    status
  )
  values (p_workspace_id, p_user_id, p_role, p_status)
  on conflict (workspace_id, user_id) do update
  set
    role = excluded.role,
    status = excluded.status,
    updated_at = now()
  returning * into saved_membership;

  return saved_membership;
end;
$$;

create or replace function public.service_store_secret_reference(
  p_workspace_id uuid,
  p_purpose text,
  p_secret_provider text,
  p_secret_locator text,
  p_key_version text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns public.secret_references
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_reference public.secret_references;
begin
  insert into public.secret_references(
    workspace_id,
    purpose,
    secret_provider,
    secret_locator,
    key_version,
    metadata
  )
  values (
    p_workspace_id,
    btrim(p_purpose),
    p_secret_provider,
    btrim(p_secret_locator),
    p_key_version,
    coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (workspace_id, purpose, secret_provider, secret_locator) do update
  set
    key_version = excluded.key_version,
    metadata = excluded.metadata,
    updated_at = now()
  returning * into saved_reference;

  return saved_reference;
end;
$$;

create or replace function public.service_register_github_installation(
  p_workspace_id uuid,
  p_installation_id bigint,
  p_account_id bigint,
  p_account_login text,
  p_account_type text,
  p_repository_selection text,
  p_installed_at timestamptz,
  p_permissions jsonb default '{}'::jsonb,
  p_events text[] default '{}'::text[],
  p_credential_reference_id uuid default null
)
returns public.github_app_installations
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_installation public.github_app_installations;
begin
  insert into public.github_app_installations(
    workspace_id,
    installation_id,
    account_id,
    account_login,
    account_type,
    repository_selection,
    installed_at,
    permissions,
    events,
    credential_reference_id
  )
  values (
    p_workspace_id,
    p_installation_id,
    p_account_id,
    btrim(p_account_login),
    p_account_type,
    p_repository_selection,
    p_installed_at,
    coalesce(p_permissions, '{}'::jsonb),
    coalesce(p_events, '{}'::text[]),
    p_credential_reference_id
  )
  on conflict (installation_id) do update
  set
    account_id = excluded.account_id,
    account_login = excluded.account_login,
    account_type = excluded.account_type,
    repository_selection = excluded.repository_selection,
    installed_at = excluded.installed_at,
    permissions = excluded.permissions,
    events = excluded.events,
    credential_reference_id = excluded.credential_reference_id,
    status = 'active',
    suspended_at = null,
    updated_at = now()
  where public.github_app_installations.workspace_id = excluded.workspace_id
  returning * into saved_installation;

  if saved_installation.id is null then
    raise exception 'installation belongs to another workspace'
      using errcode = '23505';
  end if;
  return saved_installation;
end;
$$;

create or replace function public.service_upsert_provider_connection(
  p_workspace_id uuid,
  p_provider_key text,
  p_external_account_id text,
  p_display_name text,
  p_credential_reference_id uuid default null,
  p_configuration jsonb default '{}'::jsonb
)
returns public.provider_connections
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_connection public.provider_connections;
begin
  insert into public.provider_connections(
    workspace_id,
    provider_key,
    external_account_id,
    display_name,
    credential_reference_id,
    configuration
  )
  values (
    p_workspace_id,
    lower(btrim(p_provider_key)),
    btrim(p_external_account_id),
    btrim(p_display_name),
    p_credential_reference_id,
    coalesce(p_configuration, '{}'::jsonb)
  )
  on conflict (workspace_id, provider_key, external_account_id) do update
  set
    display_name = excluded.display_name,
    credential_reference_id = excluded.credential_reference_id,
    configuration = excluded.configuration,
    status = 'active',
    updated_at = now()
  returning * into saved_connection;

  return saved_connection;
end;
$$;

create or replace function public.service_register_repository(
  p_workspace_id uuid,
  p_github_installation_id uuid,
  p_github_repository_id bigint,
  p_owner text,
  p_name text,
  p_default_branch text
)
returns public.repositories
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_repository public.repositories;
begin
  insert into public.repositories(
    workspace_id,
    github_installation_id,
    github_repository_id,
    owner,
    name,
    full_name,
    default_branch
  )
  values (
    p_workspace_id,
    p_github_installation_id,
    p_github_repository_id,
    btrim(p_owner),
    btrim(p_name),
    btrim(p_owner) || '/' || btrim(p_name),
    btrim(p_default_branch)
  )
  on conflict (workspace_id, owner, name) do update
  set
    github_installation_id = excluded.github_installation_id,
    github_repository_id = excluded.github_repository_id,
    full_name = excluded.full_name,
    default_branch = excluded.default_branch,
    status = 'active',
    updated_at = now()
  returning * into saved_repository;

  return saved_repository;
end;
$$;

create or replace function public.service_register_recipe(
  p_workspace_id uuid,
  p_recipe_key text,
  p_version integer,
  p_provider_key text,
  p_change_kind text,
  p_language text,
  p_manifest jsonb,
  p_artifact_digest text,
  p_created_by_user_id uuid default null
)
returns public.migration_recipes
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_recipe public.migration_recipes;
begin
  insert into public.migration_recipes(
    workspace_id,
    recipe_key,
    version,
    provider_key,
    change_kind,
    language,
    manifest,
    artifact_digest,
    created_by_user_id
  )
  values (
    p_workspace_id,
    lower(btrim(p_recipe_key)),
    p_version,
    lower(btrim(p_provider_key)),
    btrim(p_change_kind),
    lower(btrim(p_language)),
    p_manifest,
    p_artifact_digest,
    p_created_by_user_id
  )
  on conflict (workspace_id, recipe_key, version) do update
  set
    manifest = excluded.manifest,
    artifact_digest = excluded.artifact_digest,
    status = excluded.status,
    updated_at = now()
  returning * into saved_recipe;

  return saved_recipe;
end;
$$;

create or replace function public.service_record_webhook_delivery(
  p_workspace_id uuid,
  p_source text,
  p_delivery_id text,
  p_event_type text,
  p_payload_digest text,
  p_github_installation_id uuid default null,
  p_provider_connection_id uuid default null,
  p_sanitized_payload jsonb default '{}'::jsonb
)
returns public.webhook_deliveries
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_delivery public.webhook_deliveries;
begin
  insert into public.webhook_deliveries(
    workspace_id,
    source,
    delivery_id,
    event_type,
    payload_digest,
    github_installation_id,
    provider_connection_id,
    sanitized_payload
  )
  values (
    p_workspace_id,
    btrim(p_source),
    btrim(p_delivery_id),
    btrim(p_event_type),
    p_payload_digest,
    p_github_installation_id,
    p_provider_connection_id,
    coalesce(p_sanitized_payload, '{}'::jsonb)
  )
  on conflict (workspace_id, source, delivery_id) do nothing
  returning * into saved_delivery;

  if saved_delivery.id is null then
    select *
    into saved_delivery
    from public.webhook_deliveries delivery
    where delivery.workspace_id = p_workspace_id
      and delivery.source = btrim(p_source)
      and delivery.delivery_id = btrim(p_delivery_id);

    if saved_delivery.payload_digest <> p_payload_digest then
      raise exception 'delivery id reused with different payload'
        using errcode = '23505';
    end if;
  end if;
  return saved_delivery;
end;
$$;

create or replace function public.service_update_webhook_delivery(
  p_delivery_id uuid,
  p_status text,
  p_error_code text default null
)
returns public.webhook_deliveries
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_delivery public.webhook_deliveries;
begin
  if p_status not in ('processing', 'processed', 'failed', 'ignored') then
    raise exception 'invalid delivery status'
      using errcode = '22023';
  end if;

  update public.webhook_deliveries delivery
  set
    status = p_status,
    attempt_count = delivery.attempt_count + 1,
    error_code = p_error_code,
    processed_at = case
      when p_status in ('processed', 'failed', 'ignored') then now()
      else null
    end
  where delivery.id = p_delivery_id
  returning * into saved_delivery;

  if saved_delivery.id is null then
    raise exception 'delivery not found'
      using errcode = 'P0002';
  end if;
  return saved_delivery;
end;
$$;

create or replace function public.service_enqueue_orchestration_job(
  p_workspace_id uuid,
  p_repository_id uuid,
  p_idempotency_key text,
  p_job_type text,
  p_recipe_id uuid default null,
  p_provider_connection_id uuid default null,
  p_source_delivery_id uuid default null,
  p_request_summary jsonb default '{}'::jsonb,
  p_priority smallint default 100,
  p_max_attempts smallint default 3
)
returns public.orchestration_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_job public.orchestration_jobs;
begin
  insert into public.orchestration_jobs(
    workspace_id,
    repository_id,
    recipe_id,
    provider_connection_id,
    source_delivery_id,
    idempotency_key,
    job_type,
    request_summary,
    priority,
    max_attempts
  )
  values (
    p_workspace_id,
    p_repository_id,
    p_recipe_id,
    p_provider_connection_id,
    p_source_delivery_id,
    btrim(p_idempotency_key),
    btrim(p_job_type),
    coalesce(p_request_summary, '{}'::jsonb),
    p_priority,
    p_max_attempts
  )
  on conflict (workspace_id, idempotency_key) do nothing
  returning * into saved_job;

  if saved_job.id is null then
    select *
    into saved_job
    from public.orchestration_jobs job
    where job.workspace_id = p_workspace_id
      and job.idempotency_key = btrim(p_idempotency_key);
  end if;
  return saved_job;
end;
$$;

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
  saved_attempt public.orchestration_attempts;
begin
  if p_status not in ('succeeded', 'failed', 'cancelled') then
    raise exception 'invalid terminal attempt status'
      using errcode = '22023';
  end if;

  update public.orchestration_attempts attempt
  set
    status = p_status,
    result_summary = coalesce(p_result_summary, '{}'::jsonb),
    error_code = p_error_code,
    error_message = p_error_message,
    finished_at = now()
  where attempt.id = p_attempt_id
    and attempt.status = 'running'
  returning * into saved_attempt;

  if saved_attempt.id is null then
    raise exception 'running orchestration attempt not found'
      using errcode = 'P0002';
  end if;

  update public.orchestration_jobs
  set
    status = p_status,
    finished_at = now(),
    updated_at = now()
  where id = saved_attempt.job_id;

  return saved_attempt;
end;
$$;

create or replace function public.service_append_workspace_audit_log(
  p_workspace_id uuid,
  p_actor_kind text,
  p_action text,
  p_target_type text,
  p_actor_user_id uuid default null,
  p_actor_external_id text default null,
  p_target_id text default null,
  p_request_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns public.workspace_audit_logs
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_log public.workspace_audit_logs;
begin
  insert into public.workspace_audit_logs(
    workspace_id,
    actor_kind,
    actor_user_id,
    actor_external_id,
    action,
    target_type,
    target_id,
    request_id,
    metadata
  )
  values (
    p_workspace_id,
    p_actor_kind,
    p_actor_user_id,
    p_actor_external_id,
    btrim(p_action),
    btrim(p_target_type),
    p_target_id,
    p_request_id,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning * into created_log;

  return created_log;
end;
$$;

alter table public.workspaces enable row level security;
alter table public.workspaces force row level security;
alter table public.workspace_memberships enable row level security;
alter table public.workspace_memberships force row level security;
alter table public.secret_references enable row level security;
alter table public.secret_references force row level security;
alter table public.github_app_installations enable row level security;
alter table public.github_app_installations force row level security;
alter table public.provider_connections enable row level security;
alter table public.provider_connections force row level security;
alter table public.repositories enable row level security;
alter table public.repositories force row level security;
alter table public.migration_recipes enable row level security;
alter table public.migration_recipes force row level security;
alter table public.webhook_deliveries enable row level security;
alter table public.webhook_deliveries force row level security;
alter table public.orchestration_jobs enable row level security;
alter table public.orchestration_jobs force row level security;
alter table public.orchestration_attempts enable row level security;
alter table public.orchestration_attempts force row level security;
alter table public.workspace_audit_logs enable row level security;
alter table public.workspace_audit_logs force row level security;

revoke all on table
  public.workspaces,
  public.workspace_memberships,
  public.secret_references,
  public.github_app_installations,
  public.provider_connections,
  public.repositories,
  public.migration_recipes,
  public.webhook_deliveries,
  public.orchestration_jobs,
  public.orchestration_attempts,
  public.workspace_audit_logs
from anon, authenticated, service_role;

grant select on table
  public.workspaces,
  public.workspace_memberships,
  public.github_app_installations,
  public.provider_connections,
  public.repositories,
  public.migration_recipes,
  public.webhook_deliveries,
  public.orchestration_jobs,
  public.orchestration_attempts
to authenticated;

grant select on table
  public.workspaces,
  public.workspace_memberships,
  public.secret_references,
  public.github_app_installations,
  public.provider_connections,
  public.repositories,
  public.migration_recipes,
  public.webhook_deliveries,
  public.orchestration_jobs,
  public.orchestration_attempts,
  public.workspace_audit_logs
to service_role;

revoke all on function public.is_workspace_member(uuid)
  from public, anon;
revoke all on function public.has_workspace_role(uuid, text[])
  from public, anon;
revoke all on function public.ensure_workspace_has_owner()
  from public, anon, authenticated, service_role;
grant execute on function public.is_workspace_member(uuid)
  to authenticated, service_role;
grant execute on function public.has_workspace_role(uuid, text[])
  to authenticated, service_role;

drop policy if exists bridge_participant_read on public.repositories;
drop policy if exists workspace_member_read on public.workspaces;
create policy workspace_member_read
on public.workspaces
for select
to authenticated
using (public.is_workspace_member(workspaces.id));

create policy workspace_membership_read
on public.workspace_memberships
for select
to authenticated
using (public.is_workspace_member(workspace_memberships.workspace_id));

create policy workspace_secret_reference_admin_read
on public.secret_references
for select
to authenticated
using (
  public.has_workspace_role(
    secret_references.workspace_id,
    array['owner', 'admin']
  )
);

create policy workspace_installation_read
on public.github_app_installations
for select
to authenticated
using (public.is_workspace_member(github_app_installations.workspace_id));

create policy workspace_provider_connection_read
on public.provider_connections
for select
to authenticated
using (public.is_workspace_member(provider_connections.workspace_id));

create policy workspace_repository_read
on public.repositories
for select
to authenticated
using (public.is_workspace_member(repositories.workspace_id));

create policy workspace_recipe_read
on public.migration_recipes
for select
to authenticated
using (public.is_workspace_member(migration_recipes.workspace_id));

create policy workspace_webhook_delivery_read
on public.webhook_deliveries
for select
to authenticated
using (public.is_workspace_member(webhook_deliveries.workspace_id));

create policy workspace_orchestration_job_read
on public.orchestration_jobs
for select
to authenticated
using (public.is_workspace_member(orchestration_jobs.workspace_id));

create policy workspace_orchestration_attempt_read
on public.orchestration_attempts
for select
to authenticated
using (public.is_workspace_member(orchestration_attempts.workspace_id));

create policy workspace_audit_admin_read
on public.workspace_audit_logs
for select
to authenticated
using (
  public.has_workspace_role(
    workspace_audit_logs.workspace_id,
    array['owner', 'admin', 'auditor']
  )
);

revoke all on function public.service_create_workspace(text, text, uuid)
  from public, anon, authenticated;
revoke all on function public.service_set_workspace_membership(uuid, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.service_store_secret_reference(uuid, text, text, text, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.service_register_github_installation(uuid, bigint, bigint, text, text, text, timestamptz, jsonb, text[], uuid)
  from public, anon, authenticated;
revoke all on function public.service_upsert_provider_connection(uuid, text, text, text, uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.service_register_repository(uuid, uuid, bigint, text, text, text)
  from public, anon, authenticated;
revoke all on function public.service_register_recipe(uuid, text, integer, text, text, text, jsonb, text, uuid)
  from public, anon, authenticated;
revoke all on function public.service_record_webhook_delivery(uuid, text, text, text, text, uuid, uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.service_update_webhook_delivery(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.service_enqueue_orchestration_job(uuid, uuid, text, text, uuid, uuid, uuid, jsonb, smallint, smallint)
  from public, anon, authenticated;
revoke all on function public.service_start_orchestration_attempt(uuid, text)
  from public, anon, authenticated;
revoke all on function public.service_finish_orchestration_attempt(uuid, text, jsonb, text, text)
  from public, anon, authenticated;
revoke all on function public.service_append_workspace_audit_log(uuid, text, text, text, uuid, text, text, text, jsonb)
  from public, anon, authenticated;

grant execute on function public.service_create_workspace(text, text, uuid)
  to service_role;
grant execute on function public.service_set_workspace_membership(uuid, uuid, text, text)
  to service_role;
grant execute on function public.service_store_secret_reference(uuid, text, text, text, text, jsonb)
  to service_role;
grant execute on function public.service_register_github_installation(uuid, bigint, bigint, text, text, text, timestamptz, jsonb, text[], uuid)
  to service_role;
grant execute on function public.service_upsert_provider_connection(uuid, text, text, text, uuid, jsonb)
  to service_role;
grant execute on function public.service_register_repository(uuid, uuid, bigint, text, text, text)
  to service_role;
grant execute on function public.service_register_recipe(uuid, text, integer, text, text, text, jsonb, text, uuid)
  to service_role;
grant execute on function public.service_record_webhook_delivery(uuid, text, text, text, text, uuid, uuid, jsonb)
  to service_role;
grant execute on function public.service_update_webhook_delivery(uuid, text, text)
  to service_role;
grant execute on function public.service_enqueue_orchestration_job(uuid, uuid, text, text, uuid, uuid, uuid, jsonb, smallint, smallint)
  to service_role;
grant execute on function public.service_start_orchestration_attempt(uuid, text)
  to service_role;
grant execute on function public.service_finish_orchestration_attempt(uuid, text, jsonb, text, text)
  to service_role;
grant execute on function public.service_append_workspace_audit_log(uuid, text, text, text, uuid, text, text, text, jsonb)
  to service_role;

commit;
