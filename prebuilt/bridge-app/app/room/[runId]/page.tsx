import { RoomClient } from "@/components/RoomClient";
import { isPublicDemoRun } from "@/lib/demo/public-access";

export const dynamic = "force-dynamic";

export default async function RoomPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  return <RoomClient runId={runId} publicDemo={isPublicDemoRun(runId)} />;
}
