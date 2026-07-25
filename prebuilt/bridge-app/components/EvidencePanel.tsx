import type { ReactNode } from "react";
import type { EvidenceView } from "@/lib/types";

export function EvidencePanel({ evidence }: { evidence: EvidenceView }) {
  const hasPr = Boolean(evidence.pullRequestUrl && evidence.pullRequestNumber);
  const hasCommit = Boolean(evidence.commitSha);
  const ciPassed = evidence.validationConclusion === "success";
  const ciFailed = Boolean(
    evidence.validationConclusion && evidence.validationConclusion !== "success",
  );

  return (
    <section className="panel evidence-panel" aria-labelledby="evidence-title">
      <div className="panel-heading">
        <div>
          <p className="section-eyebrow">External proof</p>
          <h2 id="evidence-title">PR, commit, and CI</h2>
        </div>
        <span className={`evidence-health ${ciPassed ? "is-verified" : ""}`}>
          <span aria-hidden="true" />
          {ciPassed ? "Evidence verified" : "Awaiting external evidence"}
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
          state={
            ciPassed
              ? "Passed"
              : ciFailed
                ? evidence.validationConclusion ?? "Failed"
                : evidence.validationStatus ?? "Waiting"
          }
          tone={ciPassed ? "verified" : ciFailed ? "failed" : "pending"}
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
        <span className={ciPassed ? "chain-verified" : ""}>CI</span>
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
