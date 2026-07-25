import assert from "node:assert/strict";
import test from "node:test";
import { waitForExpectedPullRequestHead } from "../github-pr-head";

test("waits for GitHub pull request head consistency", async () => {
  const observed = ["old-sha", "expected-sha"];
  let reads = 0;
  const head = await waitForExpectedPullRequestHead({
    expectedSha: "expected-sha",
    attempts: 3,
    readHead: async () => observed[reads++] ?? "expected-sha",
    wait: async () => {},
  });

  assert.equal(head, "expected-sha");
  assert.equal(reads, 2);
});

test("fails closed when the pull request head never catches up", async () => {
  await assert.rejects(
    () =>
      waitForExpectedPullRequestHead({
        expectedSha: "expected-sha",
        attempts: 3,
        readHead: async () => "old-sha",
        wait: async () => {},
      }),
    /old-sha.*expected-sha/i,
  );
});
