import {
  createHash,
  createHmac,
  timingSafeEqual,
} from "node:crypto";
import { GitHubAppError } from "./errors";
import type {
  GitHubPermissionLevel,
  GitHubRepository,
  GitHubRepositorySelection,
} from "./policy";

export interface GitHubWebhookHeaders {
  event?: string;
  delivery?: string;
  signature?: string;
}

export interface GitHubAccount {
  id: number;
  login: string;
  type: "Organization" | "User";
}

export interface GitHubSender {
  id: number;
  login: string;
}

interface InstallationInstalledEvent {
  kind: "installed";
  installationId: number;
  account: GitHubAccount;
  repositorySelection: GitHubRepositorySelection;
  permissions: Record<string, GitHubPermissionLevel>;
  repositories: GitHubRepository[];
  occurredAt: string;
  sender: GitHubSender;
}

interface InstallationRevokedEvent {
  kind: "revoked";
  installationId: number;
  account: GitHubAccount;
  occurredAt: string;
  sender: GitHubSender;
}

interface InstallationStateEvent {
  kind: "suspended" | "resumed" | "permissions_changed";
  installationId: number;
  account: GitHubAccount;
  occurredAt: string;
  sender: GitHubSender;
}

interface InstallationRepositoriesEvent {
  kind: "repositories_changed";
  installationId: number;
  repositorySelection: GitHubRepositorySelection;
  added: GitHubRepository[];
  removed: GitHubRepository[];
  occurredAt: string;
  sender: GitHubSender;
}

export type NormalizedGitHubAppEvent =
  | InstallationInstalledEvent
  | InstallationRevokedEvent
  | InstallationStateEvent
  | InstallationRepositoriesEvent;

export interface VerifiedGitHubWebhook {
  deliveryId: string;
  eventName: "installation" | "installation_repositories";
  payloadDigest: string;
  event: NormalizedGitHubAppEvent;
}

export interface ParseGitHubWebhookInput {
  rawBody: Uint8Array;
  headers: GitHubWebhookHeaders;
  secret: string;
  maxBodyBytes?: number;
}

type UnknownRecord = Record<string, unknown>;

const deliveryPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function record(value: unknown): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new GitHubAppError("WEBHOOK_PAYLOAD_INVALID");
  }
  return value as UnknownRecord;
}

function positiveId(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value <= 0
  ) {
    throw new GitHubAppError("WEBHOOK_PAYLOAD_INVALID");
  }
  return value;
}

function text(value: unknown, maximum = 200): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > maximum ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new GitHubAppError("WEBHOOK_PAYLOAD_INVALID");
  }
  return value;
}

function timestamp(value: unknown): string {
  const milliseconds =
    typeof value === "number" && Number.isFinite(value)
      ? value * 1000
      : typeof value === "string"
        ? Date.parse(value)
        : Number.NaN;
  if (!Number.isFinite(milliseconds)) {
    throw new GitHubAppError("WEBHOOK_PAYLOAD_INVALID");
  }
  return new Date(milliseconds).toISOString();
}

function account(value: unknown): GitHubAccount {
  const item = record(value);
  if (item.type !== "Organization" && item.type !== "User") {
    throw new GitHubAppError("WEBHOOK_PAYLOAD_INVALID");
  }
  return {
    id: positiveId(item.id),
    login: text(item.login, 100),
    type: item.type,
  };
}

function sender(value: unknown): GitHubSender {
  const item = record(value);
  return {
    id: positiveId(item.id),
    login: text(item.login, 100),
  };
}

function selection(value: unknown): GitHubRepositorySelection {
  if (value !== "selected" && value !== "all") {
    throw new GitHubAppError("WEBHOOK_PAYLOAD_INVALID");
  }
  return value;
}

function permissions(
  value: unknown,
): Record<string, GitHubPermissionLevel> {
  const source = record(value);
  const result: Record<string, GitHubPermissionLevel> = {};
  for (const [name, level] of Object.entries(source).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    if (
      !/^[a-z][a-z0-9_]{0,79}$/.test(name) ||
      (level !== "read" && level !== "write" && level !== "admin")
    ) {
      throw new GitHubAppError("WEBHOOK_PAYLOAD_INVALID");
    }
    result[name] = level;
  }
  return result;
}

function repository(value: unknown): GitHubRepository {
  const item = record(value);
  const name = text(item.name, 100);
  const fullName = text(item.full_name, 201);
  if (
    typeof item.private !== "boolean" ||
    fullName.indexOf("/") <= 0 ||
    fullName.indexOf("/") !== fullName.lastIndexOf("/") ||
    !fullName.endsWith(`/${name}`)
  ) {
    throw new GitHubAppError("WEBHOOK_PAYLOAD_INVALID");
  }
  return {
    id: positiveId(item.id),
    name,
    fullName,
    private: item.private,
  };
}

function repositories(value: unknown, required: boolean): GitHubRepository[] {
  if (value === undefined && !required) return [];
  if (!Array.isArray(value) || value.length > 10_000) {
    throw new GitHubAppError("WEBHOOK_PAYLOAD_INVALID");
  }
  return value.map(repository);
}

function occurrence(installation: UnknownRecord): string {
  return timestamp(installation.updated_at ?? installation.created_at);
}

function normalizeInstallation(payload: UnknownRecord): NormalizedGitHubAppEvent {
  const installation = record(payload.installation);
  const base = {
    installationId: positiveId(installation.id),
    account: account(installation.account),
    occurredAt: occurrence(installation),
    sender: sender(payload.sender),
  };

  switch (payload.action) {
    case "created":
      return {
        kind: "installed",
        ...base,
        repositorySelection: selection(installation.repository_selection),
        permissions: permissions(installation.permissions),
        repositories: repositories(payload.repositories, true),
      };
    case "deleted":
      return { kind: "revoked", ...base };
    case "suspend":
      return { kind: "suspended", ...base };
    case "unsuspend":
      return { kind: "resumed", ...base };
    case "new_permissions_accepted":
      return { kind: "permissions_changed", ...base };
    default:
      throw new GitHubAppError("WEBHOOK_EVENT_UNSUPPORTED");
  }
}

function normalizeRepositories(
  payload: UnknownRecord,
): NormalizedGitHubAppEvent {
  if (payload.action !== "added" && payload.action !== "removed") {
    throw new GitHubAppError("WEBHOOK_EVENT_UNSUPPORTED");
  }
  const installation = record(payload.installation);
  return {
    kind: "repositories_changed",
    installationId: positiveId(installation.id),
    repositorySelection: selection(installation.repository_selection),
    added: repositories(payload.repositories_added, true),
    removed: repositories(payload.repositories_removed, true),
    occurredAt: occurrence(installation),
    sender: sender(payload.sender),
  };
}

function verifiedHeaders(headers: GitHubWebhookHeaders): {
  eventName: "installation" | "installation_repositories";
  deliveryId: string;
  signature: Buffer;
} {
  if (
    (headers.event !== "installation" &&
      headers.event !== "installation_repositories") ||
    typeof headers.delivery !== "string" ||
    !deliveryPattern.test(headers.delivery)
  ) {
    throw new GitHubAppError("WEBHOOK_HEADERS_INVALID");
  }
  const match = headers.signature?.match(/^sha256=([0-9a-f]{64})$/i);
  if (!match) {
    throw new GitHubAppError("WEBHOOK_SIGNATURE_INVALID");
  }
  return {
    eventName: headers.event,
    deliveryId: headers.delivery.toLowerCase(),
    signature: Buffer.from(match[1], "hex"),
  };
}

export function parseAndVerifyGitHubWebhook(
  input: ParseGitHubWebhookInput,
): VerifiedGitHubWebhook {
  if (
    typeof input.secret !== "string" ||
    Buffer.byteLength(input.secret, "utf8") < 32 ||
    Buffer.byteLength(input.secret, "utf8") > 1024
  ) {
    throw new GitHubAppError("WEBHOOK_CONFIGURATION_INVALID");
  }
  const maximum = input.maxBodyBytes ?? 2_000_000;
  if (
    !Number.isSafeInteger(maximum) ||
    maximum < 1 ||
    maximum > 10_000_000 ||
    input.rawBody.byteLength < 1 ||
    input.rawBody.byteLength > maximum
  ) {
    throw new GitHubAppError("WEBHOOK_BODY_INVALID");
  }
  const headers = verifiedHeaders(input.headers);
  const expected = createHmac("sha256", input.secret)
    .update(input.rawBody)
    .digest();
  if (
    headers.signature.byteLength !== expected.byteLength ||
    !timingSafeEqual(headers.signature, expected)
  ) {
    throw new GitHubAppError("WEBHOOK_SIGNATURE_INVALID");
  }

  let payload: UnknownRecord;
  try {
    payload = record(
      JSON.parse(Buffer.from(input.rawBody).toString("utf8")) as unknown,
    );
  } catch (error) {
    if (error instanceof GitHubAppError) throw error;
    throw new GitHubAppError("WEBHOOK_PAYLOAD_INVALID");
  }

  return {
    deliveryId: headers.deliveryId,
    eventName: headers.eventName,
    payloadDigest: createHash("sha256").update(input.rawBody).digest("hex"),
    event:
      headers.eventName === "installation"
        ? normalizeInstallation(payload)
        : normalizeRepositories(payload),
  };
}
