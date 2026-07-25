import { spawn } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const runDatabaseTests = process.env.BRIDGE_RUN_DATABASE_TESTS === "1";
const migrationsDirectory = fileURLToPath(
  new URL("../../../supabase/migrations/", import.meta.url),
);

type CommandResult = {
  stdout: string;
  stderr: string;
};

async function runCommand(
  command: string,
  args: string[],
  input?: string,
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(
        new Error(
          [
            `${command} ${args.join(" ")} exited with ${code}`,
            stdout,
            stderr,
          ]
            .filter(Boolean)
            .join("\n"),
        ),
      );
    });

    child.stdin.end(input);
  });
}

async function waitForPostgres(containerName: string): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const logs = await runCommand("docker", ["logs", containerName]);
      if (
        !`${logs.stdout}\n${logs.stderr}`.includes(
          "PostgreSQL init process complete",
        )
      ) {
        throw new Error("Postgres image initialization is still running");
      }
      await runCommand("docker", [
        "exec",
        containerName,
        "pg_isready",
        "-U",
        "postgres",
        "-d",
        "bridge_test",
      ]);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  throw new Error("disposable Postgres did not become ready");
}

async function runSql(containerName: string, sql: string): Promise<void> {
  await runCommand(
    "docker",
    [
      "exec",
      "-i",
      containerName,
      "psql",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      "bridge_test",
    ],
    sql,
  );
}

const supabaseBootstrapSql = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
create table auth.users (
  id uuid primary key,
  is_anonymous boolean not null default false
);
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create schema realtime;
create table realtime.messages (
  id uuid primary key,
  extension text not null
);
alter table realtime.messages enable row level security;
create or replace function realtime.topic()
returns text
language sql
stable
as $$
  select current_setting('realtime.topic', true);
$$;
create publication supabase_realtime;

create schema bridge_test;
create or replace function bridge_test.assert_true(
  condition boolean,
  failure_message text
)
returns void
language plpgsql
as $$
begin
  if condition is not true then
    raise exception 'assertion failed: %', failure_message;
  end if;
end;
$$;

grant usage on schema public, auth, realtime, bridge_test
  to anon, authenticated, service_role;
grant execute on function bridge_test.assert_true(boolean, text)
  to anon, authenticated, service_role;
grant select, insert on realtime.messages to authenticated;
`;

const tenantIsolationSql = `
insert into auth.users(id, is_anonymous)
values
  ('11111111-1111-4111-8111-111111111111', false),
  ('22222222-2222-4222-8222-222222222222', false),
  ('33333333-3333-4333-8333-333333333333', false),
  ('44444444-4444-4444-8444-444444444444', false),
  ('55555555-5555-4555-8555-555555555555', true),
  ('66666666-6666-4666-8666-666666666666', true);

insert into public.participants(user_id, display_name, role)
values
  (
    '55555555-5555-4555-8555-555555555555',
    'Existing reviewer',
    'customer'
  ),
  (
    '66666666-6666-4666-8666-666666666666',
    'Existing reviewer',
    'customer'
  );

create or replace function bridge_test.reject_workspace_created_audit()
returns trigger
language plpgsql
as $$
begin
  if new.action = 'workspace.created'
    and new.metadata ->> 'slug' = 'rollback-team'
  then
    raise exception 'test audit rejection'
      using errcode = 'PT001';
  end if;
  return new;
end;
$$;

create trigger bridge_test_reject_workspace_created_audit
before insert on public.workspace_audit_logs
for each row execute function bridge_test.reject_workspace_created_audit();

set role service_role;

do $$
begin
  perform public.service_create_workspace_with_audit(
    'Rollback Team',
    'rollback-team',
    '11111111-1111-4111-8111-111111111111'
  );
  raise exception 'audit rejection did not abort workspace creation';
exception
  when sqlstate 'PT001' then null;
end;
$$;

reset role;

select bridge_test.assert_true(
  not exists (
    select 1 from public.workspaces where slug = 'rollback-team'
  ),
  'audit failure must roll back workspace creation'
);
select bridge_test.assert_true(
  not exists (
    select 1
    from public.workspace_memberships membership
    join public.workspaces workspace on workspace.id = membership.workspace_id
    where workspace.slug = 'rollback-team'
  ),
  'audit failure must roll back owner membership creation'
);

drop trigger bridge_test_reject_workspace_created_audit
on public.workspace_audit_logs;
drop function bridge_test.reject_workspace_created_audit();

create or replace function bridge_test.reject_github_onboarding_audit()
returns trigger
language plpgsql
as $$
begin
  if new.action = 'github_app.installation_connected'
    and new.metadata ->> 'accountLogin' = 'rollback-org'
  then
    raise exception 'test onboarding audit rejection'
      using errcode = 'PT002';
  end if;
  return new;
end;
$$;

create trigger bridge_test_reject_github_onboarding_audit
before insert on public.workspace_audit_logs
for each row execute function bridge_test.reject_github_onboarding_audit();

set role service_role;

select public.service_create_workspace_with_audit(
  'Alpha Team',
  'alpha-team',
  '11111111-1111-4111-8111-111111111111'
);
select public.service_create_workspace_with_audit(
  'Beta Team',
  'beta-team',
  '22222222-2222-4222-8222-222222222222'
);

do $$
begin
  perform public.service_complete_github_app_onboarding(
    p_workspace_id =>
      (select id from public.workspaces where slug = 'alpha-team'),
    p_user_id => '11111111-1111-4111-8111-111111111111',
    p_installation_reference_ciphertext =>
      'v1.AAAAAAAAAAAAAAAA.YWJj.AAAAAAAAAAAAAAAAAAAAAA',
    p_installation_reference_digest => repeat('3', 64),
    p_account_id => 2003,
    p_account_login => 'rollback-org',
    p_account_type => 'Organization',
    p_repository_selection => 'selected',
    p_installed_at => now(),
    p_permissions => '{}'::jsonb,
    p_events => array['installation'],
    p_repositories =>
      '[{"id":3003,"owner":"rollback-org","name":"rollback","defaultBranch":"main"}]'::jsonb
  );
  raise exception 'audit rejection did not abort GitHub onboarding';
exception
  when sqlstate 'PT002' then null;
end;
$$;

reset role;

select bridge_test.assert_true(
  not exists (
    select 1
    from public.github_app_installations
    where installation_reference_digest = repeat('3', 64)
  ),
  'audit failure must roll back GitHub installation persistence'
);
select bridge_test.assert_true(
  not exists (
    select 1
    from public.repositories
    where full_name = 'rollback-org/rollback'
  ),
  'audit failure must roll back GitHub repository persistence'
);

drop trigger bridge_test_reject_github_onboarding_audit
on public.workspace_audit_logs;
drop function bridge_test.reject_github_onboarding_audit();

set role service_role;

select public.service_set_workspace_membership(
  (select id from public.workspaces where slug = 'alpha-team'),
  '33333333-3333-4333-8333-333333333333',
  'viewer',
  'active'
);
select public.service_set_workspace_membership(
  (select id from public.workspaces where slug = 'alpha-team'),
  '44444444-4444-4444-8444-444444444444',
  'auditor',
  'active'
);

select public.service_store_secret_reference(
  (select id from public.workspaces where slug = 'alpha-team'),
  'github-app',
  'external',
  'vault://alpha/github-app'
);
select public.service_store_secret_reference(
  (select id from public.workspaces where slug = 'beta-team'),
  'github-app',
  'external',
  'vault://beta/github-app'
);

select public.service_complete_github_app_onboarding(
  p_workspace_id =>
    (select id from public.workspaces where slug = 'alpha-team'),
  p_user_id => '11111111-1111-4111-8111-111111111111',
  p_installation_reference_ciphertext =>
    'v1.AAAAAAAAAAAAAAAA.YWxwaGE.AAAAAAAAAAAAAAAAAAAAAA',
  p_installation_reference_digest => repeat('1', 64),
  p_account_id => 2001,
  p_account_login => 'alpha-org',
  p_account_type => 'Organization',
  p_repository_selection => 'selected',
  p_installed_at => now(),
  p_permissions => '{}'::jsonb,
  p_events => array['installation'],
  p_repositories =>
    '[{"id":3001,"owner":"alpha-org","name":"payments","defaultBranch":"main"}]'::jsonb
);
select public.service_complete_github_app_onboarding(
  p_workspace_id =>
    (select id from public.workspaces where slug = 'beta-team'),
  p_user_id => '22222222-2222-4222-8222-222222222222',
  p_installation_reference_ciphertext =>
    'v1.AAAAAAAAAAAAAAAA.YmV0YQ.AAAAAAAAAAAAAAAAAAAAAA',
  p_installation_reference_digest => repeat('2', 64),
  p_account_id => 2002,
  p_account_login => 'beta-org',
  p_account_type => 'Organization',
  p_repository_selection => 'selected',
  p_installed_at => now(),
  p_permissions => '{}'::jsonb,
  p_events => array['installation'],
  p_repositories =>
    '[{"id":3002,"owner":"beta-org","name":"billing","defaultBranch":"main"}]'::jsonb
);

select bridge_test.assert_true(
  (
    select bool_and(
      installation_id is null
      and installation_reference_ciphertext is not null
      and installation_reference_digest is not null
    )
    from public.github_app_installations
    where account_login in ('alpha-org', 'beta-org')
  ),
  'new GitHub App onboarding must never persist plaintext installation ids'
);

select public.service_upsert_provider_connection(
  (select id from public.workspaces where slug = 'alpha-team'),
  'atlaspay',
  'alpha-provider-account',
  'Alpha Provider'
);
select public.service_upsert_provider_connection(
  (select id from public.workspaces where slug = 'beta-team'),
  'atlaspay',
  'beta-provider-account',
  'Beta Provider'
);

select public.service_register_recipe(
  (select id from public.workspaces where slug = 'alpha-team'),
  'atlaspay-v2-typescript',
  1,
  'atlaspay',
  'property_rename',
  'typescript',
  '{"matcher":"object-property"}'::jsonb,
  repeat('a', 64)
);
select public.service_register_recipe(
  (select id from public.workspaces where slug = 'beta-team'),
  'atlaspay-v2-typescript',
  1,
  'atlaspay',
  'property_rename',
  'typescript',
  '{"matcher":"object-property"}'::jsonb,
  repeat('b', 64)
);

select public.service_record_webhook_delivery(
  p_workspace_id =>
    (select id from public.workspaces where slug = 'alpha-team'),
  p_source => 'atlaspay',
  p_delivery_id => 'alpha-delivery-1',
  p_event_type => 'contract.changed',
  p_payload_digest => repeat('c', 64),
  p_provider_connection_id => (
    select id
    from public.provider_connections
    where external_account_id = 'alpha-provider-account'
  )
);
select public.service_record_webhook_delivery(
  p_workspace_id =>
    (select id from public.workspaces where slug = 'beta-team'),
  p_source => 'atlaspay',
  p_delivery_id => 'beta-delivery-1',
  p_event_type => 'contract.changed',
  p_payload_digest => repeat('d', 64),
  p_provider_connection_id => (
    select id
    from public.provider_connections
    where external_account_id = 'beta-provider-account'
  )
);

select public.service_enqueue_orchestration_job(
  p_workspace_id =>
    (select id from public.workspaces where slug = 'alpha-team'),
  p_repository_id => (
    select id
    from public.repositories
    where full_name = 'alpha-org/payments'
  ),
  p_idempotency_key => 'alpha-job-0001',
  p_job_type => 'migration',
  p_recipe_id => (
    select id
    from public.migration_recipes
    where workspace_id = (
      select id from public.workspaces where slug = 'alpha-team'
    )
  ),
  p_provider_connection_id => (
    select id
    from public.provider_connections
    where external_account_id = 'alpha-provider-account'
  ),
  p_source_delivery_id => (
    select id
    from public.webhook_deliveries
    where delivery_id = 'alpha-delivery-1'
  )
);
select public.service_enqueue_orchestration_job(
  p_workspace_id =>
    (select id from public.workspaces where slug = 'beta-team'),
  p_repository_id => (
    select id
    from public.repositories
    where full_name = 'beta-org/billing'
  ),
  p_idempotency_key => 'beta-job-0001',
  p_job_type => 'migration',
  p_recipe_id => (
    select id
    from public.migration_recipes
    where workspace_id = (
      select id from public.workspaces where slug = 'beta-team'
    )
  ),
  p_provider_connection_id => (
    select id
    from public.provider_connections
    where external_account_id = 'beta-provider-account'
  ),
  p_source_delivery_id => (
    select id
    from public.webhook_deliveries
    where delivery_id = 'beta-delivery-1'
  )
);

select public.service_start_orchestration_attempt(
  (
    select id
    from public.orchestration_jobs
    where idempotency_key = 'alpha-job-0001'
  ),
  'alpha-worker'
);
select public.service_start_orchestration_attempt(
  (
    select id
    from public.orchestration_jobs
    where idempotency_key = 'beta-job-0001'
  ),
  'beta-worker'
);

select bridge_test.assert_true(
  not has_function_privilege(
    'authenticated',
    'public.service_create_workspace(text,text,uuid)',
    'execute'
  ),
  'authenticated must not execute service mutation RPCs'
);
select bridge_test.assert_true(
  not has_function_privilege(
    'service_role',
    'public.service_create_workspace(text,text,uuid)',
    'execute'
  ),
  'service role must not bypass audited workspace creation'
);
select bridge_test.assert_true(
  not has_function_privilege(
    'service_role',
    'public.service_register_github_installation(uuid,bigint,bigint,text,text,text,timestamptz,jsonb,text[],uuid)',
    'execute'
  ),
  'service role must not execute the legacy plaintext installation RPC'
);
select bridge_test.assert_true(
  has_function_privilege(
    'service_role',
    'public.service_complete_github_app_onboarding(uuid,uuid,text,text,bigint,text,text,text,timestamptz,jsonb,text[],jsonb)',
    'execute'
  ),
  'service role must execute atomic encrypted GitHub onboarding'
);
select bridge_test.assert_true(
  not has_function_privilege(
    'authenticated',
    'public.service_create_workspace_with_audit(text,text,uuid)',
    'execute'
  ),
  'authenticated must not execute atomic workspace creation'
);
select bridge_test.assert_true(
  not has_function_privilege(
    'anon',
    'public.service_create_workspace_with_audit(text,text,uuid)',
    'execute'
  ),
  'anonymous users must not execute atomic workspace creation'
);
select bridge_test.assert_true(
  has_function_privilege(
    'service_role',
    'public.service_create_workspace_with_audit(text,text,uuid)',
    'execute'
  ),
  'service role must execute atomic workspace creation'
);
select bridge_test.assert_true(
  (
    select count(*)
    from public.workspace_audit_logs audit
    join public.workspaces workspace on workspace.id = audit.workspace_id
    where audit.action = 'workspace.created'
      and audit.actor_kind = 'user'
      and audit.actor_user_id = workspace.created_by_user_id
      and audit.target_type = 'workspace'
      and audit.target_id = workspace.id::text
      and audit.metadata ->> 'slug' = workspace.slug
  ) = 2,
  'atomic creation must append one attributed audit event per workspace'
);
select bridge_test.assert_true(
  not has_table_privilege('authenticated', 'public.repositories', 'insert'),
  'authenticated must not insert repositories directly'
);
select bridge_test.assert_true(
  not has_table_privilege('anon', 'public.workspaces', 'select'),
  'anonymous users must not read workspaces'
);

do $$
begin
  perform public.service_register_repository(
    (select id from public.workspaces where slug = 'alpha-team'),
    (
      select id
      from public.github_app_installations
      where account_login = 'beta-org'
    ),
    3999,
    'alpha-org',
    'cross-tenant',
    'main'
  );
  raise exception 'cross-tenant installation reference was accepted';
exception
  when foreign_key_violation then null;
end;
$$;

reset role;

insert into public.providers(id, slug, name)
values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'integration-provider',
  'Integration Provider'
);
insert into public.provider_changes(
  id,
  provider_id,
  from_version,
  to_version,
  summary
)
values (
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '1',
  '2',
  'Integration contract change'
);
insert into public.migration_runs(
  id,
  provider_change_id,
  repository_id,
  status,
  current_stage,
  lock_owner,
  lock_expires_at
)
values (
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  (
    select id
    from public.repositories
    where full_name = 'alpha-org/payments'
  ),
  'scanning_repo',
  'scanning_repo',
  'active-worker',
  now() + interval '5 minutes'
);
insert into public.impacts(run_id, file_path)
values (
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'src/payment.ts'
);
insert into public.participant_invites(
  id,
  token_digest,
  display_name,
  role,
  expires_at,
  max_claims,
  claim_count,
  run_id
)
values (
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  decode(repeat('ab', 32), 'hex'),
  'Existing reviewer',
  'customer',
  now() + interval '1 hour',
  1,
  0,
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
);

set role service_role;
do $$
begin
  perform public.reset_demo_run(
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  );
  raise exception 'reset accepted a run with an active worker lease';
exception
  when lock_not_available then null;
end;
$$;
reset role;

select bridge_test.assert_true(
  (
    select status = 'scanning_repo'
      and lock_owner = 'active-worker'
    from public.migration_runs
    where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  ),
  'rejected reset must preserve the active run'
);
select bridge_test.assert_true(
  (
    select count(*)
    from public.impacts
    where run_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  ) = 1,
  'rejected reset must preserve derived evidence'
);

update public.migration_runs
set lock_expires_at = now() - interval '1 second'
where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
set role service_role;
select public.reset_demo_run(
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
);
reset role;
select bridge_test.assert_true(
  (
    select status = 'analyzing_change'
      and lock_owner is null
      and lock_expires_at is null
    from public.migration_runs
    where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  ),
  'expired worker lease must allow reset'
);
select bridge_test.assert_true(
  (
    select count(*)
    from public.impacts
    where run_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  ) = 0,
  'successful reset must remove derived evidence'
);

set role service_role;
select public.claim_participant_invite(
  '55555555-5555-4555-8555-555555555555',
  decode(repeat('ab', 32), 'hex')
);
select public.claim_participant_invite(
  '55555555-5555-4555-8555-555555555555',
  decode(repeat('ab', 32), 'hex')
);
do $$
begin
  perform public.claim_participant_invite(
    '66666666-6666-4666-8666-666666666666',
    decode(repeat('ab', 32), 'hex')
  );
  raise exception 'invite granted more than its maximum distinct claims';
exception
  when invalid_authorization_specification then null;
end;
$$;
reset role;

select bridge_test.assert_true(
  (
    select claim_count
    from public.participant_invites
    where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
  ) = 1,
  'invite claim count must count one distinct user'
);
select bridge_test.assert_true(
  (
    select count(*)
    from public.participant_invite_claims
    where invite_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
  ) = 1,
  'invite claim ledger must contain one distinct user'
);
select bridge_test.assert_true(
  exists (
    select 1
    from public.run_participants
    where run_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
      and user_id = '55555555-5555-4555-8555-555555555555'
  ),
  'first existing participant must receive run membership'
);
select bridge_test.assert_true(
  not exists (
    select 1
    from public.run_participants
    where run_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
      and user_id = '66666666-6666-4666-8666-666666666666'
  ),
  'over-limit existing participant must not receive run membership'
);

set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select bridge_test.assert_true(
  (select array_agg(slug order by slug) from public.workspaces)
    = array['alpha-team'],
  'alpha owner must see only the alpha workspace'
);
select bridge_test.assert_true(
  (select count(*) from public.workspace_memberships) = 3,
  'alpha owner must see only alpha memberships'
);
select bridge_test.assert_true(
  (select array_agg(full_name order by full_name) from public.repositories)
    = array['alpha-org/payments'],
  'alpha owner must see only alpha repositories'
);
select bridge_test.assert_true(
  (select count(*) from public.github_app_installations) = 1
    and (select count(*) from public.provider_connections) = 1
    and (select count(*) from public.migration_recipes) = 1
    and (select count(*) from public.webhook_deliveries) = 1
    and (select count(*) from public.orchestration_jobs) = 1
    and (select count(*) from public.orchestration_attempts) = 1,
  'alpha owner must see one alpha row across the operational data graph'
);
select bridge_test.assert_true(
  (select count(*) from public.secret_references) = 1,
  'alpha owner must see only the alpha secret reference'
);
select bridge_test.assert_true(
  (select count(*) from public.workspace_audit_logs) = 2,
  'alpha owner must see only the alpha audit logs'
);

set request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
select bridge_test.assert_true(
  (select count(*) from public.repositories) = 1,
  'alpha viewer must see alpha repositories'
);
select bridge_test.assert_true(
  (select count(*) from public.secret_references) = 0,
  'alpha viewer must not see secret references'
);
select bridge_test.assert_true(
  (select count(*) from public.workspace_audit_logs) = 0,
  'alpha viewer must not see audit logs'
);

set request.jwt.claim.sub = '44444444-4444-4444-8444-444444444444';
select bridge_test.assert_true(
  (select count(*) from public.workspace_audit_logs) = 2,
  'alpha auditor must see the alpha audit logs'
);
select bridge_test.assert_true(
  (select count(*) from public.secret_references) = 0,
  'alpha auditor must not see secret references'
);

set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
select bridge_test.assert_true(
  (select array_agg(slug order by slug) from public.workspaces)
    = array['beta-team'],
  'beta owner must see only the beta workspace'
);
select bridge_test.assert_true(
  (select array_agg(full_name order by full_name) from public.repositories)
    = array['beta-org/billing'],
  'beta owner must see only beta repositories'
);
select bridge_test.assert_true(
  (select count(*) from public.github_app_installations) = 1
    and (select count(*) from public.provider_connections) = 1
    and (select count(*) from public.migration_recipes) = 1
    and (select count(*) from public.webhook_deliveries) = 1
    and (select count(*) from public.orchestration_jobs) = 1
    and (select count(*) from public.orchestration_attempts) = 1,
  'beta owner must see one beta row across the operational data graph'
);
select bridge_test.assert_true(
  (select count(*) from public.secret_references) = 1,
  'beta owner must see only the beta secret reference'
);
select bridge_test.assert_true(
  (select count(*) from public.workspace_audit_logs) = 2,
  'beta owner must see only the beta audit logs'
);

reset role;
`;

test(
  "workspace migration executes and enforces tenant isolation in Postgres",
  {
    skip: runDatabaseTests
      ? false
      : "set BRIDGE_RUN_DATABASE_TESTS=1 to run the Docker integration test",
    timeout: 120_000,
  },
  async () => {
    const containerName = `bridge-workspaces-${process.pid}-${Date.now()}`;

    await runCommand("docker", [
      "run",
      "--rm",
      "-d",
      "--name",
      containerName,
      "-e",
      "POSTGRES_PASSWORD=bridge_test_only",
      "-e",
      "POSTGRES_DB=bridge_test",
      "postgres:15-alpine",
    ]);

    try {
      await waitForPostgres(containerName);
      await runSql(containerName, supabaseBootstrapSql);

      const migrationFiles = (await readdir(migrationsDirectory))
        .filter((fileName) => /^\d+.*\.sql$/.test(fileName))
        .sort();

      for (const migrationFile of migrationFiles) {
        const migrationSql = await readFile(
          `${migrationsDirectory}/${migrationFile}`,
          "utf8",
        );
        await runSql(containerName, migrationSql);
      }

      await runSql(containerName, tenantIsolationSql);
    } finally {
      await runCommand("docker", ["rm", "-f", containerName]).catch(() => {
        // Cleanup failure must not hide the database assertion that failed.
      });
    }
  },
);
