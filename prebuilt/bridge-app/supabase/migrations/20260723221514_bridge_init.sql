create extension if not exists "pgcrypto";

create table if not exists providers (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  logo_url text,
  created_at timestamptz not null default now()
);

create table if not exists provider_changes (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid references providers(id),
  from_version text, to_version text,
  old_spec_url text, new_spec_url text,
  summary text, severity text,
  normalized_diff jsonb,
  created_at timestamptz not null default now()
);

create table if not exists repositories (
  id uuid primary key default gen_random_uuid(),
  owner text not null, name text not null,
  default_branch text not null default 'main',
  created_at timestamptz not null default now()
);

create table if not exists migration_runs (
  id uuid primary key default gen_random_uuid(),
  provider_change_id uuid references provider_changes(id),
  repository_id uuid references repositories(id),
  status text not null default 'queued',
  attempt int not null default 1,
  current_stage text,
  plan_version int not null default 1,
  branch_name text, commit_sha text,
  pull_request_number int, pull_request_url text,
  validation_url text, validation_status text, validation_conclusion text,
  error_code text, error_message text,
  lock_owner text, lock_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_change_id, repository_id, attempt)
);

create table if not exists impacts (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references migration_runs(id) on delete cascade,
  file_path text not null, line_start int, line_end int,
  snippet text, reason text, confidence numeric,
  created_at timestamptz not null default now()
);

create table if not exists migration_plans (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references migration_runs(id) on delete cascade,
  version int not null default 1, title text, steps jsonb,
  patch_summary text, risk_level text,
  created_at timestamptz not null default now()
);

create table if not exists approvals (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references migration_runs(id) on delete cascade,
  plan_version int, participant_id uuid, participant_name text,
  decision text, note text,
  created_at timestamptz not null default now()
);

create table if not exists comments (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references migration_runs(id) on delete cascade,
  participant_id uuid, participant_name text, role text,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists run_events (
  id bigint generated always as identity primary key,
  run_id uuid references migration_runs(id) on delete cascade,
  sequence int not null, actor_type text, actor_id text,
  event_type text, stage text, status text, message text, metadata jsonb,
  created_at timestamptz not null default now(),
  unique (run_id, sequence)
);

create index if not exists idx_impacts_run on impacts(run_id);
create index if not exists idx_events_run on run_events(run_id, sequence);
create index if not exists idx_comments_run on comments(run_id, created_at);;
