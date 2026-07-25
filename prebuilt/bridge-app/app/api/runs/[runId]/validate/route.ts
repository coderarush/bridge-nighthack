import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/db/supabase";
import {
  demoRepoRef,
  githubRepositoryClient,
  githubValidationClient,
} from "@/lib/adapters/github";
import { canReadyForReview } from "@/lib/state-machine/transitions";
import { addEvent, updateRun } from "@/lib/db/queries";
import { authErrorResponse, requireOperator } from "@/lib/auth/session";
import {
  PullRequestHeadMismatchError,
} from "@/lib/adapters/github-pr-head";
import {
  IncompleteEvidenceError,
  verifyCurrentEvidenceHead,
} from "@/lib/evidence/verification";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ runId: string }> };
type ValidationSnapshot = {
  url?: string | null;
  status?: string | null;
};

async function invalidateEvidence(
  runId: string,
  {
    code,
    message,
    validation,
  }: {
    code: string;
    message: string;
    validation?: ValidationSnapshot;
  },
): Promise<Response> {
  await updateRun(runId, {
    status: "validation_failed",
    current_stage: "validating",
    ...(validation?.url ? { validation_url: validation.url } : {}),
    validation_status: validation?.status ?? "completed",
    validation_conclusion: null,
    error_code: code,
    error_message: message,
  });
  await addEvent(runId, {
    actorType: "system",
    eventType: "validation.failed",
    stage: "validating",
    status: "error",
    message,
  });
  return Response.json(
    { error: message, code, retryable: false },
    { status: 409 },
  );
}

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
  if (!["validating", "validation_failed", "ready_for_review"].includes(run.status)) {
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

  if (run.status === "ready_for_review") {
    const storedEvidence = {
      commitSha: run.commit_sha ?? undefined,
      pullRequestUrl: run.pull_request_url ?? undefined,
      pullRequestNumber: run.pull_request_number ?? undefined,
      validationUrl: run.validation_url ?? undefined,
      validationStatus: run.validation_status ?? undefined,
      validationConclusion: run.validation_conclusion ?? undefined,
    };
    try {
      await verifyCurrentEvidenceHead(
        storedEvidence,
        () =>
          githubRepositoryClient.getPullRequestHead(
            ref,
            run.pull_request_number,
          ),
      );
    } catch (error) {
      if (error instanceof IncompleteEvidenceError) {
        return invalidateEvidence(runId, {
          code: "STORED_EVIDENCE_INCOMPLETE",
          message: error.message,
          validation: {
            url: run.validation_url,
            status: run.validation_status,
          },
        });
      }
      if (error instanceof PullRequestHeadMismatchError) {
        return invalidateEvidence(runId, {
          code: "PR_HEAD_MISMATCH",
          message: error.message,
          validation: {
            url: run.validation_url,
            status: run.validation_status,
          },
        });
      }
      return Response.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Unable to read the current pull request head.",
          code: "GITHUB_PR_READ_FAILED",
          retryable: true,
        },
        { status: 502 },
      );
    }

    return Response.json({
      runId,
      status: "completed",
      conclusion: "success",
      url: run.validation_url,
      commitSha: run.commit_sha,
    });
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

  if (v.status === "completed" && v.conclusion === "success") {
    const evidence = {
      commitSha: run.commit_sha,
      pullRequestUrl: run.pull_request_url ?? undefined,
      pullRequestNumber: run.pull_request_number ?? undefined,
      validationUrl: v.url,
      validationStatus: v.status,
      validationConclusion: v.conclusion,
    };
    if (!canReadyForReview(evidence)) {
      return invalidateEvidence(runId, {
        code: "EVIDENCE_INCOMPLETE",
        message: "The PR, commit, and completed CI evidence chain is incomplete.",
        validation: v,
      });
    }

    try {
      await verifyCurrentEvidenceHead(
        evidence,
        () =>
          githubRepositoryClient.getPullRequestHead(
            ref,
            run.pull_request_number,
          ),
      );
    } catch (error) {
      if (!(error instanceof PullRequestHeadMismatchError)) {
        return Response.json(
          {
            error:
              error instanceof Error
                ? error.message
                : "Unable to read the current pull request head.",
            code: "GITHUB_PR_READ_FAILED",
            retryable: true,
          },
          { status: 502 },
        );
      }

      return invalidateEvidence(runId, {
        code: "PR_HEAD_MISMATCH",
        message: error.message,
        validation: v,
      });
    }

    await updateRun(runId, {
      validation_url: v.url,
      validation_status: v.status,
      validation_conclusion: v.conclusion,
      status: "ready_for_review",
      current_stage: "ready_for_review",
      error_code: null,
      error_message: null,
    });
    await addEvent(runId, { actorType: "system", eventType: "validation.passed", stage: "validating", status: "ok", message: "GitHub Actions passed for the exact commit." });
    await addEvent(runId, { actorType: "system", eventType: "run.ready_for_review", stage: "ready_for_review", status: "ok", message: "Migration ready for review." });
  } else if (v.status === "completed" && v.conclusion && v.conclusion !== "success") {
    await updateRun(runId, {
      validation_url: v.url,
      validation_status: v.status,
      validation_conclusion: v.conclusion,
      status: "validation_failed",
      current_stage: "validating",
      error_code: "VALIDATION_FAILED",
      error_message: `CI concluded: ${v.conclusion}.`,
    });
    await addEvent(runId, { actorType: "system", eventType: "validation.failed", stage: "validating", status: "error", message: `CI concluded: ${v.conclusion}.` });
  } else {
    await updateRun(runId, {
      validation_url: v.url,
      validation_status: v.status,
      validation_conclusion: v.conclusion ?? null,
    });
  }

  return Response.json({
    runId,
    status: v.status,
    conclusion: v.conclusion ?? null,
    url: v.url,
    commitSha: run.commit_sha,
  });
}
