import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/db/supabase";
import { githubRepositoryClient, demoRepoRef } from "@/lib/adapters/github";
import { atlasPayScanner, atlasPayPatchEngine } from "@/lib/adapters/deterministic";
import { ATLASPAY_RECIPE, buildPrBody } from "@/lib/recipe/atlaspay";
import { addEvent, updateRun } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { runId: string } }) {
  const runId = params.runId;
  const db = createServiceClient();
  const ref = demoRepoRef();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;

  // 1) fetch + scan
  await updateRun(runId, { status: "scanning_repo", current_stage: "scanning_repo" });
  await addEvent(runId, { actorType: "system", eventType: "repo.scan.started", stage: "scanning_repo", status: "ok", message: "Fetching target files from GitHub." });
  const files = await githubRepositoryClient.getFiles(ref, ATLASPAY_RECIPE.targetFiles);
  const impacts = atlasPayScanner.scan(files);
  await db.from("impacts").delete().eq("run_id", runId);
  if (impacts.length) {
    await db.from("impacts").insert(impacts.map((i) => ({
      run_id: runId, file_path: i.filePath, line_start: i.lineStart, line_end: i.lineEnd,
      snippet: i.snippet, reason: i.reason, confidence: i.confidence,
    })));
  }
  await addEvent(runId, { actorType: "system", eventType: "repo.scan.completed", stage: "scanning_repo", status: "ok", message: `Found ${impacts.length} impacted files; ignored look-alike strings.` });

  // 2) plan
  await updateRun(runId, { status: "planning", current_stage: "planning" });
  await db.from("migration_plans").insert({
    run_id: runId, version: 1, title: "Rename AtlasPay request property in verified call sites",
    steps: ["Rename payment_method → payment_method_id in impacted files.", "Change nothing else.", "Open a draft PR and validate the exact commit."],
    patch_summary: `${impacts.length} key renames, 0 other changes.`, risk_level: "low",
  });
  await addEvent(runId, { actorType: "system", eventType: "plan.created", stage: "planning", status: "ok", message: "Bounded rename plan created." });

  // 3) patch (deterministic)
  await updateRun(runId, { status: "patching", current_stage: "patching" });
  const patched = atlasPayPatchEngine.patch(files);
  await addEvent(runId, { actorType: "system", eventType: "patch.completed", stage: "patching", status: "ok", message: `Patched ${patched.length} files deterministically.` });

  // 4) branch + commit + draft PR
  const shortId = runId.slice(0, 8);
  const branchName = ATLASPAY_RECIPE.branchPrefix + shortId;
  await githubRepositoryClient.createBranch(ref, branchName);
  const { commitSha } = await githubRepositoryClient.commitFiles(ref, branchName, patched, ATLASPAY_RECIPE.commitMessage);
  await addEvent(runId, { actorType: "system", eventType: "github.branch.created", stage: "patching", status: "ok", message: `Committed to ${branchName} (${commitSha.slice(0, 7)}).` });

  const roomUrl = `${appUrl}/room/${runId}`;
  const body = buildPrBody({ impacts, evidence: { commitSha }, roomUrl });
  const pr = await githubRepositoryClient.openDraftPullRequest(ref, branchName, ATLASPAY_RECIPE.prTitle, body);

  await updateRun(runId, {
    status: "validating", current_stage: "validating",
    branch_name: branchName, commit_sha: commitSha,
    pull_request_number: pr.pullRequestNumber, pull_request_url: pr.pullRequestUrl,
  });
  await addEvent(runId, { actorType: "system", eventType: "github.pr.created", stage: "patching", status: "ok", message: `Opened draft PR #${pr.pullRequestNumber}.` });
  await addEvent(runId, { actorType: "system", eventType: "validation.started", stage: "validating", status: "ok", message: "Waiting for GitHub Actions on the exact commit." });

  return Response.json({ runId, status: "validating", branchName, commitSha, pullRequestUrl: pr.pullRequestUrl });
}
