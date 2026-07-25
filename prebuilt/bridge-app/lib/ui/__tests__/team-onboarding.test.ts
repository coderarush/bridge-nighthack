import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type { Session } from "@supabase/supabase-js";
import {
  createTeamWorkspace,
  getGitHubInstallUrl,
  isHumanSession,
  loadTeamWorkspaces,
  requestMagicLink,
  type TeamAuthClient,
  type TeamRequest,
} from "../../../components/team/TeamOnboarding";

const humanSession = {
  access_token: "human-access-token",
  user: {
    id: "11111111-1111-4111-8111-111111111111",
    email: "owner@example.com",
    is_anonymous: false,
  },
} as Session;

const anonymousSession = {
  access_token: "anonymous-access-token",
  user: {
    id: "22222222-2222-4222-8222-222222222222",
    is_anonymous: true,
  },
} as Session;

const ambiguousSession = {
  access_token: "ambiguous-access-token",
  user: {
    id: "22222222-2222-4222-8222-222222222223",
  },
} as Session;

const workspace = {
  id: "33333333-3333-4333-8333-333333333333",
  name: "Payments Platform",
  slug: "payments-platform",
  status: "active" as const,
};

function authClient({
  session,
  calls,
}: {
  session: Session | null;
  calls: string[];
}): TeamAuthClient {
  return {
    auth: {
      getSession: async () => ({ data: { session }, error: null }),
      signOut: async () => {
        calls.push("signOut");
        return { error: null };
      },
      signInWithOtp: async (input) => {
        calls.push("signInWithOtp");
        assert.deepEqual(input, {
          email: "owner@example.com",
          options: {
            emailRedirectTo: "https://bridge.example/team",
          },
        });
        return { error: null };
      },
    },
  };
}

test("recognizes only non-anonymous Supabase sessions as team identities", () => {
  assert.equal(isHumanSession(humanSession), true);
  assert.equal(isHumanSession(anonymousSession), false);
  assert.equal(isHumanSession(ambiguousSession), false);
  assert.equal(isHumanSession(null), false);
});

test("signs out an anonymous session before requesting a magic link", async () => {
  const calls: string[] = [];

  await requestMagicLink(
    authClient({ session: anonymousSession, calls }),
    " owner@example.com ",
    "https://bridge.example",
  );

  assert.deepEqual(calls, ["signOut", "signInWithOtp"]);
});

test("fails closed when Supabase omits the anonymous-session flag", async () => {
  const calls: string[] = [];

  await requestMagicLink(
    authClient({ session: ambiguousSession, calls }),
    "owner@example.com",
    "https://bridge.example",
  );

  assert.deepEqual(calls, ["signOut", "signInWithOtp"]);
});

test("requests a magic link directly when no session exists", async () => {
  const calls: string[] = [];

  await requestMagicLink(
    authClient({ session: null, calls }),
    "owner@example.com",
    "https://bridge.example/",
  );

  assert.deepEqual(calls, ["signInWithOtp"]);
});

test("loads live workspaces with the human session bearer token", async () => {
  const request: TeamRequest = async (input, init) => {
    assert.equal(input, "/api/workspaces");
    assert.equal(init?.method, "GET");
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer human-access-token");
    return Response.json({ workspaces: [workspace] });
  };

  assert.deepEqual(await loadTeamWorkspaces("human-access-token", request), [
    workspace,
  ]);
});

test("accepts every persisted workspace-name boundary on reads", async () => {
  const workspaces = [
    { ...workspace, name: "X" },
    {
      ...workspace,
      id: "33333333-3333-4333-8333-333333333334",
      name: "X".repeat(120),
    },
  ];
  assert.deepEqual(
    await loadTeamWorkspaces(
      "human-access-token",
      async () => Response.json({ workspaces }),
    ),
    workspaces,
  );
});

test("creates a workspace with the exact name and slug contract", async () => {
  const request: TeamRequest = async (input, init) => {
    assert.equal(input, "/api/workspaces");
    assert.equal(init?.method, "POST");
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer human-access-token");
    assert.equal(new Headers(init?.headers).get("content-type"), "application/json");
    assert.deepEqual(JSON.parse(String(init?.body)), {
      name: "Payments Platform",
      slug: "payments-platform",
    });
    return Response.json({ workspace }, { status: 201 });
  };

  assert.deepEqual(
    await createTeamWorkspace(
      "human-access-token",
      { name: " Payments Platform ", slug: "payments-platform" },
      request,
    ),
    workspace,
  );
});

test("rejects workspace input beyond the API bounds before sending", async () => {
  let requests = 0;
  const request: TeamRequest = async () => {
    requests += 1;
    return Response.json({ workspace });
  };

  await assert.rejects(
    () =>
      createTeamWorkspace(
        "human-access-token",
        { name: "x", slug: "payments-platform" },
        request,
      ),
    /workspace name and slug/i,
  );
  await assert.rejects(
    () =>
      createTeamWorkspace(
        "human-access-token",
        { name: "x".repeat(81), slug: "payments-platform" },
        request,
      ),
    /workspace name and slug/i,
  );
  await assert.rejects(
    () =>
      createTeamWorkspace(
        "human-access-token",
        { name: "Payments Platform", slug: "x".repeat(65) },
        request,
      ),
    /workspace name and slug/i,
  );
  assert.equal(requests, 0);
});

test("accepts the exact maximum workspace input bounds", async () => {
  let requests = 0;
  await createTeamWorkspace(
    "human-access-token",
    { name: "N".repeat(80), slug: "s".repeat(64) },
    async () => {
      requests += 1;
      return Response.json({ workspace });
    },
  );
  assert.equal(requests, 1);
});

test("starts GitHub installation through the authenticated POST handshake", async () => {
  const request: TeamRequest = async (input, init) => {
    assert.equal(input, "/api/github/install");
    assert.equal(init?.method, "POST");
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer human-access-token");
    assert.equal(new Headers(init?.headers).get("content-type"), "application/json");
    assert.deepEqual(JSON.parse(String(init?.body)), {
      workspaceId: workspace.id,
    });
    return Response.json({
      installUrl:
        "https://github.com/apps/bridge/installations/new?state=opaque",
    });
  };

  assert.equal(
    await getGitHubInstallUrl("human-access-token", workspace.id, request),
    "https://github.com/apps/bridge/installations/new?state=opaque",
  );
});

test("rejects non-GitHub installation redirects", async () => {
  await assert.rejects(
    () =>
      getGitHubInstallUrl(
        "human-access-token",
        workspace.id,
        async () =>
          Response.json({
            installUrl: "https://attacker.example/collect",
          }),
      ),
    /valid GitHub installation URL/i,
  );
});

test("does not expose raw API or secret text in workspace errors", async () => {
  let message = "";
  try {
    await loadTeamWorkspaces(
      "human-access-token",
      async () =>
        Response.json(
          {
            error:
              "SUPABASE_SECRET_KEY=service-role-secret database.internal:5432",
          },
          { status: 500 },
        ),
    );
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }

  assert.match(message, /could not load workspaces/i);
  assert.doesNotMatch(message, /secret|database\.internal|5432/i);
});

test("team page renders the operational onboarding client", async () => {
  const page = await readFile(`${process.cwd()}/app/team/page.tsx`, "utf8");
  assert.match(page, /<TeamOnboarding\s*\/>/);
  assert.doesNotMatch(page, /AtlasPay|demo workspace|fake/i);
});

test("demo intake links to team onboarding", async () => {
  const page = await readFile(`${process.cwd()}/app/page.tsx`, "utf8");
  assert.match(page, /href="\/team"/);
  assert.match(page, />\s*Team setup\s*</);
});

test("setup sequence exposes the current step to assistive technology", async () => {
  const component = await readFile(
    `${process.cwd()}/components/team/TeamOnboarding.tsx`,
    "utf8",
  );
  assert.match(component, /aria-current=/);
});
