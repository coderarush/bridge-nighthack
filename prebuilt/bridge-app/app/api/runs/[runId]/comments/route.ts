import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/db/supabase";
import { addEvent } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { runId: string } }) {
  const { body, participantName = "You", role = "customer" } = await req.json();
  if (!body?.trim()) return Response.json({ error: "empty" }, { status: 400 });
  const db = createServiceClient();
  const { data } = await db.from("comments").insert({ run_id: params.runId, participant_name: participantName, role, body }).select().single();
  await addEvent(params.runId, { actorType: "user", actorId: participantName, eventType: "comment.created", stage: "planning", status: "ok", message: `${participantName} commented.` });
  return Response.json({ comment: data });
}
