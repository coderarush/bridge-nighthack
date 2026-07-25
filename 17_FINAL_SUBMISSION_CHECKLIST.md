# Final Submission Checklist

## Product

- [ ] Public production URL loads.
- [ ] Change intake shows AtlasPay v1 -> v2.
- [ ] New migration run can be created.
- [ ] Exactly three impacted files appear.
- [ ] Patch changes only intended object keys.
- [ ] Draft PR exists in the real repository.
- [ ] PR body links to the production room.
- [ ] CI/check result is real and tied to the migration SHA.
- [ ] Room reaches `Ready for review` only after success.
- [ ] Two sessions show live presence.
- [ ] Comment replicates.
- [ ] Approval replicates and persists.

## Deployment and security

- [ ] Latest known-good deployment pinned.
- [ ] Database migrations applied.
- [ ] Validation polling works against production (exact-SHA check-runs).
- [ ] No secrets in browser source or repository.
- [ ] GitHub PAT scoped to only the demo repo (backend-only).
- [ ] `nighthack-start` tag saved; DISCLOSURE.md ready to show.
- [ ] Logs are accessible and filtered by run ID.
- [ ] Reset flow works.

## Demo assets

- [ ] Fresh live run prepared.
- [ ] Completed backup run prepared.
- [ ] Completed backup PR and CI tab prepared.
- [ ] Short screen recording saved locally and in cloud.
- [ ] Screenshots of each key state saved.
- [ ] Browser A and B identities verified.
- [ ] Presenter script available offline.

## Demo environment

- [ ] Laptop charged.
- [ ] Charger and adapter packed.
- [ ] Hotspot tested.
- [ ] Notifications disabled.
- [ ] Browser zoom set.
- [ ] Unrelated tabs closed.
- [ ] GitHub session active.
- [ ] No password manager popups expected.
- [ ] System updates paused.

## Rehearsal

- [ ] End-to-end rehearsal #1 passed.
- [ ] End-to-end rehearsal #2 passed.
- [ ] CI slow-path recovery rehearsed.
- [ ] GitHub failure fallback rehearsed.
- [ ] 90-second stage version rehearsed and timed (Top 10).
- [ ] At-table version finishes under six minutes.
- [ ] Every teammate can state the one-sentence pitch.

## Final rule

After the last successful rehearsal, do not add a feature. Only fix a confirmed demo blocker.
