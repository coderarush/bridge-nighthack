import type { ImpactView } from "@/lib/types";

export function ImpactedFiles({ impacts }: { impacts: ImpactView[] }) {
  return (
    <div className="panel">
      <strong>Impacted files ({impacts.length})</strong>
      <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
        {impacts.map((i) => (
          <div key={i.filePath} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 12 }}>
            <div className="mono" style={{ fontSize: 13 }}>{i.filePath}:{i.lineStart}</div>
            <pre className="mono" style={{ background: "var(--panel-2)", padding: 10, borderRadius: 8, overflowX: "auto", fontSize: 13, margin: "8px 0" }}>{i.snippet}</pre>
            <div className="muted" style={{ fontSize: 12 }}>{i.reason}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
