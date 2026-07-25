import type { EvidenceView, RunStatus } from "../types";
import {
  assertExpectedPullRequestHead,
  PullRequestHeadMismatchError,
} from "../adapters/github-pr-head";

export class IncompleteEvidenceError extends Error {
  constructor() {
    super("Stored migration evidence is incomplete and must be revalidated.");
    this.name = "IncompleteEvidenceError";
  }
}

export function hasCompleteEvidence(evidence: EvidenceView): boolean {
  return Boolean(
    evidence.commitSha &&
      evidence.pullRequestUrl &&
      evidence.pullRequestNumber &&
      evidence.validationUrl &&
      evidence.validationStatus === "completed" &&
      evidence.validationConclusion === "success",
  );
}

export function isEvidenceVerified(
  runStatus: RunStatus,
  evidence: EvidenceView,
): boolean {
  return (
    runStatus === "ready_for_review" &&
    evidence.currentHeadStatus === "matched" &&
    hasCompleteEvidence(evidence)
  );
}

export async function verifyCurrentEvidenceHead(
  evidence: EvidenceView,
  readHead: () => Promise<string>,
): Promise<string> {
  if (!hasCompleteEvidence(evidence)) {
    throw new IncompleteEvidenceError();
  }
  return assertExpectedPullRequestHead({
    expectedSha: evidence.commitSha as string,
    readHead,
  });
}

export async function readCurrentHeadStatus(
  evidence: EvidenceView,
  readHead: () => Promise<string>,
): Promise<NonNullable<EvidenceView["currentHeadStatus"]>> {
  if (!hasCompleteEvidence(evidence)) return "not_checked";
  try {
    await verifyCurrentEvidenceHead(evidence, readHead);
    return "matched";
  } catch (error) {
    return error instanceof PullRequestHeadMismatchError
      ? "mismatched"
      : "unavailable";
  }
}

export async function projectCurrentEvidence(
  runStatus: RunStatus,
  evidence: EvidenceView,
  readHead: () => Promise<string>,
): Promise<{ runStatus: RunStatus; evidence: EvidenceView }> {
  if (runStatus !== "ready_for_review") {
    return {
      runStatus,
      evidence: { ...evidence, currentHeadStatus: "not_checked" },
    };
  }

  const currentHeadStatus = await readCurrentHeadStatus(evidence, readHead);
  return {
    runStatus:
      currentHeadStatus === "matched" ? runStatus : "validation_failed",
    evidence: { ...evidence, currentHeadStatus },
  };
}
