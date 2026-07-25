import Link from "next/link";
import { DEMO_RUN_ID } from "@/lib/demo";

export default function Home() {
  return (
    <main className="container">
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 28 }}>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: "var(--brand)" }} />
        <strong style={{ fontSize: 18 }}>Bridge</strong>
        <span className="badge" style={{ marginLeft: "auto" }}>NightHack demo</span>
      </div>

      <h1 style={{ fontSize: 44, lineHeight: 1.1, margin: "12px 0", maxWidth: 760 }}>
        From a breaking API change to a reviewed pull request.
      </h1>
      <p className="muted" style={{ fontSize: 18, maxWidth: 720 }}>
        A provider ships a breaking change. Bridge detects it, finds the exact customer
        code that will break, writes a bounded patch, validates it in CI, opens a draft
        PR, and gives the provider and customer a shared migration room. Dependabot for
        APIs — with the migration actually done.
      </p>

      <div style={{ display: "flex", gap: 12, margin: "28px 0" }}>
        <Link className="btn" href="/change/atlaspay-v2">See the AtlasPay change →</Link>
        <Link className="btn secondary" href={`/room/${DEMO_RUN_ID}`}>Open a migration room</Link>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 16, marginTop: 24 }}>
        {[
          ["Detect", "Normalize the provider contract diff into one breaking-change record."],
          ["Map impact", "Find the exact call sites — and ignore look-alike strings."],
          ["Patch", "Deterministic key rename. No LLM on the critical path."],
          ["Validate", "Tie the result to the exact commit's GitHub Actions run."],
        ].map(([t, d]) => (
          <div className="panel" key={t}>
            <strong>{t}</strong>
            <p className="muted" style={{ margin: "8px 0 0", fontSize: 14 }}>{d}</p>
          </div>
        ))}
      </div>
    </main>
  );
}
