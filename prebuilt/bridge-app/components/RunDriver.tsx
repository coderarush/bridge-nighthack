"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const TERMINAL = ["ready_for_review", "validation_failed", "patch_failed", "scan_failed", "analysis_failed", "cancelled"];

export function RunDriver({ runId, status }: { runId: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Poll GitHub check-runs for the exact SHA while validating.
  useEffect(() => {
    if (status !== "validating") return;
    const t = setInterval(async () => {
      try { await fetch(`/api/runs/${runId}/validate`, { method: "POST" }); router.refresh(); } catch {}
    }, 4000);
    return () => clearInterval(t);
  }, [status, runId, router]);

  if (TERMINAL.includes(status)) return null;

  async function run() {
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/runs/${runId}/advance`, { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      router.refresh();
    } catch {
      setErr("Advance failed — check GITHUB_TOKEN / owner env.");
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
