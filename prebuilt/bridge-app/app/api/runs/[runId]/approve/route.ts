import { NextRequest } from "next/server";
import {
  authErrorResponse,
  requireRunParticipant,
} from "@/lib/auth/session";
import {
  demoRepoRef,
  githubRepositoryClient,
} from "@/lib/adapters/github";
import { createServiceClient } from "@/lib/db/supabase";
import { addEvent } from "@/lib/db/queries";
import { readCurrentHeadStatus } from "@/lib/evidence/verification";
import type { EvidenceView } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ runId: string }> },
) {
  const { runId } = await context.params;
  let participant;
  try {
    participant = await requireRunParticipant(req, runId, ["provider"]);
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
  const decision = payload.decision === "rejected" ? "rejected" : "approved";
  const note = typeof payload.note === "string" ? payload.note.trim().slice(0, 500) : "";
  const planVersion = Number(payload.planVersion);
  if (!Number.isInteger(planVersion) || planVersion < 1) {
    return Response.json(
      { error: "Plan version is invalid.", code: "INVALID_PLAN_VERSION", retryable: false },
      { status: 400 },
    );
  }

  const db = createServiceClient();
  const { data: run, error: runError } = await db
    .from("migration_runs")
    .select(
      "status, plan_version, commit_sha, pull_request_url, pull_request_number, validation_url, validation_status, validation_conclusion",
    )
    .eq("id", runId)
    .single();
  if (runError?.code === "PGRST116") {
    return Response.json(
      { error: "Migration run not found.", code: "RUN_NOT_FOUND", retryable: false },
      { status: 404 },
    );
  }
  if (runError) {
    return Response.json(
      { error: runError.message, code: "RUN_READ_FAILED", retryable: true },
      { status: 503 },
    );
  }
  if (run.status !== "ready_for_review" || run.plan_version !== planVersion) {
    return Response.json(
      {
        error: "Only the current validated migration plan can be approved.",
        code: "RUN_NOT_READY_FOR_APPROVAL",
        retryable: false,
      },
      { status: 409 },
    );
  }

  if (decision === "approved") {
    const evidence: EvidenceView = {
      commitSha: run.commit_sha ?? undefined,
      pullRequestUrl: run.pull_request_url ?? undefined,
      pullRequestNumber: run.pull_request_number ?? undefined,
      validationUrl: run.validation_url ?? undefined,
      validationStatus: run.validation_status ?? undefined,
      validationConclusion: run.validation_conclusion ?? undefined,
    };
    const headStatus = await readCurrentHeadStatus(evidence, async () => {
      return githubRepositoryClient.getPullRequestHead(
        demoRepoRef(),
        run.pull_request_number as number,
      );
    });

    if (headStatus === "unavailable") {
      return Response.json(
        {
          error: "The current pull request head could not be verified.",
          code: "EVIDENCE_HEAD_UNAVAILABLE",
          retryable: true,
        },
        { status: 503 },
      );
    }
    if (headStatus !== "matched") {
      return Response.json(
        {
          error: "The pull request head no longer matches the validated commit.",
          code: "EVIDENCE_HEAD_NOT_VERIFIED",
          retryable: false,
        },
        { status: 409 },
      );
    }
  }

  const { data, error } = await db
    .from("approvals")
    .insert({
      run_id: runId,
      plan_version: planVersion,
      participant_id: participant.userId,
      decision,
      note,
    })
    .select()
    .single();
  if (error) {
    return Response.json(
      { error: error.message, code: "APPROVAL_WRITE_FAILED", retryable: false },
      { status: error.code === "23505" ? 409 : 503 },
    );
  }

  await addEvent(runId, {
    actorType: "user",
    actorId: participant.userId,
    eventType: `review.${decision}`,
    stage: "ready_for_review",
    status: decision === "approved" ? "ok" : "error",
    message: `${participant.name} ${decision} the validated migration.`,
  });
  return Response.json({ approval: data });
}
