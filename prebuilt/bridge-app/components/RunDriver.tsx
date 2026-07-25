"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useBridgeAuth } from "./AuthBootstrap";

const TERMINAL = ["ready_for_review", "validation_failed", "patch_failed", "scan_failed", "analysis_failed", "cancelled"];

export function RunDriver({
  runId,
  status,
  onRefresh,
}: {
  runId: string;
  status: string;
  onRefresh?: () => void | Promise<void>;
}) {
  const router = useRouter();
  const auth = useBridgeAuth();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Poll GitHub check-runs for the exact SHA while validating.
  useEffect(() => {
    if (status !== "validating" || auth.participant?.role !== "operator") return;
    const t = setInterval(async () => {
      try {
        await auth.authorizedFetch(`/api/runs/${runId}/validate`, { method: "POST" });
        if (onRefresh) await onRefresh();
        else router.refresh();
      } catch {}
    }, 4000);
    return () => clearInterval(t);
  }, [auth, onRefresh, status, runId, router]);

  if (TERMINAL.includes(status) || auth.participant?.role !== "operator") return null;

  async function run() {
    setBusy(true); setErr(null);
    try {
      let currentStatus = status;
      for (let step = 0; step < 3 && currentStatus !== "validating"; step += 1) {
        const res = await auth.authorizedFetch(`/api/runs/${runId}/advance`, {
          method: "POST",
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(payload.error ?? "Migration advance failed.");
        currentStatus = payload.status;
        if (currentStatus !== "planning") break;
      }
      if (onRefresh) await onRefresh();
      else router.refresh();
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Migration advance failed.");
    } finally { setBusy(false); }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginLeft: "auto" }}>
      <button className="btn" onClick={run} disabled={busy || status === "validating"}>
        {status === "validating" ? "Validating on GitHub…" : busy ? "Running…" : "Run migration → draft PR"}
      </button>
      {err ? <span className="muted" style={{ fontSize: 11, color: "var(--amber)" }}>{err}</span> : null}
    </div>
  );
}
