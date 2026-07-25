import Link from "next/link";
import { seedRoom } from "@/lib/seed/room";
import { CreateMigrationButton } from "@/components/CreateMigrationButton";

export default function ChangePage() {
  const c = seedRoom.change;
  return (
    <main className="container">
      <Link href="/" className="muted">← Bridge</Link>
      <div className="panel" style={{ marginTop: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <h2 style={{ margin: 0 }}>{c.provider} {c.fromVersion} → {c.toVersion}</h2>
          <span className="badge breaking">● breaking</span>
        </div>
        <p className="muted" style={{ marginTop: 8 }}>{c.operation}</p>
        <p style={{ fontSize: 16 }}>{c.summary}</p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "12px 0" }}>
          <span className="badge">removed: <span className="mono">{c.removed.join(", ")}</span></span>
          <span className="badge">now required: <span className="mono">{c.addedRequired.join(", ")}</span></span>
        </div>
        <p className="muted" style={{ fontSize: 14 }}>
          Sources: <a href={c.oldSpecUrl}>v1 spec</a> · <a href={c.newSpecUrl}>v2 spec</a>
        </p>
        <CreateMigrationButton />
      </div>
    </main>
  );
}
