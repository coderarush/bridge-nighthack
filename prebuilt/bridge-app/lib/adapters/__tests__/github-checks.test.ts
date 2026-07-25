import assert from "node:assert/strict";
import test from "node:test";
import { evaluateRequiredCheckRuns } from "../github-checks";

const fallback = "https://github.com/coderarush/atlas-store-demo/checks";

test("does not accept unrelated successful checks", () => {
  assert.deepEqual(
    evaluateRequiredCheckRuns(
      [
        {
          name: "lint",
          status: "completed",
          conclusion: "success",
          html_url: "https://github.com/checks/1",
        },
      ],
      "build",
      fallback,
    ),
    { status: "queued", url: fallback },
  );
});

test("requires the named check to complete successfully", () => {
  assert.deepEqual(
    evaluateRequiredCheckRuns(
      [
        {
          name: "build",
          status: "completed",
          conclusion: "success",
          html_url: "https://github.com/checks/2",
        },
      ],
      "build",
      fallback,
    ),
    {
      status: "completed",
      conclusion: "success",
      url: "https://github.com/checks/2",
    },
  );
});

test("keeps pending and failed required checks honest", () => {
  assert.equal(
    evaluateRequiredCheckRuns(
      [
        {
          name: "build",
          status: "in_progress",
          conclusion: null,
          html_url: null,
        },
      ],
      "build",
      fallback,
    ).status,
    "in_progress",
  );

  assert.deepEqual(
    evaluateRequiredCheckRuns(
      [
        {
          name: "build",
          status: "completed",
          conclusion: "timed_out",
          html_url: null,
        },
      ],
      "build",
      fallback,
    ),
    { status: "completed", conclusion: "timed_out", url: fallback },
  );
});
