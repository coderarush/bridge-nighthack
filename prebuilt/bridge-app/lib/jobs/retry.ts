import type { RetryPolicy } from "./model";

const MAX_ATTEMPTS = 20;
const MAX_DELAY_MS = 7 * 24 * 60 * 60 * 1_000;

export function addDateMilliseconds(
  date: Date,
  milliseconds: number,
): Date {
  const timestamp = date.getTime();
  if (!Number.isFinite(timestamp)) {
    throw new TypeError("Cannot derive a deadline from an invalid date.");
  }
  if (!Number.isFinite(milliseconds)) {
    throw new RangeError("Deadline offset must be finite.");
  }

  const result = new Date(timestamp + milliseconds);
  if (!Number.isFinite(result.getTime())) {
    throw new RangeError("Derived deadline exceeds the JavaScript date range.");
  }
  return result;
}

export function validateRetryPolicy(policy: RetryPolicy): void {
  if (
    !Number.isInteger(policy.maxAttempts) ||
    policy.maxAttempts < 1 ||
    policy.maxAttempts > MAX_ATTEMPTS
  ) {
    throw new RangeError(`maxAttempts must be an integer from 1 to ${MAX_ATTEMPTS}.`);
  }
  if (
    !Number.isInteger(policy.baseDelayMs) ||
    policy.baseDelayMs < 1 ||
    policy.baseDelayMs > MAX_DELAY_MS
  ) {
    throw new RangeError(
      `baseDelayMs must be an integer from 1 to ${MAX_DELAY_MS}.`,
    );
  }
  if (
    !Number.isInteger(policy.maxDelayMs) ||
    policy.maxDelayMs < policy.baseDelayMs ||
    policy.maxDelayMs > MAX_DELAY_MS
  ) {
    throw new RangeError(
      `maxDelayMs must be an integer from baseDelayMs to ${MAX_DELAY_MS}.`,
    );
  }
}

export function retryDelayMs(
  policy: RetryPolicy,
  attemptNumber: number,
): number {
  validateRetryPolicy(policy);
  if (
    !Number.isInteger(attemptNumber) ||
    attemptNumber < 1 ||
    attemptNumber > policy.maxAttempts
  ) {
    throw new RangeError(
      "attemptNumber must be an integer within the retry policy.",
    );
  }

  const multiplier = 2 ** (attemptNumber - 1);
  return Math.min(policy.maxDelayMs, policy.baseDelayMs * multiplier);
}
