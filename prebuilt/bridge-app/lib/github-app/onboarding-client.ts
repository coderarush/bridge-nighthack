import { GitHubAppError } from "./errors";
import {
  bridgeGitHubAppPermissions,
  validateInstallationPolicy,
  type GitHubPermissionLevel,
} from "./policy";
import { createGitHubAppJwt } from "./tokens";

const API_VERSION = "2026-03-10";
const API_ROOT = "https://api.github.com";
const OAUTH_TOKEN_URL = "https://github.com/login/oauth/access_token";
const PAGE_SIZE = 100;
const MAX_USER_INSTALLATION_PAGES = 10;
const MAX_REPOSITORY_PAGES = 5;
const MAX_REPOSITORIES = PAGE_SIZE * MAX_REPOSITORY_PAGES;

export interface VerifiedGitHubRepository {
  id: number;
  owner: string;
  name: string;
  fullName: string;
  private: boolean;
  defaultBranch: string;
}

export interface VerifiedGitHubInstallation {
  installationId: number;
  accountId: number;
  accountLogin: string;
  accountType: "Organization" | "User";
  repositorySelection: "selected";
  installedAt: string;
  permissions: Record<string, GitHubPermissionLevel>;
  events: string[];
  repositories: VerifiedGitHubRepository[];
}

export interface VerifyGitHubInstallationInput {
  code: string;
  codeVerifier: string;
  redirectUri: string;
  installationId: number;
}

export interface GitHubOnboardingGateway {
  verifyAndLoadInstallation(
    input: Readonly<VerifyGitHubInstallationInput>,
  ): Promise<VerifiedGitHubInstallation>;
}

export interface GitHubOnboardingGatewayOptions {
  clientId: string;
  clientSecret: string;
  appId: string;
  privateKey: string;
  fetchImpl?: typeof fetch;
  issueAppJwt?: () => string;
  now?: () => Date;
  timeoutMs?: number;
}

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function positiveId(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0
    ? value
    : null;
}

function safeString(
  value: unknown,
  maximumLength: number,
  pattern?: RegExp,
): string | null {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > maximumLength ||
    /[\u0000-\u001f\u007f]/.test(value) ||
    (pattern && !pattern.test(value))
  ) {
    return null;
  }
  return value;
}

function transientToken(value: unknown): string {
  const token = safeString(value, 8192, /^[^\s]+$/);
  if (!token || token.length < 20) {
    throw new GitHubAppError("ONBOARDING_UNAVAILABLE");
  }
  return token;
}

function validInput(input: VerifyGitHubInstallationInput): boolean {
  const redirect: URL | null = (() => {
    try {
      return new URL(input.redirectUri);
    } catch {
      return null;
    }
  })();
  return Boolean(
    safeString(input.code, 512, /^[A-Za-z0-9._~-]+$/) &&
      safeString(input.codeVerifier, 128, /^[A-Za-z0-9._~-]{43,128}$/) &&
      redirect &&
      redirect.protocol === "https:" &&
      !redirect.username &&
      !redirect.password &&
      !redirect.search &&
      !redirect.hash &&
      positiveId(input.installationId),
  );
}

function requiredConfiguration(
  options: GitHubOnboardingGatewayOptions,
): void {
  const privateKeyValid =
    typeof options.privateKey === "string" &&
    options.privateKey.length >= 1 &&
    options.privateKey.length <= 32_000 &&
    !/[\u0000\u007f]/.test(options.privateKey);
  if (
    !safeString(options.clientId, 200, /^[A-Za-z0-9._-]+$/) ||
    !safeString(options.clientSecret, 500, /^[^\s]+$/) ||
    !safeString(options.appId, 20, /^[1-9][0-9]*$/) ||
    !privateKeyValid
  ) {
    throw new GitHubAppError("ONBOARDING_UNAVAILABLE");
  }
  const timeout = options.timeoutMs ?? 10_000;
  if (!Number.isFinite(timeout) || timeout < 1 || timeout > 10_000) {
    throw new GitHubAppError("ONBOARDING_UNAVAILABLE");
  }
}

function apiHeaders(token?: string): Headers {
  const headers = new Headers({
    accept: "application/vnd.github+json",
    "user-agent": "Bridge-GitHub-App/1.0",
    "x-github-api-version": API_VERSION,
  });
  if (token) headers.set("authorization", `Bearer ${token}`);
  return headers;
}

function parsePermissions(value: unknown): Record<string, string> {
  const permissions = object(value);
  if (!permissions) {
    throw new GitHubAppError("INSTALLATION_PERMISSIONS_INSUFFICIENT");
  }
  const parsed: Record<string, string> = {};
  for (const [name, level] of Object.entries(permissions)) {
    if (typeof level !== "string") {
      throw new GitHubAppError("INSTALLATION_PERMISSIONS_INSUFFICIENT");
    }
    parsed[name] = level;
  }
  return parsed;
}

function parseEvents(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    value.length > 100 ||
    value.some(
      (event) =>
        !safeString(event, 100, /^[a-z][a-z0-9_]*$/),
    )
  ) {
    throw new GitHubAppError("ONBOARDING_UNAVAILABLE");
  }
  return [...new Set(value as string[])].sort();
}

function parseInstallation(
  value: unknown,
  expectedInstallationId: number,
): {
  installationId: number;
  accountId: number;
  accountLogin: string;
  accountType: "Organization" | "User";
  repositorySelection: "selected";
  installedAt: string;
  permissions: Record<string, string>;
  events: string[];
} {
  const data = object(value);
  const account = object(data?.account);
  const installationId = positiveId(data?.id);
  const accountId = positiveId(account?.id);
  const accountLogin = safeString(
    account?.login,
    100,
    /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,98}[A-Za-z0-9])?$/,
  );
  const accountType =
    account?.type === "Organization" || account?.type === "User"
      ? account.type
      : null;
  const createdAt =
    typeof data?.created_at === "string" ? Date.parse(data.created_at) : NaN;

  if (
    installationId !== expectedInstallationId ||
    !accountId ||
    !accountLogin ||
    !accountType ||
    !Number.isFinite(createdAt)
  ) {
    throw new GitHubAppError("ONBOARDING_UNAVAILABLE");
  }
  if (data?.repository_selection === "all") {
    throw new GitHubAppError("INSTALLATION_REPOSITORY_SCOPE_FORBIDDEN");
  }
  if (data?.repository_selection !== "selected") {
    throw new GitHubAppError("INSTALLATION_REPOSITORIES_INVALID");
  }

  return {
    installationId,
    accountId,
    accountLogin,
    accountType,
    repositorySelection: "selected",
    installedAt: new Date(createdAt).toISOString(),
    permissions: parsePermissions(data.permissions),
    events: parseEvents(data.events),
  };
}

function parseRepository(value: unknown): VerifiedGitHubRepository {
  const data = object(value);
  const ownerData = object(data?.owner);
  const id = positiveId(data?.id);
  const owner = safeString(
    ownerData?.login,
    100,
    /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,98}[A-Za-z0-9])?$/,
  );
  const name = safeString(data?.name, 100, /^[^/\s\u0000-\u001f\u007f]+$/);
  const fullName = safeString(data?.full_name, 201);
  const defaultBranch = safeString(data?.default_branch, 255);
  if (
    !id ||
    !owner ||
    !name ||
    fullName !== `${owner}/${name}` ||
    typeof data?.private !== "boolean" ||
    !defaultBranch
  ) {
    throw new GitHubAppError("INSTALLATION_REPOSITORIES_INVALID");
  }
  return {
    id,
    owner,
    name,
    fullName,
    private: data.private,
    defaultBranch,
  };
}

export function createGitHubOnboardingGateway(
  options: GitHubOnboardingGatewayOptions,
): GitHubOnboardingGateway {
  requiredConfiguration(options);
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 10_000;
  const now = options.now ?? (() => new Date());

  async function fetchJson(
    url: string,
    init: RequestInit,
  ): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, {
        ...init,
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new GitHubAppError("ONBOARDING_UNAVAILABLE");
      }
      return await response.json();
    } catch (error) {
      if (error instanceof GitHubAppError) throw error;
      throw new GitHubAppError("ONBOARDING_UNAVAILABLE");
    } finally {
      clearTimeout(timeout);
    }
  }

  async function exchangeUserCode(
    input: VerifyGitHubInstallationInput,
  ): Promise<string> {
    const body = new URLSearchParams({
      client_id: options.clientId,
      client_secret: options.clientSecret,
      code: input.code,
      code_verifier: input.codeVerifier,
      redirect_uri: input.redirectUri,
    });
    const headers = apiHeaders();
    headers.set("content-type", "application/x-www-form-urlencoded");
    const data = object(
      await fetchJson(OAUTH_TOKEN_URL, {
        method: "POST",
        headers,
        body: body.toString(),
      }),
    );
    return transientToken(data?.access_token);
  }

  async function proveUserInstallation(
    userToken: string,
    expectedInstallationId: number,
  ): Promise<void> {
    for (let page = 1; page <= MAX_USER_INSTALLATION_PAGES; page += 1) {
      const data = object(
        await fetchJson(
          `${API_ROOT}/user/installations?per_page=${PAGE_SIZE}&page=${page}`,
          { method: "GET", headers: apiHeaders(userToken) },
        ),
      );
      const installations = data?.installations;
      const totalCount = data?.total_count;
      if (
        !Array.isArray(installations) ||
        typeof totalCount !== "number" ||
        !Number.isSafeInteger(totalCount) ||
        totalCount < 0 ||
        installations.length > PAGE_SIZE
      ) {
        throw new GitHubAppError("ONBOARDING_UNAVAILABLE");
      }
      if (
        installations.some(
          (installation) =>
            positiveId(object(installation)?.id) === expectedInstallationId,
        )
      ) {
        return;
      }
      const exhausted =
        installations.length < PAGE_SIZE || page * PAGE_SIZE >= totalCount;
      if (exhausted) {
        throw new GitHubAppError("INSTALLATION_CLAIM_MISMATCH");
      }
    }
    throw new GitHubAppError("ONBOARDING_PAGINATION_LIMIT");
  }

  function appJwt(): string {
    try {
      if (options.issueAppJwt) return transientToken(options.issueAppJwt());
      return createGitHubAppJwt({
        appId: options.appId,
        privateKey: options.privateKey.replace(/\\n/g, "\n"),
        now: now(),
      }).token;
    } catch {
      throw new GitHubAppError("ONBOARDING_UNAVAILABLE");
    }
  }

  async function getInstallation(
    jwt: string,
    expectedInstallationId: number,
  ) {
    return parseInstallation(
      await fetchJson(
        `${API_ROOT}/app/installations/${expectedInstallationId}`,
        { method: "GET", headers: apiHeaders(jwt) },
      ),
      expectedInstallationId,
    );
  }

  async function exchangeInstallationToken(
    jwt: string,
    installationId: number,
  ): Promise<string> {
    const headers = apiHeaders(jwt);
    headers.set("content-type", "application/json");
    const data = object(
      await fetchJson(
        `${API_ROOT}/app/installations/${installationId}/access_tokens`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ permissions: bridgeGitHubAppPermissions }),
        },
      ),
    );
    const token = transientToken(data?.token);
    const expiresAt =
      typeof data?.expires_at === "string" ? Date.parse(data.expires_at) : NaN;
    const nowMs = now().getTime();
    if (
      !Number.isFinite(nowMs) ||
      !Number.isFinite(expiresAt) ||
      expiresAt < nowMs + 30_000 ||
      expiresAt > nowMs + 60 * 60_000
    ) {
      throw new GitHubAppError("ONBOARDING_UNAVAILABLE");
    }
    return token;
  }

  async function listRepositories(
    token: string,
  ): Promise<VerifiedGitHubRepository[]> {
    const repositories: VerifiedGitHubRepository[] = [];
    for (let page = 1; page <= MAX_REPOSITORY_PAGES; page += 1) {
      const data = object(
        await fetchJson(
          `${API_ROOT}/installation/repositories?per_page=${PAGE_SIZE}&page=${page}`,
          { method: "GET", headers: apiHeaders(token) },
        ),
      );
      const pageRepositories = data?.repositories;
      const totalCount = data?.total_count;
      if (
        !Array.isArray(pageRepositories) ||
        typeof totalCount !== "number" ||
        !Number.isSafeInteger(totalCount) ||
        totalCount < 0 ||
        totalCount > MAX_REPOSITORIES ||
        pageRepositories.length > PAGE_SIZE
      ) {
        throw new GitHubAppError("ONBOARDING_PAGINATION_LIMIT");
      }
      repositories.push(...pageRepositories.map(parseRepository));
      if (
        pageRepositories.length < PAGE_SIZE ||
        repositories.length >= totalCount
      ) {
        return repositories;
      }
    }
    throw new GitHubAppError("ONBOARDING_PAGINATION_LIMIT");
  }

  return {
    async verifyAndLoadInstallation(input) {
      if (!validInput(input)) {
        throw new GitHubAppError("ONBOARDING_REQUEST_INVALID");
      }

      const userToken = await exchangeUserCode(input);
      await proveUserInstallation(userToken, input.installationId);
      const jwt = appJwt();
      const installation = await getInstallation(jwt, input.installationId);
      const installationToken = await exchangeInstallationToken(
        jwt,
        input.installationId,
      );
      const repositories = await listRepositories(installationToken);
      const validated = validateInstallationPolicy({
        permissions: installation.permissions,
        repositorySelection: installation.repositorySelection,
        repositories,
      });
      const repositoryById = new Map(
        repositories.map((repository) => [repository.id, repository]),
      );

      return {
        ...installation,
        permissions: validated.permissions,
        repositories: validated.repositories.map((repository) => {
          const source = repositoryById.get(repository.id);
          if (!source) {
            throw new GitHubAppError("INSTALLATION_REPOSITORIES_INVALID");
          }
          return { ...source };
        }),
      };
    },
  };
}
