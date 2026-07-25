import Link from "next/link";
import { CreateMigrationButton } from "@/components/CreateMigrationButton";
import { seedRoom } from "@/lib/seed/room";

export default function Home() {
  const { change, repository, impacts } = seedRoom;
  const repositoryName = `${repository.owner}/${repository.name}`;

  return (
    <main className="intake-shell">
      <header className="app-header">
        <Link className="brand-lockup" href="/" aria-label="Bridge home">
          <span className="brand-mark" aria-hidden="true">
            <span />
          </span>
          <span>bridge</span>
        </Link>
        <div className="header-context" aria-label="Demo context">
          <span className="context-label">Change intake</span>
          <span className="environment-indicator">
            <span aria-hidden="true" />
            Demo workspace
          </span>
        </div>
      </header>

      <section className="intake-workspace" aria-labelledby="change-heading">
        <div className="intake-primary">
          <div className="change-kicker">
            <span className="severity-mark" aria-hidden="true">!</span>
            Breaking contract change
            <span className="change-id mono">CHG-ATLAS-V2</span>
          </div>

          <div className="change-title-row">
            <div>
              <p className="provider-version">
                {change.provider} {change.fromVersion} <span aria-hidden="true">→</span> {change.toVersion}
              </p>
              <h1 id="change-heading">
                AtlasPay v2 contains <span>1 breaking request change.</span>
              </h1>
            </div>
            <span className="badge breaking">Breaking</span>
          </div>

          <div className="operation-bar">
            <span className="method-label">POST</span>
            <code>/payments</code>
            <Link href="/change/atlaspay-v2">Inspect contract evidence</Link>
          </div>

          <section className="contract-diff" aria-labelledby="contract-diff-title">
            <div className="section-heading-row">
              <div>
                <p className="section-eyebrow">Request body</p>
                <h2 id="contract-diff-title">Field contract</h2>
              </div>
              <span className="diff-scope">1 removal · 1 required field</span>
            </div>

            <div className="field-comparison">
              <div className="field-state field-state-before">
                <div className="field-state-header">
                  <span>v1 · removed</span>
                  <span className="field-status removed-status">Removed</span>
                </div>
                <code>payment_method</code>
                <p>string · request property</p>
              </div>
              <span className="diff-arrow" aria-hidden="true">→</span>
              <div className="field-state field-state-after">
                <div className="field-state-header">
                  <span>v2 · replacement</span>
                  <span className="field-status required-status">Required</span>
                </div>
                <code>payment_method_id</code>
                <p>string · request property</p>
              </div>
            </div>

            <pre className="compact-diff" aria-label="Request field diff">
              <code>
                <span className="diff-line diff-line-removed">- payment_method: pmToken</span>
                <span className="diff-line diff-line-added">+ payment_method_id: pmToken</span>
              </code>
            </pre>
          </section>
        </div>

        <aside className="intake-side" aria-label="Migration setup">
          <div className="setup-heading">
            <p className="section-eyebrow">Target</p>
            <h2>Create migration</h2>
            <p>Bridge will scan this repository against the AtlasPay contract change.</p>
          </div>

          <div className="repository-field">
            <span className="field-label">Repository</span>
            <div className="repository-value">
              <span className="repository-icon mono" aria-hidden="true">&lt;/&gt;</span>
              <span>
                <strong>{repositoryName}</strong>
                <small>Base branch · {repository.defaultBranch}</small>
              </span>
              <span className="fixed-label">Fixed demo</span>
            </div>
          </div>

          <div className="scan-preview" aria-label="Expected deterministic scan">
            <div className="scan-count">
              <strong>{impacts.length}</strong>
              <span>verified call sites</span>
            </div>
            <div className="scan-count excluded">
              <strong>3</strong>
              <span>look-alikes excluded</span>
            </div>
          </div>

          <ul className="guardrail-list">
            <li><span aria-hidden="true">01</span> Bounded key rename only</li>
            <li><span aria-hidden="true">02</span> Draft pull request, never auto-merge</li>
            <li><span aria-hidden="true">03</span> CI verified against the exact commit</li>
          </ul>

          <div className="intake-action">
            <CreateMigrationButton />
            <p className="action-note">Creates a migration room for review.</p>
          </div>
        </aside>
      </section>

      <footer className="intake-footer">
        <span>Provider evidence attached</span>
        <span className="mono">{change.operation}</span>
        <span>Deterministic AtlasPay recipe</span>
      </footer>
    </main>
  );
}
