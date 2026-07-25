import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/db/supabase";
import { githubRepositoryClient, demoRepoRef } from "@/lib/adapters/github";
import { atlasPayScanner, atlasPayPatchEngine } from "@/lib/adapters/deterministic";
import { ATLASPAY_RECIPE, buildPrBody } from "@/lib/recipe/atlaspay";
import { addEvent, updateRun } from "@/lib/db/queries";
import {
  classifyAdvance,
  validateMigrationShape,
} from "@/lib/orchestrator/run-guards";
import type { ImpactView, RunStatus } from "@/lib/types";
import { authErrorResponse, requireOperator } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ runId: string }> };

type LockedRun = {
  status: RunStatus;
  branch_name: string | null;
  commit_sha: string | null;
  pull_request_url: string | null;
  pull_request_number: number | null;
};

function apiError(
  status: number,
  code: string,
  error: string,
  retryable: boolean,
) {
  return Response.json({ error, code, retryable }, { status });
}

function isStale(run: { lock_expires_at?: string | null }): boolean {
  return Boolean(
    run.lock_expires_at &&
      new Date(run.lock_expires_at).getTime() <= Date.now(),
  );
}

async function acquireRunLock(runId: string, lockOwner: string) {
  const db = createServiceClient();
  const { data, error } = await db
    .rpc("acquire_run_lock", {
      p_run_id: runId,
      p_lock_owner: lockOwner,
      p_lease_seconds: 90,
    })
    .maybeSingle();
  if (error) throw new Error(`Unable to acquire run lock: ${error.message}`);
  return data as LockedRun | null;
}

async function releaseRunLock(runId: string, lockOwner: string) {
  const db = createServiceClient();
  const { error } = await db.rpc("release_run_lock", {
    p_run_id: runId,
    p_lock_owner: lockOwner,
  });
  if (error) throw new Error(`Unable to release run lock: ${error.message}`);
}

function expectedImpactPaths(): string[] {
  return ATLASPAY_RECIPE.targetFiles.filter(
    (path) => path !== "src/util/logging.ts",
  );
}

async function persistImpacts(runId: string, impacts: ImpactView[]) {
  const db = createServiceClient();
  const { error: deleteError } = await db
    .from("impacts")
    .delete()
    .eq("run_id", runId);
  if (deleteError) throw new Error(`Unable to replace impacts: ${deleteError.message}`);

  const { error: insertError } = await db.from("impacts").insert(
    impacts.map((impact) => ({
      run_id: runId,
      file_path: impact.filePath,
      line_start: impact.lineStart,
      line_end: impact.lineEnd,
      snippet: impact.snippet,
      reason: impact.reason,
      confidence: impact.confidence,
    })),
  );
  if (insertError) throw new Error(`Unable to persist impacts: ${insertError.message}`);
}

async function persistPlan(runId: string, impactCount: number) {
  const db = createServiceClient();
  const { error: deleteError } = await db
    .from("migration_plans")
    .delete()
    .eq("run_id", runId)
    .eq("version", 1);
  if (deleteError) throw new Error(`Unable to replace migration plan: ${deleteError.message}`);

  const { error: insertError } = await db.from("migration_plans").insert({
    run_id: runId,
    version: 1,
    title: "Rename AtlasPay request property in verified call sites",
    steps: [
      "Rename payment_method to payment_method_id in impacted files.",
      "Change nothing else.",
      "Open a draft PR and validate the exact commit.",
    ],
    patch_summary: `${impactCount} key renames, 0 other changes.`,
    risk_level: "low",
  });
  if (insertError) throw new Error(`Unable to persist migration plan: ${insertError.message}`);
}

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    await requireOperator(req);
  } catch (error) {
    return (
      authErrorResponse(error) ??
      apiError(401, "AUTH_FAILED", "Authorization failed.", false)
    );
  }

  const { runId } = await context.params;
  const db = createServiceClient();
  const { data: currentRun, error: runError } = await db
    .from("migration_runs")
    .select("*")
    .eq("id", runId)
    .single();
  if (runError?.code === "PGRST116") {
    return apiError(404, "RUN_NOT_FOUND", "Migration run not found.", false);
  }
  if (runError) {
    return apiError(503, "RUN_READ_FAILED", runError.message, true);
  }

  const disposition = classifyAdvance(currentRun.status as RunStatus);
  const staleRunningStage =
    disposition === "already_running" && isStale(currentRun);
  if (disposition === "complete") {
    return Response.json({
      runId,
      status: currentRun.status,
      commitSha: currentRun.commit_sha,
      pullRequestUrl: currentRun.pull_request_url,
    });
  }
  if (disposition === "already_running" && !staleRunningStage) {
    return Response.json(
      { runId, status: currentRun.status, retryable: true },
      { status: 202 },
    );
  }

  let ref;
  try {
    ref = demoRepoRef();
  } catch (error) {
    return apiError(
      503,
      "REPOSITORY_NOT_CONFIGURED",
      error instanceof Error ? error.message : "Repository is not configured.",
      false,
    );
  }

  const lockOwner = randomUUID();
  let lockedRun;
  try {
    lockedRun = await acquireRunLock(runId, lockOwner);
  } catch (error) {
    return apiError(
      503,
      "LOCK_FAILED",
      error instanceof Error ? error.message : "Unable to lock migration run.",
      true,
    );
  }
  if (!lockedRun) {
    return apiError(409, "RUN_LOCKED", "Another migration worker owns this run.", true);
  }

  const status = lockedRun.status as RunStatus;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  const stage =
    status === "planning" ||
    status === "patch_failed" ||
    status === "patching"
      ? "patch"
      : "scan";

  try {
    const files = await githubRepositoryClient.getFiles(
      ref,
      ATLASPAY_RECIPE.targetFiles,
    );
    const impacts = atlasPayScanner.scan(files);

    if (stage === "scan") {
      await updateRun(runId, {
        status: "scanning_repo",
        current_stage: "scanning_repo",
        error_code: null,
        error_message: null,
      });
      await addEvent(runId, {
        actorType: "system",
        eventType: "repo.scan.started",
        stage: "scanning_repo",
        status: "ok",
        message: "Fetching controlled target files from GitHub.",
      });
      validateMigrationShape({
        expectedFetchPaths: ATLASPAY_RECIPE.targetFiles,
        expectedImpactPaths: expectedImpactPaths(),
        fetchedPaths: files.map((file) => file.path),
        impactPaths: impacts.map((impact) => impact.filePath),
        patchedPaths: impacts.map((impact) => impact.filePath),
      });
      await persistImpacts(runId, impacts);
      await persistPlan(runId, impacts.length);
      await addEvent(runId, {
        actorType: "system",
        eventType: "repo.scan.completed",
        stage: "scanning_repo",
        status: "ok",
        message: `Found ${impacts.length} impacted files; ignored look-alike strings.`,
      });
      await addEvent(runId, {
        actorType: "system",
        eventType: "plan.created",
        stage: "planning",
        status: "ok",
        message: "Bounded rename plan created.",
      });
      await updateRun(runId, {
        status: "planning",
        current_stage: "planning",
      });
      return Response.json({ runId, status: "planning", impacts: impacts.length });
    }

    await updateRun(runId, {
      status: "patching",
      current_stage: "patching",
      error_code: null,
      error_message: null,
    });
    const patched = atlasPayPatchEngine.patch(files);
    validateMigrationShape({
      expectedFetchPaths: ATLASPAY_RECIPE.targetFiles,
      expectedImpactPaths: expectedImpactPaths(),
      fetchedPaths: files.map((file) => file.path),
      impactPaths: impacts.map((impact) => impact.filePath),
      patchedPaths: patched.map((file) => file.path),
    });
    await addEvent(runId, {
      actorType: "system",
      eventType: "patch.completed",
      stage: "patching",
      status: "ok",
      message: `Patched ${patched.length} files deterministically.`,
    });

    const branchName =
      lockedRun.branch_name ??
      `${ATLASPAY_RECIPE.branchPrefix}${runId.slice(0, 8)}`;
    let commitSha = lockedRun.commit_sha as string | null;
    if (!commitSha) {
      await githubRepositoryClient.createBranch(ref, branchName);
      const commit = await githubRepositoryClient.commitFiles(
        ref,
        branchName,
        patched,
        ATLASPAY_RECIPE.commitMessage,
      );
      commitSha = commit.commitSha;
      await updateRun(runId, {
        branch_name: branchName,
        commit_sha: commitSha,
      });
      await addEvent(runId, {
        actorType: "system",
        eventType: "github.branch.created",
        stage: "patching",
        status: "ok",
        message: `Committed to ${branchName} (${commitSha.slice(0, 7)}).`,
      });
    }

    let pullRequestUrl = lockedRun.pull_request_url as string | null;
    let pullRequestNumber = lockedRun.pull_request_number as number | null;
    if (!pullRequestUrl) {
      const body = buildPrBody({
        impacts,
        evidence: { commitSha },
        roomUrl: `${appUrl}/room/${runId}`,
      });
      const pr = await githubRepositoryClient.openDraftPullRequest(
        ref,
        branchName,
        ATLASPAY_RECIPE.prTitle,
        body,
      );
      if (pr.commitSha !== commitSha) {
        throw new Error(
          `Draft PR head ${pr.commitSha || "missing"} does not match committed SHA ${commitSha}.`,
        );
      }
      pullRequestUrl = pr.pullRequestUrl;
      pullRequestNumber = pr.pullRequestNumber;
      await updateRun(runId, {
        pull_request_number: pullRequestNumber,
        pull_request_url: pullRequestUrl,
      });
      await addEvent(runId, {
        actorType: "system",
        eventType: "github.pr.created",
        stage: "patching",
        status: "ok",
        message: `Opened draft PR #${pullRequestNumber}.`,
      });
    }

    await updateRun(runId, {
      status: "validating",
      current_stage: "validating",
    });
    await addEvent(runId, {
      actorType: "system",
      eventType: "validation.started",
      stage: "validating",
      status: "ok",
      message: "Waiting for GitHub Actions on the exact commit.",
    });
    return Response.json({
      runId,
      status: "validating",
      branchName,
      commitSha,
      pullRequestUrl,
    });
  } catch (error) {
    const failedStatus = stage === "scan" ? "scan_failed" : "patch_failed";
    const message =
      error instanceof Error ? error.message : "Migration stage failed.";
    try {
      await updateRun(runId, {
        status: failedStatus,
        current_stage: stage,
        error_code:
          stage === "scan" ? "REPOSITORY_SCAN_FAILED" : "PATCH_OR_PR_FAILED",
        error_message: message,
      });
      await addEvent(runId, {
        actorType: "system",
        eventType: `${stage}.failed`,
        stage,
        status: "error",
        message,
      });
    } catch {
      // Preserve the original stage error in the response.
    }
    return apiError(
      502,
      stage === "scan" ? "REPOSITORY_SCAN_FAILED" : "PATCH_OR_PR_FAILED",
      message,
      true,
    );
  } finally {
    try {
      await releaseRunLock(runId, lockOwner);
    } catch {
      // The lease expires, so a failed release cannot permanently block recovery.
    }
  }
}
