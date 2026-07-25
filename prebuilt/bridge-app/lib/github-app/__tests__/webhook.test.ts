import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import {
  parseAndVerifyGitHubWebhook,
  type GitHubWebhookHeaders,
} from "../webhook";
import { GitHubAppError } from "../errors";

const secret = "a-secure-webhook-secret-with-at-least-32-bytes";

function signedHeaders(
  body: string,
  event = "installation",
  delivery = "9df12df0-3f3e-4f46-b629-72703b7f45e8",
): GitHubWebhookHeaders {
  return {
    event,
    delivery,
    signature: `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`,
  };
}

function installedPayload() {
  return {
    action: "created",
    installation: {
      id: 4815162342,
      account: {
        id: 101,
        login: "acme",
        type: "Organization",
      },
      repository_selection: "selected",
      permissions: {
        actions: "read",
        checks: "read",
        contents: "write",
        metadata: "read",
        pull_requests: "write",
      },
      created_at: "2026-07-24T03:00:00Z",
    },
    repositories: [
      {
        id: 202,
        name: "payments",
        full_name: "acme/payments",
        private: true,
      },
    ],
    sender: {
      id: 303,
      login: "octocat",
    },
  };
}

async function expectGitHubError(
  operation: () => unknown | Promise<unknown>,
  code: GitHubAppError["code"],
) {
  await assert.rejects(async () => operation(), (error: unknown) => {
    assert.ok(error instanceof GitHubAppError);
    assert.equal(error.code, code);
    return true;
  });
}

test("verifies the raw body and normalizes an installation event", () => {
  const body = JSON.stringify(installedPayload());
  const result = parseAndVerifyGitHubWebhook({
    rawBody: Buffer.from(body),
    headers: signedHeaders(body),
    secret,
  });

  assert.equal(result.deliveryId, "9df12df0-3f3e-4f46-b629-72703b7f45e8");
  assert.equal(result.eventName, "installation");
  assert.match(result.payloadDigest, /^[0-9a-f]{64}$/);
  assert.deepEqual(result.event, {
    kind: "installed",
    installationId: 4815162342,
    account: {
      id: 101,
      login: "acme",
      type: "Organization",
    },
    repositorySelection: "selected",
    permissions: {
      actions: "read",
      checks: "read",
      contents: "write",
      metadata: "read",
      pull_requests: "write",
    },
    repositories: [
      {
        id: 202,
        name: "payments",
        fullName: "acme/payments",
        private: true,
      },
    ],
    occurredAt: "2026-07-24T03:00:00.000Z",
    sender: {
      id: 303,
      login: "octocat",
    },
  });
});

test("rejects a valid signature for a different raw body", async () => {
  const body = JSON.stringify(installedPayload());
  const changedBody = `${body} `;

  await expectGitHubError(
    () =>
      parseAndVerifyGitHubWebhook({
        rawBody: Buffer.from(changedBody),
        headers: signedHeaders(body),
        secret,
      }),
    "WEBHOOK_SIGNATURE_INVALID",
  );
});

test("rejects missing or malformed delivery identifiers", async () => {
  const body = JSON.stringify(installedPayload());
  const baseHeaders = signedHeaders(body);

  for (const delivery of [undefined, "", "../delivery", "not-a-guid"]) {
    await expectGitHubError(
      () =>
        parseAndVerifyGitHubWebhook({
          rawBody: Buffer.from(body),
          headers: { ...baseHeaders, delivery },
          secret,
        }),
      "WEBHOOK_HEADERS_INVALID",
    );
  }
});

test("normalizes deletion without trusting optional repository data", () => {
  const payload = installedPayload();
  payload.action = "deleted";
  delete (payload as { repositories?: unknown }).repositories;
  const body = JSON.stringify(payload);

  const result = parseAndVerifyGitHubWebhook({
    rawBody: Buffer.from(body),
    headers: signedHeaders(body),
    secret,
  });

  assert.deepEqual(result.event, {
    kind: "revoked",
    installationId: 4815162342,
    account: {
      id: 101,
      login: "acme",
      type: "Organization",
    },
    occurredAt: "2026-07-24T03:00:00.000Z",
    sender: {
      id: 303,
      login: "octocat",
    },
  });
});

test("normalizes repository selection changes", () => {
  const payload = {
    action: "added",
    installation: installedPayload().installation,
    repositories_added: [
      {
        id: 404,
        name: "checkout",
        full_name: "acme/checkout",
        private: false,
      },
    ],
    repositories_removed: [],
    sender: installedPayload().sender,
  };
  const body = JSON.stringify(payload);

  const result = parseAndVerifyGitHubWebhook({
    rawBody: Buffer.from(body),
    headers: signedHeaders(body, "installation_repositories"),
    secret,
  });

  assert.deepEqual(result.event, {
    kind: "repositories_changed",
    installationId: 4815162342,
    repositorySelection: "selected",
    added: [
      {
        id: 404,
        name: "checkout",
        fullName: "acme/checkout",
        private: false,
      },
    ],
    removed: [],
    occurredAt: "2026-07-24T03:00:00.000Z",
    sender: {
      id: 303,
      login: "octocat",
    },
  });
});

test("fails closed on unsupported actions and malformed payloads", async () => {
  const unsupported = installedPayload();
  unsupported.action = "new-action-from-github";
  const unsupportedBody = JSON.stringify(unsupported);

  await expectGitHubError(
    () =>
      parseAndVerifyGitHubWebhook({
        rawBody: Buffer.from(unsupportedBody),
        headers: signedHeaders(unsupportedBody),
        secret,
      }),
    "WEBHOOK_EVENT_UNSUPPORTED",
  );

  const malformedBody = JSON.stringify({
    action: "created",
    installation: { id: "4815162342" },
  });
  await expectGitHubError(
    () =>
      parseAndVerifyGitHubWebhook({
        rawBody: Buffer.from(malformedBody),
        headers: signedHeaders(malformedBody),
        secret,
      }),
    "WEBHOOK_PAYLOAD_INVALID",
  );
});

test("rejects empty, oversized, and weak webhook secrets", async () => {
  const body = JSON.stringify(installedPayload());

  await expectGitHubError(
    () =>
      parseAndVerifyGitHubWebhook({
        rawBody: Buffer.alloc(2_000_001),
        headers: signedHeaders(body),
        secret,
      }),
    "WEBHOOK_BODY_INVALID",
  );

  await expectGitHubError(
    () =>
      parseAndVerifyGitHubWebhook({
        rawBody: Buffer.from(body),
        headers: signedHeaders(body),
        secret: "too-short",
      }),
    "WEBHOOK_CONFIGURATION_INVALID",
  );
});
