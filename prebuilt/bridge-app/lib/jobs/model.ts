export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue };

export type JobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export type AttemptStatus =
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export interface RetryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export interface AttemptFailure {
  code: string;
  message: string;
  retryable: boolean;
  details: JsonObject;
  occurredAt: Date;
}

export type TerminalFailureReason =
  | "non_retryable"
  | "attempts_exhausted";

export interface TerminalFailure extends AttemptFailure {
  retryable: false;
  originalRetryable: boolean;
  attemptNumber: number;
  reason: TerminalFailureReason;
}

export interface Job {
  id: string;
  workspaceId: string;
  repositoryId: string;
  recipeId: string | null;
  providerConnectionId: string | null;
  sourceDeliveryId: string | null;
  idempotencyKey: string;
  jobType: string;
  requestSummary: JsonObject;
  status: JobStatus;
  priority: number;
  retryPolicy: RetryPolicy;
  availableAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  terminalFailure: TerminalFailure | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface JobAttempt {
  id: string;
  workspaceId: string;
  jobId: string;
  attemptNumber: number;
  workerId: string;
  status: AttemptStatus;
  leaseToken: string | null;
  leaseExpiresAt: Date | null;
  resultSummary: JsonObject;
  failure: AttemptFailure | null;
  startedAt: Date;
  finishedAt: Date | null;
  createdAt: Date;
}

export interface JobLease {
  job: Job;
  attempt: JobAttempt;
}

export interface EnqueueJobInput {
  workspaceId: string;
  repositoryId: string;
  recipeId?: string | null;
  providerConnectionId?: string | null;
  sourceDeliveryId?: string | null;
  idempotencyKey: string;
  jobType: string;
  requestSummary?: JsonObject;
  priority?: number;
  retryPolicy: RetryPolicy;
}

export interface ClaimJobInput {
  jobId: string;
  workerId: string;
  leaseDurationMs: number;
}

export interface FailureInput {
  code: string;
  message: string;
  retryable: boolean;
  details?: JsonObject;
}

export interface Clock {
  now(): Date;
}

export interface JobIds {
  jobId(): string;
  attemptId(): string;
  leaseToken(): string;
}

export class IdempotencyConflictError extends Error {
  readonly code = "IDEMPOTENCY_CONFLICT";

  constructor() {
    super("Idempotency key is already bound to different work.");
    this.name = "IdempotencyConflictError";
  }
}

export class StaleJobLeaseError extends Error {
  readonly code = "STALE_JOB_LEASE";

  constructor(message = "Job lease is stale, mismatched, or expired.") {
    super(message);
    this.name = "StaleJobLeaseError";
  }
}
