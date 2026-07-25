// All AtlasPay-specific migration rules live here (not in UI or adapters).
import type { EvidenceView, ImpactView } from "../types";

export const ATLASPAY_RECIPE = {
  providerSlug: "atlaspay",
  providerName: "AtlasPay",
  fromVersion: "1.0.0",
  toVersion: "2.0.0",
  operation: "POST /payments",
  oldSpecFile: "atlaspay-v1.openapi.yaml",
  newSpecFile: "atlaspay-v2.openapi.yaml",
  // Files Bridge fetches + scans. logging.ts is included to prove false positives are ignored.
  targetFiles: [
    "src/checkout/create-payment.ts",
    "src/subscriptions/renew.ts",
    "src/refunds/retry-charge.ts",
    "src/util/logging.ts",
  ],
  branchPrefix: "bridge/atlaspay-v2-",
  commitMessage:
    "Bridge: migrate AtlasPay payments to v2 (payment_method -> payment_method_id)",
  prTitle: "Bridge migration: AtlasPay v1 → v2",
};

export function buildPrBody(args: {
  impacts: ImpactView[];
  evidence: Pick<EvidenceView, "commitSha">;
  roomUrl: string;
}): string {
  const files = args.impacts.map((i) => `- ${i.filePath}`).join("\n");
  return `## Bridge migration: AtlasPay v1 → v2

AtlasPay changed the \`POST /payments\` request contract:

- removed \`payment_method\`
- added required \`payment_method_id\`

### Impacted files
${files}

### Patch
Renamed the AtlasPay request property in ${args.impacts.length} verified call sites.
No unrelated strings or identifiers were changed.

### Validation
- Typecheck: pending CI
- Tests: pending CI
- Commit: \`${args.evidence.commitSha ?? "<sha>"}\`

### Review
Migration room: ${args.roomUrl}

This is a draft PR and requires human review before merge.`;
}
