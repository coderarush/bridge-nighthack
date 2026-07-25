# Pre-existing Work Disclosure — Bridge (NightHack)

Founders Inc rules: *"Existing code, libraries, APIs, models, datasets,
infrastructure, templates, and prebuilt hardware are allowed. You must disclose
what existed before the event. Judges will evaluate only the work completed during
Night Hack. Save a starting commit or tag at kickoff."*

This document is that disclosure. We follow it honestly. **This is a substantial
pre-built base — be upfront about it and lead the demo on the in-window work below.**

## Starting tag

At 7:00 PM kickoff we tag `nighthack-start` on a clean tree. Everything before that
tag is pre-existing and listed below.

## What existed before the event (NOT judged)

Everything under `prebuilt/`, built and verified before kickoff:

**Deterministic engine + integrations (the plumbing):**
- Deterministic patcher, impact scanner, controlled OpenAPI diff (`lib/patcher`, `lib/scanner`, `lib/openapi`) — 9 passing unit tests.
- GitHub `RepositoryClient` + `ValidationClient` (`lib/adapters/github.ts`) — fetch files, create branch/commit, open draft PR, poll check-runs. Uses a backend PAT.
- API routes wiring the flow: `start`, `advance` (scan→plan→patch→branch→commit→draft PR), `validate` (exact-SHA polling), `comments`, `approve`.
- Supabase data layer + schema (`lib/db`, `supabase/migrations`).
- Deployable Next.js app: landing, change intake, migration room.

**Infrastructure provisioned before the event:**
- Supabase project `bridge-nighthack` (schema applied, one demo run seeded).
- The `atlas-store-demo` customer repo + CI + AtlasPay v1/v2 specs.
- Third-party libraries: Next.js, React, @supabase/supabase-js, @octokit/rest, yaml, typescript, tsx.

## What we build DURING the window (judged)

The pre-built engine means the window is spent making the product genuinely better
and proving it live — real work, clearly attributable to Night Hack:

1. **Live multiplayer room** — replace the 5-second poll (marked `LIVE-BUILD:` in
   `RoomSidebar.tsx`) with real **Supabase Realtime** presence + broadcast so two
   browsers update instantly. This is the flagship in-window build.
2. **A real, live migration run** against the real GitHub repo — producing a real
   draft PR and a real green CI check during the demo (not the seeded one).
3. **UX/demo polish** — timeline animation, states, the "why this changed" panel.
4. **Optional AI explanation** (Claude) — a human-readable migration summary, kept
   off the critical path.
5. Deploy with real credentials and harden.

## Honesty commitments

- We say plainly that the migration engine was pre-built infrastructure; we do not
  claim it as in-window work.
- We never fabricate an external success. CI evidence is a real GitHub Actions run
  tied to the exact commit SHA.
- Draft PRs only; Bridge never merges.
- If asked, we show the `nighthack-start` tag and the diff of in-window work.
