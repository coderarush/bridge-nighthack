import type { RoomAggregate } from "../types";

// Seed aggregate used by the deployed skeleton and as a live-demo fallback.
// LIVE-BUILD: replace with getRoom(runId) reading Supabase (see lib/db).
export const seedRoom: RoomAggregate = {
  runId: "demo",
  status: "ready_for_review",
  title: "AtlasPay v1 → v2 · atlas-store-demo",
  change: {
    provider: "AtlasPay",
    fromVersion: "1.0.0",
    toVersion: "2.0.0",
    severity: "breaking",
    summary:
      "POST /payments: removed `payment_method`; now requires `payment_method_id`.",
    oldSpecUrl: "/fixtures/atlaspay-v1.openapi.yaml",
    newSpecUrl: "/fixtures/atlaspay-v2.openapi.yaml",
    removed: ["payment_method"],
    addedRequired: ["payment_method_id"],
    operation: "POST /payments",
  },
  repository: { owner: "your-org", name: "atlas-store-demo", defaultBranch: "demo-base" },
  impacts: [
    {
      filePath: "src/checkout/create-payment.ts",
      lineStart: 8,
      lineEnd: 8,
      snippet: "payment_method: pmToken,",
      reason: "AtlasPay request key `payment_method` in a verified request object (sibling `amount` present).",
      confidence: 1,
    },
    {
      filePath: "src/subscriptions/renew.ts",
      lineStart: 8,
      lineEnd: 8,
      snippet: "payment_method: pm,",
      reason: "AtlasPay request key `payment_method` in a verified request object (sibling `amount` present).",
      confidence: 1,
    },
    {
      filePath: "src/refunds/retry-charge.ts",
      lineStart: 9,
      lineEnd: 9,
      snippet: "payment_method: pm,",
      reason: "AtlasPay request key `payment_method` in a verified request object (sibling `amount` present).",
      confidence: 1,
    },
  ],
  plan: {
    version: 1,
    title: "Rename AtlasPay request property in 3 verified call sites",
    steps: [
      "Rename object key `payment_method` → `payment_method_id` in the 3 impacted files.",
      "Leave all strings, comments, and unrelated identifiers unchanged.",
      "Open a draft PR against demo-base and validate the exact commit in CI.",
    ],
    patchSummary: "3 key renames, 0 other changes.",
    riskLevel: "low",
  },
  events: [
    { sequence: 1, actorType: "system", eventType: "run.created", stage: "queued", status: "ok", message: "Run created for AtlasPay v1 → v2.", createdAt: "" },
    { sequence: 2, actorType: "system", eventType: "change.analysis.completed", stage: "analyzing_change", status: "ok", message: "Breaking change normalized: payment_method → payment_method_id.", createdAt: "" },
    { sequence: 3, actorType: "system", eventType: "repo.scan.completed", stage: "scanning_repo", status: "ok", message: "Found 3 impacted files; ignored 3 false-positive strings.", createdAt: "" },
    { sequence: 4, actorType: "system", eventType: "plan.created", stage: "planning", status: "ok", message: "Bounded rename plan created.", createdAt: "" },
    { sequence: 5, actorType: "user", actorId: "AtlasPay (provider)", eventType: "plan.approved", stage: "planning", status: "ok", message: "Provider approved the rename.", createdAt: "" },
    { sequence: 6, actorType: "system", eventType: "github.pr.created", stage: "patching", status: "ok", message: "Opened draft PR #1.", createdAt: "" },
    { sequence: 7, actorType: "system", eventType: "validation.passed", stage: "validating", status: "ok", message: "GitHub Actions passed for commit.", createdAt: "" },
    { sequence: 8, actorType: "system", eventType: "run.ready_for_review", stage: "ready_for_review", status: "ok", message: "Migration ready for review.", createdAt: "" },
  ],
  comments: [
    { participantName: "AtlasPay", role: "provider", body: "Confirmed — value semantics are unchanged, only the key renamed.", createdAt: "" },
  ],
  approvals: [
    { participantName: "AtlasPay", decision: "approved", note: "Patch is limited to AtlasPay request fields.", planVersion: 1, createdAt: "" },
  ],
  evidence: {
    branchName: "bridge/atlaspay-v2-demo",
    commitSha: "0000000",
    pullRequestUrl: "https://github.com/your-org/atlas-store-demo/pull/1",
    pullRequestNumber: 1,
    validationUrl: "https://github.com/your-org/atlas-store-demo/actions",
    validationStatus: "completed",
    validationConclusion: "success",
  },
};
