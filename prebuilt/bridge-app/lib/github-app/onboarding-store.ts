import { createServiceClient } from "../db/supabase";
import { GitHubAppError } from "./errors";
import type {
  GitHubInstallationState,
  GitHubInstallationStatePhase,
  GitHubOnboardingStore,
} from "./onboarding";

interface RpcError {
  code?: string;
  message?: string;
}

interface RpcResult {
  data: unknown;
  error: RpcError | null;
}

export interface GitHubOnboardingRpcClient {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): Promise<RpcResult>;
}

type Row = Record<string, unknown>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const REFERENCE_CIPHERTEXT_PATTERN =
  /^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{1,128}\.[A-Za-z0-9_-]{22}$/;

function row(value: unknown): Row | null {
  if (Array.isArray(value)) {
    return value.length === 1 ? row(value[0]) : null;
  }
  return value !== null && typeof value === "object"
    ? (value as Row)
    : null;
}

function parseState(value: unknown): GitHubInstallationState {
  const data = row(value);
  const phase =
    data?.phase === "setup" || data?.phase === "oauth"
      ? data.phase
      : null;
  const installationReferenceCiphertext =
    data?.installation_reference_ciphertext === null
      ? null
      : typeof data?.installation_reference_ciphertext === "string" &&
          REFERENCE_CIPHERTEXT_PATTERN.test(
            data.installation_reference_ciphertext,
          )
        ? data.installation_reference_ciphertext
        : undefined;
  const installationReferenceDigest =
    data?.installation_reference_digest === null
      ? null
      : typeof data?.installation_reference_digest === "string" &&
          DIGEST_PATTERN.test(data.installation_reference_digest)
        ? data.installation_reference_digest
        : undefined;
  const expiresAt =
    typeof data?.expires_at === "string" ? data.expires_at : "";
  if (
    !data ||
    typeof data.workspace_id !== "string" ||
    !UUID_PATTERN.test(data.workspace_id) ||
    typeof data.user_id !== "string" ||
    !UUID_PATTERN.test(data.user_id) ||
    !phase ||
    !Number.isFinite(Date.parse(expiresAt)) ||
    (phase === "setup" &&
      (installationReferenceCiphertext !== null ||
        installationReferenceDigest !== null)) ||
    (phase === "oauth" &&
      (installationReferenceCiphertext === undefined ||
        installationReferenceCiphertext === null ||
        installationReferenceDigest === undefined ||
        installationReferenceDigest === null))
  ) {
    throw new GitHubAppError("ONBOARDING_UNAVAILABLE");
  }
  return {
    workspaceId: data.workspace_id,
    userId: data.user_id,
    phase,
    installationReferenceCiphertext:
      installationReferenceCiphertext ?? null,
    installationReferenceDigest: installationReferenceDigest ?? null,
    expiresAt,
  };
}

function byteaDigest(digest: string): string {
  if (!DIGEST_PATTERN.test(digest)) {
    throw new GitHubAppError("ONBOARDING_REQUEST_INVALID");
  }
  return `\\x${digest}`;
}

function validPhase(value: string): value is GitHubInstallationStatePhase {
  return value === "setup" || value === "oauth";
}

export function createSupabaseGitHubOnboardingStore(
  providedClient?: GitHubOnboardingRpcClient,
): GitHubOnboardingStore {
  const client =
    providedClient ??
    (createServiceClient() as unknown as GitHubOnboardingRpcClient);

  async function rpc(
    name: string,
    args: Record<string, unknown>,
    stateClaim = false,
  ): Promise<unknown> {
    let result: RpcResult;
    try {
      result = await client.rpc(name, args);
    } catch {
      throw new GitHubAppError("ONBOARDING_UNAVAILABLE");
    }
    if (result.error) {
      if (stateClaim && result.error.code === "P0002") {
        throw new GitHubAppError("ONBOARDING_STATE_INVALID");
      }
      if (result.error.code === "42501") {
        throw new GitHubAppError("INSTALLATION_ACCESS_FORBIDDEN");
      }
      throw new GitHubAppError("ONBOARDING_UNAVAILABLE");
    }
    return result.data;
  }

  return {
    async createState(input) {
      if (
        !validPhase(input.phase) ||
        (input.phase === "setup" &&
          (input.installationReferenceCiphertext !== null ||
            input.installationReferenceDigest !== null)) ||
        (input.phase === "oauth" &&
          (!input.installationReferenceCiphertext ||
            !REFERENCE_CIPHERTEXT_PATTERN.test(
              input.installationReferenceCiphertext,
            ) ||
            !input.installationReferenceDigest ||
            !DIGEST_PATTERN.test(input.installationReferenceDigest)))
      ) {
        throw new GitHubAppError("ONBOARDING_REQUEST_INVALID");
      }
      return parseState(
        await rpc("service_create_github_installation_state", {
          p_workspace_id: input.workspaceId,
          p_user_id: input.userId,
          p_state_digest: byteaDigest(input.stateDigest),
          p_phase: input.phase,
          p_installation_reference_ciphertext:
            input.installationReferenceCiphertext,
          p_installation_reference_digest:
            input.installationReferenceDigest,
        }),
      );
    },

    async claimState(input) {
      if (!validPhase(input.expectedPhase)) {
        throw new GitHubAppError("ONBOARDING_REQUEST_INVALID");
      }
      const claimed = parseState(
        await rpc(
          "service_claim_github_installation_state",
          {
            p_state_digest: byteaDigest(input.stateDigest),
            p_expected_phase: input.expectedPhase,
          },
          true,
        ),
      );
      if (claimed.phase !== input.expectedPhase) {
        throw new GitHubAppError("ONBOARDING_STATE_INVALID");
      }
      return claimed;
    },

    async completeOnboarding({
      workspaceId,
      userId,
      installationReferenceCiphertext,
      installationReferenceDigest,
      installation,
    }) {
      if (
        !REFERENCE_CIPHERTEXT_PATTERN.test(
          installationReferenceCiphertext,
        ) ||
        !DIGEST_PATTERN.test(installationReferenceDigest)
      ) {
        throw new GitHubAppError("ONBOARDING_REQUEST_INVALID");
      }
      const saved = row(
        await rpc("service_complete_github_app_onboarding", {
          p_workspace_id: workspaceId,
          p_user_id: userId,
          p_installation_reference_ciphertext:
            installationReferenceCiphertext,
          p_installation_reference_digest:
            installationReferenceDigest,
          p_account_id: installation.accountId,
          p_account_login: installation.accountLogin,
          p_account_type: installation.accountType,
          p_repository_selection: installation.repositorySelection,
          p_installed_at: installation.installedAt,
          p_permissions: installation.permissions,
          p_events: installation.events,
          p_repositories: installation.repositories.map((repository) => ({
            id: repository.id,
            owner: repository.owner,
            name: repository.name,
            defaultBranch: repository.defaultBranch,
          })),
        }),
      );
      if (
        !saved ||
        typeof saved.id !== "string" ||
        !UUID_PATTERN.test(saved.id)
      ) {
        throw new GitHubAppError("ONBOARDING_UNAVAILABLE");
      }
      return { id: saved.id };
    },
  };
}
