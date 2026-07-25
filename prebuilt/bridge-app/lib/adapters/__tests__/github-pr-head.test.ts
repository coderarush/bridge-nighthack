import assert from "node:assert/strict";
import test from "node:test";
import {
  assertExpectedPullRequestHead,
  waitForExpectedPullRequestHead,
} from "../github-pr-head";

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

test("rechecks the current pull request head immediately before validation", async () => {
  let reads = 0;
  const head = await assertExpectedPullRequestHead({
    expectedSha: "expected-sha",
    readHead: async () => {
      reads += 1;
      return "expected-sha";
    },
  });

  assert.equal(head, "expected-sha");
  assert.equal(reads, 1);
});

test("fails closed when the current pull request head moved", async () => {
  await assert.rejects(
    () =>
      assertExpectedPullRequestHead({
        expectedSha: "stored-sha",
        readHead: async () => "new-head-sha",
      }),
    /new-head-sha.*stored-sha/i,
  );
});
