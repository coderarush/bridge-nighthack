import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DemoResetError,
  requireDemoResetTarget,
  resetDemoRun,
  type DemoResetExecutor,
} from "../reset";

const DEMO_RUN_ID = "f1386415-3de2-41ad-b499-36261d2eec91";

test("requires demo mode and an explicitly configured run id", () => {
  assert.throws(
    () =>
      requireDemoResetTarget(DEMO_RUN_ID, {
        DEMO_MODE: "false",
        NEXT_PUBLIC_DEMO_RUN_ID: DEMO_RUN_ID,
      }),
    (error: unknown) =>
      error instanceof DemoResetError && error.code === "DEMO_MODE_DISABLED",
  );

  assert.throws(
    () =>
      requireDemoResetTarget(DEMO_RUN_ID, {
        DEMO_MODE: "true",
      }),
    (error: unknown) =>
      error instanceof DemoResetError &&
      error.code === "DEMO_RUN_NOT_CONFIGURED",
  );
});

test("only permits the exact configured demo run", () => {
  assert.throws(
    () =>
      requireDemoResetTarget("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", {
        DEMO_MODE: "true",
        NEXT_PUBLIC_DEMO_RUN_ID: DEMO_RUN_ID,
      }),
    (error: unknown) =>
      error instanceof DemoResetError && error.code === "RUN_NOT_RESETTABLE",
  );

  assert.equal(
    requireDemoResetTarget(DEMO_RUN_ID, {
      DEMO_MODE: "true",
      NEXT_PUBLIC_DEMO_RUN_ID: ` ${DEMO_RUN_ID} `,
    }),
    DEMO_RUN_ID,
  );
});

test("rejects malformed configured run ids", () => {
  assert.throws(
    () =>
      requireDemoResetTarget("not-a-uuid", {
        DEMO_MODE: "true",
        NEXT_PUBLIC_DEMO_RUN_ID: "not-a-uuid",
      }),
    (error: unknown) =>
      error instanceof DemoResetError &&
      error.code === "DEMO_RUN_NOT_CONFIGURED",
  );
});

test("executes the transactional reset and states that GitHub is preserved", async () => {
  const calls: string[] = [];
  const execute: DemoResetExecutor = async (runId) => {
    calls.push(runId);
    return { runId, status: "analyzing_change" };
  };

  const first = await resetDemoRun(
    DEMO_RUN_ID,
    {
      DEMO_MODE: "true",
      NEXT_PUBLIC_DEMO_RUN_ID: DEMO_RUN_ID,
    },
    execute,
  );
  const second = await resetDemoRun(
    DEMO_RUN_ID,
    {
      DEMO_MODE: "true",
      NEXT_PUBLIC_DEMO_RUN_ID: DEMO_RUN_ID,
    },
    execute,
  );

  assert.deepEqual(calls, [DEMO_RUN_ID, DEMO_RUN_ID]);
  assert.deepEqual(first, second);
  assert.deepEqual(first, {
    runId: DEMO_RUN_ID,
    status: "analyzing_change",
    githubArtifacts: "preserved",
    warning:
      "Database demo state was reset. Existing GitHub branches, commits, pull requests, and checks were not deleted.",
  });
});

test("reports a missing configured run without fabricating success", async () => {
  await assert.rejects(
    () =>
      resetDemoRun(
        DEMO_RUN_ID,
        {
          DEMO_MODE: "true",
          NEXT_PUBLIC_DEMO_RUN_ID: DEMO_RUN_ID,
        },
        async () => null,
      ),
    (error: unknown) =>
      error instanceof DemoResetError && error.code === "RUN_NOT_FOUND",
  );
});
