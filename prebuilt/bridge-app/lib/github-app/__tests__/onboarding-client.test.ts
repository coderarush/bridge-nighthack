import assert from "node:assert/strict";
import test from "node:test";
import { GitHubAppError, githubAppErrorResponse } from "../errors";
import { createGitHubOnboardingGateway } from "../onboarding-client";

const requiredPermissions = {
  actions: "read",
  checks: "read",
  contents: "write",
  metadata: "read",
  pull_requests: "write",
};
const installationId = 4815162342;
const now = new Date("2026-07-24T03:00:00.000Z");
const userToken = "ghu_user-token-that-must-remain-transient";
const installationToken = "ghs_installation-token-transient-only";
const verificationInput = {
  code: "github-code",
  codeVerifier: "v".repeat(43),
  redirectUri: "https://bridge.example/api/github/callback",
  installationId,
};

type FetchCall = {
  url: string;
  init?: RequestInit;
};

function response(value: unknown, status = 200): Response {
  return Response.json(value, { status });
}

function installation(overrides: Record<string, unknown> = {}) {
  return {
    id: installationId,
    account: { id: 101, login: "acme", type: "Organization" },
    repository_selection: "selected",
    permissions: requiredPermissions,
    events: ["installation", "installation_repositories"],
    created_at: "2026-07-24T02:00:00.000Z",
    ...overrides,
  };
}

function repository(id = 201) {
  return {
    id,
    name: `repo-${id}`,
    full_name: `acme/repo-${id}`,
    private: true,
    owner: { login: "acme" },
    default_branch: "main",
  };
}

function successFetch(calls: FetchCall[]): typeof fetch {
  return (async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url === "https://github.com/login/oauth/access_token") {
      return response({ access_token: userToken, token_type: "bearer" });
    }
    if (url.includes("/user/installations")) {
      return response({
        total_count: 1,
        installations: [{ id: installationId }],
      });
    }
    if (url.endsWith(`/app/installations/${installationId}`)) {
      return response(installation());
    }
    if (url.endsWith(`/app/installations/${installationId}/access_tokens`)) {
      return response({
        token: installationToken,
        expires_at: "2026-07-24T03:30:00.000Z",
      });
    }
    if (url.includes("/installation/repositories")) {
      return response({ total_count: 1, repositories: [repository()] });
    }
    return response({ message: "not found" }, 404);
  }) as typeof fetch;
}

function gateway(fetchImpl: typeof fetch) {
  return createGitHubOnboardingGateway({
    clientId: "client-id",
    clientSecret: "client-secret-value",
    appId: "12345",
    privateKey: "unused-in-test",
    fetchImpl,
    issueAppJwt: () => "app-jwt-token-that-is-long-enough",
    now: () => now,
  });
}

test("accepts the multiline PEM format used by GitHub App private keys", () => {
  assert.doesNotThrow(() =>
    createGitHubOnboardingGateway({
      clientId: "client-id",
      clientSecret: "client-secret-value",
      appId: "12345",
      privateKey: [
        "-----BEGIN RSA PRIVATE KEY-----",
        "test-private-key-material",
        "-----END RSA PRIVATE KEY-----",
      ].join("\n"),
      fetchImpl: successFetch([]),
      issueAppJwt: () => "app-jwt-token-that-is-long-enough",
      now: () => now,
    }),
  );
});

test("verifies the exact bound installation and returns only validated metadata", async () => {
  const calls: FetchCall[] = [];
  const result = await gateway(successFetch(calls)).verifyAndLoadInstallation(
    verificationInput,
  );

  assert.equal(result.installationId, installationId);
  assert.equal(result.repositorySelection, "selected");
  assert.deepEqual(result.repositories.map((repo) => repo.id), [201]);
  assert.doesNotMatch(
    JSON.stringify(result),
    /ghu_|ghs_|client-secret|access[_-]?token/i,
  );
  assert.equal(calls.length, 5);
  const oauthBody = new URLSearchParams(String(calls[0].init?.body));
  assert.equal(oauthBody.get("code_verifier"), verificationInput.codeVerifier);
  assert.equal(oauthBody.get("redirect_uri"), verificationInput.redirectUri);
  for (const call of calls) {
    const headers = new Headers(call.init?.headers);
    assert.equal(headers.get("x-github-api-version"), "2026-03-10");
  }
});

test("rejects a spoofed setup installation id before app authentication", async () => {
  const calls: FetchCall[] = [];
  const fetchImpl = (async (
    input: URL | RequestInfo,
    init?: RequestInit,
  ) => {
    const url = String(input);
    calls.push({ url, init });
    if (url === "https://github.com/login/oauth/access_token") {
      return response({ access_token: userToken });
    }
    return response({
      total_count: 1,
      installations: [{ id: installationId + 1 }],
    });
  }) as typeof fetch;

  await assert.rejects(
    () =>
      gateway(fetchImpl).verifyAndLoadInstallation(verificationInput),
    (error: unknown) =>
      error instanceof GitHubAppError &&
      error.code === "INSTALLATION_CLAIM_MISMATCH",
  );
  assert.equal(calls.length, 2);
});

test("bounds user-installation pagination", async () => {
  let pages = 0;
  const fetchImpl = (async (input: URL | RequestInfo) => {
    const url = String(input);
    if (url === "https://github.com/login/oauth/access_token") {
      return response({ access_token: userToken });
    }
    pages += 1;
    return response({
      total_count: 5000,
      installations: Array.from({ length: 100 }, (_, index) => ({
        id: pages * 1000 + index,
      })),
    });
  }) as typeof fetch;

  await assert.rejects(
    () =>
      gateway(fetchImpl).verifyAndLoadInstallation(verificationInput),
    (error: unknown) =>
      error instanceof GitHubAppError &&
      error.code === "ONBOARDING_PAGINATION_LIMIT",
  );
  assert.equal(pages, 10);
});

test("rejects all-repository scope and insufficient permissions", async () => {
  for (const details of [
    installation({ repository_selection: "all" }),
    installation({
      permissions: { ...requiredPermissions, contents: "read" },
    }),
  ]) {
    const calls: FetchCall[] = [];
    const base = successFetch(calls);
    const fetchImpl = (async (
      input: URL | RequestInfo,
      init?: RequestInit,
    ) => {
      const url = String(input);
      if (url.endsWith(`/app/installations/${installationId}`)) {
        calls.push({ url, init });
        return response(details);
      }
      return base(input, init);
    }) as typeof fetch;

    await assert.rejects(
      () =>
        gateway(fetchImpl).verifyAndLoadInstallation(verificationInput),
      (error: unknown) =>
        error instanceof GitHubAppError &&
        [
          "INSTALLATION_REPOSITORY_SCOPE_FORBIDDEN",
          "INSTALLATION_PERMISSIONS_INSUFFICIENT",
        ].includes(error.code),
    );
  }
});

test("sanitizes GitHub timeouts and upstream error bodies", async () => {
  for (const fetchImpl of [
    ((_: URL | RequestInfo, init?: RequestInit) =>
      new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(
            new Error(
              "timeout client-secret-value ghu_user-token internal.github",
            ),
          );
        });
      })) as typeof fetch,
    (async () =>
      response(
        {
          error: "bad_verification_code",
          client_secret: "client-secret-value",
          internal_host: "github.internal",
        },
        500,
      )) as typeof fetch,
  ]) {
    const client = createGitHubOnboardingGateway({
      clientId: "client-id",
      clientSecret: "client-secret-value",
      appId: "12345",
      privateKey: "unused-in-test",
      fetchImpl,
      issueAppJwt: () => "app-jwt-token-that-is-long-enough",
      now: () => now,
      timeoutMs: 5,
    });

    let caught: unknown;
    try {
      await client.verifyAndLoadInstallation(verificationInput);
    } catch (error) {
      caught = error;
    }
    assert.ok(caught instanceof GitHubAppError);
    const safeResponse = githubAppErrorResponse(caught);
    assert.equal(safeResponse.status, 503);
    assert.doesNotMatch(
      JSON.stringify(await safeResponse.json()),
      /client-secret|ghu_|internal\.github|github\.internal/i,
    );
  }
});
