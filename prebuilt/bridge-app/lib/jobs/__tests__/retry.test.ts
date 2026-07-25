import assert from "node:assert/strict";
import test from "node:test";
import { retryDelayMs } from "../retry";

test("calculates deterministic exponential delays capped by the persisted maximum", () => {
  const policy = {
    maxAttempts: 6,
    baseDelayMs: 1_000,
    maxDelayMs: 5_000,
  };

  assert.deepEqual(
    [1, 2, 3, 4, 5, 6].map((attemptNumber) =>
      retryDelayMs(policy, attemptNumber),
    ),
    [1_000, 2_000, 4_000, 5_000, 5_000, 5_000],
  );
});

test("rejects invalid retry policies and attempt numbers", () => {
  assert.throws(
    () =>
      retryDelayMs(
        { maxAttempts: 0, baseDelayMs: 1_000, maxDelayMs: 5_000 },
        1,
      ),
    /maxAttempts/i,
  );
  assert.throws(
    () =>
      retryDelayMs(
        { maxAttempts: 3, baseDelayMs: 0, maxDelayMs: 5_000 },
        1,
      ),
    /baseDelayMs/i,
  );
  assert.throws(
    () =>
      retryDelayMs(
        { maxAttempts: 3, baseDelayMs: 5_001, maxDelayMs: 5_000 },
        1,
      ),
    /maxDelayMs/i,
  );
  assert.throws(
    () =>
      retryDelayMs(
        { maxAttempts: 3, baseDelayMs: 1_000, maxDelayMs: 5_000 },
        0,
      ),
    /attemptNumber/i,
  );
});
