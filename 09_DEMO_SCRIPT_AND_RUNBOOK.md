# Demo Script and Runbook

## Before a judge arrives

Open only production URLs: `https://bridge-nighthack.vercel.app`, the fixture repository, the verified PR/check evidence chain from `SUBMISSION.md`, and two browser profiles for the final room. The product currently returns public HTTP 200. Do not show localhost, terminal output, secrets, or Vercel/Supabase dashboards.

Browser A is the customer. Browser B is a private/incognito provider session. Operator provisioning stays off-screen. The operator privately provisions participant capabilities for both sessions; new invite links use URL fragments and strip the fragment before bootstrap. No capability, token, password, PAT, or service key belongs in this document or on screen. Verify that each session has joined before the demo begins.

Use only this verified evidence chain:

- Room: `https://bridge-nighthack.vercel.app/room/f1386415-3de2-41ad-b499-36261d2eec91`
- Draft PR: `https://github.com/coderarush/atlas-store-demo/pull/1`
- Patch commit: `d0d1e5dc44c49bc95315e7302157b375837d74b2`
- Validated head: `52ee5c54ccfa3831807eba894fc08372530d1fe9` (same tree; pre-fix empty retry commit)
- Red base: `https://github.com/coderarush/atlas-store-demo/actions/runs/30142332724/job/89637894855`
- Green exact head: `https://github.com/coderarush/atlas-store-demo/actions/runs/30142535151/job/89638422640`

The preserved room was produced by deployed commit `3407bf9`. It scanned four explicit AtlasPay recipe paths and predates the recursive discovery added in later source. Do not say that this room exercised recursive repository discovery, durable jobs, workspace onboarding, or the GitHub App callback.

## 90-second live stage script

**0:00-0:13 - Problem and category.** Show the AtlasPay change intake.

> When an API provider ships a breaking change, teams need to find every affected call site, patch it, test it, and coordinate the handoff. In this controlled demo, AtlasPay is a fictional provider fixture. AtlasPay v2 removed `payment_method` and now requires `payment_method_id`.

**0:13-0:30 - Trace the impact.** Open the prepared run; show the three impacted files and the three excluded look-alikes.

> Bridge traces that contract change to the exact customer call sites that will fail. These are the three request objects in scope; look-alike strings are not changed.

**0:30-0:50 - Bounded execution.** Show the plan, then the draft PR evidence card or the PR itself.

> Bridge generates a bounded deterministic patch: this request key rename, in these files, and nothing else. It opens a real draft pull request. It never merges code automatically.

**0:50-1:08 - Red base -> green head proof.** Show the controlled `demo-base` TypeScript failure, the bounded PR diff, then the commit SHA in Bridge and the GitHub Actions/check page for that same head SHA.

> The base is red on exactly the three deprecated request keys. Bridge changes only those keys, and GitHub Actions is green for this exact PR head. That is the migration proof, not a convenient green build from another branch.

If a judge opens the Commits tab, state plainly: "The first commit contains the patch. A pre-fix repeat produced an empty same-tree child; tonight's no-op fix prevented a third commit on the final rerun. CI and Bridge both validate the exact current head."

**1:08-1:30 - Handoff evidence.** Bring Browser B into view, show the provider role and the already persisted comment/approval evidence, then return to Browser A. Do not mutate the preserved run; use a separately provisioned disposable run if a new live interaction is required.

> Provider and customer review the evidence, comment, and approve in one live migration room. Changelogs tell customers what changed. Coding agents can modify a repository when prompted. Bridge connects the two and carries the migration from contract change to verified handoff.

End on the evidence panel, not on an animation or a dashboard.

## 2-3 minute unlisted YouTube recording script

Record one uninterrupted production-browser walkthrough. Keep the browser address bar hidden after establishing the public URL; do not include notifications or any credential screen.

**0:00-0:20.** "Bridge handles one narrow, high-risk event: a provider API contract change that would otherwise become manual search, patching, CI, and coordination work. AtlasPay is our fictional controlled fixture; its v2 contract removes `payment_method` and requires `payment_method_id`."

**0:20-0:45.** On the change intake, show the before/after contract fields and open the prepared migration room. "Bridge normalizes the breaking change, then scopes it to the fixture repository."

**0:45-1:10.** Show the impact list and one snippet. "It found these three TypeScript request call sites. The fixture also contains look-alike strings, and Bridge excludes them."

**1:10-1:35.** Show the plan/diff and the draft PR. "The migration is deterministic and bounded to the proven request keys. The output is a real draft PR for human review, never an automatic merge."

**1:35-1:55.** Show the red `demo-base` validation, the PR diff, then the SHA in Bridge and GitHub Actions/check evidence. "Bridge turns a controlled three-error base into a bounded patch and waits for the check on the exact PR head before it represents the run as ready for review."

**1:55-2:20.** Show Browser B's provider view and the persisted provider comment/approval, then show the same evidence in Browser A. "The provider and customer keep the contract change, code evidence, review, and handoff in one room." Do not add new activity to the preserved run during recording.

**2:20-2:40.** Return to the room evidence panel. "Changelogs tell customers what changed. Coding agents can modify a repository when prompted. Bridge connects the two and carries the migration from contract change to verified handoff."

If any external evidence is unavailable, pause recording. Do not record a success claim that cannot be opened and checked.

## Live controls and recovery

- Presenter controls Browser A. A second person controls Browser B. A third person, if available, watches the exact-SHA CI result.
- Add only the verified PR, head SHA, and check URLs from `SUBMISSION.md`; no other run-specific evidence belongs in the final script.
- Keep the preserved run read-only. Use a separate disposable run for any newly submitted comment, approval, reset, or migration action.
- If Actions is queued, open a verified prior run and say: "This is the completed run from the same deployed workflow; the current workflow is still running." Do not wait silently.
- If a GitHub write fails, show the bounded preview and say that the live external write failed. Do not imply the PR was created.
- If realtime fails, show persisted comments after refresh and say live propagation could not be re-verified.
- If the product endpoint is unavailable, use the short recording only as a fallback and identify it as a recording.

## Reset procedure

1. Confirm Browser A and Browser B use separate active participant sessions and fragment-based private capability links.
2. Confirm the demo repository configuration and base branch with the operator; do not display its credential.
3. Do not reset or prepare the preserved run `f1386415-3de2-41ad-b499-36261d2eec91`. Future onboarding or release tests must use a separate disposable run. Retain the completed evidence tab as a recovery artifact.
4. Before presenting a green state, compare the Bridge SHA, PR SHA, and Actions/check SHA.
5. Run the 90-second script twice without changing product code between rehearsals.
