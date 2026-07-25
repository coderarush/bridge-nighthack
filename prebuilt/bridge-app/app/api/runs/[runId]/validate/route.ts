import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/db/supabase";
import { githubValidationClient, demoRepoRef } from "@/lib/adapters/github";
import { canReadyForReview } from "@/lib/state-machine/transitions";
import { addEvent, updateRun } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest, { params }: { params: { runId: string } }) {
  const runId = params.runId;
  const db = createServiceClient();
  const { data: run } = await db.from("migration_runs").select("*").eq("id", runId).single();
  if (!run?.commit_sha) return Response.json({ error: "no commit yet" }, { status: 409 });

  const ref = demoRepoRef();
  const v = await githubValidationClient.checkForSha(ref, run.commit_sha);

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
    await updateRun(runId, { status: "validation_failed" });
    await addEvent(runId, { actorType: "system", eventType: "validation.failed", stage: "validating", status: "error", message: `CI concluded: ${v.conclusion}.` });
  }

  return Response.json({ runId, status: v.status, conclusion: v.conclusion ?? null, url: v.url });
}
