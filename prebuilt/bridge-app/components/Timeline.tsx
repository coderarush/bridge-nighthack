import type { RunEventView } from "@/lib/types";

export function Timeline({ events }: { events: RunEventView[] }) {
  return (
    <div className="panel">
      <strong>Activity</strong>
      <ol style={{ listStyle: "none", padding: 0, margin: "12px 0 0" }}>
        {events.map((e) => (
          <li key={e.sequence} style={{ display: "flex", gap: 10, padding: "8px 0", borderTop: "1px solid var(--border)" }}>
            <span style={{ color: e.status === "ok" ? "var(--green)" : "var(--amber)" }}>●</span>
            <div>
              <div style={{ fontSize: 14 }}>{e.message}</div>
              <div className="muted mono" style={{ fontSize: 11 }}>{e.eventType} · {e.actorId ?? e.actorType}</div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
