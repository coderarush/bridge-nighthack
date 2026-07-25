import assert from "node:assert/strict";
import test from "node:test";
import { GitHubAppError } from "../errors";
import {
  validateInstallationPolicy,
  type GitHubRepositorySelection,
} from "../policy";

const minimumPermissions = {
  actions: "read",
  checks: "read",
  contents: "write",
  metadata: "read",
  pull_requests: "write",
} as const;

const selectedRepositories = [
  {
    id: 10,
    name: "api",
    fullName: "acme/api",
    private: true,
  },
  {
    id: 9,
    name: "web",
    fullName: "acme/web",
    private: false,
  },
];

async function expectPolicyError(
  operation: () => unknown,
  code: GitHubAppError["code"],
) {
  await assert.rejects(async () => operation(), (error: unknown) => {
    assert.ok(error instanceof GitHubAppError);
    assert.equal(error.code, code);
    return true;
  });
}

function validate(
  permissions: Record<string, string>,
  repositorySelection: GitHubRepositorySelection = "selected",
) {
  return validateInstallationPolicy({
    permissions,
    repositorySelection,
    repositories: selectedRepositories,
  });
}

test("accepts the minimum permissions and canonicalizes selected repositories", () => {
  const result = validate(minimumPermissions);

  assert.deepEqual(result.permissions, minimumPermissions);
  assert.deepEqual(
    result.repositories.map((repository) => repository.id),
    [9, 10],
  );
  assert.equal(result.repositorySelection, "selected");
});

test("rejects missing or insufficient required permissions", async () => {
  await expectPolicyError(
    () =>
      validate({
        ...minimumPermissions,
        contents: "read",
      }),
    "INSTALLATION_PERMISSIONS_INSUFFICIENT",
  );

  const { checks: _checks, ...withoutChecks } = minimumPermissions;
  await expectPolicyError(
    () => validate(withoutChecks),
    "INSTALLATION_PERMISSIONS_INSUFFICIENT",
  );
});

test("rejects permissions broader than Bridge needs", async () => {
  await expectPolicyError(
    () =>
      validate({
        ...minimumPermissions,
        administration: "write",
      }),
    "INSTALLATION_PERMISSIONS_EXCESSIVE",
  );

  await expectPolicyError(
    () =>
      validate({
        ...minimumPermissions,
        checks: "write",
      }),
    "INSTALLATION_PERMISSIONS_EXCESSIVE",
  );
});

test("requires explicit opt-in for all-repository installations", async () => {
  await expectPolicyError(
    () => validate(minimumPermissions, "all"),
    "INSTALLATION_REPOSITORY_SCOPE_FORBIDDEN",
  );

  const result = validateInstallationPolicy(
    {
      permissions: minimumPermissions,
      repositorySelection: "all",
      repositories: [],
    },
    { allowAllRepositories: true },
  );
  assert.equal(result.repositorySelection, "all");
  assert.deepEqual(result.repositories, []);
});

test("rejects empty, duplicate, or malformed selected repository lists", async () => {
  await expectPolicyError(
    () =>
      validateInstallationPolicy({
        permissions: minimumPermissions,
        repositorySelection: "selected",
        repositories: [],
      }),
    "INSTALLATION_REPOSITORIES_INVALID",
  );

  await expectPolicyError(
    () =>
      validateInstallationPolicy({
        permissions: minimumPermissions,
        repositorySelection: "selected",
        repositories: [selectedRepositories[0], selectedRepositories[0]],
      }),
    "INSTALLATION_REPOSITORIES_INVALID",
  );

  await expectPolicyError(
    () =>
      validateInstallationPolicy({
        permissions: minimumPermissions,
        repositorySelection: "selected",
        repositories: [
          {
            id: 12,
            name: "api",
            fullName: "other-owner/not-api",
            private: false,
          },
        ],
      }),
    "INSTALLATION_REPOSITORIES_INVALID",
  );
});
