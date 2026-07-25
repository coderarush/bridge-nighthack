import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(relativePath: string): Promise<string> {
  return readFile(new URL(`../../../${relativePath}`, import.meta.url), "utf8")
    .catch(() => "");
}

test("publishes only POST for install and separate GET setup/callback phases", async () => {
  const installRoute = await source("app/api/github/install/route.ts");
  const setupRoute = await source("app/api/github/setup/route.ts");
  const callbackRoute = await source("app/api/github/callback/route.ts");

  assert.match(installRoute, /export async function POST\(/);
  assert.doesNotMatch(installRoute, /export async function GET\(/);
  assert.match(installRoute, /requireHumanUser/);
  assert.match(setupRoute, /export async function GET\(/);
  assert.match(setupRoute, /createGitHubSetupGet/);
  assert.match(callbackRoute, /export async function GET\(/);
});

test("keeps the unfinished webhook factory unpublished", async () => {
  const liveWebhookRoute = await source("app/api/github/webhooks/route.ts");
  assert.equal(liveWebhookRoute, "");
});

test("documents every server-only GitHub App onboarding setting", async () => {
  const envExample = await source(".env.example");

  for (const name of [
    "GITHUB_APP_SLUG",
    "GITHUB_APP_CLIENT_ID",
    "GITHUB_APP_CLIENT_SECRET",
  ]) {
    assert.match(envExample, new RegExp(`^${name}=$`, "m"));
  }
  assert.match(envExample, /request user authorization.*disabled/i);
  assert.match(envExample, /api\/github\/setup.*setup url/i);
  assert.match(envExample, /api\/github\/callback.*oauth callback url/i);
});
