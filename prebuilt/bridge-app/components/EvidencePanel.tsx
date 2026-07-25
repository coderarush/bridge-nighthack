import type { ReactNode } from "react";
import { isEvidenceVerified } from "@/lib/evidence/verification";
import type { EvidenceView, RunStatus } from "@/lib/types";

export function EvidencePanel({
  evidence,
  runStatus,
}: {
  evidence: EvidenceView;
  runStatus: RunStatus;
}) {
  const hasPr = Boolean(evidence.pullRequestUrl && evidence.pullRequestNumber);
  const hasCommit = Boolean(evidence.commitSha);
  const evidenceVerified = isEvidenceVerified(runStatus, evidence);
  const ciCompletedSuccess =
    evidence.validationStatus === "completed" &&
    evidence.validationConclusion === "success";
  const ciFailed = Boolean(
    evidence.validationConclusion && evidence.validationConclusion !== "success",
  );
  const headMismatched = evidence.currentHeadStatus === "mismatched";
  const headUnavailable = evidence.currentHeadStatus === "unavailable";
  const healthLabel = evidenceVerified
    ? "Exact-SHA proof current"
    : headMismatched
      ? "PR head changed"
      : headUnavailable
        ? "Head check unavailable"
        : "Awaiting exact-SHA proof";
  const ciState = evidenceVerified
    ? "Passed"
    : headMismatched
      ? "PR head changed"
      : headUnavailable
        ? "Head check unavailable"
        : ciCompletedSuccess
          ? "Success not verified"
          : ciFailed
            ? evidence.validationConclusion ?? "Failed"
            : evidence.validationStatus ?? "Waiting";
  const ciTone = evidenceVerified
    ? "verified"
    : headMismatched || ciFailed
      ? "failed"
      : "pending";

  return (
    <section className="panel evidence-panel" aria-labelledby="evidence-title">
      <div className="panel-heading">
        <div>
          <p className="section-eyebrow">External proof</p>
          <h2 id="evidence-title">PR, commit, and CI</h2>
        </div>
        <span className={`evidence-health ${evidenceVerified ? "is-verified" : ""}`}>
          <span aria-hidden="true" />
          {healthLabel}
        </span>
      </div>

      <div className="evidence-ledger" aria-live="polite">
        <EvidenceRow
          index="01"
          label="Draft pull request"
          state={hasPr ? "Created" : "Not created"}
          tone={hasPr ? "available" : "pending"}
          value={
            hasPr ? (
              <a
                href={evidence.pullRequestUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                PR #{evidence.pullRequestNumber} <span aria-hidden="true">↗</span>
                <span className="sr-only"> (opens in new tab)</span>
              </a>
            ) : (
              "Created after patch commit"
            )
          }
        />
        <EvidenceRow
          index="02"
          label="Commit SHA"
          state={hasCommit ? "Recorded" : "Not committed"}
          tone={hasCommit ? "available" : "pending"}
          value={
            hasCommit ? (
              <code title={evidence.commitSha}>{evidence.commitSha?.slice(0, 7)}</code>
            ) : (
              "No commit evidence"
            )
          }
        />
        <EvidenceRow
          index="03"
          label="GitHub Actions"
          state={ciState}
          tone={ciTone}
          value={
            evidence.validationUrl ? (
              <a
                href={evidence.validationUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Inspect check run <span aria-hidden="true">↗</span>
                <span className="sr-only"> (opens in new tab)</span>
              </a>
            ) : hasCommit ? (
              "Waiting for check run"
            ) : (
              "Requires exact commit SHA"
            )
          }
        />
      </div>

      <div className="evidence-chain" aria-label="Evidence chain">
        <span className={hasPr ? "chain-complete" : ""}>PR</span>
        <i aria-hidden="true" />
        <span className={hasCommit ? "chain-complete" : ""}>SHA</span>
        <i aria-hidden="true" />
        <span className={evidenceVerified ? "chain-verified" : ""}>CI</span>
      </div>

      {evidence.branchName ? (
        <div className="branch-evidence">
          <span>Branch</span>
          <code>{evidence.branchName}</code>
        </div>
      ) : null}
    </section>
  );
}

function EvidenceRow({
  index,
  label,
  state,
  tone,
  value,
}: {
  index: string;
  label: string;
  state: string;
  tone: "pending" | "available" | "verified" | "failed";
  value: ReactNode;
}) {
  return (
    <div className="evidence-row">
      <span className="evidence-index mono">{index}</span>
      <div className="evidence-row-label">
        <strong>{label}</strong>
        <span>{value}</span>
      </div>
      <span className={`evidence-state evidence-state-${tone}`}>{state}</span>
    </div>
  );
}
