# Risk Register and Fallbacks

## Release rule

Do not call the demo ready because the product route loads. The final gate is one verified production **red base -> bounded diff -> green exact head** evidence chain with matching private room, public PR, SHA, and check evidence.

## Current submission risks

| Risk | Current condition | Trigger | Recovery | Truthful demo language |
| --- | --- | --- | --- | --- |
| Public deployment regresses after verification | The preserved flow was verified on `3407bf9`; application release `21fa19c` is live at the canonical product URL | Public health, protected-route, or room checks fail | Roll back to the verified `3407bf9` deployment and use the completed evidence chain | "The latest deployment regressed; this is the verified deployment and run." |
| Red-base proof becomes unclear | The verified base job has exactly three deprecated-key TypeScript errors | A different base run includes unrelated errors | Use the verified red-base job in `SUBMISSION.md`; do not substitute another run | "The controlled base fails on these three deprecated request keys." |
| Green check is for the wrong commit | The verified green job is tied to `52ee5c54...` | Check SHA differs from the PR head or Bridge SHA | Reject the result and return to the verified exact-SHA job | "This check is not for the final head, so it does not count." |
| Unlisted recording is missing | The video URL remains unfilled in `SUBMISSION.md` | Submission requires the recording | Record only after the public post-fix flow passes | "The recording is not ready and is not part of the verified submission yet." |
| GitHub Actions latency | A new workflow may be queued | Check is pending for the migration SHA | Open a verified completed run from the same deployed workflow | "The current workflow is running against this SHA; this is a completed run from the same deployed workflow." |
| GitHub write or permission failure | Server-side demo credential/config is missing or rejected | Branch, commit, or draft-PR creation fails | Show only the bounded local plan/preview and the completed prior evidence, clearly separated | "The live GitHub write failed; this preview was not turned into a PR in this run." |
| Session/invite setup failure | Two participant sessions are required for live collaboration | Browser B cannot join or role is missing | Use a private re-issued short-lived capability; otherwise show persisted prior activity after refresh | "Live collaboration could not be re-verified in this session." |
| Realtime interruption | Presence/broadcast is a transport enhancement | Browser B update does not appear in Browser A | Refresh both sessions and show persisted comment/approval; do not imply instant sync | "The persisted update is visible after refresh; realtime propagation is unavailable." |
| Demo auth/idempotency schema regresses | `0002` through `0005` are live and authorization/idempotency probes passed | Protected requests or repeated starts fail | Stop mutation, inspect migration state, and use the completed verified run | "The current database behavior regressed; this is the verified completed run." |
| Production foundation is mistaken for a complete tenant migration service | Migrations `0006` through `0010` and workspace/pre-install routes are live, but the demo run graph, GitHub callback, lifecycle webhook, and worker are not fully migrated | A judge asks whether arbitrary teams can execute migrations now | State the boundary and show `18_PRODUCTION_ARCHITECTURE_AND_JUDGE_QA.md` | "Team setup is live; arbitrary-team migration execution is not yet verified." |
| Anonymous demo auth is mistaken for team auth | Anonymous auth remains enabled because the preserved capability demo requires it; workspace and GitHub routes explicitly reject anonymous users | A team route accepts an anonymous session | Stop onboarding, roll back the release, and retain the preserved demo only | "The team boundary failed closed checks, so onboarding is disabled." |
| GitHub App pre-install proof is mistaken for callback completion | The public App, encrypted variables, migrations, routes, and state-bound install URL are live; external consent/callback remains unverified | GitHub consent, callback, or repository registration fails | Do not invite external teams; retain the repository-scoped demo evidence | "The pre-install path passed, but the external callback is not yet verified." |
| Installation lifecycle drift is not reconciled | The webhook verifier/factory is tested, but no deployed lifecycle route handles suspension, deletion, or repository-selection changes | GitHub installation state changes after onboarding | Suspend execution for that installation until state is revalidated | "Bridge has not reconciled this installation change, so it will not execute." |
| Durable jobs are mistaken for a deployed worker | Fenced job coordination and storage are implemented and tested, but the demo route and no deployed worker use them | A judge asks whether retries survive a process restart in production | Describe the source/test boundary; do not claim runtime durability | "The durable execution layer is implemented, but worker deployment and runtime wiring remain." |
| Wrong or overly broad patch | The demo must touch only the controlled keys | Diff includes a non-target file, value, string, comment, or unrelated name | Stop the run, inspect the diff, and create a new run only after correcting the guard | "This run is rejected because the diff exceeds the proven scope." |

## Recovery order

1. Preserve the last known-good production deployment and completed evidence tab.
2. Compare the three SHAs: Bridge room, draft PR, and Actions/check. Stop if they differ.
3. Retry only a clearly retryable stage; never repeat a GitHub write blindly after an unknown network result.
4. If one live integration fails, use the applicable prior completed artifact and explicitly label it prior evidence.
5. If the public product fails, use the unlisted recording only as a recorded fallback.
6. If a claim cannot be evidenced, remove it from the spoken demo and `SUBMISSION.md`.

## No-go conditions

Do not submit or present the flow as fully live when any of the following is true:

- The PR URL or check URL cannot be opened.
- The check is not for the room's recorded commit SHA.
- The PR is not a draft.
- The diff includes unproven edits.
- The current production deployment has not been exercised with its real session/configuration.
- The current application SHA or canonical deployment URL is absent from `SUBMISSION.md`.
- Full production onboarding is described as complete before GitHub callback E2E is verified.
- A required final link in `SUBMISSION.md` is still unfilled, including the unlisted video.
- The private testing instructions do not contain distinct, role-labeled customer and provider capability URLs with remaining validity.
