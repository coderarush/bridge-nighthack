import assert from "node:assert/strict";
import test from "node:test";
import {
  IdempotencyConflictError,
  StaleJobLeaseError,
  type Clock,
  type EnqueueJobInput,
  type JobIds,
  type JobLease,
  type RetryPolicy,
} from "../model";
import { JobCoordinator } from "../coordinator";
import type { StoreFailInput } from "../store";
import { MemoryJobStore } from "./memory-job-store";

const WORKSPACE_ID = "10000000-0000-4000-8000-000000000001";
const REPOSITORY_ID = "20000000-0000-4000-8000-000000000002";
const JOB_IDS = [
  "30000000-0000-4000-8000-000000000001",
  "30000000-0000-4000-8000-000000000002",
  "30000000-0000-4000-8000-000000000003",
  "30000000-0000-4000-8000-000000000004",
  "30000000-0000-4000-8000-000000000005",
];
const ATTEMPT_IDS = [
  "40000000-0000-4000-8000-000000000001",
  "40000000-0000-4000-8000-000000000002",
  "40000000-0000-4000-8000-000000000003",
  "40000000-0000-4000-8000-000000000004",
  "40000000-0000-4000-8000-000000000005",
];
const LEASE_TOKENS = [
  "50000000-0000-4000-8000-000000000001",
  "50000000-0000-4000-8000-000000000002",
  "50000000-0000-4000-8000-000000000003",
  "50000000-0000-4000-8000-000000000004",
  "50000000-0000-4000-8000-000000000005",
];

class MutableClock implements Clock {
  constructor(private current: Date) {}

  now(): Date {
    return new Date(this.current);
  }

  set(iso: string): void {
    this.current = new Date(iso);
  }
}

function queuedIds(): JobIds {
  const jobs = [...JOB_IDS];
  const attempts = [...ATTEMPT_IDS];
  const leases = [...LEASE_TOKENS];
  return {
    jobId: () => jobs.shift()!,
    attemptId: () => attempts.shift()!,
    leaseToken: () => leases.shift()!,
  };
}

function enqueueInput(
  overrides: Partial<EnqueueJobInput> = {},
): EnqueueJobInput {
  return {
    workspaceId: WORKSPACE_ID,
    repositoryId: REPOSITORY_ID,
    recipeId: null,
    providerConnectionId: null,
    sourceDeliveryId: null,
    idempotencyKey: "migration:atlaspay:v2",
    jobType: "repository_migration",
    requestSummary: {
      provider: "atlaspay",
      versions: { from: "v1", to: "v2" },
    },
    priority: 100,
    retryPolicy: {
      maxAttempts: 4,
      baseDelayMs: 1_000,
      maxDelayMs: 4_000,
    },
    ...overrides,
  };
}

function harness(start = "2026-07-24T20:00:00.000Z") {
  const clock = new MutableClock(new Date(start));
  const store = new MemoryJobStore();
  const coordinator = new JobCoordinator({
    store,
    clock,
    ids: queuedIds(),
  });
  return { clock, store, coordinator };
}

function coordinatorWithIds(
  ids: JobIds,
  start = "2026-07-24T20:00:00.000Z",
) {
  const clock = new MutableClock(new Date(start));
  const store = new MemoryJobStore();
  const coordinator = new JobCoordinator({ store, clock, ids });
  return { clock, store, coordinator };
}

test("returns the original job for the same explicit idempotency intent", async () => {
  const { coordinator, store } = harness();

  const first = await coordinator.enqueue(enqueueInput());
  const second = await coordinator.enqueue(
    enqueueInput({
      requestSummary: {
        versions: { to: "v2", from: "v1" },
        provider: "atlaspay",
      },
    }),
  );

  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(second.job.id, first.job.id);
  assert.equal(store.jobs().length, 1);
});

test("canonicalizes distinct Unicode keys with locale-independent ordinal ordering", async () => {
  const { coordinator, store } = harness();
  const composed = "\u00e9";
  const decomposed = "e\u0301";

  const first = await coordinator.enqueue(
    enqueueInput({
      requestSummary: {
        [composed]: "composed",
        [decomposed]: "decomposed",
      },
    }),
  );
  const second = await coordinator.enqueue(
    enqueueInput({
      requestSummary: {
        [decomposed]: "decomposed",
        [composed]: "composed",
      },
    }),
  );

  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(second.job.id, first.job.id);
  assert.equal(store.jobs().length, 1);
});

test("rejects reuse of an idempotency key for different work", async () => {
  const { coordinator } = harness();
  await coordinator.enqueue(enqueueInput());

  await assert.rejects(
    coordinator.enqueue(
      enqueueInput({
        requestSummary: {
          provider: "atlaspay",
          versions: { from: "v1", to: "v3" },
        },
      }),
    ),
    IdempotencyConflictError,
  );
});

test("compares idempotency intent against the cloned candidate across the enqueue await", async () => {
  const { coordinator } = harness();
  await coordinator.enqueue(
    enqueueInput({ requestSummary: { version: 1 } }),
  );

  const mutableInput = enqueueInput({
    requestSummary: { version: 2 },
  });
  const pending = coordinator.enqueue(mutableInput);
  mutableInput.requestSummary = { version: 1 };

  await assert.rejects(pending, IdempotencyConflictError);
});

test("claims once, renews only the live fenced token, and rejects expiration", async () => {
  const { coordinator, clock } = harness();
  const { job } = await coordinator.enqueue(enqueueInput());
  const lease = await coordinator.claim({
    jobId: job.id,
    workerId: "worker-a",
    leaseDurationMs: 30_000,
  });

  assert.ok(lease);
  assert.equal(lease.attempt.attemptNumber, 1);
  assert.equal(lease.attempt.leaseToken, LEASE_TOKENS[0]);
  assert.equal(
    lease.attempt.leaseExpiresAt?.toISOString(),
    "2026-07-24T20:00:30.000Z",
  );

  clock.set("2026-07-24T20:00:10.000Z");
  assert.equal(
    await coordinator.claim({
      jobId: job.id,
      workerId: "worker-b",
      leaseDurationMs: 30_000,
    }),
    null,
  );

  await assert.rejects(
    coordinator.renew(
      {
        ...lease,
        attempt: { ...lease.attempt, leaseToken: LEASE_TOKENS[1] },
      },
      30_000,
    ),
    StaleJobLeaseError,
  );

  const renewed = await coordinator.renew(lease, 30_000);
  assert.equal(
    renewed.attempt.leaseExpiresAt?.toISOString(),
    "2026-07-24T20:00:40.000Z",
  );

  clock.set("2026-07-24T20:00:40.000Z");
  await assert.rejects(
    coordinator.succeed(renewed, { commitSha: "abc123" }),
    StaleJobLeaseError,
  );
});

test("rejects lease deadline overflow before claiming or mutating state", async () => {
  const { coordinator, store } = harness(
    new Date(8.64e15).toISOString(),
  );
  const { job } = await coordinator.enqueue(enqueueInput());

  await assert.rejects(
    coordinator.claim({
      jobId: job.id,
      workerId: "worker-a",
      leaseDurationMs: 1,
    }),
    /date range/i,
  );
  assert.equal(store.job(job.id).status, "queued");
  assert.equal(store.attemptsFor(job.id).length, 0);
});

test("turns an expired lease into a failed attempt and observes retry backoff", async () => {
  const { coordinator, clock, store } = harness();
  const { job } = await coordinator.enqueue(enqueueInput());
  await coordinator.claim({
    jobId: job.id,
    workerId: "worker-a",
    leaseDurationMs: 10_000,
  });

  clock.set("2026-07-24T20:00:10.000Z");
  assert.equal(
    await coordinator.claim({
      jobId: job.id,
      workerId: "worker-b",
      leaseDurationMs: 10_000,
    }),
    null,
  );

  const expiredAttempt = store.attemptsFor(job.id)[0];
  assert.equal(expiredAttempt.status, "failed");
  assert.equal(expiredAttempt.failure?.code, "LEASE_EXPIRED");
  assert.equal(
    store.job(job.id).availableAt.toISOString(),
    "2026-07-24T20:00:11.000Z",
  );

  clock.set("2026-07-24T20:00:10.999Z");
  assert.equal(
    await coordinator.claim({
      jobId: job.id,
      workerId: "worker-b",
      leaseDurationMs: 10_000,
    }),
    null,
  );

  clock.set("2026-07-24T20:00:11.000Z");
  const retryLease = await coordinator.claim({
    jobId: job.id,
    workerId: "worker-b",
    leaseDurationMs: 10_000,
  });
  assert.ok(retryLease);
  assert.equal(retryLease.attempt.attemptNumber, 2);
  assert.equal(retryLease.attempt.leaseToken, LEASE_TOKENS[3]);
});

test("rejects expired-lease retry deadline overflow without partial mutation", async () => {
  const initial = new Date(8.64e15 - 2_000);
  const expiry = new Date(8.64e15 - 1_000);
  const { coordinator, clock, store } = harness(initial.toISOString());
  const { job } = await coordinator.enqueue(
    enqueueInput({
      retryPolicy: {
        maxAttempts: 2,
        baseDelayMs: 2_000,
        maxDelayMs: 2_000,
      },
    }),
  );
  await coordinator.claim({
    jobId: job.id,
    workerId: "worker-a",
    leaseDurationMs: 1_000,
  });
  clock.set(expiry.toISOString());

  await assert.rejects(
    coordinator.claim({
      jobId: job.id,
      workerId: "worker-b",
      leaseDurationMs: 1,
    }),
    /date range/i,
  );
  assert.equal(store.job(job.id).status, "running");
  assert.equal(store.attemptsFor(job.id)[0].status, "running");
});

test("schedules retryable failures with exact capped exponential backoff", async () => {
  const { coordinator, clock, store } = harness();
  const { job } = await coordinator.enqueue(
    enqueueInput({
      retryPolicy: {
        maxAttempts: 4,
        baseDelayMs: 1_000,
        maxDelayMs: 2_500,
      },
    }),
  );

  const expectedAvailability = [
    "2026-07-24T20:00:01.000Z",
    "2026-07-24T20:00:03.000Z",
    "2026-07-24T20:00:05.500Z",
  ];
  let lease: JobLease | null = await coordinator.claim({
    jobId: job.id,
    workerId: "worker-a",
    leaseDurationMs: 30_000,
  });

  for (const availableAt of expectedAvailability) {
    assert.ok(lease);
    const transition = await coordinator.fail(lease, {
      code: "UPSTREAM_UNAVAILABLE",
      message: "Provider API is temporarily unavailable.",
      retryable: true,
      details: { provider: "atlaspay" },
    });
    assert.equal(transition.job.status, "queued");
    assert.equal(transition.job.availableAt.toISOString(), availableAt);
    assert.equal(store.job(job.id).availableAt.toISOString(), availableAt);

    clock.set(availableAt);
    lease = await coordinator.claim({
      jobId: job.id,
      workerId: "worker-a",
      leaseDurationMs: 30_000,
    });
  }

  assert.equal(lease?.attempt.attemptNumber, 4);
});

test("rejects explicit retry deadline overflow without partial mutation", async () => {
  const initial = new Date(8.64e15 - 1_000);
  const { coordinator, store } = harness(initial.toISOString());
  const { job } = await coordinator.enqueue(
    enqueueInput({
      retryPolicy: {
        maxAttempts: 2,
        baseDelayMs: 2_000,
        maxDelayMs: 2_000,
      },
    }),
  );
  const lease = await coordinator.claim({
    jobId: job.id,
    workerId: "worker-a",
    leaseDurationMs: 1,
  });
  assert.ok(lease);

  await assert.rejects(
    coordinator.fail(lease, {
      code: "TRANSIENT",
      message: "Retry later.",
      retryable: true,
    }),
    /date range/i,
  );
  assert.equal(store.job(job.id).status, "running");
  assert.equal(store.attemptsFor(job.id)[0].status, "running");
});

test("rejects a tampered lease attempt number without changing durable state", async () => {
  const { coordinator, store } = harness();
  const { job } = await coordinator.enqueue(enqueueInput());
  const lease = await coordinator.claim({
    jobId: job.id,
    workerId: "worker-a",
    leaseDurationMs: 30_000,
  });
  assert.ok(lease);

  lease.attempt.attemptNumber = 4;
  await assert.rejects(
    coordinator.fail(lease, {
      code: "TRANSIENT",
      message: "Retry later.",
      retryable: true,
    }),
    StaleJobLeaseError,
  );

  assert.equal(store.job(job.id).status, "running");
  assert.equal(store.attemptsFor(job.id)[0].status, "running");
  assert.equal(store.job(job.id).terminalFailure, null);
});

for (const [field, value] of [
  ["maxAttempts", 5],
  ["baseDelayMs", 2_000],
  ["maxDelayMs", 8_000],
] as const satisfies ReadonlyArray<
  readonly [keyof RetryPolicy, number]
>) {
  test(`rejects a tampered lease retry-policy ${field} without changing durable state`, async () => {
    const { coordinator, store } = harness();
    const { job } = await coordinator.enqueue(enqueueInput());
    const lease = await coordinator.claim({
      jobId: job.id,
      workerId: "worker-a",
      leaseDurationMs: 30_000,
    });
    assert.ok(lease);

    lease.job.retryPolicy[field] = value;
    await assert.rejects(
      coordinator.fail(lease, {
        code: "TRANSIENT",
        message: "Retry later.",
        retryable: true,
      }),
      StaleJobLeaseError,
    );

    assert.equal(store.job(job.id).status, "running");
    assert.equal(store.attemptsFor(job.id)[0].status, "running");
    assert.equal(store.job(job.id).terminalFailure, null);
  });
}

test("rejects malformed failure dispositions without changing durable state", async () => {
  const { coordinator, store } = harness();
  const { job } = await coordinator.enqueue(enqueueInput());
  const lease = await coordinator.claim({
    jobId: job.id,
    workerId: "worker-a",
    leaseDurationMs: 30_000,
  });
  assert.ok(lease);

  const malformed = {
    jobId: lease.job.id,
    attemptId: lease.attempt.id,
    leaseToken: lease.attempt.leaseToken,
    now: new Date("2026-07-24T20:00:00.000Z"),
    expectedAttemptNumber: lease.attempt.attemptNumber,
    expectedRetryPolicy: structuredClone(lease.job.retryPolicy),
    failure: {
      code: "TRANSIENT",
      message: "Retry later.",
      retryable: true,
      details: {},
      occurredAt: new Date("2026-07-24T20:00:00.000Z"),
    },
    disposition: {
      kind: "retry",
      nextAvailableAt: new Date("2026-07-24T20:00:01.000Z"),
      terminalFailure: {
        code: "TRANSIENT",
        message: "Retry later.",
        retryable: false,
        originalRetryable: true,
        details: {},
        occurredAt: new Date("2026-07-24T20:00:00.000Z"),
        attemptNumber: 1,
        reason: "attempts_exhausted",
      },
    },
  } as unknown as StoreFailInput;

  await assert.rejects(store.fail(malformed), /disposition/i);
  assert.equal(store.job(job.id).status, "running");
  assert.equal(store.attemptsFor(job.id)[0].status, "running");
});

test("records a structured terminal failure for a non-retryable error", async () => {
  const { coordinator, store } = harness();
  const { job } = await coordinator.enqueue(enqueueInput());
  const lease = await coordinator.claim({
    jobId: job.id,
    workerId: "worker-a",
    leaseDurationMs: 30_000,
  });
  assert.ok(lease);

  const transition = await coordinator.fail(lease, {
    code: "INVALID_RECIPE",
    message: "Recipe validation failed.",
    retryable: false,
    details: { recipeVersion: 7 },
  });

  assert.equal(transition.job.status, "failed");
  assert.deepEqual(transition.job.terminalFailure, {
    code: "INVALID_RECIPE",
    message: "Recipe validation failed.",
    retryable: false,
    originalRetryable: false,
    details: { recipeVersion: 7 },
    occurredAt: new Date("2026-07-24T20:00:00.000Z"),
    attemptNumber: 1,
    reason: "non_retryable",
  });
  assert.equal(store.attemptsFor(job.id)[0].failure?.retryable, false);
  assert.equal(
    await coordinator.claim({
      jobId: job.id,
      workerId: "worker-b",
      leaseDurationMs: 30_000,
    }),
    null,
  );
});

test("records attempts_exhausted when the final retryable attempt fails", async () => {
  const { coordinator, clock } = harness();
  const { job } = await coordinator.enqueue(
    enqueueInput({
      retryPolicy: {
        maxAttempts: 2,
        baseDelayMs: 1_000,
        maxDelayMs: 1_000,
      },
    }),
  );
  const firstLease = await coordinator.claim({
    jobId: job.id,
    workerId: "worker-a",
    leaseDurationMs: 30_000,
  });
  assert.ok(firstLease);
  await coordinator.fail(firstLease, {
    code: "TRANSIENT",
    message: "First failure.",
    retryable: true,
    details: {},
  });

  clock.set("2026-07-24T20:00:01.000Z");
  const finalLease = await coordinator.claim({
    jobId: job.id,
    workerId: "worker-b",
    leaseDurationMs: 30_000,
  });
  assert.ok(finalLease);
  const transition = await coordinator.fail(finalLease, {
    code: "TRANSIENT",
    message: "Second failure.",
    retryable: true,
    details: { upstreamStatus: 503 },
  });

  assert.equal(transition.job.status, "failed");
  assert.deepEqual(transition.job.terminalFailure, {
    code: "TRANSIENT",
    message: "Second failure.",
    retryable: false,
    originalRetryable: true,
    details: { upstreamStatus: 503 },
    occurredAt: new Date("2026-07-24T20:00:01.000Z"),
    attemptNumber: 2,
    reason: "attempts_exhausted",
  });
});

test("completes the job and records result evidence through the live lease", async () => {
  const { coordinator } = harness();
  const { job } = await coordinator.enqueue(enqueueInput());
  const lease = await coordinator.claim({
    jobId: job.id,
    workerId: "worker-a",
    leaseDurationMs: 30_000,
  });
  assert.ok(lease);

  const transition = await coordinator.succeed(lease, {
    commitSha: "abc123",
    pullRequestNumber: 42,
  });

  assert.equal(transition.job.status, "succeeded");
  assert.deepEqual(transition.attempt.resultSummary, {
    commitSha: "abc123",
    pullRequestNumber: 42,
  });
  assert.equal(
    await coordinator.claim({
      jobId: job.id,
      workerId: "worker-b",
      leaseDurationMs: 30_000,
    }),
    null,
  );
});

test("rejects duplicate injected job IDs without overwriting existing jobs", async () => {
  const repeatedJobId = JOB_IDS[0];
  const { coordinator, store } = coordinatorWithIds({
    jobId: () => repeatedJobId,
    attemptId: () => ATTEMPT_IDS[0],
    leaseToken: () => LEASE_TOKENS[0],
  });
  const first = await coordinator.enqueue(
    enqueueInput({ idempotencyKey: "migration:first:v1" }),
  );

  await assert.rejects(
    coordinator.enqueue(
      enqueueInput({ idempotencyKey: "migration:second:v1" }),
    ),
    /job id/i,
  );
  assert.equal(store.jobs().length, 1);
  assert.equal(store.job(first.job.id).idempotencyKey, "migration:first:v1");
});

test("rejects duplicate injected attempt IDs without overwriting history", async () => {
  const { coordinator, clock, store } = coordinatorWithIds({
    jobId: () => JOB_IDS[0],
    attemptId: () => ATTEMPT_IDS[0],
    leaseToken: (() => {
      const tokens = [LEASE_TOKENS[0], LEASE_TOKENS[1]];
      return () => tokens.shift()!;
    })(),
  });
  const { job } = await coordinator.enqueue(
    enqueueInput({
      retryPolicy: {
        maxAttempts: 2,
        baseDelayMs: 1_000,
        maxDelayMs: 1_000,
      },
    }),
  );
  const firstLease = await coordinator.claim({
    jobId: job.id,
    workerId: "worker-a",
    leaseDurationMs: 30_000,
  });
  assert.ok(firstLease);
  await coordinator.fail(firstLease, {
    code: "TRANSIENT",
    message: "Retry later.",
    retryable: true,
  });
  clock.set("2026-07-24T20:00:01.000Z");

  await assert.rejects(
    coordinator.claim({
      jobId: job.id,
      workerId: "worker-b",
      leaseDurationMs: 30_000,
    }),
    /attempt id/i,
  );
  assert.equal(store.job(job.id).status, "queued");
  assert.equal(store.attemptsFor(job.id).length, 1);
  assert.equal(store.attemptsFor(job.id)[0].attemptNumber, 1);
});

test("rejects duplicate injected lease tokens without mutating the queued job", async () => {
  const jobIds = [JOB_IDS[0], JOB_IDS[1]];
  const attemptIds = [ATTEMPT_IDS[0], ATTEMPT_IDS[1]];
  const repeatedLeaseToken = LEASE_TOKENS[0];
  const { coordinator, store } = coordinatorWithIds({
    jobId: () => jobIds.shift()!,
    attemptId: () => attemptIds.shift()!,
    leaseToken: () => repeatedLeaseToken,
  });
  const first = await coordinator.enqueue(
    enqueueInput({ idempotencyKey: "migration:first:v1" }),
  );
  const second = await coordinator.enqueue(
    enqueueInput({ idempotencyKey: "migration:second:v1" }),
  );
  await coordinator.claim({
    jobId: first.job.id,
    workerId: "worker-a",
    leaseDurationMs: 30_000,
  });

  await assert.rejects(
    coordinator.claim({
      jobId: second.job.id,
      workerId: "worker-b",
      leaseDurationMs: 30_000,
    }),
    /lease token/i,
  );
  assert.equal(store.job(second.job.id).status, "queued");
  assert.equal(store.attemptsFor(second.job.id).length, 0);
});
