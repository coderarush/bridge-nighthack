# Team Roles and War Room

## Three-person team

### Person A - Orchestrator/GitHub owner

Owns:

- GitHub PAT auth (backend-only, scoped to demo repo).
- Repository adapter.
- Branch, commit, PR, validation polling.
- External integration debugging.

### Person B - Product/realtime owner

Owns:

- Next.js pages and migration room.
- Supabase schema and realtime.
- Timeline, evidence panel, comments, approval.
- Production deployment.

### Person C - Change/patch/demo owner

Owns:

- OpenAPI fixture and normalized diff.
- Impact scanner and patch engine.
- Demo repository and tests.
- Demo script, QA, fallback assets.

At integration freeze, Person C becomes presenter, Person B operates second browser, and Person A watches logs.

## Two-person team

### Person A - Backend/integrations

- GitHub PAT auth + repository adapter.
- change detector.
- scanner/patcher.
- PR and CI.

### Person B - Product/deployment

- data model.
- room UI.
- realtime.
- deployment.
- demo and QA.

Both integrate at the top of every hour. Do not wait until the last 90 minutes to combine branches.

## Branch strategy

- `main` must remain deployable.
- Short-lived branches by feature.
- Merge small vertical increments.
- No long-running rewrite branch.
- Tag or record the last known-good deployment at integration freeze.

## Communication protocol

Every 25-30 minutes, each person reports:

1. what is now demo-visible,
2. what is blocked,
3. what they will finish next,
4. whether scope must be cut.

No status speech longer than one minute.

## Shared board

Columns:

- `P0 Next`
- `Building`
- `Needs integration`
- `Demo verified`
- `Cut`

Each card must have one owner and one observable acceptance condition.

## Handoff contract

A feature is not handed off with “the code is done.” It is handed off with:

- route or function signature,
- expected payload,
- example data,
- error behavior,
- deployed or testable state,
- known limitations.

## War-room discipline

- Use one shared text channel for blockers.
- Put credentials only in the proper secret manager, never chat.
- One person controls production deploys after integration freeze.
- Do not refactor working code during the final hour.
- The presenter stops coding 30-45 minutes before judging and rehearses.
