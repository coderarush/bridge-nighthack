import {
  IdempotencyConflictError,
  type ClaimJobInput,
  type Clock,
  type EnqueueJobInput,
  type FailureInput,
  type Job,
  type JobIds,
  type JobLease,
  type JsonObject,
  type JsonValue,
  type TerminalFailure,
} from "./model";
import {
  addDateMilliseconds,
  retryDelayMs,
  validateRetryPolicy,
} from "./retry";
import type {
  EnqueueResult,
  JobStore,
  JobTransition,
} from "./store";

const MAX_LEASE_DURATION_MS = 60 * 60 * 1_000;

interface JobCoordinatorDependencies {
  store: JobStore;
  clock: Clock;
  ids: JobIds;
}

function requireTrimmed(
  value: string,
  name: string,
  minLength: number,
  maxLength: number,
): string {
  const normalized = value.trim();
  if (
    normalized.length < minLength ||
    normalized.length > maxLength
  ) {
    throw new RangeError(
      `${name} must contain ${minLength}-${maxLength} characters.`,
    );
  }
  return normalized;
}

function requireInteger(
  value: number,
  name: string,
  minimum: number,
  maximum: number,
): number {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(
      `${name} must be an integer from ${minimum} to ${maximum}.`,
    );
  }
  return value;
}

function canonicalJson(value: JsonValue): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("JSON numbers must be finite.");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }

  const entries = Object.entries(value)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`);
  return `{${entries.join(",")}}`;
}

function sameIntent(existing: Job, candidate: Job): boolean {
  return (
    existing.workspaceId === candidate.workspaceId &&
    existing.repositoryId === candidate.repositoryId &&
    existing.recipeId === candidate.recipeId &&
    existing.providerConnectionId === candidate.providerConnectionId &&
    existing.sourceDeliveryId === candidate.sourceDeliveryId &&
    existing.idempotencyKey === candidate.idempotencyKey &&
    existing.jobType === candidate.jobType &&
    existing.priority === candidate.priority &&
    existing.retryPolicy.maxAttempts === candidate.retryPolicy.maxAttempts &&
    existing.retryPolicy.baseDelayMs === candidate.retryPolicy.baseDelayMs &&
    existing.retryPolicy.maxDelayMs === candidate.retryPolicy.maxDelayMs &&
    canonicalJson(existing.requestSummary) ===
      canonicalJson(candidate.requestSummary)
  );
}

function copyDate(value: Date): Date {
  const copy = new Date(value);
  if (!Number.isFinite(copy.getTime())) {
    throw new TypeError("Clock returned an invalid date.");
  }
  return copy;
}

function requireLeaseDuration(leaseDurationMs: number): number {
  return requireInteger(
    leaseDurationMs,
    "leaseDurationMs",
    1,
    MAX_LEASE_DURATION_MS,
  );
}

export class JobCoordinator {
  private readonly store: JobStore;
  private readonly clock: Clock;
  private readonly ids: JobIds;

  constructor({ store, clock, ids }: JobCoordinatorDependencies) {
    this.store = store;
    this.clock = clock;
    this.ids = ids;
  }

  async enqueue(input: EnqueueJobInput): Promise<EnqueueResult> {
    validateRetryPolicy(input.retryPolicy);
    const now = copyDate(this.clock.now());
    const job: Job = {
      id: requireTrimmed(this.ids.jobId(), "jobId", 1, 250),
      workspaceId: requireTrimmed(input.workspaceId, "workspaceId", 1, 250),
      repositoryId: requireTrimmed(input.repositoryId, "repositoryId", 1, 250),
      recipeId: input.recipeId?.trim() || null,
      providerConnectionId: input.providerConnectionId?.trim() || null,
      sourceDeliveryId: input.sourceDeliveryId?.trim() || null,
      idempotencyKey: requireTrimmed(
        input.idempotencyKey,
        "idempotencyKey",
        8,
        250,
      ),
      jobType: requireTrimmed(input.jobType, "jobType", 1, 80),
      requestSummary: structuredClone(input.requestSummary ?? {}),
      status: "queued",
      priority: requireInteger(input.priority ?? 100, "priority", 0, 1_000),
      retryPolicy: structuredClone(input.retryPolicy),
      availableAt: copyDate(now),
      startedAt: null,
      finishedAt: null,
      terminalFailure: null,
      createdAt: copyDate(now),
      updatedAt: copyDate(now),
    };
    canonicalJson(job.requestSummary);

    const result = await this.store.enqueue({ job });
    if (!result.created && !sameIntent(result.job, job)) {
      throw new IdempotencyConflictError();
    }
    return result;
  }

  async claim(input: ClaimJobInput): Promise<JobLease | null> {
    const now = copyDate(this.clock.now());
    const leaseDurationMs = requireLeaseDuration(input.leaseDurationMs);
    return this.store.claim({
      jobId: requireTrimmed(input.jobId, "jobId", 1, 250),
      workerId: requireTrimmed(input.workerId, "workerId", 1, 160),
      attemptId: requireTrimmed(this.ids.attemptId(), "attemptId", 1, 250),
      leaseToken: requireTrimmed(
        this.ids.leaseToken(),
        "leaseToken",
        1,
        250,
      ),
      now,
      leaseExpiresAt: addDateMilliseconds(now, leaseDurationMs),
    });
  }

  async renew(lease: JobLease, leaseDurationMs: number): Promise<JobLease> {
    const now = copyDate(this.clock.now());
    const duration = requireLeaseDuration(leaseDurationMs);
    return this.store.renew({
      ...this.leaseIdentity(lease),
      now,
      leaseExpiresAt: addDateMilliseconds(now, duration),
    });
  }

  async succeed(
    lease: JobLease,
    resultSummary: JsonObject = {},
  ): Promise<JobTransition> {
    canonicalJson(resultSummary);
    return this.store.succeed({
      ...this.leaseIdentity(lease),
      now: copyDate(this.clock.now()),
      resultSummary: structuredClone(resultSummary),
    });
  }

  async fail(
    lease: JobLease,
    input: FailureInput,
  ): Promise<JobTransition> {
    const now = copyDate(this.clock.now());
    const code = requireTrimmed(input.code, "failure code", 1, 160);
    const message = requireTrimmed(input.message, "failure message", 1, 4_000);
    const details = structuredClone(input.details ?? {});
    canonicalJson(details);

    const failure = {
      code,
      message,
      retryable: input.retryable,
      details,
      occurredAt: copyDate(now),
    };
    const canRetry =
      input.retryable &&
      lease.attempt.attemptNumber < lease.job.retryPolicy.maxAttempts;
    const disposition = canRetry
      ? {
          kind: "retry" as const,
          nextAvailableAt: addDateMilliseconds(
            now,
            retryDelayMs(
              lease.job.retryPolicy,
              lease.attempt.attemptNumber,
            ),
          ),
        }
      : {
          kind: "terminal" as const,
          terminalFailure: {
            ...failure,
            retryable: false,
            originalRetryable: input.retryable,
            attemptNumber: lease.attempt.attemptNumber,
            reason: input.retryable
              ? "attempts_exhausted"
              : "non_retryable",
          } satisfies TerminalFailure,
        };

    return this.store.fail({
      ...this.leaseIdentity(lease),
      now,
      expectedAttemptNumber: lease.attempt.attemptNumber,
      expectedRetryPolicy: structuredClone(lease.job.retryPolicy),
      failure,
      disposition,
    });
  }

  private leaseIdentity(lease: JobLease) {
    return {
      jobId: requireTrimmed(lease.job.id, "jobId", 1, 250),
      attemptId: requireTrimmed(lease.attempt.id, "attemptId", 1, 250),
      leaseToken: requireTrimmed(
        lease.attempt.leaseToken ?? "",
        "leaseToken",
        1,
        250,
      ),
    };
  }
}
