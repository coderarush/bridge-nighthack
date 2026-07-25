"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { RoomAggregate } from "@/lib/types";
import { useBridgeAuth } from "./AuthBootstrap";
import { Timeline } from "./Timeline";
import { ImpactedFiles } from "./ImpactedFiles";
import { EvidencePanel } from "./EvidencePanel";
import { RoomSidebar } from "./RoomSidebar";
import { RunDriver } from "./RunDriver";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; room: RoomAggregate }
  | { status: "not_found" }
  | { status: "error"; message: string };

export function RoomClient({ runId }: { runId: string }) {
  const auth = useBridgeAuth();
  const [state, setState] = useState<LoadState>({ status: "loading" });

  const loadRoom = useCallback(async () => {
    if (auth.status !== "ready") return;
    setState((current) =>
      current.status === "ready" ? current : { status: "loading" },
    );
    try {
      const response = await auth.authorizedFetch(`/api/runs/${runId}`);
      const payload = await response.json().catch(() => ({}));
      if (response.status === 404) {
        setState({ status: "not_found" });
        return;
      }
      if (!response.ok || !payload.room) {
        throw new Error(payload.error ?? "Unable to load migration room.");
      }
      setState({ status: "ready", room: payload.room });
    } catch (error) {
      setState({
        status: "error",
        message:
          error instanceof Error ? error.message : "Unable to load migration room.",
      });
    }
  }, [auth, runId]);

  useEffect(() => {
    if (auth.status === "ready") void loadRoom();
  }, [auth.status, loadRoom]);

  if (auth.status === "loading" || state.status === "loading") {
    return (
      <main className="container">
        <p className="muted" role="status">
          Establishing the migration room…
        </p>
      </main>
    );
  }

  if (auth.status === "invite_required") {
    return (
      <main className="container">
        <h1>Participant access required</h1>
        <p className="muted">
          Open the provider, customer, or operator capability link supplied for
          this demo.
        </p>
      </main>
    );
  }

  if (auth.status === "error") {
    return (
      <main className="container">
        <p className="muted" role="alert">
          Authentication failed before the room could load.
        </p>
      </main>
    );
  }

  if (state.status === "not_found") {
    return (
      <main className="container">
        <h1>Migration room not found</h1>
        <Link href="/" className="muted">
          ← Return to Bridge
        </Link>
      </main>
    );
  }

  if (state.status === "error") {
    return (
      <main className="container">
        <p role="alert">{state.message}</p>
        <button className="btn secondary" type="button" onClick={() => void loadRoom()}>
          Retry
        </button>
      </main>
    );
  }

  const room = state.room;
  const ready = room.status === "ready_for_review";
  return (
    <main className="container">
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <Link href="/" className="muted">← Bridge</Link>
        <h1 className="room-title">{room.title}</h1>
        <span className={"badge " + (ready ? "green" : "")}>
          {ready ? "● ready for review" : room.status}
        </span>
        <RunDriver
          runId={room.runId}
          status={room.status}
          onRefresh={loadRoom}
        />
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <span className="badge breaking">● breaking</span>
          <strong>{room.change.provider} {room.change.fromVersion} → {room.change.toVersion}</strong>
          <span className="muted">{room.change.summary}</span>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16, marginTop: 16, alignItems: "start" }}>
        <div style={{ display: "grid", gap: 16 }}>
          <ImpactedFiles impacts={room.impacts} />
          <EvidencePanel evidence={room.evidence} runStatus={room.status} />
          <Timeline events={room.events} />
        </div>
        <RoomSidebar room={room} onRefresh={loadRoom} />
      </div>
    </main>
  );
}
