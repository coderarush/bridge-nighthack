import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/db/supabase";
import { diffAtlasPay } from "@/lib/openapi/atlaspay-diff";
import { ATLASPAY_V1_SPEC, ATLASPAY_V2_SPEC } from "@/lib/openapi/atlaspay-specs";
import { ATLASPAY_RECIPE } from "@/lib/recipe/atlaspay";
import { demoRepoRef } from "@/lib/adapters/github";
import { addEvent } from "@/lib/db/queries";
import { authErrorResponse, requireOperator } from "@/lib/auth/session";
import { resetDemoRun } from "@/lib/demo/reset";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
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

  const db = createServiceClient();
  const diff = diffAtlasPay(ATLASPAY_V1_SPEC, ATLASPAY_V2_SPEC);
  const op = diff.operations[0];

  if (process.env.DEMO_MODE === "true") {
    const runId = process.env.NEXT_PUBLIC_DEMO_RUN_ID?.trim() ?? "";
    try {
      await resetDemoRun(runId);
      await addEvent(runId, {
        actorType: "system",
        eventType: "run.created",
        stage: "queued",
        status: "ok",
        message: "Run created for AtlasPay v1 → v2.",
      });
      await addEvent(runId, {
        actorType: "system",
        eventType: "change.analysis.completed",
        stage: "analyzing_change",
        status: "ok",
        message: diff.summary,
      });
      return Response.json({ runId, status: "analyzing_change" });
    } catch (error) {
      return Response.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Unable to prepare the configured demo run.",
          code: "DEMO_RUN_PREPARE_FAILED",
          retryable: true,
        },
        { status: 503 },
      );
    }
  }

  const { data: provider, error: providerError } = await db
    .from("providers")
    .upsert({ slug: ATLASPAY_RECIPE.providerSlug, name: ATLASPAY_RECIPE.providerName }, { onConflict: "slug" })
    .select().single();
  if (providerError) {
    return Response.json(
      { error: providerError.message, code: "PROVIDER_WRITE_FAILED", retryable: true },
      { status: 503 },
    );
  }

  const { data: change, error: changeError } = await db.from("provider_changes").insert({
    provider_id: provider!.id,
    from_version: diff.fromVersion,
    to_version: diff.toVersion,
    old_spec_url: "/fixtures/" + ATLASPAY_RECIPE.oldSpecFile,
    new_spec_url: "/fixtures/" + ATLASPAY_RECIPE.newSpecFile,
    summary: diff.summary,
    severity: diff.severity,
    normalized_diff: { removed: op.removed, addedRequired: op.addedRequired, operation: op.operation },
  }).select().single();
  if (changeError) {
    return Response.json(
      { error: changeError.message, code: "CHANGE_WRITE_FAILED", retryable: true },
      { status: 503 },
    );
  }

  // find-or-create repository
  let { data: repo, error: repoReadError } = await db
    .from("repositories")
    .select("*")
    .eq("owner", ref.owner)
    .eq("name", ref.repo)
    .maybeSingle();
  if (repoReadError) {
    return Response.json(
      { error: repoReadError.message, code: "REPOSITORY_READ_FAILED", retryable: true },
      { status: 503 },
    );
  }
  if (!repo) {
    const created = await db.from("repositories").insert({ owner: ref.owner, name: ref.repo, default_branch: ref.baseBranch }).select().single();
    if (created.error) {
      return Response.json(
        { error: created.error.message, code: "REPOSITORY_WRITE_FAILED", retryable: true },
        { status: 503 },
      );
    }
    repo = created.data;
  }

  const { data: run, error: runError } = await db.from("migration_runs").insert({
    provider_change_id: change!.id,
    repository_id: repo!.id,
    status: "analyzing_change",
    current_stage: "analyzing_change",
  }).select().single();
  if (runError) {
    return Response.json(
      { error: runError.message, code: "RUN_WRITE_FAILED", retryable: true },
      { status: 503 },
    );
  }

  await addEvent(run!.id, { actorType: "system", eventType: "run.created", stage: "queued", status: "ok", message: "Run created for AtlasPay v1 → v2." });
  await addEvent(run!.id, { actorType: "system", eventType: "change.analysis.completed", stage: "analyzing_change", status: "ok", message: diff.summary });

  return Response.json({ runId: run!.id, status: "analyzing_change" });
}
