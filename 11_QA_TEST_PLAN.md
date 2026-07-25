# QA Test Plan

> Current release evidence is recorded in `SUBMISSION.md` and
> `17_FINAL_SUBMISSION_CHECKLIST.md`. Never execute the reset/new-run rehearsal
> steps below against the preserved evidence run.

## Release philosophy

Test the demo path, not the theoretical platform. A polished dashboard with one broken external write is a failed demo.

## P0 test matrix

### Deployment

- Public URL loads on two unrelated devices.
- Refreshing the room preserves state.
- Production environment has all required variables.
- No console crash on a clean browser session.

### Change analysis

- v1/v2 sources load from production.
- Normalized diff contains the correct removed and required fields.
- Re-running analysis is idempotent.
- Invalid spec produces a clear error and retry.

### Impact scan

- Finds exactly three intended files.
- Does not modify false-positive strings.
- Stores line numbers and snippets.
- Handles missing repository file cleanly.

### Patch

- Changes only `payment_method` object keys in scoped call sites.
- Produces parseable TypeScript.
- Patch preview matches committed diff.
- Re-running does not duplicate or corrupt changes.

### GitHub

- The repository-scoped controlled-demo credential path works in production.
- GitHub App pre-install URL generation works; external consent/callback,
  repository registration, and installation-token execution remain a separate
  unchecked production gate.
- Branch name is unique.
- Commit exists on expected branch.
- Draft PR targets expected base branch.
- PR body includes room and evidence links.

### Validation

- Status is tied to the migration commit SHA.
- Passing check sets `ready_for_review`.
- Failed check sets `validation_failed` and shows logs link.
- Stale successful check from another SHA is rejected.

### Realtime

- Browser A sees browser B presence.
- Comment appears in both sessions.
- Approval appears in both sessions.
- Reconnect after temporary network loss restores state.

### Security

- GitHub credentials do not appear in browser source, network payloads, or logs.
- Validation only accepts a `success` conclusion for the run's exact commit SHA (never a different SHA).
- Owner/repo for write operations come from server env, not client input.
- User-supplied comments are escaped.

## Demo rehearsal tests

Run these in order:

1. Cold browser, read-only preserved flow, or a complete disposable run.
2. Second disposable run after reset; never reset the preserved evidence run.
3. CI slow-path recovery.
4. GitHub write failure fallback.
5. Realtime disconnect fallback.
6. Presenter-only rehearsal with no engineer intervention.

## Visual QA

- No clipped code snippets.
- Status colors have text labels.
- Timeline timestamps are readable.
- Buttons do not move as state changes.
- PR and CI links are obvious.
- At 110-125% browser zoom, the critical room fits without chaotic scrolling.

## Bug severity

### P0
Demo cannot complete, production unavailable, wrong code changed, fake/incorrect evidence, credentials exposed.

### P1
Major surface unusable, room state does not update, error not recoverable, participant cannot approve.

### P2
Visual inconsistency, minor copy issue, slow noncritical animation.

After integration freeze, fix only P0 and high-confidence P1 issues.

## Definition of done

- Two clean end-to-end rehearsals.
- One teammate who did not build the feature can operate the demo.
- Backup run and PR are accessible.
- All P0 tests pass.
- No known secret exposure.
