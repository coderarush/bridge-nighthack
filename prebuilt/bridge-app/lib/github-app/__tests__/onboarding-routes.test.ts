import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import type { VerifiedSupabaseUser } from "../../auth/session";
import {
  decryptInstallationReference,
  installationReferenceDigest,
} from "../installation-reference";
import {
  createGitHubCallbackGet,
  createGitHubInstallPost,
  createGitHubSetupGet,
  type GitHubInstallationState,
  type GitHubOnboardingStore,
  type VerifiedGitHubInstallation,
} from "../onboarding";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const installationRecordId = "33333333-3333-4333-8333-333333333333";
const installationId = 4815162342;
const installationReferenceKey =
  "BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=";

function human(): Promise<VerifiedSupabaseUser> {
  return Promise.resolve({ id: userId, isAnonymous: false });
}

function installRequest(): Request {
  return new Request("https://bridge.example/api/github/install", {
    method: "POST",
    headers: {
      authorization: "Bearer verified-token",
      "content-type": "application/json",
    },
    body: JSON.stringify({ workspaceId }),
  });
}

function verifiedInstallation(): VerifiedGitHubInstallation {
  return {
    installationId,
    accountId: 101,
    accountLogin: "acme",
    accountType: "Organization",
    repositorySelection: "selected",
    installedAt: "2026-07-24T03:00:00.000Z",
    permissions: {
      actions: "read",
      checks: "read",
      contents: "write",
      metadata: "read",
      pull_requests: "write",
    },
    events: ["installation", "installation_repositories"],
    repositories: [
      {
        id: 201,
        owner: "acme",
        name: "payments",
        fullName: "acme/payments",
        private: true,
        defaultBranch: "main",
      },
      {
        id: 202,
        owner: "acme",
        name: "checkout",
        fullName: "acme/checkout",
        private: false,
        defaultBranch: "trunk",
      },
    ],
  };
}

function state(
  phase: "setup" | "oauth",
  installationReferenceCiphertext: string | null,
  installationReferenceDigestValue: string | null,
): GitHubInstallationState {
  return {
    workspaceId,
    userId,
    phase,
    installationReferenceCiphertext,
    installationReferenceDigest: installationReferenceDigestValue,
    expiresAt: "2026-07-24T03:10:00.000Z",
  };
}

function emptyStore(
  overrides: Partial<GitHubOnboardingStore> = {},
): GitHubOnboardingStore {
  return {
    createState: async (input) =>
      state(
        input.phase,
        input.installationReferenceCiphertext,
        input.installationReferenceDigest,
      ),
    claimState: async (input) =>
      state(input.expectedPhase, null, null),
    completeOnboarding: async () => ({ id: installationRecordId }),
    ...overrides,
  };
}

test("install POST creates random setup states and persists only their digests", async () => {
  const stored: Array<{
    stateDigest: string;
    phase: string;
    installationReferenceCiphertext: string | null;
    installationReferenceDigest: string | null;
  }> = [];
  const post = createGitHubInstallPost({
    authenticateHuman: human,
    appSlug: "bridge-control-plane",
    store: emptyStore({
      createState: async (input) => {
        stored.push(input);
        return state(
          input.phase,
          input.installationReferenceCiphertext,
          input.installationReferenceDigest,
        );
      },
    }),
  });

  const first = await post(installRequest());
  const second = await post(installRequest());
  const firstUrl = new URL((await first.json()).installUrl);
  const secondUrl = new URL((await second.json()).installUrl);
  const firstState = firstUrl.searchParams.get("state");
  const secondState = secondUrl.searchParams.get("state");

  assert.equal(first.status, 201);
  assert.equal(second.status, 201);
  assert.equal(firstUrl.origin, "https://github.com");
  assert.equal(
    firstUrl.pathname,
    "/apps/bridge-control-plane/installations/new",
  );
  assert.match(firstState ?? "", /^[A-Za-z0-9_-]{43}$/);
  assert.match(secondState ?? "", /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(firstState, secondState);
  assert.equal(stored.length, 2);
  for (const pending of stored) {
    assert.match(pending.stateDigest, /^[0-9a-f]{64}$/);
    assert.equal(pending.phase, "setup");
    assert.equal(pending.installationReferenceCiphertext, null);
    assert.equal(pending.installationReferenceDigest, null);
    assert.notEqual(pending.stateDigest, firstState);
    assert.notEqual(pending.stateDigest, secondState);
  }
});

test("install POST authenticates before creating state and rejects invalid input", async () => {
  let persisted = false;
  const post = createGitHubInstallPost({
    authenticateHuman: async () => {
      throw new Error("auth failed");
    },
    appSlug: "bridge-control-plane",
    store: emptyStore({
      createState: async () => {
        persisted = true;
        throw new Error("must not run");
      },
    }),
  });

  const unauthorized = await post(installRequest());
  assert.equal(unauthorized.status, 500);
  assert.equal(persisted, false);

  const invalidPost = createGitHubInstallPost({
    authenticateHuman: human,
    appSlug: "bridge-control-plane",
    store: emptyStore(),
  });
  const invalid = await invalidPost(
    new Request("https://bridge.example/api/github/install", {
      method: "POST",
      headers: {
        authorization: "Bearer verified-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({ workspaceId: "../other-tenant" }),
    }),
  );
  assert.equal(invalid.status, 400);
});

test("install POST caps the raw body at 4KB and rejects unknown fields", async () => {
  let persisted = false;
  const post = createGitHubInstallPost({
    authenticateHuman: human,
    appSlug: "bridge-control-plane",
    store: emptyStore({
      createState: async (input) => {
        persisted = true;
        return state(
          input.phase,
          input.installationReferenceCiphertext,
          input.installationReferenceDigest,
        );
      },
    }),
  });

  const unknownField = await post(
    new Request("https://bridge.example/api/github/install", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspaceId, role: "owner" }),
    }),
  );
  assert.equal(unknownField.status, 400);
  assert.equal(persisted, false);

  const oversized = await post(
    new Request("https://bridge.example/api/github/install", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        workspaceId,
        padding: "x".repeat(4096),
      }),
    }),
  );
  assert.equal(oversized.status, 413);
  assert.equal(persisted, false);
});

test("two-phase callback binds the setup installation and proves it with PKCE", async () => {
  const setupState = Buffer.alloc(32, 7).toString("base64url");
  const stateRows = new Map<string, GitHubInstallationState>();
  const calls: Array<{ name: string; input: unknown }> = [];
  let oauthStateDigest = "";
  let oauthChallenge = "";

  const store = emptyStore({
    claimState: async (input) => {
      calls.push({ name: "claimState", input });
      if (input.expectedPhase === "setup") {
        return state("setup", null, null);
      }
      const claimed = stateRows.get(input.stateDigest);
      assert.ok(claimed);
      return claimed;
    },
    createState: async (input) => {
      calls.push({ name: "createState", input });
      oauthStateDigest = input.stateDigest;
      const created = state(
        input.phase,
        input.installationReferenceCiphertext,
        input.installationReferenceDigest,
      );
      stateRows.set(input.stateDigest, created);
      return created;
    },
    completeOnboarding: async (input) => {
      calls.push({ name: "completeOnboarding", input });
      return { id: installationRecordId };
    },
  });
  const setup = createGitHubSetupGet({
    clientId: "github-client-id",
    clientSecret: "server-only-github-client-secret",
    installationReferenceKey,
    store,
  });
  const callback = createGitHubCallbackGet({
    clientSecret: "server-only-github-client-secret",
    installationReferenceKey,
    store,
    gateway: {
      verifyAndLoadInstallation: async (input) => {
        calls.push({ name: "verifyGitHub", input });
        assert.equal(input.installationId, installationId);
        assert.equal(input.redirectUri, "https://bridge.example/api/github/callback");
        assert.equal(
          createHash("sha256")
            .update(input.codeVerifier, "ascii")
            .digest("base64url"),
          oauthChallenge,
        );
        return verifiedInstallation();
      },
    },
  });

  const setupResponse = await setup(
    new Request(
      `https://bridge.example/api/github/setup?state=${setupState}&installation_id=${installationId}&setup_action=install`,
    ),
  );
  assert.equal(setupResponse.status, 302);
  const authorizeUrl = new URL(setupResponse.headers.get("location") ?? "");
  const oauthState = authorizeUrl.searchParams.get("state");
  oauthChallenge = authorizeUrl.searchParams.get("code_challenge") ?? "";
  assert.equal(authorizeUrl.origin, "https://github.com");
  assert.equal(authorizeUrl.pathname, "/login/oauth/authorize");
  assert.equal(authorizeUrl.searchParams.get("client_id"), "github-client-id");
  assert.equal(authorizeUrl.searchParams.get("code_challenge_method"), "S256");
  assert.match(oauthState ?? "", /^[A-Za-z0-9_-]{43}$/);
  assert.match(oauthChallenge, /^[A-Za-z0-9_-]{43}$/);
  assert.match(oauthStateDigest, /^[0-9a-f]{64}$/);
  const oauthRow = stateRows.get(oauthStateDigest);
  assert.ok(oauthRow?.installationReferenceCiphertext);
  assert.equal(
    decryptInstallationReference({
      encryptedReference: oauthRow.installationReferenceCiphertext,
      workspaceId,
      encodedMasterKey: installationReferenceKey,
    }),
    String(installationId),
  );
  assert.equal(
    oauthRow.installationReferenceDigest,
    installationReferenceDigest(installationId, installationReferenceKey),
  );

  const oauthResponse = await callback(
    new Request(
      `https://bridge.example/api/github/callback?state=${oauthState}&code=github-code`,
    ),
  );

  assert.equal(oauthResponse.status, 302);
  assert.equal(
    oauthResponse.headers.get("location"),
    "https://bridge.example/team?github=connected",
  );
  assert.deepEqual(
    calls.map((call) => call.name),
    [
      "claimState",
      "createState",
      "claimState",
      "verifyGitHub",
      "completeOnboarding",
    ],
  );
  const completion = calls.at(-1)?.input as {
    installationReferenceCiphertext: string;
    installationReferenceDigest: string;
    installation: Record<string, unknown>;
  };
  assert.equal(
    decryptInstallationReference({
      encryptedReference: completion.installationReferenceCiphertext,
      workspaceId,
      encodedMasterKey: installationReferenceKey,
    }),
    String(installationId),
  );
  assert.equal(
    completion.installationReferenceDigest,
    installationReferenceDigest(installationId, installationReferenceKey),
  );
  assert.equal("installationId" in completion.installation, false);
  assert.doesNotMatch(JSON.stringify(calls), /ghu_|ghs_|access[_-]?token/i);
});

test("callback rejects malformed state before GitHub or persistence work", async () => {
  let claimed = false;
  let calledGitHub = false;
  const callback = createGitHubCallbackGet({
    clientSecret: "server-only-github-client-secret",
    installationReferenceKey,
    store: emptyStore({
      claimState: async () => {
        claimed = true;
        return state("oauth", "invalid", "ab".repeat(32));
      },
    }),
    gateway: {
      verifyAndLoadInstallation: async () => {
        calledGitHub = true;
        return verifiedInstallation();
      },
    },
  });

  const response = await callback(
    new Request(
      "https://bridge.example/api/github/callback?state=short&code=github-code",
    ),
  );

  assert.equal(response.status, 400);
  assert.equal(claimed, false);
  assert.equal(calledGitHub, false);
});
