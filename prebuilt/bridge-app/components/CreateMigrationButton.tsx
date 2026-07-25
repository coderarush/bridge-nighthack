"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useBridgeAuth } from "./AuthBootstrap";
import { DEMO_RUN_ID } from "@/lib/demo";

export function CreateMigrationButton() {
  const router = useRouter();
  const auth = useBridgeAuth();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const isOperator = auth.participant?.role === "operator";

  async function create() {
    if (!isOperator) {
      router.push(`/room/${DEMO_RUN_ID}`);
      return;
    }

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
        disabled={busy || auth.status === "loading"}
        aria-busy={busy}
      >
        {busy
          ? "Creating…"
          : isOperator
            ? "Create migration →"
            : "Open live demo →"}
      </button>
      {err ? <p className="muted" style={{ fontSize: 12, color: "var(--amber)" }}>{err}</p> : null}
    </div>
  );
}
