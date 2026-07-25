"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useBridgeAuth } from "@/components/AuthBootstrap";

export function DemoResetControl({
  demoMode,
  runId,
}: {
  demoMode: boolean;
  runId: string;
}) {
  const auth = useBridgeAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canReset =
    demoMode &&
    Boolean(runId) &&
    auth.status === "ready" &&
    auth.participant?.role === "operator";

  async function reset() {
    if (!canReset) return;
    setBusy(true);
    setError(null);
    setResult(null);

    try {
      const response = await auth.authorizedFetch(
        `/api/runs/${encodeURIComponent(runId)}/reset`,
        { method: "POST" },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error ?? "Demo reset failed.");
      }
      setResult(payload.warning);
      router.refresh();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Demo reset failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel" style={{ marginTop: 16, maxWidth: 720 }}>
      <h2 style={{ marginTop: 0 }}>Demo reset</h2>
      <p className="muted">
        Clear Bridge&apos;s derived state for the configured demo run and return
        it to analysis.
      </p>
      <p className="muted">
        This does not delete existing GitHub branches, commits, pull requests,
        or checks.
      </p>

      {!demoMode ? (
        <p role="status">Demo mode is disabled.</p>
      ) : auth.status === "loading" ? (
        <p role="status">Checking operator access…</p>
      ) : auth.status === "invite_required" ? (
        <p role="alert">Open this page with the operator invite link.</p>
      ) : auth.participant?.role !== "operator" ? (
        <p role="alert">Operator access is required.</p>
      ) : null}

      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <button
          type="button"
          className="btn"
          disabled={!canReset || busy}
          onClick={reset}
          aria-busy={busy}
        >
          {busy ? "Resetting…" : "Reset database demo state"}
        </button>
        {runId ? <Link href={`/room/${runId}`}>Open demo room</Link> : null}
      </div>

      {result ? <p role="status">{result}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
}
