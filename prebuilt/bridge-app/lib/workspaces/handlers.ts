const MAX_BODY_BYTES = 4_096;
const WORKSPACE_SELECT = "id, name, slug, status, created_at" as const;
const WORKSPACE_ORDER = [
  { column: "created_at", ascending: true },
  { column: "id", ascending: true },
] as const;
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/;

export type WorkspaceStatus = "active" | "suspended" | "closed";

export interface WorkspaceRecord {
  id: string;
  name: string;
  slug: string;
  status: WorkspaceStatus;
  created_at: string;
}

export interface WorkspaceAuthentication {
  userId: string;
  isAnonymous: boolean;
  accessToken: string;
}

export interface WorkspaceListQuery {
  accessToken: string;
  select: typeof WORKSPACE_SELECT;
  order: typeof WORKSPACE_ORDER;
}

export interface CreateWorkspaceInput {
  name: string;
  slug: string;
  ownerUserId: string;
}

export interface WorkspaceHandlerDependencies {
  authenticate(request: Request): Promise<WorkspaceAuthentication>;
  listWorkspaces(query: WorkspaceListQuery): Promise<unknown>;
  createWorkspaceWithAudit(input: CreateWorkspaceInput): Promise<unknown>;
}

class PayloadTooLargeError extends Error {}

function jsonResponse(
  body: Record<string, unknown>,
  status: number,
  noStore = false,
): Response {
  const headers = noStore ? { "Cache-Control": "no-store" } : undefined;
  return Response.json(body, { status, headers });
}

function authenticationRequired(noStore: boolean): Response {
  return jsonResponse(
    {
      error: "Authentication is required.",
      code: "AUTHENTICATION_REQUIRED",
      retryable: false,
    },
    401,
    noStore,
  );
}

function humanUserRequired(noStore: boolean): Response {
  return jsonResponse(
    {
      error: "A non-anonymous account is required.",
      code: "HUMAN_USER_REQUIRED",
      retryable: false,
    },
    403,
    noStore,
  );
}

function invalidWorkspace(): Response {
  return jsonResponse(
    {
      error: "Workspace name or slug is invalid.",
      code: "INVALID_WORKSPACE",
      retryable: false,
    },
    400,
  );
}

function storageUnavailable(noStore = false): Response {
  return jsonResponse(
    {
      error: "Workspace storage is temporarily unavailable.",
      code: "WORKSPACE_STORAGE_UNAVAILABLE",
      retryable: true,
    },
    503,
    noStore,
  );
}

function errorStatus(error: unknown): number | null {
  if (typeof error !== "object" || error === null) return null;
  const status = (error as Record<string, unknown>).status;
  return typeof status === "number" ? status : null;
}

function errorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  const code = (error as Record<string, unknown>).code;
  return typeof code === "string" ? code : null;
}

async function authenticate(
  request: Request,
  dependencies: WorkspaceHandlerDependencies,
  noStore: boolean,
): Promise<WorkspaceAuthentication | Response> {
  let authentication: WorkspaceAuthentication;
  try {
    authentication = await dependencies.authenticate(request);
  } catch (error) {
    return errorStatus(error) === 403
      ? humanUserRequired(noStore)
      : authenticationRequired(noStore);
  }

  if (
    !authentication ||
    typeof authentication.userId !== "string" ||
    authentication.userId.length === 0 ||
    typeof authentication.accessToken !== "string" ||
    authentication.accessToken.length === 0
  ) {
    return authenticationRequired(noStore);
  }
  if (authentication.isAnonymous !== false) {
    return humanUserRequired(noStore);
  }
  return authentication;
}

function workspaceRecord(value: unknown): WorkspaceRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("invalid workspace storage row");
  }

  const row = value as Record<string, unknown>;
  if (
    typeof row.id !== "string" ||
    row.id.length === 0 ||
    typeof row.name !== "string" ||
    row.name.length === 0 ||
    row.name.length > 120 ||
    typeof row.slug !== "string" ||
    !SLUG_PATTERN.test(row.slug) ||
    (row.status !== "active" &&
      row.status !== "suspended" &&
      row.status !== "closed") ||
    typeof row.created_at !== "string" ||
    row.created_at.length === 0
  ) {
    throw new Error("invalid workspace storage row");
  }

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status,
    created_at: row.created_at,
  };
}

function workspaceRecords(value: unknown): WorkspaceRecord[] {
  if (!Array.isArray(value)) {
    throw new Error("invalid workspace storage result");
  }

  return value
    .map(workspaceRecord)
    .sort(
      (left, right) =>
        left.created_at.localeCompare(right.created_at) ||
        left.id.localeCompare(right.id),
    );
}

async function limitedBodyText(request: Request): Promise<string> {
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    if (!/^\d+$/.test(contentLength)) {
      throw new SyntaxError("invalid content length");
    }
    if (Number(contentLength) > MAX_BODY_BYTES) {
      throw new PayloadTooLargeError();
    }
  }

  if (!request.body) return "";

  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let byteCount = 0;
  let text = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteCount += value.byteLength;
      if (byteCount > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new PayloadTooLargeError();
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return text;
  } finally {
    reader.releaseLock();
  }
}

async function workspaceInput(
  request: Request,
): Promise<{ name: string; slug: string }> {
  const parsed = JSON.parse(await limitedBodyText(request)) as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new SyntaxError("workspace object required");
  }

  const input = parsed as Record<string, unknown>;
  const keys = Object.keys(input).sort();
  if (
    keys.length !== 2 ||
    keys[0] !== "name" ||
    keys[1] !== "slug" ||
    typeof input.name !== "string" ||
    typeof input.slug !== "string"
  ) {
    throw new SyntaxError("workspace keys are invalid");
  }

  const name = input.name.trim();
  if (name.length < 2 || name.length > 80 || !SLUG_PATTERN.test(input.slug)) {
    throw new SyntaxError("workspace values are invalid");
  }
  return { name, slug: input.slug };
}

export function createWorkspaceHandlers(
  dependencies: WorkspaceHandlerDependencies,
): {
  GET(request: Request): Promise<Response>;
  POST(request: Request): Promise<Response>;
} {
  return {
    async GET(request) {
      const actor = await authenticate(request, dependencies, true);
      if (actor instanceof Response) return actor;

      try {
        const rows = await dependencies.listWorkspaces({
          accessToken: actor.accessToken,
          select: WORKSPACE_SELECT,
          order: WORKSPACE_ORDER,
        });
        return jsonResponse(
          { workspaces: workspaceRecords(rows) },
          200,
          true,
        );
      } catch {
        return storageUnavailable(true);
      }
    },

    async POST(request) {
      const actor = await authenticate(request, dependencies, false);
      if (actor instanceof Response) return actor;

      let input: { name: string; slug: string };
      try {
        input = await workspaceInput(request);
      } catch (error) {
        if (error instanceof PayloadTooLargeError) {
          return jsonResponse(
            {
              error: "Workspace request exceeds 4096 bytes.",
              code: "PAYLOAD_TOO_LARGE",
              retryable: false,
            },
            413,
          );
        }
        return invalidWorkspace();
      }

      let created: WorkspaceRecord;
      try {
        created = workspaceRecord(
          await dependencies.createWorkspaceWithAudit({
            ...input,
            ownerUserId: actor.userId,
          }),
        );
      } catch (error) {
        if (errorCode(error) === "23505") {
          return jsonResponse(
            {
              error: "That workspace slug is already in use.",
              code: "WORKSPACE_SLUG_CONFLICT",
              retryable: false,
            },
            409,
          );
        }
        return storageUnavailable();
      }

      return jsonResponse({ workspace: created }, 201);
    },
  };
}
