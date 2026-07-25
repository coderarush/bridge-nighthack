# Bridge — Codebase Map

Read this first when you (or Claude Code / Codex) open the project. It explains the
whole app in one pass, then indexes every file.

## What this is

`bridge-app` is a **full-stack Next.js (App Router) + TypeScript** app. Frontend and
backend live together and deploy together (to Vercel). It talks to **Supabase**
(Postgres) for data and **GitHub** (via a backend token) for the real pull request +
CI. The sibling folder `../atlas-store-demo` is the fake customer repo that receives
the migration PR — a separate project, not part of this app.

**One-line product:** an external API ships a breaking change → Bridge detects it,
finds the exact customer code that breaks, generates a deterministic patch, opens a
real draft PR, proves it with a real CI check on the exact commit, and gives the
provider + customer a shared live room to review and approve.

## Run it

```bash
npm install          # deps (already installed)
npm run dev          # http://localhost:3000
npm run build        # production build (must pass before deploy)
npm test             # deterministic patcher unit tests (9)
npm run patch:preview # preview the patch against ../atlas-store-demo
```
Env is in `.env.local` (Supabase values pre-filled; add `GITHUB_TOKEN` + owner to run
live migrations). See `../../SETUP_STATUS.md`.

## The three layers

**1. Frontend (React) — `app/*/page.tsx` + `components/`.** What users see: landing,
the breaking-change page, and the migration room (impacted files, PR/CI evidence,
timeline, comments, approval).

**2. Backend (API routes) — `app/api/`.** Thin server endpoints the frontend calls.
They orchestrate the engine and write to Supabase. The GitHub token lives here only,
never in the browser.

**3. Engine (library) — `lib/`.** The real logic: deterministic patch, impact scan,
OpenAPI diff, GitHub adapter, DB layer, state machine. ~950 lines; this is the substance.

## End-to-end flow (what happens on a run)

1. User clicks **Create migration** → `POST /api/runs/start` → reads the two AtlasPay
   specs, computes the breaking change (`lib/openapi`), creates a run in Supabase.
2. Room opens (`/room/[runId]`) reading live data via `lib/db/queries.getRoom`.
3. User clicks **Run migration** → `POST /api/runs/[runId]/advance`:
   fetch the target files from GitHub (`lib/adapters/github`) → scan for impacts
   (`lib/scanner`) → save impacts → create plan → **deterministic patch**
   (`lib/patcher`) → create branch, commit, open **draft PR**.
4. The room polls `POST /api/runs/[runId]/validate` → checks GitHub check-runs for the
   **exact commit SHA** → when it's `success`, the run flips to **ready_for_review**.
5. Comments/approvals → `comments` / `approve` routes, persisted in Supabase.
6. Every step writes an append-only event → the activity timeline.

## Where the live-build seams are

Search the code for `LIVE-BUILD:`. The main one is `components/RoomSidebar.tsx` — it
uses a 5-second poll today; the flagship in-window task is replacing it with real
Supabase Realtime presence + broadcast. The deterministic engine and GitHub/validation
adapters are already built (disclosed in `../../DISCLOSURE.md`).

## File-by-file index

### Frontend
| File | Purpose |
|---|---|
| `app/layout.tsx` | Root HTML layout + metadata |
| `app/globals.css` | Dark theme, CSS variables, shared classes |
| `app/page.tsx` | Landing page / pitch + CTAs |
| `app/change/[changeId]/page.tsx` | Shows the AtlasPay breaking change; "Create migration" |
| `app/room/[runId]/page.tsx` | The migration room (reads live data via `getRoom`) |
| `components/Timeline.tsx` | Activity event feed |
| `components/ImpactedFiles.tsx` | The affected files + snippets + reason |
| `components/EvidencePanel.tsx` | Branch / commit / draft PR / CI status |
| `components/RoomSidebar.tsx` | Presence, comments, approval (LIVE-BUILD: realtime) |
| `components/CreateMigrationButton.tsx` | Client button → `POST /api/runs/start` |
| `components/RunDriver.tsx` | Client: triggers `advance`, polls `validate` |

### Backend (API routes)
| File | Purpose |
|---|---|
| `app/api/health/route.ts` | Health check (`{ok:true}`) |
| `app/api/runs/start/route.ts` | Create a run from the AtlasPay diff |
| `app/api/runs/[runId]/advance/route.ts` | Fetch → scan → plan → patch → branch → commit → draft PR |
| `app/api/runs/[runId]/validate/route.ts` | Poll GitHub check-runs for the exact SHA |
| `app/api/runs/[runId]/comments/route.ts` | Persist a comment |
| `app/api/runs/[runId]/approve/route.ts` | Persist an approval |

### Engine / library
| File | Purpose |
|---|---|
| `lib/patcher/atlaspay-rename.ts` | **Deterministic** key rename (no LLM); guarded by sibling `amount` |
| `lib/scanner/impact-scanner.ts` | Finds impacted files (reuses the patcher matcher) |
| `lib/openapi/atlaspay-diff.ts` | Computes the v1→v2 breaking change |
| `lib/openapi/atlaspay-specs.ts` | The two specs embedded (base64) for server use |
| `lib/recipe/atlaspay.ts` | AtlasPay-specific rules: target files, branch name, PR body |
| `lib/adapters/interfaces.ts` | The adapter contracts (the seams) |
| `lib/adapters/deterministic.ts` | Wires the pre-built scan/patch/diff to the interfaces |
| `lib/adapters/github.ts` | GitHub via octokit: files, branch, commit, draft PR, CI polling |
| `lib/db/supabase.ts` | Browser + server Supabase clients |
| `lib/db/queries.ts` | `getRoom` (with seed fallback), `addEvent`, `updateRun` |
| `lib/state-machine/transitions.ts` | Allowed run transitions + ready-for-review guard |
| `lib/types.ts` | Shared domain types |
| `lib/seed/room.ts` | Seed room aggregate (fallback when DB is empty) |
| `lib/demo.ts` | The seeded demo run id |

### Config / data / scripts
| File | Purpose |
|---|---|
| `package.json`, `tsconfig.json`, `next.config.mjs` | Project config |
| `.env.local` / `.env.example` | Environment (Supabase filled in; add GitHub) |
| `supabase/migrations/0001_init.sql` | Full database schema |
| `public/fixtures/atlaspay-v1/v2.openapi.yaml` | The provider specs (also linked in the UI) |
| `scripts/preview-patch.ts` | Dev tool: preview the patch locally |
| `IMPLEMENTATION_PLAN.md` | The in-window build order |

## The customer repo (`../atlas-store-demo`)
Separate TypeScript project. Has 3 files that use the old `payment_method` field, plus
`src/util/logging.ts` with look-alike strings that must **not** change (the
false-positive guard). Its CI runs typecheck + tests: **fails** before the patch,
**passes** after — that's the real green check the demo proves.
