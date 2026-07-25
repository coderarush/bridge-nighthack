import { GitHubAppError } from "./errors";

export type GitHubPermissionLevel = "read" | "write" | "admin";
export type GitHubRepositorySelection = "selected" | "all";

export interface GitHubRepository {
  id: number;
  name: string;
  fullName: string;
  private: boolean;
}

export interface GitHubInstallationPolicyInput {
  permissions: Readonly<Record<string, string>>;
  repositorySelection: GitHubRepositorySelection;
  repositories: readonly GitHubRepository[];
}

export interface GitHubInstallationPolicyOptions {
  allowAllRepositories?: boolean;
  maxSelectedRepositories?: number;
}

export interface ValidatedGitHubInstallationPolicy {
  permissions: Record<string, GitHubPermissionLevel>;
  repositorySelection: GitHubRepositorySelection;
  repositories: GitHubRepository[];
}

export const bridgeGitHubAppPermissions = {
  actions: "read",
  checks: "read",
  contents: "write",
  metadata: "read",
  pull_requests: "write",
} as const satisfies Record<string, GitHubPermissionLevel>;

const permissionRank: Record<GitHubPermissionLevel, number> = {
  read: 1,
  write: 2,
  admin: 3,
};

function isPermissionLevel(value: string): value is GitHubPermissionLevel {
  return value === "read" || value === "write" || value === "admin";
}

function validatePermissions(
  permissions: Readonly<Record<string, string>>,
): Record<string, GitHubPermissionLevel> {
  const canonical: Record<string, GitHubPermissionLevel> = {};

  for (const [name, value] of Object.entries(permissions).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    if (!/^[a-z][a-z0-9_]{0,79}$/.test(name) || !isPermissionLevel(value)) {
      throw new GitHubAppError("INSTALLATION_PERMISSIONS_EXCESSIVE");
    }
    const maximum = bridgeGitHubAppPermissions[
      name as keyof typeof bridgeGitHubAppPermissions
    ];
    if (!maximum || permissionRank[value] > permissionRank[maximum]) {
      throw new GitHubAppError("INSTALLATION_PERMISSIONS_EXCESSIVE");
    }
    canonical[name] = value;
  }

  for (const [name, required] of Object.entries(
    bridgeGitHubAppPermissions,
  ) as [keyof typeof bridgeGitHubAppPermissions, GitHubPermissionLevel][]) {
    const actual = canonical[name];
    if (!actual || permissionRank[actual] < permissionRank[required]) {
      throw new GitHubAppError("INSTALLATION_PERMISSIONS_INSUFFICIENT");
    }
  }

  return canonical;
}

function isSafeRepository(repository: GitHubRepository): boolean {
  if (
    !Number.isSafeInteger(repository.id) ||
    repository.id <= 0 ||
    typeof repository.name !== "string" ||
    repository.name.length < 1 ||
    repository.name.length > 100 ||
    /[/\u0000-\u001f\u007f]/.test(repository.name) ||
    typeof repository.fullName !== "string" ||
    repository.fullName.length > 201 ||
    typeof repository.private !== "boolean"
  ) {
    return false;
  }
  const slash = repository.fullName.indexOf("/");
  return (
    slash > 0 &&
    slash === repository.fullName.lastIndexOf("/") &&
    repository.fullName.slice(slash + 1) === repository.name &&
    !/[\u0000-\u001f\u007f]/.test(repository.fullName)
  );
}

function validateRepositories(
  repositories: readonly GitHubRepository[],
  maximum: number,
): GitHubRepository[] {
  if (
    !Number.isSafeInteger(maximum) ||
    maximum < 1 ||
    maximum > 10_000 ||
    repositories.length < 1 ||
    repositories.length > maximum
  ) {
    throw new GitHubAppError("INSTALLATION_REPOSITORIES_INVALID");
  }

  const ids = new Set<number>();
  const names = new Set<string>();
  const canonical = repositories.map((repository) => {
    if (!isSafeRepository(repository)) {
      throw new GitHubAppError("INSTALLATION_REPOSITORIES_INVALID");
    }
    const foldedName = repository.fullName.toLocaleLowerCase("en-US");
    if (ids.has(repository.id) || names.has(foldedName)) {
      throw new GitHubAppError("INSTALLATION_REPOSITORIES_INVALID");
    }
    ids.add(repository.id);
    names.add(foldedName);
    return { ...repository };
  });

  return canonical.sort((left, right) => left.id - right.id);
}

export function validateInstallationPolicy(
  input: GitHubInstallationPolicyInput,
  options: GitHubInstallationPolicyOptions = {},
): ValidatedGitHubInstallationPolicy {
  const permissions = validatePermissions(input.permissions);

  if (
    input.repositorySelection !== "selected" &&
    input.repositorySelection !== "all"
  ) {
    throw new GitHubAppError("INSTALLATION_REPOSITORIES_INVALID");
  }

  if (input.repositorySelection === "all") {
    if (!options.allowAllRepositories) {
      throw new GitHubAppError("INSTALLATION_REPOSITORY_SCOPE_FORBIDDEN");
    }
    return {
      permissions,
      repositorySelection: "all",
      repositories: [],
    };
  }

  return {
    permissions,
    repositorySelection: "selected",
    repositories: validateRepositories(
      input.repositories,
      options.maxSelectedRepositories ?? 500,
    ),
  };
}
