import assert from "node:assert/strict";
import {
  generateKeyPairSync,
  verify as verifySignature,
} from "node:crypto";
import test from "node:test";
import { GitHubAppError } from "../errors";
import {
  createGitHubAppJwt,
  GitHubAppTokenBroker,
  type AppJwtIssuer,
  type GitHubInstallationTokenExchange,
} from "../tokens";

const now = new Date("2026-07-24T04:00:00.000Z");

function decodeBase64UrlJson(value: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Record<
    string,
    unknown
  >;
}

test("creates a short-lived RS256 GitHub App JWT with backdated issuance", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const credential = createGitHubAppJwt({
    appId: 123456,
    privateKey,
    now,
  });

  const [headerPart, payloadPart, signaturePart] = credential.token.split(".");
  assert.deepEqual(decodeBase64UrlJson(headerPart), {
    alg: "RS256",
    typ: "JWT",
  });
  assert.deepEqual(decodeBase64UrlJson(payloadPart), {
    iat: Math.floor(now.getTime() / 1000) - 60,
    exp: Math.floor(now.getTime() / 1000) + 540,
    iss: "123456",
  });
  assert.equal(
    verifySignature(
      "RSA-SHA256",
      Buffer.from(`${headerPart}.${payloadPart}`),
      publicKey,
      Buffer.from(signaturePart, "base64url"),
    ),
    true,
  );
  assert.equal(credential.expiresAt, "2026-07-24T04:09:00.000Z");
});

test("acquires a fresh installation token for every operation", async () => {
  let jwtCalls = 0;
  let exchangeCalls = 0;
  const jwtIssuer: AppJwtIssuer = {
    issueAppJwt: async () => {
      jwtCalls += 1;
      return {
        token: `jwt-${jwtCalls}-not-a-real-credential`,
        expiresAt: "2026-07-24T04:09:00.000Z",
      };
    },
  };
  const tokenExchange: GitHubInstallationTokenExchange = {
    exchangeInstallationToken: async (input) => {
      exchangeCalls += 1;
      assert.equal(input.installationId, 12345);
      assert.deepEqual(input.repositoryIds, [9, 10]);
      return {
        token: `installation-${exchangeCalls}-not-a-real-credential`,
        expiresAt: "2026-07-24T04:59:00.000Z",
      };
    },
  };
  const broker = new GitHubAppTokenBroker({
    jwtIssuer,
    tokenExchange,
    now: () => now,
  });

  const observed: string[] = [];
  for (let operation = 0; operation < 2; operation += 1) {
    await broker.withInstallationToken(
      {
        installationId: 12345,
        repositoryIds: [10, 9, 10],
      },
      async (credential) => {
        observed.push(credential.token);
      },
    );
  }

  assert.equal(jwtCalls, 2);
  assert.equal(exchangeCalls, 2);
  assert.deepEqual(observed, [
    "installation-1-not-a-real-credential",
    "installation-2-not-a-real-credential",
  ]);
});

test("rejects overlong app and installation credentials", async () => {
  const overlongJwt: AppJwtIssuer = {
    issueAppJwt: async () => ({
      token: "jwt-not-a-real-credential",
      expiresAt: "2026-07-24T04:10:01.000Z",
    }),
  };
  const exchange: GitHubInstallationTokenExchange = {
    exchangeInstallationToken: async () => ({
      token: "installation-not-a-real-credential",
      expiresAt: "2026-07-24T05:00:01.000Z",
    }),
  };

  const appBroker = new GitHubAppTokenBroker({
    jwtIssuer: overlongJwt,
    tokenExchange: exchange,
    now: () => now,
  });
  await assert.rejects(
    () =>
      appBroker.withInstallationToken(
        { installationId: 12345, repositoryIds: [9] },
        async () => {},
      ),
    (error: unknown) => {
      assert.ok(error instanceof GitHubAppError);
      assert.equal(error.code, "APP_JWT_INVALID");
      return true;
    },
  );

  const validJwt: AppJwtIssuer = {
    issueAppJwt: async () => ({
      token: "jwt-not-a-real-credential",
      expiresAt: "2026-07-24T04:09:00.000Z",
    }),
  };
  const installationBroker = new GitHubAppTokenBroker({
    jwtIssuer: validJwt,
    tokenExchange: exchange,
    now: () => now,
  });
  await assert.rejects(
    () =>
      installationBroker.withInstallationToken(
        { installationId: 12345, repositoryIds: [9] },
        async () => {},
      ),
    (error: unknown) => {
      assert.ok(error instanceof GitHubAppError);
      assert.equal(error.code, "INSTALLATION_TOKEN_INVALID");
      return true;
    },
  );
});

test("rejects invalid token scopes before requesting credentials", async () => {
  let called = false;
  const broker = new GitHubAppTokenBroker({
    jwtIssuer: {
      issueAppJwt: async () => {
        called = true;
        return {
          token: "jwt-not-a-real-credential",
          expiresAt: "2026-07-24T04:09:00.000Z",
        };
      },
    },
    tokenExchange: {
      exchangeInstallationToken: async () => ({
        token: "installation-not-a-real-credential",
        expiresAt: "2026-07-24T04:59:00.000Z",
      }),
    },
    now: () => now,
  });

  await assert.rejects(
    () =>
      broker.withInstallationToken(
        { installationId: -1, repositoryIds: [] },
        async () => {},
      ),
    (error: unknown) => {
      assert.ok(error instanceof GitHubAppError);
      assert.equal(error.code, "INSTALLATION_TOKEN_SCOPE_INVALID");
      return true;
    },
  );
  assert.equal(called, false);
});

test("sanitizes token exchange failures", async () => {
  const broker = new GitHubAppTokenBroker({
    jwtIssuer: {
      issueAppJwt: async () => ({
        token: "jwt-super-secret-credential",
        expiresAt: "2026-07-24T04:09:00.000Z",
      }),
    },
    tokenExchange: {
      exchangeInstallationToken: async () => {
        throw new Error("upstream leaked jwt-super-secret-credential");
      },
    },
    now: () => now,
  });

  await assert.rejects(
    () =>
      broker.withInstallationToken(
        { installationId: 12345, repositoryIds: [9] },
        async () => {},
      ),
    (error: unknown) => {
      assert.ok(error instanceof GitHubAppError);
      assert.equal(error.code, "INSTALLATION_TOKEN_EXCHANGE_FAILED");
      assert.equal(error.retryable, true);
      assert.doesNotMatch(
        error.message,
        /jwt-super-secret-credential|upstream leaked/,
      );
      return true;
    },
  );
});
