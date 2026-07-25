import {
  sign,
  type KeyLike,
} from "node:crypto";
import { GitHubAppError } from "./errors";

export interface EphemeralGitHubCredential {
  token: string;
  expiresAt: string;
}

export interface AppJwtIssuer {
  issueAppJwt(): Promise<EphemeralGitHubCredential>;
}

export interface InstallationTokenScope {
  installationId: number;
  repositoryIds: readonly number[];
}

export interface InstallationTokenExchangeInput {
  appJwt: string;
  installationId: number;
  repositoryIds: readonly number[];
}

export interface GitHubInstallationTokenExchange {
  exchangeInstallationToken(
    input: Readonly<InstallationTokenExchangeInput>,
  ): Promise<EphemeralGitHubCredential>;
}

export interface GitHubAppTokenBrokerDependencies {
  jwtIssuer: AppJwtIssuer;
  tokenExchange: GitHubInstallationTokenExchange;
  now?: () => Date;
}

export interface CreateGitHubAppJwtInput {
  appId: number | string;
  privateKey: KeyLike;
  now?: Date;
}

function encodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function validAppId(value: number | string): string | null {
  const normalized = String(value);
  return /^[1-9][0-9]{0,19}$/.test(normalized) ? normalized : null;
}

export function createGitHubAppJwt(
  input: CreateGitHubAppJwtInput,
): EphemeralGitHubCredential {
  const appId = validAppId(input.appId);
  const now = input.now ?? new Date();
  if (!appId || !Number.isFinite(now.getTime())) {
    throw new GitHubAppError("APP_JWT_INVALID");
  }

  const nowSeconds = Math.floor(now.getTime() / 1000);
  const header = encodeJson({ alg: "RS256", typ: "JWT" });
  const payload = encodeJson({
    iat: nowSeconds - 60,
    exp: nowSeconds + 540,
    iss: appId,
  });
  const unsigned = `${header}.${payload}`;

  try {
    const signature = sign(
      "RSA-SHA256",
      Buffer.from(unsigned, "utf8"),
      input.privateKey,
    ).toString("base64url");
    return {
      token: `${unsigned}.${signature}`,
      expiresAt: new Date((nowSeconds + 540) * 1000).toISOString(),
    };
  } catch {
    throw new GitHubAppError("APP_JWT_INVALID");
  }
}

function validCredential(
  credential: EphemeralGitHubCredential,
  now: Date,
  maximumLifetimeMs: number,
): boolean {
  if (
    !credential ||
    typeof credential.token !== "string" ||
    credential.token.length < 20 ||
    credential.token.length > 8192 ||
    typeof credential.expiresAt !== "string"
  ) {
    return false;
  }
  const expiresAt = Date.parse(credential.expiresAt);
  const nowMs = now.getTime();
  return (
    Number.isFinite(expiresAt) &&
    expiresAt >= nowMs + 30_000 &&
    expiresAt <= nowMs + maximumLifetimeMs
  );
}

function canonicalScope(scope: InstallationTokenScope): {
  installationId: number;
  repositoryIds: number[];
} {
  if (
    !Number.isSafeInteger(scope.installationId) ||
    scope.installationId <= 0 ||
    !Array.isArray(scope.repositoryIds) ||
    scope.repositoryIds.length < 1 ||
    scope.repositoryIds.length > 500 ||
    scope.repositoryIds.some(
      (repositoryId) =>
        !Number.isSafeInteger(repositoryId) || repositoryId <= 0,
    )
  ) {
    throw new GitHubAppError("INSTALLATION_TOKEN_SCOPE_INVALID");
  }
  return {
    installationId: scope.installationId,
    repositoryIds: [...new Set(scope.repositoryIds)].sort(
      (left, right) => left - right,
    ),
  };
}

export class GitHubAppTokenBroker {
  private readonly now: () => Date;

  constructor(
    private readonly dependencies: GitHubAppTokenBrokerDependencies,
  ) {
    this.now = dependencies.now ?? (() => new Date());
  }

  async withInstallationToken<Result>(
    requestedScope: InstallationTokenScope,
    operation: (
      credential: Readonly<EphemeralGitHubCredential>,
    ) => Promise<Result>,
  ): Promise<Result> {
    const scope = canonicalScope(requestedScope);
    const issuedAt = this.now();
    if (!Number.isFinite(issuedAt.getTime())) {
      throw new GitHubAppError("APP_JWT_INVALID");
    }

    let appJwt: EphemeralGitHubCredential;
    try {
      appJwt = await this.dependencies.jwtIssuer.issueAppJwt();
    } catch {
      throw new GitHubAppError("APP_JWT_INVALID");
    }
    if (!validCredential(appJwt, issuedAt, 10 * 60_000)) {
      throw new GitHubAppError("APP_JWT_INVALID");
    }

    let installationCredential: EphemeralGitHubCredential;
    try {
      installationCredential =
        await this.dependencies.tokenExchange.exchangeInstallationToken({
          appJwt: appJwt.token,
          installationId: scope.installationId,
          repositoryIds: scope.repositoryIds,
        });
    } catch {
      throw new GitHubAppError("INSTALLATION_TOKEN_EXCHANGE_FAILED");
    }

    const exchangedAt = this.now();
    if (
      !Number.isFinite(exchangedAt.getTime()) ||
      !validCredential(installationCredential, exchangedAt, 60 * 60_000)
    ) {
      throw new GitHubAppError("INSTALLATION_TOKEN_INVALID");
    }

    return operation(Object.freeze({ ...installationCredential }));
  }
}
