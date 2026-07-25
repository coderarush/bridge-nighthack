# Bridge - NightHack Submission

## Submission summary

**Bridge** turns a controlled contract break from AtlasPay, a fictional provider fixture, into bounded, reviewable migration work for one TypeScript customer repository. It is intentionally a narrow vertical slice, not a general-purpose coding agent or API platform.

> When an API provider ships a breaking change, Bridge uses a controlled migration recipe to scan a bounded TypeScript scope, identifies the guarded customer call sites that match the changed contract, generates a bounded deterministic patch, opens a real draft pull request, and verifies the exact commit in GitHub Actions. Provider and customer then review the evidence, comment, and approve in one live migration room. Changelogs tell customers what changed. Coding agents can modify a repository when prompted. Bridge connects the two and carries the migration from contract change to verified handoff.

## NightHack progress against the judging criteria

- **Progress:** Converted the pre-existing scanner/patcher scaffold into one persisted live workflow with real authorization, orchestration, a real draft PR, exact-head Actions verification, and a shared review room.
- **Technical execution:** Added fail-closed run-scoped capabilities and RLS, idempotent locks and external-write recovery, exact PR-head synchronization, recursive bounded TypeScript discovery, fenced durable-job primitives, and executable tenant migrations.
- **Working demo quality:** Deployed the responsive product, preserved a public red-base -> three-line diff -> green-exact-SHA evidence chain, verified two-role comments/approval, and documented honest recovery paths.
- **Originality and potential:** Built the beginnings of a team control plane around the proven migration event: live human workspace creation, auditable tenant boundaries, and a registered least-privilege GitHub App pre-install flow, while explicitly separating unfinished callback and worker operations from the verified demo.

## Links and availability

The completed end-to-end evidence chain, live authorization, and two-role room were generated and verified on July 24, 2026 with deployed source commit `3407bf9`. The current application release is `d67ce94`; it was deployed and passed read-only regression plus human workspace creation, RLS/audit, and GitHub pre-install probes without regenerating or resetting the preserved run.

| Surface | URL | Status |
| --- | --- | --- |
| Marketing site | https://usebridge.vercel.app | REACHABLE - HTTP 200 |
| Product | https://bridge-nighthack.vercel.app | VERIFIED on `d67ce94` - public HTTP 200; current team routes passed and preserved evidence remains readable |
| Project repository | https://github.com/coderarush/bridge-nighthack | VERIFIED - public source and final packet |
| Preserved evidence source | https://github.com/coderarush/bridge-nighthack/commit/3407bf9ab44db851da319b9220fe940ec2b106e7 | VERIFIED - source that produced the completed run |
| Current application release | https://github.com/coderarush/bridge-nighthack/commit/d67ce94629a8ad1b64bbf3468475e7f0cf0d476f | VERIFIED - pushed application and migration boundary |
| Current release deployment | https://bridge-nighthack.vercel.app | VERIFIED - health, public pages, protected-route denial, human workspace creation/pre-install, and responsive visual checks passed |
| AtlasStore fixture | https://github.com/coderarush/atlas-store-demo | VERIFIED - public fixture repository |
| Final migration room | https://bridge-nighthack.vercel.app/room/f1386415-3de2-41ad-b499-36261d2eec91 | VERIFIED - `ready_for_review`; requires a privately supplied participant capability |
| Final draft PR | https://github.com/coderarush/atlas-store-demo/pull/1 | VERIFIED - open draft; exactly 3 files and `+3/-3` |
| Actual three-file patch commit | `d0d1e5dc44c49bc95315e7302157b375837d74b2` | VERIFIED - contains the three key renames |
| Final validated PR head | `52ee5c54ccfa3831807eba894fc08372530d1fe9` | VERIFIED - same patched tree as `d0d1e5dc`; matches the room, PR head, and check |
| Red base GitHub Actions job | https://github.com/coderarush/atlas-store-demo/actions/runs/30142332724/job/89637894855 | VERIFIED - exact three deprecated-key TypeScript errors |
| Green exact-SHA GitHub Actions job | https://github.com/coderarush/atlas-store-demo/actions/runs/30142535151/job/89638422640 | VERIFIED - successful `build` for `52ee5c54...` |
| Unlisted YouTube recording | NOT READY | Add the real unlisted video URL only after recording verification |

## Judge test guide

Use the two privately supplied, role-labeled customer and provider capability links. A single role link is sufficient for read-only evidence inspection, but both are required to inspect the two-role room. Do not use localhost, a source checkout, a GitHub token, a Supabase service key, or a Vercel account.

1. Open the product URL and navigate to the AtlasPay v1 to v2 change intake. AtlasPay is a controlled fictional provider fixture, not an outside company.
2. Confirm the stated contract change: `payment_method` is removed and `payment_method_id` is required for `POST /payments`.
3. Open the final migration room through the private capability link supplied by the operator.
4. Verify that the preserved room contains the three guarded impacts in `src/checkout/create-payment.ts`, `src/subscriptions/renew.ts`, and `src/refunds/retry-charge.ts`, and that the three fixture look-alikes are excluded. This `3407bf9` run scanned four explicit recipe paths; it did not exercise the recursive discovery added later.
5. Review the proposed deterministic field-key rename and the evidence panel. Confirm the preserved output is a draft PR; do not merge it.
6. Establish the red base: `demo-base` must fail TypeScript validation on the three deprecated AtlasPay request keys. This is the controlled break, not a generic broken repository.
7. Open the PR from the room and confirm the diff is limited to those three request-object key changes.
8. Establish the green head: open the attached GitHub Actions/check URL and confirm its commit SHA equals both the PR head and the SHA displayed in Bridge. A green result for another commit is not evidence.
9. In a second browser session, show the provider view and the already persisted provider approval/comment evidence. Do not mutate or reset the preserved run. A new comment or approval may be demonstrated only on a separately provisioned disposable run.

### Session and credentials procedure

- The operator prepares two ordinary browser sessions: Browser A for the customer and Browser B (incognito or a second profile) for the provider. Operator provisioning remains off-screen.
- Each participant uses a separately issued participant capability supplied privately by the operator. New links carry the capability in the URL fragment, which is removed before bootstrap and is not sent in the initial HTTP request. Do not place invite values, tokens, passwords, PATs, Supabase keys, or service-role credentials in a recording, chat, committed source, or this packet.
- Before submission, the operator takes the distinct role-specific customer and provider URLs from the private local environment, verifies that both use the canonical `bridge-nighthack.vercel.app` host and a `#invite=` fragment, confirms they remain unexpired with claim capacity, and places both clearly labeled URLs in the submission platform's private testing-instructions field. If the platform has no private field, send both directly to the event organizer. Never put either URL in the public project description, repository, video, or group chat.
- A judge opens each supplied URL in a separate browser session. Bridge consumes the fragment, establishes a run-scoped participant session, and removes the capability from the visible URL. The ordinary room URL alone is intentionally insufficient.
- The credential used by the preserved demo remains server-side and restricted to the AtlasStore fixture repository. Judges should observe resulting links and evidence, not operate the credential.
- If a paired session is unavailable, demonstrate the persisted completed room and state that live collaboration could not be re-verified. Do not invent a presence or approval event, and do not mutate the preserved evidence to manufacture one.

## Evidence standard and recovery

The final proof is **red base -> bounded diff -> green head**. The controlled `demo-base` job identifies exactly the three deprecated AtlasPay keys. The draft PR changes only those keys. The successful GitHub Actions job belongs to the PR head SHA shown in Bridge. The detailed recovery sequence is in `13_RISK_REGISTER_AND_FALLBACKS.md`.

### Repeat-run history note

Before the no-op retry fix, a repeated run created `52ee5c54` as an empty child commit with the same tree as patch commit `d0d1e5dc`. The preserved `3407bf9` source compares tree SHAs and reuses the existing branch head instead of creating another commit. The final production rerun exercised that fix and left PR #1 at two commits. The cumulative PR diff remains exactly the three intended renames, and CI passed for the exact final head.

## Disclosure and scope

The baseline is the annotated `nighthack-start` tag (`24f10d7`), created at **7:40:03 PM PDT** on July 24, 2026; its annotation records the starting state at **7:39 PM PDT**. The preserved evidence source is `3407bf9`; the current application boundary is `d67ce94`. `DISCLOSURE.md` gives the exact, concise before-versus-during boundary.

The controlled fixture is AtlasPay's request-field rename. Bridge does not claim arbitrary-provider support, arbitrary-language support, autonomous merging, or completed production verification where the required external evidence is absent.

## Exact before-and-after wording

**Before NightHack:** "We had a narrow Bridge scaffold, the controlled AtlasPay and AtlasStore fixtures, and the deterministic TypeScript scanner/patcher. Those pieces could demonstrate the transformation locally, but they did not provide a secure, persisted, repeatable, externally verified migration workflow."

**Built during NightHack:** "We built and verified the controlled live workflow: authenticated operator/provider/customer roles, capability-gated and run-scoped access, persisted orchestration with locks and retry-safe external writes, a real draft GitHub pull request, exact-PR-head and exact-SHA Actions verification, a private realtime review room with comments and provider approval, honest failure states, and recovery controls. We also built bounded recursive TypeScript discovery, executable tenant/RLS migrations, fenced durable jobs, human workspace creation, and a secure GitHub App pre-install foundation. The workspace migrations and pre-install handshake are live; the preserved run predates those paths, and GitHub consent/callback completion plus worker runtime wiring are not claimed."

## Submission gate

The preserved live technical gate passed on `3407bf9`, and the current `d67ce94` release passed its non-mutating regression and onboarding probes. The remaining operator submission steps are to add the verified unlisted YouTube walkthrough URL and paste both role-labeled capability URLs into the platform's private testing-instructions field.
