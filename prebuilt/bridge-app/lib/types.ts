// Shared domain types for Bridge. Mirrors supabase/migrations/0001_init.sql.

export type RunStatus =
  | "queued"
  | "analyzing_change"
  | "scanning_repo"
  | "planning"
  | "patching"
  | "validating"
  | "ready_for_review"
  | "analysis_failed"
  | "scan_failed"
  | "patch_failed"
  | "validation_failed"
  | "cancelled";

export interface ProviderChangeView {
  provider: string;
  fromVersion: string;
  toVersion: string;
  severity: "breaking" | "non_breaking";
  summary: string;
  oldSpecUrl: string;
  newSpecUrl: string;
  removed: string[];
  addedRequired: string[];
  operation: string;
}

export interface ImpactView {
  filePath: string;
  lineStart: number;
  lineEnd: number;
  snippet: string;
  reason: string;
  confidence: number;
}

export interface PlanView {
  version: number;
  title: string;
  steps: string[];
  patchSummary: string;
  riskLevel: string;
}

export interface RunEventView {
  sequence: number;
  actorType: string;
  actorId?: string;
  eventType: string;
  stage: string;
  status: string;
  message: string;
  createdAt: string;
}

export interface CommentView {
  participantName: string;
  role: string;
  body: string;
  createdAt: string;
}

export interface ApprovalView {
  participantName: string;
  decision: string;
  note?: string;
  planVersion: number;
  createdAt: string;
}

export interface EvidenceView {
  branchName?: string;
  commitSha?: string;
  pullRequestUrl?: string;
  pullRequestNumber?: number;
  validationUrl?: string;
  validationStatus?: string;
  validationConclusion?: string;
  currentHeadStatus?: "matched" | "mismatched" | "unavailable" | "not_checked";
}

export interface RoomAggregate {
  runId: string;
  status: RunStatus;
  title: string;
  change: ProviderChangeView;
  repository: { owner: string; name: string; defaultBranch: string };
  impacts: ImpactView[];
  plan: PlanView;
  events: RunEventView[];
  comments: CommentView[];
  approvals: ApprovalView[];
  evidence: EvidenceView;
}
