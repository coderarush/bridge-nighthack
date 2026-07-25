import { NextRequest } from "next/server";
import { authErrorResponse, requireParticipant } from "@/lib/auth/session";
import { getRoom } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ runId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    await requireParticipant(request);
  } catch (error) {
    return (
      authErrorResponse(error) ??
      Response.json(
        { error: "Authorization failed.", code: "AUTH_FAILED", retryable: false },
        { status: 401 },
      )
    );
  }

  const { runId } = await context.params;
  try {
    const room = await getRoom(runId);
    if (!room) {
      return Response.json(
        { error: "Migration run not found.", code: "RUN_NOT_FOUND" },
        { status: 404 },
      );
    }
    return Response.json({ room });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to load migration room.",
        code: "ROOM_READ_FAILED",
        retryable: true,
      },
      { status: 503 },
    );
  }
}
