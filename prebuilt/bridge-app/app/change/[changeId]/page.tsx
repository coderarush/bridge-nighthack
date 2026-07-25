import Link from "next/link";
import { CreateMigrationButton } from "@/components/CreateMigrationButton";
import { seedRoom } from "@/lib/seed/room";

export default function ChangePage() {
  const { change, repository } = seedRoom;

  return (
    <main className="detail-shell">
      <header className="app-header">
        <Link className="brand-lockup" href="/" aria-label="Bridge home">
          <span className="brand-mark" aria-hidden="true">
            <span />
          </span>
          <span>bridge</span>
        </Link>
        <div className="breadcrumb">
          <Link href="/">Change intake</Link>
          <span aria-hidden="true">/</span>
          <span>CHG-ATLAS-V2</span>
        </div>
      </header>

      <section className="change-detail" aria-labelledby="change-detail-heading">
        <div className="change-detail-head">
          <div>
            <div className="change-kicker">
              <span className="severity-mark" aria-hidden="true">!</span>
              Breaking contract change
            </div>
            <h1 id="change-detail-heading">{change.provider} v2 request migration</h1>
            <p>{change.summary}</p>
          </div>
          <span className="badge breaking">Action required</span>
        </div>

        <div className="detail-grid">
          <div className="detail-main">
            <section className="panel detail-panel" aria-labelledby="normalized-change-title">
              <div className="section-heading-row">
                <div>
                  <p className="section-eyebrow">Normalized change</p>
                  <h2 id="normalized-change-title">{change.operation}</h2>
                </div>
                <span className="mono detail-version">{change.fromVersion} → {change.toVersion}</span>
              </div>
              <div className="detail-field-row">
                <div>
                  <span className="field-status removed-status">Removed</span>
                  <code>{change.removed.join(", ")}</code>
                </div>
                <span aria-hidden="true">→</span>
                <div>
                  <span className="field-status required-status">Now required</span>
                  <code>{change.addedRequired.join(", ")}</code>
                </div>
              </div>
            </section>

            <section className="panel detail-panel" aria-labelledby="source-evidence-title">
              <div className="section-heading-row">
                <div>
                  <p className="section-eyebrow">Provider evidence</p>
                  <h2 id="source-evidence-title">Contract sources</h2>
                </div>
                <span className="evidence-attached">2 files attached</span>
              </div>
              <div className="source-list">
                <a href={change.oldSpecUrl}>
                  <span className="source-type mono">YAML</span>
                  <span><strong>AtlasPay v1 OpenAPI</strong><small>Baseline contract</small></span>
                  <span aria-hidden="true">↗</span>
                </a>
                <a href={change.newSpecUrl}>
                  <span className="source-type mono">YAML</span>
                  <span><strong>AtlasPay v2 OpenAPI</strong><small>Changed contract</small></span>
                  <span aria-hidden="true">↗</span>
                </a>
              </div>
            </section>
          </div>

          <aside className="panel detail-action" aria-label="Migration target">
            <p className="section-eyebrow">Migration target</p>
            <h2>{repository.owner}/{repository.name}</h2>
            <p className="muted">Base branch <code>{repository.defaultBranch}</code></p>
            <div className="verification-summary">
              <span><strong>Guarded AST</strong> recipe</span>
              <span><strong>Draft PR</strong> only</span>
            </div>
            <p className="detail-action-copy">
              The recipe changes only the request key in verified AtlasPay call sites.
            </p>
            <div className="intake-action">
              <CreateMigrationButton />
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}
