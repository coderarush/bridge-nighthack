import assert from "node:assert/strict";
import test from "node:test";
import { GitHubAppError } from "../errors";
import { createSupabaseGitHubOnboardingStore } from "../onboarding-store";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const installationRecordId = "33333333-3333-4333-8333-333333333333";
const stateDigest = "ab".repeat(32);
const installationReferenceCiphertext =
  "v1.BwcHBwcHBwcHBwcH.BwcHBwcHBwc.BwcHBwcHBwcHBwcHBwcHBw";
const installationReferenceDigest = "cd".repeat(32);

test("Supabase onboarding store uses only service RPC contracts", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const store = createSupabaseGitHubOnboardingStore({
    rpc: async (name, args) => {
      calls.push({ name, args });
      if (name === "service_create_github_installation_state") {
        return {
          data: {
            workspace_id: workspaceId,
            user_id: userId,
            phase: args.p_phase,
            installation_reference_ciphertext:
              args.p_installation_reference_ciphertext,
            installation_reference_digest:
              args.p_installation_reference_digest,
            expires_at: "2026-07-24T03:10:00.000Z",
          },
          error: null,
        };
      }
      if (name === "service_claim_github_installation_state") {
        return {
          data: {
            workspace_id: workspaceId,
            user_id: userId,
            phase: "oauth",
            installation_reference_ciphertext:
              installationReferenceCiphertext,
            installation_reference_digest:
              installationReferenceDigest,
            expires_at: "2026-07-24T03:10:00.000Z",
            consumed_at: "2026-07-24T03:01:00.000Z",
          },
          error: null,
        };
      }
      if (name === "service_complete_github_app_onboarding") {
        return { data: { id: installationRecordId }, error: null };
      }
      return { data: {}, error: null };
    },
  });

  await store.createState({
    workspaceId,
    userId,
    stateDigest,
    phase: "oauth",
    installationReferenceCiphertext,
    installationReferenceDigest,
  });
  await store.claimState({ stateDigest, expectedPhase: "oauth" });
  await store.completeOnboarding({
    workspaceId,
    userId,
    installationReferenceCiphertext,
    installationReferenceDigest,
    installation: {
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
      events: ["installation"],
      repositories: [
        {
          id: 201,
          owner: "acme",
          name: "payments",
          fullName: "acme/payments",
          private: true,
          defaultBranch: "main",
        },
      ],
    },
  });

  assert.deepEqual(
    calls.map((call) => call.name),
    [
      "service_create_github_installation_state",
      "service_claim_github_installation_state",
      "service_complete_github_app_onboarding",
    ],
  );
  assert.equal(calls[0].args.p_state_digest, `\\x${stateDigest}`);
  assert.equal(calls[0].args.p_phase, "oauth");
  assert.equal(
    calls[0].args.p_installation_reference_ciphertext,
    installationReferenceCiphertext,
  );
  assert.equal(
    calls[0].args.p_installation_reference_digest,
    installationReferenceDigest,
  );
  assert.equal(calls[1].args.p_expected_phase, "oauth");
  assert.equal(
    calls[2].args.p_installation_reference_ciphertext,
    installationReferenceCiphertext,
  );
  assert.equal(
    calls[2].args.p_installation_reference_digest,
    installationReferenceDigest,
  );
  assert.equal("p_installation_id" in calls[2].args, false);
  assert.deepEqual(calls[2].args.p_repositories, [
    {
      id: 201,
      owner: "acme",
      name: "payments",
      defaultBranch: "main",
    },
  ]);
  assert.doesNotMatch(JSON.stringify(calls), /ghu_|ghs_|access[_-]?token/i);
});

test("Supabase onboarding store maps replay without leaking database details", async () => {
  const store = createSupabaseGitHubOnboardingStore({
    rpc: async () => ({
      data: null,
      error: {
        code: "P0002",
        message: "state digest abcd was already consumed on db.internal",
      },
    }),
  });

  await assert.rejects(
    () => store.claimState({ stateDigest, expectedPhase: "oauth" }),
    (error: unknown) => {
      assert.ok(error instanceof GitHubAppError);
      assert.equal(error.code, "ONBOARDING_STATE_INVALID");
      assert.doesNotMatch(error.message, /abcd|db\.internal/i);
      return true;
    },
  );
});
