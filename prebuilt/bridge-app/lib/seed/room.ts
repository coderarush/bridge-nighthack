import type { RoomAggregate } from "../types";

// Local-only fixture state. It may show deterministic analysis, but never
// external PR, CI, approval, or completion evidence.
export const seedRoom: RoomAggregate = {
  runId: "demo",
  status: "planning",
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
  repository: { owner: "coderarush", name: "atlas-store-demo", defaultBranch: "demo-base" },
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
  ],
  comments: [],
  approvals: [],
  evidence: {},
};
