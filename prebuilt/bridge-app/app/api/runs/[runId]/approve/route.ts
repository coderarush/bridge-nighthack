import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/db/supabase";
import { addEvent } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { runId: string } }) {
  const { planVersion = 1, decision = "approved", note = "", participantName = "AtlasPay" } = await req.json();
  const db = createServiceClient();
  const { data } = await db.from("approvals").insert({ run_id: params.runId, plan_version: planVersion, participant_name: participantName, decision, note }).select().single();
  await addEvent(params.runId, { actorType: "user", actorId: participantName, eventType: "plan.approved", stage: "planning", status: "ok", message: `${participantName} ${decision} the plan.` });
  return Response.json({ approval: data });
}
