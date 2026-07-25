import assert from "node:assert/strict";
import test from "node:test";
import {
  decryptInstallationReference,
  encryptInstallationReference,
  installationReferenceDigest,
  normalizeInstallationId,
} from "../installation-reference";

const MASTER_KEY = "BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=";
const WORKSPACE_A = "11111111-1111-4111-8111-111111111111";
const WORKSPACE_B = "22222222-2222-4222-8222-222222222222";

test("encrypts a randomized installation reference bound to its workspace", () => {
  const encrypted = encryptInstallationReference({
    installationId: "123456789",
    workspaceId: WORKSPACE_A,
    encodedMasterKey: MASTER_KEY,
  });
  const secondEncrypted = encryptInstallationReference({
    installationId: "123456789",
    workspaceId: WORKSPACE_A,
    encodedMasterKey: MASTER_KEY,
  });

  assert.match(encrypted, /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  assert.notEqual(encrypted, secondEncrypted);
  assert.equal(
    decryptInstallationReference({
      encryptedReference: encrypted,
      workspaceId: WORKSPACE_A,
      encodedMasterKey: MASTER_KEY,
    }),
    "123456789",
  );
  assert.throws(
    () =>
      decryptInstallationReference({
        encryptedReference: encrypted,
        workspaceId: WORKSPACE_B,
        encodedMasterKey: MASTER_KEY,
      }),
    /invalid installation reference/i,
  );
});

test("rejects tampered and malformed installation reference envelopes", () => {
  const encrypted = encryptInstallationReference({
    installationId: "987654321",
    workspaceId: WORKSPACE_A,
    encodedMasterKey: MASTER_KEY,
  });
  const parts = encrypted.split(".");
  const tag = parts[3];
  parts[3] = `${tag.slice(0, -1)}${tag.endsWith("A") ? "B" : "A"}`;

  for (const candidate of [
    parts.join("."),
    encrypted.replace(/^v1\./, "v2."),
    "v1.missing.parts",
    "",
  ]) {
    assert.throws(
      () =>
        decryptInstallationReference({
          encryptedReference: candidate,
          workspaceId: WORKSPACE_A,
          encodedMasterKey: MASTER_KEY,
        }),
      /invalid installation reference/i,
    );
  }
});

test("creates a stable keyed lookup digest without exposing the raw id", () => {
  const digest = installationReferenceDigest("123456789", MASTER_KEY);

  assert.match(digest, /^[0-9a-f]{64}$/);
  assert.equal(
    installationReferenceDigest(123456789, MASTER_KEY),
    digest,
  );
  assert.notEqual(digest, installationReferenceDigest("123456788", MASTER_KEY));
  assert.notEqual(digest, "123456789");
});

test("normalizes only positive signed-64-bit decimal installation ids", () => {
  assert.equal(normalizeInstallationId("1"), "1");
  assert.equal(normalizeInstallationId(123456789), "123456789");
  assert.equal(normalizeInstallationId(9_223_372_036_854_775_807n), "9223372036854775807");

  for (const value of [
    "",
    "0",
    "-1",
    "01",
    "1.5",
    " 1",
    "1 ",
    "9223372036854775808",
    Number.MAX_SAFE_INTEGER + 1,
    Number.NaN,
    Number.POSITIVE_INFINITY,
  ]) {
    assert.throws(
      () => normalizeInstallationId(value),
      /invalid github installation id/i,
    );
  }
});

test("requires a canonical base64-encoded 32-byte master key", () => {
  const shortKey = "BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBw==";

  for (const encodedMasterKey of ["", "not-base64", shortKey, `${MASTER_KEY}\n`]) {
    assert.throws(
      () => installationReferenceDigest("123", encodedMasterKey),
      /installation reference key/i,
    );
  }
});
