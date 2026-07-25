import { createHash } from "node:crypto";

export function requireCapability(value: unknown): string {
  if (typeof value !== "string" || !value) {
    throw new Error("Participant capability is required.");
  }
  if (value.length < 24 || value.length > 256) {
    throw new Error("Participant capability must be between 24 and 256 characters.");
  }
  return value;
}

export function capabilityDigest(capability: string): string {
  const digest = createHash("sha256").update(capability, "utf8").digest("hex");
  return `\\x${digest}`;
}
