import assert from "node:assert/strict";
import test from "node:test";
import {
  requireWorkspaceInstallationAccess,
  type WorkspaceInstallationAccessRecord,
  type WorkspaceInstallationAuthorizationStore,
} from "../authorization";
import { GitHubAppError } from "../errors";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";

const activeRecord: WorkspaceInstallationAccessRecord = {
  workspaceId,
  workspaceStatus: "active",
  userId,
  membershipRole: "engineer",
  membershipStatus: "active",
  installationId: 12345,
  installationStatus: "active",
  repositorySelection: "selected",
  repositoryId: 98765,
  repositoryStatus: "active",
};

function storeReturning(
  record: WorkspaceInstallationAccessRecord | null,
): WorkspaceInstallationAuthorizationStore {
  return {
    lookupAccess: async () => record,
  };
}

async function expectAuthorizationError(
  operation: () => Promise<unknown>,
  code: GitHubAppError["code"],
  status: number,
) {
  await assert.rejects(operation, (error: unknown) => {
    assert.ok(error instanceof GitHubAppError);
    assert.equal(error.code, code);
    assert.equal(error.status, status);
    return true;
  });
}

test("allows an active engineer to execute against an installed repository", async () => {
  const result = await requireWorkspaceInstallationAccess(
    {
      workspaceId,
      userId,
      installationId: 12345,
      repositoryId: 98765,
      action: "execute",
    },
    storeReturning(activeRecord),
  );

  assert.equal(result.membershipRole, "engineer");
  assert.equal(result.repositoryId, 98765);
});

test("rejects a record returned from another workspace or installation", async () => {
  await expectAuthorizationError(
    () =>
      requireWorkspaceInstallationAccess(
        {
          workspaceId,
          userId,
          installationId: 12345,
          repositoryId: 98765,
          action: "execute",
        },
        storeReturning({
          ...activeRecord,
          workspaceId: "33333333-3333-4333-8333-333333333333",
        }),
      ),
    "INSTALLATION_ACCESS_FORBIDDEN",
    403,
  );

  await expectAuthorizationError(
    () =>
      requireWorkspaceInstallationAccess(
        {
          workspaceId,
          userId,
          installationId: 12345,
          repositoryId: 98765,
          action: "execute",
        },
        storeReturning({ ...activeRecord, installationId: 99999 }),
      ),
    "INSTALLATION_ACCESS_FORBIDDEN",
    403,
  );
});

test("enforces role policy for installation management", async () => {
  await expectAuthorizationError(
    () =>
      requireWorkspaceInstallationAccess(
        {
          workspaceId,
          userId,
          installationId: 12345,
          action: "manage",
        },
        storeReturning({ ...activeRecord, repositoryId: undefined }),
      ),
    "WORKSPACE_ROLE_FORBIDDEN",
    403,
  );

  const owner = await requireWorkspaceInstallationAccess(
    {
      workspaceId,
      userId,
      installationId: 12345,
      action: "manage",
    },
    storeReturning({
      ...activeRecord,
      membershipRole: "owner",
      repositoryId: undefined,
    }),
  );
  assert.equal(owner.membershipRole, "owner");
});

test("rejects inactive workspaces, memberships, installations, and repositories", async () => {
  for (const record of [
    { ...activeRecord, workspaceStatus: "suspended" as const },
    { ...activeRecord, membershipStatus: "suspended" as const },
    { ...activeRecord, installationStatus: "suspended" as const },
    { ...activeRecord, repositoryStatus: "disabled" as const },
  ]) {
    await expectAuthorizationError(
      () =>
        requireWorkspaceInstallationAccess(
          {
            workspaceId,
            userId,
            installationId: 12345,
            repositoryId: 98765,
            action: "execute",
          },
          storeReturning(record),
        ),
      "INSTALLATION_ACCESS_FORBIDDEN",
      403,
    );
  }
});

test("fails closed when the authorization store is unavailable", async () => {
  const store: WorkspaceInstallationAuthorizationStore = {
    lookupAccess: async () => {
      throw new Error("database password and internal host must stay private");
    },
  };

  await assert.rejects(
    () =>
      requireWorkspaceInstallationAccess(
        {
          workspaceId,
          userId,
          installationId: 12345,
          repositoryId: 98765,
          action: "execute",
        },
        store,
      ),
    (error: unknown) => {
      assert.ok(error instanceof GitHubAppError);
      assert.equal(error.code, "INSTALLATION_AUTHORIZATION_UNAVAILABLE");
      assert.equal(error.status, 503);
      assert.equal(error.retryable, true);
      assert.doesNotMatch(error.message, /password|internal host/i);
      return true;
    },
  );
});

test("rejects malformed identifiers before querying storage", async () => {
  let queried = false;
  const store: WorkspaceInstallationAuthorizationStore = {
    lookupAccess: async () => {
      queried = true;
      return activeRecord;
    },
  };

  await expectAuthorizationError(
    () =>
      requireWorkspaceInstallationAccess(
        {
          workspaceId: "../workspace",
          userId,
          installationId: 12345,
          action: "read",
        },
        store,
      ),
    "INSTALLATION_AUTHORIZATION_INVALID",
    400,
  );
  assert.equal(queried, false);
});
