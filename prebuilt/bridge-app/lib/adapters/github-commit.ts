export type GitCommitPlan =
  | {
      kind: "reuse";
      commitSha: string;
    }
  | {
      kind: "create";
      parentSha: string;
      treeSha: string;
    };

export function planGitCommit(input: {
  currentCommitSha: string;
  currentTreeSha: string;
  candidateTreeSha: string;
}): GitCommitPlan {
  if (input.currentTreeSha === input.candidateTreeSha) {
    return {
      kind: "reuse",
      commitSha: input.currentCommitSha,
    };
  }
  return {
    kind: "create",
    parentSha: input.currentCommitSha,
    treeSha: input.candidateTreeSha,
  };
}
