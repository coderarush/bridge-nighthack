import Link from "next/link";
import { getRoom } from "@/lib/db/queries";
import { Timeline } from "@/components/Timeline";
import { ImpactedFiles } from "@/components/ImpactedFiles";
import { EvidencePanel } from "@/components/EvidencePanel";
import { RoomSidebar } from "@/components/RoomSidebar";
import { RunDriver } from "@/components/RunDriver";

export const dynamic = "force-dynamic";

export default async function RoomPage({ params }: { params: { runId: string } }) {
  const room = await getRoom(params.runId);
  const ready = room.status === "ready_for_review";
  return (
    <main className="container">
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <Link href="/" className="muted">← Bridge</Link>
        <h2 style={{ margin: 0 }}>{room.title}</h2>
        <span className={"badge " + (ready ? "green" : "")}>{ready ? "● ready for review" : room.status}</span>
        <RunDriver runId={room.runId} status={room.status} />
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
          <EvidencePanel evidence={room.evidence} />
          <Timeline events={room.events} />
        </div>
        <RoomSidebar room={room} />
      </div>
    </main>
  );
}
