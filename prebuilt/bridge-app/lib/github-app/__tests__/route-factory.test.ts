import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { createGitHubWebhookPost } from "../../../app/api/github/webhooks/route-factory";

const secret = "a-secure-webhook-secret-with-at-least-32-bytes";
const delivery = "9df12df0-3f3e-4f46-b629-72703b7f45e8";
const payload = {
  action: "deleted",
  installation: {
    id: 4815162342,
    account: {
      id: 101,
      login: "acme",
      type: "Organization",
    },
    repository_selection: "selected",
    permissions: {},
    created_at: "2026-07-24T03:00:00Z",
  },
  sender: {
    id: 303,
    login: "octocat",
  },
};

function requestFor(body: string) {
  return new Request("https://bridge.example/api/github/webhooks", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-github-event": "installation",
      "x-github-delivery": delivery,
      "x-hub-signature-256": `sha256=${createHmac("sha256", secret)
        .update(body)
        .digest("hex")}`,
    },
    body,
  });
}

test("acknowledges a verified delivery only after durable acceptance", async () => {
  const accepted: string[] = [];
  const post = createGitHubWebhookPost({
    readWebhookSecret: async () => secret,
    acceptDelivery: async (event) => {
      accepted.push(event.deliveryId);
      return "accepted";
    },
  });
  const response = await post(requestFor(JSON.stringify(payload)));

  assert.equal(response.status, 202);
  assert.deepEqual(await response.json(), {
    deliveryId: delivery,
    status: "accepted",
  });
  assert.deepEqual(accepted, [delivery]);
});

test("returns success for a delivery the durable sink identifies as duplicate", async () => {
  const post = createGitHubWebhookPost({
    readWebhookSecret: async () => secret,
    acceptDelivery: async () => "duplicate",
  });
  const response = await post(requestFor(JSON.stringify(payload)));

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    deliveryId: delivery,
    status: "duplicate",
  });
});

test("does not acknowledge when secrets or durable acceptance are unavailable", async () => {
  const missingSecret = createGitHubWebhookPost({
    readWebhookSecret: async () => null,
    acceptDelivery: async () => "accepted",
  });
  const missingSecretResponse = await missingSecret(
    requestFor(JSON.stringify(payload)),
  );
  assert.equal(missingSecretResponse.status, 503);

  const unavailableSink = createGitHubWebhookPost({
    readWebhookSecret: async () => secret,
    acceptDelivery: async () => {
      throw new Error("database.internal failed with password=secret");
    },
  });
  const unavailableSinkResponse = await unavailableSink(
    requestFor(JSON.stringify(payload)),
  );
  assert.equal(unavailableSinkResponse.status, 503);
  assert.deepEqual(await unavailableSinkResponse.json(), {
    code: "WEBHOOK_DELIVERY_UNAVAILABLE",
    error: "GitHub webhook delivery could not be persisted.",
    retryable: true,
  });
});

test("rejects invalid signatures before calling the durable sink", async () => {
  let accepted = false;
  const post = createGitHubWebhookPost({
    readWebhookSecret: async () => secret,
    acceptDelivery: async () => {
      accepted = true;
      return "accepted";
    },
  });
  const request = requestFor(JSON.stringify(payload));
  request.headers.set("x-hub-signature-256", `sha256=${"0".repeat(64)}`);
  const response = await post(request);

  assert.equal(response.status, 401);
  assert.equal(accepted, false);
  assert.deepEqual(await response.json(), {
    code: "WEBHOOK_SIGNATURE_INVALID",
    error: "GitHub webhook signature is invalid.",
    retryable: false,
  });
});
