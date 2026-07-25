/**
 * Bridge adapter seams. These interfaces are the contract between the demo
 * implementations (built LIVE during NightHack) and the UI/orchestrator. Keep
 * every AtlasPay-specific rule inside a "recipe" behind these interfaces so a
 * fallback implementation can preserve the UI flow.
 *
 * Pre-built: the interfaces + one deterministic PatchEngine (lib/patcher) and
 * ImpactScanner (lib/scanner) and ChangeDetector (lib/openapi) already exist.
 * LIVE-BUILD: RepositoryClient, ValidationClient, RealtimePublisher.
 */
import type { ProviderChangeView, ImpactView } from "../types";

export interface ChangeDetector {
  detect(oldSpec: string, newSpec: string): Promise<ProviderChangeView> | ProviderChangeView;
}

export interface ScanTarget {
  path: string;
  contents: string;
}

export interface ImpactScanner {
  scan(files: ScanTarget[]): ImpactView[];
}

export interface PatchEdit {
  line: number;
  before: string;
  after: string;
}
export interface PatchedFile {
  path: string;
  patched: string;
  edits: PatchEdit[];
}

export interface PatchEngine {
  patch(files: ScanTarget[]): PatchedFile[];
}

export interface RepositoryRef {
  owner: string;
  repo: string;
  baseBranch: string;
}

export interface PullRequestResult {
  branchName: string;
  commitSha: string;
  pullRequestNumber: number;
  pullRequestUrl: string;
}

// LIVE-BUILD: implement with @octokit/rest + a fine-grained PAT (server-only).
export interface RepositoryClient {
  getFiles(ref: RepositoryRef, paths: string[]): Promise<ScanTarget[]>;
  getPullRequestHead(
    ref: RepositoryRef,
    pullRequestNumber: number,
  ): Promise<string>;
  createBranch(ref: RepositoryRef, branchName: string): Promise<{ sha: string }>;
  commitFiles(
    ref: RepositoryRef,
    branchName: string,
    files: PatchedFile[],
    message: string,
  ): Promise<{ commitSha: string }>;
  openDraftPullRequest(
    ref: RepositoryRef,
    branchName: string,
    title: string,
    body: string,
    expectedCommitSha: string,
  ): Promise<PullRequestResult>;
}

export interface ValidationStatus {
  status: "queued" | "in_progress" | "completed";
  conclusion?: "success" | "failure" | "neutral" | "cancelled" | "timed_out";
  url: string;
}

// LIVE-BUILD: poll GitHub check-runs for the EXACT commit sha (no webhook).
export interface ValidationClient {
  checkForSha(ref: RepositoryRef, commitSha: string): Promise<ValidationStatus>;
}

// LIVE-BUILD: implement with Supabase Realtime (presence + broadcast).
export interface RealtimePublisher {
  broadcast(runId: string, event: string, payload: unknown): Promise<void>;
}
