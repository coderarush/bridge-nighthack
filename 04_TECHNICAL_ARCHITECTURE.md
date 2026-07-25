# Technical Architecture

> This document records the controlled demo architecture. The later workspace,
> GitHub App, and durable-job boundaries are documented in
> `18_PRODUCTION_ARCHITECTURE_AND_JUDGE_QA.md`.

## Architecture principle

**Deterministic first, agent second.** The critical migration path must be inspectable and reproducible. An LLM may summarize the change or explain evidence, but it must not be the only mechanism responsible for the patch.

## Recommended NightHack stack

- **Frontend/server:** Next.js with TypeScript.
- **Deployment:** Vercel or another production platform already understood by the team.
- **Database/auth/realtime:** Supabase Postgres, Auth or demo identities, and Realtime Presence/Broadcast.
- **Source control integration:** the preserved demo uses a backend-only
  **fine-grained Personal Access Token** scoped to the single fixture repo
  (Contents R/W, Pull requests R/W, Actions Read, Checks Read). The later
  application release adds a registered least-privilege GitHub App and a live
  pre-install handshake, but external callback and installation-token execution
  are not yet verified end to end.
- **Change detector:** `oasdiff`, `openapi-diff`, or a controlled parser for the single AtlasPay change.
- **Impact scanner:** TypeScript AST where fast; otherwise a constrained structural search with exact key validation.
- **Patch engine:** deterministic AST transform or narrowly guarded text transform.
- **Validation:** GitHub Actions and check/workflow polling.
- **Optional AI:** one server-side model call for human-readable migration explanation, never required for success.

## System components

### Web application

Responsibilities:

- Render change intake and migration room.
- Subscribe to room presence and status updates.
- Send commands to server routes.
- Never receive the GitHub token or any server secret.

### Orchestrator

A server-side stage runner that:

1. acquires a run lock,
2. verifies current state,
3. executes one stage,
4. writes outputs and an event,
5. transitions state,
6. broadcasts the update.

The preserved demo uses a database-backed stage lock plus idempotent routes. The
later release also implements fenced durable-job storage/coordinator primitives;
no deployed worker uses them yet.

### Provider change adapter

Input:

- old spec URL,
- new spec URL,
- provider metadata.

Output:

- normalized operations,
- breaking-change records,
- migration hints.

### Repository adapter

Responsibilities:

- authenticate with the backend PAT (`@octokit/rest`),
- fetch repo metadata and file contents,
- create branch,
- write blobs/commits or update files,
- create draft PR,
- fetch check/workflow status.

### Impact scanner

For the AtlasPay demo, scope the scan to `src/**/*.ts` and `src/**/*.tsx`. Verify each match is an object-property key in a call that belongs to the AtlasPay integration. Save evidence snippets before patching.

### Patch engine

Preferred:

- parse TypeScript,
- find targeted property assignments,
- rename the key,
- print the modified source,
- preserve unrelated formatting as much as practical.

Fallback:

- exact replacement only inside preselected files and only when a guard proves the line contains the AtlasPay request object.

### Validation adapter

- Capture migration commit SHA.
- **Poll** the GitHub check-runs / workflow-runs API for that exact SHA with capped
  backoff. **No webhook** — polling needs no public endpoint, no signature
  verification, no delivery dedup, and it makes a better demo ("watch it go green").
- Accept success only for the migration commit SHA.
- Store external run URL and conclusion.

### Realtime room

Use Presence for participants and Broadcast or database changes for comments/status. Persist comments and approvals in Postgres; presence can remain ephemeral.

## GitHub token permissions

Use a **fine-grained PAT** limited to the single demo repository, least privilege:

- Metadata: read.
- Contents: read/write (fetch files, create branch/commit).
- Pull requests: read/write (open the draft PR).
- Actions: read (poll workflow runs).
- Checks: read (poll check runs for the exact SHA).

The preserved demo uses polling and no webhook. The token lives only in
server-side env and is never sent to the browser. Archive the evidence before
rotating it. The registered GitHub App must not be presented as lifecycle-ready
until its webhook route is deployed and verified.

## Request flow

1. Browser posts `start migration`.
2. Server creates run and returns run ID.
3. Stage runner analyzes the specs.
4. Stage runner scans selected repository files.
5. Stage runner saves plan and waits for approval, or auto-approves in demo mode with a visible actor.
6. Stage runner creates branch and commit.
7. Stage runner opens draft PR.
8. Validation adapter tracks CI for exact SHA.
9. On success, run becomes `ready_for_review`.
10. Every stage persists an event and broadcasts an update.

## Reliability requirements

- Unique constraint on `(provider_change_id, repository_id, attempt)`.
- Idempotency key on branch and PR creation.
- Run lock with expiry to prevent duplicate workers.
- Store external IDs immediately after creation.
- Never retry a write blindly after an unknown network result; first query GitHub by branch/PR marker.
- Limit file size and total scanned bytes.
- Sanitize snippets displayed in UI.

## Suggested repository structure

```text
app/
  change/[changeId]/page.tsx
  room/[runId]/page.tsx
  api/runs/start/route.ts
  api/runs/[runId]/advance/route.ts
  api/runs/[runId]/validate/route.ts   # polls check-runs for the exact SHA
components/
  change-summary.tsx
  migration-timeline.tsx
  impacted-files.tsx
  evidence-panel.tsx
  presence-stack.tsx
lib/
  github/
  openapi/
  scanner/
  patcher/
  validation/
  realtime/
  db/
  state-machine/
supabase/migrations/
fixtures/
```

## Production-vs-demo seams

Define interfaces for `ChangeDetector`, `RepositoryClient`, `PatchEngine`, and `ValidationClient`. The demo can use one implementation per interface without spreading AtlasPay-specific logic across the UI. This makes fallbacks possible and prevents the hack from becoming unmaintainable.
