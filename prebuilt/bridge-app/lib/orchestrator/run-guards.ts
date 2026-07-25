import type { RepositoryRef } from "../adapters/interfaces";
import type { RunStatus } from "../types";

type DemoRepositoryEnv = {
  [key: string]: string | undefined;
  GITHUB_DEMO_OWNER?: string;
  GITHUB_DEMO_REPO?: string;
  GITHUB_DEMO_BASE_BRANCH?: string;
};

export type AdvanceDisposition =
  | "execute"
  | "retryable"
  | "already_running"
  | "complete";

export function requireDemoRepositoryConfig(
  env: DemoRepositoryEnv = process.env,
): RepositoryRef {
  const owner = env.GITHUB_DEMO_OWNER?.trim();
  const repo = env.GITHUB_DEMO_REPO?.trim();
  const baseBranch = env.GITHUB_DEMO_BASE_BRANCH?.trim();
  const missing = [
    !owner && "GITHUB_DEMO_OWNER",
    !repo && "GITHUB_DEMO_REPO",
    !baseBranch && "GITHUB_DEMO_BASE_BRANCH",
  ].filter(Boolean);

  if (missing.length) {
    throw new Error(`Missing demo repository configuration: ${missing.join(", ")}`);
  }

  return { owner: owner!, repo: repo!, baseBranch: baseBranch! };
}

export function classifyAdvance(status: RunStatus): AdvanceDisposition {
  switch (status) {
    case "queued":
    case "analyzing_change":
    case "planning":
      return "execute";
    case "analysis_failed":
    case "scan_failed":
    case "patch_failed":
    case "validation_failed":
      return "retryable";
    case "scanning_repo":
    case "patching":
    case "validating":
      return "already_running";
    case "ready_for_review":
    case "cancelled":
      return "complete";
  }
}

type MigrationShape = {
  expectedFetchPaths: string[];
  expectedImpactPaths: string[];
  fetchedPaths: string[];
  impactPaths: string[];
  patchedPaths: string[];
};

function normalized(paths: string[]): string[] {
  return [...new Set(paths)].sort();
}

function samePaths(left: string[], right: string[]): boolean {
  const a = normalized(left);
  const b = normalized(right);
  return a.length === b.length && a.every((path, index) => path === b[index]);
}

export function validateMigrationShape(shape: MigrationShape): void {
  const fetched = normalized(shape.fetchedPaths);
  const expectedFetch = normalized(shape.expectedFetchPaths);
  if (!samePaths(fetched, expectedFetch)) {
    throw new Error(
      `Repository scan fetched ${fetched.length} of ${expectedFetch.length} required fixture files.`,
    );
  }

  if (!samePaths(shape.impactPaths, shape.expectedImpactPaths)) {
    throw new Error("Repository scan returned an unexpected impacted file set.");
  }

  if (!samePaths(shape.patchedPaths, shape.impactPaths)) {
    throw new Error("Patch file set does not match impacts.");
  }
}
