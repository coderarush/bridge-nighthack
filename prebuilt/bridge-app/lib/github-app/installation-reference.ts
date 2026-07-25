import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  hkdfSync,
  randomBytes,
} from "node:crypto";

const MAX_SIGNED_64_BIT = 9_223_372_036_854_775_807n;
const ENVELOPE_VERSION = "v1";
const NONCE_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

type InstallationId = string | number | bigint;

type ReferenceInput = {
  installationId: InstallationId;
  workspaceId: string;
  encodedMasterKey: string;
};

type DecryptInput = {
  encryptedReference: string;
  workspaceId: string;
  encodedMasterKey: string;
};

function canonicalWorkspaceId(workspaceId: string): string {
  if (typeof workspaceId !== "string" || !UUID_PATTERN.test(workspaceId)) {
    throw new Error("Invalid workspace id.");
  }
  return workspaceId.toLowerCase();
}

function decodeMasterKey(encodedMasterKey: string): Buffer {
  if (
    typeof encodedMasterKey !== "string" ||
    encodedMasterKey.length === 0
  ) {
    throw new Error("Invalid installation reference key.");
  }

  const decoded = Buffer.from(encodedMasterKey, "base64");
  if (
    decoded.length !== 32 ||
    decoded.toString("base64") !== encodedMasterKey
  ) {
    throw new Error("Invalid installation reference key.");
  }
  return decoded;
}

function deriveKey(masterKey: Buffer, purpose: "encryption" | "lookup"): Buffer {
  return Buffer.from(
    hkdfSync(
      "sha256",
      masterKey,
      Buffer.from("bridge-github-installation-reference-v1", "utf8"),
      Buffer.from(`bridge/github-app/${purpose}/v1`, "utf8"),
      32,
    ),
  );
}

function additionalData(workspaceId: string): Buffer {
  return Buffer.from(
    `bridge:github-installation-reference:v1:${canonicalWorkspaceId(workspaceId)}`,
    "utf8",
  );
}

function decodeBase64Url(value: string, expectedBytes?: number): Buffer {
  if (!BASE64URL_PATTERN.test(value)) {
    throw new Error("Invalid base64url.");
  }
  const decoded = Buffer.from(value, "base64url");
  if (
    decoded.toString("base64url") !== value ||
    (expectedBytes !== undefined && decoded.length !== expectedBytes)
  ) {
    throw new Error("Invalid base64url.");
  }
  return decoded;
}

export function normalizeInstallationId(value: InstallationId): string {
  let normalized: string;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new Error("Invalid GitHub installation id.");
    }
    normalized = String(value);
  } else if (typeof value === "bigint") {
    normalized = value.toString(10);
  } else {
    normalized = value;
  }

  if (!/^[1-9][0-9]*$/.test(normalized)) {
    throw new Error("Invalid GitHub installation id.");
  }

  const numeric = BigInt(normalized);
  if (numeric > MAX_SIGNED_64_BIT) {
    throw new Error("Invalid GitHub installation id.");
  }
  return normalized;
}

export function installationReferenceDigest(
  installationId: InstallationId,
  encodedMasterKey: string,
): string {
  const masterKey = decodeMasterKey(encodedMasterKey);
  const lookupKey = deriveKey(masterKey, "lookup");
  return createHmac("sha256", lookupKey)
    .update(normalizeInstallationId(installationId), "utf8")
    .digest("hex");
}

export function encryptInstallationReference({
  installationId,
  workspaceId,
  encodedMasterKey,
}: ReferenceInput): string {
  const masterKey = decodeMasterKey(encodedMasterKey);
  const encryptionKey = deriveKey(masterKey, "encryption");
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey, nonce, {
    authTagLength: AUTH_TAG_BYTES,
  });
  cipher.setAAD(additionalData(workspaceId));

  const ciphertext = Buffer.concat([
    cipher.update(normalizeInstallationId(installationId), "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    ENVELOPE_VERSION,
    nonce.toString("base64url"),
    ciphertext.toString("base64url"),
    authTag.toString("base64url"),
  ].join(".");
}

export function decryptInstallationReference({
  encryptedReference,
  workspaceId,
  encodedMasterKey,
}: DecryptInput): string {
  try {
    const parts = encryptedReference.split(".");
    if (parts.length !== 4 || parts[0] !== ENVELOPE_VERSION) {
      throw new Error("Invalid envelope.");
    }

    const masterKey = decodeMasterKey(encodedMasterKey);
    const encryptionKey = deriveKey(masterKey, "encryption");
    const nonce = decodeBase64Url(parts[1], NONCE_BYTES);
    const ciphertext = decodeBase64Url(parts[2]);
    const authTag = decodeBase64Url(parts[3], AUTH_TAG_BYTES);
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey, nonce, {
      authTagLength: AUTH_TAG_BYTES,
    });
    decipher.setAAD(additionalData(workspaceId));
    decipher.setAuthTag(authTag);

    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
    return normalizeInstallationId(plaintext);
  } catch {
    throw new Error("Invalid installation reference.");
  }
}
