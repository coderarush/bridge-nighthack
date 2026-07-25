import assert from "node:assert/strict";
import test from "node:test";
import { planGitCommit } from "../github-commit";

test("reuses the branch head when patched files produce the current tree", () => {
  assert.deepEqual(
    planGitCommit({
      currentCommitSha: "current-commit",
      currentTreeSha: "same-tree",
      candidateTreeSha: "same-tree",
    }),
    {
      kind: "reuse",
      commitSha: "current-commit",
    },
  );
});

test("creates a child commit when the candidate tree changes", () => {
  assert.deepEqual(
    planGitCommit({
      currentCommitSha: "current-commit",
      currentTreeSha: "old-tree",
      candidateTreeSha: "new-tree",
    }),
    {
      kind: "create",
      parentSha: "current-commit",
      treeSha: "new-tree",
    },
  );
});
