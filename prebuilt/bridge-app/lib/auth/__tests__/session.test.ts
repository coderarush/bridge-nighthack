import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AuthError,
  requireParticipant,
  requireRunParticipant,
  requireSupabaseUser,
  type AuthDependencies,
} from "../session";

function request(authorization?: string): Request {
  return new Request("https://bridge.example/api/test", {
    headers: authorization ? { authorization } : undefined,
  });
}

function dependencies(
  overrides: Partial<AuthDependencies> = {},
): AuthDependencies {
  return {
    getUser: async () => ({
      id: "11111111-1111-4111-8111-111111111111",
      isAnonymous: true,
    }),
    getParticipant: async () => ({
      userId: "11111111-1111-4111-8111-111111111111",
      name: "Atlas Store",
      role: "customer",
    }),
    hasRunMembership: async () => true,
    ...overrides,
  };
}

async function expectAuthError(
  action: () => Promise<unknown>,
  status: 401 | 403,
  code: AuthError["code"],
) {
  await assert.rejects(action, (error) => {
    assert(error instanceof AuthError);
    assert.equal(error.status, status);
    assert.equal(error.code, code);
    return true;
  });
}

test("rejects a missing bearer token", async () => {
  await expectAuthError(
    () => requireSupabaseUser(request(), dependencies()),
    401,
    "missing_authorization",
  );
});

test("rejects malformed and invalid bearer tokens", async () => {
  await expectAuthError(
    () => requireSupabaseUser(request("Basic nope"), dependencies()),
    401,
    "missing_authorization",
  );
  await expectAuthError(
    () => requireSupabaseUser(
      request("Bearer invalid"),
      dependencies({ getUser: async () => null }),
    ),
    401,
    "invalid_token",
  );
});

test("returns a verified anonymous Supabase user", async () => {
  const user = await requireSupabaseUser(
    request("Bearer verified-token"),
    dependencies(),
  );

  assert.deepEqual(user, {
    id: "11111111-1111-4111-8111-111111111111",
    isAnonymous: true,
  });
});

test("rejects users without a bootstrapped participant profile", async () => {
  await expectAuthError(
    () => requireParticipant(
      request("Bearer verified-token"),
      ["customer"],
      dependencies({ getParticipant: async () => null }),
    ),
    403,
    "participant_not_bootstrapped",
  );
});

test("enforces persisted participant roles", async () => {
  await expectAuthError(
    () => requireParticipant(
      request("Bearer verified-token"),
      ["provider"],
      dependencies(),
    ),
    403,
    "role_forbidden",
  );

  const participant = await requireParticipant(
    request("Bearer verified-token"),
    ["customer", "operator"],
    dependencies(),
  );
  assert.equal(participant.role, "customer");
  assert.equal(participant.name, "Atlas Store");
});

test("rejects a participant who is not assigned to the requested run", async () => {
  await expectAuthError(
    () =>
      requireRunParticipant(
        request("Bearer verified-token"),
        "22222222-2222-4222-8222-222222222222",
        ["customer"],
        dependencies({ hasRunMembership: async () => false }),
      ),
    403,
    "run_forbidden",
  );
});

test("allows a run member and gives operators an intentional global bypass", async () => {
  const member = await requireRunParticipant(
    request("Bearer verified-token"),
    "22222222-2222-4222-8222-222222222222",
    ["customer"],
    dependencies(),
  );
  assert.equal(member.role, "customer");

  const operator = await requireRunParticipant(
    request("Bearer verified-token"),
    "33333333-3333-4333-8333-333333333333",
    ["operator"],
    dependencies({
      getParticipant: async () => ({
        userId: "11111111-1111-4111-8111-111111111111",
        name: "Bridge Operator",
        role: "operator",
      }),
      hasRunMembership: async () => false,
    }),
  );
  assert.equal(operator.role, "operator");
});
