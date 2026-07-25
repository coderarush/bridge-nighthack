import assert from "node:assert/strict";
import test from "node:test";
import {
  hasCompleteEvidence,
  isEvidenceVerified,
  projectCurrentEvidence,
  readCurrentHeadStatus,
  verifyCurrentEvidenceHead,
} from "../verification";
import type { EvidenceView } from "../../types";

const completeEvidence: EvidenceView = {
  commitSha: "52ee5c54ccfa3831807eba894fc08372530d1fe9",
  pullRequestUrl: "https://github.com/example/repo/pull/1",
  pullRequestNumber: 1,
  validationUrl: "https://github.com/example/repo/actions/runs/1",
  validationStatus: "completed",
  validationConclusion: "success",
};

test("requires the complete PR, SHA, and completed CI chain", () => {
  assert.equal(hasCompleteEvidence(completeEvidence), true);

  for (const key of Object.keys(completeEvidence) as Array<
    keyof EvidenceView
  >) {
    assert.equal(
      hasCompleteEvidence({ ...completeEvidence, [key]: undefined }),
      false,
      `${key} must be required`,
    );
  }
});

test("does not render stored success as verified after the run fails", () => {
  assert.equal(
    isEvidenceVerified("validation_failed", {
      ...completeEvidence,
      currentHeadStatus: "matched",
    }),
    false,
  );
  assert.equal(
    isEvidenceVerified("ready_for_review", {
      ...completeEvidence,
      currentHeadStatus: "matched",
    }),
    true,
  );
  assert.equal(
    isEvidenceVerified("ready_for_review", {
      ...completeEvidence,
      currentHeadStatus: "mismatched",
    }),
    false,
  );
});

test("requires a completed validation status, not only a success conclusion", () => {
  assert.equal(
    hasCompleteEvidence({
      ...completeEvidence,
      validationStatus: "queued",
    }),
    false,
  );
});

test("rechecks the current pull request head for recorded evidence", async () => {
  let reads = 0;
  const head = await verifyCurrentEvidenceHead(completeEvidence, async () => {
    reads += 1;
    return completeEvidence.commitSha as string;
  });

  assert.equal(head, completeEvidence.commitSha);
  assert.equal(reads, 1);
});

test("rejects PR-head drift and incomplete evidence", async () => {
  await assert.rejects(
    () => verifyCurrentEvidenceHead(completeEvidence, async () => "moved-head"),
    /moved-head.*52ee5c54/i,
  );

  let reads = 0;
  await assert.rejects(
    () =>
      verifyCurrentEvidenceHead(
        { ...completeEvidence, validationUrl: undefined },
        async () => {
          reads += 1;
          return completeEvidence.commitSha as string;
        },
      ),
    /evidence is incomplete/i,
  );
  assert.equal(reads, 0);
});

test("classifies live head matches, drift, and unavailable reads", async () => {
  assert.equal(
    await readCurrentHeadStatus(
      completeEvidence,
      async () => completeEvidence.commitSha as string,
    ),
    "matched",
  );
  assert.equal(
    await readCurrentHeadStatus(completeEvidence, async () => "moved-head"),
    "mismatched",
  );
  assert.equal(
    await readCurrentHeadStatus(completeEvidence, async () => {
      throw new Error("GitHub unavailable");
    }),
    "unavailable",
  );
  assert.equal(
    await readCurrentHeadStatus(
      { ...completeEvidence, validationUrl: undefined },
      async () => completeEvidence.commitSha as string,
    ),
    "not_checked",
  );
});

test("projects ready rooms fail closed unless the current PR head matches", async () => {
  const matched = await projectCurrentEvidence(
    "ready_for_review",
    completeEvidence,
    async () => completeEvidence.commitSha as string,
  );
  assert.equal(matched.runStatus, "ready_for_review");
  assert.equal(matched.evidence.currentHeadStatus, "matched");

  const drifted = await projectCurrentEvidence(
    "ready_for_review",
    completeEvidence,
    async () => "moved-head",
  );
  assert.equal(drifted.runStatus, "validation_failed");
  assert.equal(drifted.evidence.currentHeadStatus, "mismatched");

  const unavailable = await projectCurrentEvidence(
    "ready_for_review",
    completeEvidence,
    async () => {
      throw new Error("GitHub unavailable");
    },
  );
  assert.equal(unavailable.runStatus, "validation_failed");
  assert.equal(unavailable.evidence.currentHeadStatus, "unavailable");
});

test("does not read GitHub for a room that is not ready for review", async () => {
  let reads = 0;
  const projected = await projectCurrentEvidence(
    "validating",
    completeEvidence,
    async () => {
      reads += 1;
      return completeEvidence.commitSha as string;
    },
  );

  assert.equal(reads, 0);
  assert.equal(projected.runStatus, "validating");
  assert.equal(projected.evidence.currentHeadStatus, "not_checked");
});
