import assert from "node:assert/strict";
import { test } from "node:test";
import { capabilityDigest, requireCapability } from "../capability";

test("hashes capabilities into the Postgres bytea digest format", () => {
  assert.equal(
    capabilityDigest("bridge-capability-test"),
    "\\xa8fb31f9f4d56a3f7a0c40a8e245a3030e7d640b1c68217781018d88faa7cdbb",
  );
});

test("rejects absent, short, and oversized capabilities", () => {
  assert.throws(() => requireCapability(undefined), /capability is required/i);
  assert.throws(() => requireCapability("short"), /between 24 and 256/i);
  assert.throws(() => requireCapability("x".repeat(257)), /between 24 and 256/i);
});

test("normalizes a valid capability without changing its value", () => {
  const capability = "bridge_operator_7af91d0eab8321";
  assert.equal(requireCapability(capability), capability);
});
