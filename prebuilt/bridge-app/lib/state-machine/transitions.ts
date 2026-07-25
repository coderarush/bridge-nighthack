import type { RunStatus } from "../types";
import { hasCompleteEvidence } from "../evidence/verification";
import type { EvidenceView } from "../types";

// Allowed forward transitions for a migration run.
export const TRANSITIONS: Record<RunStatus, RunStatus[]> = {
  queued: ["analyzing_change", "cancelled"],
  analyzing_change: ["scanning_repo", "analysis_failed", "cancelled"],
  scanning_repo: ["planning", "scan_failed", "cancelled"],
  planning: ["patching", "cancelled"],
  patching: ["validating", "patch_failed", "cancelled"],
  validating: ["ready_for_review", "validation_failed", "cancelled"],
  ready_for_review: [],
  analysis_failed: ["analyzing_change", "cancelled"],
  scan_failed: ["scanning_repo", "cancelled"],
  patch_failed: ["patching", "cancelled"],
  validation_failed: ["validating", "cancelled"],
  cancelled: [],
};

export function canTransition(from: RunStatus, to: RunStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

// validating -> ready_for_review requires verified evidence for the SAME sha.
export function canReadyForReview(evidence: EvidenceView): boolean {
  return hasCompleteEvidence(evidence);
}
