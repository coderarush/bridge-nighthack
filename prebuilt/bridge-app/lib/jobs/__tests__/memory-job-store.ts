import type {
  AttemptFailure,
  Job,
  JobAttempt,
  JobLease,
  TerminalFailure,
} from "../model";
import { StaleJobLeaseError } from "../model";
import { addDateMilliseconds, retryDelayMs } from "../retry";
import type {
  EnqueueResult,
  JobStore,
  JobTransition,
  StoreClaimInput,
  StoreEnqueueInput,
  StoreFailInput,
  StoreRenewInput,
  StoreSucceedInput,
} from "../store";

function copy<T>(value: T): T {
  return structuredClone(value);
}

export class MemoryJobStore implements JobStore {
  private readonly jobsById = new Map<string, Job>();
  private readonly attemptsById = new Map<string, JobAttempt>();
  private readonly jobIdByKey = new Map<string, string>();

  async enqueue(input: StoreEnqueueInput): Promise<EnqueueResult> {
    const key = `${input.job.workspaceId}\u0000${input.job.idempotencyKey}`;
    const existingId = this.jobIdByKey.get(key);
    if (existingId) {
      return { job: copy(this.jobsById.get(existingId)!), created: false };
    }
    if (this.jobsById.has(input.job.id)) {
      throw new Error("Duplicate job ID.");
    }

    this.jobsById.set(input.job.id, copy(input.job));
    this.jobIdByKey.set(key, input.job.id);
    return { job: copy(input.job), created: true };
  }

  async claim(input: StoreClaimInput): Promise<JobLease | null> {
    const job = this.jobsById.get(input.jobId);
    if (!job || ["succeeded", "failed", "cancelled"].includes(job.status)) {
      return null;
    }

    if (job.status === "running") {
      const activeAttempt = this.latestAttempt(job.id);
      if (
        !activeAttempt ||
        activeAttempt.status !== "running" ||
        activeAttempt.leaseExpiresAt === null
      ) {
        throw new Error("Running job has no active leased attempt.");
      }
      if (activeAttempt.leaseExpiresAt.getTime() > input.now.getTime()) {
        return null;
      }

      const leaseFailure: AttemptFailure = {
        code: "LEASE_EXPIRED",
        message: "Worker lease expired before completion.",
        retryable: true,
        details: {
          workerId: activeAttempt.workerId,
          leaseExpiredAt: activeAttempt.leaseExpiresAt.toISOString(),
        },
        occurredAt: copy(input.now),
      };
      const nextAvailableAt =
        activeAttempt.attemptNumber < job.retryPolicy.maxAttempts
          ? addDateMilliseconds(
              input.now,
              retryDelayMs(job.retryPolicy, activeAttempt.attemptNumber),
            )
          : null;
      activeAttempt.status = "failed";
      activeAttempt.failure = leaseFailure;
      activeAttempt.finishedAt = copy(input.now);

      if (nextAvailableAt === null) {
        const terminalFailure: TerminalFailure = {
          ...leaseFailure,
          retryable: false,
          originalRetryable: true,
          attemptNumber: activeAttempt.attemptNumber,
          reason: "attempts_exhausted",
        };
        job.status = "failed";
        job.finishedAt = copy(input.now);
        job.updatedAt = copy(input.now);
        job.terminalFailure = terminalFailure;
        return null;
      }

      job.status = "queued";
      job.availableAt = nextAvailableAt;
      job.updatedAt = copy(input.now);
      return null;
    }

    if (job.availableAt.getTime() > input.now.getTime()) return null;

    const attemptNumber = this.attemptsFor(job.id).length + 1;
    if (attemptNumber > job.retryPolicy.maxAttempts) return null;
    if (this.attemptsById.has(input.attemptId)) {
      throw new Error("Duplicate attempt ID.");
    }
    if (
      [...this.attemptsById.values()].some(
        (attempt) => attempt.leaseToken === input.leaseToken,
      )
    ) {
      throw new Error("Duplicate lease token.");
    }

    const attempt: JobAttempt = {
      id: input.attemptId,
      workspaceId: job.workspaceId,
      jobId: job.id,
      attemptNumber,
      workerId: input.workerId,
      status: "running",
      leaseToken: input.leaseToken,
      leaseExpiresAt: copy(input.leaseExpiresAt),
      resultSummary: {},
      failure: null,
      startedAt: copy(input.now),
      finishedAt: null,
      createdAt: copy(input.now),
    };
    this.attemptsById.set(attempt.id, attempt);
    job.status = "running";
    job.startedAt ??= copy(input.now);
    job.finishedAt = null;
    job.updatedAt = copy(input.now);

    return { job: copy(job), attempt: copy(attempt) };
  }

  async renew(input: StoreRenewInput): Promise<JobLease> {
    const { job, attempt } = this.requireLiveLease(input);
    attempt.leaseExpiresAt = copy(input.leaseExpiresAt);
    job.updatedAt = copy(input.now);
    return { job: copy(job), attempt: copy(attempt) };
  }

  async succeed(input: StoreSucceedInput): Promise<JobTransition> {
    const { job, attempt } = this.requireLiveLease(input);
    attempt.status = "succeeded";
    attempt.resultSummary = copy(input.resultSummary);
    attempt.finishedAt = copy(input.now);
    job.status = "succeeded";
    job.finishedAt = copy(input.now);
    job.updatedAt = copy(input.now);
    job.terminalFailure = null;
    return { job: copy(job), attempt: copy(attempt) };
  }

  async fail(input: StoreFailInput): Promise<JobTransition> {
    this.validateFailureDisposition(input);
    const { job, attempt } = this.requireLiveLease(input);
    if (
      attempt.attemptNumber !== input.expectedAttemptNumber ||
      job.retryPolicy.maxAttempts !== input.expectedRetryPolicy.maxAttempts ||
      job.retryPolicy.baseDelayMs !== input.expectedRetryPolicy.baseDelayMs ||
      job.retryPolicy.maxDelayMs !== input.expectedRetryPolicy.maxDelayMs
    ) {
      throw new StaleJobLeaseError();
    }

    attempt.status = "failed";
    attempt.failure = copy(input.failure);
    attempt.finishedAt = copy(input.now);
    job.updatedAt = copy(input.now);

    if (input.disposition.kind === "retry") {
      job.status = "queued";
      job.availableAt = copy(input.disposition.nextAvailableAt);
      job.finishedAt = null;
      job.terminalFailure = null;
    } else {
      job.status = "failed";
      job.finishedAt = copy(input.now);
      job.terminalFailure = copy(input.disposition.terminalFailure);
    }

    return { job: copy(job), attempt: copy(attempt) };
  }

  job(jobId: string): Job {
    return copy(this.jobsById.get(jobId)!);
  }

  jobs(): Job[] {
    return [...this.jobsById.values()].map(copy);
  }

  attemptsFor(jobId: string): JobAttempt[] {
    return [...this.attemptsById.values()]
      .filter((attempt) => attempt.jobId === jobId)
      .sort((left, right) => left.attemptNumber - right.attemptNumber)
      .map(copy);
  }

  private latestAttempt(jobId: string): JobAttempt | undefined {
    const attempts = [...this.attemptsById.values()]
      .filter((attempt) => attempt.jobId === jobId)
      .sort((left, right) => right.attemptNumber - left.attemptNumber);
    return attempts[0];
  }

  private validateFailureDisposition(input: StoreFailInput): void {
    const disposition = input.disposition as
      | (StoreFailInput["disposition"] & Record<string, unknown>)
      | null
      | undefined;
    if (
      !disposition ||
      (disposition.kind !== "retry" && disposition.kind !== "terminal")
    ) {
      throw new TypeError("Failure disposition must be retry or terminal.");
    }
    if (
      disposition.kind === "retry" &&
      (!(disposition.nextAvailableAt instanceof Date) ||
        !Number.isFinite(disposition.nextAvailableAt.getTime()) ||
        "terminalFailure" in disposition)
    ) {
      throw new TypeError("Retry disposition is inconsistent.");
    }
    if (
      disposition.kind === "terminal" &&
      (!disposition.terminalFailure ||
        "nextAvailableAt" in disposition)
    ) {
      throw new TypeError("Terminal disposition is inconsistent.");
    }
  }

  private requireLiveLease(input: {
    jobId: string;
    attemptId: string;
    leaseToken: string;
    now: Date;
  }): { job: Job; attempt: JobAttempt } {
    const job = this.jobsById.get(input.jobId);
    const attempt = this.attemptsById.get(input.attemptId);
    if (
      !job ||
      !attempt ||
      attempt.jobId !== job.id ||
      job.status !== "running" ||
      attempt.status !== "running" ||
      attempt.leaseToken !== input.leaseToken ||
      !attempt.leaseExpiresAt ||
      attempt.leaseExpiresAt.getTime() <= input.now.getTime()
    ) {
      throw new StaleJobLeaseError();
    }
    return { job, attempt };
  }
}
