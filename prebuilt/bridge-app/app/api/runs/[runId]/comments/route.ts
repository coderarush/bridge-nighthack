import { NextRequest } from "next/server";
import {
  authErrorResponse,
  requireRunParticipant,
} from "@/lib/auth/session";
import { createServiceClient } from "@/lib/db/supabase";
import { addEvent } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ runId: string }> },
) {
  const { runId } = await context.params;
  let participant;
  try {
    participant = await requireRunParticipant(req, runId);
  } catch (error) {
    return (
      authErrorResponse(error) ??
      Response.json(
        { error: "Authorization failed.", code: "AUTH_FAILED", retryable: false },
        { status: 401 },
      )
    );
  }

  const payload = await req.json().catch(() => ({}));
  const body = typeof payload.body === "string" ? payload.body.trim() : "";
  if (!body || body.length > 2000) {
    return Response.json(
      {
        error: "Comment must be between 1 and 2000 characters.",
        code: "INVALID_COMMENT",
        retryable: false,
      },
      { status: 400 },
    );
  }

  const db = createServiceClient();
  const { data, error } = await db
    .from("comments")
    .insert({
      run_id: runId,
      participant_id: participant.userId,
      body,
    })
    .select()
    .single();
  if (error) {
    return Response.json(
      { error: error.message, code: "COMMENT_WRITE_FAILED", retryable: true },
      { status: 503 },
    );
  }

  await addEvent(runId, {
    actorType: "user",
    actorId: participant.userId,
    eventType: "comment.created",
    stage: "discussion",
    status: "ok",
    message: `${participant.name} commented.`,
  });
  return Response.json({ comment: data });
}
