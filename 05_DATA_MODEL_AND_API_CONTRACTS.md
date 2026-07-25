# Data Model and API Contracts

> This is the original demo graph. Migrations `0006` through `0010` add the
> workspace-owned production foundation described in
> `18_PRODUCTION_ARCHITECTURE_AND_JUDGE_QA.md`; the preserved demo run itself has
> not yet been retrofitted into that tenant graph.

## Core tables

### providers

- `id uuid primary key`
- `slug text unique`
- `name text`
- `logo_url text nullable`
- `created_at timestamptz`

### provider_changes

- `id uuid primary key`
- `provider_id uuid`
- `from_version text`
- `to_version text`
- `old_spec_url text`
- `new_spec_url text`
- `summary text`
- `severity text`
- `normalized_diff jsonb`
- `created_at timestamptz`

### repositories

- `id uuid primary key`
- `owner text`
- `name text`
- `default_branch text`
- `created_at timestamptz`

### migration_runs

- `id uuid primary key`
- `provider_change_id uuid`
- `repository_id uuid`
- `status text`
- `attempt int default 1`
- `current_stage text`
- `plan_version int default 1`
- `branch_name text nullable`
- `commit_sha text nullable`
- `pull_request_number int nullable`
- `pull_request_url text nullable`
- `validation_url text nullable`
- `validation_status text nullable`
- `validation_conclusion text nullable`
- `error_code text nullable`
- `error_message text nullable`
- `lock_owner text nullable`
- `lock_expires_at timestamptz nullable`
- `created_at timestamptz`
- `updated_at timestamptz`

### impacts

- `id uuid primary key`
- `run_id uuid`
- `file_path text`
- `line_start int`
- `line_end int`
- `snippet text`
- `reason text`
- `confidence numeric`
- `created_at timestamptz`

### migration_plans

- `id uuid primary key`
- `run_id uuid`
- `version int`
- `title text`
- `steps jsonb`
- `patch_summary text`
- `risk_level text`
- `created_at timestamptz`

### approvals

- `id uuid primary key`
- `run_id uuid`
- `plan_version int`
- `participant_id uuid`
- `decision text`
- `note text nullable`
- `created_at timestamptz`

### comments

- `id uuid primary key`
- `run_id uuid`
- `participant_id uuid`
- `body text`
- `created_at timestamptz`

### run_events

- `id bigint generated always as identity primary key`
- `run_id uuid`
- `sequence int`
- `actor_type text`
- `actor_id text nullable`
- `event_type text`
- `stage text`
- `status text`
- `message text`
- `metadata jsonb`
- `created_at timestamptz`

## Event types

- `run.created`
- `change.analysis.started`
- `change.analysis.completed`
- `repo.scan.started`
- `repo.scan.completed`
- `plan.created`
- `plan.approved`
- `patch.started`
- `patch.completed`
- `github.branch.created`
- `github.pr.created`
- `validation.started`
- `validation.updated`
- `validation.passed`
- `validation.failed`
- `comment.created`
- `run.ready_for_review`
- `run.failed`

## Public API routes

### POST `/api/runs/start`

Request:

```json
{
  "providerChangeId": "uuid",
  "repositoryId": "uuid"
}
```

Response:

```json
{
  "runId": "uuid",
  "status": "queued"
}
```

### POST `/api/runs/:runId/advance`

Server/admin-only or protected demo command. Executes exactly one idempotent stage.

Response:

```json
{
  "runId": "uuid",
  "previousStatus": "scanning_repo",
  "status": "planning"
}
```

### POST `/api/runs/:runId/approve`

Request:

```json
{
  "planVersion": 1,
  "decision": "approved",
  "note": "Patch is limited to AtlasPay request fields."
}
```

### POST `/api/runs/:runId/comments`

Request:

```json
{
  "body": "AtlasPay provider team confirms this field rename."
}
```

### GET `/api/runs/:runId`

Returns the room aggregate: run, change, repository, impacts, latest plan, approvals, events, comments, and evidence.

### POST `/api/runs/:runId/validate`

Server/demo-protected. Polls GitHub check-runs / workflow-runs for the run's exact
commit SHA (no webhook). Idempotent.

- Query GitHub by the stored `commit_sha`.
- Update `validation_url`, `validation_status`, `validation_conclusion` only for that SHA.
- Transition to `ready_for_review` only on a verified `success` for that SHA.

## Realtime channel

Topic: `migration-run:<runId>`

Presence payload:

```json
{
  "participantId": "uuid",
  "name": "Arush",
  "role": "customer_engineer",
  "avatar": "A",
  "view": "room"
}
```

Broadcast events:

- `run_status_changed`
- `comment_created`
- `approval_created`
- `evidence_updated`

The database remains the source of truth. Broadcast payloads tell clients to update immediately; clients refetch when they detect a sequence gap.

## State transition guard

A transition is allowed only when:

- the current state matches the expected source state,
- required artifacts for the destination state exist,
- the run lock belongs to the caller,
- the event sequence is incremented atomically.

Example: `validating -> ready_for_review` requires `commit_sha`, `pull_request_url`, `validation_url`, and `validation_conclusion = success` for the same SHA.
