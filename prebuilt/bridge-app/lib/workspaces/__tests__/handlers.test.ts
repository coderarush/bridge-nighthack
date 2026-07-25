import assert from "node:assert/strict";
import test from "node:test";
import {
  createWorkspaceHandlers,
  type WorkspaceHandlerDependencies,
  type WorkspaceRecord,
} from "../handlers";

const HUMAN_USER_ID = "11111111-1111-4111-8111-111111111111";
const WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";
const ACCESS_TOKEN = "verified-user-access-token";

const workspace: WorkspaceRecord = {
  id: WORKSPACE_ID,
  name: "Acme Team",
  slug: "acme-team",
  status: "active",
  created_at: "2026-07-25T04:00:00.000Z",
};

function dependencies(
  overrides: Partial<WorkspaceHandlerDependencies> = {},
): WorkspaceHandlerDependencies {
  return {
    authenticate: async () => ({
      userId: HUMAN_USER_ID,
      isAnonymous: false,
      accessToken: ACCESS_TOKEN,
    }),
    listWorkspaces: async () => [workspace],
    createWorkspaceWithAudit: async () => workspace,
    ...overrides,
  };
}

function jsonRequest(
  url: string,
  value: unknown,
  headers: Record<string, string> = {},
): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(value),
  });
}

async function responseBody(
  response: Response,
): Promise<Record<string, unknown>> {
  return response.json() as Promise<Record<string, unknown>>;
}

test("denies anonymous users before listing or creating workspaces", async () => {
  let storageCalls = 0;
  const handlers = createWorkspaceHandlers(
    dependencies({
      authenticate: async () => ({
        userId: HUMAN_USER_ID,
        isAnonymous: true,
        accessToken: ACCESS_TOKEN,
      }),
      listWorkspaces: async () => {
        storageCalls += 1;
        return [];
      },
      createWorkspaceWithAudit: async () => {
        storageCalls += 1;
        return workspace;
      },
    }),
  );

  for (const response of [
    await handlers.GET(new Request("https://bridge.example/api/workspaces")),
    await handlers.POST(
      jsonRequest("https://bridge.example/api/workspaces", {
        name: "Acme Team",
        slug: "acme-team",
      }),
    ),
  ]) {
    assert.equal(response.status, 403);
    assert.deepEqual(await responseBody(response), {
      error: "A non-anonymous account is required.",
      code: "HUMAN_USER_REQUIRED",
      retryable: false,
    });
  }

  assert.equal(storageCalls, 0);
});

test("lists only the fixed RLS projection in deterministic order", async () => {
  const calls: unknown[] = [];
  const handlers = createWorkspaceHandlers(
    dependencies({
      listWorkspaces: async (query) => {
        calls.push(query);
        return [
          {
            ...workspace,
            id: "44444444-4444-4444-8444-444444444444",
            name: "Later",
            slug: "later",
            created_at: "2026-07-25T05:00:00.000Z",
          },
          workspace,
        ];
      },
    }),
  );

  const response = await handlers.GET(
    new Request("https://bridge.example/api/workspaces"),
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(calls, [
    {
      accessToken: ACCESS_TOKEN,
      select: "id, name, slug, status, created_at",
      order: [
        { column: "created_at", ascending: true },
        { column: "id", ascending: true },
      ],
    },
  ]);
  assert.deepEqual(await responseBody(response), {
    workspaces: [
      workspace,
      {
        ...workspace,
        id: "44444444-4444-4444-8444-444444444444",
        name: "Later",
        slug: "later",
        created_at: "2026-07-25T05:00:00.000Z",
      },
    ],
  });
});

test("accepts the database workspace-name boundaries on reads", async () => {
  const rows = [
    { ...workspace, name: "X" },
    {
      ...workspace,
      id: "44444444-4444-4444-8444-444444444444",
      name: "X".repeat(120),
    },
  ];
  const handlers = createWorkspaceHandlers(
    dependencies({ listWorkspaces: async () => rows }),
  );

  const response = await handlers.GET(
    new Request("https://bridge.example/api/workspaces"),
  );
  assert.equal(response.status, 200);
  assert.deepEqual((await responseBody(response)).workspaces, rows);
});

test("rejects malformed, oversized, and structurally invalid bodies", async () => {
  let creates = 0;
  const handlers = createWorkspaceHandlers(
    dependencies({
      createWorkspaceWithAudit: async () => {
        creates += 1;
        return workspace;
      },
    }),
  );

  const cases: Array<{ request: Request; status: number; code: string }> = [
    {
      request: new Request("https://bridge.example/api/workspaces", {
        method: "POST",
        body: "{",
      }),
      status: 400,
      code: "INVALID_WORKSPACE",
    },
    {
      request: new Request("https://bridge.example/api/workspaces", {
        method: "POST",
        headers: { "content-length": "4097" },
        body: "x",
      }),
      status: 413,
      code: "PAYLOAD_TOO_LARGE",
    },
    {
      request: new Request("https://bridge.example/api/workspaces", {
        method: "POST",
        body: JSON.stringify({ name: "x".repeat(4_100), slug: "oversized" }),
      }),
      status: 413,
      code: "PAYLOAD_TOO_LARGE",
    },
    {
      request: jsonRequest("https://bridge.example/api/workspaces", {
        name: "Acme Team",
        slug: "acme-team",
        owner: "attacker",
      }),
      status: 400,
      code: "INVALID_WORKSPACE",
    },
    {
      request: jsonRequest("https://bridge.example/api/workspaces", [
        "Acme Team",
        "acme-team",
      ]),
      status: 400,
      code: "INVALID_WORKSPACE",
    },
  ];

  for (const item of cases) {
    const response = await handlers.POST(item.request);
    assert.equal(response.status, item.status);
    assert.equal((await responseBody(response)).code, item.code);
  }
  assert.equal(creates, 0);
});

test("enforces the 2-80 name and exact 3-64 lowercase slug contract", async () => {
  const createCalls: unknown[] = [];
  const handlers = createWorkspaceHandlers(
    dependencies({
      createWorkspaceWithAudit: async (input) => {
        createCalls.push(input);
        return {
          ...workspace,
          name: input.name,
          slug: input.slug,
        };
      },
    }),
  );
  const invalidInputs = [
    { name: " ", slug: "acme-team" },
    { name: "x", slug: "acme-team" },
    { name: "x".repeat(81), slug: "acme-team" },
    { name: "Acme Team", slug: "Acme-Team" },
    { name: "Acme Team", slug: "acme-" },
    { name: "Acme Team", slug: "-acme" },
    { name: "Acme Team", slug: "a" },
    { name: "Acme Team", slug: "ab" },
    { name: "Acme Team", slug: "a".repeat(65) },
    { name: "Acme Team", slug: "acme_team" },
    { name: "Acme Team" },
    { name: 42, slug: "acme-team" },
  ];

  for (const input of invalidInputs) {
    const response = await handlers.POST(
      jsonRequest("https://bridge.example/api/workspaces", input),
    );
    assert.equal(response.status, 400);
    assert.equal((await responseBody(response)).code, "INVALID_WORKSPACE");
  }

  for (const slug of ["abc", "a".repeat(64)]) {
    const response = await handlers.POST(
      jsonRequest("https://bridge.example/api/workspaces", {
        name: "  Acme Team  ",
        slug,
      }),
    );
    assert.equal(response.status, 201);
  }

  assert.deepEqual(createCalls, [
    {
      name: "Acme Team",
      slug: "abc",
      ownerUserId: HUMAN_USER_ID,
    },
    {
      name: "Acme Team",
      slug: "a".repeat(64),
      ownerUserId: HUMAN_USER_ID,
    },
  ]);
});

test("maps duplicate slugs to a sanitized conflict", async () => {
  const handlers = createWorkspaceHandlers(
    dependencies({
      createWorkspaceWithAudit: async () => {
        throw {
          code: "23505",
          message: "duplicate key value violates secret internal constraint",
        };
      },
    }),
  );

  const response = await handlers.POST(
    jsonRequest("https://bridge.example/api/workspaces", {
      name: "Acme Team",
      slug: "acme-team",
    }),
  );
  const body = await responseBody(response);

  assert.equal(response.status, 409);
  assert.deepEqual(body, {
    error: "That workspace slug is already in use.",
    code: "WORKSPACE_SLUG_CONFLICT",
    retryable: false,
  });
  assert.doesNotMatch(JSON.stringify(body), /constraint|internal|token/i);
});

test("sanitizes authentication, list, and atomic creation failures", async () => {
  const internalError = new Error(
    "postgres password=secret token=server-token host=internal",
  );
  const cases: Array<{
    handlers: ReturnType<typeof createWorkspaceHandlers>;
    request: Request;
    status: number;
    code: string;
  }> = [
    {
      handlers: createWorkspaceHandlers(
        dependencies({
          authenticate: async () => {
            throw internalError;
          },
        }),
      ),
      request: new Request("https://bridge.example/api/workspaces"),
      status: 401,
      code: "AUTHENTICATION_REQUIRED",
    },
    {
      handlers: createWorkspaceHandlers(
        dependencies({
          listWorkspaces: async () => {
            throw internalError;
          },
        }),
      ),
      request: new Request("https://bridge.example/api/workspaces"),
      status: 503,
      code: "WORKSPACE_STORAGE_UNAVAILABLE",
    },
    {
      handlers: createWorkspaceHandlers(
        dependencies({
          createWorkspaceWithAudit: async () => {
            throw internalError;
          },
        }),
      ),
      request: jsonRequest("https://bridge.example/api/workspaces", {
        name: "Acme Team",
        slug: "acme-team",
      }),
      status: 503,
      code: "WORKSPACE_STORAGE_UNAVAILABLE",
    },
  ];

  for (const item of cases) {
    const response =
      item.request.method === "POST"
        ? await item.handlers.POST(item.request)
        : await item.handlers.GET(item.request);
    const serialized = JSON.stringify(await responseBody(response));

    assert.equal(response.status, item.status);
    assert.match(serialized, new RegExp(item.code));
    assert.doesNotMatch(
      serialized,
      /postgres|password|secret|server-token|internal/i,
    );
  }
});

test("creates the owner workspace and audit atomically, then returns 201", async () => {
  const createCalls: unknown[] = [];
  const handlers = createWorkspaceHandlers(
    dependencies({
      createWorkspaceWithAudit: async (input) => {
        createCalls.push(input);
        return {
          ...workspace,
          created_by_user_id: HUMAN_USER_ID,
          internal_note: "must not leave storage",
        } as WorkspaceRecord;
      },
    }),
  );

  const response = await handlers.POST(
    jsonRequest("https://bridge.example/api/workspaces", {
      name: "  Acme Team  ",
      slug: "acme-team",
    }),
  );

  assert.equal(response.status, 201);
  assert.deepEqual(createCalls, [
    {
      name: "Acme Team",
      slug: "acme-team",
      ownerUserId: HUMAN_USER_ID,
    },
  ]);
  assert.deepEqual(await responseBody(response), { workspace });
});
