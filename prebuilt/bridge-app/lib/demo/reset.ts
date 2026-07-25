import { createServiceClient } from "@/lib/db/supabase";

export type DemoResetEnv = {
  [key: string]: string | undefined;
  DEMO_MODE?: string;
  NEXT_PUBLIC_DEMO_RUN_ID?: string;
};

export type DemoResetErrorCode =
  | "DEMO_MODE_DISABLED"
  | "DEMO_RUN_NOT_CONFIGURED"
  | "RUN_NOT_RESETTABLE"
  | "RUN_NOT_FOUND"
  | "RESET_FAILED";

export class DemoResetError extends Error {
  constructor(
    readonly code: DemoResetErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DemoResetError";
  }
}

type ResetRow = {
  id?: string;
  runId?: string;
  status: "analyzing_change";
};

export type DemoResetExecutor = (
  runId: string,
) => Promise<ResetRow | null>;

export type DemoResetResult = {
  runId: string;
  status: "analyzing_change";
  githubArtifacts: "preserved";
  warning: string;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function requireDemoResetTarget(
  requestedRunId: string,
  env: DemoResetEnv = process.env,
): string {
  if (env.DEMO_MODE !== "true") {
    throw new DemoResetError(
      "DEMO_MODE_DISABLED",
      "Demo reset is disabled.",
    );
  }

  const configuredRunId = env.NEXT_PUBLIC_DEMO_RUN_ID?.trim();
  if (!configuredRunId || !UUID_PATTERN.test(configuredRunId)) {
    throw new DemoResetError(
      "DEMO_RUN_NOT_CONFIGURED",
      "NEXT_PUBLIC_DEMO_RUN_ID must contain the exact demo run UUID.",
    );
  }

  if (requestedRunId !== configuredRunId) {
    throw new DemoResetError(
      "RUN_NOT_RESETTABLE",
      "Only the configured demo run can be reset.",
    );
  }

  return configuredRunId;
}

const liveResetExecutor: DemoResetExecutor = async (runId) => {
  const db = createServiceClient();
  const { data, error } = await db
    .rpc("reset_demo_run", { p_run_id: runId })
    .maybeSingle();

  if (error) {
    throw new DemoResetError(
      "RESET_FAILED",
      `Unable to reset demo run: ${error.message}`,
    );
  }

  const row = data as { id: string; status: string } | null;
  return row
    ? {
        id: row.id,
        status: row.status as "analyzing_change",
      }
    : null;
};

export async function resetDemoRun(
  requestedRunId: string,
  env: DemoResetEnv = process.env,
  execute: DemoResetExecutor = liveResetExecutor,
): Promise<DemoResetResult> {
  const runId = requireDemoResetTarget(requestedRunId, env);
  const resetRun = await execute(runId);
  if (!resetRun) {
    throw new DemoResetError(
      "RUN_NOT_FOUND",
      "The configured demo run does not exist.",
    );
  }

  return {
    runId,
    status: resetRun.status,
    githubArtifacts: "preserved",
    warning:
      "Database demo state was reset. Existing GitHub branches, commits, pull requests, and checks were not deleted.",
  };
}
