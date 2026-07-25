# Bridge NightHack Build Packet

This file preserves the original execution brief and priority order. Use
`SUBMISSION.md`, `DISCLOSURE.md`, and
`18_PRODUCTION_ARCHITECTURE_AND_JUDGE_QA.md` for the current evidence and
production boundary.

**Event:** Founders Inc NightHack  
**Build window:** Friday, July 24, 2026 — kickoff **7:00 p.m.**, build ends **11:45 p.m.** PDT (**4h45m**). Doors lock 11:00 p.m. At-table judging 12:15 a.m.; Top-10 live demos 12:45 a.m. (**90 seconds each**).  
**Constraint:** Production deployment and live product demo; no localhost and no slide deck.  
**Rules note:** Pre-built infrastructure/templates/datasets are allowed if disclosed; judges score only in-window work; tag `nighthack-start` at kickoff. See `DISCLOSURE.md`.

## The only goal

Ship one undeniable vertical slice:

> A third-party API introduces a breaking change. Bridge detects it, identifies the exact customer code that will break, creates a bounded migration patch, validates it in CI, opens a draft pull request, and gives the provider and customer a shared live migration room.

Do not build a general coding agent, an API documentation platform, an SDK generator, a broad observability product, or a generic collaboration tool. The product is the end-to-end migration event.

## What “demo-ready” means

A judge can watch the full story in four to six minutes without hearing architecture excuses:

1. A change for AtlasPay, a fictional controlled provider fixture, exists as two hosted OpenAPI files.
2. Bridge detects and summarizes the breaking change.
3. Bridge finds exactly three impacted files in a real GitHub repository.
4. Bridge creates a migration run with a visible timeline.
5. Bridge creates a branch, commits a deterministic patch, and opens a draft PR.
6. GitHub Actions returns a real passing check.
7. Two browser sessions appear in the same migration room with presence, comments, and an approval action.
8. The app is deployed on a public URL and remains usable after a refresh.

## Non-negotiable priorities

**P0:** deployed app, one real GitHub repo, one real PR, one real passing CI run, coherent demo story.  
**P1:** impacted-file evidence, migration timeline, multiplayer presence, approval.  
**P2 (original build priority):** polished animations, multiple providers, generalized AI patching, billing, and generalized onboarding.

## Packet map

- `01_PRODUCT_AND_DEMO_BRIEF.md` - product thesis and winning demo story.
- `02_NIGHTHACK_EXECUTION_PLAN.md` - 4h45m schedule, gates, and cut rules.
- `03_MVP_PRD.md` - exact NightHack product requirements and acceptance criteria.
- `04_TECHNICAL_ARCHITECTURE.md` - system design and critical implementation choices.
- `05_DATA_MODEL_AND_API_CONTRACTS.md` - database tables, states, events, and endpoints.
- `06_DEMO_FIXTURE_SPEC.md` - controlled provider change and sample customer repository.
- `07_UI_UX_AND_DESIGN_SYSTEM.md` - screens, component states, visual system, and responsive behavior.
- `08_LANDING_PAGE_COPY_AND_SPEC.md` - production landing-page copy and layout.
- `09_DEMO_SCRIPT_AND_RUNBOOK.md` - exact live demo sequence, narration, and resets.
- `10_PITCH_AND_JUDGE_QA.md` - spoken pitch, objections, and concise answers.
- `11_QA_TEST_PLAN.md` - critical-path tests, failure modes, and release gate.
- `12_DEPLOYMENT_SECURITY_AND_ENV.md` - deployment checklist, permissions, secrets, and observability.
- `13_RISK_REGISTER_AND_FALLBACKS.md` - failure triggers and fallback modes.
- `14_TEAM_ROLES_AND_WAR_ROOM.md` - two-person and three-person operating plans.
- `15_POST_HACKATHON_ROADMAP.md` - 72-hour, 30-day, and 90-day path.
- `16_CLAUDE_CODE_MASTER_PROMPT.md` - build-agent instructions for disciplined execution.
- `17_FINAL_SUBMISSION_CHECKLIST.md` - final hour and demo-table checklist.
- `18_PRODUCTION_ARCHITECTURE_AND_JUDGE_QA.md` - honest team deployment model, production boundaries, and technical judge answers.
- `SUBMISSION.md` - verified public links, judge test procedure, evidence chain, and exact before/after wording.
- `DISCLOSURE.md` - pre-existing work disclosure (per the rules).
- `PREBUILD_MANIFEST.md` - inventory of everything in `prebuilt/`.
- `SETUP_STATUS.md` - archival setup snapshot; not an operating runbook.
- `prebuilt/bridge-app/` - Next.js product, deterministic engine, and later production foundations.
- `prebuilt/atlas-store-demo/` - sample customer repo with CI + fixtures.

## Prebuild strategy (per the actual rules)

The Founders Inc email explicitly permits pre-existing code, libraries,
infrastructure, templates, and datasets, provided you **disclose** what pre-existed
and **tag a starting commit** at kickoff; judges evaluate only work done during the
window. So the winning move is to pre-build every non-judged piece of plumbing before
Friday and spend all 4h45m on the judged migration engine.

Pre-built and disclosed (see `prebuilt/` + `DISCLOSURE.md`): the deployable app
skeleton, deterministic patcher/scanner/diff, Supabase schema, adapter interfaces,
the demo customer repo with CI, and the AtlasPay specs. Verified in a clean sandbox.

At 7:00 p.m., tag `nighthack-start`, deploy the skeleton, then wire the live
integrations (Supabase go-live, GitHub fetch, patch → draft PR, exact-SHA CI,
realtime room). Never claim pre-built work as in-window work, and never fabricate an
external success.
