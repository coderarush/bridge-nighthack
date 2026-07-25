"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { RoomAggregate } from "@/lib/types";

// Presence + comments + approval. Comments/approvals persist via the API.
// LIVE-BUILD (flagship in-window work): replace the 5s poll with Supabase
// Realtime presence + broadcast for instant multi-window updates.
export function RoomSidebar({ room }: { room: RoomAggregate }) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(t);
  }, [router]);

  async function send() {
    if (!draft.trim()) return;
    setBusy(true);
    try {
      await fetch(`/api/runs/${room.runId}/comments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: draft, participantName: "You", role: "customer" }),
      });
      setDraft(""); router.refresh();
    } finally { setBusy(false); }
  }

  async function approve() {
    setBusy(true);
    try {
      await fetch(`/api/runs/${room.runId}/approve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ planVersion: room.plan.version, decision: "approved", note: "Patch is limited to AtlasPay request fields.", participantName: "AtlasPay" }),
      });
      router.refresh();
    } finally { setBusy(false); }
  }

  return (
    <div className="panel">
      <strong>Migration room</strong>
      <div style={{ display: "flex", gap: 8, margin: "12px 0", flexWrap: "wrap" }}>
        {[["A", "You (customer)"], ["P", "AtlasPay (provider)"]].map(([a, n]) => (
          <span key={a} className="badge" title={n}>
            <span style={{ width: 18, height: 18, borderRadius: 999, background: "var(--brand)", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11 }}>{a}</span>
            {n}
          </span>
        ))}
      </div>

      <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
        {room.comments.map((c, i) => (
          <div key={i} style={{ borderTop: "1px solid var(--border)", paddingTop: 8 }}>
            <div style={{ fontSize: 12 }}><strong>{c.participantName}</strong> <span className="muted">· {c.role}</span></div>
            <div style={{ fontSize: 14 }}>{c.body}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") send(); }}
          placeholder="Comment…"
          style={{ flex: 1, background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", padding: "8px 10px" }}
        />
        <button className="btn secondary" onClick={send} disabled={busy}>Send</button>
      </div>

      {room.approvals.length ? (
        room.approvals.map((a, i) => (
          <div key={i} className="muted" style={{ fontSize: 12, marginTop: 10 }}>
            ✓ {a.decision} by {a.participantName} — “{a.note}”
          </div>
        ))
      ) : (
        <button className="btn" style={{ width: "100%", marginTop: 12, justifyContent: "center" }} onClick={approve} disabled={busy}>
          Approve migration
        </button>
      )}
    </div>
  );
}
