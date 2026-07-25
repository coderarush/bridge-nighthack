import { NextRequest } from "next/server";
import {
  demoRepoRef,
  githubRepositoryClient,
} from "@/lib/adapters/github";
import { authErrorResponse, requireRunParticipant } from "@/lib/auth/session";
import { getRoom } from "@/lib/db/queries";
import { isPublicDemoRun } from "@/lib/demo/public-access";
import { projectCurrentEvidence } from "@/lib/evidence/verification";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ runId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const { runId } = await context.params;
  const publicDemo = isPublicDemoRun(runId);
  if (!publicDemo) {
    try {
      await requireRunParticipant(request, runId);
    } catch (error) {
      return (
        authErrorResponse(error) ??
        Response.json(
          { error: "Authorization failed.", code: "AUTH_FAILED", retryable: false },
          { status: 401 },
        )
      );
    }
  }

  try {
    const room = await getRoom(runId);
    if (!room) {
      return Response.json(
        { error: "Migration run not found.", code: "RUN_NOT_FOUND" },
        { status: 404 },
      );
    }

    const pullRequestNumber = room.evidence.pullRequestNumber;
    const projected = await projectCurrentEvidence(
      room.status,
      room.evidence,
      async () => {
        if (!pullRequestNumber) {
          throw new Error("Stored pull request evidence is incomplete.");
        }
        return githubRepositoryClient.getPullRequestHead(
          demoRepoRef(),
          pullRequestNumber,
        );
      },
    );

    return Response.json(
      {
        room: {
          ...room,
          status: projected.runStatus,
          evidence: projected.evidence,
        },
      },
      {
        headers: {
          "Cache-Control": publicDemo
            ? "public, s-maxage=15, stale-while-revalidate=60"
            : "private, no-store",
        },
      },
    );
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
