import assert from "node:assert/strict";
import test from "node:test";
import { isPublicDemoRun } from "../public-access";

const RUN_ID = "f1386415-3de2-41ad-b499-36261d2eec91";

test("allows anonymous reads only for the configured demo run", () => {
  const env = {
    DEMO_MODE: "true",
    NEXT_PUBLIC_DEMO_RUN_ID: RUN_ID,
  };

  assert.equal(isPublicDemoRun(RUN_ID, env), true);
  assert.equal(isPublicDemoRun("another-run", env), false);
});

test("fails closed outside demo mode or without an exact run id", () => {
  assert.equal(
    isPublicDemoRun(RUN_ID, {
      DEMO_MODE: "false",
      NEXT_PUBLIC_DEMO_RUN_ID: RUN_ID,
    }),
    false,
  );
  assert.equal(isPublicDemoRun(RUN_ID, { DEMO_MODE: "true" }), false);
});
