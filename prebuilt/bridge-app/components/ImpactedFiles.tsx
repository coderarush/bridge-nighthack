import type { ImpactView } from "@/lib/types";

export function ImpactedFiles({ impacts }: { impacts: ImpactView[] }) {
  return (
    <section className="panel impacts-panel" aria-labelledby="impacts-title">
      <div className="panel-heading impacts-heading">
        <div>
          <p className="section-eyebrow">Repository scan</p>
          <h2 id="impacts-title">Verified impact</h2>
        </div>
        <div className="impact-totals" aria-label={`${impacts.length} verified call sites and 3 look-alikes excluded`}>
          <span><strong>{impacts.length}</strong> verified</span>
          <span><strong>3</strong> look-alikes excluded</span>
        </div>
      </div>

      <p className="impact-summary">
        Bridge matched the removed request key only inside AtlasPay payment objects.
        Comments, strings, and unrelated identifiers remain outside the patch scope.
      </p>

      <div className="impact-list">
        {impacts.length === 0 ? (
          <div className="empty-state">
            <strong>No verified call sites yet</strong>
            <span>The repository scan has not produced impact evidence.</span>
          </div>
        ) : (
          impacts.map((impact, index) => (
            <article className="impact-file" key={`${impact.filePath}:${impact.lineStart}`}>
              <header className="impact-file-header">
                <span className="file-index mono">{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <code>{impact.filePath}</code>
                  <span className="mono">Line {impact.lineStart}</span>
                </div>
                <span className="verified-label">
                  <span aria-hidden="true">✓</span> Verified
                </span>
              </header>
              <pre className="impact-snippet">
                <code>
                  <span className="line-number">{impact.lineStart}</span>
                  <span className="code-context">{impact.snippet}</span>
                </code>
              </pre>
              <footer className="impact-reason">
                <span className="confidence-mark" aria-hidden="true" />
                <span>{impact.reason}</span>
              </footer>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
