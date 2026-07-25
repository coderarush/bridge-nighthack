import type { EvidenceView } from "@/lib/types";

export function EvidencePanel({ evidence }: { evidence: EvidenceView }) {
  const pass = evidence.validationConclusion === "success";
  return (
    <div className="panel">
      <strong>PR & CI evidence</strong>
      <div style={{ marginTop: 12, display: "grid", gap: 8, fontSize: 14 }}>
        <Row label="Branch" value={<span className="mono">{evidence.branchName}</span>} />
        <Row label="Commit" value={<span className="mono">{evidence.commitSha?.slice(0, 7)}</span>} />
        <Row
          label="Pull request"
          value={evidence.pullRequestUrl ? <a href={evidence.pullRequestUrl}>Draft PR #{evidence.pullRequestNumber} ↗</a> : "—"}
        />
        <Row
          label="CI"
          value={
            <span className={"badge " + (pass ? "green" : "")}>
              {pass ? "● passed" : evidence.validationStatus ?? "pending"}
              {evidence.validationUrl ? <> · <a href={evidence.validationUrl}>run ↗</a></> : null}
            </span>
          }
        />
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
      <span className="muted">{label}</span>
      <span>{value}</span>
    </div>
  );
}
