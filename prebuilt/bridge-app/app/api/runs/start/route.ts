import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/db/supabase";
import { diffAtlasPay } from "@/lib/openapi/atlaspay-diff";
import { ATLASPAY_V1_SPEC, ATLASPAY_V2_SPEC } from "@/lib/openapi/atlaspay-specs";
import { ATLASPAY_RECIPE } from "@/lib/recipe/atlaspay";
import { demoRepoRef } from "@/lib/adapters/github";
import { addEvent } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest) {
  const db = createServiceClient();
  const diff = diffAtlasPay(ATLASPAY_V1_SPEC, ATLASPAY_V2_SPEC);
  const op = diff.operations[0];
  const ref = demoRepoRef();

  const { data: provider } = await db
    .from("providers")
    .upsert({ slug: ATLASPAY_RECIPE.providerSlug, name: ATLASPAY_RECIPE.providerName }, { onConflict: "slug" })
    .select().single();

  const { data: change } = await db.from("provider_changes").insert({
    provider_id: provider!.id,
    from_version: diff.fromVersion,
    to_version: diff.toVersion,
    old_spec_url: "/fixtures/" + ATLASPAY_RECIPE.oldSpecFile,
    new_spec_url: "/fixtures/" + ATLASPAY_RECIPE.newSpecFile,
    summary: diff.summary,
    severity: diff.severity,
    normalized_diff: { removed: op.removed, addedRequired: op.addedRequired, operation: op.operation },
  }).select().single();

  // find-or-create repository
  let { data: repo } = await db.from("repositories").select("*").eq("owner", ref.owner).eq("name", ref.repo).maybeSingle();
  if (!repo) {
    const created = await db.from("repositories").insert({ owner: ref.owner, name: ref.repo, default_branch: ref.baseBranch }).select().single();
    repo = created.data;
  }

  const { data: run } = await db.from("migration_runs").insert({
    provider_change_id: change!.id,
    repository_id: repo!.id,
    status: "analyzing_change",
    current_stage: "analyzing_change",
  }).select().single();

  await addEvent(run!.id, { actorType: "system", eventType: "run.created", stage: "queued", status: "ok", message: "Run created for AtlasPay v1 → v2." });
  await addEvent(run!.id, { actorType: "system", eventType: "change.analysis.completed", stage: "analyzing_change", status: "ok", message: diff.summary });

  return Response.json({ runId: run!.id, status: "analyzing_change" });
}
