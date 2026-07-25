/**
 * Data layer. Every read falls back to the seed aggregate when Supabase env is
 * absent or a row is missing, so the deployed URL always renders something
 * (skeleton before go-live, real data after). Server-only.
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

export async function getRoom(runId: string): Promise<RoomAggregate> {
  if (!hasSupabase()) return { ...seedRoom, runId };
  try {
    const db = createServiceClient();
    const { data: run } = await db.from("migration_runs").select("*").eq("id", runId).single();
    if (!run) return { ...seedRoom, runId };

    const [{ data: change }, { data: repo }, { data: impacts }, { data: plan }, { data: events }, { data: comments }, { data: approvals }] =
      await Promise.all([
        db.from("provider_changes").select("*").eq("id", run.provider_change_id).single(),
        db.from("repositories").select("*").eq("id", run.repository_id).single(),
        db.from("impacts").select("*").eq("run_id", runId).order("file_path"),
        db.from("migration_plans").select("*").eq("run_id", runId).order("version", { ascending: false }).limit(1).maybeSingle(),
        db.from("run_events").select("*").eq("run_id", runId).order("sequence"),
        db.from("comments").select("*").eq("run_id", runId).order("created_at"),
        db.from("approvals").select("*").eq("run_id", runId).order("created_at"),
      ]);

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
      title: `${change?.summary ? "AtlasPay v1 → v2" : "Migration"} · ${repo?.name ?? "repo"}`,
      change: {
        provider: "AtlasPay",
        fromVersion: change?.from_version ?? "1.0.0",
        toVersion: change?.to_version ?? "2.0.0",
        severity: (change?.severity ?? "breaking") as "breaking" | "non_breaking",
        summary: change?.summary ?? seedRoom.change.summary,
        oldSpecUrl: change?.old_spec_url ?? seedRoom.change.oldSpecUrl,
        newSpecUrl: change?.new_spec_url ?? seedRoom.change.newSpecUrl,
        removed: change?.normalized_diff?.removed ?? seedRoom.change.removed,
        addedRequired: change?.normalized_diff?.addedRequired ?? seedRoom.change.addedRequired,
        operation: change?.normalized_diff?.operation ?? seedRoom.change.operation,
      },
      repository: { owner: repo?.owner ?? "", name: repo?.name ?? "", defaultBranch: repo?.default_branch ?? "demo-base" },
      impacts: impactViews.length ? impactViews : seedRoom.impacts,
      plan: plan
        ? { version: plan.version, title: plan.title, steps: plan.steps ?? [], patchSummary: plan.patch_summary, riskLevel: plan.risk_level }
        : seedRoom.plan,
      events: eventViews,
      comments: (comments ?? []).map((c: any) => ({ participantName: c.participant_name, role: c.role, body: c.body, createdAt: c.created_at })),
      approvals: (approvals ?? []).map((a: any) => ({ participantName: a.participant_name, decision: a.decision, note: a.note, planVersion: a.plan_version, createdAt: a.created_at })),
      evidence,
    };
  } catch {
    return { ...seedRoom, runId };
  }
}

// Append an audit event with the next sequence number.
export async function addEvent(runId: string, e: Omit<RunEventView, "sequence" | "createdAt">) {
  const db = createServiceClient();
  const { data: last } = await db.from("run_events").select("sequence").eq("run_id", runId).order("sequence", { ascending: false }).limit(1).maybeSingle();
  const sequence = (last?.sequence ?? 0) + 1;
  await db.from("run_events").insert({
    run_id: runId, sequence, actor_type: e.actorType, actor_id: e.actorId ?? null,
    event_type: e.eventType, stage: e.stage, status: e.status, message: e.message,
  });
}

export async function updateRun(runId: string, patch: Record<string, unknown>) {
  const db = createServiceClient();
  await db.from("migration_runs").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", runId);
}
