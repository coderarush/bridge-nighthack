# Bridge NightHack MVP PRD

## Goal

Demonstrate that Bridge can transform one external API breaking change into a safe, verified, collaborative migration for one GitHub repository.

## Primary user story

As an engineer maintaining an AtlasPay integration, I want Bridge to identify code affected by the AtlasPay v2 contract change, propose and apply a bounded migration, validate it, and open a draft PR so I can review the change before production breaks.

## Required product surfaces

### 1. Change intake

- Display provider name, version change, source URLs, severity, and detected breaking operations.
- Button: `Analyze change`.
- Prevent duplicate runs for the same repo and change unless the user explicitly retries.

### 2. Migration room

- Run title and status.
- Provider change summary.
- Impacted files with snippets and reason.
- Migration plan.
- Activity timeline.
- Participants/presence.
- Comment composer.
- Approval action.
- PR and CI evidence panel.

### 3. GitHub output

- Migration branch.
- Commit with deterministic patch.
- Draft PR.
- PR body includes change summary, impacted files, validation result, and Bridge room URL.

## Functional requirements

### FR-1 Change normalization

Given the two AtlasPay OpenAPI specs, Bridge records:

- removed field: `payment_method`,
- added required field: `payment_method_id`,
- affected operation: `POST /payments`,
- risk: breaking,
- recommended migration: rename the request property.

### FR-2 Impact discovery

Bridge searches selected TypeScript files and returns every syntactic object key named `payment_method` within the target integration scope. Each match stores file path, line number, snippet, and confidence.

### FR-3 Patch generation

Bridge changes only the targeted object keys to `payment_method_id`. It must not replace string values, comments, documentation text, unrelated variable names, or files outside the selected scope.

### FR-4 GitHub branch and PR

Bridge creates a branch named like `bridge/atlaspay-v2-<short-id>`, commits the patch, and opens a draft PR against the repository’s default branch.

### FR-5 Validation

Bridge observes a real GitHub Actions/check result for the migration commit. The migration cannot reach `ready_for_review` until the latest commit has a verified successful conclusion.

### FR-6 Collaboration

At least two browser clients can join the same room, see presence, post comments, and observe status updates without refreshing.

### FR-7 Approval

An authenticated or demo-role participant can approve the migration plan. Approval is recorded with participant, timestamp, and current plan version.

### FR-8 Auditability

Every state transition creates an append-only activity event with actor, type, timestamp, and evidence link when relevant.

## State machine

`queued -> analyzing_change -> scanning_repo -> planning -> patching -> validating -> ready_for_review`

Failure states:

`analysis_failed`, `scan_failed`, `patch_failed`, `validation_failed`, `cancelled`

Retry returns to the last safe stage and increments `attempt`.

## Non-functional requirements

- Public HTTPS deployment.
- Refresh-safe data.
- No secret in browser bundles.
- Backend-only GitHub credentials.
- P95 room load under three seconds for the demo dataset.
- Clear loading, empty, success, and error states.
- Idempotent branch/PR creation for a run.
- Logs include run ID but never tokens or source-file contents beyond controlled snippets.

## Acceptance criteria

The MVP is accepted only when:

- A run starts from the deployed UI.
- It finds exactly the expected impacted files.
- The PR diff contains only intended changes.
- The PR is a draft.
- The app links to a real passing GitHub run/check.
- Two sessions show live presence.
- A comment and approval replicate live.
- A full rehearsal succeeds twice from reset.

## Explicit non-goals

- Supporting arbitrary providers or languages.
- Automatically merging.
- Installing across arbitrary customer organizations during the demo.
- Full semantic call-graph analysis.
- Self-hosted runners.
- Billing.
- Enterprise SSO.
- Provider broadcast campaigns.
- Autonomous remediation without human review.
