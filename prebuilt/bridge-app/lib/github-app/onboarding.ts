import {
  createHash,
  createHmac,
  randomBytes as secureRandomBytes,
} from "node:crypto";
import {
  authErrorResponse,
  type VerifiedSupabaseUser,
} from "../auth/session";
import {
  GitHubAppError,
  githubAppErrorResponse,
} from "./errors";
import {
  decryptInstallationReference,
  encryptInstallationReference,
  installationReferenceDigest,
} from "./installation-reference";
import type {
  GitHubOnboardingGateway,
  VerifiedGitHubInstallation,
} from "./onboarding-client";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const APP_SLUG_PATTERN =
  /^[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?$/;
const STATE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const CODE_PATTERN = /^[A-Za-z0-9._~-]{1,512}$/;
const REFERENCE_CIPHERTEXT_PATTERN =
  /^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{1,128}\.[A-Za-z0-9_-]{22}$/;
const REFERENCE_DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const MAX_INSTALL_BODY_BYTES = 4096;

export type GitHubInstallationStatePhase = "setup" | "oauth";

export interface GitHubInstallationState {
  workspaceId: string;
  userId: string;
  phase: GitHubInstallationStatePhase;
  installationReferenceCiphertext: string | null;
  installationReferenceDigest: string | null;
  expiresAt: string;
}

export interface CreateGitHubInstallationStateInput {
  workspaceId: string;
  userId: string;
  stateDigest: string;
  phase: GitHubInstallationStatePhase;
  installationReferenceCiphertext: string | null;
  installationReferenceDigest: string | null;
}

export interface ClaimGitHubInstallationStateInput {
  stateDigest: string;
  expectedPhase: GitHubInstallationStatePhase;
}

export interface GitHubOnboardingStore {
  createState(
    input: Readonly<CreateGitHubInstallationStateInput>,
  ): Promise<GitHubInstallationState>;
  claimState(
    input: Readonly<ClaimGitHubInstallationStateInput>,
  ): Promise<GitHubInstallationState>;
  completeOnboarding(input: {
    workspaceId: string;
    userId: string;
    installationReferenceCiphertext: string;
    installationReferenceDigest: string;
    installation: Omit<VerifiedGitHubInstallation, "installationId">;
  }): Promise<{ id: string }>;
}

interface GitHubInstallPostDependencies {
  authenticateHuman(request: Request): Promise<VerifiedSupabaseUser>;
  appSlug: string;
  store: GitHubOnboardingStore;
  randomBytes?: (size: number) => Buffer;
}

interface GitHubSetupGetDependencies {
  clientId: string;
  clientSecret: string;
  installationReferenceKey: string;
  store: GitHubOnboardingStore;
  randomBytes?: (size: number) => Buffer;
}

interface GitHubCallbackGetDependencies {
  clientSecret: string;
  installationReferenceKey: string;
  store: GitHubOnboardingStore;
  gateway: GitHubOnboardingGateway;
}

export type { VerifiedGitHubInstallation } from "./onboarding-client";

function onboardingErrorResponse(error: unknown): Response {
  const authResponse = authErrorResponse(error);
  if (authResponse) return authResponse;
  if (error instanceof GitHubAppError) {
    return githubAppErrorResponse(error);
  }
  return Response.json(
    {
      code: "INTERNAL_ERROR",
      error: "The request could not be completed.",
      retryable: false,
    },
    { status: 500 },
  );
}

function rawState(randomBytes: (size: number) => Buffer): string {
  const bytes = randomBytes(32);
  if (!Buffer.isBuffer(bytes) || bytes.length !== 32) {
    throw new GitHubAppError("ONBOARDING_UNAVAILABLE");
  }
  return bytes.toString("base64url");
}

function stateDigest(state: string): string {
  if (!STATE_PATTERN.test(state)) {
    throw new GitHubAppError("ONBOARDING_REQUEST_INVALID");
  }
  const decoded = Buffer.from(state, "base64url");
  if (
    decoded.length !== 32 ||
    decoded.toString("base64url") !== state
  ) {
    throw new GitHubAppError("ONBOARDING_REQUEST_INVALID");
  }
  return createHash("sha256").update(decoded).digest("hex");
}

function positiveId(value: string | null): number | null {
  if (!value || !/^[1-9][0-9]{0,15}$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function callbackUri(request: Request): string {
  const url = new URL(request.url);
  url.search = "";
  url.hash = "";
  url.pathname = "/api/github/callback";
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password
  ) {
    throw new GitHubAppError("ONBOARDING_REQUEST_INVALID");
  }
  return url.toString();
}

function pkceVerifier(state: string, clientSecret: string): string {
  if (
    clientSecret.length < 16 ||
    clientSecret.length > 500 ||
    /\s/.test(clientSecret)
  ) {
    throw new GitHubAppError("ONBOARDING_UNAVAILABLE");
  }
  return createHmac("sha256", clientSecret)
    .update(`bridge:github-app:pkce:v1:${state}`, "ascii")
    .digest("base64url");
}

function pkceChallenge(verifier: string): string {
  return createHash("sha256")
    .update(verifier, "ascii")
    .digest("base64url");
}

function assertStateBoundary(
  record: GitHubInstallationState,
  expected: {
    workspaceId?: string;
    userId?: string;
    phase: GitHubInstallationStatePhase;
    installationReferenceCiphertext?: string | null;
    installationReferenceDigest?: string | null;
  },
): void {
  const expiresAt = Date.parse(record.expiresAt);
  const validReferenceShape =
    record.phase === "setup"
      ? record.installationReferenceCiphertext === null &&
        record.installationReferenceDigest === null
      : typeof record.installationReferenceCiphertext === "string" &&
        REFERENCE_CIPHERTEXT_PATTERN.test(
          record.installationReferenceCiphertext,
        ) &&
        typeof record.installationReferenceDigest === "string" &&
        REFERENCE_DIGEST_PATTERN.test(record.installationReferenceDigest);
  if (
    !UUID_PATTERN.test(record.workspaceId) ||
    !UUID_PATTERN.test(record.userId) ||
    record.phase !== expected.phase ||
    (expected.workspaceId !== undefined &&
      record.workspaceId !== expected.workspaceId) ||
    (expected.userId !== undefined && record.userId !== expected.userId) ||
    (expected.installationReferenceCiphertext !== undefined &&
      record.installationReferenceCiphertext !==
        expected.installationReferenceCiphertext) ||
    (expected.installationReferenceDigest !== undefined &&
      record.installationReferenceDigest !==
        expected.installationReferenceDigest) ||
    !validReferenceShape ||
    !Number.isFinite(expiresAt)
  ) {
    throw new GitHubAppError("ONBOARDING_UNAVAILABLE");
  }
}

async function readBoundedJsonBody(request: Request): Promise<unknown> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    if (!/^[0-9]+$/.test(declaredLength)) {
      throw new GitHubAppError("ONBOARDING_REQUEST_INVALID");
    }
    if (Number(declaredLength) > MAX_INSTALL_BODY_BYTES) {
      throw new GitHubAppError("ONBOARDING_BODY_TOO_LARGE");
    }
  }

  const reader = request.body?.getReader();
  if (!reader) {
    throw new GitHubAppError("ONBOARDING_REQUEST_INVALID");
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_INSTALL_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new GitHubAppError("ONBOARDING_BODY_TOO_LARGE");
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return JSON.parse(text) as unknown;
  } catch (error) {
    if (error instanceof GitHubAppError) throw error;
    throw new GitHubAppError("ONBOARDING_REQUEST_INVALID");
  } finally {
    reader.releaseLock();
  }
}

async function parseWorkspaceId(request: Request): Promise<string> {
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  ) {
    throw new GitHubAppError("ONBOARDING_REQUEST_INVALID");
  }
  const body = await readBoundedJsonBody(request);
  const keys =
    body !== null && typeof body === "object" && !Array.isArray(body)
      ? Object.keys(body)
      : [];
  const workspaceId =
    body !== null &&
    typeof body === "object" &&
    !Array.isArray(body) &&
    typeof (body as Record<string, unknown>).workspaceId === "string"
      ? (body as Record<string, string>).workspaceId
      : "";
  if (
    keys.length !== 1 ||
    keys[0] !== "workspaceId" ||
    !UUID_PATTERN.test(workspaceId)
  ) {
    throw new GitHubAppError("ONBOARDING_REQUEST_INVALID");
  }
  return workspaceId.toLowerCase();
}

export function createGitHubInstallPost({
  authenticateHuman,
  appSlug,
  store,
  randomBytes = secureRandomBytes,
}: GitHubInstallPostDependencies): (request: Request) => Promise<Response> {
  return async (request) => {
    try {
      const human = await authenticateHuman(request);
      if (human.isAnonymous || !UUID_PATTERN.test(human.id)) {
        throw new GitHubAppError("ONBOARDING_REQUEST_INVALID");
      }
      const workspaceId = await parseWorkspaceId(request);
      if (!APP_SLUG_PATTERN.test(appSlug)) {
        throw new GitHubAppError("ONBOARDING_UNAVAILABLE");
      }
      const state = rawState(randomBytes);
      const created = await store.createState({
        workspaceId,
        userId: human.id,
        stateDigest: stateDigest(state),
        phase: "setup",
        installationReferenceCiphertext: null,
        installationReferenceDigest: null,
      });
      assertStateBoundary(created, {
        workspaceId,
        userId: human.id,
        phase: "setup",
        installationReferenceCiphertext: null,
        installationReferenceDigest: null,
      });

      const installUrl = new URL(
        `/apps/${appSlug}/installations/new`,
        "https://github.com",
      );
      installUrl.searchParams.set("state", state);
      return Response.json(
        { installUrl: installUrl.toString() },
        {
          status: 201,
          headers: {
            "cache-control": "no-store",
            pragma: "no-cache",
          },
        },
      );
    } catch (error) {
      return onboardingErrorResponse(error);
    }
  };
}

export function createGitHubSetupGet({
  clientId,
  clientSecret,
  installationReferenceKey,
  store,
  randomBytes = secureRandomBytes,
}: GitHubSetupGetDependencies): (request: Request) => Promise<Response> {
  return async (request) => {
    try {
      if (!/^[A-Za-z0-9._-]{1,200}$/.test(clientId)) {
        throw new GitHubAppError("ONBOARDING_UNAVAILABLE");
      }
      const requestUrl = new URL(request.url);
      const state = requestUrl.searchParams.get("state") ?? "";
      const installationId = positiveId(
        requestUrl.searchParams.get("installation_id"),
      );
      if (!installationId) {
        throw new GitHubAppError("ONBOARDING_REQUEST_INVALID");
      }
      const claimed = await store.claimState({
        stateDigest: stateDigest(state),
        expectedPhase: "setup",
      });
      assertStateBoundary(claimed, {
        phase: "setup",
        installationReferenceCiphertext: null,
        installationReferenceDigest: null,
      });

      let encryptedReference: string;
      let referenceDigest: string;
      try {
        encryptedReference = encryptInstallationReference({
          installationId,
          workspaceId: claimed.workspaceId,
          encodedMasterKey: installationReferenceKey,
        });
        referenceDigest = installationReferenceDigest(
          installationId,
          installationReferenceKey,
        );
      } catch {
        throw new GitHubAppError("ONBOARDING_UNAVAILABLE");
      }
      const oauthState = rawState(randomBytes);
      const created = await store.createState({
        workspaceId: claimed.workspaceId,
        userId: claimed.userId,
        stateDigest: stateDigest(oauthState),
        phase: "oauth",
        installationReferenceCiphertext: encryptedReference,
        installationReferenceDigest: referenceDigest,
      });
      assertStateBoundary(created, {
        workspaceId: claimed.workspaceId,
        userId: claimed.userId,
        phase: "oauth",
        installationReferenceCiphertext: encryptedReference,
        installationReferenceDigest: referenceDigest,
      });

      const verifier = pkceVerifier(oauthState, clientSecret);
      const authorizeUrl = new URL(
        "/login/oauth/authorize",
        "https://github.com",
      );
      authorizeUrl.searchParams.set("client_id", clientId);
      authorizeUrl.searchParams.set("state", oauthState);
      authorizeUrl.searchParams.set("redirect_uri", callbackUri(request));
      authorizeUrl.searchParams.set(
        "code_challenge",
        pkceChallenge(verifier),
      );
      authorizeUrl.searchParams.set("code_challenge_method", "S256");
      return Response.redirect(authorizeUrl, 302);
    } catch (error) {
      return onboardingErrorResponse(error);
    }
  };
}

export function createGitHubCallbackGet({
  clientSecret,
  installationReferenceKey,
  store,
  gateway,
}: GitHubCallbackGetDependencies): (request: Request) => Promise<Response> {
  return async (request) => {
    try {
      const requestUrl = new URL(request.url);
      const state = requestUrl.searchParams.get("state") ?? "";
      const digest = stateDigest(state);
      const code = requestUrl.searchParams.get("code");
      if (!code || !CODE_PATTERN.test(code)) {
        throw new GitHubAppError("ONBOARDING_REQUEST_INVALID");
      }
      const claimed = await store.claimState({
        stateDigest: digest,
        expectedPhase: "oauth",
      });
      assertStateBoundary(claimed, { phase: "oauth" });
      if (
        !claimed.installationReferenceCiphertext ||
        !claimed.installationReferenceDigest
      ) {
        throw new GitHubAppError("ONBOARDING_STATE_INVALID");
      }
      let boundInstallationId: number | null;
      try {
        boundInstallationId = positiveId(
          decryptInstallationReference({
            encryptedReference:
              claimed.installationReferenceCiphertext,
            workspaceId: claimed.workspaceId,
            encodedMasterKey: installationReferenceKey,
          }),
        );
      } catch {
        throw new GitHubAppError("ONBOARDING_STATE_INVALID");
      }
      if (!boundInstallationId) {
        throw new GitHubAppError("ONBOARDING_STATE_INVALID");
      }
      const installation = await gateway.verifyAndLoadInstallation({
        code,
        codeVerifier: pkceVerifier(state, clientSecret),
        redirectUri: callbackUri(request),
        installationId: boundInstallationId,
      });
      if (installation.installationId !== boundInstallationId) {
        throw new GitHubAppError("INSTALLATION_CLAIM_MISMATCH");
      }

      let durableReference: string;
      let durableDigest: string;
      try {
        durableReference = encryptInstallationReference({
          installationId: installation.installationId,
          workspaceId: claimed.workspaceId,
          encodedMasterKey: installationReferenceKey,
        });
        durableDigest = installationReferenceDigest(
          installation.installationId,
          installationReferenceKey,
        );
      } catch {
        throw new GitHubAppError("ONBOARDING_UNAVAILABLE");
      }
      if (durableDigest !== claimed.installationReferenceDigest) {
        throw new GitHubAppError("INSTALLATION_CLAIM_MISMATCH");
      }
      const installationMetadata: Omit<
        VerifiedGitHubInstallation,
        "installationId"
      > = {
        accountId: installation.accountId,
        accountLogin: installation.accountLogin,
        accountType: installation.accountType,
        repositorySelection: installation.repositorySelection,
        installedAt: installation.installedAt,
        permissions: installation.permissions,
        events: installation.events,
        repositories: installation.repositories,
      };
      const savedInstallation = await store.completeOnboarding({
        workspaceId: claimed.workspaceId,
        userId: claimed.userId,
        installationReferenceCiphertext: durableReference,
        installationReferenceDigest: durableDigest,
        installation: installationMetadata,
      });
      if (!UUID_PATTERN.test(savedInstallation.id)) {
        throw new GitHubAppError("ONBOARDING_UNAVAILABLE");
      }

      return Response.redirect(
        new URL("/team?github=connected", request.url),
        302,
      );
    } catch (error) {
      return onboardingErrorResponse(error);
    }
  };
}
