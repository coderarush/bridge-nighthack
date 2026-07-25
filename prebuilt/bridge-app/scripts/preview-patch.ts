/**
 * Dev utility: preview Bridge's deterministic patch against local demo files
 * without touching GitHub. Usage:  npm run patch:preview
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { patchSource } from "../lib/patcher/atlaspay-rename";

const repo = resolve(process.cwd(), "../atlas-store-demo");
const files = [
  "src/checkout/create-payment.ts",
  "src/subscriptions/renew.ts",
  "src/refunds/retry-charge.ts",
  "src/util/logging.ts",
];
let edits = 0;
for (const rel of files) {
  const { edits: e, changed } = patchSource(readFileSync(`${repo}/${rel}`, "utf8"), rel);
  edits += e.length;
  console.log(`\n${rel}: ${changed ? e.length + " edit(s)" : "unchanged (correctly ignored)"}`);
  for (const ed of e) console.log(`  line ${ed.line}:  ${ed.before}  ->  ${ed.after}`);
}
console.log(`\nTotal edits: ${edits}  (expected 3)`);
