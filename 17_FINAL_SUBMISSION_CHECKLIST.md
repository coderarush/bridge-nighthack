# Final Submission Checklist

## Evidence gate

- [x] `SUBMISSION.md` has the marketing, product, source, and fixture URLs.
- [ ] `SUBMISSION.md` has the unlisted-video value.
- [x] Public product, PR, base job, and head job links open; the room requires a private capability by design.
- [x] The submitted room, PR, and Actions/check display the same commit SHA.
- [x] The controlled `demo-base` is red on exactly the three deprecated AtlasPay request keys, with no unrelated failure.
- [x] The final PR is a draft and changes only those three keys.
- [x] The final `build` job is green for the exact PR head SHA shown in Bridge.
- [x] The current application SHA, canonical deployment, and every required public verification URL except the video are filled with real values.
- [x] The local judge handoff has two distinct canonical fragment URLs, one customer and one provider, with future expiry and remaining claim capacity.
- [ ] Both role-labeled capability URLs are pasted into the submission platform's private testing-instructions field, never a public field.

## Production verification

- [x] Marketing URL returns and renders.
- [x] Product URL is public and returned HTTP 200 during packet refresh.
- [x] The preserved live deployment/run uses `3407bf9`, including exact-PR-head wait, run scoping, no-op commit reuse, and fragment-safe invites.
- [x] A production rerun prepared the configured controlled room.
- [x] The room shows exactly the expected three impacts and excludes three fixture look-alikes.
- [x] The plan/diff is bounded to the controlled field-key rename.
- [x] Browser A and Browser B joined through separate private participant sessions without displaying any credential.
- [x] A customer comment and provider approval persisted; both sessions observed realtime comment, event, and approval changes.
- [x] The preserved demo protected routes have migrations `0002` through `0005` applied and passed live membership probes.
- [x] Error states are visible; no fake success fallback is used.
- [x] Application release `21fa19c` is pushed, and the canonical deployment serves that application tree.
- [x] Final `npm test`, typecheck, production build, dependency audit, migration execution, and diff checks pass after all agent work is reconciled.
- [x] The final release received health, room-shell, unauthenticated-denial, live stored-SHA/PR-head, and desktop/mobile visual checks without resetting the preserved run.
- [x] Judge and recording instructions keep the preserved run read-only; any new mutation requires a separately provisioned disposable run.
- [x] Migrations `0006` through `0010` are applied; a live human workspace/RLS/audit probe and unauthenticated denial passed.
- [x] `/team`, workspace creation/read, anonymous rejection, and the GitHub pre-install URL passed in production.
- [ ] GitHub external consent/callback, repository registration, and installation-token repository access pass production E2E.
- [ ] Before any runtime-durability claim, a deployed worker uses the fenced durable-job coordinator and operational retry/lease evidence is available.

## Disclosure integrity

- [x] `nighthack-start` is present and inspectable at `24f10d7`.
- [x] Disclosure states the tag time as 7:40:03 PM PDT and its 7:39 PM annotation; it does not claim a 7:00 PM tag.
- [x] Pre-existing fixture, deterministic engine, scaffold, and infrastructure are disclosed as pre-baseline work.
- [x] `3407bf9` is identified as the preserved run's source provenance.
- [x] `21fa19c` is recorded as the application boundary, and disclosure statistics/commit lists match that exact tag-to-application diff.
- [x] Regex tests are described as migration-shape coverage; final execution evidence is identified precisely as the complete PGlite chain plus the production migration apply and live owner probe.
- [ ] The spoken demo makes no claim of arbitrary-provider support, arbitrary-language support, autonomous merging, or unverified external success.

## Recording and rehearsal

- [ ] Record the 2-3 minute unlisted YouTube walkthrough from production using `09_DEMO_SCRIPT_AND_RUNBOOK.md`.
- [ ] Verify the video has no secret, capability, token, password-manager, terminal, or private dashboard exposure.
- [ ] Rehearse the 90-second script twice, including the exact-SHA evidence transition.
- [ ] If demonstrating a new realtime write, provision and verify a disposable run first; never use the preserved evidence run.
- [ ] Rehearse the Actions-latency, GitHub-write-failure, and realtime-failure statements.
- [ ] Keep one completed evidence tab and the recording accessible as recovery artifacts.

## Submit only when true

- [ ] The package is accurate as of submission time.
- [ ] No required live evidence is missing.
- [ ] No secret or private session value is committed or recorded.
- [x] The preserved `3407bf9` demo path was exercised once end to end.
- [x] The current release passed its stated non-mutating exact-head, route, build, and visual checks; onboarding paths are unchanged from the preceding live probe.
