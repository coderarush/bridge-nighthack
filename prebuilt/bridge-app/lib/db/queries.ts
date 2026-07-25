/**
 * Server-only aggregate reads. The seed is available only when Supabase is not
 * configured; configured environments fail closed on missing rows or errors.
 */
import { createServiceClient } from "./supabase";
import { seedRoom } from "../seed/room";
import type {
  RoomAggregate,
  ImpactView,
  RunEventView,
  EvidenceView,
  RunStatus,
} from "../types";

function hasSupabase(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && (process.env.SUPABASE_SECRET_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY));
}

export async function getRoom(runId: string): Promise<RoomAggregate | null> {
  if (!hasSupabase()) return { ...seedRoom, runId };
  const db = createServiceClient();
  const { data: run, error: runError } = await db
    .from("migration_runs")
    .select("*")
    .eq("id", runId)
    .single();
  if (runError?.code === "PGRST116") return null;
  if (runError) throw new Error(`Unable to load migration run: ${runError.message}`);
  if (!run) return null;

  const results = await Promise.all([
    db.from("provider_changes").select("*").eq("id", run.provider_change_id).single(),
    db.from("repositories").select("*").eq("id", run.repository_id).single(),
    db.from("impacts").select("*").eq("run_id", runId).order("file_path"),
    db.from("migration_plans").select("*").eq("run_id", runId).order("version", { ascending: false }).limit(1).maybeSingle(),
    db.from("run_events").select("*").eq("run_id", runId).order("sequence"),
    db.from("comments").select("*").eq("run_id", runId).order("created_at"),
    db.from("approvals").select("*").eq("run_id", runId).order("created_at"),
  ]);
  const failed = results.find((result) => result.error);
  if (failed?.error) throw new Error(`Unable to load migration room: ${failed.error.message}`);

  const [changeResult, repoResult, impactsResult, planResult, eventsResult, commentsResult, approvalsResult] = results;
  const change = changeResult.data as any;
  const repo = repoResult.data as any;
  const impacts = impactsResult.data as any[] | null;
  const plan = planResult.data as any;
  const events = eventsResult.data as any[] | null;
  const comments = commentsResult.data as any[] | null;
  const approvals = approvalsResult.data as any[] | null;

  const impactViews: ImpactView[] = (impacts ?? []).map((i: any) => ({
    filePath: i.file_path, lineStart: i.line_start, lineEnd: i.line_end,
    snippet: i.snippet, reason: i.reason, confidence: Number(i.confidence ?? 1),
  }));
  const eventViews: RunEventView[] = (events ?? []).map((e: any) => ({
    sequence: e.sequence, actorType: e.actor_type, actorId: e.actor_id,
    eventType: e.event_type, stage: e.stage, status: e.status, message: e.message,
    createdAt: e.created_at,
  }));
  const evidence: EvidenceView = {
    branchName: run.branch_name ?? undefined,
    commitSha: run.commit_sha ?? undefined,
    pullRequestUrl: run.pull_request_url ?? undefined,
    pullRequestNumber: run.pull_request_number ?? undefined,
    validationUrl: run.validation_url ?? undefined,
    validationStatus: run.validation_status ?? undefined,
    validationConclusion: run.validation_conclusion ?? undefined,
  };

  return {
    runId,
    status: run.status as RunStatus,
    title: `AtlasPay v1 → v2 · ${repo?.name ?? "repository"}`,
    change: {
      provider: "AtlasPay",
      fromVersion: change?.from_version ?? "unknown",
      toVersion: change?.to_version ?? "unknown",
      severity: (change?.severity ?? "breaking") as "breaking" | "non_breaking",
      summary: change?.summary ?? "Change analysis pending.",
      oldSpecUrl: change?.old_spec_url ?? "",
      newSpecUrl: change?.new_spec_url ?? "",
      removed: change?.normalized_diff?.removed ?? [],
      addedRequired: change?.normalized_diff?.addedRequired ?? [],
      operation: change?.normalized_diff?.operation ?? "Operation pending",
    },
    repository: {
      owner: repo?.owner ?? "",
      name: repo?.name ?? "",
      defaultBranch: repo?.default_branch ?? "",
    },
    impacts: impactViews,
    plan: plan
      ? {
          version: plan.version,
          title: plan.title,
          steps: plan.steps ?? [],
          patchSummary: plan.patch_summary,
          riskLevel: plan.risk_level,
        }
      : {
          version: run.plan_version ?? 1,
          title: "Migration plan pending",
          steps: [],
          patchSummary: "No patch has been generated.",
          riskLevel: "pending",
        },
    events: eventViews,
    comments: (comments ?? []).map((c: any) => ({
      participantName: c.participant_name,
      role: c.role,
      body: c.body,
      createdAt: c.created_at,
    })),
    approvals: (approvals ?? []).map((a: any) => ({
      participantName: a.participant_name,
      decision: a.decision,
      note: a.note,
      planVersion: a.plan_version,
      createdAt: a.created_at,
    })),
    evidence,
  };
}

// Append an audit event with the next sequence number.
export async function addEvent(runId: string, e: Omit<RunEventView, "sequence" | "createdAt">) {
  const db = createServiceClient();
  const { error } = await db.rpc("append_run_event", {
    p_run_id: runId,
    p_actor_type: e.actorType,
    p_actor_id: e.actorId ?? null,
    p_event_type: e.eventType,
    p_stage: e.stage,
    p_status: e.status,
    p_message: e.message,
    p_metadata: {},
  });
  if (error) throw new Error(`Unable to append audit event: ${error.message}`);
}

export async function updateRun(runId: string, patch: Record<string, unknown>) {
  const db = createServiceClient();
  const { error } = await db
    .from("migration_runs")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", runId);
  if (error) throw new Error(`Unable to update migration run: ${error.message}`);
}
