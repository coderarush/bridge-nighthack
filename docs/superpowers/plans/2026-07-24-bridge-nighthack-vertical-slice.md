# Bridge NightHack Vertical Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a public, authenticated AtlasPay v1-to-v2 migration system that finds three impacted TypeScript files, opens a real draft PR, verifies CI for the exact commit SHA, and synchronizes provider/customer review in a live room.

**Architecture:** Keep the existing Next.js App Router application and deterministic AtlasPay recipe. Supabase Auth creates real anonymous demo sessions with persisted role-bearing participant profiles; RLS protects browser reads while service-role server routes validate the caller before orchestrating persistence and backend-only GitHub mutations. The browser subscribes to one Supabase Realtime room and refetches authoritative state after broadcasts. No LLM, generalized patch generator, billing, marketing site, or fake external evidence enters the critical path.

**Tech Stack:** Next.js, React, TypeScript, Supabase Postgres/Realtime, Octokit, GitHub Actions, Vercel, Node test runner.

## Global Constraints

- The canonical public production URL is `https://bridge-nighthack.vercel.app`; the temporary `bridge-app-zeta` alias was removed.
- The only customer repository is `coderarush/atlas-store-demo`, based on `demo-base`.
- The only transform is `payment_method` to `payment_method_id` in three guarded AtlasPay request objects.
- Strings, comments, identifiers, formatting, and `src/util/logging.ts` must not change.
- GitHub credentials remain server-only; the app creates draft pull requests and never merges.
- `ready_for_review` requires a real GitHub success conclusion for the exact stored commit SHA.
- Invalid IDs, missing configuration, database errors, and GitHub failures must never render seeded or fabricated success.
- Every mutating stage is idempotent and appends an audit event.
- Every browser has a real Supabase user ID; provider/customer roles are persisted and enforced.
- Browser credentials can read only the demo room data allowed by RLS and cannot mutate core migration state directly.
- Production remains usable after refresh and at 1440x900, 1280x720, and 390x844.

---

### Task 1: Security Baseline And Test Harness

**Files:**
- Modify: `prebuilt/bridge-app/package.json`
- Modify: `prebuilt/bridge-app/package-lock.json`
- Modify: `prebuilt/bridge-app/.gitignore`
- Delete: `prebuilt/bridge-app/tsconfig.tsbuildinfo`

**Interfaces:**
- Produces: reproducible `npm ci`, `npm test`, and `npm run build` gates on macOS and Vercel.

- [ ] Run `npm audit --json` and identify the patched Next.js release compatible with the current React/Next 14 application.
- [ ] Update only the vulnerable direct/transitive packages required to remove high/critical production findings.
- [ ] Ignore `tsconfig.tsbuildinfo` and remove the tracked generated file.
- [ ] Run `npm ci`, `npm audit --omit=dev`, `npm test`, and `npm run build`.
- [ ] Commit as `chore: harden Bridge build baseline`.

### Task 2: Supabase Authentication, Profiles, And RLS

**Files:**
- Create: `prebuilt/bridge-app/supabase/migrations/0002_auth_and_rls.sql`
- Create: `prebuilt/bridge-app/lib/auth/session.ts`
- Create: `prebuilt/bridge-app/lib/auth/__tests__/session.test.ts`
- Create: `prebuilt/bridge-app/components/AuthBootstrap.tsx`
- Modify: `prebuilt/bridge-app/app/layout.tsx`
- Modify: `prebuilt/bridge-app/lib/db/supabase.ts`
- Modify: every mutating route under `prebuilt/bridge-app/app/api/runs/`

**Interfaces:**
- Produces: `requireParticipant(req): Promise<{ userId: string; name: string; role: "provider" | "customer" }>` returning 401/403 on invalid sessions or roles.
- Produces: `AuthBootstrap` that creates or restores one anonymous Supabase session and persists the selected demo identity.
- Produces: `participants(user_id, display_name, role, created_at)` and RLS policies tied to `auth.uid()`.

- [ ] Write failing tests for absent authorization, invalid bearer tokens, allowed customer actions, provider-only approval, and server-only migration execution.
- [ ] Add participant profiles keyed to `auth.users`, constrain the two demo roles, enable RLS on all public tables, and grant browser reads without granting direct core-state mutation.
- [ ] Create browser, authenticated-server, and service-role clients as distinct APIs; remove the publishable-key fallback from the service client.
- [ ] Bootstrap anonymous auth once, persist a display name/role, and expose loading/error/retry states without hard-coded user identity.
- [ ] Require valid sessions for comments/approvals and an operator role or server-side demo capability for start/advance/validate/reset.
- [ ] Enable anonymous sign-ins in the Supabase project, apply migrations, and verify anonymous REST writes to protected tables fail.
- [ ] Run focused auth tests, full tests, production build, and an RLS smoke test.
- [ ] Commit as `feat: add authenticated demo identities`.

### Task 3: Honest Room Reads And Demo State

**Files:**
- Create: `prebuilt/bridge-app/lib/db/__tests__/room-result.test.ts`
- Modify: `prebuilt/bridge-app/lib/db/queries.ts`
- Modify: `prebuilt/bridge-app/app/room/[runId]/page.tsx`
- Create: `prebuilt/bridge-app/app/room/[runId]/error.tsx`
- Create: `prebuilt/bridge-app/app/room/[runId]/not-found.tsx`

**Interfaces:**
- Produces: `getRoom(runId): Promise<RoomAggregate | null>` where `null` means the row does not exist and operational failures throw.
- Consumes: `notFound()` from Next.js for unknown run IDs.

- [ ] Write a failing test proving an unknown configured run returns `null`, not `seedRoom`.
- [ ] Write a failing test proving a database failure is surfaced, not converted into a successful seed.
- [ ] Change `getRoom` so seed data is used only when Supabase is entirely unconfigured in local development.
- [ ] Make the room route call `notFound()` for `null` and render a direct retry message for operational errors.
- [ ] Remove fake commit, PR, and CI evidence from the hosted seed row until real evidence exists.
- [ ] Run the focused tests, full tests, and production build.
- [ ] Commit as `fix: remove fake room success fallbacks`.

### Task 4: Idempotent Migration Orchestration

**Files:**
- Create: `prebuilt/bridge-app/lib/orchestrator/run-guards.ts`
- Create: `prebuilt/bridge-app/lib/orchestrator/__tests__/run-guards.test.ts`
- Modify: `prebuilt/bridge-app/app/api/runs/start/route.ts`
- Modify: `prebuilt/bridge-app/app/api/runs/[runId]/advance/route.ts`
- Modify: `prebuilt/bridge-app/app/api/runs/[runId]/validate/route.ts`
- Modify: `prebuilt/bridge-app/lib/db/queries.ts`

**Interfaces:**
- Produces: `requireDemoRepositoryConfig(): RepositoryRef`.
- Produces: `classifyAdvance(run): "execute" | "already_running" | "complete" | "retryable"`.
- Produces: structured API errors `{ error: string, code: string, retryable: boolean }`.

- [ ] Write failing tests for missing owner configuration, repeat advance while validating, repeat advance after success, and exact-SHA readiness.
- [ ] Validate repository configuration before inserting a run.
- [ ] Load the run before mutation and return its existing evidence for validating/completed states.
- [ ] Acquire and release the existing expiring run lock fields; reject concurrent execution with HTTP 409.
- [ ] Wrap each external stage so failures persist the matching failure state, code, message, and audit event.
- [ ] Refuse zero impacts, zero patched files, or a preview/commit file-set mismatch.
- [ ] Keep validation bound to the stored commit SHA and make repeated success polling event-idempotent.
- [ ] Run focused tests, full tests, typecheck/build, and the patch preview.
- [ ] Commit as `fix: make migration runs fail closed`.

### Task 5: Realtime Migration Room

**Files:**
- Create: `prebuilt/bridge-app/lib/realtime/room-channel.ts`
- Create: `prebuilt/bridge-app/lib/realtime/__tests__/room-channel.test.ts`
- Modify: `prebuilt/bridge-app/components/RoomSidebar.tsx`
- Modify: `prebuilt/bridge-app/app/api/runs/[runId]/comments/route.ts`
- Modify: `prebuilt/bridge-app/app/api/runs/[runId]/approve/route.ts`

**Interfaces:**
- Produces: `roomTopic(runId): string` returning `migration-run:<runId>`.
- Produces: one client channel with Presence keys and `room.updated` broadcasts.
- Consumes: persisted comments/approvals as the authority, followed by `router.refresh()`.

- [ ] Write a failing test for the exact topic and accepted update event.
- [ ] Subscribe once per room, track one generated browser identity, and cleanly unsubscribe.
- [ ] Track authenticated customer/provider identities and render only currently tracked participants.
- [ ] Broadcast after persisted comment and approval writes; receiving clients refresh authoritative data.
- [ ] Replace the five-second poll with Realtime and retain a slower recovery poll only while disconnected.
- [ ] Add disabled, success, and direct error states for comment and approval actions.
- [ ] Run focused tests, full tests, and production build.
- [ ] Commit as `feat: add realtime migration collaboration`.

### Task 6: Demo-Focused Product UI

**Files:**
- Modify: `prebuilt/bridge-app/app/globals.css`
- Modify: `prebuilt/bridge-app/app/page.tsx` only as the product intake, not as a marketing site
- Modify: `prebuilt/bridge-app/app/change/[changeId]/page.tsx`
- Modify: `prebuilt/bridge-app/app/room/[runId]/page.tsx`
- Modify: `prebuilt/bridge-app/components/Timeline.tsx`
- Modify: `prebuilt/bridge-app/components/ImpactedFiles.tsx`
- Modify: `prebuilt/bridge-app/components/EvidencePanel.tsx`
- Modify: `prebuilt/bridge-app/components/RunDriver.tsx`
- Add: `prebuilt/bridge-app/public/bridge-brand.png`

**Interfaces:**
- Produces: one intake screen and one stable migration-room workspace with timeline, impact, patch plan, evidence, and collaboration.

- [ ] Use the packet's near-black, cool-gray, electric-blue, success, and failure tokens with a compact work-tool layout.
- [ ] Make the first screen the usable AtlasPay change intake; do not build a marketing site or add fake customers, metrics, or claims.
- [ ] Show `3 verified` plus visible false-positive exclusion evidence.
- [ ] Show bounded plan and three-line diff without automatic tab switching.
- [ ] Make draft PR, commit SHA, exact-SHA CI, retry, and final approval states legible at stage zoom.
- [ ] Add restrained under-350 ms state motion, focus-visible styles, reduced-motion support, and responsive single-column behavior.
- [ ] Verify screenshots at 1440x900, 1280x720, and 390x844 with no overlaps or hidden evidence.
- [ ] Run tests and production build.
- [ ] Commit as `feat: polish the Bridge demo room`.

### Task 7: Demo Operations, Reset, And Recovery

**Files:**
- Create: `prebuilt/bridge-app/app/api/demo/reset/route.ts`
- Create: `prebuilt/bridge-app/lib/demo/reset.ts`
- Create: `prebuilt/bridge-app/lib/demo/__tests__/reset.test.ts`
- Create: `prebuilt/bridge-app/app/ops/page.tsx`
- Modify: `DEMO_RUN_CARD.txt`
- Modify: `09_DEMO_SCRIPT_AND_RUNBOOK.md`
- Modify: `13_RISK_REGISTER_AND_FALLBACKS.md`
- Modify: `17_FINAL_SUBMISSION_CHECKLIST.md`

**Interfaces:**
- Produces: authenticated `POST /api/demo/reset` that creates a fresh attempt without deleting audit history or merging/closing GitHub artifacts.
- Produces: private operator view with environment readiness, current run, public links, reset, and recovery status.

- [ ] Write failing tests proving reset increments attempt, preserves prior runs/events, and refuses non-operator callers.
- [ ] Implement reset as a new migration attempt against pristine `demo-base`; never rewrite or fabricate prior evidence.
- [ ] Add operator readiness checks for Supabase, GitHub configuration, fixture file count, workflow visibility, and production URL.
- [ ] Add retry controls for retryable failure states and direct recovery guidance for non-retryable failures.
- [ ] Update the run card, demo script, risk register, and submission checklist to match the actual state machine and 7:39 PM starting tag.
- [ ] Capture a real completed backup room, PR, check-run URL, and screen recording after end-to-end validation.
- [ ] Run focused tests, full tests, and production build.
- [ ] Commit as `feat: add demo reset and recovery operations`.

### Task 8: Live GitHub Proof And Production Release

**Files:**
- Modify only if verification exposes a defect in Tasks 1-5.

**Interfaces:**
- Consumes: repository-scoped `GITHUB_TOKEN`, production environment, and the public fixture repository.
- Produces: one real draft PR, exact commit SHA, passing Actions URL, and completed room URL.

- [ ] Add the fine-grained token to Vercel production without printing or committing it.
- [ ] Deploy the exact committed source to production and verify `/api/health`.
- [ ] Create a fresh migration through the public UI and execute it once.
- [ ] Inspect the PR diff: exactly three intended key renames and no other source changes.
- [ ] Verify GitHub Actions success belongs to the stored commit SHA.
- [ ] Verify two browsers exchange presence, a persisted comment, and final provider approval.
- [ ] Refresh both browsers and confirm the room remains correct.
- [ ] Run two complete rehearsals from a reset base, recording the completed room and backup PR.
- [ ] Commit any verification fixes separately, rerun all gates, and redeploy.

### Task 9: Post-Event Architecture Roadmap

**Files:**
- Modify: `15_POST_HACKATHON_ROADMAP.md`
- Create: `docs/architecture/production-evolution.md`

**Interfaces:**
- Produces: a sequenced path from the controlled demo to multi-provider production without pretending unbuilt work exists.

- [ ] Reconcile the roadmap with the implemented auth, RLS, orchestration, realtime, and operator systems.
- [ ] Define the 72-hour reliability work: GitHub App migration, transactional stage RPCs, durable jobs, observability, secret rotation, abuse controls, and incident runbooks.
- [ ] Define the 30-day product work: provider onboarding, repository installation, contract ingestion, migration recipe SDK, required-check policies, and tenant isolation.
- [ ] Define the 90-day platform work: recipe evaluation corpus, language adapters, enterprise controls, billing boundaries, and SLOs.
- [ ] Attach measurable exit criteria, owners by role, dependencies, and explicit non-goals to every phase.
- [ ] Self-review for claims that confuse roadmap items with shipped functionality.
- [ ] Commit as `docs: align Bridge post-event roadmap`.
