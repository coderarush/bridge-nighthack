import { StaleJobLeaseError } from "./model";
import type {
  AttemptFailure,
  AttemptStatus,
  Job,
  JobAttempt,
  JobLease,
  JobStatus,
  JsonObject,
  JsonValue,
  TerminalFailure,
  TerminalFailureReason,
} from "./model";
import type {
  EnqueueResult,
  JobStore,
  JobTransition,
  StoreClaimInput,
  StoreEnqueueInput,
  StoreFailInput,
  StoreRenewInput,
  StoreSucceedInput,
} from "./store";

type RpcError = {
  message: string;
  code?: string;
};

type RpcResponse = {
  data: unknown;
  error: RpcError | null;
};

export interface JobRpcClient {
  rpc(
    functionName: string,
    args: Record<string, unknown>,
  ): PromiseLike<RpcResponse>;
}

const JOB_STATUSES: readonly JobStatus[] = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
];
const ATTEMPT_STATUSES: readonly AttemptStatus[] = [
  "running",
  "succeeded",
  "failed",
  "cancelled",
];
const TERMINAL_REASONS: readonly TerminalFailureReason[] = [
  "non_retryable",
  "attempts_exhausted",
];

type UnknownRecord = Record<string, unknown>;

function malformed(
  operation: string,
  path: string,
  expectation: string,
): never {
  throw new Error(
    `${operation} returned malformed data: ${path} ${expectation}.`,
  );
}

function isPlainObject(value: unknown): value is UnknownRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requireObject(
  value: unknown,
  operation: string,
  path: string,
): UnknownRecord {
  if (!isPlainObject(value)) {
    malformed(operation, path, "must be an object");
  }
  return value;
}

function requireExactKeys(
  value: UnknownRecord,
  keys: readonly string[],
  operation: string,
  path: string,
): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    malformed(
      operation,
      path,
      `must contain exactly ${expected.join(", ")}`,
    );
  }
}

function requireString(
  value: unknown,
  operation: string,
  path: string,
): string {
  if (typeof value !== "string") {
    malformed(operation, path, "must be a string");
  }
  return value;
}

function requireNullableString(
  value: unknown,
  operation: string,
  path: string,
): string | null {
  if (value === null) return null;
  return requireString(value, operation, path);
}

function requireBoolean(
  value: unknown,
  operation: string,
  path: string,
): boolean {
  if (typeof value !== "boolean") {
    malformed(operation, path, "must be a boolean");
  }
  return value;
}

function requireInteger(
  value: unknown,
  operation: string,
  path: string,
): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    malformed(operation, path, "must be a safe integer");
  }
  return value;
}

function requireEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  operation: string,
  path: string,
): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    malformed(operation, path, `must be one of ${allowed.join(", ")}`);
  }
  return value as T;
}

function requireDate(
  value: unknown,
  operation: string,
  path: string,
): Date {
  const source = requireString(value, operation, path);
  const date = new Date(source);
  if (!Number.isFinite(date.getTime())) {
    malformed(operation, path, "must be a valid timestamp");
  }
  return date;
}

function requireNullableDate(
  value: unknown,
  operation: string,
  path: string,
): Date | null {
  if (value === null) return null;
  return requireDate(value, operation, path);
}

function parseJsonValue(
  value: unknown,
  operation: string,
  path: string,
  ancestors: Set<object>,
): JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      malformed(operation, path, "must contain finite JSON numbers");
    }
    return value;
  }
  if (Array.isArray(value)) {
    if (ancestors.has(value)) {
      malformed(operation, path, "must not contain cycles");
    }
    ancestors.add(value);
    const parsed = value.map((entry, index) =>
      parseJsonValue(entry, operation, `${path}[${index}]`, ancestors)
    );
    ancestors.delete(value);
    return parsed;
  }
  if (!isPlainObject(value)) {
    malformed(operation, path, "must contain only JSON values");
  }
  if (ancestors.has(value)) {
    malformed(operation, path, "must not contain cycles");
  }
  ancestors.add(value);
  const parsed: JsonObject = {};
  for (const [key, entry] of Object.entries(value)) {
    const parsedEntry = parseJsonValue(
      entry,
      operation,
      `${path}.${key}`,
      ancestors,
    );
    Object.defineProperty(parsed, key, {
      value: parsedEntry,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  ancestors.delete(value);
  return parsed;
}

function requireJsonObject(
  value: unknown,
  operation: string,
  path: string,
): JsonObject {
  if (!isPlainObject(value)) {
    malformed(operation, path, "must be a JSON object");
  }
  return parseJsonValue(value, operation, path, new Set()) as JsonObject;
}

function parseTerminalFailure(
  value: unknown,
  operation: string,
  path: string,
): TerminalFailure | null {
  if (value === null) return null;
  const row = requireObject(value, operation, path);
  requireExactKeys(
    row,
    [
      "code",
      "message",
      "retryable",
      "originalRetryable",
      "details",
      "occurredAt",
      "attemptNumber",
      "reason",
    ],
    operation,
    path,
  );
  if (row.retryable !== false) {
    malformed(operation, `${path}.retryable`, "must be false");
  }
  return {
    code: requireString(row.code, operation, `${path}.code`),
    message: requireString(row.message, operation, `${path}.message`),
    retryable: false,
    originalRetryable: requireBoolean(
      row.originalRetryable,
      operation,
      `${path}.originalRetryable`,
    ),
    details: requireJsonObject(row.details, operation, `${path}.details`),
    occurredAt: requireDate(
      row.occurredAt,
      operation,
      `${path}.occurredAt`,
    ),
    attemptNumber: requireInteger(
      row.attemptNumber,
      operation,
      `${path}.attemptNumber`,
    ),
    reason: requireEnum(
      row.reason,
      TERMINAL_REASONS,
      operation,
      `${path}.reason`,
    ),
  };
}

function parseJob(value: unknown, operation: string, path: string): Job {
  const row = requireObject(value, operation, path);
  return {
    id: requireString(row.id, operation, `${path}.id`),
    workspaceId: requireString(
      row.workspace_id,
      operation,
      `${path}.workspace_id`,
    ),
    repositoryId: requireString(
      row.repository_id,
      operation,
      `${path}.repository_id`,
    ),
    recipeId: requireNullableString(
      row.recipe_id,
      operation,
      `${path}.recipe_id`,
    ),
    providerConnectionId: requireNullableString(
      row.provider_connection_id,
      operation,
      `${path}.provider_connection_id`,
    ),
    sourceDeliveryId: requireNullableString(
      row.source_delivery_id,
      operation,
      `${path}.source_delivery_id`,
    ),
    idempotencyKey: requireString(
      row.idempotency_key,
      operation,
      `${path}.idempotency_key`,
    ),
    jobType: requireString(row.job_type, operation, `${path}.job_type`),
    requestSummary: requireJsonObject(
      row.request_summary,
      operation,
      `${path}.request_summary`,
    ),
    status: requireEnum(row.status, JOB_STATUSES, operation, `${path}.status`),
    priority: requireInteger(row.priority, operation, `${path}.priority`),
    retryPolicy: {
      maxAttempts: requireInteger(
        row.max_attempts,
        operation,
        `${path}.max_attempts`,
      ),
      baseDelayMs: requireInteger(
        row.retry_base_delay_ms,
        operation,
        `${path}.retry_base_delay_ms`,
      ),
      maxDelayMs: requireInteger(
        row.retry_max_delay_ms,
        operation,
        `${path}.retry_max_delay_ms`,
      ),
    },
    availableAt: requireDate(
      row.available_at,
      operation,
      `${path}.available_at`,
    ),
    startedAt: requireNullableDate(
      row.started_at,
      operation,
      `${path}.started_at`,
    ),
    finishedAt: requireNullableDate(
      row.finished_at,
      operation,
      `${path}.finished_at`,
    ),
    terminalFailure: parseTerminalFailure(
      row.terminal_failure,
      operation,
      `${path}.terminal_failure`,
    ),
    createdAt: requireDate(row.created_at, operation, `${path}.created_at`),
    updatedAt: requireDate(row.updated_at, operation, `${path}.updated_at`),
  };
}

function parseAttemptFailure(
  row: UnknownRecord,
  operation: string,
  path: string,
  finishedAt: Date | null,
  createdAt: Date,
): AttemptFailure | null {
  const code = row.error_code;
  const message = row.error_message;
  const retryable = row.retryable;
  if (code === null && message === null && retryable === null) return null;
  if (
    typeof code !== "string" ||
    typeof message !== "string" ||
    typeof retryable !== "boolean"
  ) {
    malformed(
      operation,
      `${path}.failure`,
      "must have string code/message and boolean retryable, or all null",
    );
  }
  return {
    code,
    message,
    retryable,
    details: requireJsonObject(
      row.failure_details,
      operation,
      `${path}.failure_details`,
    ),
    occurredAt: finishedAt ?? createdAt,
  };
}

function parseAttempt(
  value: unknown,
  operation: string,
  path: string,
): JobAttempt {
  const row = requireObject(value, operation, path);
  const finishedAt = requireNullableDate(
    row.finished_at,
    operation,
    `${path}.finished_at`,
  );
  const createdAt = requireDate(
    row.created_at,
    operation,
    `${path}.created_at`,
  );
  const failureDetails = requireJsonObject(
    row.failure_details,
    operation,
    `${path}.failure_details`,
  );
  const failure = parseAttemptFailure(
    { ...row, failure_details: failureDetails },
    operation,
    path,
    finishedAt,
    createdAt,
  );

  return {
    id: requireString(row.id, operation, `${path}.id`),
    workspaceId: requireString(
      row.workspace_id,
      operation,
      `${path}.workspace_id`,
    ),
    jobId: requireString(row.job_id, operation, `${path}.job_id`),
    attemptNumber: requireInteger(
      row.attempt_number,
      operation,
      `${path}.attempt_number`,
    ),
    workerId: requireString(row.worker_id, operation, `${path}.worker_id`),
    status: requireEnum(
      row.status,
      ATTEMPT_STATUSES,
      operation,
      `${path}.status`,
    ),
    leaseToken: requireNullableString(
      row.lease_token,
      operation,
      `${path}.lease_token`,
    ),
    leaseExpiresAt: requireNullableDate(
      row.lease_expires_at,
      operation,
      `${path}.lease_expires_at`,
    ),
    resultSummary: requireJsonObject(
      row.result_summary,
      operation,
      `${path}.result_summary`,
    ),
    failure,
    startedAt: requireDate(row.started_at, operation, `${path}.started_at`),
    finishedAt,
    createdAt,
  };
}

function parseTransition(
  value: unknown,
  operation: string,
): JobTransition {
  const response = requireObject(value, operation, "result");
  requireExactKeys(response, ["job", "attempt"], operation, "result");
  return {
    job: parseJob(response.job, operation, "job"),
    attempt: parseAttempt(response.attempt, operation, "attempt"),
  };
}

function parseEnqueueResult(
  value: unknown,
  operation: string,
): EnqueueResult {
  const response = requireObject(value, operation, "result");
  requireExactKeys(response, ["job", "created"], operation, "result");
  return {
    job: parseJob(response.job, operation, "job"),
    created: requireBoolean(response.created, operation, "created"),
  };
}

function serializeTerminalFailure(
  failure: TerminalFailure,
): Record<string, unknown> {
  return {
    code: failure.code,
    message: failure.message,
    retryable: failure.retryable,
    originalRetryable: failure.originalRetryable,
    details: failure.details,
    occurredAt: failure.occurredAt.toISOString(),
    attemptNumber: failure.attemptNumber,
    reason: failure.reason,
  };
}

function isStaleLeaseError(error: RpcError): boolean {
  const message = error.message.toLowerCase();
  return (
    error.code === "55000" &&
    message.includes("lease") &&
    (message.includes("stale") || message.includes("expired"))
  );
}

export class SupabaseJobStore implements JobStore {
  constructor(private readonly client: JobRpcClient) {}

  async enqueue(input: StoreEnqueueInput): Promise<EnqueueResult> {
    const operation = "service_enqueue_durable_orchestration_job";
    const job = input.job;
    const data = await this.call(operation, {
      p_job_id: job.id,
      p_workspace_id: job.workspaceId,
      p_repository_id: job.repositoryId,
      p_recipe_id: job.recipeId,
      p_provider_connection_id: job.providerConnectionId,
      p_source_delivery_id: job.sourceDeliveryId,
      p_idempotency_key: job.idempotencyKey,
      p_job_type: job.jobType,
      p_request_summary: job.requestSummary,
      p_priority: job.priority,
      p_max_attempts: job.retryPolicy.maxAttempts,
      p_retry_base_delay_ms: job.retryPolicy.baseDelayMs,
      p_retry_max_delay_ms: job.retryPolicy.maxDelayMs,
      p_now: job.createdAt.toISOString(),
    });
    return parseEnqueueResult(data, operation);
  }

  async claim(input: StoreClaimInput): Promise<JobLease | null> {
    const operation = "service_claim_orchestration_job";
    const data = await this.call(operation, {
      p_job_id: input.jobId,
      p_worker_id: input.workerId,
      p_attempt_id: input.attemptId,
      p_lease_token: input.leaseToken,
      p_now: input.now.toISOString(),
      p_lease_expires_at: input.leaseExpiresAt.toISOString(),
    });
    return data === null ? null : parseTransition(data, operation);
  }

  async renew(input: StoreRenewInput): Promise<JobLease> {
    const operation = "service_renew_orchestration_lease";
    const data = await this.call(operation, {
      p_job_id: input.jobId,
      p_attempt_id: input.attemptId,
      p_lease_token: input.leaseToken,
      p_lease_expires_at: input.leaseExpiresAt.toISOString(),
      p_now: input.now.toISOString(),
    });
    return parseTransition(data, operation);
  }

  async succeed(input: StoreSucceedInput): Promise<JobTransition> {
    const operation = "service_complete_orchestration_attempt";
    const data = await this.call(operation, {
      p_job_id: input.jobId,
      p_attempt_id: input.attemptId,
      p_lease_token: input.leaseToken,
      p_result_summary: input.resultSummary,
      p_now: input.now.toISOString(),
    });
    return parseTransition(data, operation);
  }

  async fail(input: StoreFailInput): Promise<JobTransition> {
    const operation = "service_fail_orchestration_attempt";
    const terminalFailure =
      input.disposition.kind === "terminal"
        ? serializeTerminalFailure(input.disposition.terminalFailure)
        : null;
    const nextAvailableAt =
      input.disposition.kind === "retry"
        ? input.disposition.nextAvailableAt.toISOString()
        : null;
    const data = await this.call(operation, {
      p_job_id: input.jobId,
      p_attempt_id: input.attemptId,
      p_lease_token: input.leaseToken,
      p_expected_attempt_number: input.expectedAttemptNumber,
      p_expected_max_attempts: input.expectedRetryPolicy.maxAttempts,
      p_expected_retry_base_delay_ms: input.expectedRetryPolicy.baseDelayMs,
      p_expected_retry_max_delay_ms: input.expectedRetryPolicy.maxDelayMs,
      p_failure_code: input.failure.code,
      p_failure_message: input.failure.message,
      p_failure_retryable: input.failure.retryable,
      p_failure_details: input.failure.details,
      p_next_available_at: nextAvailableAt,
      p_terminal_failure: terminalFailure,
      p_now: input.now.toISOString(),
    });
    return parseTransition(data, operation);
  }

  private async call(
    operation: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    const { data, error } = await this.client.rpc(operation, args);
    if (error) {
      if (isStaleLeaseError(error)) {
        throw new StaleJobLeaseError(error.message);
      }
      throw new Error(`${operation} failed: ${error.message}`);
    }
    return data;
  }
}
