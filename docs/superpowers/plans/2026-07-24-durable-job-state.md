# Durable Job-State Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a durable, fenced, retry-aware job-state engine and Supabase/Postgres adapter without wiring it into application runtime.

**Architecture:** A pure TypeScript coordinator depends only on an atomic `JobStore` port, injected time, and injected IDs. A Supabase adapter maps that port to new backward-compatible RPCs in migration `0007`, extending but never recreating the orchestration tables from `0006`.

**Tech Stack:** TypeScript 5.6, Node test runner, Supabase JS, PostgreSQL/PLpgSQL, PGlite for deterministic in-process migration behavior tests.

## Global Constraints

- Rebase on `origin/main` commit `55084808793c74537d56074463ae0e71464bc307`.
- Do not edit `supabase/migrations/0006_workspaces_and_installations.sql`.
- Do not create duplicate orchestration tables.
- Add only backward-compatible `0007_durable_job_leases.sql` schema changes.
- Use explicit idempotency keys, fenced lease tokens, injected clock/IDs, capped deterministic backoff, and structured terminal failures.
- Do not modify UI, routes, GitHub adapters, auth, runtime wiring, or deployment configuration.
- Do not deploy or merge.

---

### Task 1: Storage-Neutral Domain and Coordinator

**Files:**
- Create: `prebuilt/bridge-app/lib/jobs/model.ts`
- Create: `prebuilt/bridge-app/lib/jobs/retry.ts`
- Create: `prebuilt/bridge-app/lib/jobs/store.ts`
- Create: `prebuilt/bridge-app/lib/jobs/coordinator.ts`
- Create: `prebuilt/bridge-app/lib/jobs/__tests__/memory-job-store.ts`
- Create: `prebuilt/bridge-app/lib/jobs/__tests__/coordinator.test.ts`
- Create: `prebuilt/bridge-app/lib/jobs/__tests__/retry.test.ts`

**Interfaces:**
- Produces: `JobStore` with atomic `enqueue`, `claim`, `renew`, `succeed`, and `fail`.
- Produces: `JobCoordinator` requiring `{ store, clock, ids }`.
- Produces: `retryDelayMs(policy, attemptNumber): number`.
- Produces: `IdempotencyConflictError` and `StaleJobLeaseError`.

- [ ] **Step 1: Write failing domain tests**

Cover duplicate enqueue, conflicting intent, claim exclusion, exact renewal,
wrong/expired tokens, lease-expiry retry, success, capped retry timing, and both
terminal-failure reasons using literal expected timestamps and queued fixed IDs.

- [ ] **Step 2: Verify the tests fail because the job modules do not exist**

Run:

```bash
node --import tsx --test lib/jobs/__tests__/retry.test.ts lib/jobs/__tests__/coordinator.test.ts
```

Expected: failure resolving `../retry`, `../coordinator`, or `../store`.

- [ ] **Step 3: Implement the minimal domain**

Use these public shapes:

```ts
export interface Clock { now(): Date }
export interface JobIds {
  jobId(): string;
  attemptId(): string;
  leaseToken(): string;
}

export interface JobStore {
  enqueue(input: StoreEnqueueInput): Promise<EnqueueResult>;
  claim(input: StoreClaimInput): Promise<JobLease | null>;
  renew(input: StoreRenewInput): Promise<JobLease>;
  succeed(input: StoreSucceedInput): Promise<JobTransition>;
  fail(input: StoreFailInput): Promise<JobTransition>;
}
```

`JobCoordinator.fail` must calculate the next availability from the claimed
attempt number and persist a terminal record when no retry remains.

- [ ] **Step 4: Run focused tests until green**

```bash
node --import tsx --test lib/jobs/__tests__/retry.test.ts lib/jobs/__tests__/coordinator.test.ts
```

Expected: all focused tests pass without sleeps, random UUIDs, or wall-clock reads.

### Task 2: Supabase JobStore Adapter

**Files:**
- Create: `prebuilt/bridge-app/lib/jobs/supabase-job-store.ts`
- Create: `prebuilt/bridge-app/lib/jobs/__tests__/supabase-job-store.test.ts`

**Interfaces:**
- Consumes: all `JobStore` inputs and domain values from Task 1.
- Produces: `SupabaseJobStore implements JobStore`.

- [ ] **Step 1: Write failing adapter tests**

Use a controlled RPC client to assert returned domain values and literal RPC
arguments for enqueue, claim, renewal, success, retry, and stale-lease errors.

- [ ] **Step 2: Verify the adapter test fails because the adapter is absent**

```bash
node --import tsx --test lib/jobs/__tests__/supabase-job-store.test.ts
```

- [ ] **Step 3: Implement adapter mapping**

Call only:

```text
service_enqueue_durable_orchestration_job
service_claim_orchestration_job
service_renew_orchestration_lease
service_complete_orchestration_attempt
service_fail_orchestration_attempt
```

Map snake_case rows and ISO timestamps into domain objects. Convert the Postgres
stale-lease error into `StaleJobLeaseError`; surface other database errors with the
operation name.

- [ ] **Step 4: Run adapter and domain tests**

```bash
node --import tsx --test lib/jobs/__tests__/*.test.ts
```

### Task 3: Backward-Compatible Lease Migration

**Files:**
- Create: `prebuilt/bridge-app/supabase/migrations/0007_durable_job_leases.sql`
- Create: `prebuilt/bridge-app/lib/jobs/__tests__/durable-job-migration.test.ts`
- Modify: `prebuilt/bridge-app/package.json`
- Modify: `prebuilt/bridge-app/package-lock.json`

**Interfaces:**
- Consumes: existing `orchestration_jobs` and `orchestration_attempts` from `0006`.
- Produces: the five service-role RPCs consumed by `SupabaseJobStore`.

- [ ] **Step 1: Add PGlite and write the failing behavioral migration test**

```bash
npm install --save-dev @electric-sql/pglite@0.5.4
node --import tsx --test lib/jobs/__tests__/durable-job-migration.test.ts
```

Expected before `0007`: failure because the migration/RPCs do not exist.

- [ ] **Step 2: Implement only additive schema changes**

Add retry-delay and terminal-failure job columns; lease and structured-failure
attempt columns; safe indexes; and fenced RPCs. Do not include any
`create table orchestration_...` statement.

- [ ] **Step 3: Exercise real SQL behavior**

The migration test must enqueue twice with one key, claim with fixed IDs/time,
reject a stale token, schedule the literal expected retry time, cap later backoff,
and preserve a structured terminal failure after exhaustion.

```bash
node --import tsx --test lib/jobs/__tests__/durable-job-migration.test.ts
```

Expected: all migration behavior tests pass in process.

### Task 4: Verification and Commit

**Files:**
- Review every file changed since `origin/main`.

- [ ] **Step 1: Run focused and full verification**

```bash
npm test
npm run typecheck
npm run build
npm audit --omit=dev
git diff --check
```

- [ ] **Step 2: Verify scope**

Confirm `0006` is byte-identical to `origin/main`, and confirm no UI, route,
GitHub, auth, runtime, or deploy file appears in the diff.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers prebuilt/bridge-app/lib/jobs \
  prebuilt/bridge-app/package.json prebuilt/bridge-app/package-lock.json \
  prebuilt/bridge-app/supabase/migrations/0007_durable_job_leases.sql
git commit -m "feat: add durable job state foundation"
```

- [ ] **Step 4: Re-run verification against committed HEAD**

Repeat the full commands and record their exact output for handoff.
