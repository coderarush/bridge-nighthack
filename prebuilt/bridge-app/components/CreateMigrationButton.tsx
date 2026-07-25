"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function CreateMigrationButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function create() {
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/runs/start", { method: "POST" });
      if (!res.ok) throw new Error("start failed");
      const { runId } = await res.json();
      router.push(`/room/${runId}`);
    } catch (e) {
      setErr("Could not create a run — is the database configured?");
      setBusy(false);
    }
  }
  return (
    <div style={{ marginTop: 12 }}>
      <button className="btn" onClick={create} disabled={busy}>
        {busy ? "Creating…" : "Create migration →"}
      </button>
      {err ? <p className="muted" style={{ fontSize: 12, color: "var(--amber)" }}>{err}</p> : null}
    </div>
  );
}
