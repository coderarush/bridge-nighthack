import assert from "node:assert/strict";
import { test } from "node:test";
import {
  classifyAdvance,
  requireDemoRepositoryConfig,
  validateMigrationShape,
} from "../run-guards";

test("rejects incomplete demo repository configuration", () => {
  assert.throws(
    () => requireDemoRepositoryConfig({
      GITHUB_DEMO_OWNER: "",
      GITHUB_DEMO_REPO: "atlas-store-demo",
      GITHUB_DEMO_BASE_BRANCH: "demo-base",
    }),
    /GITHUB_DEMO_OWNER/,
  );
});

test("returns the configured controlled repository", () => {
  assert.deepEqual(
    requireDemoRepositoryConfig({
      GITHUB_DEMO_OWNER: "coderarush",
      GITHUB_DEMO_REPO: "atlas-store-demo",
      GITHUB_DEMO_BASE_BRANCH: "demo-base",
    }),
    {
      owner: "coderarush",
      repo: "atlas-store-demo",
      baseBranch: "demo-base",
    },
  );
});

test("classifies repeat advances without replaying external mutations", () => {
  assert.equal(classifyAdvance("analyzing_change"), "execute");
  assert.equal(classifyAdvance("planning"), "execute");
  assert.equal(classifyAdvance("scan_failed"), "retryable");
  assert.equal(classifyAdvance("patch_failed"), "retryable");
  assert.equal(classifyAdvance("scanning_repo"), "already_running");
  assert.equal(classifyAdvance("patching"), "already_running");
  assert.equal(classifyAdvance("validating"), "already_running");
  assert.equal(classifyAdvance("ready_for_review"), "complete");
  assert.equal(classifyAdvance("cancelled"), "complete");
});

test("accepts the exact AtlasPay fixture scan and patch shape", () => {
  assert.doesNotThrow(() => validateMigrationShape({
    expectedFetchPaths: ["a.ts", "b.ts", "c.ts", "logging.ts"],
    expectedImpactPaths: ["a.ts", "b.ts", "c.ts"],
    fetchedPaths: ["logging.ts", "c.ts", "a.ts", "b.ts"],
    impactPaths: ["c.ts", "a.ts", "b.ts"],
    patchedPaths: ["b.ts", "c.ts", "a.ts"],
  }));
});

test("rejects incomplete fetches, unexpected impacts, and patch mismatches", () => {
  assert.throws(
    () => validateMigrationShape({
      expectedFetchPaths: ["a.ts", "b.ts", "c.ts", "logging.ts"],
      expectedImpactPaths: ["a.ts", "b.ts", "c.ts"],
      fetchedPaths: ["a.ts", "b.ts", "c.ts"],
      impactPaths: ["a.ts", "b.ts", "c.ts"],
      patchedPaths: ["a.ts", "b.ts", "c.ts"],
    }),
    /fetched 3 of 4/i,
  );

  assert.throws(
    () => validateMigrationShape({
      expectedFetchPaths: ["a.ts", "b.ts", "c.ts", "logging.ts"],
      expectedImpactPaths: ["a.ts", "b.ts", "c.ts"],
      fetchedPaths: ["a.ts", "b.ts", "c.ts", "logging.ts"],
      impactPaths: ["a.ts", "b.ts", "logging.ts"],
      patchedPaths: ["a.ts", "b.ts", "logging.ts"],
    }),
    /unexpected impacted file set/i,
  );

  assert.throws(
    () => validateMigrationShape({
      expectedFetchPaths: ["a.ts", "b.ts", "c.ts", "logging.ts"],
      expectedImpactPaths: ["a.ts", "b.ts", "c.ts"],
      fetchedPaths: ["a.ts", "b.ts", "c.ts", "logging.ts"],
      impactPaths: ["a.ts", "b.ts", "c.ts"],
      patchedPaths: ["a.ts", "b.ts"],
    }),
    /patch file set does not match impacts/i,
  );
});
