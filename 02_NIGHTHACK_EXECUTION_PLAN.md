# NightHack Execution Plan

## Operating principle

The build window is **4 hours 45 minutes** (7:00 PM kickoff → 11:45 PM build end).
It is not enough to build the company. It is enough to wire one credible proof —
**if** the boilerplate is already built. Every task must improve the live demo path.
Cut anything that does not.

## Real event timing (from the Founders Inc email)

- **6:30 PM** — check-in.
- **7:00 PM** — kickoff, hacking begins. **Tag `nighthack-start` now.**
- **11:00 PM** — building doors lock (you can stay, not re-enter).
- **11:45 PM** — build window ends.
- **12:15 AM** — initial judging (at-table).
- **12:45 AM** — Top 10 live demos (**90 seconds each**).
- **1:15 AM** — winners. **1:30 AM** — ends.

Judging factors: progress during the window (most important), technical complexity,
creativity, UX/demo quality. Demos must be **live** and **not on localhost**.

## Before the clock starts (legal, disclosed prep)

The rules explicitly allow pre-existing code, libraries, infrastructure, and
templates as long as you **disclose** what pre-existed and **tag a starting commit**.
So do all non-judged plumbing before Friday and spend the window on the judged core.
See `DISCLOSURE.md` and `PREBUILD_MANIFEST.md`.

Pre-build (done — see `prebuilt/`): deployable Next.js skeleton, deterministic
patcher + tests, impact scanner, OpenAPI diff, Supabase schema, adapter interfaces,
the `atlas-store-demo` customer repo with CI, and the AtlasPay v1/v2 specs.

Also confirm before Friday: Vercel + Supabase + GitHub accounts, the demo repo pushed
with `demo-base`, a fine-grained GitHub PAT (backend-only, scoped to the one repo),
env values written down (names only, no secrets in docs), laptops charged, hotspot
tested, demo narration rehearsed.

## Build schedule (7:00 PM → 11:45 PM)

### 7:00–7:10 — Scope, tag, deploy the skeleton

- Read the single demo sentence aloud. Assign owners. Create issues for P0 only.
- `git tag nighthack-start` on a clean tree.
- Deploy the pre-built skeleton to Vercel; set env.

**Gate:** public URL loads `/` and `/room/demo` for every teammate; `/api/health` returns ok.

### 7:10–7:40 — Supabase live, room from the database

- Apply `supabase/migrations/0001_init.sql`.
- Seed one provider + provider_change + repository + one run.
- Replace `seedRoom` with `getRoom(runId)` reading Supabase.

**Gate:** a seeded run survives refresh on the public URL.

### 7:40–8:15 — Provider change ingestion

- Wire `ChangeDetector` (pre-built diff) into `POST /api/runs/start`.
- Persist the normalized `provider_change` and create a real run.
- Render the change summary and severity on the intake screen.

**Gate:** clicking “Create migration” creates a real run and shows removed/required fields.

### 8:15–9:00 — Impact scan via GitHub

- Implement `RepositoryClient.getFiles` with `@octokit/rest` + the PAT (server-only).
- Fetch the 4 target files, run the pre-built scanner, persist 3 impacts + evidence.

**Gate:** the room shows the correct three impacted files with snippets; false positives ignored.

### 9:00–9:50 — Patch, branch, commit, draft PR

- Run the pre-built patch engine on the fetched files.
- Create `bridge/atlaspay-v2-<id>`, commit only the 3 files, open a **draft** PR
  with the body template (summary, impacted files, validation placeholder, room link).

**Gate:** the real draft PR exists and the diff is exactly the three renames.

### 9:50–10:30 — Validation and checks

- Implement `ValidationClient.checkForSha`: **poll GitHub check-runs for the exact
  commit SHA** (no webhook). Store run URL, status, conclusion.
- Transition to `ready_for_review` only after verified success for that SHA.

**Gate:** the room shows a real GitHub check link and a verified passing conclusion.

### 10:30–11:00 — Multiplayer room (P1)

- Supabase Realtime presence; participant avatars/roles.
- Persisted comments + one approval; broadcast status to both sessions.

**Gate:** two browsers see each other and the approval/status without refreshing.
*(If behind, cut per the cut order — the core PR+CI story must stay intact.)*

### 11:00–11:15 — Demo polish

- Tighten hierarchy and empty/loading/error states.
- Make GitHub links obvious. Add a compact “why this changed” line.

**Gate:** a new viewer can explain the product in 30 seconds.

### 11:15–11:45 — Integration freeze + rehearsal

- Stop adding features. Pin the last known-good deployment.
- Run the full reset-and-demo flow **twice**. Capture a backup PR, backup CI evidence,
  and a short screen recording.
- Rehearse **both** the 90-second stage version and the at-table version.

**Gate:** two consecutive clean rehearsals; presenter can recover from any single
failed integration in under 15 seconds.

## Cut order

Cut in this order when behind:

1. AI-generated prose and explanations.
2. Provider-side admin console.
3. Authentication polish.
4. Generalized repository installation flow.
5. Multiple API changes.
6. Fancy animations.
7. Comments.
8. Approval UI.
9. Realtime presence (fall back to two refreshed windows).

Never cut:

- public deployment,
- correct impacted files,
- real draft PR,
- real passing CI evidence tied to the exact SHA,
- coherent migration-room state,
- demo reset capability.

## Decision rules

- If a task exceeds 25 minutes without a demo-visible result, simplify or replace it.
- Use deterministic code for the migration recipe; never put LLM output on the critical path.
- Keep external integrations behind the adapter interfaces so a fallback preserves the UI.
- Never fabricate a successful external action. A cached successful run is acceptable
  only when clearly presented as a completed prior run from the same deployed product.
