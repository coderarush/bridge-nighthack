import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/db/supabase";
import { githubValidationClient, demoRepoRef } from "@/lib/adapters/github";
import { canReadyForReview } from "@/lib/state-machine/transitions";
import { addEvent, updateRun } from "@/lib/db/queries";
import { authErrorResponse, requireOperator } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ runId: string }> };

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    await requireOperator(req);
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
  const db = createServiceClient();
  const { data: run, error: runError } = await db
    .from("migration_runs")
    .select("*")
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
  if (run.status === "ready_for_review") {
    return Response.json({
      runId,
      status: "completed",
      conclusion: "success",
      url: run.validation_url,
      commitSha: run.commit_sha,
    });
  }
  if (!["validating", "validation_failed"].includes(run.status)) {
    return Response.json(
      { error: `Run cannot validate from ${run.status}.`, code: "INVALID_RUN_STATE", retryable: false },
      { status: 409 },
    );
  }
  if (!run.commit_sha) {
    return Response.json(
      { error: "Run has no stored commit SHA.", code: "COMMIT_MISSING", retryable: false },
      { status: 409 },
    );
  }

  let ref;
  try {
    ref = demoRepoRef();
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Repository is not configured.",
        code: "REPOSITORY_NOT_CONFIGURED",
        retryable: false,
      },
      { status: 503 },
    );
  }

  let v;
  try {
    v = await githubValidationClient.checkForSha(ref, run.commit_sha);
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "GitHub validation failed.",
        code: "GITHUB_VALIDATION_FAILED",
        retryable: true,
      },
      { status: 502 },
    );
  }

  await updateRun(runId, {
    validation_url: v.url, validation_status: v.status, validation_conclusion: v.conclusion ?? null,
  });

  if (v.status === "completed" && v.conclusion === "success") {
    const evidence = { commitSha: run.commit_sha, pullRequestUrl: run.pull_request_url, validationUrl: v.url, validationConclusion: v.conclusion };
    if (canReadyForReview(evidence)) {
      await updateRun(runId, { status: "ready_for_review", current_stage: "ready_for_review" });
      await addEvent(runId, { actorType: "system", eventType: "validation.passed", stage: "validating", status: "ok", message: "GitHub Actions passed for the exact commit." });
      await addEvent(runId, { actorType: "system", eventType: "run.ready_for_review", stage: "ready_for_review", status: "ok", message: "Migration ready for review." });
    }
  } else if (v.status === "completed" && v.conclusion && v.conclusion !== "success") {
    await updateRun(runId, {
      status: "validation_failed",
      current_stage: "validating",
      error_code: "VALIDATION_FAILED",
      error_message: `CI concluded: ${v.conclusion}.`,
    });
    await addEvent(runId, { actorType: "system", eventType: "validation.failed", stage: "validating", status: "error", message: `CI concluded: ${v.conclusion}.` });
  }

  return Response.json({
    runId,
    status: v.status,
    conclusion: v.conclusion ?? null,
    url: v.url,
    commitSha: run.commit_sha,
  });
}
