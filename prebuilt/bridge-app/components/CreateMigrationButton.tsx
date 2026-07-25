"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useBridgeAuth } from "./AuthBootstrap";

export function CreateMigrationButton() {
  const router = useRouter();
  const auth = useBridgeAuth();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function create() {
    setBusy(true); setErr(null);
    try {
      const res = await auth.authorizedFetch("/api/runs/start", { method: "POST" });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error ?? "Migration start failed.");
      }
      const { runId } = await res.json();
      router.push(`/room/${runId}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not create a migration.");
      setBusy(false);
    }
  }
  return (
    <div style={{ marginTop: 12 }}>
      <button
        className="btn"
        onClick={create}
        disabled={busy || auth.participant?.role !== "operator"}
      >
        {busy
          ? "Creating…"
          : auth.participant?.role === "operator"
            ? "Create migration →"
            : "Operator access required"}
      </button>
      {err ? <p className="muted" style={{ fontSize: 12, color: "var(--amber)" }}>{err}</p> : null}
    </div>
  );
}
