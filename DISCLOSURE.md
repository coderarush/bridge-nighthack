# Pre-existing Work Disclosure - Bridge (NightHack)

Founders Inc permits existing code, libraries, APIs, models, datasets, infrastructure, templates, and hardware when they are disclosed and a starting commit or tag is saved. Judges should evaluate only the work after that starting point.

This product has a substantial pre-existing base. That is not a minor footnote: the deterministic migration fixture and the initial app scaffold were built before the tagged baseline and are not claimed as NightHack work.

## Exact baseline

- **Tag:** `nighthack-start`
- **Tag target:** `24f10d78725b3f7611e9575eeb6a4c4858ef6a3c`
- **Tag/commit time:** July 24, 2026, **7:40:03 PM PDT**
- **Annotated tag message:** "NightHack starting state (recorded 2026-07-24 19:39 PDT)"

The 7:39 PM annotation identifies the recorded starting state. The actual tag object and target commit are timestamped 7:40:03 PM PDT. This document does not claim a 7:00 PM baseline.

## Before the baseline (not judged)

Everything already present at `nighthack-start` was pre-existing, including:

- The Bridge Next.js scaffold, marketing page, change intake, and initial migration-room UI.
- The controlled fictional AtlasPay v1/v2 OpenAPI fixture and AtlasStore TypeScript fixture repository.
- The deterministic AtlasPay rename patcher, impact scanner, controlled OpenAPI diff, and their pre-existing unit tests.
- The original Supabase schema/data-layer foundation, adapter interfaces, and initial API-route structure.
- The original GitHub adapter shape, fixture CI configuration, deployment/project setup, and third-party dependencies.

These assets were intended to make a narrow demo feasible. They are not represented as work completed after the tag.

## During the build window (judged)

The preserved live evidence boundary is the diff from `nighthack-start` (`24f10d7`) through `3407bf9`: 69 changed files, 9,910 additions, and 540 deletions. The current application boundary is `21fa19c`: 147 changed files, 26,191 additions, and 1,040 deletions. A later documentation-only packet commit does not change that application tree.

- Removed seeded/fake-success room fallbacks and added explicit loading, not-found, failure, retry, and evidence states.
- Built authenticated operator/provider/customer sessions using private invite capabilities, participant roles, and row-level security.
- Wired the migration stages to persisted Supabase state and the GitHub fixture: guarded scan, deterministic patch, branch/commit, draft PR, and exact-SHA Actions polling.
- Added live room presence, persisted comments and approvals, audit events, and provider-only approval enforcement.
- Added reset/recovery controls, run locks, idempotency guards, active-run deduplication, and schema migrations supporting those controls.
- Added exact-PR-head waiting so validation does not accept a check for a stale PR commit.
- Rechecks the live PR head on every authenticated ready-room read and immediately before approval. A mismatch, incomplete chain, or unavailable GitHub read fails closed in the response and UI; ordinary room reads do not mutate the preserved run.
- Removed a hardcoded excluded-look-alike total from the product UI. The room now counts only persisted scanner matches and describes the AST guard without inventing scan evidence.
- Scoped provider/customer access to explicit run memberships in both RLS and the Next.js API while preserving an intentional operator bypass.
- Made GitHub retries reuse an unchanged branch head instead of creating another empty commit.
- Added fragment-based capability handoff so new invite values are not sent in the initial HTTP request; legacy query links remain compatible.
- Added and applied the production data model for workspaces, memberships, GitHub App installations, provider connections, recipes, durable jobs, attempts, and audit logs.
- Added deterministic, bounded repository-tree discovery to the later source path. It enumerates TypeScript sources from the GitHub tree, fetches immutable blobs, and fails closed on truncation, invalid metadata, binary content, or unexpected impact shape. Read-only verification enumerated seven fixture TypeScript sources and found the same three guarded impacts, but the preserved `3407bf9` run predates this path and scanned four explicit recipe files.
- Added fenced, expiring durable-job leases, stale-worker rejection, deterministic capped retry scheduling, structured terminal failures, a replaceable job-store boundary, and persistent service RPCs. The controlled demo route does not use this coordinator, and no worker deployment is claimed.
- Added and deployed a workspace creation API/UI and secure GitHub App setup/callback routes backed by forward migrations `0009` and `0010`. Production proved human sign-in, workspace creation/read through RLS, atomic audit creation, anonymous rejection, and generation of the state-bound GitHub installation URL. GitHub's external consent and OAuth callback were not completed end to end.
- Added tests for authentication, database queries, GitHub check/head selection, dynamic source discovery, run guards, reset/idempotency, realtime behavior, workspace creation, GitHub App onboarding, durable jobs, and production migration behavior; substantially rebuilt the product UI for the live flow.

The commits through the preserved evidence source are `1b7a145`, `2a5c69b`, `f4d0a87`, `3cfdd5b`, `aeece7d`, `dd9ee24`, `e406b10`, `c03b439`, `5508480`, and `3407bf9`. The subsequent application commits are `8f1acb4`, `c47cf1f`, `37202ea`, `9c58324`, `dce3d1d`, `4225ed4`, `5bdb64c`, `d67ce94`, and `21fa19c`. Packet-only documentation commits `368efbc` and `505ed25` sit between the last two application commits and do not alter the deployed app tree.

### Test-scope clarification

The regular-expression migration tests assert that expected tables, functions, policies, grants, and revocations remain present. That is **migration-shape coverage**, not database execution proof.

The final application test snapshot discovered 219 Node tests: 218 passed and one Docker-only test was skipped because Docker Desktop's storage became unavailable. The complete `0001` through `0010` chain then executed in PGlite with tenant/RLS assertions and an injected audit failure proving atomic GitHub-onboarding rollback. Production Supabase accepted `0006` through `0010`, and a live human identity proved workspace creation/read, audit persistence, anonymous denial, and the GitHub pre-install handshake. This does not prove the external GitHub consent/callback, lifecycle reconciliation, or a deployed worker.

The fixture PR retains one empty same-tree child commit created by a repeat run before the no-op retry fix. The actual patch is in its parent. The final deployed rerun exercised the fix and created no additional commit.

## What this disclosure does not claim

- It does **not** claim that the preserved demo run graph is workspace-scoped, that the external GitHub consent/callback completed, or that repository lifecycle changes are reconciled. The production migrations and pre-install routes are live, but those remaining boundaries are not.
- It does **not** claim that recursive discovery, the durable-job coordinator, or a deployed worker produced the preserved live run. Discovery remains bounded to TypeScript and the controlled fictional AtlasPay recipe.
- It does **not** claim an unlisted recording until that value is added to `SUBMISSION.md`.
- It does **not** claim support beyond the controlled AtlasPay request-property migration, TypeScript fixture, draft PR workflow, and human review.
- Bridge never claims to merge customer code automatically.

## Honest evidence rule

For a live migration, the draft PR, the SHA in Bridge, and the GitHub Actions/check result must all refer to the same commit. If a prior completed run is used as a recovery artifact, we say: "This is the completed run from the same deployed workflow." We do not label a queued, failed, or unverified external action as successful.

Judges can inspect the public before-versus-during boundary:

```bash
git show nighthack-start
git diff nighthack-start..21fa19c
```
