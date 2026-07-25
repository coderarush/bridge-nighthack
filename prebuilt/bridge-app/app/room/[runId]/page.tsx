import { RoomClient } from "@/components/RoomClient";

export const dynamic = "force-dynamic";

export default async function RoomPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  return <RoomClient runId={runId} />;
}
