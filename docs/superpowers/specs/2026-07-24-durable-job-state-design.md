# Durable Job-State Foundation Design

## Scope

Build a storage-neutral orchestration foundation on top of the
`orchestration_jobs` and `orchestration_attempts` tables introduced by
`0006_workspaces_and_installations.sql`.

This slice owns:

- job and attempt domain models;
- workspace-scoped explicit idempotency keys;
- atomic job claiming with fenced, expiring lease tokens;
- deterministic lease renewal, success, retry, and terminal-failure transitions;
- capped exponential retry backoff;
- a `JobStore` port and Supabase/Postgres adapter;
- deterministic tests with injected clocks and identifiers.

It does not wire workers or routes, change UI/auth/GitHub behavior, alter deployment,
deploy, or merge.

## Existing Schema Assessment

Migration `0006` already owns both orchestration tables, workspace scoping,
idempotency uniqueness, attempt numbering, `max_attempts`, `available_at`, and the
initial enqueue/start/finish RPCs. It must remain unchanged.

The schema is insufficient for safe durable workers because attempts have no lease
token or expiration, retry timing has no persisted backoff bounds, terminal failures
have no structured job-level record, and the existing finish RPC cannot reject a
stale worker. A backward-compatible `0007_durable_job_leases.sql` will only add
columns, indexes, and new service-role RPCs. It will not recreate either table or
remove the `0006` API.

## Domain Boundary

`lib/jobs/model.ts` defines storage-independent `Job`, `JobAttempt`, `JobLease`,
`RetryPolicy`, `AttemptFailure`, and `TerminalFailure` values. Times are `Date`
instances in the domain and ISO timestamps only at the adapter boundary.

`lib/jobs/store.ts` defines atomic persistence operations:

- enqueue or return the existing workspace/idempotency-key job;
- claim one specific due job;
- renew a live lease;
- complete through a live lease;
- fail through a live lease and either schedule a retry or record terminal failure.

`lib/jobs/coordinator.ts` owns validation, clock/ID injection, idempotency-intent
comparison, lease-duration calculation, and retry decisions. It has no Supabase or
Postgres imports.

`lib/jobs/retry.ts` calculates:

`min(maxDelayMs, baseDelayMs * 2^(attemptNumber - 1))`

The policy is deterministic and has no jitter. `maxAttempts`, `baseDelayMs`, and
`maxDelayMs` are persisted on each job so a deployment cannot silently change an
existing job's retry behavior.

## State and Failure Semantics

A new job is `queued`. Claiming a due job atomically creates a numbered `running`
attempt, assigns an opaque lease token, and changes the job to `running`.

Only the matching attempt ID and lease token may renew, succeed, or fail, and only
before `leaseExpiresAt`. Any wrong, superseded, or expired token raises
`StaleJobLeaseError`; it cannot mutate either row.

An expired running attempt is lazily failed when the job is next claimed. Its
failure code is `LEASE_EXPIRED`. If attempts remain, the job is requeued after its
deterministic backoff and the current claim returns no lease. If exhausted, the job
becomes `failed` with a structured terminal failure.

An explicit retryable failure similarly requeues the job for the exact calculated
`availableAt`. A non-retryable failure, or a retryable failure on the final allowed
attempt, sets job status `failed`, `finishedAt`, and a structured terminal record
containing code, message, details, attempt number, occurrence time, and terminal
reason.

Successful completion sets both attempt and job to `succeeded`. Terminal jobs
cannot be claimed.

## Idempotency Semantics

The database uniqueness boundary remains `(workspace_id, idempotency_key)`.
Enqueuing the same intent returns the original job and does not create an attempt.
Reusing the key with a different repository, job type, request summary, priority,
retry policy, or optional source references raises `IdempotencyConflictError`
instead of silently accepting different work.

JSON intent comparison canonicalizes object-key order but preserves array order.

## Postgres Extension

Migration `0007` adds:

- persisted base and maximum retry delays on jobs;
- nullable structured terminal failure on jobs;
- lease token and expiration on attempts;
- attempt-level retryability and structured failure details;
- indexes for active lease expiration and unique non-null lease tokens;
- new service-role-only RPCs for durable enqueue, claim, renewal, success, and
  failure.

Every mutating RPC accepts explicit timestamps and identifiers from the coordinator.
This makes unit and in-process Postgres tests deterministic while keeping production
callers responsible for supplying trusted server time and UUIDs.

## Testing

Core tests use a deterministic in-memory `JobStore`, fixed clock, and queued IDs.
They cover idempotent enqueue, intent conflict, live-lease exclusion, renewal,
wrong-token and expired-token rejection, lease-expiry retry, precise capped
backoff, success, non-retryable terminal failure, and attempts-exhausted failure.

Adapter tests exercise real row mapping and exact RPC arguments with a controlled
client double. Migration tests execute `0007` against an in-process Postgres engine
using a minimal `0006` table fixture, then exercise the RPC behavior instead of
matching SQL source text.

## Known Boundary

This commit provides the durable state engine and persistence adapter, but no worker
poller invokes it. Jobs will not execute until later runtime wiring selects a job ID
and calls the coordinator. Lease expiration is recovered lazily on a later claim;
there is no background reaper in this slice.
