begin;

alter table public.github_app_installations
  add column installation_reference_ciphertext text,
  add column installation_reference_digest text,
  alter column installation_id drop not null,
  add constraint github_app_installations_reference_shape check (
    (
      installation_id is not null
      and installation_reference_ciphertext is null
      and installation_reference_digest is null
    )
    or (
      installation_id is null
      and installation_reference_ciphertext is not null
      and installation_reference_ciphertext
        ~ '^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{1,128}\.[A-Za-z0-9_-]{22}$'
      and installation_reference_digest is not null
      and installation_reference_digest ~ '^[0-9a-f]{64}$'
    )
  );

create unique index github_app_installations_reference_digest_unique
on public.github_app_installations(installation_reference_digest)
where installation_reference_digest is not null;

create table public.github_installation_states (
  state_digest bytea primary key
    check (octet_length(state_digest) = 32),
  workspace_id uuid not null
    references public.workspaces(id) on delete cascade,
  user_id uuid not null
    references auth.users(id) on delete cascade,
  phase text not null
    check (phase in ('setup', 'oauth')),
  installation_reference_ciphertext text,
  installation_reference_digest text,
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  check (
    (
      phase = 'setup'
      and installation_reference_ciphertext is null
      and installation_reference_digest is null
    )
    or (
      phase = 'oauth'
      and installation_reference_ciphertext is not null
      and installation_reference_ciphertext
        ~ '^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{1,128}\.[A-Za-z0-9_-]{22}$'
      and installation_reference_digest is not null
      and installation_reference_digest ~ '^[0-9a-f]{64}$'
    )
  ),
  check (expires_at > created_at),
  check (consumed_at is null or consumed_at >= created_at)
);

create index github_installation_states_expiry_idx
on public.github_installation_states(expires_at)
where consumed_at is null;

create or replace function public.service_create_github_installation_state(
  p_workspace_id uuid,
  p_user_id uuid,
  p_state_digest bytea,
  p_phase text,
  p_installation_reference_ciphertext text,
  p_installation_reference_digest text
)
returns public.github_installation_states
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_state public.github_installation_states;
  authorized boolean;
begin
  if p_state_digest is null or octet_length(p_state_digest) <> 32 then
    raise exception 'invalid installation state digest'
      using errcode = '22023';
  end if;
  if p_phase not in ('setup', 'oauth')
    or (
      p_phase = 'setup'
      and (
        p_installation_reference_ciphertext is not null
        or p_installation_reference_digest is not null
      )
    )
    or (
      p_phase = 'oauth'
      and (
        p_installation_reference_ciphertext is null
        or p_installation_reference_ciphertext
          !~ '^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{1,128}\.[A-Za-z0-9_-]{22}$'
        or p_installation_reference_digest is null
        or p_installation_reference_digest !~ '^[0-9a-f]{64}$'
      )
    )
  then
    raise exception 'invalid installation state phase'
      using errcode = '22023';
  end if;

  select exists (
    select 1
    from public.workspaces workspace
    join public.workspace_memberships membership
      on membership.workspace_id = workspace.id
      and membership.user_id = p_user_id
    join auth.users human
      on human.id = membership.user_id
      and human.is_anonymous is false
    where workspace.id = p_workspace_id
      and workspace.status = 'active'
      and membership.status = 'active'
      and membership.role in ('owner', 'admin')
  )
  into authorized;

  if not authorized then
    raise exception 'workspace installation access forbidden'
      using errcode = '42501';
  end if;

  insert into public.github_installation_states(
    state_digest,
    workspace_id,
    user_id,
    phase,
    installation_reference_ciphertext,
    installation_reference_digest,
    expires_at
  )
  values (
    p_state_digest,
    p_workspace_id,
    p_user_id,
    p_phase,
    p_installation_reference_ciphertext,
    p_installation_reference_digest,
    clock_timestamp() + interval '10 minutes'
  )
  returning * into created_state;

  return created_state;
end;
$$;

create or replace function public.service_claim_github_installation_state(
  p_state_digest bytea,
  p_expected_phase text
)
returns public.github_installation_states
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed_state public.github_installation_states;
begin
  if p_state_digest is null
    or octet_length(p_state_digest) <> 32
    or p_expected_phase not in ('setup', 'oauth')
  then
    raise exception 'invalid, expired, or consumed installation state'
      using errcode = 'P0002';
  end if;

  update public.github_installation_states pending
  set consumed_at = clock_timestamp()
  from public.workspaces workspace,
    public.workspace_memberships membership,
    auth.users human
  where pending.state_digest = p_state_digest
    and pending.phase = p_expected_phase
    and pending.consumed_at is null
    and pending.expires_at > clock_timestamp()
    and workspace.id = pending.workspace_id
    and workspace.status = 'active'
    and membership.workspace_id = pending.workspace_id
    and membership.user_id = pending.user_id
    and membership.status = 'active'
    and membership.role in ('owner', 'admin')
    and human.id = pending.user_id
    and human.is_anonymous is false
  returning pending.* into claimed_state;

  if claimed_state.state_digest is null then
    raise exception 'invalid, expired, or consumed installation state'
      using errcode = 'P0002';
  end if;

  return claimed_state;
end;
$$;

create or replace function public.service_complete_github_app_onboarding(
  p_workspace_id uuid,
  p_user_id uuid,
  p_installation_reference_ciphertext text,
  p_installation_reference_digest text,
  p_account_id bigint,
  p_account_login text,
  p_account_type text,
  p_repository_selection text,
  p_installed_at timestamptz,
  p_permissions jsonb,
  p_events text[],
  p_repositories jsonb
)
returns public.github_app_installations
language plpgsql
security definer
set search_path = ''
as $$
declare
  authorized boolean;
  saved_installation public.github_app_installations;
  repository_json jsonb;
  repository_id bigint;
  repository_owner text;
  repository_name text;
  repository_default_branch text;
  selected_repository_ids bigint[] := '{}'::bigint[];
  selected_repository_names text[] := '{}'::text[];
begin
  select exists (
    select 1
    from public.workspaces workspace
    join public.workspace_memberships membership
      on membership.workspace_id = workspace.id
      and membership.user_id = p_user_id
    join auth.users human
      on human.id = membership.user_id
      and human.is_anonymous is false
    where workspace.id = p_workspace_id
      and workspace.status = 'active'
      and membership.status = 'active'
      and membership.role in ('owner', 'admin')
  )
  into authorized;

  if not authorized then
    raise exception 'workspace installation access forbidden'
      using errcode = '42501';
  end if;

  if p_installation_reference_ciphertext is null
    or p_installation_reference_ciphertext
      !~ '^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{1,128}\.[A-Za-z0-9_-]{22}$'
    or p_installation_reference_digest is null
    or p_installation_reference_digest !~ '^[0-9a-f]{64}$'
    or coalesce(p_account_id, 0) <= 0
    or p_account_login is null
    or p_account_login <> btrim(p_account_login)
    or length(p_account_login) not between 1 and 100
    or p_account_login !~ '^[A-Za-z0-9][A-Za-z0-9-]{0,99}$'
    or p_account_type not in ('Organization', 'User')
    or p_repository_selection <> 'selected'
    or p_installed_at is null
    or p_permissions is null
    or jsonb_typeof(p_permissions) <> 'object'
    or p_events is null
    or cardinality(p_events) > 100
    or p_repositories is null
    or jsonb_typeof(p_repositories) <> 'array'
    or jsonb_array_length(p_repositories) not between 1 and 500
  then
    raise exception 'invalid GitHub App onboarding completion'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(p_events) event_name
    where event_name is null
      or event_name !~ '^[a-z][a-z0-9_]{0,79}$'
  ) then
    raise exception 'invalid GitHub App event list'
      using errcode = '22023';
  end if;

  insert into public.github_app_installations(
    workspace_id,
    installation_id,
    installation_reference_ciphertext,
    installation_reference_digest,
    account_id,
    account_login,
    account_type,
    repository_selection,
    installed_at,
    permissions,
    events
  )
  values (
    p_workspace_id,
    null,
    p_installation_reference_ciphertext,
    p_installation_reference_digest,
    p_account_id,
    p_account_login,
    p_account_type,
    p_repository_selection,
    p_installed_at,
    p_permissions,
    p_events
  )
  on conflict (installation_reference_digest)
    where installation_reference_digest is not null
  do update
  set
    installation_reference_ciphertext =
      excluded.installation_reference_ciphertext,
    account_id = excluded.account_id,
    account_login = excluded.account_login,
    account_type = excluded.account_type,
    repository_selection = excluded.repository_selection,
    installed_at = excluded.installed_at,
    permissions = excluded.permissions,
    events = excluded.events,
    status = 'active',
    suspended_at = null,
    updated_at = now()
  where public.github_app_installations.workspace_id = excluded.workspace_id
  returning * into saved_installation;

  if saved_installation.id is null then
    raise exception 'installation belongs to another workspace'
      using errcode = '23505';
  end if;

  for repository_json in
    select value
    from jsonb_array_elements(p_repositories)
  loop
    if jsonb_typeof(repository_json) <> 'object'
      or (
        select count(*)
        from jsonb_object_keys(repository_json)
      ) <> 4
      or repository_json - array[
        'id',
        'owner',
        'name',
        'defaultBranch'
      ]::text[] <> '{}'::jsonb
      or jsonb_typeof(repository_json -> 'id') <> 'number'
      or (repository_json ->> 'id') !~ '^[1-9][0-9]{0,15}$'
      or jsonb_typeof(repository_json -> 'owner') <> 'string'
      or jsonb_typeof(repository_json -> 'name') <> 'string'
      or jsonb_typeof(repository_json -> 'defaultBranch') <> 'string'
    then
      raise exception 'invalid GitHub repository payload'
        using errcode = '22023';
    end if;

    repository_id := (repository_json ->> 'id')::bigint;
    repository_owner := repository_json ->> 'owner';
    repository_name := repository_json ->> 'name';
    repository_default_branch := repository_json ->> 'defaultBranch';

    if repository_owner <> btrim(repository_owner)
      or repository_owner
        !~ '^[A-Za-z0-9][A-Za-z0-9-]{0,99}$'
      or repository_name <> btrim(repository_name)
      or length(repository_name) not between 1 and 100
      or repository_name ~ '[[:cntrl:]/]'
      or repository_default_branch <> btrim(repository_default_branch)
      or length(repository_default_branch) not between 1 and 255
      or repository_default_branch ~ '[[:cntrl:]]'
      or repository_id = any(selected_repository_ids)
      or lower(repository_owner || '/' || repository_name)
        = any(selected_repository_names)
    then
      raise exception 'invalid GitHub repository payload'
        using errcode = '22023';
    end if;

    perform public.service_register_repository(
      p_workspace_id,
      saved_installation.id,
      repository_id,
      repository_owner,
      repository_name,
      repository_default_branch
    );
    selected_repository_ids :=
      array_append(selected_repository_ids, repository_id);
    selected_repository_names :=
      array_append(
        selected_repository_names,
        lower(repository_owner || '/' || repository_name)
      );
  end loop;

  update public.repositories repository
  set
    status = 'disabled',
    updated_at = now()
  where repository.workspace_id = p_workspace_id
    and repository.github_installation_id = saved_installation.id
    and not (
      repository.github_repository_id = any(selected_repository_ids)
    );

  perform public.service_append_workspace_audit_log(
    p_workspace_id,
    'user',
    'github_app.installation_connected',
    'github_app_installation',
    p_user_id,
    null,
    saved_installation.id::text,
    null,
    jsonb_build_object(
      'accountLogin',
      p_account_login,
      'repositoryCount',
      cardinality(selected_repository_ids)
    )
  );

  return saved_installation;
end;
$$;

alter table public.github_installation_states enable row level security;
alter table public.github_installation_states force row level security;

revoke all on table public.github_installation_states from public, anon, authenticated, service_role;
grant select on table public.github_installation_states
  to service_role;

revoke all on function public.service_create_github_installation_state(
  uuid,
  uuid,
  bytea,
  text,
  text,
  text
) from public, anon, authenticated;
revoke all on function public.service_claim_github_installation_state(
  bytea,
  text
) from public, anon, authenticated;
revoke all on function public.service_complete_github_app_onboarding(
  uuid,
  uuid,
  text,
  text,
  bigint,
  text,
  text,
  text,
  timestamptz,
  jsonb,
  text[],
  jsonb
) from public, anon, authenticated;
revoke execute on function public.service_register_github_installation(
  uuid,
  bigint,
  bigint,
  text,
  text,
  text,
  timestamptz,
  jsonb,
  text[],
  uuid
) from service_role;

grant execute on function public.service_create_github_installation_state(
  uuid,
  uuid,
  bytea,
  text,
  text,
  text
) to service_role;
grant execute on function public.service_claim_github_installation_state(
  bytea,
  text
) to service_role;
grant execute on function public.service_complete_github_app_onboarding(
  uuid,
  uuid,
  text,
  text,
  bigint,
  text,
  text,
  text,
  timestamptz,
  jsonb,
  text[],
  jsonb
) to service_role;

commit;
