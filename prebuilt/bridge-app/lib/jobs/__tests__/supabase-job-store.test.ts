import assert from "node:assert/strict";
import test from "node:test";
import { createServiceClient } from "../../db/supabase";
import { StaleJobLeaseError, type Job } from "../model";
import { SupabaseJobStore, type JobRpcClient } from "../supabase-job-store";

const NOW = new Date("2026-07-24T21:00:00.000Z");
const EXPIRES_AT = new Date("2026-07-24T21:01:00.000Z");

const jobRow = {
  id: "30000000-0000-4000-8000-000000000001",
  workspace_id: "10000000-0000-4000-8000-000000000001",
  repository_id: "20000000-0000-4000-8000-000000000002",
  recipe_id: null,
  provider_connection_id: null,
  source_delivery_id: null,
  idempotency_key: "migration:atlaspay:v2",
  job_type: "repository_migration",
  request_summary: { provider: "atlaspay" },
  status: "queued",
  priority: 100,
  max_attempts: 3,
  retry_base_delay_ms: 1_000,
  retry_max_delay_ms: 8_000,
  available_at: "2026-07-24T21:00:00.000Z",
  started_at: null,
  finished_at: null,
  terminal_failure: null,
  created_at: "2026-07-24T21:00:00.000Z",
  updated_at: "2026-07-24T21:00:00.000Z",
};

const attemptRow = {
  id: "40000000-0000-4000-8000-000000000001",
  workspace_id: "10000000-0000-4000-8000-000000000001",
  job_id: "30000000-0000-4000-8000-000000000001",
  attempt_number: 1,
  worker_id: "worker-a",
  status: "running",
  result_summary: {},
  error_code: null,
  error_message: null,
  retryable: null,
  failure_details: {},
  lease_token: "50000000-0000-4000-8000-000000000001",
  lease_expires_at: "2026-07-24T21:01:00.000Z",
  started_at: "2026-07-24T21:00:00.000Z",
  finished_at: null,
  created_at: "2026-07-24T21:00:00.000Z",
};

type RpcResponse = {
  data: unknown;
  error: { message: string; code?: string } | null;
};

class FakeRpcClient implements JobRpcClient {
  readonly calls: Array<{
    functionName: string;
    args: Record<string, unknown>;
  }> = [];

  constructor(private readonly responses: RpcResponse[]) {}

  async rpc(
    functionName: string,
    args: Record<string, unknown>,
  ): Promise<RpcResponse> {
    this.calls.push({ functionName, args });
    const response = this.responses.shift();
    if (!response) throw new Error("Unexpected RPC call.");
    return response;
  }
}

function compileOnlyConstructWithRealClient(): SupabaseJobStore {
  return new SupabaseJobStore(createServiceClient());
}
void compileOnlyConstructWithRealClient;

function domainJob(): Job {
  return {
    id: jobRow.id,
    workspaceId: jobRow.workspace_id,
    repositoryId: jobRow.repository_id,
    recipeId: null,
    providerConnectionId: null,
    sourceDeliveryId: null,
    idempotencyKey: jobRow.idempotency_key,
    jobType: jobRow.job_type,
    requestSummary: { provider: "atlaspay" },
    status: "queued",
    priority: 100,
    retryPolicy: {
      maxAttempts: 3,
      baseDelayMs: 1_000,
      maxDelayMs: 8_000,
    },
    availableAt: NOW,
    startedAt: null,
    finishedAt: null,
    terminalFailure: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

test("enqueues through the durable RPC and maps the returned job", async () => {
  const client = new FakeRpcClient([
    { data: { job: jobRow, created: true }, error: null },
  ]);
  const store = new SupabaseJobStore(client);

  const result = await store.enqueue({ job: domainJob() });

  assert.equal(result.created, true);
  assert.deepEqual(result.job, domainJob());
  assert.deepEqual(client.calls, [
    {
      functionName: "service_enqueue_durable_orchestration_job",
      args: {
        p_job_id: jobRow.id,
        p_workspace_id: jobRow.workspace_id,
        p_repository_id: jobRow.repository_id,
        p_recipe_id: null,
        p_provider_connection_id: null,
        p_source_delivery_id: null,
        p_idempotency_key: jobRow.idempotency_key,
        p_job_type: jobRow.job_type,
        p_request_summary: { provider: "atlaspay" },
        p_priority: 100,
        p_max_attempts: 3,
        p_retry_base_delay_ms: 1_000,
        p_retry_max_delay_ms: 8_000,
        p_now: "2026-07-24T21:00:00.000Z",
      },
    },
  ]);
});

test("claims with explicit attempt and fence IDs and maps a null or live lease", async () => {
  const client = new FakeRpcClient([
    { data: null, error: null },
    { data: { job: { ...jobRow, status: "running" }, attempt: attemptRow }, error: null },
  ]);
  const store = new SupabaseJobStore(client);
  const input = {
    jobId: jobRow.id,
    workerId: "worker-a",
    attemptId: attemptRow.id,
    leaseToken: attemptRow.lease_token,
    now: NOW,
    leaseExpiresAt: EXPIRES_AT,
  };

  assert.equal(await store.claim(input), null);
  const lease = await store.claim(input);

  assert.equal(lease?.job.status, "running");
  assert.equal(lease?.attempt.leaseToken, attemptRow.lease_token);
  assert.equal(lease?.attempt.leaseExpiresAt?.toISOString(), EXPIRES_AT.toISOString());
  assert.deepEqual(client.calls[0], {
    functionName: "service_claim_orchestration_job",
    args: {
      p_job_id: jobRow.id,
      p_worker_id: "worker-a",
      p_attempt_id: attemptRow.id,
      p_lease_token: attemptRow.lease_token,
      p_now: NOW.toISOString(),
      p_lease_expires_at: EXPIRES_AT.toISOString(),
    },
  });
});

test("maps renewal, success, and retry transitions without storage policy leakage", async () => {
  const runningJob = { ...jobRow, status: "running" };
  const renewedAttempt = {
    ...attemptRow,
    lease_expires_at: "2026-07-24T21:02:00.000Z",
  };
  const succeededAttempt = {
    ...attemptRow,
    status: "succeeded",
    result_summary: { commitSha: "abc123" },
    finished_at: NOW.toISOString(),
  };
  const failedAttempt = {
    ...attemptRow,
    status: "failed",
    error_code: "UPSTREAM_UNAVAILABLE",
    error_message: "Try later.",
    retryable: true,
    failure_details: { provider: "atlaspay" },
    finished_at: NOW.toISOString(),
  };
  const client = new FakeRpcClient([
    {
      data: { job: runningJob, attempt: renewedAttempt },
      error: null,
    },
    {
      data: {
        job: {
          ...jobRow,
          status: "succeeded",
          finished_at: NOW.toISOString(),
        },
        attempt: succeededAttempt,
      },
      error: null,
    },
    {
      data: {
        job: {
          ...jobRow,
          available_at: "2026-07-24T21:00:01.000Z",
        },
        attempt: failedAttempt,
      },
      error: null,
    },
  ]);
  const store = new SupabaseJobStore(client);
  const identity = {
    jobId: jobRow.id,
    attemptId: attemptRow.id,
    leaseToken: attemptRow.lease_token,
    now: NOW,
  };

  const renewed = await store.renew({
    ...identity,
    leaseExpiresAt: new Date("2026-07-24T21:02:00.000Z"),
  });
  assert.equal(
    renewed.attempt.leaseExpiresAt?.toISOString(),
    "2026-07-24T21:02:00.000Z",
  );

  const succeeded = await store.succeed({
    ...identity,
    resultSummary: { commitSha: "abc123" },
  });
  assert.equal(succeeded.job.status, "succeeded");
  assert.deepEqual(succeeded.attempt.resultSummary, { commitSha: "abc123" });

  const failed = await store.fail({
    ...identity,
    expectedAttemptNumber: 1,
    expectedRetryPolicy: {
      maxAttempts: 3,
      baseDelayMs: 1_000,
      maxDelayMs: 8_000,
    },
    failure: {
      code: "UPSTREAM_UNAVAILABLE",
      message: "Try later.",
      retryable: true,
      details: { provider: "atlaspay" },
      occurredAt: NOW,
    },
    disposition: {
      kind: "retry",
      nextAvailableAt: new Date("2026-07-24T21:00:01.000Z"),
    },
  });
  assert.equal(failed.job.status, "queued");
  assert.equal(failed.attempt.failure?.code, "UPSTREAM_UNAVAILABLE");

  assert.deepEqual(client.calls, [
    {
      functionName: "service_renew_orchestration_lease",
      args: {
        p_job_id: jobRow.id,
        p_attempt_id: attemptRow.id,
        p_lease_token: attemptRow.lease_token,
        p_lease_expires_at: "2026-07-24T21:02:00.000Z",
        p_now: "2026-07-24T21:00:00.000Z",
      },
    },
    {
      functionName: "service_complete_orchestration_attempt",
      args: {
        p_job_id: jobRow.id,
        p_attempt_id: attemptRow.id,
        p_lease_token: attemptRow.lease_token,
        p_result_summary: { commitSha: "abc123" },
        p_now: "2026-07-24T21:00:00.000Z",
      },
    },
    {
      functionName: "service_fail_orchestration_attempt",
      args: {
        p_job_id: jobRow.id,
        p_attempt_id: attemptRow.id,
        p_lease_token: attemptRow.lease_token,
        p_expected_attempt_number: 1,
        p_expected_max_attempts: 3,
        p_expected_retry_base_delay_ms: 1_000,
        p_expected_retry_max_delay_ms: 8_000,
        p_failure_code: "UPSTREAM_UNAVAILABLE",
        p_failure_message: "Try later.",
        p_failure_retryable: true,
        p_failure_details: { provider: "atlaspay" },
        p_next_available_at: "2026-07-24T21:00:01.000Z",
        p_terminal_failure: null,
        p_now: "2026-07-24T21:00:00.000Z",
      },
    },
  ]);
});

test("converts the database fence rejection into StaleJobLeaseError", async () => {
  const client = new FakeRpcClient([
    {
      data: null,
      error: {
        code: "55000",
        message: "stale or expired orchestration lease",
      },
    },
  ]);
  const store = new SupabaseJobStore(client);

  await assert.rejects(
    store.succeed({
      jobId: jobRow.id,
      attemptId: attemptRow.id,
      leaseToken: "50000000-0000-4000-8000-000000000099",
      now: NOW,
      resultSummary: {},
    }),
    StaleJobLeaseError,
  );
  assert.deepEqual(client.calls, [
    {
      functionName: "service_complete_orchestration_attempt",
      args: {
        p_job_id: jobRow.id,
        p_attempt_id: attemptRow.id,
        p_lease_token: "50000000-0000-4000-8000-000000000099",
        p_result_summary: {},
        p_now: "2026-07-24T21:00:00.000Z",
      },
    },
  ]);
});

test("preserves structured terminal failure fields from Postgres", async () => {
  const terminalFailure = {
    code: "TRANSIENT",
    message: "Attempts exhausted.",
    retryable: false,
    originalRetryable: true,
    details: { upstreamStatus: 503 },
    occurredAt: NOW.toISOString(),
    attemptNumber: 3,
    reason: "attempts_exhausted",
  };
  const client = new FakeRpcClient([
    {
      data: {
        job: {
          ...jobRow,
          status: "failed",
          finished_at: NOW.toISOString(),
          terminal_failure: terminalFailure,
        },
        attempt: {
          ...attemptRow,
          attempt_number: 3,
          status: "failed",
          error_code: "TRANSIENT",
          error_message: "Attempts exhausted.",
          retryable: true,
          failure_details: { upstreamStatus: 503 },
          finished_at: NOW.toISOString(),
        },
      },
      error: null,
    },
  ]);
  const store = new SupabaseJobStore(client);

  const transition = await store.fail({
    jobId: jobRow.id,
    attemptId: attemptRow.id,
    leaseToken: attemptRow.lease_token,
    now: NOW,
    expectedAttemptNumber: 3,
    expectedRetryPolicy: {
      maxAttempts: 3,
      baseDelayMs: 1_000,
      maxDelayMs: 8_000,
    },
    failure: {
      code: "TRANSIENT",
      message: "Attempts exhausted.",
      retryable: true,
      details: { upstreamStatus: 503 },
      occurredAt: NOW,
    },
    disposition: {
      kind: "terminal",
      terminalFailure: {
        code: "TRANSIENT",
        message: "Attempts exhausted.",
        retryable: false,
        originalRetryable: true,
        details: { upstreamStatus: 503 },
        occurredAt: NOW,
        attemptNumber: 3,
        reason: "attempts_exhausted",
      },
    },
  });

  assert.deepEqual(transition.job.terminalFailure, {
    ...terminalFailure,
    occurredAt: NOW,
  });
  assert.deepEqual(client.calls, [
    {
      functionName: "service_fail_orchestration_attempt",
      args: {
        p_job_id: jobRow.id,
        p_attempt_id: attemptRow.id,
        p_lease_token: attemptRow.lease_token,
        p_expected_attempt_number: 3,
        p_expected_max_attempts: 3,
        p_expected_retry_base_delay_ms: 1_000,
        p_expected_retry_max_delay_ms: 8_000,
        p_failure_code: "TRANSIENT",
        p_failure_message: "Attempts exhausted.",
        p_failure_retryable: true,
        p_failure_details: { upstreamStatus: 503 },
        p_next_available_at: null,
        p_terminal_failure: {
          code: "TRANSIENT",
          message: "Attempts exhausted.",
          retryable: false,
          originalRetryable: true,
          details: { upstreamStatus: 503 },
          occurredAt: "2026-07-24T21:00:00.000Z",
          attemptNumber: 3,
          reason: "attempts_exhausted",
        },
        p_now: "2026-07-24T21:00:00.000Z",
      },
    },
  ]);
});

test("preserves a top-level __proto__ JSON key as own serializable data", async () => {
  const requestSummary = JSON.parse(
    '{"__proto__":{"admin":true},"provider":"atlaspay"}',
  ) as Job["requestSummary"];
  const store = new SupabaseJobStore(
    new FakeRpcClient([
      {
        data: {
          job: { ...jobRow, request_summary: requestSummary },
          created: true,
        },
        error: null,
      },
    ]),
  );

  const result = await store.enqueue({ job: domainJob() });
  const summary = result.job.requestSummary;

  assert.equal(Object.getPrototypeOf(summary), Object.prototype);
  assert.equal(
    Object.prototype.hasOwnProperty.call(summary, "__proto__"),
    true,
  );
  assert.deepEqual(summary.__proto__, { admin: true });
  assert.equal(summary.admin, undefined);
  assert.equal(
    JSON.stringify(summary),
    '{"__proto__":{"admin":true},"provider":"atlaspay"}',
  );
});

test("preserves nested __proto__ JSON keys without inherited attacker properties", async () => {
  const requestSummary = JSON.parse(
    '{"nested":{"__proto__":{"root":true},"safe":true}}',
  ) as Job["requestSummary"];
  const store = new SupabaseJobStore(
    new FakeRpcClient([
      {
        data: {
          job: { ...jobRow, request_summary: requestSummary },
          created: true,
        },
        error: null,
      },
    ]),
  );

  const result = await store.enqueue({ job: domainJob() });
  const nested = result.job.requestSummary.nested;

  assert.ok(
    nested !== null && typeof nested === "object" && !Array.isArray(nested),
  );
  assert.equal(Object.getPrototypeOf(nested), Object.prototype);
  assert.equal(
    Object.prototype.hasOwnProperty.call(nested, "__proto__"),
    true,
  );
  assert.deepEqual(nested.__proto__, { root: true });
  assert.equal(nested.root, undefined);
  assert.equal(
    JSON.stringify(result.job.requestSummary),
    '{"nested":{"__proto__":{"root":true},"safe":true}}',
  );
});

test("rejects an array where an enqueue scalar object is required", async () => {
  const store = new SupabaseJobStore(
    new FakeRpcClient([
      { data: [{ job: jobRow, created: true }], error: null },
    ]),
  );

  await assert.rejects(
    store.enqueue({ job: domainJob() }),
    /service_enqueue_durable_orchestration_job returned malformed data/,
  );
});

test("rejects null from a non-null transition RPC", async () => {
  const store = new SupabaseJobStore(
    new FakeRpcClient([{ data: null, error: null }]),
  );

  await assert.rejects(
    store.renew({
      jobId: jobRow.id,
      attemptId: attemptRow.id,
      leaseToken: attemptRow.lease_token,
      now: NOW,
      leaseExpiresAt: EXPIRES_AT,
    }),
    /service_renew_orchestration_lease returned malformed data/,
  );
});

test("rejects an invalid database timestamp at the RPC boundary", async () => {
  const store = new SupabaseJobStore(
    new FakeRpcClient([
      {
        data: {
          job: { ...jobRow, available_at: "not-a-timestamp" },
          created: true,
        },
        error: null,
      },
    ]),
  );

  await assert.rejects(
    store.enqueue({ job: domainJob() }),
    /service_enqueue_durable_orchestration_job returned malformed data: job\.available_at/,
  );
});

test("rejects non-object JSON fields at the RPC boundary", async () => {
  const store = new SupabaseJobStore(
    new FakeRpcClient([
      {
        data: {
          job: { ...jobRow, request_summary: ["not", "an", "object"] },
          created: true,
        },
        error: null,
      },
    ]),
  );

  await assert.rejects(
    store.enqueue({ job: domainJob() }),
    /service_enqueue_durable_orchestration_job returned malformed data: job\.request_summary/,
  );
});

test("surfaces non-stale database errors with operation context", async () => {
  const store = new SupabaseJobStore(
    new FakeRpcClient([
      {
        data: null,
        error: {
          code: "23514",
          message: "retry policy constraint violated",
        },
      },
    ]),
  );

  await assert.rejects(
    store.enqueue({ job: domainJob() }),
    {
      message:
        "service_enqueue_durable_orchestration_job failed: retry policy constraint violated",
    },
  );
});
