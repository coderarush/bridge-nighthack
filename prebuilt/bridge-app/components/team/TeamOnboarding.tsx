"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { createBrowserClient } from "@/lib/db/supabase";

export type TeamRequest = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

type AuthFailure = { message?: string } | null;

export interface TeamAuthClient {
  auth: {
    getSession(): Promise<{
      data: { session: Session | null };
      error: AuthFailure;
    }>;
    signOut(): Promise<{ error: AuthFailure }>;
    signInWithOtp(input: {
      email: string;
      options: { emailRedirectTo: string };
    }): Promise<{ error: AuthFailure }>;
  };
}

export interface TeamWorkspace {
  id: string;
  name: string;
  slug: string;
  status: "active" | "suspended" | "closed";
}

type AuthState =
  | { status: "loading" }
  | { status: "signed_out" }
  | { status: "signed_in"; session: Session }
  | { status: "error"; message: string };

type WorkspaceState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; workspaces: TeamWorkspace[] }
  | { status: "error"; message: string };

type MutationState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const slugPattern = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/;
const workspaceStatuses = new Set(["active", "suspended", "closed"]);

export function isHumanSession(
  session: Session | null,
): session is Session {
  return Boolean(
    session?.access_token &&
      session.user &&
      session.user.is_anonymous === false,
  );
}

export async function requestMagicLink(
  client: TeamAuthClient,
  email: string,
  origin: string,
): Promise<void> {
  const normalizedEmail = email.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new Error("Enter a valid work email.");
  }

  const current = await client.auth.getSession();
  if (current.error) {
    throw new Error("Bridge could not check the current sign-in.");
  }

  if (
    current.data.session &&
    current.data.session.user.is_anonymous !== false
  ) {
    const signedOut = await client.auth.signOut();
    if (signedOut.error) {
      throw new Error("Bridge could not replace the demo session.");
    }
  }

  const redirectOrigin = origin.replace(/\/+$/, "");
  const result = await client.auth.signInWithOtp({
    email: normalizedEmail,
    options: {
      emailRedirectTo: `${redirectOrigin}/team`,
    },
  });
  if (result.error) {
    throw new Error("Bridge could not send the sign-in link.");
  }
}

function workspaceError(status: number, action: "load" | "create" | "install") {
  if (status === 401) return "Your sign-in expired. Sign in again.";
  if (status === 403) return "You do not have access to this workspace.";
  if (status === 409 && action === "create") {
    return "That workspace slug is already in use.";
  }
  if (status === 429) return "Too many requests. Try again shortly.";
  if (action === "create" && (status === 400 || status === 422)) {
    return "Check the workspace name and slug.";
  }
  if (action === "load") return "Bridge could not load workspaces.";
  if (action === "create") return "Bridge could not create the workspace.";
  return "Bridge could not start GitHub installation.";
}

async function responsePayload(
  response: Response,
  action: "load" | "create" | "install",
): Promise<Record<string, unknown>> {
  if (!response.ok) {
    throw new Error(workspaceError(response.status, action));
  }
  const payload = await response.json().catch(() => null);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error(workspaceError(502, action));
  }
  return payload as Record<string, unknown>;
}

function parseWorkspace(value: unknown): TeamWorkspace {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Bridge received an invalid workspace response.");
  }
  const row = value as Record<string, unknown>;
  if (
    typeof row.id !== "string" ||
    !uuidPattern.test(row.id) ||
    typeof row.name !== "string" ||
    row.name.length < 1 ||
    row.name.length > 120 ||
    typeof row.slug !== "string" ||
    !slugPattern.test(row.slug) ||
    typeof row.status !== "string" ||
    !workspaceStatuses.has(row.status)
  ) {
    throw new Error("Bridge received an invalid workspace response.");
  }

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status as TeamWorkspace["status"],
  };
}

export async function loadTeamWorkspaces(
  accessToken: string,
  request: TeamRequest = fetch,
): Promise<TeamWorkspace[]> {
  const response = await request("/api/workspaces", {
    method: "GET",
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });
  const payload = await responsePayload(response, "load");
  if (!Array.isArray(payload.workspaces)) {
    throw new Error("Bridge received an invalid workspace response.");
  }
  return payload.workspaces.map(parseWorkspace);
}

export async function createTeamWorkspace(
  accessToken: string,
  input: { name: string; slug: string },
  request: TeamRequest = fetch,
): Promise<TeamWorkspace> {
  const name = input.name.trim();
  const slug = input.slug.trim().toLowerCase();
  if (
    name.length < 2 ||
    name.length > 80 ||
    !slugPattern.test(slug)
  ) {
    throw new Error("Check the workspace name and slug.");
  }

  const response = await request("/api/workspaces", {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ name, slug }),
  });
  const payload = await responsePayload(response, "create");
  return parseWorkspace(payload.workspace);
}

export async function getGitHubInstallUrl(
  accessToken: string,
  workspaceId: string,
  request: TeamRequest = fetch,
): Promise<string> {
  if (!uuidPattern.test(workspaceId)) {
    throw new Error("Workspace identity is invalid.");
  }
  const response = await request("/api/github/install", {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ workspaceId }),
  });
  const payload = await responsePayload(response, "install");
  if (typeof payload.installUrl !== "string") {
    throw new Error("Bridge did not return a valid GitHub installation URL.");
  }

  let installUrl: URL;
  try {
    installUrl = new URL(payload.installUrl);
  } catch {
    throw new Error("Bridge did not return a valid GitHub installation URL.");
  }
  if (
    installUrl.protocol !== "https:" ||
    installUrl.hostname !== "github.com" ||
    !installUrl.pathname.startsWith("/apps/")
  ) {
    throw new Error("Bridge did not return a valid GitHub installation URL.");
  }
  return installUrl.toString();
}

export function TeamOnboarding() {
  const supabase = useMemo(() => createBrowserClient(), []);
  const mountedRef = useRef(true);
  const sessionSubjectRef = useRef<string | null>(null);
  const sessionGenerationRef = useRef(0);
  const [authAttempt, setAuthAttempt] = useState(0);
  const [authState, setAuthState] =
    useState<AuthState>({ status: "loading" });
  const [workspaceState, setWorkspaceState] =
    useState<WorkspaceState>({ status: "idle" });
  const [workspaceRefresh, setWorkspaceRefresh] = useState(0);
  const [email, setEmail] = useState("");
  const [signInState, setSignInState] =
    useState<MutationState>({ status: "idle" });
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [createState, setCreateState] =
    useState<MutationState>({ status: "idle" });
  const [installState, setInstallState] = useState<
    MutationState & { workspaceId?: string }
  >({ status: "idle" });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      sessionGenerationRef.current += 1;
    };
  }, []);

  const applySession = useCallback((session: Session | null) => {
    const nextSubject = isHumanSession(session) ? session.user.id : null;
    if (sessionSubjectRef.current !== nextSubject) {
      sessionSubjectRef.current = nextSubject;
      sessionGenerationRef.current += 1;
      setWorkspaceState({ status: "idle" });
      setCreateState({ status: "idle" });
      setInstallState({ status: "idle" });
    }

    if (isHumanSession(session)) {
      setAuthState({ status: "signed_in", session });
    } else {
      setAuthState({ status: "signed_out" });
    }
  }, []);

  useEffect(() => {
    let active = true;
    setAuthState({ status: "loading" });

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) {
        setAuthState({
          status: "error",
          message: "Bridge could not check your team sign-in.",
        });
        return;
      }
      applySession(data.session);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) applySession(session);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [applySession, authAttempt, supabase]);

  const accessToken =
    authState.status === "signed_in"
      ? authState.session.access_token
      : null;

  useEffect(() => {
    if (!accessToken) return;
    let active = true;
    const expectedSubject = sessionSubjectRef.current;
    const expectedGeneration = sessionGenerationRef.current;
    const isCurrentSession = () =>
      active &&
      mountedRef.current &&
      sessionSubjectRef.current === expectedSubject &&
      sessionGenerationRef.current === expectedGeneration;
    setWorkspaceState({ status: "loading" });
    void loadTeamWorkspaces(accessToken).then(
      (workspaces) => {
        if (isCurrentSession()) {
          setWorkspaceState({ status: "ready", workspaces });
        }
      },
      (error) => {
        if (!isCurrentSession()) return;
        setWorkspaceState({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "Bridge could not load workspaces.",
        });
      },
    );
    return () => {
      active = false;
    };
  }, [accessToken, workspaceRefresh]);

  async function sendMagicLink() {
    setSignInState({ status: "loading" });
    try {
      await requestMagicLink(
        supabase as TeamAuthClient,
        email,
        window.location.origin,
      );
      setSignInState({
        status: "success",
        message: "Sign-in link sent. Check your email.",
      });
    } catch (error) {
      setSignInState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Bridge could not send the sign-in link.",
      });
    }
  }

  async function signOut() {
    const result = await supabase.auth.signOut();
    if (result.error) {
      setAuthState({
        status: "error",
        message: "Bridge could not sign out.",
      });
    }
  }

  async function createWorkspace() {
    if (!accessToken) return;
    const expectedSubject = sessionSubjectRef.current;
    const expectedGeneration = sessionGenerationRef.current;
    const isCurrentSession = () =>
      mountedRef.current &&
      sessionSubjectRef.current === expectedSubject &&
      sessionGenerationRef.current === expectedGeneration;
    setCreateState({ status: "loading" });
    try {
      const workspace = await createTeamWorkspace(
        accessToken,
        { name, slug },
      );
      if (!isCurrentSession()) return;
      setWorkspaceState((current) =>
        current.status === "ready"
          ? {
              status: "ready",
              workspaces: [...current.workspaces, workspace],
            }
          : { status: "ready", workspaces: [workspace] },
      );
      setName("");
      setSlug("");
      setCreateState({
        status: "success",
        message: "Workspace created.",
      });
    } catch (error) {
      if (!isCurrentSession()) return;
      setCreateState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Bridge could not create the workspace.",
      });
    }
  }

  async function installGitHub(workspaceId: string) {
    if (!accessToken) return;
    const expectedSubject = sessionSubjectRef.current;
    const expectedGeneration = sessionGenerationRef.current;
    const isCurrentSession = () =>
      mountedRef.current &&
      sessionSubjectRef.current === expectedSubject &&
      sessionGenerationRef.current === expectedGeneration;
    setInstallState({ status: "loading", workspaceId });
    try {
      const installUrl = await getGitHubInstallUrl(
        accessToken,
        workspaceId,
      );
      if (!isCurrentSession()) return;
      window.location.href = installUrl;
    } catch (error) {
      if (!isCurrentSession()) return;
      setInstallState({
        status: "error",
        workspaceId,
        message:
          error instanceof Error
            ? error.message
            : "Bridge could not start GitHub installation.",
      });
    }
  }

  const workspaces =
    workspaceState.status === "ready" ? workspaceState.workspaces : [];
  const hasWorkspace = workspaces.length > 0;

  return (
    <main className="team-shell">
      <header className="app-header">
        <Link className="brand-lockup" href="/" aria-label="Bridge home">
          <span className="brand-mark" aria-hidden="true">
            <span />
          </span>
          <span>bridge</span>
        </Link>
        <div className="header-context">
          <span className="context-label">Team setup</span>
          <span className="environment-indicator">
            <span aria-hidden="true" />
            Workspace control
          </span>
        </div>
      </header>

      <div className="team-layout">
        <aside className="team-rail" aria-labelledby="setup-sequence-title">
          <p className="section-eyebrow">Configuration</p>
          <h2 id="setup-sequence-title">Setup sequence</h2>
          <ol className="team-steps">
            <li
              className={
                authState.status === "signed_in"
                  ? "is-complete"
                  : "is-current"
              }
              aria-current={
                authState.status === "signed_in" ? undefined : "step"
              }
            >
              <span className="mono">01</span>
              <strong>Team identity</strong>
            </li>
            <li
              className={
                hasWorkspace
                  ? "is-complete"
                  : authState.status === "signed_in"
                    ? "is-current"
                    : ""
              }
              aria-current={
                !hasWorkspace && authState.status === "signed_in"
                  ? "step"
                  : undefined
              }
            >
              <span className="mono">02</span>
              <strong>Workspace</strong>
            </li>
            <li
              className={hasWorkspace ? "is-current" : ""}
              aria-current={hasWorkspace ? "step" : undefined}
            >
              <span className="mono">03</span>
              <strong>GitHub App</strong>
            </li>
          </ol>
        </aside>

        <div className="team-content">
          <div className="team-page-heading">
            <div>
              <p className="section-eyebrow">Administration</p>
              <h1>Team onboarding</h1>
            </div>
            {authState.status === "signed_in" ? (
              <div className="team-session">
                <span>
                  Signed in
                  <strong>{authState.session.user.email ?? "Team member"}</strong>
                </span>
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => void signOut()}
                >
                  Sign out
                </button>
              </div>
            ) : null}
          </div>

          {authState.status === "loading" ? (
            <div className="team-state" role="status">
              Checking team sign-in...
            </div>
          ) : authState.status === "error" ? (
            <div className="team-state" role="alert">
              <strong>Sign-in unavailable</strong>
              <span>{authState.message}</span>
              <button
                type="button"
                className="btn secondary"
                onClick={() => setAuthAttempt((current) => current + 1)}
              >
                Retry
              </button>
            </div>
          ) : authState.status === "signed_out" ? (
            <section
              className="team-auth-section"
              aria-labelledby="team-sign-in-title"
            >
              <div className="team-section-heading">
                <div>
                  <p className="section-eyebrow">Team identity required</p>
                  <h2 id="team-sign-in-title">Sign in by email</h2>
                </div>
                <span className="team-section-status">Not signed in</span>
              </div>
              <form
                className="team-auth-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void sendMagicLink();
                }}
              >
                <div className="team-field">
                  <label htmlFor="team-email">Work email</label>
                  <input
                    id="team-email"
                    type="email"
                    value={email}
                    onChange={(event) => {
                      setEmail(event.target.value);
                      if (signInState.status !== "idle") {
                        setSignInState({ status: "idle" });
                      }
                    }}
                    autoComplete="email"
                    required
                    maxLength={254}
                  />
                </div>
                <button
                  type="submit"
                  className="btn"
                  disabled={signInState.status === "loading"}
                  aria-busy={signInState.status === "loading"}
                >
                  {signInState.status === "loading"
                    ? "Sending..."
                    : "Email sign-in link"}
                </button>
              </form>
              {signInState.status === "error" ||
              signInState.status === "success" ? (
                <p
                  className={`team-message team-message-${signInState.status}`}
                  role={signInState.status === "error" ? "alert" : "status"}
                >
                  {signInState.message}
                </p>
              ) : null}
            </section>
          ) : (
            <>
              <section
                className="team-workspaces-section"
                aria-labelledby="team-workspaces-title"
              >
                <div className="team-section-heading">
                  <div>
                    <p className="section-eyebrow">Organization boundary</p>
                    <h2 id="team-workspaces-title">Workspaces</h2>
                  </div>
                  <span className="team-section-status">
                    {workspaceState.status === "ready"
                      ? `${workspaces.length} total`
                      : workspaceState.status}
                  </span>
                </div>

                {workspaceState.status === "loading" ||
                workspaceState.status === "idle" ? (
                  <div className="team-state" role="status">
                    Loading workspaces...
                  </div>
                ) : workspaceState.status === "error" ? (
                  <div className="team-state" role="alert">
                    <strong>Workspace list unavailable</strong>
                    <span>{workspaceState.message}</span>
                    <button
                      type="button"
                      className="btn secondary"
                      onClick={() =>
                        setWorkspaceRefresh((current) => current + 1)
                      }
                    >
                      Retry
                    </button>
                  </div>
                ) : workspaces.length === 0 ? (
                  <div className="team-empty-state">
                    <strong>No workspaces</strong>
                    <span>Create the first workspace below.</span>
                  </div>
                ) : (
                  <div className="team-workspace-list">
                    {workspaces.map((workspace) => {
                      const installing =
                        installState.status === "loading" &&
                        installState.workspaceId === workspace.id;
                      const installError =
                        installState.status === "error" &&
                        installState.workspaceId === workspace.id
                          ? installState.message
                          : null;
                      return (
                        <article
                          className="team-workspace-row"
                          key={workspace.id}
                        >
                          <div className="team-workspace-name">
                            <strong>{workspace.name}</strong>
                            <code>{workspace.slug}</code>
                          </div>
                          <span
                            className={`team-status team-status-${workspace.status}`}
                          >
                            {workspace.status}
                          </span>
                          <div className="team-workspace-action">
                            {workspace.status === "active" ? (
                              <button
                                type="button"
                                className="btn secondary"
                                onClick={() =>
                                  void installGitHub(workspace.id)
                                }
                                disabled={installing}
                                aria-busy={installing}
                              >
                                {installing
                                  ? "Opening GitHub..."
                                  : "Install GitHub App"}
                              </button>
                            ) : (
                              <span>GitHub setup unavailable</span>
                            )}
                            {installError ? (
                              <span role="alert">{installError}</span>
                            ) : null}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>

              <section
                className="team-create-section"
                aria-labelledby="create-workspace-title"
              >
                <div className="team-section-heading">
                  <div>
                    <p className="section-eyebrow">New boundary</p>
                    <h2 id="create-workspace-title">Create workspace</h2>
                  </div>
                </div>
                <form
                  className="team-create-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void createWorkspace();
                  }}
                >
                  <div className="team-field">
                    <label htmlFor="workspace-name">Workspace name</label>
                    <input
                      id="workspace-name"
                      value={name}
                      onChange={(event) => {
                        setName(event.target.value);
                        if (createState.status !== "idle") {
                          setCreateState({ status: "idle" });
                        }
                      }}
                      autoComplete="organization"
                      required
                      minLength={2}
                      maxLength={80}
                    />
                  </div>
                  <div className="team-field">
                    <label htmlFor="workspace-slug">Workspace slug</label>
                    <input
                      id="workspace-slug"
                      className="mono"
                      value={slug}
                      onChange={(event) => {
                        setSlug(event.target.value.toLowerCase());
                        if (createState.status !== "idle") {
                          setCreateState({ status: "idle" });
                        }
                      }}
                      autoComplete="off"
                      required
                      minLength={3}
                      maxLength={64}
                      pattern="[a-z0-9][a-z0-9-]{1,62}[a-z0-9]"
                    />
                  </div>
                  <button
                    type="submit"
                    className="btn"
                    disabled={createState.status === "loading"}
                    aria-busy={createState.status === "loading"}
                  >
                    {createState.status === "loading"
                      ? "Creating..."
                      : "Create workspace"}
                  </button>
                </form>
                {createState.status === "error" ||
                createState.status === "success" ? (
                  <p
                    className={`team-message team-message-${createState.status}`}
                    role={createState.status === "error" ? "alert" : "status"}
                  >
                    {createState.message}
                  </p>
                ) : null}
              </section>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
