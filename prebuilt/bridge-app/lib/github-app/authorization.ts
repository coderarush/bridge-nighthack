import { GitHubAppError } from "./errors";
import type { GitHubRepositorySelection } from "./policy";

export type WorkspaceRole =
  | "owner"
  | "admin"
  | "engineer"
  | "viewer"
  | "auditor";
export type WorkspaceInstallationAction = "read" | "execute" | "manage";

export interface WorkspaceInstallationAuthorizationInput {
  workspaceId: string;
  userId: string;
  installationId: number;
  repositoryId?: number;
  action: WorkspaceInstallationAction;
}

export interface WorkspaceInstallationAccessRecord {
  workspaceId: string;
  workspaceStatus: "active" | "suspended" | "closed";
  userId: string;
  membershipRole: WorkspaceRole;
  membershipStatus: "active" | "invited" | "suspended";
  installationId: number;
  installationStatus: "active" | "suspended" | "deleted";
  repositorySelection: GitHubRepositorySelection;
  repositoryId?: number;
  repositoryStatus?: "active" | "archived" | "disabled";
}

export interface WorkspaceInstallationAuthorizationStore {
  lookupAccess(
    input: Readonly<WorkspaceInstallationAuthorizationInput>,
  ): Promise<WorkspaceInstallationAccessRecord | null>;
}

const rolePolicy: Record<
  WorkspaceInstallationAction,
  readonly WorkspaceRole[]
> = {
  read: ["owner", "admin", "engineer", "viewer", "auditor"],
  execute: ["owner", "admin", "engineer"],
  manage: ["owner", "admin"],
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isPositiveId(value: number | undefined): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0
  );
}

function validateInput(
  input: WorkspaceInstallationAuthorizationInput,
): void {
  if (
    !uuidPattern.test(input.workspaceId) ||
    !uuidPattern.test(input.userId) ||
    !isPositiveId(input.installationId) ||
    (input.repositoryId !== undefined &&
      !isPositiveId(input.repositoryId)) ||
    !Object.hasOwn(rolePolicy, input.action)
  ) {
    throw new GitHubAppError("INSTALLATION_AUTHORIZATION_INVALID");
  }
  if (input.action === "execute" && input.repositoryId === undefined) {
    throw new GitHubAppError("INSTALLATION_AUTHORIZATION_INVALID");
  }
}

function hasExactBoundary(
  input: WorkspaceInstallationAuthorizationInput,
  record: WorkspaceInstallationAccessRecord,
): boolean {
  return (
    record.workspaceId === input.workspaceId &&
    record.userId === input.userId &&
    record.installationId === input.installationId &&
    record.workspaceStatus === "active" &&
    record.membershipStatus === "active" &&
    record.installationStatus === "active" &&
    (input.repositoryId === undefined ||
      (record.repositoryId === input.repositoryId &&
        record.repositoryStatus === "active"))
  );
}

export async function requireWorkspaceInstallationAccess(
  input: WorkspaceInstallationAuthorizationInput,
  store: WorkspaceInstallationAuthorizationStore,
): Promise<WorkspaceInstallationAccessRecord> {
  validateInput(input);

  let record: WorkspaceInstallationAccessRecord | null;
  try {
    record = await store.lookupAccess(Object.freeze({ ...input }));
  } catch {
    throw new GitHubAppError("INSTALLATION_AUTHORIZATION_UNAVAILABLE");
  }

  if (!record || !hasExactBoundary(input, record)) {
    throw new GitHubAppError("INSTALLATION_ACCESS_FORBIDDEN");
  }
  if (!rolePolicy[input.action].includes(record.membershipRole)) {
    throw new GitHubAppError("WORKSPACE_ROLE_FORBIDDEN");
  }
  return record;
}
